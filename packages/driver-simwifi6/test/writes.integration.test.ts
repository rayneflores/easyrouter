// Pruebas de ESCRITURA contra el router real. NO se ejecutan por defecto.
// Gate: solo corren con RUN_WRITE_TESTS=1. Cada test revierte lo que cambia.
//
// Ejecutar (cuando se decida):
//   npm run build
//   RUN_WRITE_TESTS=1 node --env-file=../../.env --experimental-strip-types \
//     --test packages/driver-simwifi6/test/writes.integration.test.ts
//
// reboot NO se ejecuta nunca salvo RUN_REBOOT_TEST=1 (reinicia el equipo).

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createDriver, type RouterDriver, type WifiBand } from "@ryfsystems/core";
import "@ryfsystems/driver-simwifi6"; // registra el driver

const WRITE = process.env.RUN_WRITE_TESTS === "1";
const REBOOT = process.env.RUN_REBOOT_TEST === "1";

function driverFromEnv(): RouterDriver {
  return createDriver(process.env.ROUTER_DRIVER ?? "simwifi6", {
    baseUrl: process.env.ROUTER_BASE_URL ?? "http://192.168.5.1",
    username: process.env.ROUTER_USERNAME ?? "",
    password: process.env.ROUTER_PASSWORD ?? "",
    insecureTls: process.env.ROUTER_INSECURE_TLS === "1",
  });
}

describe("writes (integration, router real)", { skip: !WRITE && "RUN_WRITE_TESTS!=1" }, () => {
  let d: RouterDriver;

  before(async () => {
    d = driverFromEnv();
    await d.login();
  });

  after(async () => {
    await d.logout().catch(() => {});
  });

  it("setWifi: cambia el SSID 2.4G y lo revierte", async () => {
    const band: WifiBand = "2.4g";
    const before = (await d.getWifi()).find((w) => w.band === band);
    assert.ok(before, "no se obtuvo la red 2.4G");
    const original = before.ssid;
    const probe = `${original}-ERTEST`;

    try {
      await d.setWifi({ band, ssid: probe });
      const after = (await d.getWifi()).find((w) => w.band === band);
      assert.equal(after?.ssid, probe, "el SSID no se aplicó");
    } finally {
      await d.setWifi({ band, ssid: original });
      const reverted = (await d.getWifi()).find((w) => w.band === band);
      assert.equal(reverted?.ssid, original, "no se pudo revertir el SSID");
    }
  });

  it("setWifi: alterna 'hidden' y lo revierte", async () => {
    const band: WifiBand = "2.4g";
    const before = (await d.getWifi()).find((w) => w.band === band);
    assert.ok(before);
    const original = before.hidden ?? false;
    try {
      await d.setWifi({ band, hidden: !original });
      const after = (await d.getWifi()).find((w) => w.band === band);
      assert.equal(after?.hidden, !original);
    } finally {
      await d.setWifi({ band, hidden: original });
    }
  });

  it("addPortForward/deletePortForward: añade una regla y la borra", async () => {
    const rule = {
      name: "ERTEST",
      enabled: true,
      protocol: "tcp" as const,
      externalPort: 59999,
      internalIp: "192.168.5.250",
      internalPort: 59999,
    };
    let created;
    try {
      await d.addPortForward(rule);
      const after = await d.getPortForwarding();
      created = after.find((r) => r.name === "ERTEST");
      assert.ok(created, "la regla no se creó");
    } finally {
      if (created?.id) await d.deletePortForward(created.id);
    }
    const final = await d.getPortForwarding();
    assert.ok(!final.some((r) => r.name === "ERTEST"), "la regla no se borró");
  });
});

describe("reboot (integration)", { skip: !REBOOT && "RUN_REBOOT_TEST!=1" }, () => {
  it("reboot: reinicia el router", async () => {
    const d = driverFromEnv();
    await d.login();
    await d.reboot();
    // Sin assert de estado: el equipo se reinicia y la sesión cae.
  });
});
