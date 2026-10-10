import { useEffect, useState } from "react";
import type { ClientDevice, Qos, QosRule } from "@ryfsystems/core";
import { api } from "../api.js";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fmtLimit = (kbps: number) => (kbps > 0 ? `${kbps} kb/s` : "sin límite");

export function QosCard({ clients, onError }: { clients?: ClientDevice[]; onError: (msg: string) => void }) {
  const [qos, setQos] = useState<Qos>();
  const [mac, setMac] = useState("");
  const [up, setUp] = useState("0");
  const [down, setDown] = useState("0");
  const [busy, setBusy] = useState(false);

  const load = () => api.qos().then(setQos).catch((e) => onError(msg(e)));
  useEffect(() => { void load(); }, []);

  const wrap = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await load(); } catch (e) { onError(msg(e)); } finally { setBusy(false); }
  };

  const clientOf = (m: string) => clients?.find((c) => c.mac.toLowerCase() === m.trim().toLowerCase());

  const edit = (r: QosRule) => { setMac(r.mac); setUp(String(r.uploadKbps)); setDown(String(r.downloadKbps)); };

  const save = () => {
    const m = mac.trim().toLowerCase();
    const c = clientOf(m);
    const prev = qos?.rules.find((r) => r.mac === m);
    void wrap(() => api.setQosRule({
      mac: m,
      name: prev?.name ?? (c?.alias || c?.hostname || undefined),
      ip: c?.ip ?? prev?.ip,
      uploadKbps: Number(up) || 0,
      downloadKbps: Number(down) || 0,
    }));
    setMac(""); setUp("0"); setDown("0");
  };

  if (!qos) return <section className="card wide"><h2>🚦 QoS (límite de velocidad)</h2><div className="skeleton" /></section>;

  return (
    <section className="card wide">
      <h2>🚦 QoS (límite de velocidad) <span className={`badge ${qos.enabled ? "on" : "off"}`}>{qos.enabled ? "activo" : "apagado"}</span></h2>

      <label className="ac-switch">
        <input type="checkbox" checked={qos.enabled} disabled={busy}
          onChange={(e) => void wrap(() => api.setQosEnabled(e.target.checked))} />
        Activado
      </label>
      <p className="ac-hint">
        Limita la velocidad de subida y bajada de cada dispositivo (kb/s; 0 = sin límite).
        {!qos.enabled && " Los límites solo se aplican con QoS activado."}
      </p>

      <div className="pf-form">
        <input placeholder="MAC (aa:bb:cc:dd:ee:ff)" list="qos-macs" value={mac} onChange={(e) => setMac(e.target.value)} style={{ width: 200 }} />
        <datalist id="qos-macs">
          {(clients ?? []).map((c) => <option key={c.mac} value={c.mac}>{c.alias || c.hostname || c.ip || c.mac}</option>)}
        </datalist>
        <label>Subida (kb/s)<input type="number" min={0} value={up} onChange={(e) => setUp(e.target.value)} style={{ width: 110 }} /></label>
        <label>Bajada (kb/s)<input type="number" min={0} value={down} onChange={(e) => setDown(e.target.value)} style={{ width: 110 }} /></label>
        <button disabled={busy || !mac.trim()} onClick={save}>
          {qos.rules.some((r) => r.mac === mac.trim().toLowerCase()) ? "Guardar límite" : "Añadir límite"}
        </button>
      </div>

      {qos.rules.length === 0 ? (
        <p>No hay límites configurados.</p>
      ) : (
        <table>
          <thead><tr><th>Dispositivo</th><th>MAC</th><th>Subida</th><th>Bajada</th><th></th></tr></thead>
          <tbody>
            {qos.rules.map((r) => (
              <tr key={r.mac}>
                <td>{clientOf(r.mac)?.alias || r.name || clientOf(r.mac)?.hostname || "—"}</td>
                <td className="mono">{r.mac}</td>
                <td>{fmtLimit(r.uploadKbps)}</td>
                <td>{fmtLimit(r.downloadKbps)}</td>
                <td>
                  <button className="link" disabled={busy} onClick={() => edit(r)}>Editar</button>{" "}
                  <button className="link danger" disabled={busy} onClick={() => void wrap(() => api.deleteQosRule(r.mac))}>Quitar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
