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
npm run build -w @ryfsystems/web

echo "==> Añadiendo/sincronizando plataforma iOS"
cd apps/web
if [ ! -d ios ]; then
  npx cap add ios
fi
npx cap sync ios

echo
echo "==> Listo. En Xcode (que se abrirá ahora):"
echo "   1) Target 'App' > Signing & Capabilities > Team = tu Apple ID."
echo "   2) Conecta el iPhone por USB, pulsa Run (▶)."
echo "   3) iPhone: Ajustes > General > VPN y gestión de dispositivos > confía en el certificado."
echo "   Nota: para http al router, añade la excepción ATS en ios/App/App/Info.plist (ver docs/ios-build.md)."
echo

npx cap open ios
