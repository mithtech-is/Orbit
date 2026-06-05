import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_STATE = { width: 1280, height: 840 };

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

function statePath(): string {
  return path.join(app.getPath("userData"), "window-state.json");
}

export async function loadWindowState(): Promise<WindowState> {
  try {
    const raw = await fs.readFile(statePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<WindowState>;
    return {
      width: typeof parsed.width === "number" && parsed.width >= 800 ? parsed.width : DEFAULT_STATE.width,
      height: typeof parsed.height === "number" && parsed.height >= 600 ? parsed.height : DEFAULT_STATE.height,
      x: typeof parsed.x === "number" ? parsed.x : undefined,
      y: typeof parsed.y === "number" ? parsed.y : undefined
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function saveWindowState(state: WindowState): Promise<void> {
  try {
    await fs.writeFile(statePath(), JSON.stringify(state, null, 2), "utf8");
  } catch {
    // best-effort persistence
  }
}
