import { contextBridge, ipcRenderer } from "electron";

/**
 * Sandbox-safe bridge between the Next.js renderer (loaded over http://localhost:3000)
 * and the privileged Electron main process. Only the methods listed here are
 * exposed; the renderer cannot access Node, fs, or any other Electron API.
 *
 * Each method performs argument validation in main.ts before doing IO.
 */
contextBridge.exposeInMainWorld("fieldSalesDesktop", {
  /** Save a CSV (or other text) file via the OS save dialog. Returns the saved path or null if cancelled. */
  saveTextFile: (input: { suggestedName: string; mimeType: string; contents: string }) =>
    ipcRenderer.invoke("desktop:save-text-file", input) as Promise<string | null>,

  /** Read the app's persisted window state for renderer telemetry. */
  getWindowState: () => ipcRenderer.invoke("desktop:get-window-state") as Promise<{ width: number; height: number; x?: number; y?: number }>,

  /** Open an external link in the user's default browser instead of the Electron window. */
  openExternal: (url: string) => ipcRenderer.invoke("desktop:open-external", url) as Promise<boolean>,

  /** Returns app metadata so the renderer can show version/build info in About. */
  getAppInfo: () => ipcRenderer.invoke("desktop:get-app-info") as Promise<{ version: string; platform: string; arch: string }>
});
