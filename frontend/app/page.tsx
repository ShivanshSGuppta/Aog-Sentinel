import Link from "next/link";
import { ArrowRight, BellRing, BriefcaseBusiness, FileSearch, Globe2, PlugZap, ShieldCheck, TriangleAlert } from "lucide-react";

import { SectionHeader } from "@/components/section-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    title: "Fleet Monitoring",
    description: "ATA-driven defect visibility, aircraft risk ranking, and dispatch-impacting event tracking across the active fleet.",
    icon: ShieldCheck,
  },
  {
    title: "Incident Command",
    description: "Triage severe and repeat incidents by operational impact, delay exposure, recurrence, and spares dependency.",
    icon: TriangleAlert,
  },
  {
    title: "Network Intelligence",
    description: "Monitor live aircraft positions, owned-fleet overlays, maintenance bases, and disruption hotspots in one map workspace.",
    icon: Globe2,
  },
  {
    title: "Connector Control Plane",
    description: "Manage manifest-driven integrations, schema validation, sync health, and hybrid connector runtimes for airline systems.",
    icon: PlugZap,
  },
  {
    title: "Alerting",
    description: "Route normalized operational events into risk-based alerts with ownership, severity, and engineering context.",
    icon: BellRing,
  },
  {
    title: "Case Workflow",
    description: "Track SLA clocks, investigation ownership, and timeline state from alert triage through engineering action.",
    icon: BriefcaseBusiness,
  },
  {
    title: "Technical Retrieval",
    description: "Search maintenance excerpts, MEL guidance, vendor bulletins, and reliability notes with local semantic retrieval.",
    icon: FileSearch,
  },
];

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="panel overflow-hidden">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="p-8 sm:p-10">
            <p className="text-xs uppercase tracking-[0.32em] text-slate-400">Aircraft Fleet Reliability & Maintenance Intelligence</p>
            <h2 className="mt-4 max-w-4xl text-4xl font-semibold leading-tight sm:text-5xl">
              Airline engineering operations, connector orchestration, and network intelligence in one workspace.
            </h2>
            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600">
              AOG Sentinel combines a fleet reliability control tower with a connector-based airline data plane. Engineering teams can monitor defects, triage incidents,
              manage alerts and cases, inspect spares exposure, retrieve technical references, and watch live network activity with airline overlays.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/dashboard">
                  Open Dashboard
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/flights">Open Network Workspace</Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/connectors">Review Connectors</Link>
              </Button>
            </div>
          </div>

          <div className="subtle-grid border-l border-slate-200/80 bg-ink-950 p-8 text-white sm:p-10">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <p className="text-xs uppercase tracking-[0.24em] text-aqua/90">Platform Snapshot</p>
              <div className="mt-6 space-y-5">
                <div>
                  <p className="text-4xl font-semibold">2</p>
                  <p className="mt-1 text-sm text-white/65">Airline workspaces with hybrid deployment support and isolated control-plane context</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-2xl font-semibold">5</p>
                    <p className="mt-1 text-sm text-white/65">Manifest-driven connectors covering defects, spares, documents, and flight operations</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-2xl font-semibold">7</p>
                    <p className="mt-1 text-sm text-white/65">Operational modules spanning engineering analytics, cases, alerts, documents, and network intelligence</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SectionHeader
        eyebrow="Platform Overview"
        title="Built for airline engineering, reliability, and operations-control conversations"
        description="Each module maps to a credible maintenance-control or airline SaaS workflow rather than a generic BI dashboard."
      />

      <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-4">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <Card key={feature.title}>
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-aqua/15 text-ink-900">
                  <Icon className="h-5 w-5" />
                </div>
                <CardTitle className="mt-4">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm leading-6 text-slate-600">{feature.description}</CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
