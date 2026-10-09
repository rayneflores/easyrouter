import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const GATEWAY = process.env.GATEWAY_URL ?? "http://localhost:8787";

// En dev, /api y /health se redirigen al gateway (evita CORS).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: GATEWAY, changeOrigin: true },
      "/health": { target: GATEWAY, changeOrigin: true },
    },
  },
});
