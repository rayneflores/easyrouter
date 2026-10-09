import { DriverError, md5, type RouterCredentials } from "@ryfsystems/core";

export { md5 };

// Detección: sin login, el API responde {status, data} y "LOGINOUT" si falta token.
// Esa firma identifica a este router (SIM WiFi6 / OLAX y compatibles).
export async function probeSimWifi6(baseUrl: string): Promise<{ model?: string } | null> {
  const url = `${baseUrl.replace(/\/+$/, "")}/v1/admin/api/system_sysinfo?token=&_=${Date.now()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
  if (!res.ok) return null;
  const j = (await res.json().catch(() => null)) as { status?: unknown; data?: unknown } | null;
  if (j && typeof j.status === "number" && "data" in j && (j.data === "LOGINOUT" || j.status === 0)) {
    return {};
  }
  return null;
}

// form-urlencoded con arrayFormat "brackets" (clave[]=v), como qs.stringify del panel.
function encodeForm(data: Record<string, unknown>): string {
  const parts: string[] = [];
  const enc = encodeURIComponent;
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) {
      for (const item of v) parts.push(`${enc(k)}[]=${enc(String(item))}`);
    } else {
      parts.push(`${enc(k)}=${enc(String(v))}`);
    }
  }
  return parts.join("&");
}

interface Envelope<T = unknown> {
  status: number;
  data?: T;
  token?: string;
  [k: string]: unknown;
}

// Cliente del protocolo propietario del SIM WiFi6.
// Ver docs/protocol-simwifi6.md. Transporte en claro, token en ?token=.
export class SimWifiTransport {
  private token = "";
  private readonly base: string;

  constructor(private readonly creds: RouterCredentials) {
    this.base = creds.baseUrl.replace(/\/+$/, "") + "/v1/admin/api/";
  }

  async login(): Promise<void> {
    // Login es GET con query params; password = md5(password.trim()). Token en data.token.
    const env = await this.get<Envelope<{ token?: string; refresh?: string }>>("login", {
      username: this.creds.username,
      password: md5(this.creds.password.trim()),
    });
    const token = env.data?.token;
    if (env.status !== 0 || !token) {
      throw new DriverError("Login rechazado por el router", "AUTH", env);
    }
    this.token = token;
  }

  async logout(): Promise<void> {
    if (!this.token) return;
    await this.call("login_out", {}, false).catch(() => {});
    this.token = "";
  }

  // POST a un endpoint directo. Body form-urlencoded (como el panel: $post sin 3er arg).
  async post<T = unknown>(endpoint: string, data: Record<string, unknown> = {}): Promise<T> {
    const env = await this.call<Envelope<T>>(endpoint, data, false);
    return this.unwrap(endpoint, env);
  }

  // Dispatcher transfor_frontend con subcomando namespaced. Body JSON ($post con 3er arg true).
  async cmd<T = unknown>(cmd: string, data: Record<string, unknown> = { noData: "" }): Promise<T> {
    const env = await this.call<Envelope<T>>("transfor_frontend", { cmd, data }, true);
    return this.unwrap(cmd, env);
  }

  // POST a endpoint directo con body JSON (algunos endpoints lo exigen, p.ej. system_auth).
  async postJson<T = unknown>(endpoint: string, data: Record<string, unknown>): Promise<T> {
    const env = await this.call<Envelope<T>>(endpoint, data, true);
    return this.unwrap(endpoint, env);
  }

  private unwrap<T>(where: string, env: Envelope<T>): T {
    if (env.status !== 0) {
      // El router responde {status:1, data:"LOGINOUT"} cuando la sesión caducó.
      if (env.data === "LOGINOUT") {
        this.token = "";
        throw new DriverError(`Sesión del router caducada (${where})`, "AUTH", env);
      }
      throw new DriverError(`"${where}" devolvió status ${env.status}`, "PROTOCOL", env);
    }
    return (env.data ?? (env as unknown as T)) as T;
  }

  // GET genérico: params en query string (incluye token y _).
  async get<T>(endpoint: string, params: Record<string, unknown> = {}): Promise<T> {
    const q = new URLSearchParams({
      _: String(Date.now()),
      token: this.token,
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    });
    const url = `${this.base}${endpoint}?${q.toString()}`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch (err) {
      throw new DriverError(`No se pudo contactar al router (${endpoint})`, "UNREACHABLE", err);
    }
    if (!res.ok) throw new DriverError(`HTTP ${res.status} en ${endpoint}`, "PROTOCOL");
    return (await res.json()) as T;
  }

  async getData<T>(endpoint: string, params: Record<string, unknown> = {}): Promise<T> {
    const env = await this.get<Envelope<T>>(endpoint, params);
    return this.unwrap(endpoint, env);
  }

  private async call<T>(endpoint: string, data: Record<string, unknown>, json: boolean): Promise<T> {
    const url = `${this.base}${endpoint}?token=${encodeURIComponent(this.token)}`;
    const payload = { _: Date.now(), ...data };
    const headers = { "content-type": json ? "application/json" : "application/x-www-form-urlencoded" };
    const body = json ? JSON.stringify(payload) : encodeForm(payload);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body,
      });
    } catch (err) {
      throw new DriverError(`No se pudo contactar al router (${endpoint})`, "UNREACHABLE", err);
    }
    if (!res.ok) {
      throw new DriverError(`HTTP ${res.status} en ${endpoint}`, "PROTOCOL");
    }
    return (await res.json()) as T;
  }
}
