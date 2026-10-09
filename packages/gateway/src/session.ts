import { DriverError, createDriver, type RouterDriver } from "@ryfsystems/core";
import type { GatewayConfig } from "./config.js";

// Mantiene una sesión viva con el router y reintenta login si expira.
export class RouterSession {
  private driver: RouterDriver;
  private loggedIn = false;
  private loginInFlight?: Promise<void>;

  constructor(private readonly cfg: GatewayConfig) {
    this.driver = createDriver(cfg.driverId ?? "simwifi6", cfg.router);
  }

  capabilities() {
    return this.driver.capabilities();
  }

  // Ejecuta una operación garantizando sesión; si falla por AUTH, re-loguea una vez.
  async run<T>(op: (d: RouterDriver) => Promise<T>): Promise<T> {
    if (!this.loggedIn) await this.ensureLogin();
    try {
      return await op(this.driver);
    } catch (err) {
      if (err instanceof DriverError && err.code === "AUTH") {
        this.loggedIn = false;
        await this.ensureLogin();
        return op(this.driver);
      }
      throw err;
    }
  }

  // Deduplica logins concurrentes (varias peticiones en paralelo al expirar la sesión).
  private ensureLogin(): Promise<void> {
    if (this.loggedIn) return Promise.resolve();
    if (!this.loginInFlight) {
      this.loginInFlight = this.driver
        .login()
        .then(() => {
          this.loggedIn = true;
        })
        .finally(() => {
          this.loginInFlight = undefined;
        });
    }
    return this.loginInFlight;
  }
}
