import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadWindowState, saveWindowState } from "./window-state.js";
import { buildMenu } from "./menu.js";
import { currentOrDefault, effectiveUrl, shouldPromptForUrl } from "./server-url.js";
import { promptForServerUrl } from "./prompt-server-url.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPPORT_URL = process.env.ORBIT_SUPPORT_URL;

// Server URL is resolved at startup via server-url.ts:
//   1. ORBIT_WEB_URL / FIELD_SALES_WEB_URL / WEB_URL  (env override)
//   2. ~/AppData/Roaming/Orbit/server-url.json        (saved by prompt)
//   3. http://localhost:3001                          (dev default)
// `currentWebUrl` holds the value actually loaded into the window so the
// "Change server URL..." menu item can switch, and the window-open handler
// can decide whether a clicked link stays inside vs. opens externally.
let currentWebUrl = "http://localhost:3001";
let mainWindow: BrowserWindow | undefined;

async function createWindow() {
  // Resolve the server URL — and, if neither the env nor a saved value is
  // set, ask the user once before the main window opens. This is the desktop
  // equivalent of the mobile app's "Advanced — server URL" field, and lets
  // a freshly-installed copy point at any Orbit backend (localhost, a
  // Cloudflare tunnel URL, a hosted deployment) without code changes.
  if (await shouldPromptForUrl()) {
    const fromPrompt = await promptForServerUrl(null, await currentOrDefault());
    if (fromPrompt) currentWebUrl = fromPrompt;
    else currentWebUrl = await effectiveUrl(); // user cancelled — fall back to default
  } else {
    currentWebUrl = await effectiveUrl();
  }

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

  buildMenu(mainWindow, SUPPORT_URL, async () => {
    if (!mainWindow) return;
    const next = await promptForServerUrl(mainWindow, currentWebUrl);
    if (next) {
      currentWebUrl = next;
      void mainWindow.loadURL(currentWebUrl);
    }
  });

  // Persist window state on close.
  mainWindow.on("close", () => {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    void saveWindowState(bounds);
  });

  // Open external links in the OS browser, not inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(currentWebUrl)) {
      return { action: "allow" };
    }
    void shell.openExternal(url);
    return { action: "deny" };
  });

  void mainWindow.loadURL(currentWebUrl);
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

// Single-instance lock — if Orbit is already running, exit this process
// immediately and just focus the existing window. Without this, running
// `pnpm dev:desktop` while a previous Orbit is still alive lets two Chromium
// processes race for the same userData dir, producing "Unable to move the
// cache: Access is denied" / "Failed to delete the database" GPU errors and
// (more importantly) two prompt windows fighting for the URL.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    registerIpc();
    void createWindow();
  });
}

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
