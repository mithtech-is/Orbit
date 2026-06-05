"use client";

import type { JSX } from "react";

import { useState } from "react";
import Link from "next/link";
import { apiClient } from "../api-service";
import { Logo } from "../logo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage(): JSX.Element {
  const [email, setEmail] = useState("");
  const [orgId, setOrgId] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiClient.forgotPassword({ email, organisationId: orgId });
    } catch {
      // Intentionally ignore — the endpoint never reveals whether the account exists.
    } finally {
      setLoading(false);
      setSent(true);
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
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Reset your password</h1>
          {sent ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">If that account exists, we&apos;ve emailed a reset link. It expires in 30 minutes.</p>
              <p className="mt-4 text-center text-sm"><Link href="/login" className="text-primary hover:underline">Back to sign in</Link></p>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">Enter your work email and organisation and we&apos;ll send a reset link.</p>
              <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="fp-email">Work email</Label>
                  <Input id="fp-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="fp-org">Organisation</Label>
                  <Input id="fp-org" type="text" autoCapitalize="none" value={orgId} onChange={(e) => setOrgId(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>{loading ? "Sending…" : "Send reset link"}</Button>
                <p className="text-center text-sm"><Link href="/login" className="text-primary hover:underline">Back to sign in</Link></p>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
