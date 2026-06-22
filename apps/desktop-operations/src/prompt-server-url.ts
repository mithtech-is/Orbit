import { BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normaliseUrl, saveStored } from "./server-url.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Modal-ish window that asks the user for the Orbit server URL.
 * Resolves to the validated, normalised URL on submit, or `null` if the
 * user cancels / closes without submitting. The caller decides whether
 * a `null` result should fall back to localhost or quit the app.
 */
export function promptForServerUrl(parent: BrowserWindow | null, defaultValue: string): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const win = new BrowserWindow({
      width: 460,
      height: 280,
      resizable: false,
      minimizable: false,
      maximizable: false,
      modal: parent !== null,
      parent: parent ?? undefined,
      backgroundColor: "#ffffff",
      title: "Orbit — set server URL",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        preload: path.join(__dirname, "prompt-preload.js")
      }
    });

    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      ipcMain.removeHandler("prompt-server-url:submit");
      ipcMain.removeHandler("prompt-server-url:cancel");
      try { win.close(); } catch { /* already gone */ }
      resolve(value);
    };

    ipcMain.handle("prompt-server-url:submit", async (_e, raw: unknown) => {
      const url = typeof raw === "string" ? normaliseUrl(raw) : null;
      if (!url) return { ok: false, message: "That URL doesn't look right. Try https://your-orbit.example.com" };
      await saveStored(url);
      finish(url);
      return { ok: true };
    });
    ipcMain.handle("prompt-server-url:cancel", async () => { finish(null); return { ok: true }; });

    win.on("closed", () => finish(null));

    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(promptHtml(defaultValue))}`);
  });
}

function promptHtml(defaultValue: string): string {
  // Inline HTML so we don't have to ship an extra asset; matches the style of
  // the existing About dialog. The form uses the contextBridge API set up in
  // prompt-preload.ts to talk to the main process.
  return `<!doctype html><html><head><meta charset="utf-8">
<title>Orbit — server URL</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:24px;color:#111827;background:#ffffff}
  h1{font-size:16px;margin:0 0 4px;display:flex;align-items:center;gap:8px}
  h1 .dot{width:12px;height:12px;border-radius:50%;background:#00aaff;box-shadow:0 0 0 4px rgba(0,170,255,0.12)}
  p{color:#6b7280;margin:8px 0 16px;font-size:13px;line-height:1.45}
  label{font-size:11px;font-weight:600;color:#374151;letter-spacing:0.04em;text-transform:uppercase}
  input{display:block;width:100%;margin-top:6px;padding:10px 12px;font-size:14px;border:1px solid #d1d5db;border-radius:6px;outline:none}
  input:focus{border-color:#00aaff;box-shadow:0 0 0 3px rgba(0,170,255,0.15)}
  .err{color:#dc2626;font-size:12px;margin-top:8px;min-height:16px}
  .row{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
  button{font-size:13px;font-weight:600;padding:9px 16px;border-radius:6px;cursor:pointer;border:1px solid transparent}
  .secondary{background:#fff;color:#374151;border-color:#d1d5db}
  .primary{background:#00aaff;color:#fff}
  button:disabled{opacity:.5;cursor:default}
</style></head>
<body>
  <h1><span class="dot"></span>Orbit server URL</h1>
  <p>Where is your Orbit backend hosted? You can change this later from the File menu.</p>
  <label for="u">Server URL</label>
  <input id="u" type="url" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="https://orbit.example.com" value="${escapeAttr(defaultValue)}" />
  <div id="e" class="err"></div>
  <div class="row">
    <button class="secondary" id="cancel">Cancel</button>
    <button class="primary" id="ok">Continue</button>
  </div>
  <script>
    const input = document.getElementById('u');
    const err = document.getElementById('e');
    const ok = document.getElementById('ok');
    input.focus(); input.select();
    async function submit() {
      ok.disabled = true; err.textContent = '';
      const res = await window.orbit.submit(input.value);
      if (!res || !res.ok) { err.textContent = res && res.message ? res.message : 'Could not save'; ok.disabled = false; input.focus(); }
    }
    document.getElementById('ok').addEventListener('click', submit);
    document.getElementById('cancel').addEventListener('click', () => window.orbit.cancel());
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } if (e.key === 'Escape') window.orbit.cancel(); });
  </script>
</body></html>`;
}

function escapeAttr(s: string): string {
  return s.replace(/[&"<>]/g, (c) => ({"&":"&amp;","\"":"&quot;","<":"&lt;",">":"&gt;"} as Record<string,string>)[c]!);
}
