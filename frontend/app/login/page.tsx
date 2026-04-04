"use client";

import { useState } from "react";
import { Radar, ShieldCheck } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const { login, loading, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-radar px-4 py-10 sm:px-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(126,215,224,0.22),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(11,32,61,0.16),transparent_24%)]" />
      <div className="relative grid w-full max-w-5xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="panel overflow-hidden bg-ink-950 text-white">
          <div className="subtle-grid h-full p-8 sm:p-10">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-aqua text-ink-950">
                <Radar className="h-7 w-7" />
              </div>
              <div>
                <p className="font-display text-2xl font-semibold">AOG Sentinel</p>
                <p className="text-sm text-white/64">Airline engineering control plane and network intelligence workspace</p>
              </div>
            </div>
            <div className="mt-12 space-y-8">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-aqua/80">Airline engineering control plane</p>
                <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight text-white">Persistent control plane, connector orchestration, reliability analytics, and network operations in one stack.</h1>
                <p className="mt-5 max-w-2xl text-sm leading-7 text-white/68">
                  Sign in to access workspace-scoped reliability dashboards, alerting, engineering cases, connector lifecycle management, and the network intelligence workspace.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <p className="text-sm font-semibold">RBAC + workspace isolation</p>
                  <p className="mt-2 text-sm text-white/62">JWT-backed sessions, workspace membership checks, and role-scoped control-plane access.</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <p className="text-sm font-semibold">Hybrid connector runtime</p>
                  <p className="mt-2 text-sm text-white/62">Hosted and airline-edge connectors share the same manifest, cursor, and health model.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Card className="border-slate-200/80 bg-white/95 shadow-panel backdrop-blur">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-aqua/15 text-ink-900">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Secure Sign In</CardTitle>
                <p className="mt-1 text-sm text-slate-500">Use your workspace credentials to enter the control plane.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-900" htmlFor="email">Email</label>
                <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@airline.local" required />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-900" htmlFor="password">Password</label>
                <Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required />
              </div>
              {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
              <Button type="submit" className="w-full" size="lg" disabled={loading || submitting}>
                {submitting ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
