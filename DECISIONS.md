# EasyRouter — Decisiones de proyecto

> Doc vivo. Registra el *qué* y el *por qué*. Las decisiones se marcan
> ACEPTADA / PENDIENTE / DESCARTADA. Cambiar una decisión = nueva entrada, no editar la vieja.

## 1. Objetivo

Fase 1 (MVP): app web + móvil para administrar **mi** router (SIM WiFi6 Router, CPE 4G/5G en 192.168.5.1).
Fase 2 (visión): generalizar a "cualquier router de cualquier marca/modelo" mediante un sistema de *drivers*.

La decisión de arquitectura de Fase 1 se toma ya pensando en Fase 2: todo lo específico del router vive
detrás de una interfaz; la app nunca llama al router directamente.

## 2. Hechos del router objetivo (reconocimiento 2026-10-09)

- Modelo: "SIM WiFi6 Router". Panel SPA en Vue + webpack.
- API interna propietaria: base `/v1/admin/api/`, verbos `GET`/`POST`, parámetro `?token=<token>`.
- Autenticación: login con hash **MD5** de credenciales; sesión por **token** (guardado en localStorage del panel).
  Payloads con cifrado **AES/base64** en algunas rutas.
- Puertos: 80 (http), 443 (https), 53 (dns). Sin TR-069 (7547), sin SSH.
- Implicación: **no hay API pública ni estándar**. Hay que reverse-ingeniar el protocolo del panel.
  Por eso el driver de este router es un componente aislado y reemplazable.

## 3. Decisiones de arquitectura

### D-01 — Arquitectura en capas con "driver" por router  — ACEPTADA
La app se divide en:
- **Core / dominio**: modelos neutros (Device, WifiNetwork, WanStatus, ClientDevice, PortForwardRule…).
- **Capa de driver (adapter)**: traduce el modelo neutro ⇆ protocolo real del router. Un driver por marca/modelo.
- **Capa de app (UI)**: solo conoce el dominio, nunca el protocolo.
*Por qué:* es lo que hace posible Fase 2 sin reescribir. El router propietario de Fase 1 es el primer driver.

### D-02 — Contrato de driver (interfaz `RouterDriver`)  — ACEPTADA
Todo driver implementa un contrato común. Primeras capacidades:
`login/logout`, `getStatus`, `getWan`, `getWifi`/`setWifi`, `listClients`, `reboot`,
`getPortForwarding`/`setPortForwarding`. Capacidades opcionales se anuncian vía `capabilities()`
(no todos los routers soportan todo). *Por qué:* contrato estable + capacidades declarativas evita
`if (modelo === …)` repartidos por la UI.

### D-03 — Backend intermediario (gateway), no llamadas directas desde el cliente  — ACEPTADA
La app (web/móvil) NO llama al router directamente. Habla con un backend propio ("gateway") que
ejecuta el driver. *Por qué:*
- CORS y mezcla http/https del panel rompen llamadas directas desde navegador.
- El protocolo (MD5/AES/token) se mantiene server-side; credenciales no viven en el cliente.
- Permite caché, logs, y en Fase 2 gestionar routers remotos.
Coste: el gateway debe estar en la red del router (self-host en casa / mini-servicio local).
Reevaluar si un driver puede correr 100% en cliente para redes locales simples.

### D-04 — Stack  — ACEPTADA (2026-10-09): TS + React + Capacitor
**TypeScript end-to-end.** Gateway corre en el PC del usuario durante desarrollo (D-06).
- Gateway/driver: Node + TypeScript (Fastify o Hono).
- Front: web + móvil desde una sola base → **React + Vite** (web) y empaquetado móvil con
  **Capacitor** (reusa el 95% del código). Alternativa: Expo/React Native si se quiere UI nativa real.
*Por qué TS en todo:* un solo lenguaje, los modelos del dominio se comparten entre gateway y front.

### D-06 — Gateway en el PC del usuario (desarrollo)  — ACEPTADA (2026-10-09)
El gateway arranca en el equipo del usuario mientras desarrollamos. Reevaluar mover a
Raspberry/Docker para uso continuo 24/7 (candidato a nueva decisión en F4/F5).

### D-07 — Acceso por login con credenciales del router  — ACEPTADA (2026-10-09)
El gateway sirve la web **y** la API en una sola dirección (`@fastify/static`). El acceso es por
**login con usuario/contraseña del admin del router**, que el gateway compara (timing-safe) con las
credenciales guardadas en `.env`; si coinciden, emite un **token de sesión** (en memoria, TTL 7 días)
que la web usa como Bearer. `GATEWAY_TOKEN` pasa a ser opcional (API-key para tests/clientes; vacío
por defecto = solo login). *Por qué:* es lo que pidió el usuario — abrir una dirección y entrar con
las credenciales del router, sin tokens manuales — y mantiene credenciales fuera del cliente (D-03).
Rutas: `POST /api/login`, `POST /api/logout`; el resto de `/api/*` exige sesión válida.

### D-06 — Gateway permanente (systemd user) — ACEPTADA (2026-10-09, antes "en PC dev")
Servicio systemd de **usuario**: `~/.config/systemd/user/easyrouter-gateway.service`
(`enable --now`, Restart=always, hardening básico). Sirve API+web en `:8787` (bind 0.0.0.0).
Para que arranque sin iniciar sesión hace falta activar linger una vez:
`sudo loginctl enable-linger rayne`. Gestión: `systemctl --user {status,restart,stop} easyrouter-gateway`.
Tras cambiar código: `npm run build && npm run build -w @easyrouter/web && systemctl --user restart easyrouter-gateway`.
Reevaluar mover a Docker/Raspberry para independizarlo del equipo (D-06bis).

### D-08 — Metadatos por dispositivo: tipo y alias (metadato de EasyRouter)  — ACEPTADA (2026-10-09)
El router auto-detecta un `type` por cliente pero NO expone API para cambiarlo ni para renombrar.
EasyRouter guarda metadatos **por MAC** en el gateway (`data/device-meta.json`, `DeviceMetaStore`:
`{mac: {type?, alias?}}`), app-layer (no en el driver → D-01). La lista de clientes aplica tipo y
alias sobre lo auto-detectado. Lista canónica de tipos en `@easyrouter/core` (`DEVICE_TYPES`).
*Por qué:* el router no lo permite y así funciona igual con cualquier router (visión F5); el alias
resuelve el caso de dispositivos con MAC aleatoria/sin hostname (p.ej. Smart TVs).
Rutas: `GET /api/device-types`, `PUT /api/clients/:mac/type {type}`, `PUT /api/clients/:mac/alias {alias}`
(alias vacío lo borra; máx 64 chars). Web: selector de tipo (icono+etiqueta) y nombre editable
(alias en negrita, hostname en gris si no hay alias). El driver mapea el tipo crudo del router como
valor por defecto. (El formato antiguo `{mac:"<type>"}` se migra automáticamente al leerlo.)

### D-09 — Autodetección del router + sondas por driver  — ACEPTADA (2026-10-09)
Al arrancar, si `ROUTER_BASE_URL` no está fijado, el gateway **detecta el router** de la red:
lee las puertas de enlace de `/proc/net/route` (excluye VPN/docker/virtuales), y sondea cada
candidata con las **sondas de detección** registradas por cada driver (`registerDriver(id, factory, probe)`,
`detectDriver(baseUrl)` en core). La sonda de simwifi6 reconoce la firma del API (`{status,data}` +
`LOGINOUT` sin token) sin necesidad de login. Igual con `ROUTER_DRIVER` vacío → se autodetecta el driver.
Endpoint público `GET /api/router` → `{baseUrl, driver, detected}`; la pantalla de login lo muestra
("Router detectado: …"). *Por qué:* lo pidió el usuario (abrir la app y que detecte el router), y las
sondas son la base del descubrimiento multi-router de F5. Verificado: detectó `http://192.168.5.1`
(simwifi6) ignorando la VPN `proton0`.

### Branding — Ing. Rayne Flores / ryfsystems (2026-10-09)
`author`/`publisher` en todos los package.json; crédito visible en la pantalla de login
("Desarrollado por Ing. Rayne Flores · ryfsystems"); appId de Capacitor `es.ryfsystems.easyrouter`.
Pendiente opcional: renombrar el scope npm `@easyrouter/*` → `@ryfsystems/*` (toca imports; no bloquea).

### D-13 — DMZ y administración remota  — ACEPTADA (2026-10-09)
DMZ: capability `dmz`, contrato `getDmz()`/`setDmz(enabled, destIp)`. simwifi6 `dmz_get`/`dmz_set`
(form-urlencoded) — validado end-to-end. demo en memoria. openwrt/tplink: pendiente (UNSUPPORTED,
no anuncian la capability). UI: tarjeta DMZ en la pestaña "Puertos / DMZ" (gated).
Administración remota: el OLAX NO expone toggle de acceso al panel desde WAN (sus "remote*" son de VPN).
El enfoque correcto es exponer el gateway de forma segura (VPN, o DDNS + port-forward + HTTPS); el router
sí tiene DDNS (ddns_get/set/state) como pieza. Pendiente decidir vía (ver opciones con el usuario).

### D-12 — Cambio de contraseña del admin + sincronización del gateway  — ACEPTADA (2026-10-09)
Capability `admin.password`; contrato `changeAdminPassword(current, next)`.
simwifi6: `system_auth` (JSON) con `{oldpassword, password, surePassword}` en MD5 (trim como login).
Ruta `POST /api/admin/password {current,next}`: verifica `current` contra la credencial guardada (401 si no),
cambia en el router y **sincroniza el gateway**: muta `cfg.router.password` en caliente (el driver y Auth
comparten `cfg.router` por referencia) y lo **persiste** en `data/credentials.json` (prioridad sobre
ROUTER_PASSWORD del .env, que no se reescribe; borrar ese fichero revierte al .env). Las sesiones activas
siguen válidas; los nuevos logins usan la clave nueva. openwrt/tplink: pendiente (UNSUPPORTED). demo: no-op.
No ejecutado en vivo (cambia una credencial real); verificado plumbing + rechazo de clave actual errónea.

### D-11 — Control de acceso por MAC (lista negra/blanca)  — ACEPTADA (2026-10-09)
Capability `accessControl`. Contrato: `getAccessControl()` → `{enabled, mode, black[], white[]}`,
`setAccessMode(enabled, mode)`, `addAccessEntry(list, mac, name?)`, `removeAccessEntry(list, mac)`.
Rutas: `GET/PUT /api/access-control`, `POST /api/access-control/:list`, `DELETE /api/access-control/:list/:mac`.
simwifi6 (bwlist_*, form-urlencoded; `bwlist_del` con `data` = string JSON): validado end-to-end.
OpenWrt (macfilter+maclist por wifi-iface, una sola lista+política; NOTA(hw)). demo en memoria.
TP-Link/Mercusys pendiente (como el resto de sus métodos). UI: tarjeta con switch activado + selector
negra/blanca + alta/baja de MAC (autocompletado con los clientes). Gating por capability.

### D-10 — Edición de WiFi: nombre, clave y canal  — ACEPTADA (2026-10-09)
`WifiNetwork` añade `channels?: number[]` (canales seleccionables por banda; cada driver los reporta).
La web muestra un selector de canal (Automático + lista) junto a SSID/clave. En simwifi6 el canal es
config del **radio** (`wifi_X_web_set` con `{enable,mode,bandwidth,channel,txpower}`), distinto del SSID
(`ap_web_set`): setWifi hace una u otra llamada según los campos presentes. En OpenWrt el canal va en la
sección `wifi-device` (uci), el SSID/clave en `wifi-iface`. Validado end-to-end contra el driver demo;
el set de canal en simwifi6 real no se ha ejecutado (cambia la banda momentáneamente) — pendiente de
probar con OK del usuario, pero el payload viene del propio panel.

### D-17 — Configuración de red: LAN y Ethernet/WAN  — ACEPTADA (2026-10-09)
Capability `network`. Dominio: `LanConfig {ip,netmask,dhcpEnabled,dhcpStart,dhcpEnd,leaseTime}`,
`EthernetConfig {proto:dhcp|static|pppoe, ip?,netmask?,gateway?,dns?,username?,mac?,mtu?}`.
Contrato: `getNetwork()`, `setLan(cfg)`, `setEthernet(cfg)`. Rutas `GET /api/network`,
`PUT /api/network/lan`, `PUT /api/network/ethernet`. simwifi6 vía `iface_get`/`iface_set`
(arg = JSON `{network:{lan|wan:{...}}}`; DHCP se calcula offset/limit↔IPs con helpers ip). Read validado
end-to-end. **Escrituras NO ejecutadas** (cambiar IP LAN o proto WAN desconecta el gateway del router) —
implementadas desde el formato confirmado del panel, con doble aviso en la UI. demo in-memory;
openwrt/tplink pendientes (no anuncian `network`). UI: pestaña "Red" con tarjetas LAN y Ethernet.

### D-16 — Modo directo (app autónoma, drivers embebidos)  — ACEPTADA (2026-10-09)
Para gestionar routers en OTRAS redes (el móvil in situ), la app puede correr los drivers EN el
dispositivo y hablar directo con el router, sin gateway. Dos modos en el login:
- **gateway**: como hasta ahora (habla con el gateway).
- **direct**: la app crea el driver (`createDriver`) y habla con el router de su red; metadatos
  (tipo/alias) y credenciales en `localStorage` del dispositivo.
Para que funcione hubo que hacer los drivers **isomórficos**: md5 puro en `@ryfsystems/core` (fuera
`node:crypto`) y se quitó `undici` de los transportes (TLS inseguro en Node se hace con
`NODE_TLS_REJECT_UNAUTHORIZED`). El bundle web importa todos los drivers.
CORS: la PWA/Safari **no** puede hablar con routers arbitrarios (CORS) → el modo directo es para la
**app nativa**, que usa **CapacitorHttp** (`plugins.CapacitorHttp.enabled`) para hacer HTTP nativo sin
CORS/ATS. Validado el driver isomórfico directo contra el OLAX (login+wifi) con md5 puro y sin undici.

### D-15 — iPhone vía PWA (no app nativa)  — ACEPTADA (2026-10-09)
iOS no se puede compilar sin macOS/Xcode. Para iPhone se usa **PWA**: `apps/web/public/manifest.webmanifest`
+ iconos (192/512/maskable/apple-touch 180, generados con Pillow) + meta tags iOS en index.html
(`apple-mobile-web-app-capable`, status bar, apple-touch-icon) + safe-areas. Se instala desde Safari →
Compartir → Añadir a pantalla de inicio (standalone, pantalla completa). No usa service worker, así que
funciona sobre http en LAN. App nativa iOS (.ipa) queda pendiente de Mac/Xcode o build en la nube.

### D-14 — App de escritorio (Electron)  — ACEPTADA (2026-10-09)
`apps/desktop`: ventana Electron que carga el gateway (`EASYROUTER_URL`, por defecto
`http://localhost:8787`). No duplica el gateway (lo sirve el servicio systemd D-06); reintenta si no
está arriba, abre enlaces externos en el navegador. Arranque: `npm run desktop`. Empaquetado:
`npm run dist -w @ryfsystems/desktop` (electron-builder → AppImage/nsis/dmg). Verificado en vivo (DISPLAY :1).

### D-05 — Seguridad  — ACEPTADA
- Credenciales del router: nunca en el repo, nunca en el cliente. En el gateway vía `.env`/secrets.
- Todo el reverse-engineering y las pruebas se hacen SOLO contra el router propio del usuario.
- El gateway expone su propia auth (no reusa el token del router hacia fuera).

## 4. Plan por fases

**F0 — Reconocimiento del protocolo — HECHO (2026-10-09)** → `docs/protocol-simwifi6.md`
147 endpoints mapeados bajo `/v1/admin/api/`. Hallazgos: token en `?token=`, login con
password MD5, envelope `{status,data}` (status 0 = OK), **sin cifrado de transporte**,
dispatcher `transfor_frontend` con subcomandos namespaced. Falta confirmar con tráfico
autenticado real (campos de respuesta exactos) — se hará al inicio de F1 con credenciales del usuario.

**F1 — Driver del SIM WiFi6 + gateway mínimo — EN CURSO (lecturas HECHAS 2026-10-09)**
Monorepo npm workspaces + TS: `packages/core` (dominio + contrato `RouterDriver` + registry),
`packages/driver-simwifi6` (transporte + driver), `packages/gateway` (Fastify, auth Bearer, REST).
Equipo real: **OLAX GX3000 Pro**. Validado end-to-end contra el router:
`GET /api/{device,wan,wifi,clients,port-forwarding}` devuelven datos correctos.
Escrituras: driver implementado + **pruebas escritas pero NO ejecutadas**
(`packages/driver-simwifi6/test/writes.integration.test.ts`, gateadas por `RUN_WRITE_TESTS=1`;
reboot por `RUN_REBOOT_TEST=1`). Cada test revierte lo que cambia. Falta ejecutarlas con tu OK.

**F2 — UI web MVP — HECHO (2026-10-09)** → `apps/web` (React + Vite + TS)
Dashboard con menú de pestañas (Estado, WiFi, Dispositivos, Puertos, Control de acceso, Administración),
gating por capabilities. WiFi editable (SSID/clave/canal); dispositivos con tipo+alias; redirección de
puertos; control de acceso por MAC (lista negra/blanca); Administración: info del sistema + reiniciar +
restaurar de fábrica (capability `factoryReset`, con doble confirmación).
Habla con el gateway vía proxy de Vite (`/api`→`:8787`, sin CORS en dev). Token del gateway
se pide en pantalla de setup y se guarda en localStorage. Validado end-to-end contra el router real.

### Cómo arrancar (dev)
1. `npm install && npm run build`
2. copiar `env.example`→`.env` y poner credenciales del router + `GATEWAY_TOKEN`
3. gateway: `npm run dev:gateway`  ·  web: `npm run dev:web` (http://localhost:5173)
4. en la web, pegar el `GATEWAY_TOKEN` en la pantalla de conexión

**F2 — UI web MVP**
Dashboard: estado WAN/señal, lista de clientes, cambiar WiFi (SSID/clave), reiniciar. React+Vite.

**F3 — Empaquetado móvil — HECHO (2026-10-09, APK debug compilado)**
Capacitor sobre la misma web (`apps/web`). appId `es.tribucorp.easyrouter`, plataforma Android
scaffoldeada en `apps/web/android`. Cambios para que el móvil funcione fuera del proxy de Vite:
- API con **base configurable** (`getBase`/`setBase`): en móvil se fija `http://<ip-del-pc>:8787`;
  en web sigue usando rutas relativas (proxy). La pantalla de setup pide URL + token.
- **CORS** en el gateway (`@fastify/cors`, `CORS_ORIGIN`, por defecto `*` en dev).
- Capacitor `server.cleartext=true` (el gateway LAN es http plano).

Build Android (requiere Android SDK + JDK):
```
cd apps/web && npm run build && npx cap sync android
cd android && echo "sdk.dir=$HOME/Android/Sdk" > local.properties
ANDROID_HOME=$HOME/Android/Sdk ./gradlew :app:assembleDebug
# APK en app/build/outputs/apk/debug/app-debug.apk
```
D-06bis: el móvil necesita que el gateway sea alcanzable en la LAN desde el teléfono
(mismo WiFi; usar la IP del PC, no localhost). Candidato real a mover el gateway a un equipo fijo.

**F4 — Validación de todas las funcionalidades — HECHO (2026-10-09)**
Lecturas (device/wan/wifi/clients/port-forwarding) y escrituras validadas end-to-end contra el
router real, por driver (tests) y por gateway (HTTP). Pruebas de escritura: 3/3 OK
(`setWifi` SSID+hidden, `addPortForward`/`deletePortForward`), todas revierten. `reboot` no ejecutado.
Hallazgos que corrigieron el driver (ver protocolo §Escrituras confirmadas):
- Endpoints directos usan **form-urlencoded** (JSON→HTTP 500); `transfor_frontend` usa JSON.
- WiFi set: payload exacto `{myidx,ssid,key,enable,hide,auth,encrypt}`.
- Port-forward: IP = `to_dip`, `enable:"true"/"false"`, borrado con `fwids` como string JSON.
- Contrato D-02 ajustado: `setPortForwarding(lista)` → `addPortForward`/`deletePortForward` (la API es por regla).
Pendiente opcional: editar reglas NAT existentes y UI de port-forward en la web (no bloquean).

**F5 — Visión multi-router — EN CURSO (2026-10-09)**
- Detección de router/driver por sondas: HECHO (D-09).
- Segundo driver `@ryfsystems/driver-demo` (estado en memoria, implementa el contrato completo):
  HECHO. Validado que el **mismo gateway + web funcionan sin cambios** con `ROUTER_DRIVER=demo`
  (login, device, wan, wifi get/set, clients, port-forward add/del). Prueba que añadir una marca =
  escribir un driver. No registra sonda (no se autodetecta).
- Scope npm renombrado `@easyrouter/*` → `@ryfsystems/*` (HECHO).
- Driver REAL `@ryfsystems/driver-openwrt` (ubus HTTP JSON-RPC): HECHO. Objetos usados:
  `session login`, `system board/info`, `network.interface.<wan> status` + `network.device status`,
  `uci get/set/add/commit` (wireless/firewall), `network.wireless reload/status`, `iwinfo assoclist`,
  `luci-rpc getHostHints` (fallback `file read /tmp/dhcp.leases`), reboot (`system`/`rpc-sys`/`file exec`).
  Autodetectable por sonda (`POST /ubus` responde JSON-RPC 2.0). Verificado el transporte y los mapeos
  contra un ubus **simulado**; **pendiente de validar contra un OpenWrt real** (variaciones por versión:
  nombre de iface WAN, método de reboot, reload de firewall fw4 vs init.d) — ver NOTA(hw) en el código.
- Drivers `@ryfsystems/driver-tplink` (ids `tplink` y `mercusys`, comparten firmware/base web):
  **detección funcional** por firma del panel (incluye/excluye marca), estructura del driver y
  metadatos de marca listos. Protocolo AUTENTICADO (RSA/AES + sesión `stok`, variable por modelo)
  **pendiente de validar con equipo real o captura** — los métodos lanzan DriverError("UNSUPPORTED")
  con mensaje claro. Verificado que no dan falso positivo con el OLAX.
- Registry ampliado con metadatos de driver (`DriverInfo {brand,label}`, `getDriverInfo`); `/api/router`
  expone `brand`/`label` (inmediato) y `model` (aprendido tras login y persistido en
  `data/router-state.json`). La pantalla de inicio muestra marca + modelo en una línea.
- Pendiente: completar tplink/mercusys con hardware; catálogo/UI para elegir router cuando haya varios;
  más drivers (Mikrotik, etc.).

## 5. Preguntas abiertas (decidir antes de F1)
- Stack definitivo (D-04): ¿TS + React + Capacitor? ¿O prefieres otra cosa (Flutter, Expo, PWA sola)?
- ¿Dónde correrá el gateway? (tu PC, una Raspberry, un contenedor permanente).
- ¿Móvil nativo real o basta PWA/empaquetado web para el MVP?
