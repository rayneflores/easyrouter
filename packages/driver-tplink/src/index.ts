import { registerDriver } from "@ryfsystems/core";
import { createTpLinkDriver } from "./driver.js";
import { probeBrand } from "./transport.js";

export { TpLinkFamilyDriver, createTpLinkDriver } from "./driver.js";
export { TpLinkClient, probeBrand } from "./transport.js";

registerDriver(
  "tplink",
  (creds) => createTpLinkDriver("tplink", creds),
  (url) => probeBrand(url, ["tp-link", "tplink", "archer", "deco"], ["mercusys"]),
  { brand: "TP-Link", label: "TP-Link (web)" },
);

registerDriver(
  "mercusys",
  (creds) => createTpLinkDriver("mercusys", creds),
  (url) => probeBrand(url, ["mercusys"]),
  { brand: "Mercusys", label: "Mercusys (web)" },
);
