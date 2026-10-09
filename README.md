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
- **Android**: ver abajo. **iPhone**: PWA o app nativa (ver abajo).

### Android (APK de pruebas)

```bash
npm run build -w @ryfsystems/web
cd apps/web && npx cap sync android
cd android && ANDROID_HOME=$HOME/Android/Sdk ./gradlew :app:assembleDebug
# APK en apps/web/android/app/build/outputs/apk/debug/app-debug.apk
```

### iPhone

**Opción rápida (sin Mac) — PWA:** abre el gateway en **Safari** (`http://<ip-del-pc>:8787`) →
Compartir → **Añadir a pantalla de inicio**. Sirve para el modo gateway (no el directo).

**App nativa — requiere Mac con Xcode + CocoaPods** (con un Apple ID gratuito puedes instalarla en tu
iPhone; la app caduca a los 7 días). En la Mac, un solo comando:

```bash
bash scripts/setup-ios.sh      # npm install + build web + cap add/sync ios + abre Xcode
```

O a mano:

```bash
npm install
npm run build -w @ryfsystems/web
cd apps/web
npx cap add ios        # solo la 1ª vez
npx cap sync ios
npx cap open ios       # abre apps/web/ios/App/App.xcworkspace en Xcode
```

En Xcode: target **App** → *Signing & Capabilities* → Team = tu Apple ID → conecta el iPhone → Run (▶).
Para permitir http al router, añade la excepción ATS en `ios/App/App/Info.plist` (snippet en
[`docs/ios-build.md`](docs/ios-build.md), que incluye la guía completa).

> El proyecto `ios/` NO está en el repo: Capacitor lo genera en la Mac con `cap add ios` (necesita
> Xcode/CocoaPods, que no existen en Linux). Por eso se crea al ejecutar los comandos de arriba.

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
