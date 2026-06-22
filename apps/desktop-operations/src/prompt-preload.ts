import { contextBridge, ipcRenderer } from "electron";

/**
 * Tiny bridge for the "Set server URL" prompt window. Exposes only the two
 * methods the modal HTML uses; nothing else from Node or Electron is reachable
 * from that page. Kept separate from preload.ts so the main dashboard window
 * doesn't carry these handlers (which only exist while the prompt is open).
 */
contextBridge.exposeInMainWorld("orbit", {
  submit: (url: string) =>
    ipcRenderer.invoke("prompt-server-url:submit", url) as Promise<{ ok: boolean; message?: string }>,
  cancel: () =>
    ipcRenderer.invoke("prompt-server-url:cancel") as Promise<{ ok: boolean }>
});
