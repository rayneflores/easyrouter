import { useEffect, useState } from "react";
import type { ClientDevice, DeviceType } from "@ryfsystems/core";
import { api } from "../api.js";
import { TYPE_META } from "../deviceTypes.js";

export function ClientsCard({
  clients,
  onChanged,
  onError,
}: {
  clients?: ClientDevice[];
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const [types, setTypes] = useState<DeviceType[]>([]);
  const [editingType, setEditingType] = useState<string>();
  const [editingAlias, setEditingAlias] = useState<string>();
  const [aliasDraft, setAliasDraft] = useState("");

  useEffect(() => {
    api.deviceTypes().then((r) => setTypes(r.types)).catch(() => {});
  }, []);

  const wrap = (fn: () => Promise<void>) => async () => {
    try { await fn(); onChanged(); } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const changeType = (mac: string, type: DeviceType) => {
    setEditingType(undefined);
    void wrap(() => api.setClientType(mac, type))();
  };

  const saveAlias = (mac: string) => {
    setEditingAlias(undefined);
    void wrap(() => api.setClientAlias(mac, aliasDraft))();
  };

  const startAlias = (c: ClientDevice) => {
    setAliasDraft(c.alias ?? "");
    setEditingAlias(c.mac);
  };

  return (
    <section className="card wide">
      <h2>
        💻 Dispositivos conectados
        {clients && <span className="badge">{clients.filter((c) => c.online).length}</span>}
      </h2>
      {!clients ? (
        <div className="skeleton" />
      ) : clients.length === 0 ? (
        <p>Ninguno.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Tipo</th><th>Nombre</th><th>IP</th><th>MAC</th><th>Conexión</th></tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.mac} className={c.online ? "" : "offline"}>
                <td>
                  {editingType === c.mac ? (
                    <select
                      autoFocus
                      value={c.type}
                      onChange={(e) => changeType(c.mac, e.target.value as DeviceType)}
                      onBlur={() => setEditingType(undefined)}
                    >
                      {types.map((t) => (
                        <option key={t} value={t}>{TYPE_META[t].icon} {TYPE_META[t].label}</option>
                      ))}
                    </select>
                  ) : (
                    <button className="typebtn" title="Cambiar tipo" onClick={() => setEditingType(c.mac)}>
                      <span className="ticon">{TYPE_META[c.type].icon}</span> {TYPE_META[c.type].label}
                    </button>
                  )}
                </td>
                <td>
                  {editingAlias === c.mac ? (
                    <input
                      autoFocus
                      className="aliasinput"
                      value={aliasDraft}
                      placeholder={c.hostname || c.mac}
                      maxLength={64}
                      onChange={(e) => setAliasDraft(e.target.value)}
                      onBlur={() => saveAlias(c.mac)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveAlias(c.mac);
                        if (e.key === "Escape") setEditingAlias(undefined);
                      }}
                    />
                  ) : (
                    <button className="aliasbtn" title="Poner un nombre" onClick={() => startAlias(c)}>
                      {c.alias ? (
                        <strong>{c.alias}</strong>
                      ) : (
                        <span className="muted">{c.hostname || "—"}</span>
                      )}
                      <span className="pencil">✎</span>
                    </button>
                  )}
                </td>
                <td>{c.ip || "—"}</td>
                <td className="mono">{c.mac}</td>
                <td>{c.connection === "wifi" ? `WiFi ${c.band ?? ""}`.trim() : "Ethernet"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
