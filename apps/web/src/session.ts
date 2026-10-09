import type { DeviceType } from "@ryfsystems/core";

// Modo de conexión: "gateway" (habla con el gateway) o "direct" (drivers en la app).
export type Mode = "gateway" | "direct";

const K = {
  mode: "easyrouter.mode",
  base: "easyrouter.gatewayUrl",
  token: "easyrouter.gatewayToken",
  driver: "easyrouter.driverId",
  creds: "easyrouter.directCreds",
  meta: "easyrouter.deviceMeta",
};

function get(k: string): string {
  try { return localStorage.getItem(k) ?? ""; } catch { return ""; }
}
function set(k: string, v: string): void {
  try { localStorage.setItem(k, v); } catch { /* sin storage */ }
}

export const getMode = (): Mode => (get(K.mode) === "direct" ? "direct" : "gateway");
export const setMode = (m: Mode) => set(K.mode, m);

// URL base: del gateway (modo gateway) o del router (modo direct).
export const getBase = () => get(K.base);
export const setBase = (u: string) => set(K.base, u.replace(/\/+$/, ""));

export const getToken = () => get(K.token);
export const setToken = (t: string) => set(K.token, t);

export const getDriverId = () => get(K.driver);
export const setDriverId = (id: string) => set(K.driver, id);

// Credenciales del router en modo direct (en el dispositivo). Se borran al salir.
export function getCreds(): { username: string; password: string } | undefined {
  try { return JSON.parse(get(K.creds)) || undefined; } catch { return undefined; }
}
export const setCreds = (c: { username: string; password: string }) => set(K.creds, JSON.stringify(c));
export const clearCreds = () => set(K.creds, "");

// Metadatos por dispositivo (tipo/alias) en modo direct (el gateway no está).
export type DeviceMeta = { type?: DeviceType; alias?: string };
export function getMeta(): Record<string, DeviceMeta> {
  try { return JSON.parse(get(K.meta)) || {}; } catch { return {}; }
}
export function setMeta(mac: string, patch: DeviceMeta): void {
  const all = getMeta();
  const key = mac.toLowerCase();
  all[key] = { ...all[key], ...patch };
  if (!all[key].type && !all[key].alias) delete all[key];
  set(K.meta, JSON.stringify(all));
}
