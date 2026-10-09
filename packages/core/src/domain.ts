export interface DeviceInfo {
  model: string;
  firmware?: string;
  mac?: string;
  imei?: string;
  uptimeSeconds?: number;
  memory?: { used: number; total: number };
}

export interface WanStatus {
  connected: boolean;
  type?: "4g" | "5g" | "ethernet" | "unknown";
  proto?: string;
  ip?: string;
  gateway?: string;
  dns?: string[];
  operator?: string;
  signalPercent?: number;
  rssi?: number;
  rxBytes?: number;
  txBytes?: number;
}

// "dual" = SSID único fusionado para ambas bandas (modo dual-frequency).
export type WifiBand = "2.4g" | "5g" | "dual";

export interface WifiNetwork {
  band: WifiBand;
  enabled: boolean;
  ssid: string;
  hidden?: boolean;
  channel?: number | "auto";
  channels?: number[]; // canales seleccionables para esta banda (sin contar "auto")
  bandwidth?: string;
  security?: string;
}

export interface WifiUpdate {
  band: WifiBand;
  enabled?: boolean;
  ssid?: string;
  password?: string;
  hidden?: boolean;
  channel?: number | "auto";
}

export const DEVICE_TYPES = [
  "phone",
  "tablet",
  "laptop",
  "desktop",
  "tv",
  "console",
  "speaker",
  "watch",
  "camera",
  "printer",
  "router",
  "nas",
  "iot",
  "other",
  "unknown",
] as const;

export type DeviceType = (typeof DEVICE_TYPES)[number];

export interface ClientDevice {
  mac: string;
  ip?: string;
  hostname?: string;
  connection?: "wifi" | "ethernet";
  band?: WifiBand;
  online: boolean;
  type: DeviceType; // auto-detectado por el router, o asignado por el usuario (override en el gateway)
  alias?: string; // nombre puesto por el usuario (override en el gateway); prevalece sobre hostname
}

// Configuración LAN (IP del router + servidor DHCP).
export interface LanConfig {
  ip: string;
  netmask: string;
  dhcpEnabled: boolean;
  dhcpStart: string; // primera IP del rango
  dhcpEnd: string; // última IP del rango
  leaseTime: string; // p.ej. "72h", "12h", "30m"
}

export type EthernetProto = "dhcp" | "static" | "pppoe";

// Configuración del puerto WAN/Ethernet.
export interface EthernetConfig {
  proto: EthernetProto;
  ip?: string;
  netmask?: string;
  gateway?: string;
  dns?: string[];
  username?: string; // pppoe
  mac?: string;
  mtu?: number;
}

export interface NetworkConfig {
  lan: LanConfig;
  ethernet: EthernetConfig;
}

// DMZ: expone un host interno a todo el tráfico entrante no gestionado por otras reglas.
export interface Dmz {
  enabled: boolean;
  destIp: string;
}

// Control de acceso por MAC. "black" = bloquear los de la lista; "white" = permitir solo esos.
export type AccessMode = "black" | "white";

export interface AccessEntry {
  mac: string;
  name?: string;
}

export interface AccessControl {
  enabled: boolean;
  mode: AccessMode; // lista aplicada cuando está activado
  black: AccessEntry[];
  white: AccessEntry[];
}

export interface PortForwardRule {
  id?: string;
  name?: string;
  enabled: boolean;
  protocol: "tcp" | "udp" | "both";
  externalPort: number | [number, number];
  internalIp: string;
  internalPort: number | [number, number];
}
