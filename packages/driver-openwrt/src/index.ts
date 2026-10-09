import { registerDriver } from "@ryfsystems/core";
import { createOpenWrtDriver } from "./driver.js";
import { probeOpenWrt } from "./ubus.js";

export { OpenWrtDriver, createOpenWrtDriver } from "./driver.js";
export { UbusClient, probeOpenWrt } from "./ubus.js";

registerDriver("openwrt", createOpenWrtDriver, probeOpenWrt, {
  brand: "OpenWrt",
  label: "OpenWrt (ubus)",
});
