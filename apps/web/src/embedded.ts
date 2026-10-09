import {
  createDriver,
  detectDriver,
  getDriverInfo,
  DEVICE_TYPES,
  type AccessMode,
  type ClientDevice,
  type DeviceType,
  type EthernetConfig,
  type LanConfig,
  type PortForwardRule,
  type RouterDriver,
  type WifiUpdate,
} from "@ryfsystems/core";
import "@ryfsystems/driver-simwifi6";
import "@ryfsystems/driver-openwrt";
import "@ryfsystems/driver-tplink";
import "@ryfsystems/driver-demo";
import {
  clearCreds, getBase, getCreds, getDriverId, getMeta, setCreds, setDriverId, setMeta,
} from "./session.js";
import type { RouterInfo } from "./api.js";

// Backend "modo directo": los drivers corren en la app y hablan directo con el router
// de la red donde esté el dispositivo (sin gateway). Requiere HTTP nativo en app nativa.
let driver: RouterDriver | undefined;
let model: string | undefined;

async function ensureDriver(): Promise<RouterDriver> {
  if (driver) return driver;
  const creds = getCreds();
  if (!creds) throw new Error("No hay sesión directa");
  const id = getDriverId() || (await detectDriver(getBase()))?.id || "simwifi6";
  setDriverId(id);
  driver = createDriver(id, { baseUrl: getBase(), username: creds.username, password: creds.password });
  await driver.login();
  return driver;
}

// Reintenta login una vez si la sesión del router caducó (DriverError AUTH).
async function run<T>(op: (d: RouterDriver) => Promise<T>): Promise<T> {
  const d = await ensureDriver();
  try {
    return await op(d);
  } catch (e) {
    if (e && typeof e === "object" && (e as any).code === "AUTH") {
      driver = undefined;
      return op(await ensureDriver());
    }
    throw e;
  }
}

function applyMeta<T extends ClientDevice>(clients: T[]): T[] {
  const meta = getMeta();
  return clients.map((c) => {
    const m = meta[c.mac.toLowerCase()];
    return m ? { ...c, type: m.type ?? c.type, alias: m.alias } : c;
  });
}

export const embedded = {
  // Detección previa al login (para mostrar marca en la pantalla de conexión).
  async detect(baseUrl: string): Promise<{ driver: string; brand?: string; label?: string } | null> {
    const m = await detectDriver(baseUrl);
    if (!m) return null;
    setDriverId(m.id);
    const info = getDriverInfo(m.id);
    return { driver: m.id, brand: info?.brand, label: info?.label };
  },
  async login(username: string, password: string): Promise<void> {
    setCreds({ username, password });
    driver = undefined;
    const d = await ensureDriver();
    model = await d.getDeviceInfo().then((i) => i.model).catch(() => undefined);
  },
  async logout(): Promise<void> {
    try { await driver?.logout(); } catch { /* ignore */ }
    driver = undefined; model = undefined; clearCreds();
  },
  async routerInfo(): Promise<RouterInfo> {
    const id = getDriverId() || "simwifi6";
    const info = getDriverInfo(id);
    return { baseUrl: getBase(), driver: id, brand: info?.brand, label: info?.label, model, detected: true };
  },
  capabilities: () => run(async (d) => ({ capabilities: d.capabilities() })),
  device: () => run((d) => d.getDeviceInfo()),
  wan: () => run((d) => d.getWan()),
  wifi: () => run((d) => d.getWifi()),
  setWifi: (u: WifiUpdate) => run((d) => d.setWifi(u)),
  clients: () => run(async (d) => applyMeta(await d.listClients())),
  deviceTypes: async () => ({ types: DEVICE_TYPES as readonly DeviceType[] as DeviceType[] }),
  setClientType: async (mac: string, type: DeviceType) => { setMeta(mac, { type }); },
  setClientAlias: async (mac: string, alias: string) => { setMeta(mac, { alias: alias || undefined }); },
  reboot: () => run((d) => d.reboot()),
  factoryReset: () => run((d) => d.factoryReset()),
  changeAdminPassword: (current: string, next: string) =>
    run(async (d) => { await d.changeAdminPassword(current, next); setCreds({ username: getCreds()!.username, password: next }); }),
  portForwarding: () => run((d) => d.getPortForwarding()),
  addPortForward: (r: PortForwardRule) => run((d) => d.addPortForward(r)),
  deletePortForward: (id: string) => run((d) => d.deletePortForward(id)),
  accessControl: () => run((d) => d.getAccessControl()),
  setAccessMode: (enabled: boolean, mode: AccessMode) => run((d) => d.setAccessMode(enabled, mode)),
  addAccessEntry: (list: AccessMode, mac: string, name?: string) => run((d) => d.addAccessEntry(list, mac, name)),
  removeAccessEntry: (list: AccessMode, mac: string) => run((d) => d.removeAccessEntry(list, mac)),
  dmz: () => run((d) => d.getDmz()),
  setDmz: (enabled: boolean, destIp: string) => run((d) => d.setDmz(enabled, destIp)),
  network: () => run((d) => d.getNetwork()),
  setLan: (cfg: LanConfig) => run((d) => d.setLan(cfg)),
  setEthernet: (cfg: EthernetConfig & { password?: string }) => run((d) => d.setEthernet(cfg)),
};
