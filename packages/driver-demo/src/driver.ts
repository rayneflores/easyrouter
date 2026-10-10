import {
  DriverError,
  type AccessControl,
  type AccessMode,
  type Capability,
  type ClientDevice,
  type DeviceInfo,
  type Dmz,
  type EthernetConfig,
  type GuestWifi,
  type GuestWifiUpdate,
  type LanConfig,
  type NetworkConfig,
  type PortForwardRule,
  type Qos,
  type QosRule,
  type RouterCredentials,
  type RouterDriver,
  type WanStatus,
  type WifiNetwork,
  type WifiUpdate,
} from "@ryfsystems/core";

// Driver de demostración: estado en memoria, sin hardware. Implementa el contrato
// completo para validar que el gateway y la web funcionan igual con cualquier backend (F5).
// No registra sonda de detección (no se autodetecta); se elige con ROUTER_DRIVER=demo.
export class DemoDriver implements RouterDriver {
  readonly id = "demo";
  private loggedIn = false;
  private readonly bootedAt = Date.now();

  private wifi: WifiNetwork[] = [
    { band: "2.4g", enabled: true, ssid: "Casa", hidden: false, channel: 6, bandwidth: "20MHz", security: "wpa2psk" },
    { band: "5g", enabled: true, ssid: "Casa_5G", hidden: false, channel: 36, bandwidth: "80MHz", security: "wpa3sae" },
  ];
  private wifiKey: Record<string, string> = { "2.4g": "demo-pass", "5g": "demo-pass" };

  private clients: ClientDevice[] = [
    { mac: "aa:bb:cc:00:00:01", ip: "192.168.1.20", hostname: "Pixel-8", connection: "wifi", band: "5g", online: true, type: "phone" },
    { mac: "aa:bb:cc:00:00:02", ip: "192.168.1.21", hostname: "ThinkPad", connection: "wifi", band: "5g", online: true, type: "laptop" },
    { mac: "aa:bb:cc:00:00:03", ip: "192.168.1.22", hostname: "LivingTV", connection: "ethernet", online: true, type: "tv" },
    { mac: "aa:bb:cc:00:00:04", ip: "192.168.1.23", hostname: "EchoDot", connection: "wifi", band: "2.4g", online: false, type: "speaker" },
  ];

  private rules: PortForwardRule[] = [
    { id: "1", name: "SSH", enabled: true, protocol: "tcp", externalPort: 2222, internalIp: "192.168.1.21", internalPort: 22 },
  ];
  private nextId = 2;

  constructor(_creds: RouterCredentials) {}

  private access: AccessControl = { enabled: false, mode: "black", black: [], white: [] };

  capabilities(): Capability[] {
    return ["wan", "wifi.read", "wifi.write", "clients", "reboot", "factoryReset", "portForward.read", "portForward.write", "accessControl", "dmz", "network", "guestWifi", "qos"];
  }

  async login(): Promise<void> {
    this.loggedIn = true;
  }

  async logout(): Promise<void> {
    this.loggedIn = false;
  }

  private assert(): void {
    if (!this.loggedIn) throw new DriverError("Sesión demo no iniciada", "AUTH");
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    this.assert();
    return {
      model: "EasyRouter Demo 3000",
      firmware: "demo-1.0.0",
      mac: "aa:bb:cc:de:mo:00",
      uptimeSeconds: Math.floor((Date.now() - this.bootedAt) / 1000) + 86400,
      memory: { used: 96 * 1024 * 1024, total: 256 * 1024 * 1024 },
    };
  }

  async getWan(): Promise<WanStatus> {
    this.assert();
    return {
      connected: true,
      type: "ethernet",
      proto: "DHCP",
      ip: "203.0.113.42",
      gateway: "203.0.113.1",
      dns: ["1.1.1.1", "8.8.8.8"],
      rxBytes: 12_500_000 + (Date.now() % 1000) * 1000,
      txBytes: 3_200_000 + (Date.now() % 1000) * 400,
    };
  }

  async getWifi(): Promise<WifiNetwork[]> {
    this.assert();
    return this.wifi.map((w) => ({
      ...w,
      channels: w.band === "5g" ? [36, 40, 44, 48, 149, 153, 157, 161] : [1, 6, 11],
    }));
  }

  async setWifi(update: WifiUpdate): Promise<void> {
    this.assert();
    const net = this.wifi.find((w) => w.band === update.band);
    if (!net) throw new DriverError(`Banda ${update.band} no existe`, "PROTOCOL");
    if (update.ssid !== undefined) net.ssid = update.ssid;
    if (update.enabled !== undefined) net.enabled = update.enabled;
    if (update.hidden !== undefined) net.hidden = update.hidden;
    if (update.channel !== undefined) net.channel = update.channel;
    if (update.password !== undefined) this.wifiKey[update.band] = update.password;
  }

  async listClients(): Promise<ClientDevice[]> {
    this.assert();
    return this.clients.map((c) => ({ ...c }));
  }

  async reboot(): Promise<void> {
    this.assert();
    // demo: no hace nada
  }

  async factoryReset(): Promise<void> {
    this.assert();
    // demo: no hace nada (no borra el estado para seguir usable)
  }

  async changeAdminPassword(): Promise<void> {
    this.assert();
    // demo: no gestiona credenciales reales
  }

  private dmz: Dmz = { enabled: false, destIp: "" };
  async getDmz(): Promise<Dmz> {
    this.assert();
    return { ...this.dmz };
  }
  async setDmz(enabled: boolean, destIp: string): Promise<void> {
    this.assert();
    this.dmz = { enabled, destIp };
  }

  async getPortForwarding(): Promise<PortForwardRule[]> {
    this.assert();
    return this.rules.map((r) => ({ ...r }));
  }

  async addPortForward(rule: PortForwardRule): Promise<void> {
    this.assert();
    this.rules.push({ ...rule, id: String(this.nextId++) });
  }

  async deletePortForward(id: string): Promise<void> {
    this.assert();
    this.rules = this.rules.filter((r) => r.id !== id);
  }

  async getAccessControl(): Promise<AccessControl> {
    this.assert();
    return { ...this.access, black: [...this.access.black], white: [...this.access.white] };
  }

  async setAccessMode(enabled: boolean, mode: AccessMode): Promise<void> {
    this.assert();
    this.access.enabled = enabled;
    this.access.mode = mode;
  }

  async addAccessEntry(list: AccessMode, mac: string, name?: string): Promise<void> {
    this.assert();
    const arr = this.access[list];
    if (!arr.some((e) => e.mac === mac)) arr.push({ mac, name });
  }

  async removeAccessEntry(list: AccessMode, mac: string): Promise<void> {
    this.assert();
    this.access[list] = this.access[list].filter((e) => e.mac !== mac);
  }

  private net: NetworkConfig = {
    lan: { ip: "192.168.1.1", netmask: "255.255.255.0", dhcpEnabled: true, dhcpStart: "192.168.1.100", dhcpEnd: "192.168.1.200", leaseTime: "12h" },
    ethernet: { proto: "dhcp", ip: "203.0.113.42", netmask: "255.255.255.0", gateway: "203.0.113.1", dns: ["1.1.1.1", "8.8.8.8"], mac: "aa:bb:cc:de:mo:00", mtu: 1500 },
  };
  async getNetwork(): Promise<NetworkConfig> {
    this.assert();
    return { lan: { ...this.net.lan }, ethernet: { ...this.net.ethernet } };
  }
  async setLan(cfg: LanConfig): Promise<void> {
    this.assert();
    this.net.lan = { ...cfg };
  }
  async setEthernet(cfg: EthernetConfig): Promise<void> {
    this.assert();
    this.net.ethernet = { ...cfg };
  }

  private guest: GuestWifi[] = [
    { band: "2.4g", enabled: false, ssid: "Casa-Invitados", hidden: false, security: "wpa2psk" },
    { band: "5g", enabled: false, ssid: "Casa-Invitados_5G", hidden: false, security: "wpa2psk" },
  ];
  async getGuestWifi(): Promise<GuestWifi[]> {
    this.assert();
    return this.guest.map((g) => ({ ...g }));
  }
  async setGuestWifi(update: GuestWifiUpdate): Promise<void> {
    this.assert();
    const net = this.guest.find((g) => g.band === update.band);
    if (!net) throw new DriverError(`Banda ${update.band} no existe`, "PROTOCOL");
    if (update.ssid !== undefined) net.ssid = update.ssid;
    if (update.enabled !== undefined) net.enabled = update.enabled;
    if (update.hidden !== undefined) net.hidden = update.hidden;
  }

  private qos: Qos = { enabled: false, rules: [] };
  async getQos(): Promise<Qos> {
    this.assert();
    return { enabled: this.qos.enabled, rules: this.qos.rules.map((r) => ({ ...r })) };
  }
  async setQosEnabled(enabled: boolean): Promise<void> {
    this.assert();
    this.qos.enabled = enabled;
  }
  async setQosRule(rule: QosRule): Promise<void> {
    this.assert();
    const mac = rule.mac.toLowerCase();
    this.qos.rules = [...this.qos.rules.filter((r) => r.mac !== mac), { ...rule, mac }];
  }
  async deleteQosRule(mac: string): Promise<void> {
    this.assert();
    this.qos.rules = this.qos.rules.filter((r) => r.mac !== mac.toLowerCase());
  }
}

export function createDemoDriver(creds: RouterCredentials): RouterDriver {
  return new DemoDriver(creds);
}
