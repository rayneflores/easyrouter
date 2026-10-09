import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "es.ryfsystems.easyrouter",
  appName: "EasyRouter",
  webDir: "dist",
  // El gateway/router en la LAN es http plano: hay que permitir tráfico cleartext.
  server: {
    androidScheme: "https",
    cleartext: true,
  },
  // HTTP nativo: en modo directo la app habla con cualquier router sin que CORS/ATS lo bloqueen.
  plugins: {
    CapacitorHttp: { enabled: true },
  },
};

export default config;
