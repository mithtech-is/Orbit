import { app, Menu, shell, type BrowserWindow } from "electron";

const PRODUCT_NAME = "Orbit";

/**
 * Native application menu. Production-ready labels for an operations user;
 * developer-only items (devtools) are kept under View for support sessions
 * but not surfaced as primary actions.
 */
export function buildMenu(window: BrowserWindow, supportUrl?: string): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          label: "Reload",
          accelerator: "CmdOrCtrl+R",
          click: () => window.webContents.reload()
        },
        { type: "separator" },
        { role: "quit", label: `Quit ${PRODUCT_NAME}` }
      ]
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "togglefullscreen" },
        { type: "separator" },
        { role: "toggleDevTools", label: "Developer tools" }
      ]
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "close" }
      ]
    },
    {
      role: "help",
      submenu: [
        {
          label: `About ${PRODUCT_NAME}`,
          click: () => {
            const w = new (require("electron").BrowserWindow as typeof BrowserWindow)({
              width: 360,
              height: 220,
              resizable: false,
              minimizable: false,
              maximizable: false,
              webPreferences: { contextIsolation: true, nodeIntegration: false }
            });
            void w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
              `<!doctype html><html><head><meta charset="utf-8"><title>About ${PRODUCT_NAME}</title>` +
              `<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:24px;color:#111827;text-align:center;background:#ffffff}` +
              `.dot{width:14px;height:14px;border-radius:50%;background:#00aaff;display:inline-block;vertical-align:middle;margin-right:8px;box-shadow:0 0 0 5px rgba(0,170,255,0.12)}` +
              `h1{font-size:22px;margin:12px 0 6px}p{color:#6b7280;margin:4px 0}</style></head>` +
              `<body><h1><span class="dot"></span>${PRODUCT_NAME}</h1><p>Field Operations Platform</p><p>Version ${app.getVersion()}</p></body></html>`
            )}`);
          }
        },
        ...(supportUrl ? [{
          label: "Help & support",
          click: () => void shell.openExternal(supportUrl)
        } as Electron.MenuItemConstructorOptions] : [])
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
