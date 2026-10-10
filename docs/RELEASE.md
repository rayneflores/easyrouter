# Proceso de Release

EasyRouter publica instaladores automáticamente con **GitHub Actions**
(`.github/workflows/build.yml`): Linux (AppImage), Windows (NSIS .exe) y Android (APK).

## Resumen

1. Asegúrate de que `main` está actualizado y verde.
2. Sube la versión en los `package.json` (al menos el raíz).
3. Crea y publica un **tag `vX.Y.Z`**.
4. El workflow compila los 3 instaladores y los **adjunta a la Release** de ese tag.

## Pasos detallados

### 1. Versionado

Actualiza `version` en el `package.json` raíz (y opcionalmente en los workspaces).
Haz commit:

```bash
git add package.json
git commit -m "chore: versión X.Y.Z"
git push origin main
```

### 2. Crear la Release (dispara el build)

**Opción A — con tag git (recomendada):**

```bash
git tag -a vX.Y.Z -m "EasyRouter vX.Y.Z"
git push origin vX.Y.Z
```

El push del tag dispara el workflow. La acción `softprops/action-gh-release` **crea la Release**
y le adjunta los instaladores. Después puedes editar las notas:

```bash
gh release edit vX.Y.Z --notes-file notas.md
```

**Opción B — con gh (crea tag + release con notas de una vez):**

```bash
gh release create vX.Y.Z --target main --title "EasyRouter vX.Y.Z" --notes-file notas.md --verify-tag
```

### 3. Resultado

Al terminar el workflow, en **Releases** tendrás:

- `easyrouter-android.apk` — APK debug (sideload / pruebas).
- `EasyRouter-*.AppImage` — app de escritorio Linux.
- `EasyRouter Setup *.exe` — instalador de escritorio Windows (NSIS).

## Ejecutar el build sin publicar

En **Actions → build → Run workflow** (o `gh workflow run build.yml`). Sube los artefactos al run
(no crea Release; la opción de adjuntar solo actúa en tags).

## Notas y pendientes

- **Android**: la APK es *debug* (sin firmar). Para publicar en Play Store hay que firmar un
  *release* con un keystore guardado en *Secrets* (`ANDROID_KEYSTORE`, `ANDROID_KEY_ALIAS`, …) y
  cambiar el job a `assembleRelease` + `signingConfig`. Pendiente hasta que se requiera.
- **Windows/Linux**: los binarios no están firmados (sin certificado de firma de código). El usuario
  puede ver advertencias de SmartScreen (Windows). Firma opcional vía secrets de electron-builder.
- **iOS**: no se compila en CI de GitHub salvo con runner `macos-latest` + cuenta de desarrollador
  Apple para firmar. Ver `docs/ios-build.md` para compilar en una Mac. Pendiente.
- **La app de escritorio** es un cliente del gateway (carga `http://localhost:8787` por defecto,
  configurable con `EASYROUTER_URL`); el instalador no incluye el gateway, que corre como servicio.
