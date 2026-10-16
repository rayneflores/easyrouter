import { useCallback, useEffect, useState } from "react";
import type { Capability, ClientDevice, DeviceInfo, WanStatus, WifiNetwork } from "@ryfsystems/core";
import { api, ApiError, detectDirect, getBase, getMode, getToken, login, logout, routerInfo, setBase, setMode, type RouterInfo } from "./api.js";
import { getCreds, type Mode } from "./session.js";
import { WifiCard } from "./components/WifiCard.js";
import { ClientsCard } from "./components/ClientsCard.js";
import { PortForwardCard } from "./components/PortForwardCard.js";
import { AccessControlCard } from "./components/AccessControlCard.js";
import { ChangePasswordCard } from "./components/ChangePasswordCard.js";
import { DmzCard } from "./components/DmzCard.js";
import { GuestWifiCards } from "./components/GuestWifiCard.js";
import { QosCard } from "./components/QosCard.js";
import { UpdateBanner } from "./components/UpdateBanner.js";
import { NetworkCards } from "./components/NetworkCard.js";
import { applyTheme, getTheme, type Theme } from "./theme.js";
import { fmtBytes, fmtUptime } from "./format.js";

function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const next: Record<Theme, Theme> = { auto: "light", light: "dark", dark: "auto" };
  const icon: Record<Theme, string> = { auto: "🖥️", light: "☀️", dark: "🌙" };
  const label: Record<Theme, string> = { auto: "Automático", light: "Claro", dark: "Oscuro" };
  const cycle = () => { const n = next[theme]; applyTheme(n); setThemeState(n); };
  return (
    <button className="ghost" title={`Tema: ${label[theme]} (clic para cambiar)`} onClick={cycle} aria-label="Cambiar tema">
      {icon[theme]}
    </button>
  );
}

// En el shell nativo (Capacitor) no hay proxy: la URL del gateway es obligatoria.
const isNative = typeof (globalThis as any).Capacitor?.isNativePlatform === "function"
  && (globalThis as any).Capacitor.isNativePlatform();

const normalizeUrl = (u: string): string => {
  const s = u.trim();
  if (!s) return "";
  return /^https?:\/\//.test(s) ? s.replace(/\/+$/, "") : "http://" + s.replace(/\/+$/, "");
};

export function App() {
  const hasSession = getMode() === "direct" ? Boolean(getCreds()) : Boolean(getToken());
  const [state, setState] = useState<"checking" | "login" | "in">(hasSession ? "checking" : "login");

  // La sesión guardada puede no valer (el gateway guarda las sesiones en memoria y se pierden
  // al reiniciarlo): se comprueba antes de mostrar el panel y, si falla, se va al login.
  useEffect(() => {
    if (state !== "checking") return;
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000));
    Promise.race([api.capabilities(), timeout])
      .then(() => setState("in"))
      .catch(() => { void logout(); setState("login"); });
  }, []);

  return (
    <>
      {isNative && <UpdateBanner />}
      {state === "checking" && <div className="setup-wrap"><p className="checking">Conectando…</p></div>}
      {state === "login" && <Login onDone={() => setState("in")} />}
      {state === "in" && <Dashboard onLogout={() => { void logout(); setState("login"); }} />}
    </>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [mode, setModeState] = useState<Mode>(getMode());
  const [url, setUrl] = useState(getBase());
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [router, setRouter] = useState<RouterInfo>();

  const base = normalizeUrl(url);
  const urlOk = mode === "direct" ? Boolean(base) : (!isNative || Boolean(base));

  // Muestra el router detectado antes de entrar (gateway: pregunta al gateway; directo: sondea el router).
  useEffect(() => {
    let live = true;
    setRouter(undefined);
    if (!urlOk) return;
    setBase(base);
    setMode(mode);
    if (mode === "gateway") {
      routerInfo().then((r) => live && setRouter(r)).catch(() => live && setRouter(undefined));
    } else {
      detectDirect(base)
        .then((d) => live && setRouter(d ? { baseUrl: base, brand: d.brand, label: d.label, driver: d.driver, detected: true } : { baseUrl: base, detected: false }))
        .catch(() => live && setRouter({ baseUrl: base, detected: false }));
    }
    return () => { live = false; };
  }, [url, mode]);

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setMode(mode);
      setBase(base);
      await login(username.trim(), password);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="setup-wrap">
    <div className="setup">
      <div className="setup-top">
        <h1>EasyRouter</h1>
        <ThemeToggle />
      </div>

      <div className="segmented">
        <button className={mode === "gateway" ? "active" : ""} onClick={() => setModeState("gateway")}>Vía gateway</button>
        <button className={mode === "direct" ? "active" : ""} onClick={() => setModeState("direct")}>Directo al router</button>
      </div>

      <label>
        {mode === "direct" ? "IP o URL del router" : `URL del gateway${isNative ? "" : " (opcional)"}`}
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={mode === "direct" ? "192.168.1.1" : "http://192.168.5.183:8787"}
        />
      </label>

      <div className={`router-badge ${router?.detected ? "ok" : ""}`}>
        {router ? <RouterLabel router={router} /> : (urlOk ? "Buscando router…" : "Indica la dirección")}
      </div>

      <p>Entra con las credenciales de administrador del router.</p>
      <label>
        Usuario
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
      </label>
      <label>
        Contraseña
        <input
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && password && urlOk) void submit(); }}
        />
      </label>
      {error && <div className="error">{error}</div>}
      <button disabled={!password || !urlOk || busy} onClick={() => void submit()}>
        {busy ? "Entrando…" : "Entrar"}
      </button>
      {mode === "direct" && (
        <p className="ac-hint">Modo directo: la app habla con el router de esta red (sin gateway). En navegador puede fallar por CORS; en la app nativa funciona.</p>
      )}
      <div className="credit">Desarrollado por Ing. Rayne Flores · ryfsystems</div>
    </div>
    </div>
  );
}

function RouterLabel({ router }: { router: RouterInfo }) {
  const name = [router.brand, router.model].filter(Boolean).join(" ") || router.label;
  return (
    <>
      <span className="router-head" title={name}>
        {router.detected ? "Router detectado" : "Router configurado"}
        {name ? <>: <strong>{name}</strong></> : null}
      </span>
      <div className="router-ip">{router.baseUrl}</div>
    </>
  );
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [device, setDevice] = useState<DeviceInfo>();
  const [wan, setWan] = useState<WanStatus>();
  const [wifi, setWifi] = useState<WifiNetwork[]>();
  const [clients, setClients] = useState<ClientDevice[]>();
  const [caps, setCaps] = useState<Capability[]>([]);
  const [tab, setTab] = useState("estado");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [d, w, wi, c, cap] = await Promise.all([
        api.device(), api.wan(), api.wifi(), api.clients(), api.capabilities(),
      ]);
      setDevice(d); setWan(w); setWifi(wi); setClients(c); setCaps(cap.capabilities);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return onLogout();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => { void load(); }, [load]);

  const reboot = async () => {
    if (!confirm("¿Reiniciar el router? Perderás la conexión unos minutos.")) return;
    try { await api.reboot(); alert("Reiniciando…"); } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const factoryReset = async () => {
    if (!confirm("⚠️ RESTAURAR DE FÁBRICA borra TODA la configuración del router (WiFi, contraseña, reglas). ¿Continuar?")) return;
    if (!confirm("Esto te desconectará y tendrás que reconfigurar el router desde cero. ¿Seguro?")) return;
    try { await api.factoryReset(); alert("Restaurando a valores de fábrica… el router se reiniciará."); } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="app">
      <header>
        <h1>EasyRouter</h1>
        <div className="actions">
          <ThemeToggle />
          <button onClick={() => void load()} disabled={loading}>
            {loading ? "…" : <>🔄<span className="btn-label"> Actualizar</span></>}
          </button>
          <button className="ghost" onClick={onLogout} aria-label="Salir">🚪<span className="btn-label"> Salir</span></button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <nav className="tabs">
        {TABS.filter((t) => !t.cap || caps.includes(t.cap)).map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "estado" && (
        <div className="grid">
          <section className="card">
            <h2>🖥️ Dispositivo</h2>
            {device ? (
              <dl>
                <Row k="Modelo" v={device.model} />
                <Row k="Firmware" v={device.firmware} />
                <Row k="MAC" v={device.mac} />
                <Row k="Uptime" v={fmtUptime(device.uptimeSeconds)} />
                {device.memory && (
                  <Row k="Memoria" v={`${fmtBytes(device.memory.used)} / ${fmtBytes(device.memory.total)}`} />
                )}
              </dl>
            ) : <Skeleton />}
          </section>

          <section className="card">
            <h2>🌐 Internet (WAN)</h2>
            {wan ? (
              <dl>
                <Row k="Estado" v={wan.connected ? "Conectado" : "Sin conexión"} />
                <Row k="Tipo" v={`${wan.type ?? "?"}${wan.proto ? ` (${wan.proto})` : ""}`} />
                <Row k="IP" v={wan.ip} />
                <Row k="Gateway" v={wan.gateway} />
                <Row k="DNS" v={wan.dns?.join(", ")} />
                <Row k="Tráfico" v={`↓ ${fmtBytes(wan.rxBytes)}  ↑ ${fmtBytes(wan.txBytes)}`} />
              </dl>
            ) : <Skeleton />}
          </section>
        </div>
      )}

      {tab === "wifi" && (
        <div className="grid">
          {wifi?.map((w) => (
            <WifiCard key={w.band} wifi={w} onSaved={() => void load()} onError={setError} />
          )) ?? <Skeleton />}
          {caps.includes("guestWifi") && <GuestWifiCards onError={setError} />}
        </div>
      )}

      {tab === "clients" && (
        <div className="grid">
          <ClientsCard clients={clients} onChanged={() => void load()} onError={setError} />
        </div>
      )}

      {tab === "network" && caps.includes("network") && (
        <div className="grid">
          <NetworkCards onError={setError} />
        </div>
      )}

      {tab === "ports" && (
        <div className="grid">
          {caps.includes("portForward.read") && (
            <PortForwardCard clients={clients} canWrite={caps.includes("portForward.write")} onError={setError} />
          )}
          {caps.includes("dmz") && <DmzCard clients={clients} onError={setError} />}
        </div>
      )}

      {tab === "access" && caps.includes("accessControl") && (
        <div className="grid">
          <AccessControlCard clients={clients} onError={setError} />
        </div>
      )}

      {tab === "qos" && caps.includes("qos") && (
        <div className="grid">
          <QosCard clients={clients} onError={setError} />
        </div>
      )}

      {tab === "admin" && (
        <div className="grid">
          <section className="card">
            <h2>ℹ️ Sistema</h2>
            {device ? (
              <dl>
                <Row k="Modelo" v={device.model} />
                <Row k="Firmware" v={device.firmware} />
                <Row k="Uptime" v={fmtUptime(device.uptimeSeconds)} />
              </dl>
            ) : <Skeleton />}
          </section>

          <section className="card">
            <h2>🛠️ Mantenimiento</h2>
            <div className="admin-actions">
              {caps.includes("reboot") && (
                <div className="admin-row">
                  <div>
                    <strong>Reiniciar router</strong>
                    <p className="ac-hint">Reinicia el equipo. Perderás la conexión unos minutos.</p>
                  </div>
                  <button className="danger" onClick={() => void reboot()}>🔁 Reiniciar</button>
                </div>
              )}
              {caps.includes("factoryReset") && (
                <div className="admin-row">
                  <div>
                    <strong>Restaurar de fábrica</strong>
                    <p className="ac-hint">Borra toda la configuración y vuelve a los valores de fábrica.</p>
                  </div>
                  <button className="danger" onClick={() => void factoryReset()}>♻️ Restaurar</button>
                </div>
              )}
            </div>
          </section>

          {caps.includes("admin.password") && <ChangePasswordCard onError={setError} />}
        </div>
      )}
    </div>
  );
}

const TABS: { id: string; label: string; cap?: Capability }[] = [
  { id: "estado", label: "📊 Estado" },
  { id: "wifi", label: "📶 WiFi", cap: "wifi.read" },
  { id: "clients", label: "💻 Dispositivos", cap: "clients" },
  { id: "network", label: "🖧 Red", cap: "network" },
  { id: "ports", label: "🔀 Puertos / DMZ", cap: "portForward.read" },
  { id: "access", label: "🛡️ Control de acceso", cap: "accessControl" },
  { id: "qos", label: "🚦 QoS", cap: "qos" },
  { id: "admin", label: "⚙️ Administración", cap: "reboot" },
];

function Row({ k, v }: { k: string; v?: string }) {
  return (
    <div className="row">
      <dt>{k}</dt>
      <dd>{v ?? "—"}</dd>
    </div>
  );
}

function Skeleton() {
  return <div className="skeleton" />;
}
