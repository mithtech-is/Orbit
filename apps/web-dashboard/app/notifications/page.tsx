"use client";

import type { JSX } from "react";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiClient, safeFetch } from "../api-service";
import type { NotificationItem } from "@orbit/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return new Date(iso).toLocaleString();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(iso).toLocaleString();
}

export default function NotificationsPage(): JSX.Element {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Ids currently playing the slide-out "clear" animation (CSS in styles.css).
  const [leaving, setLeaving] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    setError(null);
    const result = await safeFetch(() => apiClient.listNotifications({ limit: 100 }), null);
    if (result) { setItems(result.items); setUnread(result.unreadCount); }
    else setError("We couldn't load your notifications. Please try again.");
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  function clearOne(id: string) {
    setLeaving((prev) => new Set(prev).add(id));
    void safeFetch(() => apiClient.markNotificationsRead([id]), null);
    setTimeout(() => {
      setItems((prev) => prev.filter((n) => n.id !== id));
      setUnread((u) => Math.max(0, u - 1));
      setLeaving((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }, 360);
  }

  function clearAll() {
    items.forEach((n, i) => setTimeout(() => setLeaving((prev) => new Set(prev).add(n.id)), i * 60));
    void safeFetch(() => apiClient.markNotificationsRead([]), null);
    setTimeout(() => { setItems([]); setUnread(0); setLeaving(new Set()); }, items.length * 60 + 400);
  }

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">Alerts and updates for your account.</p>
        </div>
        <Button variant="outline" onClick={clearAll} disabled={items.length === 0}>
          Clear all{unread > 0 ? ` (${unread} unread)` : ""}
        </Button>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      ) : null}

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <h3 className="text-base font-semibold text-foreground">You&apos;re all caught up 🎉</h3>
            <p className="text-sm text-muted-foreground">No new alerts right now. Assignments, off-target check-ins, and order updates land here as they happen.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {items.map((n) => (
            <li
              key={n.id}
              className={`notif-item${leaving.has(n.id) ? " leaving" : ""} rounded-lg border border-border p-3.5 ${n.status === "unread" ? "bg-muted" : "bg-card"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <strong className="text-foreground">{n.title}</strong>
                <div className="flex items-center gap-2.5 whitespace-nowrap">
                  <span className="text-xs text-muted-foreground">{relativeTime(n.createdAt)}</span>
                  <button
                    onClick={() => clearOne(n.id)}
                    aria-label="Clear notification"
                    title="Clear"
                    className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {n.body ? <div className="mt-1 text-sm text-muted-foreground">{n.body}</div> : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
