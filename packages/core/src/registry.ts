import type { DriverFactory, RouterCredentials, RouterDriver } from "./driver.js";
import { DriverError } from "./driver.js";

// Sonda de detección: dado un baseUrl, decide si ESE driver reconoce al router.
// Devuelve datos (p.ej. modelo si es legible sin login) o null si no lo reconoce.
export type DriverProbe = (baseUrl: string) => Promise<{ model?: string } | null>;

export interface DriverMatch {
  id: string;
  model?: string;
}

// Metadatos estáticos del driver (conocidos sin hablar con el router).
export interface DriverInfo {
  brand?: string; // marca/familia, p.ej. "OLAX / SIM WiFi6"
  label?: string; // nombre legible del driver
}

const factories = new Map<string, DriverFactory>();
const probes = new Map<string, DriverProbe>();
const infos = new Map<string, DriverInfo>();

export function registerDriver(
  id: string,
  factory: DriverFactory,
  probe?: DriverProbe,
  info?: DriverInfo,
): void {
  factories.set(id, factory);
  if (probe) probes.set(id, probe);
  if (info) infos.set(id, info);
}

export function getDriverInfo(id: string): DriverInfo | undefined {
  return infos.get(id);
}

// Prueba las sondas registradas contra un baseUrl; devuelve el primer driver que lo reconoce.
export async function detectDriver(baseUrl: string): Promise<DriverMatch | null> {
  for (const [id, probe] of probes) {
    try {
      const m = await probe(baseUrl);
      if (m) return { id, model: m.model };
    } catch {
      // candidato que no responde / no es este driver
    }
  }
  return null;
}

export function createDriver(id: string, creds: RouterCredentials): RouterDriver {
  const factory = factories.get(id);
  if (!factory) {
    throw new DriverError(`No hay driver registrado con id "${id}"`, "UNSUPPORTED");
  }
  return factory(creds);
}

export function listDrivers(): string[] {
  return [...factories.keys()];
}
