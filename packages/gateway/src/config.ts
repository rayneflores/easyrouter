import type { RouterCredentials } from "@ryfsystems/core";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta variable de entorno ${name}`);
  return v;
}

export interface GatewayConfig {
  port: number;
  gatewayToken: string; // opcional: API key para clientes/tests. El acceso web es por login.
  driverId?: string; // si no se fija, se autodetecta
  driverFixed: boolean; // true si ROUTER_DRIVER vino del entorno
  webDir?: string; // carpeta de la web a servir (apps/web/dist); si no, solo API.
  deviceMetaFile: string; // JSON con metadatos mac->{type,alias} del usuario.
  routerBaseFixed: boolean; // true si ROUTER_BASE_URL vino del entorno (desactiva autodetección)
  router: RouterCredentials;
}

export function loadConfig(): GatewayConfig {
  const envBase = process.env.ROUTER_BASE_URL?.trim();
  const envDriver = process.env.ROUTER_DRIVER?.trim();
  return {
    port: Number(process.env.PORT ?? 8787),
    gatewayToken: process.env.GATEWAY_TOKEN ?? "",
    driverId: envDriver || undefined,
    driverFixed: Boolean(envDriver),
    webDir: process.env.WEB_DIR,
    deviceMetaFile: process.env.DEVICE_META_FILE ?? "data/device-meta.json",
    routerBaseFixed: Boolean(envBase),
    router: {
      baseUrl: envBase || "http://192.168.5.1",
      username: req("ROUTER_USERNAME"),
      password: req("ROUTER_PASSWORD"),
      insecureTls: process.env.ROUTER_INSECURE_TLS === "1",
    },
  };
}
