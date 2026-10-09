import type {
  AccessControl,
  AccessMode,
  Capability,
  ClientDevice,
  DeviceInfo,
  DeviceType,
  Dmz,
  EthernetConfig,
  LanConfig,
  NetworkConfig,
  PortForwardRule,
  WanStatus,
  WifiNetwork,
  WifiUpdate,
} from "@ryfsystems/core";
import { getBase, getMode, getToken, setToken } from "./session.js";
import { embedded } from "./embedded.js";

export { getBase, setBase, getToken, setToken, getMode, setMode } from "./session.js";

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface RouterInfo {
  baseUrl: string;
  driver?: string;
  brand?: string;
  label?: string;
  model?: string;
  detected: boolean;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${getToken()}`,
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.body != null) headers["content-type"] = "application/json";
  const res = await fetch(getBase() + path, { ...init, headers });
  if (res.status === 401) throw new ApiError(401, "No autorizado");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { message?: string }).message ?? `Error ${res.status}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// Backend "gateway": habla con el gateway por HTTP.
const gateway = {
  async login(username: string, password: string): Promise<void> {
    const res = await fetch(getBase() + "/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (res.status === 401) throw new ApiError(401, "Usuario o contraseña incorrectos");
    if (!res.ok) throw new ApiError(res.status, `Error ${res.status}`);
    const { token } = (await res.json()) as { token: string };
    setToken(token);
  },
  async logout(): Promise<void> {
    await fetch(getBase() + "/api/logout", {
      method: "POST",
      headers: { authorization: `Bearer ${getToken()}` },
    }).catch(() => {});
    setToken("");
  },
  routerInfo: async (): Promise<RouterInfo> => {
    const res = await fetch(getBase() + "/api/router");
    if (!res.ok) throw new ApiError(res.status, `Error ${res.status}`);
    return res.json() as Promise<RouterInfo>;
  },
  capabilities: () => req<{ capabilities: Capability[] }>("/api/capabilities"),
  device: () => req<DeviceInfo>("/api/device"),
  wan: () => req<WanStatus>("/api/wan"),
  wifi: () => req<WifiNetwork[]>("/api/wifi"),
  setWifi: (u: WifiUpdate) => req<void>("/api/wifi", { method: "PUT", body: JSON.stringify(u) }),
  clients: () => req<ClientDevice[]>("/api/clients"),
  deviceTypes: () => req<{ types: DeviceType[] }>("/api/device-types"),
  setClientType: (mac: string, type: DeviceType) =>
    req<void>(`/api/clients/${encodeURIComponent(mac)}/type`, { method: "PUT", body: JSON.stringify({ type }) }),
  setClientAlias: (mac: string, alias: string) =>
    req<void>(`/api/clients/${encodeURIComponent(mac)}/alias`, { method: "PUT", body: JSON.stringify({ alias }) }),
  reboot: () => req<unknown>("/api/reboot", { method: "POST" }),
  factoryReset: () => req<unknown>("/api/factory-reset", { method: "POST" }),
  changeAdminPassword: (current: string, next: string) =>
    req<void>("/api/admin/password", { method: "POST", body: JSON.stringify({ current, next }) }),
  portForwarding: () => req<PortForwardRule[]>("/api/port-forwarding"),
  addPortForward: (rule: PortForwardRule) =>
    req<void>("/api/port-forwarding", { method: "POST", body: JSON.stringify(rule) }),
  deletePortForward: (id: string) =>
    req<void>(`/api/port-forwarding/${encodeURIComponent(id)}`, { method: "DELETE" }),
  accessControl: () => req<AccessControl>("/api/access-control"),
  setAccessMode: (enabled: boolean, mode: AccessMode) =>
    req<void>("/api/access-control", { method: "PUT", body: JSON.stringify({ enabled, mode }) }),
  addAccessEntry: (list: AccessMode, mac: string, name?: string) =>
    req<void>(`/api/access-control/${list}`, { method: "POST", body: JSON.stringify({ mac, name }) }),
  removeAccessEntry: (list: AccessMode, mac: string) =>
    req<void>(`/api/access-control/${list}/${encodeURIComponent(mac)}`, { method: "DELETE" }),
  dmz: () => req<Dmz>("/api/dmz"),
  setDmz: (enabled: boolean, destIp: string) =>
    req<void>("/api/dmz", { method: "PUT", body: JSON.stringify({ enabled, destIp }) }),
  network: () => req<NetworkConfig>("/api/network"),
  setLan: (cfg: LanConfig) => req<void>("/api/network/lan", { method: "PUT", body: JSON.stringify(cfg) }),
  setEthernet: (cfg: EthernetConfig & { password?: string }) =>
    req<void>("/api/network/ethernet", { method: "PUT", body: JSON.stringify(cfg) }),
};

// Selecciona el backend según el modo en cada llamada (gateway o directo).
const backend = () => (getMode() === "direct" ? embedded : gateway);

export const login = (u: string, p: string) => backend().login(u, p);
export const logout = () => backend().logout();
export const routerInfo = () => backend().routerInfo();
// Detección directa (modo "direct"): sondea el router en baseUrl.
export const detectDirect = (baseUrl: string) => embedded.detect(baseUrl);

export const api = {
  capabilities: () => backend().capabilities(),
  device: () => backend().device(),
  wan: () => backend().wan(),
  wifi: () => backend().wifi(),
  setWifi: (u: WifiUpdate) => backend().setWifi(u),
  clients: () => backend().clients(),
  deviceTypes: () => backend().deviceTypes(),
  setClientType: (mac: string, type: DeviceType) => backend().setClientType(mac, type),
  setClientAlias: (mac: string, alias: string) => backend().setClientAlias(mac, alias),
  reboot: () => backend().reboot(),
  factoryReset: () => backend().factoryReset(),
  changeAdminPassword: (current: string, next: string) => backend().changeAdminPassword(current, next),
  portForwarding: () => backend().portForwarding(),
  addPortForward: (rule: PortForwardRule) => backend().addPortForward(rule),
  deletePortForward: (id: string) => backend().deletePortForward(id),
  accessControl: () => backend().accessControl(),
  setAccessMode: (enabled: boolean, mode: AccessMode) => backend().setAccessMode(enabled, mode),
  addAccessEntry: (list: AccessMode, mac: string, name?: string) => backend().addAccessEntry(list, mac, name),
  removeAccessEntry: (list: AccessMode, mac: string) => backend().removeAccessEntry(list, mac),
  dmz: () => backend().dmz(),
  setDmz: (enabled: boolean, destIp: string) => backend().setDmz(enabled, destIp),
  network: () => backend().network(),
  setLan: (cfg: LanConfig) => backend().setLan(cfg),
  setEthernet: (cfg: EthernetConfig & { password?: string }) => backend().setEthernet(cfg),
};
