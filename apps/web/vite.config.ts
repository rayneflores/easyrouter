import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

const GATEWAY = process.env.GATEWAY_URL ?? "http://localhost:8787";

// En dev, /api y /health se redirigen al gateway (evita CORS).
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    proxy: {
      "/api": { target: GATEWAY, changeOrigin: true },
      "/health": { target: GATEWAY, changeOrigin: true },
    },
  },
});
