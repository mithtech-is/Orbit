/**
 * Bridge into the Electron preload-exposed APIs (apps/desktop-operations).
 * When the dashboard runs in a normal browser these calls fall back to a
 * <a download> click so CSV exports still work.
 */

export interface DesktopBridge {
  saveTextFile(input: { suggestedName: string; mimeType: string; contents: string }): Promise<string | null>;
  getAppInfo(): Promise<{ version: string; platform: string; arch: string }>;
  openExternal(url: string): Promise<boolean>;
}

declare global {
  interface Window {
    fieldSalesDesktop?: DesktopBridge;
  }
}

export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  return window.fieldSalesDesktop ?? null;
}

export function isDesktop(): boolean {
  return getDesktopBridge() !== null;
}

export async function exportTextFile(input: {
  suggestedName: string;
  mimeType: string;
  contents: string;
}): Promise<string | null> {
  const bridge = getDesktopBridge();
  if (bridge) {
    return bridge.saveTextFile(input);
  }
  if (typeof window === "undefined") return null;
  const blob = new Blob([input.contents], { type: input.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = input.suggestedName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return input.suggestedName;
}

export function toCsv<T>(rows: readonly T[], columns?: ReadonlyArray<keyof T & string>): string {
  if (rows.length === 0) return "";
  const cols = columns ?? (Object.keys(rows[0] as Record<string, unknown>) as Array<keyof T & string>);
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const header = cols.join(",");
  const body = rows.map((r) => cols.map((c) => escape((r as Record<string, unknown>)[c as string])).join(",")).join("\n");
  return `${header}\n${body}\n`;
}
