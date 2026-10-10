const { app, BrowserWindow, shell, Menu, session, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("node:path");

app.setName("EasyRouter");

// URL del gateway (por defecto el servicio local en :8787). Configurable por env.
const GATEWAY_URL = process.env.EASYROUTER_URL || "http://localhost:8787";

// La API del router no envía cabeceras CORS (solo la raíz), así que en modo directo el
// renderer no puede leer sus respuestas. En Android lo resuelve CapacitorHttp; aquí se inyectan.
function allowRouterCors() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders ?? {};
    const hasCors = Object.keys(headers).some((k) => k.toLowerCase() === "access-control-allow-origin");
    if (hasCors || details.url.startsWith(GATEWAY_URL)) return callback({});
    callback({
      responseHeaders: {
        ...headers,
        "Access-Control-Allow-Origin": ["*"],
        "Access-Control-Allow-Headers": ["content-type"],
        "Access-Control-Allow-Methods": ["GET, POST, OPTIONS"],
      },
    });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 360,
    title: "EasyRouter",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true },
  });

  const load = () => win.loadURL(GATEWAY_URL);
  load();

  // Si el gateway no está arrancado todavía, muestra aviso y reintenta.
  win.webContents.on("did-fail-load", () => {
    win.loadURL(
      "data:text/html," +
        encodeURIComponent(
          `<body style="font:16px system-ui;background:#0f1115;color:#e8eaed;display:grid;place-items:center;height:100vh;margin:0">
             <div style="text-align:center">
               <h2>No se pudo conectar con el gateway</h2>
               <p style="opacity:.7">${GATEWAY_URL}</p>
               <p>Comprueba que el servicio EasyRouter está activo.<br>Reintentando…</p>
             </div></body>`,
        ),
    );
    setTimeout(load, 3000);
  });

  // Enlaces externos en el navegador del sistema.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(GATEWAY_URL)) { shell.openExternal(url); return { action: "deny" }; }
    return { action: "allow" };
  });

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { label: "EasyRouter", submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "quit" }] },
    ]),
  );
}

// Actualización automática desde las Releases de GitHub (latest*.yml que publica el workflow build).
// Solo en la app empaquetada; en AppImage requiere ejecutarla como AppImage (no extraída).
const UPDATE_CHECK_MS = 4 * 60 * 60 * 1000;

function setupAutoUpdate() {
  if (!app.isPackaged) return;
  autoUpdater.on("error", (err) => console.error("[updater]", err?.message ?? err));
  autoUpdater.on("update-downloaded", async (info) => {
    const { response } = await dialog.showMessageBox({
      type: "info",
      buttons: ["Reiniciar ahora", "Más tarde"],
      defaultId: 0,
      cancelId: 1,
      title: "Actualización disponible",
      message: `EasyRouter ${info.version} está lista para instalarse.`,
      detail: "Se instalará al reiniciar la aplicación.",
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, UPDATE_CHECK_MS);
}

app.whenReady().then(() => { allowRouterCors(); createWindow(); setupAutoUpdate(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
