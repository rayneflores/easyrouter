import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DEVICE_TYPES, type DeviceType } from "@ryfsystems/core";

const norm = (mac: string) => mac.trim().toLowerCase();

export function isDeviceType(v: unknown): v is DeviceType {
  return typeof v === "string" && (DEVICE_TYPES as readonly string[]).includes(v);
}

export interface DeviceMeta {
  type?: DeviceType;
  alias?: string;
}

// Metadatos mac->{type,alias} que pone el usuario (app-layer, no del router; D-01).
// Persistidos en JSON. Migra el formato antiguo {mac: "<type>"}.
export class DeviceMetaStore {
  private map = new Map<string, DeviceMeta>();

  constructor(private readonly file: string) {
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      for (const [mac, v] of Object.entries(raw)) {
        if (typeof v === "string") {
          if (isDeviceType(v)) this.map.set(norm(mac), { type: v });
        } else if (v && typeof v === "object") {
          const o = v as DeviceMeta;
          const meta: DeviceMeta = {};
          if (isDeviceType(o.type)) meta.type = o.type;
          if (typeof o.alias === "string" && o.alias) meta.alias = o.alias;
          if (meta.type || meta.alias) this.map.set(norm(mac), meta);
        }
      }
    } catch {
      // archivo nuevo o ilegible: se empieza vacío.
    }
  }

  get(mac: string): DeviceMeta {
    return this.map.get(norm(mac)) ?? {};
  }

  setType(mac: string, type: DeviceType): void {
    this.update(mac, (m) => ({ ...m, type }));
  }

  // alias vacío borra el alias.
  setAlias(mac: string, alias: string): void {
    const a = alias.trim();
    this.update(mac, (m) => ({ ...m, alias: a || undefined }));
  }

  private update(mac: string, fn: (m: DeviceMeta) => DeviceMeta): void {
    const key = norm(mac);
    const next = fn(this.map.get(key) ?? {});
    if (next.type || next.alias) this.map.set(key, next);
    else this.map.delete(key);
    this.persist();
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.map), null, 2));
  }
}
