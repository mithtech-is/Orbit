"use client";

import type { JSX } from "react";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiClient } from "../api-service";
import { Logo } from "../logo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function ResetPasswordInner(): JSX.Element {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const orgId = params.get("org") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const invalidLink = !token || !orgId;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      await apiClient.resetPassword({ organisationId: orgId, token, newPassword: password });
      setDone(true);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Reset failed.";
      setError(detail.includes("HTTP") ? "This reset link is invalid or expired. Request a new one." : detail);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="font-sans flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardContent className="p-6 sm:p-8">
          <div className="mb-5 flex items-center gap-2">
            <Logo size={40} />
            <span className="text-lg font-semibold text-foreground">Orbit</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Choose a new password</h1>
          {invalidLink ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">This reset link is missing required details. Request a new one.</p>
              <p className="mt-4 text-center text-sm"><Link href="/forgot-password" className="text-primary hover:underline">Request a reset link</Link></p>
            </>
          ) : done ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">Your password has been reset.</p>
              <p className="mt-4 text-center text-sm"><Link href="/login" className="text-primary hover:underline">Sign in</Link></p>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="rp-pass">New password</Label>
                <Input id="rp-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} autoFocus />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rp-confirm">Confirm password</Label>
                <Input id="rp-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={12} />
              </div>
              <p className="text-xs text-muted-foreground">At least 12 characters.</p>
              {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}
              <Button type="submit" className="w-full" disabled={loading}>{loading ? "Resetting…" : "Reset password"}</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

export default function ResetPasswordPage(): JSX.Element {
  return (
    <Suspense fallback={<main className="font-sans flex min-h-screen items-center justify-center bg-background"><p className="text-sm text-muted-foreground">Loading…</p></main>}>
      <ResetPasswordInner />
    </Suspense>
  );
}
