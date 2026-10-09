import {
  DriverError,
  type AccessControl,
  type AccessMode,
  type Capability,
  type ClientDevice,
  type DeviceInfo,
  type DeviceType,
  type Dmz,
  type EthernetConfig,
  type LanConfig,
  type NetworkConfig,
  type PortForwardRule,
  type RouterCredentials,
  type RouterDriver,
  type WanStatus,
  type WifiBand,
  type WifiNetwork,
  type WifiUpdate,
} from "@ryfsystems/core";
import { SimWifiTransport, md5 } from "./transport.js";

// Mapeos confirmados contra OLAX GX3000 Pro (ver docs/protocol-simwifi6.md §tráfico real).
// Reads = GET, writes/dispatcher = POST.

export class SimWifi6Driver implements RouterDriver {
  readonly id = "simwifi6";
  private readonly t: SimWifiTransport;

  constructor(creds: RouterCredentials) {
    this.t = new SimWifiTransport(creds);
  }

  capabilities(): Capability[] {
    return [
      "wan",
      "wifi.read",
      "wifi.write",
      "clients",
      "reboot",
      "factoryReset",
      "admin.password",
      "portForward.read",
      "portForward.write",
      "accessControl",
      "dmz",
      "network",
    ];
  }

  login() {
    return this.t.login();
  }

  logout() {
    return this.t.logout();
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    const d = await this.t.getData<any>("system_sysinfo");
    return {
      model: d.distribution ?? d.device_name ?? "Router",
      firmware: d.sw_version ? `${d.sw_version} (${d.version ?? ""})`.trim() : d.version,
      mac: d.mac_addr,
      imei: d.imei_code && d.imei_code !== "--" ? d.imei_code : undefined,
      uptimeSeconds: num(d.uptime),
      memory: d.memory ? { used: num(d.memory.used) ?? 0, total: num(d.memory.total) ?? 0 } : undefined,
    };
  }

  async getWan(): Promise<WanStatus> {
    const [online, flow] = await Promise.all([
      this.t.getData<any>("iface_get_onlineinfo"),
      this.t.getData<any>("status_internet").catch(() => ({})),
    ]);
    const w = online.wan ?? {};
    return {
      connected: Boolean(w.wan_ipaddr),
      type: "ethernet",
      proto: w.wan_proto,
      ip: w.wan_ipaddr,
      gateway: w.wan_gwaddr,
      dns: [w.dns, w.res_dns].filter(Boolean),
      rxBytes: num(flow.rx),
      txBytes: num(flow.tx),
    };
  }

  // Multi-SSID por banda: SSID/clave en *_ap_web_list (primario = idx 1),
  // canal/ancho en *_web_get (radio). El dual-frequency fusionado no está activo
  // en este equipo (Dual_frequency_status = "close"); se añadirá si se detecta.
  async getWifi(): Promise<WifiNetwork[]> {
    const [ap2, ap5, r2, r5] = await Promise.all([
      this.t.cmd<any[]>("wifi.wifi_1_ap_web_list"),
      this.t.cmd<any[]>("wifi.wifi_2_ap_web_list"),
      this.t.cmd<any>("wifi.wifi_1_web_get"),
      this.t.cmd<any>("wifi.wifi_2_web_get"),
    ]);
    return [mapWifi("2.4g", primaryAp(ap2), r2), mapWifi("5g", primaryAp(ap5), r5)];
  }

  async setWifi(update: WifiUpdate): Promise<void> {
    const is5g = update.band === "5g";
    // SSID/clave/visibilidad/activación → AP (ap_web_set)
    if (update.ssid !== undefined || update.password !== undefined || update.enabled !== undefined || update.hidden !== undefined) {
      const list = is5g ? "wifi.wifi_2_ap_web_list" : "wifi.wifi_1_ap_web_list";
      const setCmd = is5g ? "wifi.wifi_2_ap_web_set" : "wifi.wifi_1_ap_web_set";
      const ap = primaryAp(await this.t.cmd<any[]>(list));
      if (!ap) throw new DriverError("No se encontró SSID primario para la banda", "PROTOCOL");
      const curHidden = ap.hide === 1 || ap.hide === "1" || ap.hide === "yes";
      const curEnabled = ap.enable === "yes" || truthy(ap.enable);
      await this.t.cmd(setCmd, {
        myidx: ap.idx,
        ssid: update.ssid ?? ap.ssid,
        key: update.password ?? ap.key,
        enable: (update.enabled ?? curEnabled) ? "yes" : "no",
        hide: (update.hidden ?? curHidden) ? 1 : 0,
        auth: ap.auth,
        encrypt: ap.encrypt ?? "aes",
      });
    }
    // Canal → radio (wifi_X_web_set), reenviando el objeto de radio completo.
    if (update.channel !== undefined) {
      const getCmd = is5g ? "wifi.wifi_2_web_get" : "wifi.wifi_1_web_get";
      const setCmd = is5g ? "wifi.wifi_2_web_set" : "wifi.wifi_1_web_set";
      const r = await this.t.cmd<any>(getCmd);
      await this.t.cmd(setCmd, {
        enable: r.enable ?? "yes",
        mode: r.mode ?? "auto",
        bandwidth: r.bandwidth ?? "0",
        channel: update.channel === "auto" ? 0 : update.channel,
        txpower: r.txpower ?? "0",
      });
    }
  }

  async listClients(): Promise<ClientDevice[]> {
    const d = await this.t.getData<any>("userlist_get");
    const master: any[] = Array.isArray(d.master) ? d.master : [];
    const guest: any[] = d.guest && typeof d.guest === "object" ? Object.values(d.guest) : [];
    return [...master, ...guest].map(mapClient);
  }

  async reboot(): Promise<void> {
    await this.t.post("system_set", { cmd: "reboot" });
  }

  async factoryReset(): Promise<void> {
    await this.t.post("system_restore", { cross: 1 });
  }

  async changeAdminPassword(current: string, next: string): Promise<void> {
    // system_auth (JSON): oldpassword/password/surePassword en MD5 (trim como el login).
    await this.t.postJson("system_auth", {
      oldpassword: md5(current.trim()),
      password: md5(next.trim()),
      surePassword: md5(next.trim()),
    });
  }

  async getPortForwarding(): Promise<PortForwardRule[]> {
    const d = await this.t.getData<any>("dnat_get");
    const list: any[] = Array.isArray(d.dnats) ? d.dnats : [];
    return list.map((r) => ({
      id: (r.fwid ?? r.id ?? r.idx)?.toString(),
      name: r.fwdesc ?? r.fwname,
      enabled: r.enable === true || truthy(r.enable),
      protocol: normProto(r.proto ?? r.protocol),
      externalPort: parsePorts(r.from_dports),
      internalIp: r.to_dip ?? "",
      internalPort: parsePorts(r.to_dports),
    }));
  }

  async addPortForward(rule: PortForwardRule): Promise<void> {
    const from = portParts(rule.externalPort);
    const to = portParts(rule.internalPort);
    await this.t.post("dnat_add", {
      fwdesc: rule.name ?? "",
      fwname: rule.name ?? "",
      to_dip: rule.internalIp,
      proto: protoToStr(rule.protocol),
      enable: rule.enabled ? "true" : "false",
      from_dports_start: from.start,
      from_dports_end: from.end,
      to_dports_start: to.start,
      to_dports_end: to.end,
      from_dports: from.combined,
      to_dports: to.combined,
      reflection: "0",
      from_szid: 1,
      to_dzid: 0,
    });
  }

  async deletePortForward(id: string): Promise<void> {
    // El router espera fwids como string JSON de un array, no array con brackets.
    await this.t.post("dnat_del", { fwids: JSON.stringify([Number(id)]) });
  }

  async getAccessControl(): Promise<AccessControl> {
    const d = await this.t.getData<any>("bwlist_get");
    const map = (arr: any[]): any[] => (Array.isArray(arr) ? arr.map((e) => ({ mac: e.mac, name: e.host || undefined })) : []);
    return {
      enabled: truthy(d.enable),
      mode: d.mode === "white" ? "white" : "black",
      black: map(d.black),
      white: map(d.white),
    };
  }

  async setAccessMode(enabled: boolean, mode: AccessMode): Promise<void> {
    await this.t.post("bwlist_set_mode", { enable: enabled ? 1 : 0, mode });
  }

  async addAccessEntry(list: AccessMode, mac: string, name?: string): Promise<void> {
    await this.t.post("bwlist_add", { host: name ?? "", mac, mode: list });
  }

  async removeAccessEntry(list: AccessMode, mac: string): Promise<void> {
    await this.t.post("bwlist_del", { mode: list, data: JSON.stringify([{ mac }]) });
  }

  async getDmz(): Promise<Dmz> {
    const d = await this.t.getData<any>("dmz_get");
    return { enabled: truthy(d.enable), destIp: d.dest_ip ?? "" };
  }

  async setDmz(enabled: boolean, destIp: string): Promise<void> {
    await this.t.post("dmz_set", { enable: enabled ? 1 : 0, dest_ip: destIp });
  }

  async getNetwork(): Promise<NetworkConfig> {
    const d = await this.t.getData<any>("iface_get");
    const net = d.network?.network ?? {};
    const lan = net.lan ?? {};
    const wan = net.wan ?? {};
    const mask = lan.netmask ?? "255.255.255.0";
    const base = ipToInt(lan.ipaddr ?? "192.168.1.1") & maskToInt(mask);
    const start = Number(lan.dhcp?.start ?? 2);
    const limit = Number(lan.dhcp?.limit ?? 100);
    return {
      lan: {
        ip: lan.ipaddr ?? "",
        netmask: mask,
        dhcpEnabled: lan.dhcp?.ignore !== "1",
        dhcpStart: intToIp(base + start),
        dhcpEnd: intToIp(base + start + Math.max(0, limit - 1)),
        leaseTime: lan.dhcp?.leasetime ?? "72h",
      },
      ethernet: {
        proto: (wan.proto ?? "dhcp") as EthernetConfig["proto"],
        ip: wan.ipaddr,
        netmask: wan.netmask,
        gateway: wan.gateway,
        dns: Array.isArray(wan.dns) ? wan.dns : undefined,
        username: wan.username,
        mac: wan.macaddr,
        mtu: num(wan.mtu),
      },
    };
  }

  async setLan(cfg: LanConfig): Promise<void> {
    const base = ipToInt(cfg.ip) & maskToInt(cfg.netmask);
    const start = ipToInt(cfg.dhcpStart) - base;
    const limit = ipToInt(cfg.dhcpEnd) - ipToInt(cfg.dhcpStart) + 1;
    const arg = {
      network: {
        lan: {
          ipaddr: cfg.ip,
          netmask: cfg.netmask,
          dhcp: {
            ignore: cfg.dhcpEnabled ? "0" : "1",
            leasetime: cfg.leaseTime || "72h",
            limit: String(Math.max(1, limit)),
            dynamicdhcp: "1",
            start: String(Math.max(1, start)),
            subnet: `${cfg.ip}/${maskToCidr(cfg.netmask)}`,
          },
        },
      },
    };
    await this.t.post("iface_set", { arg: JSON.stringify(arg) });
  }

  async setEthernet(cfg: EthernetConfig & { password?: string }): Promise<void> {
    const wan: Record<string, unknown> = { proto: cfg.proto, dns: cfg.dns ?? [] };
    if (cfg.proto === "static") {
      wan.ipaddr = cfg.ip;
      wan.netmask = cfg.netmask;
      wan.gateway = cfg.gateway;
    } else if (cfg.proto === "pppoe") {
      wan.username = cfg.username;
      wan.password = cfg.password;
    }
    await this.t.post("iface_set", { arg: JSON.stringify({ network: { wan } }) });
  }

}

function primaryAp(aps: any[]): any {
  if (!Array.isArray(aps)) return undefined;
  return aps.find((a) => a.idx === 1) ?? aps.find((a) => a.enable === "yes") ?? aps[0];
}

// Canales estándar por banda (la lista real depende de país/regulatorio; el router
// rechaza los no válidos). 2.4GHz 1-13; 5GHz conjunto habitual.
const CHANNELS_2G = Array.from({ length: 13 }, (_, i) => i + 1);
const CHANNELS_5G = [36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 149, 153, 157, 161, 165];

function mapWifi(band: WifiBand, ap: any, radio: any): WifiNetwork {
  const ch = radio?.currentChannel ?? radio?.channel;
  return {
    band,
    enabled: ap?.enable === "yes" || truthy(ap?.enable),
    ssid: ap?.ssid ?? "",
    hidden: ap?.hide === 1 || ap?.hide === "1" || ap?.hide === "yes",
    channel: ch === 0 || ch === "0" || ch == null ? "auto" : (num(ch) ?? "auto"),
    channels: band === "5g" ? CHANNELS_5G : CHANNELS_2G,
    bandwidth: radio?.bandwidth && radio.bandwidth !== "0" ? radio.bandwidth : undefined,
    security: ap?.auth,
  };
}

function mapClient(c: any): ClientDevice {
  const band = (c.wlan_info?.band ?? "").toString().toLowerCase();
  return {
    mac: c.mac ?? "",
    ip: c.ip,
    hostname: c.hostname ?? (c.host_name !== "*" ? c.host_name : undefined),
    connection: c.usertype === "wireless" || c.link_type === "Wlan" ? "wifi" : "ethernet",
    band: band.includes("5") ? "5g" : band.includes("2.4") ? "2.4g" : undefined,
    online: truthy(c.online),
    type: mapType(c.type),
  };
}

function mapType(raw: unknown): DeviceType {
  const s = (raw ?? "").toString().toLowerCase();
  const table: Record<string, DeviceType> = {
    phone: "phone", mobile: "phone", smartphone: "phone",
    pad: "tablet", tablet: "tablet",
    laptop: "laptop", notebook: "laptop",
    pc: "desktop", computer: "desktop", desktop: "desktop",
    tv: "tv", stb: "tv",
    game: "console", console: "console",
    speaker: "speaker", printer: "printer", camera: "camera",
    router: "router", ap: "router", nas: "nas", iot: "iot",
  };
  return table[s] ?? (s ? "other" : "unknown");
}

function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function truthy(v: unknown): boolean {
  return v === true || v === 1 || v === "1" || v === "yes" || v === "on";
}

function normProto(v: unknown): PortForwardRule["protocol"] {
  const s = (v ?? "").toString().toLowerCase();
  if (s.includes("tcp") && s.includes("udp")) return "both";
  if (s.includes("udp")) return "udp";
  return "tcp";
}

function protoToStr(p: PortForwardRule["protocol"]): string {
  return p === "both" ? "tcp udp" : p;
}

// El router usa rangos "inicio-fin" (o puerto suelto).
function parsePorts(v: unknown): number | [number, number] {
  const s = (v ?? "").toString();
  const [a, b] = s.split("-").map((x) => Number(x));
  if (a && b && a !== b) return [a, b];
  return a || 0;
}

function portParts(p: number | [number, number]): { start: number; end: string; combined: string } {
  if (Array.isArray(p)) return { start: p[0], end: String(p[1]), combined: `${p[0]}-${p[1]}` };
  return { start: p, end: "", combined: String(p) };
}

function ipToInt(ip: string): number {
  const p = (ip ?? "").split(".").map(Number);
  return (((p[0] ?? 0) << 24) >>> 0) + ((p[1] ?? 0) << 16) + ((p[2] ?? 0) << 8) + (p[3] ?? 0);
}
function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}
function maskToCidr(mask: string): number {
  return ipToInt(mask).toString(2).split("").filter((b) => b === "1").length;
}
function maskToInt(mask: string): number {
  return ipToInt(mask) >>> 0;
}

export function createSimWifi6Driver(creds: RouterCredentials): RouterDriver {
  if (!creds.username) throw new DriverError("Falta ROUTER_USERNAME", "AUTH");
  return new SimWifi6Driver(creds);
}
