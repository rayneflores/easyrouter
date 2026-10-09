import { useEffect, useState } from "react";
import type { EthernetConfig, EthernetProto, LanConfig, NetworkConfig } from "@ryfsystems/core";
import { api } from "../api.js";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function NetworkCards({ onError }: { onError: (msg: string) => void }) {
  const [net, setNet] = useState<NetworkConfig>();
  const load = () => api.network().then(setNet).catch((e) => onError(msg(e)));
  useEffect(() => { void load(); }, []);
  if (!net) return <section className="card"><h2>🖧 Red</h2><div className="skeleton" /></section>;
  return (
    <>
      <LanCard lan={net.lan} onError={onError} onSaved={load} />
      <EthernetCard eth={net.ethernet} onError={onError} onSaved={load} />
    </>
  );
}

function LanCard({ lan, onError, onSaved }: { lan: LanConfig; onError: (m: string) => void; onSaved: () => void }) {
  const [f, setF] = useState(lan);
  const [busy, setBusy] = useState(false);
  const up = (p: Partial<LanConfig>) => setF({ ...f, ...p });

  const save = async () => {
    const ipChanged = f.ip !== lan.ip;
    if (ipChanged && !confirm("Cambiar la IP del router te desconectará; tendrás que entrar con la nueva IP. ¿Continuar?")) return;
    setBusy(true);
    try { await api.setLan(f); onSaved(); } catch (e) { onError(msg(e)); } finally { setBusy(false); }
  };

  return (
    <section className="card">
      <h2>🖧 Red LAN</h2>
      <div className="form">
        <label>IP del router<input value={f.ip} onChange={(e) => up({ ip: e.target.value })} /></label>
        <label>Máscara<input value={f.netmask} onChange={(e) => up({ netmask: e.target.value })} /></label>
        <label className="ac-switch"><input type="checkbox" checked={f.dhcpEnabled} onChange={(e) => up({ dhcpEnabled: e.target.checked })} /> Servidor DHCP</label>
        <label>Rango DHCP desde<input value={f.dhcpStart} onChange={(e) => up({ dhcpStart: e.target.value })} disabled={!f.dhcpEnabled} /></label>
        <label>Rango DHCP hasta<input value={f.dhcpEnd} onChange={(e) => up({ dhcpEnd: e.target.value })} disabled={!f.dhcpEnabled} /></label>
        <label>Tiempo de concesión<input value={f.leaseTime} onChange={(e) => up({ leaseTime: e.target.value })} placeholder="72h" disabled={!f.dhcpEnabled} /></label>
        <p className="ac-hint">Cambiar la IP del router o el DHCP puede cortar la conexión unos segundos.</p>
        <div className="form-actions"><button onClick={() => void save()} disabled={busy}>{busy ? "Guardando…" : "Guardar LAN"}</button></div>
      </div>
    </section>
  );
}

function EthernetCard({ eth, onError, onSaved }: { eth: EthernetConfig; onError: (m: string) => void; onSaved: () => void }) {
  const [proto, setProto] = useState<EthernetProto>(eth.proto);
  const [ip, setIp] = useState(eth.ip ?? "");
  const [netmask, setNetmask] = useState(eth.netmask ?? "");
  const [gateway, setGateway] = useState(eth.gateway ?? "");
  const [dns, setDns] = useState((eth.dns ?? []).join(", "));
  const [username, setUsername] = useState(eth.username ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!confirm("Cambiar la conexión WAN puede cortar el acceso a internet. ¿Continuar?")) return;
    setBusy(true);
    try {
      await api.setEthernet({
        proto,
        ip: proto === "static" ? ip : undefined,
        netmask: proto === "static" ? netmask : undefined,
        gateway: proto === "static" ? gateway : undefined,
        dns: dns ? dns.split(",").map((s) => s.trim()).filter(Boolean) : [],
        username: proto === "pppoe" ? username : undefined,
        password: proto === "pppoe" ? password || undefined : undefined,
      });
      onSaved();
    } catch (e) { onError(msg(e)); } finally { setBusy(false); }
  };

  return (
    <section className="card">
      <h2>🔌 Ethernet (WAN)</h2>
      <div className="form">
        <label>Tipo de conexión
          <select value={proto} onChange={(e) => setProto(e.target.value as EthernetProto)}>
            <option value="dhcp">DHCP (automática)</option>
            <option value="static">IP estática</option>
            <option value="pppoe">PPPoE</option>
          </select>
        </label>
        {proto === "static" && (<>
          <label>IP<input value={ip} onChange={(e) => setIp(e.target.value)} /></label>
          <label>Máscara<input value={netmask} onChange={(e) => setNetmask(e.target.value)} /></label>
          <label>Puerta de enlace<input value={gateway} onChange={(e) => setGateway(e.target.value)} /></label>
        </>)}
        {proto === "pppoe" && (<>
          <label>Usuario<input value={username} onChange={(e) => setUsername(e.target.value)} /></label>
          <label>Contraseña<input type="password" value={password} placeholder="(sin cambios)" onChange={(e) => setPassword(e.target.value)} /></label>
        </>)}
        <label>DNS (coma)<input value={dns} onChange={(e) => setDns(e.target.value)} placeholder="1.1.1.1, 8.8.8.8" /></label>
        {eth.mac && <div className="row"><dt>MAC</dt><dd className="mono">{eth.mac}</dd></div>}
        <div className="form-actions"><button onClick={() => void save()} disabled={busy}>{busy ? "Guardando…" : "Guardar WAN"}</button></div>
      </div>
    </section>
  );
}
