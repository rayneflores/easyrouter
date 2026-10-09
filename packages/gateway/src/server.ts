import { existsSync } from "node:fs";
import { join } from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { DriverError, getDriverInfo } from "@ryfsystems/core";
import "@ryfsystems/driver-simwifi6"; // registra el driver en el registry
import "@ryfsystems/driver-openwrt"; // driver OpenWrt (ubus); autodetectable
import "@ryfsystems/driver-tplink"; // drivers TP-Link y Mercusys; autodetectables
import "@ryfsystems/driver-demo"; // driver demo (ROUTER_DRIVER=demo)
import { loadConfig } from "./config.js";
import { Auth } from "./auth.js";
import { RouterSession } from "./session.js";
import { DeviceMetaStore } from "./deviceMeta.js";
import { RouterStateStore } from "./routerState.js";
import { CredentialStore } from "./credentialStore.js";
import { detectRouter } from "./detect.js";
import { registerApiRoutes } from "./routes/api.js";

const cfg = loadConfig();
// Override de credencial persistido (si se cambió la contraseña desde la app) — prioridad sobre .env.
const credStore = new CredentialStore(cfg.deviceMetaFile.replace(/[^/]*$/, "credentials.json"));
if (credStore.password) cfg.router.password = credStore.password;
const app = Fastify({ logger: true });

// Autodetección del router de la red (salvo que ROUTER_BASE_URL esté fijado en el entorno).
let detected = false;
if (!cfg.routerBaseFixed) {
  app.log.info("Detectando router en la red…");
  const found = await detectRouter();
  if (found) {
    cfg.router.baseUrl = found.baseUrl;
    if (!cfg.driverFixed) cfg.driverId = found.id;
    detected = true;
    app.log.info(`Router detectado: ${found.baseUrl} (driver ${found.id})`);
  } else {
    app.log.warn(`No se detectó router; usando ${cfg.router.baseUrl}`);
  }
}
if (!cfg.driverId) cfg.driverId = "simwifi6";

const session = new RouterSession(cfg);
const auth = new Auth(cfg);
const deviceMeta = new DeviceMetaStore(cfg.deviceMetaFile);
const routerState = new RouterStateStore(cfg.deviceMetaFile.replace(/[^/]*$/, "router-state.json"));

// Aprende el modelo del router (solo legible con sesión) para mostrarlo en la detección.
function learnModel(): void {
  session
    .run((d) => d.getDeviceInfo())
    .then((info) => routerState.learn(cfg.router.baseUrl, info.model))
    .catch(() => {});
}

// CORS para el shell nativo (Capacitor) y la web. CORS_ORIGIN="*" o lista separada por comas.
const corsOrigin = process.env.CORS_ORIGIN ?? "*";
await app.register(cors, {
  origin: corsOrigin === "*" ? true : corsOrigin.split(",").map((s) => s.trim()),
  allowedHeaders: ["authorization", "content-type"],
});

app.get("/health", async () => ({ ok: true, driver: cfg.driverId }));

function bearer(req: { headers: Record<string, unknown> }): string {
  const h = (req.headers.authorization as string | undefined) ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

// Login: compara las credenciales del router introducidas con las guardadas (.env).
app.post<{ Body: { username?: string; password?: string } }>("/api/login", async (req, reply) => {
  const { username = "", password = "" } = req.body ?? {};
  if (!auth.verifyCredentials(username, password)) {
    return reply.code(401).send({ error: "invalid_credentials" });
  }
  const token = auth.createSession();
  learnModel(); // en segundo plano: cachea modelo/marca para la pantalla de detección
  return { token };
});

app.post("/api/logout", async (req, reply) => {
  auth.revoke(bearer(req));
  return reply.code(204).send();
});

// Cambio de contraseña del admin del router + sincronización del gateway.
app.post<{ Body: { current?: string; next?: string } }>("/api/admin/password", async (req, reply) => {
  const { current = "", next = "" } = req.body ?? {};
  if (!current || next.length < 1) return reply.code(400).send({ error: "invalid_body" });
  if (!auth.verifyCredentials(cfg.router.username, current)) {
    return reply.code(401).send({ error: "wrong_current" });
  }
  await session.run((d) => d.changeAdminPassword(current, next));
  // Sincroniza: el driver y Auth comparten cfg.router por referencia; persiste para reinicios.
  cfg.router.password = next;
  credStore.set(next);
  return reply.code(204).send();
});

// Info del router detectado (público: la pantalla de login lo muestra antes de entrar).
app.get("/api/router", async () => {
  const info = cfg.driverId ? getDriverInfo(cfg.driverId) : undefined;
  return {
    baseUrl: cfg.router.baseUrl,
    driver: cfg.driverId,
    brand: info?.brand,
    label: info?.label,
    model: routerState.model,
    detected,
  };
});

const PUBLIC = ["/api/login", "/api/logout", "/api/router"];

// Guard de sesión para el resto de /api/* (las rutas públicas quedan fuera).
app.addHook("onRequest", async (req, reply) => {
  if (!req.url.startsWith("/api/")) return;
  if (PUBLIC.some((p) => req.url.startsWith(p))) return;
  if (!auth.isValid(bearer(req))) {
    return reply.code(401).send({ error: "unauthorized" });
  }
});

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof DriverError) {
    const code = err.code === "AUTH" ? 502 : err.code === "UNREACHABLE" ? 504 : 500;
    return reply.code(code).send({ error: err.code, message: err.message });
  }
  app.log.error(err);
  return reply.code(500).send({ error: "internal", message: (err as Error).message });
});

registerApiRoutes(app, session, deviceMeta);

// Sirve la web construida (apps/web/dist) en la misma dirección que la API.
const webDir = cfg.webDir ?? join(import.meta.dirname, "../../../apps/web/dist");
if (existsSync(join(webDir, "index.html"))) {
  await app.register(fastifyStatic, { root: webDir });
  // SPA: rutas que no son API ni fichero → index.html.
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "not_found" });
    return reply.sendFile("index.html");
  });
  app.log.info(`Sirviendo web desde ${webDir}`);
} else {
  app.log.warn(`Web no encontrada en ${webDir} (ejecuta 'npm run build -w @ryfsystems/web'); solo API.`);
}

app
  .listen({ port: cfg.port, host: "0.0.0.0" })
  .then((addr) => app.log.info(`EasyRouter gateway en ${addr}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
