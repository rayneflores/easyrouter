import { registerDriver } from "@ryfsystems/core";
import { createDemoDriver } from "./driver.js";

export { DemoDriver, createDemoDriver } from "./driver.js";

// Sin sonda: no se autodetecta. Se selecciona con ROUTER_DRIVER=demo.
registerDriver("demo", createDemoDriver, undefined, { brand: "Demo", label: "EasyRouter Demo" });
