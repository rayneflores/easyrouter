import { useState } from "react";
import { api } from "../api.js";

export function ChangePasswordCard({ onError }: { onError: (msg: string) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);

  const valid = current && next && next === confirm;

  const submit = async () => {
    if (next !== confirm) { onError("La confirmación no coincide"); return; }
    setBusy(true);
    setOk(false);
    try {
      await api.changeAdminPassword(current, next);
      setCurrent(""); setNext(""); setConfirm(""); setOk(true);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>🔑 Cambiar contraseña de admin</h2>
      <div className="form">
        <label>Contraseña actual
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label>Nueva contraseña
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <label>Repetir nueva
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {ok && <div className="ac-hint" style={{ color: "var(--ok)" }}>Contraseña cambiada. Úsala en el próximo inicio de sesión.</div>}
        <p className="ac-hint">Cambia la clave del router y la del acceso a EasyRouter (quedan sincronizadas).</p>
        <div className="form-actions">
          <button onClick={() => void submit()} disabled={!valid || busy}>{busy ? "Guardando…" : "Cambiar contraseña"}</button>
        </div>
      </div>
    </section>
  );
}
