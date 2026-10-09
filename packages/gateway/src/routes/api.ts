import type { FastifyInstance } from "fastify";
import { DEVICE_TYPES, type AccessMode, type EthernetConfig, type LanConfig, type WifiUpdate, type PortForwardRule } from "@ryfsystems/core";
import type { RouterSession } from "../session.js";
import { DeviceMetaStore, isDeviceType } from "../deviceMeta.js";

export function registerApiRoutes(
  app: FastifyInstance,
  session: RouterSession,
  deviceMeta: DeviceMetaStore,
): void {
  app.get("/api/capabilities", async () => ({ capabilities: session.capabilities() }));

  app.get("/api/device-types", async () => ({ types: DEVICE_TYPES }));

  app.get("/api/device", () => session.run((d) => d.getDeviceInfo()));
  app.get("/api/wan", () => session.run((d) => d.getWan()));

  app.get("/api/wifi", () => session.run((d) => d.getWifi()));
  app.put<{ Body: WifiUpdate }>("/api/wifi", async (req, reply) => {
    await session.run((d) => d.setWifi(req.body));
    return reply.code(204).send();
  });

  app.get("/api/clients", async () => {
    const clients = await session.run((d) => d.listClients());
    // Aplica tipo y alias asignados por el usuario sobre lo auto-detectado.
    return clients.map((c) => {
      const m = deviceMeta.get(c.mac);
      return { ...c, type: m.type ?? c.type, alias: m.alias };
    });
  });

  app.put<{ Params: { mac: string }; Body: { type?: string } }>(
    "/api/clients/:mac/type",
    async (req, reply) => {
      const type = req.body?.type;
      if (!isDeviceType(type)) return reply.code(400).send({ error: "invalid_type" });
      deviceMeta.setType(req.params.mac, type);
      return reply.code(204).send();
    },
  );

  app.put<{ Params: { mac: string }; Body: { alias?: string } }>(
    "/api/clients/:mac/alias",
    async (req, reply) => {
      const alias = req.body?.alias;
      if (typeof alias !== "string") return reply.code(400).send({ error: "invalid_alias" });
      if (alias.length > 64) return reply.code(400).send({ error: "alias_too_long" });
      deviceMeta.setAlias(req.params.mac, alias);
      return reply.code(204).send();
    },
  );

  app.post("/api/reboot", async (_req, reply) => {
    await session.run((d) => d.reboot());
    return reply.code(202).send({ rebooting: true });
  });

  app.post("/api/factory-reset", async (_req, reply) => {
    await session.run((d) => d.factoryReset());
    return reply.code(202).send({ resetting: true });
  });

  app.get("/api/port-forwarding", () => session.run((d) => d.getPortForwarding()));
  app.post<{ Body: PortForwardRule }>("/api/port-forwarding", async (req, reply) => {
    await session.run((d) => d.addPortForward(req.body));
    return reply.code(201).send();
  });
  app.delete<{ Params: { id: string } }>("/api/port-forwarding/:id", async (req, reply) => {
    await session.run((d) => d.deletePortForward(req.params.id));
    return reply.code(204).send();
  });

  // Control de acceso por MAC (lista negra/blanca)
  app.get("/api/access-control", () => session.run((d) => d.getAccessControl()));

  app.put<{ Body: { enabled: boolean; mode: AccessMode } }>("/api/access-control", async (req, reply) => {
    const { enabled, mode } = req.body ?? {};
    if (typeof enabled !== "boolean" || (mode !== "black" && mode !== "white")) {
      return reply.code(400).send({ error: "invalid_body" });
    }
    await session.run((d) => d.setAccessMode(enabled, mode));
    return reply.code(204).send();
  });

  app.post<{ Params: { list: string }; Body: { mac?: string; name?: string } }>(
    "/api/access-control/:list",
    async (req, reply) => {
      const list = req.params.list;
      const mac = req.body?.mac;
      if (list !== "black" && list !== "white") return reply.code(400).send({ error: "invalid_list" });
      if (!mac) return reply.code(400).send({ error: "missing_mac" });
      await session.run((d) => d.addAccessEntry(list, mac, req.body?.name));
      return reply.code(201).send();
    },
  );

  app.delete<{ Params: { list: string; mac: string } }>(
    "/api/access-control/:list/:mac",
    async (req, reply) => {
      const list = req.params.list;
      if (list !== "black" && list !== "white") return reply.code(400).send({ error: "invalid_list" });
      await session.run((d) => d.removeAccessEntry(list, decodeURIComponent(req.params.mac)));
      return reply.code(204).send();
    },
  );

  // Red (LAN + Ethernet/WAN)
  app.get("/api/network", () => session.run((d) => d.getNetwork()));
  app.put<{ Body: LanConfig }>("/api/network/lan", async (req, reply) => {
    await session.run((d) => d.setLan(req.body));
    return reply.code(204).send();
  });
  app.put<{ Body: EthernetConfig & { password?: string } }>("/api/network/ethernet", async (req, reply) => {
    await session.run((d) => d.setEthernet(req.body));
    return reply.code(204).send();
  });

  // DMZ
  app.get("/api/dmz", () => session.run((d) => d.getDmz()));
  app.put<{ Body: { enabled: boolean; destIp?: string } }>("/api/dmz", async (req, reply) => {
    const { enabled, destIp = "" } = req.body ?? {};
    if (typeof enabled !== "boolean") return reply.code(400).send({ error: "invalid_body" });
    if (enabled && !destIp) return reply.code(400).send({ error: "missing_dest_ip" });
    await session.run((d) => d.setDmz(enabled, destIp));
    return reply.code(204).send();
  });
}
