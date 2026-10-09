// Transporte para la familia TP-Link / Mercusys (comparten firmware/base web).
//
// ESTADO: detección funcional; el protocolo AUTENTICADO está pendiente de validar con un
// equipo real o una captura del panel (igual que se hizo con el OLAX en F0/F1).
//
// Protocolo típico de los modelos modernos (Archer C/AX, Deco, Mercusys MR/AX):
//  1. Obtener clave pública RSA + secuencia:  POST /cgi-bin/luci/;stok=/login?form=keys
//  2. Cifrar la contraseña (RSA) y firmar la petición (AES + md5 de la secuencia).
//  3. Login: POST /cgi-bin/luci/;stok=/login?form=login  -> devuelve el token `stok`.
//  4. Llamadas: POST /cgi-bin/luci/;stok=<stok>/admin/<módulo>?form=<...>  con {method:"get"|"set", ...}
// Los modelos antiguos usan /userRpm/*.htm con auth básica en cookie. Varía por firmware,
// por eso hace falta el equipo para fijar los detalles de cifrado y los nombres de módulo.

import { DriverError, type RouterCredentials } from "@ryfsystems/core";

export class TpLinkClient {
  constructor(private readonly creds: RouterCredentials) {}

  async login(): Promise<void> {
    throw new DriverError(
      "Driver TP-Link/Mercusys: login pendiente de validar con un equipo real o captura del panel " +
        "(RSA/AES + stok varían por modelo). Aporta una captura como hicimos con el OLAX.",
      "UNSUPPORTED",
    );
  }

  async logout(): Promise<void> {
    /* no-op mientras no haya sesión */
  }
}

// Detección por firma del panel web. include: palabras que deben aparecer; exclude: que no.
export async function probeBrand(
  baseUrl: string,
  include: string[],
  exclude: string[] = [],
): Promise<{ model?: string } | null> {
  let res: Response;
  try {
    res = await fetch(baseUrl.replace(/\/+$/, "") + "/", { signal: AbortSignal.timeout(2500) });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const html = (await res.text().catch(() => "")).toLowerCase();
  if (!html) return null;
  if (exclude.some((k) => html.includes(k))) return null;
  if (include.some((k) => html.includes(k))) return {};
  return null;
}
