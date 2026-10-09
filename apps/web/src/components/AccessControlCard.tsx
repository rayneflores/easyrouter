import { useEffect, useState } from "react";
import type { AccessControl, AccessMode, ClientDevice } from "@ryfsystems/core";
import { api } from "../api.js";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function AccessControlCard({
  clients,
  onError,
}: {
  clients?: ClientDevice[];
  onError: (msg: string) => void;
}) {
  const [ac, setAc] = useState<AccessControl>();
  const [mac, setMac] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.accessControl().then(setAc).catch((e) => onError(msg(e)));
  useEffect(() => { void load(); }, []);

  const wrap = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await load(); } catch (e) { onError(msg(e)); } finally { setBusy(false); }
  };

  if (!ac) return <section className="card wide"><h2>🛡️ Control de acceso (MAC)</h2><div className="skeleton" /></section>;

  const list = ac[ac.mode];
  const nameOf = (m: string) => clients?.find((c) => c.mac.toLowerCase() === m.toLowerCase());

  return (
    <section className="card wide">
      <h2>🛡️ Control de acceso (filtrado MAC)</h2>

      <div className="ac-controls">
        <label className="ac-switch">
          <input type="checkbox" checked={ac.enabled}
            onChange={(e) => void wrap(() => api.setAccessMode(e.target.checked, ac.mode))} disabled={busy} />
          Activado
        </label>
        <select value={ac.mode} disabled={busy}
          onChange={(e) => void wrap(() => api.setAccessMode(ac.enabled, e.target.value as AccessMode))}>
          <option value="black">Lista negra — bloquear los de la lista</option>
          <option value="white">Lista blanca — permitir solo los de la lista</option>
        </select>
      </div>
      <p className="ac-hint">
        {ac.enabled
          ? ac.mode === "black"
            ? "Los dispositivos de la lista NO pueden conectarse."
            : "Solo los dispositivos de la lista pueden conectarse."
          : "Filtrado desactivado — todos los dispositivos pueden conectarse."}
      </p>

      <div className="pf-form">
        <input placeholder="MAC (aa:bb:cc:dd:ee:ff)" list="ac-macs" value={mac} onChange={(e) => setMac(e.target.value)} style={{ width: 200 }} />
        <datalist id="ac-macs">
          {(clients ?? []).map((c) => <option key={c.mac} value={c.mac}>{c.hostname || c.ip || c.mac}</option>)}
        </datalist>
        <input placeholder="Nombre (opcional)" value={name} onChange={(e) => setName(e.target.value)} />
        <button disabled={busy || !mac} onClick={() => {
          const m = mac.trim(); if (!m) return;
          void wrap(() => api.addAccessEntry(ac.mode, m, name.trim() || nameOf(m)?.hostname || undefined));
          setMac(""); setName("");
        }}>Añadir a {ac.mode === "black" ? "lista negra" : "lista blanca"}</button>
      </div>

      {list.length === 0 ? (
        <p>La {ac.mode === "black" ? "lista negra" : "lista blanca"} está vacía.</p>
      ) : (
        <table>
          <thead><tr><th>Nombre</th><th>MAC</th><th></th></tr></thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.mac}>
                <td>{e.name || nameOf(e.mac)?.hostname || "—"}</td>
                <td className="mono">{e.mac}</td>
                <td><button className="link danger" disabled={busy}
                  onClick={() => void wrap(() => api.removeAccessEntry(ac.mode, e.mac))}>Quitar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
