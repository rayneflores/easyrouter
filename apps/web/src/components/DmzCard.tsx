import { useEffect, useState } from "react";
import type { ClientDevice, Dmz } from "@ryfsystems/core";
import { api } from "../api.js";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function DmzCard({ clients, onError }: { clients?: ClientDevice[]; onError: (msg: string) => void }) {
  const [dmz, setDmz] = useState<Dmz>();
  const [ip, setIp] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.dmz().then((d) => { setDmz(d); setIp(d.destIp); }).catch((e) => onError(msg(e)));
  useEffect(() => { void load(); }, []);

  const save = async (enabled: boolean) => {
    if (enabled && !ip) { onError("Indica la IP del host DMZ"); return; }
    setBusy(true);
    try { await api.setDmz(enabled, ip); await load(); } catch (e) { onError(msg(e)); } finally { setBusy(false); }
  };

  if (!dmz) return <section className="card"><h2>🚧 DMZ</h2><div className="skeleton" /></section>;

  return (
    <section className="card">
      <h2>🚧 DMZ <span className={`badge ${dmz.enabled ? "on" : "off"}`}>{dmz.enabled ? "activa" : "apagada"}</span></h2>
      <p className="ac-hint">Expone un dispositivo a todo el tráfico entrante (lo que no capturen otras reglas). Úsalo con cuidado.</p>
      <div className="form">
        <label>IP del host
          <input list="dmz-ips" value={ip} placeholder="192.168.5.x" onChange={(e) => setIp(e.target.value)} />
          <datalist id="dmz-ips">
            {(clients ?? []).filter((c) => c.ip).map((c) => <option key={c.mac} value={c.ip}>{c.hostname || c.mac}</option>)}
          </datalist>
        </label>
        <div className="form-actions">
          {dmz.enabled ? (
            <>
              <button onClick={() => void save(true)} disabled={busy}>Guardar IP</button>
              <button className="danger" onClick={() => void save(false)} disabled={busy}>Desactivar</button>
            </>
          ) : (
            <button onClick={() => void save(true)} disabled={busy || !ip}>Activar DMZ</button>
          )}
        </div>
      </div>
    </section>
  );
}
