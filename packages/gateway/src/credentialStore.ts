import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// Guarda la contraseña del router cuando se cambia desde la app. Tiene prioridad sobre
// ROUTER_PASSWORD del .env (que no se reescribe), para que login y driver sigan funcionando
// tras el cambio, incluso después de reiniciar el gateway. Borra el fichero para volver al .env.
export class CredentialStore {
  private pw?: string;

  constructor(private readonly file: string) {
    try {
      const j = JSON.parse(readFileSync(file, "utf8")) as { password?: string };
      if (typeof j.password === "string" && j.password) this.pw = j.password;
    } catch {
      // sin override
    }
  }

  get password(): string | undefined {
    return this.pw;
  }

  set(password: string): void {
    this.pw = password;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ password }, null, 2), { mode: 0o600 });
  }
}
