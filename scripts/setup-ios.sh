#!/usr/bin/env bash
# Prepara y abre el proyecto iOS de EasyRouter en Xcode. EJECUTAR EN UNA MAC con Xcode + CocoaPods.
# Uso:  bash scripts/setup-ios.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Comprobando requisitos (macOS/Xcode/CocoaPods)"
if [[ "$(uname)" != "Darwin" ]]; then
  echo "ERROR: iOS solo se compila en macOS con Xcode. Esto no es una Mac." >&2
  exit 1
fi
command -v pod >/dev/null || { echo "ERROR: falta CocoaPods. Instala: sudo gem install cocoapods"; exit 1; }

echo "==> Instalando dependencias"
npm install

echo "==> Construyendo la web"
npx turbo run build --filter=@ryfsystems/web

echo "==> Añadiendo/sincronizando plataforma iOS"
cd apps/web
if [ ! -d ios ]; then
  npx cap add ios
fi
npx cap sync ios

echo "==> Permitiendo HTTP en la LAN (ATS) y acceso a red local en Info.plist"
PLIST=ios/App/App/Info.plist
PB=/usr/libexec/PlistBuddy
# El router/gateway habla http plano por IP; sin esto iOS bloquea la detección y el login.
$PB -c "Delete :NSAppTransportSecurity" "$PLIST" 2>/dev/null || true
$PB -c "Add :NSAppTransportSecurity dict" "$PLIST"
$PB -c "Add :NSAppTransportSecurity:NSAllowsArbitraryLoads bool true" "$PLIST"
$PB -c "Add :NSAppTransportSecurity:NSAllowsLocalNetworking bool true" "$PLIST"
# iOS 14+: sin esta clave el sistema no pide permiso de red local y las peticiones a 192.168.x.x fallan.
$PB -c "Delete :NSLocalNetworkUsageDescription" "$PLIST" 2>/dev/null || true
$PB -c "Add :NSLocalNetworkUsageDescription string \"EasyRouter necesita acceder a tu red local para detectar y gestionar el router.\"" "$PLIST"

echo
echo "==> Listo. En Xcode (que se abrirá ahora):"
echo "   1) Target 'App' > Signing & Capabilities > Team = tu Apple ID."
echo "   2) Conecta el iPhone por USB, pulsa Run (▶)."
echo "   3) iPhone: Ajustes > General > VPN y gestión de dispositivos > confía en el certificado."
echo

npx cap open ios
