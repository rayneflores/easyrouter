const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("node:path");

// URL del gateway (por defecto el servicio local en :8787). Configurable por env.
const GATEWAY_URL = process.env.EASYROUTER_URL || "http://localhost:8787";

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

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
