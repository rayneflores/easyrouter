import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

interface State {
  baseUrl?: string;
  model?: string;
}

// Recuerda datos del router aprendidos tras el login (p.ej. el modelo exacto, que el
// router no da sin sesión) para poder mostrarlos en la pantalla de detección.
export class RouterStateStore {
  private state: State = {};

  constructor(private readonly file: string) {
    try {
      this.state = JSON.parse(readFileSync(file, "utf8")) as State;
    } catch {
      // archivo nuevo
    }
  }

  get model(): string | undefined {
    return this.state.model;
  }

  // Guarda el modelo para un baseUrl; si cambia el router, descarta el modelo viejo.
  learn(baseUrl: string, model: string | undefined): void {
    if (this.state.baseUrl !== baseUrl) this.state = { baseUrl };
    if (model && model !== this.state.model) {
      this.state.model = model;
      this.persist();
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.state, null, 2));
  }
}
