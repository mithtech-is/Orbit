import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadWindowState, saveWindowState } from "./window-state.js";
import { buildMenu } from "./menu.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default MUST be :3001 (the Orbit web dashboard). Port 3000 on this machine
// is the separate Counterflow POS app — defaulting there made the desktop window
// open the POS instead of Orbit. WEB_URL is also honoured so the launcher's
// `set WEB_URL=...` works without an extra alias.
const WEB_URL =
  process.env.ORBIT_WEB_URL ??
  process.env.FIELD_SALES_WEB_URL ??
  process.env.WEB_URL ??
  "http://localhost:3001";
const SUPPORT_URL = process.env.ORBIT_SUPPORT_URL;

let mainWindow: BrowserWindow | undefined;

async function createWindow() {
  const state = await loadWindowState();

  mainWindow = new BrowserWindow({
    title: "Orbit",
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js")
    }
  });

  buildMenu(mainWindow, SUPPORT_URL);

  // Persist window state on close.
  mainWindow.on("close", () => {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    void saveWindowState(bounds);
  });

  // Open external links in the OS browser, not inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(WEB_URL)) {
      return { action: "allow" };
    }
    void shell.openExternal(url);
    return { action: "deny" };
  });

  void mainWindow.loadURL(WEB_URL);
}

function registerIpc() {
  ipcMain.handle("desktop:save-text-file", async (_event, payload: { suggestedName: string; mimeType: string; contents: string }) => {
    if (typeof payload.contents !== "string" || typeof payload.suggestedName !== "string") {
      throw new Error("invalid payload");
    }
    if (payload.contents.length > 50 * 1024 * 1024) {
      throw new Error("file too large for IPC export (max 50 MB)");
    }
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: payload.suggestedName,
      filters: payload.mimeType === "text/csv"
        ? [{ name: "CSV", extensions: ["csv"] }, { name: "All Files", extensions: ["*"] }]
        : [{ name: "All Files", extensions: ["*"] }]
    });
    if (result.canceled || !result.filePath) return null;
    await fs.writeFile(result.filePath, payload.contents, "utf8");
    return result.filePath;
  });

  ipcMain.handle("desktop:get-window-state", async () => {
    return loadWindowState();
  });

  ipcMain.handle("desktop:open-external", async (_event, url: string) => {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle("desktop:get-app-info", () => {
    return {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch
    };
  });
}

app.whenReady().then(() => {
  registerIpc();
  void createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
