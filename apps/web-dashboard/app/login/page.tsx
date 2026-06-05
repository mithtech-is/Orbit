"use client";

import type { JSX } from "react";

import { useState } from "react";
import Link from "next/link";
import { loginUser } from "../api-service";
import { useRouter } from "next/navigation";
import { Logo } from "../logo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage(): JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgId, setOrgId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await loginUser(email, password, orgId);
      router.push("/");
    } catch {
      setError("Sign-in failed. Check your details and try again.");
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
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Sign in to your workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage field teams, visits, routes and orders from one place.</p>
          <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="li-email">Work email</Label>
              <Input id="li-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="li-pass">Password</Label>
              <Input id="li-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="li-org">Organisation</Label>
              <Input id="li-org" type="text" autoCapitalize="none" autoComplete="organization" value={orgId} onChange={(e) => setOrgId(e.target.value)} required />
            </div>
            {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}
            <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
            <p className="text-center text-sm">
              <Link href="/forgot-password" className="text-primary hover:underline">Forgot your password?</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
