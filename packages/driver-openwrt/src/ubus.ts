import { DriverError, type RouterCredentials } from "@ryfsystems/core";

const NULL_SESSION = "00000000000000000000000000000000";

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: [number, Record<string, any>?];
  error?: { code: number; message: string };
}

// Cliente ubus sobre HTTP (JSON-RPC 2.0), expuesto por uhttpd-mod-ubus + rpcd en /ubus.
// Ver https://openwrt.org/docs/techref/ubus
export class UbusClient {
  private session = NULL_SESSION;
  private id = 1;
  private readonly endpoint: string;

  constructor(private readonly creds: RouterCredentials) {
    this.endpoint = creds.baseUrl.replace(/\/+$/, "") + "/ubus";
  }

  async login(): Promise<void> {
    const [rc, data] = await this.raw(NULL_SESSION, "session", "login", {
      username: this.creds.username,
      password: this.creds.password,
    });
    const token = (data as { ubus_rpc_session?: string } | undefined)?.ubus_rpc_session;
    if (rc !== 0 || !token) throw new DriverError("Login ubus rechazado", "AUTH");
    this.session = token;
  }

  async logout(): Promise<void> {
    if (this.session === NULL_SESSION) return;
    await this.call("session", "destroy", {}).catch(() => {});
    this.session = NULL_SESSION;
  }

  // Llamada ubus autenticada. Devuelve el objeto de datos (índice 1 del result).
  async call<T = Record<string, any>>(obj: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
    const [rc, data] = await this.raw(this.session, obj, method, args);
    if (rc !== 0) {
      throw new DriverError(`ubus ${obj}.${method} rc=${rc}`, rc === 6 ? "AUTH" : "PROTOCOL");
    }
    return (data ?? {}) as T;
  }

  private async raw(
    session: string,
    obj: string,
    method: string,
    args: Record<string, unknown>,
  ): Promise<[number, Record<string, any>?]> {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: this.id++,
      method: "call",
      params: [session, obj, method, args],
    });
    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(8000),
      });
    } catch (err) {
      throw new DriverError(`No se pudo contactar ubus (${obj}.${method})`, "UNREACHABLE", err);
    }
    if (!res.ok) throw new DriverError(`HTTP ${res.status} en ubus`, "PROTOCOL");
    const j = (await res.json()) as JsonRpcResponse;
    if (j.error) {
      // -32002 = Access denied → sesión inválida/caducada.
      throw new DriverError(`ubus error ${j.error.code}: ${j.error.message}`, j.error.code === -32002 ? "AUTH" : "PROTOCOL");
    }
    return j.result ?? [4];
  }
}

// Detección: /ubus responde JSON-RPC 2.0 a una llamada session.login (aunque falle la auth).
export async function probeOpenWrt(baseUrl: string): Promise<{ model?: string } | null> {
  const endpoint = baseUrl.replace(/\/+$/, "") + "/ubus";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "call", params: [NULL_SESSION, "session", "login", {}] }),
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) return null;
  const j = (await res.json().catch(() => null)) as JsonRpcResponse | null;
  if (j && j.jsonrpc === "2.0" && (Array.isArray(j.result) || j.error)) return {};
  return null;
}
