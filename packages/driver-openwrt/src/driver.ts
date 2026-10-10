import {
  DriverError,
  type AccessControl,
  type AccessMode,
  type Capability,
  type ClientDevice,
  type DeviceInfo,
  type PortForwardRule,
  type RouterCredentials,
  type RouterDriver,
  type WanStatus,
  type WifiBand,
  type WifiNetwork,
  type WifiUpdate,
} from "@ryfsystems/core";
import { UbusClient } from "./ubus.js";

// Driver OpenWrt vía ubus/UCI. Protocolo documentado; los mapeos de campos marcados con
// NOTA(hw) están pendientes de validar contra un OpenWrt real (varían algo por versión/paquetes).
export class OpenWrtDriver implements RouterDriver {
  readonly id = "openwrt";
  private readonly u: UbusClient;
  // cache de secciones wireless por banda para setWifi
  private wifiSections = new Map<WifiBand, string>(); // sección wifi-iface (ssid/key)
  private wifiDevices = new Map<WifiBand, string>(); // sección wifi-device (canal)

  constructor(creds: RouterCredentials) {
    this.u = new UbusClient(creds);
  }

  capabilities(): Capability[] {
    return [
      "wan",
      "wifi.read",
      "wifi.write",
      "clients",
      "reboot",
      "factoryReset",
      "portForward.read",
      "portForward.write",
      "accessControl",
    ];
  }

  login() {
    return this.u.login();
  }
  logout() {
    return this.u.logout();
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    const [board, info] = await Promise.all([
      this.u.call<any>("system", "board"),
      this.u.call<any>("system", "info").catch(() => ({})),
    ]);
    const rel = board.release ?? {};
    const mem = info.memory ?? {};
    return {
      model: board.model ?? board.board_name ?? "OpenWrt",
      firmware: [rel.distribution, rel.version].filter(Boolean).join(" ") || board.kernel,
      uptimeSeconds: num(info.uptime),
      memory: mem.total ? { used: num(mem.total)! - (num(mem.free) ?? 0), total: num(mem.total)! } : undefined,
    };
  }

  async getWan(): Promise<WanStatus> {
    const st = await this.wanStatus();
    const dev = st?.l3_device as string | undefined;
    const ipv4 = (st?.["ipv4-address"] ?? [])[0];
    const route: any[] = st?.route ?? [];
    const gw = route.find((r) => r.target === "0.0.0.0" || r.mask === 0)?.nexthop;
    let rx: number | undefined, tx: number | undefined;
    if (dev) {
      const d = await this.u.call<any>("network.device", "status", { name: dev }).catch(() => undefined);
      rx = num(d?.statistics?.rx_bytes);
      tx = num(d?.statistics?.tx_bytes);
    }
    return {
      connected: Boolean(st?.up),
      type: (st?.proto ?? "").includes("ppp") ? "ethernet" : "ethernet",
      proto: st?.proto,
      ip: ipv4?.address,
      gateway: gw,
      dns: st?.["dns-server"],
      rxBytes: rx,
      txBytes: tx,
    };
  }

  private async wanStatus(): Promise<any | undefined> {
    for (const iface of ["wan", "wwan", "wan6"]) {
      const st = await this.u.call<any>("network.interface." + iface, "status").catch(() => undefined);
      if (st?.up) return { ...st, proto: st.proto };
    }
    // fallback: interfaz con ruta por defecto
    const dump = await this.u.call<any>("network.interface", "dump").catch(() => ({ interface: [] }));
    const list: any[] = dump.interface ?? [];
    return list.find((i) => (i.route ?? []).some((r: any) => r.target === "0.0.0.0")) ?? list.find((i) => i.up);
  }

  async getWifi(): Promise<WifiNetwork[]> {
    const cfg = await this.u.call<any>("uci", "get", { config: "wireless" });
    const values: Record<string, any> = cfg.values ?? cfg ?? {};
    const devices: Record<string, any> = {};
    for (const [name, s] of Object.entries(values)) if (s[".type"] === "wifi-device") devices[name] = s;

    const nets: WifiNetwork[] = [];
    this.wifiSections.clear();
    this.wifiDevices.clear();
    for (const [name, s] of Object.entries(values)) {
      if (s[".type"] !== "wifi-iface") continue;
      if (s.mode && s.mode !== "ap") continue;
      const dev = devices[s.device] ?? {};
      const band = bandOf(dev);
      this.wifiSections.set(band, name);
      this.wifiDevices.set(band, s.device);
      nets.push({
        band,
        enabled: s.disabled !== "1" && s.disabled !== 1,
        ssid: s.ssid ?? "",
        hidden: s.hidden === "1" || s.hidden === 1,
        channel: dev.channel === "auto" || dev.channel == null ? "auto" : num(dev.channel),
        channels: band === "5g" ? CHANNELS_5G : CHANNELS_2G,
        security: s.encryption,
      });
    }
    return nets;
  }

  async setWifi(update: WifiUpdate): Promise<void> {
    if (this.wifiSections.size === 0) await this.getWifi();
    const section = this.wifiSections.get(update.band);
    if (!section) throw new DriverError(`No hay interfaz WiFi para la banda ${update.band}`, "PROTOCOL");
    const values: Record<string, unknown> = {};
    if (update.ssid !== undefined) values.ssid = update.ssid;
    if (update.password !== undefined) values.key = update.password;
    if (update.hidden !== undefined) values.hidden = update.hidden ? "1" : "0";
    if (update.enabled !== undefined) values.disabled = update.enabled ? "0" : "1";
    if (Object.keys(values).length) {
      await this.u.call("uci", "set", { config: "wireless", section, values });
    }
    // El canal va en la sección wifi-device, no en la wifi-iface.
    if (update.channel !== undefined) {
      const dev = this.wifiDevices.get(update.band);
      if (dev) {
        await this.u.call("uci", "set", {
          config: "wireless",
          section: dev,
          values: { channel: update.channel === "auto" ? "auto" : String(update.channel) },
        });
      }
    }
    await this.u.call("uci", "commit", { config: "wireless" });
    // Aplicar: recargar wireless (según versión, uno u otro).
    await this.u.call("network.wireless", "reload", {}).catch(() => this.u.call("network", "reload", {}).catch(() => {}));
  }

  async listClients(): Promise<ClientDevice[]> {
    const byMac = new Map<string, ClientDevice>();
    const put = (mac: string, patch: Partial<ClientDevice>) => {
      const k = mac.toLowerCase();
      byMac.set(k, { mac: k, online: false, type: "unknown", ...byMac.get(k), ...patch });
    };

    // Pistas de host (LuCI): mac -> {name, ipv4}
    const hints = await this.u.call<any>("luci-rpc", "getHostHints").catch(() => undefined);
    if (hints) for (const [mac, h] of Object.entries<any>(hints)) put(mac, { hostname: h.name, ip: h.ipv4 });

    // DHCP leases (fallback si no hay luci-rpc): /tmp/dhcp.leases
    if (!hints) {
      const f = await this.u.call<any>("file", "read", { path: "/tmp/dhcp.leases" }).catch(() => undefined);
      if (f?.data) {
        for (const line of String(f.data).trim().split("\n")) {
          const [, mac, ip, host] = line.split(/\s+/);
          if (mac) put(mac, { ip, hostname: host && host !== "*" ? host : undefined });
        }
      }
    }

    // Asociaciones WiFi (online + banda) por cada radio.
    for (const [band, section] of this.wifiSections.size ? this.wifiSections : (await this.wifiWithIfnames())) {
      const ifname = await this.ifnameFor(section);
      if (!ifname) continue;
      const assoc = await this.u.call<any>("iwinfo", "assoclist", { device: ifname }).catch(() => undefined);
      for (const s of assoc?.results ?? []) put(s.mac, { online: true, connection: "wifi", band });
    }

    return [...byMac.values()];
  }

  async reboot(): Promise<void> {
    // Varía por versión/paquetes: intentos en orden.
    try { await this.u.call("system", "reboot", {}); return; } catch { /* siguiente */ }
    try { await this.u.call("rpc-sys", "reboot", {}); return; } catch { /* siguiente */ }
    await this.u.call("file", "exec", { command: "reboot" });
  }

  async factoryReset(): Promise<void> {
    // NOTA(hw): jffs2reset -y -r restaura y reinicia. Alternativa luci: rpc-sys factory.
    try { await this.u.call("rpc-sys", "factory", {}); return; } catch { /* siguiente */ }
    await this.u.call("file", "exec", { command: "jffs2reset", params: ["-y", "-r"] });
  }

  async changeAdminPassword(): Promise<void> {
    // El cambio de contraseña root en OpenWrt varía por versión (shadow/passwd); no hay
    // una llamada ubus estable. Pendiente de validar con hardware.
    throw new DriverError("Cambio de contraseña no implementado para OpenWrt todavía.", "UNSUPPORTED");
  }

  async getDmz(): Promise<import("@ryfsystems/core").Dmz> {
    // OpenWrt no tiene opción DMZ nativa; se haría con una regla de firewall dedicada. Pendiente.
    throw new DriverError("DMZ no implementado para OpenWrt todavía.", "UNSUPPORTED");
  }
  async setDmz(): Promise<void> {
    throw new DriverError("DMZ no implementado para OpenWrt todavía.", "UNSUPPORTED");
  }

  async getNetwork(): Promise<import("@ryfsystems/core").NetworkConfig> {
    // Se haría con uci get network (lan/wan) + uci get dhcp. Pendiente de validar con hardware.
    throw new DriverError("Config de red no implementada para OpenWrt todavía.", "UNSUPPORTED");
  }
  async setLan(): Promise<void> {
    throw new DriverError("Config de red no implementada para OpenWrt todavía.", "UNSUPPORTED");
  }
  async setEthernet(): Promise<void> {
    throw new DriverError("Config de red no implementada para OpenWrt todavía.", "UNSUPPORTED");
  }

  async getGuestWifi(): Promise<import("@ryfsystems/core").GuestWifi[]> {
    throw new DriverError("Red de invitados no implementada para OpenWrt todavía.", "UNSUPPORTED");
  }
  async setGuestWifi(): Promise<void> {
    throw new DriverError("Red de invitados no implementada para OpenWrt todavía.", "UNSUPPORTED");
  }

  async getQos(): Promise<import("@ryfsystems/core").Qos> {
    throw new DriverError("QoS no implementado para OpenWrt todavía.", "UNSUPPORTED");
  }
  async setQosEnabled(): Promise<void> {
    throw new DriverError("QoS no implementado para OpenWrt todavía.", "UNSUPPORTED");
  }
  async setQosRule(): Promise<void> {
    throw new DriverError("QoS no implementado para OpenWrt todavía.", "UNSUPPORTED");
  }
  async deleteQosRule(): Promise<void> {
    throw new DriverError("QoS no implementado para OpenWrt todavía.", "UNSUPPORTED");
  }

  async getPortForwarding(): Promise<PortForwardRule[]> {
    const cfg = await this.u.call<any>("uci", "get", { config: "firewall" });
    const values: Record<string, any> = cfg.values ?? cfg ?? {};
    const out: PortForwardRule[] = [];
    for (const [name, s] of Object.entries(values)) {
      if (s[".type"] !== "redirect") continue;
      if (s.target && s.target !== "DNAT") continue;
      out.push({
        id: name,
        name: s.name,
        enabled: s.enabled !== "0" && s.enabled !== 0,
        protocol: normProto(s.proto),
        externalPort: parsePorts(s.src_dport),
        internalIp: s.dest_ip ?? "",
        internalPort: parsePorts(s.dest_port ?? s.src_dport),
      });
    }
    return out;
  }

  async addPortForward(rule: PortForwardRule): Promise<void> {
    await this.u.call("uci", "add", {
      config: "firewall",
      type: "redirect",
      values: {
        name: rule.name ?? "fwd",
        target: "DNAT",
        src: "wan",
        dest: "lan",
        proto: protoToUci(rule.protocol),
        src_dport: String(portLow(rule.externalPort)),
        dest_ip: rule.internalIp,
        dest_port: String(portLow(rule.internalPort)),
        enabled: rule.enabled ? "1" : "0",
      },
    });
    await this.u.call("uci", "commit", { config: "firewall" });
    await this.reloadFirewall();
  }

  async deletePortForward(id: string): Promise<void> {
    await this.u.call("uci", "delete", { config: "firewall", section: id });
    await this.u.call("uci", "commit", { config: "firewall" });
    await this.reloadFirewall();
  }

  // Control de acceso: OpenWrt usa macfilter + maclist por wifi-iface (una sola lista + política).
  // NOTA(hw): se aplica a todas las ap wifi-iface; pendiente de validar en equipo real.
  private async apIfaceSections(): Promise<string[]> {
    const cfg = await this.u.call<any>("uci", "get", { config: "wireless" });
    const values: Record<string, any> = cfg.values ?? cfg ?? {};
    return Object.entries(values)
      .filter(([, s]) => s[".type"] === "wifi-iface" && (!s.mode || s.mode === "ap"))
      .map(([name]) => name);
  }

  async getAccessControl(): Promise<AccessControl> {
    const cfg = await this.u.call<any>("uci", "get", { config: "wireless" });
    const values: Record<string, any> = cfg.values ?? cfg ?? {};
    let macfilter = "disable";
    const macs = new Set<string>();
    for (const [, s] of Object.entries(values)) {
      if (s[".type"] !== "wifi-iface" || (s.mode && s.mode !== "ap")) continue;
      if (s.macfilter && s.macfilter !== "disable") macfilter = s.macfilter;
      for (const m of toArray(s.maclist)) macs.add(m.toLowerCase());
    }
    const mode: AccessMode = macfilter === "allow" ? "white" : "black";
    const entries = [...macs].map((mac) => ({ mac }));
    // OpenWrt mantiene una sola lista + política; la exponemos bajo el modo activo.
    return { enabled: macfilter !== "disable", mode, black: mode === "black" ? entries : [], white: mode === "white" ? entries : [] };
  }

  async setAccessMode(enabled: boolean, mode: AccessMode): Promise<void> {
    const macfilter = !enabled ? "disable" : mode === "white" ? "allow" : "deny";
    for (const section of await this.apIfaceSections()) {
      await this.u.call("uci", "set", { config: "wireless", section, values: { macfilter } });
    }
    await this.applyWireless();
  }

  async addAccessEntry(_list: AccessMode, mac: string): Promise<void> {
    await this.editMaclist((set) => set.add(mac.toLowerCase()));
  }

  async removeAccessEntry(_list: AccessMode, mac: string): Promise<void> {
    await this.editMaclist((set) => set.delete(mac.toLowerCase()));
  }

  private async editMaclist(mutate: (s: Set<string>) => void): Promise<void> {
    const cfg = await this.u.call<any>("uci", "get", { config: "wireless" });
    const values: Record<string, any> = cfg.values ?? cfg ?? {};
    for (const [section, s] of Object.entries(values)) {
      if (s[".type"] !== "wifi-iface" || (s.mode && s.mode !== "ap")) continue;
      const set = new Set<string>(toArray(s.maclist).map((m) => m.toLowerCase()));
      mutate(set);
      await this.u.call("uci", "set", { config: "wireless", section, values: { maclist: [...set] } });
    }
    await this.applyWireless();
  }

  private async applyWireless(): Promise<void> {
    await this.u.call("uci", "commit", { config: "wireless" });
    await this.u.call("network.wireless", "reload", {}).catch(() => this.u.call("network", "reload", {}).catch(() => {}));
  }

  private async reloadFirewall(): Promise<void> {
    await this.u.call("file", "exec", { command: "fw4", params: ["reload"] }).catch(() =>
      this.u.call("file", "exec", { command: "/etc/init.d/firewall", params: ["reload"] }).catch(() => {}),
    );
  }

  // Secciones wireless con sus ifnames (para iwinfo) cuando no se ha llamado a getWifi.
  private async wifiWithIfnames(): Promise<Map<WifiBand, string>> {
    await this.getWifi();
    return this.wifiSections;
  }

  private async ifnameFor(section: string): Promise<string | undefined> {
    // ubus network.wireless status da los ifnames reales por interfaz.
    const st = await this.u.call<any>("network.wireless", "status").catch(() => undefined);
    if (!st) return undefined;
    for (const radio of Object.values<any>(st)) {
      for (const iface of radio.interfaces ?? []) {
        if (iface.section === section) return iface.ifname;
      }
    }
    return undefined;
  }
}

const CHANNELS_2G = Array.from({ length: 13 }, (_, i) => i + 1);
const CHANNELS_5G = [36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 149, 153, 157, 161, 165];

function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v) return v.split(/\s+/);
  return [];
}

function bandOf(dev: any): WifiBand {
  const b = (dev.band ?? "").toString();
  if (b === "5g" || b === "6g") return "5g";
  if (b === "2g") return "2.4g";
  const hw = (dev.hwmode ?? "").toString();
  if (hw.includes("a")) return "5g";
  const ch = Number(dev.channel);
  return Number.isFinite(ch) && ch > 14 ? "5g" : "2.4g";
}

function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function normProto(v: unknown): PortForwardRule["protocol"] {
  const s = (Array.isArray(v) ? v.join(" ") : (v ?? "")).toString().toLowerCase();
  if (s.includes("tcp") && s.includes("udp")) return "both";
  if (s.includes("udp")) return "udp";
  return "tcp";
}

function protoToUci(p: PortForwardRule["protocol"]): string {
  return p === "both" ? "tcp udp" : p;
}

function parsePorts(v: unknown): number | [number, number] {
  const s = (v ?? "").toString();
  const [a, b] = s.split(/[-:]/).map((x) => Number(x));
  if (a && b && a !== b) return [a, b];
  return a || 0;
}

function portLow(p: number | [number, number]): number {
  return Array.isArray(p) ? p[0] : p;
}

export function createOpenWrtDriver(creds: RouterCredentials): RouterDriver {
  if (!creds.username) throw new DriverError("Falta ROUTER_USERNAME", "AUTH");
  return new OpenWrtDriver(creds);
}
