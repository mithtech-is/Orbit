// Defensive guard for `pnpm dev:desktop` etc.
//
// pnpm respects `pnpm.onlyBuiltDependencies` as a *whitelist* for postinstall
// scripts, but on Windows + pnpm 9.x it still occasionally skips electron's
// downloader (e.g. on a fresh hoisted reinstall). When that happens, the
// next `electron .` call fails with "Electron failed to install correctly".
//
// Fix: if `node_modules/electron/path.txt` is missing or its referenced
// binary doesn't exist, run electron's official install.js. Otherwise no-op.
//
// Safe to run on every dev launch — it does nothing when electron is healthy.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const electronDir = join(root, "node_modules", "electron");
const pathTxt = join(electronDir, "path.txt");
const installJs = join(electronDir, "install.js");

function electronOk() {
  if (!existsSync(pathTxt)) return false;
  const rel = readFileSync(pathTxt, "utf8").trim();
  return rel.length > 0 && existsSync(join(electronDir, "dist", rel));
}

if (electronOk()) {
  process.exit(0);
}

if (!existsSync(installJs)) {
  console.error("ensure-electron: node_modules/electron/install.js missing. Run `pnpm install` first.");
  process.exit(1);
}

console.log("ensure-electron: downloading Electron binary (one-time, ~100 MB)...");
execFileSync(process.execPath, [installJs], { stdio: "inherit", cwd: electronDir });

if (!electronOk()) {
  console.error("ensure-electron: install ran but binary still missing. See above for download errors.");
  process.exit(1);
}

console.log("ensure-electron: electron ready.");
