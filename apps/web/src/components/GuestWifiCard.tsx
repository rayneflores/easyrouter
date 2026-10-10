import { useEffect, useState } from "react";
import type { GuestWifi } from "@ryfsystems/core";
import { api } from "../api.js";

const BAND_LABEL: Record<string, string> = { "2.4g": "👥 Invitados 2.4 GHz", "5g": "👥 Invitados 5 GHz", dual: "👥 Invitados" };

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function GuestWifiCards({ onError }: { onError: (msg: string) => void }) {
  const [guest, setGuest] = useState<GuestWifi[]>();

  const load = () => api.guestWifi().then(setGuest).catch((e) => onError(msg(e)));
  useEffect(() => { void load(); }, []);

  if (!guest) return <section className="card"><h2>👥 Red de invitados</h2><div className="skeleton" /></section>;
  return <>{guest.map((g) => <GuestWifiCard key={g.band} guest={g} onSaved={() => void load()} onError={onError} />)}</>;
}

function GuestWifiCard({ guest, onSaved, onError }: { guest: GuestWifi; onSaved: () => void; onError: (msg: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [enabled, setEnabled] = useState(guest.enabled);
  const [ssid, setSsid] = useState(guest.ssid);
  const [password, setPassword] = useState("");
  const [hidden, setHidden] = useState(Boolean(guest.hidden));
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setEnabled(guest.enabled);
    setSsid(guest.ssid);
    setPassword("");
    setHidden(Boolean(guest.hidden));
    setEditing(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.setGuestWifi({
        band: guest.band,
        enabled: enabled !== guest.enabled ? enabled : undefined,
        ssid: ssid !== guest.ssid ? ssid : undefined,
        password: password || undefined,
        hidden: hidden !== Boolean(guest.hidden) ? hidden : undefined,
      });
      setEditing(false);
      setPassword("");
      onSaved();
    } catch (e) {
      onError(msg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card">
      <h2>
        {BAND_LABEL[guest.band] ?? guest.band}
        <span className={`badge ${guest.enabled ? "on" : "off"}`}>{guest.enabled ? "activa" : "apagada"}</span>
      </h2>
      <p className="ac-hint">Red separada para visitas: tienen Internet pero no ven los dispositivos de la red principal.</p>

      {editing ? (
        <div className="form">
          <label className="ac-switch">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Activada
          </label>
          <label>SSID<input value={ssid} onChange={(e) => setSsid(e.target.value)} /></label>
          <label>
            Contraseña
            <input type="password" value={password} placeholder="(sin cambios)" onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="ac-switch">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Ocultar red (no anunciar el SSID)
          </label>
          <div className="form-actions">
            <button onClick={() => void save()} disabled={saving || !ssid}>{saving ? "Guardando…" : "Guardar"}</button>
            <button className="ghost" onClick={reset}>Cancelar</button>
          </div>
        </div>
      ) : (
        <dl>
          <div className="row"><dt>SSID</dt><dd>{guest.ssid || "—"}</dd></div>
          <div className="row"><dt>Seguridad</dt><dd>{guest.security ?? "—"}</dd></div>
          <div className="row"><dt>Oculta</dt><dd>{guest.hidden ? "sí" : "no"}</dd></div>
          <button className="link" onClick={() => setEditing(true)}>Editar</button>
        </dl>
      )}
    </section>
  );
}
