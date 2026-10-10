import type {
  AccessControl,
  AccessMode,
  ClientDevice,
  DeviceInfo,
  Dmz,
  EthernetConfig,
  GuestWifi,
  GuestWifiUpdate,
  LanConfig,
  NetworkConfig,
  PortForwardRule,
  Qos,
  QosRule,
  WanStatus,
  WifiNetwork,
  WifiUpdate,
} from "./domain.js";

export type Capability =
  | "wan"
  | "wifi.read"
  | "wifi.write"
  | "clients"
  | "reboot"
  | "factoryReset"
  | "admin.password"
  | "portForward.read"
  | "portForward.write"
  | "accessControl"
  | "dmz"
  | "network"
  | "guestWifi"
  | "qos";

export interface RouterCredentials {
  baseUrl: string;
  username: string;
  password: string;
  insecureTls?: boolean;
}

export class DriverError extends Error {
  constructor(
    message: string,
    readonly code: "AUTH" | "UNREACHABLE" | "PROTOCOL" | "UNSUPPORTED",
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DriverError";
  }
}

// Contrato común (D-02). Un driver por marca/modelo lo implementa.
// Las capacidades que un router no soporta se omiten de capabilities()
// y sus métodos lanzan DriverError("UNSUPPORTED").
export interface RouterDriver {
  readonly id: string;

  capabilities(): Capability[];

  login(): Promise<void>;
  logout(): Promise<void>;

  getDeviceInfo(): Promise<DeviceInfo>;
  getWan(): Promise<WanStatus>;

  getWifi(): Promise<WifiNetwork[]>;
  setWifi(update: WifiUpdate): Promise<void>;

  listClients(): Promise<ClientDevice[]>;

  reboot(): Promise<void>;
  factoryReset(): Promise<void>;
  // Cambia la contraseña del admin del router. Opcional (capability "admin.password").
  changeAdminPassword(current: string, next: string): Promise<void>;

  getPortForwarding(): Promise<PortForwardRule[]>;
  addPortForward(rule: PortForwardRule): Promise<void>;
  deletePortForward(id: string): Promise<void>;

  // Control de acceso por MAC (lista negra/blanca). Opcional (capability "accessControl").
  getAccessControl(): Promise<AccessControl>;
  setAccessMode(enabled: boolean, mode: AccessMode): Promise<void>;
  addAccessEntry(list: AccessMode, mac: string, name?: string): Promise<void>;
  removeAccessEntry(list: AccessMode, mac: string): Promise<void>;

  // DMZ. Opcional (capability "dmz").
  getDmz(): Promise<Dmz>;
  setDmz(enabled: boolean, destIp: string): Promise<void>;

  // Configuración de red LAN + Ethernet/WAN. Opcional (capability "network").
  getNetwork(): Promise<NetworkConfig>;
  setLan(cfg: LanConfig): Promise<void>;
  setEthernet(cfg: EthernetConfig & { password?: string }): Promise<void>;

  // Red de invitados. Opcional (capability "guestWifi").
  getGuestWifi(): Promise<GuestWifi[]>;
  setGuestWifi(update: GuestWifiUpdate): Promise<void>;

  // QoS por dispositivo. Opcional (capability "qos"). setQosRule crea o actualiza por MAC.
  getQos(): Promise<Qos>;
  setQosEnabled(enabled: boolean): Promise<void>;
  setQosRule(rule: QosRule): Promise<void>;
  deleteQosRule(mac: string): Promise<void>;
}

export type DriverFactory = (creds: RouterCredentials) => RouterDriver;
