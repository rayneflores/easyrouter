# EasyRouter

Administración de routers desde una sola interfaz — web, escritorio, Android y iPhone (PWA).
Arquitectura **multi-driver**: añadir una marca de router es escribir un driver; la app, el gateway
y la UI no cambian.

> Desarrollado por **Ing. Rayne Flores** · **ryfsystems**

## Qué hace

- **WiFi**: SSID, contraseña y canal por banda (2.4/5 GHz).
- **Dispositivos conectados**: lista con tipo e icono (editable) y alias por dispositivo.
- **Red**: LAN (IP, máscara, servidor DHCP) y Ethernet/WAN (DHCP / IP estática / PPPoE).
- **Puertos / DMZ**: redirección de puertos y DMZ.
- **Control de acceso**: filtrado por MAC (lista negra / lista blanca).
- **Administración**: info del sistema, reiniciar, restaurar de fábrica, cambiar contraseña de admin.
- **Extras**: autodetección del router, login con las credenciales del router, tema claro/oscuro,
  menú por secciones con iconos.

## Arquitectura

```
apps/web        UI (React + Vite) · PWA · base de la app Android (Capacitor)
apps/desktop    App de escritorio (Electron) que carga el gateway
packages/core   Dominio neutro + contrato RouterDriver + registry + detección (md5 isomórfico)
packages/gateway        Servidor (Fastify): sirve la web + API, login, autodetección
packages/driver-simwifi6   Driver real: OLAX GX3000 Pro / "SIM WiFi6" (API /v1/admin/api)
packages/driver-openwrt    Driver OpenWrt (ubus JSON-RPC) — pendiente de validar en hardware
packages/driver-tplink     Drivers TP-Link y Mercusys — detección ok; protocolo pendiente de captura
packages/driver-demo       Driver de demostración (datos en memoria)
```

Dos formas de conectar:

- **Modo gateway**: la app habla con el gateway (en la red del router). Ideal para la red de casa.
- **Modo directo**: los drivers corren dentro de la app nativa (Capacitor + HTTP nativo) y hablan
  directamente con el router de la red donde estés. Para gestionar routers de otras redes.

Cada funcionalidad se muestra solo si el driver del router la soporta (gating por *capabilities*).

## Puesta en marcha

Requisitos: Node 20+.

```bash
npm install
npm run build
cp env.example .env      # rellena ROUTER_USERNAME / ROUTER_PASSWORD (o deja autodetección)
```

- **Gateway + web**: `npm run dev:gateway` y abre `http://localhost:8787` (o monta el servicio systemd).
- **Solo web (dev con proxy)**: `npm run dev:web`.
- **Escritorio**: `npm run desktop` (Electron; el gateway debe estar corriendo).
- **Android**: ver abajo. **iPhone**: PWA (Safari → Añadir a pantalla de inicio) o app nativa
  (ver [`docs/ios-build.md`](docs/ios-build.md)).

### Android (APK de pruebas)

```bash
npm run build -w @ryfsystems/web
cd apps/web && npx cap sync android
cd android && ANDROID_HOME=$HOME/Android/Sdk ./gradlew :app:assembleDebug
# APK en apps/web/android/app/build/outputs/apk/debug/app-debug.apk
```

## Configuración (`.env`)

Copia `env.example` → `.env` (git-ignored). Claves principales: `PORT`, `ROUTER_BASE_URL`
(vacío = autodetecta), `ROUTER_DRIVER` (vacío = autodetecta), `ROUTER_USERNAME`, `ROUTER_PASSWORD`,
`CORS_ORIGIN`. El acceso a la web es por **login con las credenciales del router**.

## Seguridad

- Las credenciales del router viven en el gateway (`.env`) o, en modo directo, en el dispositivo;
  nunca se publican en el repositorio (`.env` y `data/` están en `.gitignore`).
- El acceso web se valida contra la contraseña del router; las sesiones son tokens temporales.
- Usar solo contra routers propios o con autorización.

## Documentación

- [`DECISIONS.md`](DECISIONS.md) — decisiones de arquitectura y estado por fases.
- [`docs/protocol-simwifi6.md`](docs/protocol-simwifi6.md) — protocolo del router OLAX/SIM WiFi6.
- [`docs/ios-build.md`](docs/ios-build.md) — compilar la app para iPhone en Mac/Xcode.

## Licencia

Ver [`LICENSE`](LICENSE).
