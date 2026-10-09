import { registerDriver } from "@ryfsystems/core";
import { createSimWifi6Driver } from "./driver.js";
import { probeSimWifi6 } from "./transport.js";

export { SimWifi6Driver, createSimWifi6Driver } from "./driver.js";
export { SimWifiTransport, md5, probeSimWifi6 } from "./transport.js";

registerDriver("simwifi6", createSimWifi6Driver, probeSimWifi6, {
  brand: "OLAX / SIM WiFi6",
  label: "SIM WiFi6 Router",
});
