# Compilar EasyRouter para iPhone (Xcode)

iOS solo se puede compilar en **macOS + Xcode**. Con un **Apple ID gratuito** puedes instalarla en
tu propio iPhone para pruebas (sin pagar el Developer Program), con estas limitaciones:

- La app **caduca a los 7 días** → hay que reinstalarla/recompilarla (con cuenta de pago dura 1 año).
- Máximo **3 apps** firmadas así por dispositivo.
- Sin TestFlight ni distribución; solo tu dispositivo conectado.
- No hay push ni ciertos entitlements — **EasyRouter no usa ninguno**, así que vale.

## Requisitos en la Mac
- **Xcode** (App Store) + abrirlo una vez para instalar componentes.
- **CocoaPods**: `sudo gem install cocoapods` o `brew install cocoapods`.
- **Node 20+** y el repo clonado.

## Pasos

```bash
# 1. Dependencias y build de la web
npm install
npm run build -w @ryfsystems/web

# 2. Crear/añadir la plataforma iOS (SOLO en la Mac; en Linux no se puede)
cd apps/web
npx cap add ios        # solo la primera vez
npx cap sync ios       # copia web + plugins (CapacitorHttp ya configurado)

# 3. Abrir en Xcode
npx cap open ios       # abre apps/web/ios/App/App.xcworkspace
```

En Xcode:

1. Selecciona el target **App** → pestaña **Signing & Capabilities**.
2. Marca **Automatically manage signing** y en **Team** elige tu Apple ID
   (si no aparece: Xcode → Settings → Accounts → añade tu Apple ID).
3. **Bundle Identifier**: `es.ryfsystems.easyrouter` (cámbialo si diera conflicto, p.ej. añade un sufijo).
4. Conecta el iPhone por USB; selecciónalo como destino (arriba) y pulsa **Run** (▶).
5. Primera vez en el iPhone: **Ajustes → General → VPN y gestión de dispositivos** → confía en tu
   certificado de desarrollador.

## Permitir HTTP al router/gateway (ATS)

iOS bloquea `http://` por App Transport Security. EasyRouter habla con el router/gateway por http en la
LAN, así que hay que añadir una excepción en `apps/web/ios/App/App/Info.plist` (dentro del `<dict>` raíz):

```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key>
  <true/>
</dict>
```

(Alternativa más estricta: en vez de `NSAllowsArbitraryLoads`, declarar excepciones por dominio/IP con
`NSExceptionDomains`. Para pruebas, `NSAllowsArbitraryLoads` es lo más simple.)

> Nota: `CapacitorHttp` (ya activado en `capacitor.config.ts`) hace las peticiones por HTTP **nativo**,
> lo que también evita problemas de CORS en **modo directo**. Aun así, mantener la excepción ATS evita
> bloqueos de cleartext.

## Modos de uso en el iPhone

- **Vía gateway**: en el login, URL del gateway (`http://<ip-del-pc>:8787`) + credenciales. Gestiona el
  router de la red de casa a través del gateway.
- **Directo al router**: IP del router de la red donde estés (`192.168.1.1`, etc.) + credenciales. La app
  habla directo con ese router (gracias a CapacitorHttp). **Este modo solo funciona en la app nativa**,
  no en la PWA de Safari (CORS).

## Volver a desplegar tras cambios

```bash
npm run build -w @ryfsystems/web
cd apps/web && npx cap sync ios
# y Run de nuevo en Xcode
```

## Si no tienes Mac

- **PWA** (Safari → Compartir → Añadir a pantalla de inicio): sirve para **modo gateway**, no para modo directo.
- **Build en la nube** (Codemagic, GitHub Actions macOS): compila el `.ipa` sin Mac física, pero requiere
  cuenta de desarrollador Apple para firmar/instalar.
