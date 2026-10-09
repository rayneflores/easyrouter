import { useState } from "react";
import type { WifiNetwork } from "@ryfsystems/core";
import { api } from "../api.js";

const BAND_LABEL: Record<string, string> = { "2.4g": "📶 WiFi 2.4 GHz", "5g": "📶 WiFi 5 GHz", dual: "📶 WiFi (dual)" };

export function WifiCard({
  wifi,
  onSaved,
  onError,
}: {
  wifi: WifiNetwork;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [ssid, setSsid] = useState(wifi.ssid);
  const [password, setPassword] = useState("");
  const [channel, setChannel] = useState<string>(String(wifi.channel ?? "auto"));
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setSsid(wifi.ssid);
    setPassword("");
    setChannel(String(wifi.channel ?? "auto"));
    setEditing(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const curChannel = String(wifi.channel ?? "auto");
      await api.setWifi({
        band: wifi.band,
        ssid: ssid !== wifi.ssid ? ssid : undefined,
        password: password || undefined,
        channel: channel !== curChannel ? (channel === "auto" ? "auto" : Number(channel)) : undefined,
      });
      setEditing(false);
      setPassword("");
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card">
      <h2>
        {BAND_LABEL[wifi.band] ?? wifi.band}
        <span className={`badge ${wifi.enabled ? "on" : "off"}`}>
          {wifi.enabled ? "activa" : "apagada"}
        </span>
      </h2>

      {editing ? (
        <div className="form">
          <label>SSID<input value={ssid} onChange={(e) => setSsid(e.target.value)} /></label>
          <label>
            Contraseña
            <input
              type="password"
              value={password}
              placeholder="(sin cambios)"
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            Canal
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="auto">Automático</option>
              {(wifi.channels ?? []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            <button onClick={() => void save()} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button className="ghost" onClick={reset}>Cancelar</button>
          </div>
        </div>
      ) : (
        <dl>
          <div className="row"><dt>SSID</dt><dd>{wifi.ssid || "—"}</dd></div>
          <div className="row"><dt>Canal</dt><dd>{wifi.channel === "auto" || wifi.channel == null ? "Automático" : wifi.channel}</dd></div>
          {wifi.bandwidth && <div className="row"><dt>Ancho</dt><dd>{wifi.bandwidth}</dd></div>}
          <div className="row"><dt>Seguridad</dt><dd>{wifi.security ?? "—"}</dd></div>
          <div className="row"><dt>Oculta</dt><dd>{wifi.hidden ? "sí" : "no"}</dd></div>
          <button className="link" onClick={() => setEditing(true)}>Editar</button>
        </dl>
      )}
    </section>
  );
}
