import { useEffect, useState } from "react";
import type { ClientDevice, PortForwardRule } from "@ryfsystems/core";
import { api } from "../api.js";

const empty = () => ({ name: "", protocol: "tcp" as const, externalPort: "", internalIp: "", internalPort: "" });

export function PortForwardCard({
  clients,
  canWrite,
  onError,
}: {
  clients?: ClientDevice[];
  canWrite: boolean;
  onError: (msg: string) => void;
}) {
  const [rules, setRules] = useState<PortForwardRule[]>();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(empty());
  const [busy, setBusy] = useState(false);

  const load = () => api.portForwarding().then(setRules).catch((e) => onError(msg(e)));
  useEffect(() => { void load(); }, []);

  const fmtPort = (p: PortForwardRule["externalPort"]) => (Array.isArray(p) ? `${p[0]}-${p[1]}` : String(p));

  const add = async () => {
    const ext = Number(form.externalPort);
    const int = Number(form.internalPort) || ext;
    if (!ext || !form.internalIp) { onError("Completa puerto externo e IP interna"); return; }
    setBusy(true);
    try {
      await api.addPortForward({
        name: form.name || undefined,
        enabled: true,
        protocol: form.protocol,
        externalPort: ext,
        internalIp: form.internalIp,
        internalPort: int,
      });
      setForm(empty());
      setAdding(false);
      await load();
    } catch (e) {
      onError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  const del = async (rule: PortForwardRule) => {
    if (!rule.id) return;
    if (!confirm(`¿Borrar la regla ${rule.name || fmtPort(rule.externalPort)}?`)) return;
    try { await api.deletePortForward(rule.id); await load(); } catch (e) { onError(msg(e)); }
  };

  return (
    <section className="card wide">
      <h2>
        🔀 Redirección de puertos
        {rules && <span className="badge">{rules.length}</span>}
        {canWrite && !adding && (
          <button className="link" style={{ marginLeft: "auto" }} onClick={() => setAdding(true)}>+ Añadir</button>
        )}
      </h2>

      {canWrite && adding && (
        <div className="pf-form">
          <input placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value as any })}>
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
            <option value="both">TCP/UDP</option>
          </select>
          <input placeholder="Puerto externo" inputMode="numeric" value={form.externalPort}
            onChange={(e) => setForm({ ...form, externalPort: e.target.value })} />
          <input placeholder="IP interna" list="pf-ips" value={form.internalIp}
            onChange={(e) => setForm({ ...form, internalIp: e.target.value })} />
          <datalist id="pf-ips">
            {(clients ?? []).filter((c) => c.ip).map((c) => (
              <option key={c.mac} value={c.ip}>{c.hostname || c.mac}</option>
            ))}
          </datalist>
          <input placeholder="Puerto interno" inputMode="numeric" value={form.internalPort}
            onChange={(e) => setForm({ ...form, internalPort: e.target.value })} />
          <button onClick={() => void add()} disabled={busy}>{busy ? "…" : "Guardar"}</button>
          <button className="ghost" onClick={() => { setAdding(false); setForm(empty()); }}>Cancelar</button>
        </div>
      )}

      {!rules ? (
        <div className="skeleton" />
      ) : rules.length === 0 ? (
        <p>No hay reglas.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Nombre</th><th>Protocolo</th><th>Externo</th><th>IP interna</th><th>Interno</th><th></th></tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id ?? `${r.externalPort}`} className={r.enabled ? "" : "offline"}>
                <td>{r.name || "—"}</td>
                <td>{r.protocol === "both" ? "TCP/UDP" : r.protocol.toUpperCase()}</td>
                <td>{fmtPort(r.externalPort)}</td>
                <td>{r.internalIp}</td>
                <td>{fmtPort(r.internalPort)}</td>
                <td>{canWrite && r.id && <button className="link danger" onClick={() => void del(r)}>Borrar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
