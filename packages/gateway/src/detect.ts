import { readFileSync } from "node:fs";
import { detectDriver, type DriverMatch } from "@ryfsystems/core";

// Interfaces que NO son la LAN del router (VPN, docker, virtuales, loopback).
const SKIP = /^(lo|tun|tap|wg|proton|docker|br-|veth|virbr|vmnet|zt|utun)/;

// /proc/net/route da el gateway en hex little-endian (p.ej. 192.168.5.1 => "0105A8C0").
function hexLEtoIp(h: string): string | undefined {
  const pairs = h.match(/../g);
  if (!pairs || pairs.length !== 4) return undefined;
  return pairs.reverse().map((x) => parseInt(x, 16)).join(".");
}

// Puertas de enlace candidatas: gateways de rutas en interfaces físicas (sin VPN/virtuales).
export function candidateGateways(): string[] {
  const out = new Set<string>();
  try {
    const lines = readFileSync("/proc/net/route", "utf8").split("\n").slice(1);
    for (const line of lines) {
      const f = line.trim().split(/\s+/);
      if (f.length < 3) continue;
      const [iface, , gw] = f;
      if (!iface || SKIP.test(iface)) continue;
      if (gw && gw !== "00000000") {
        const ip = hexLEtoIp(gw);
        if (ip && ip !== "0.0.0.0") out.add(ip);
      }
    }
  } catch {
    // sin /proc/net/route (no Linux): sin candidatas
  }
  return [...out];
}

export interface DetectedRouter extends DriverMatch {
  baseUrl: string;
}

// Detecta el router de la red sondeando cada puerta de enlace candidata.
export async function detectRouter(): Promise<DetectedRouter | null> {
  for (const ip of candidateGateways()) {
    const baseUrl = `http://${ip}`;
    const match = await detectDriver(baseUrl);
    if (match) return { ...match, baseUrl };
  }
  return null;
}
