import { randomBytes, timingSafeEqual } from "node:crypto";
import type { GatewayConfig } from "./config.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// Sesiones en memoria. Se invalidan al reiniciar el gateway (aceptable).
export class Auth {
  private sessions = new Map<string, number>();

  constructor(private readonly cfg: GatewayConfig) {}

  // Compara las credenciales introducidas con las del admin guardadas (.env).
  verifyCredentials(username: string, password: string): boolean {
    return (
      safeEqual(username, this.cfg.router.username) &&
      safeEqual(password, this.cfg.router.password)
    );
  }

  createSession(): string {
    const token = randomBytes(32).toString("hex");
    this.sessions.set(token, Date.now() + SESSION_TTL_MS);
    return token;
  }

  isValid(token: string): boolean {
    const exp = this.sessions.get(token);
    if (exp === undefined) {
      // Compatibilidad: acepta GATEWAY_TOKEN como API key para clientes/tests.
      return Boolean(this.cfg.gatewayToken) && safeEqual(token, this.cfg.gatewayToken);
    }
    if (Date.now() > exp) {
      this.sessions.delete(token);
      return false;
    }
    return true;
  }

  revoke(token: string): void {
    this.sessions.delete(token);
  }
}
