"use client";

import { useEffect, useState } from "react";
import { Boxes, PackageSearch, ShieldAlert, ShoppingCart } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { KpiCard } from "@/components/kpi-card";
import { LoadingState } from "@/components/loading-state";
import { SeverityBadge } from "@/components/severity-badge";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { api } from "@/lib/api";
import type { SpareRecommendation } from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default function SparesPage() {
  const [spares, setSpares] = useState<SpareRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getSpareRecommendations();
        if (!active) return;
        setSpares(data);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load spare recommendations.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <LoadingState title="Loading spares recommendation panel" description="Forecasting 30-day demand and highlighting critical material gaps." />;
  }

  if (error) {
    return <EmptyState title="Spares panel unavailable" description={error} />;
  }

  const lowStockCritical = spares.filter((item) => item.stock_status === "Critical Low").length;
  const projectedDemand = spares.reduce((total, item) => total + item.forecast_30d, 0);
  const immediateReorders = spares.filter((item) => item.recommended_reorder_qty > 0).length;

  const columns: DataTableColumn<SpareRecommendation>[] = [
    { key: "part_id", header: "Part ID", sortable: true, className: "font-medium text-ink-900" },
    { key: "component", header: "Component", render: (row) => <div className="max-w-[220px]">{row.component}</div> },
    { key: "vendor", header: "Vendor", sortable: true },
    { key: "current_stock", header: "Stock", sortable: true, align: "right" },
    { key: "lead_time_days", header: "Lead Time", sortable: true, align: "right", render: (row) => `${row.lead_time_days}d` },
    { key: "avg_monthly_usage", header: "Avg Usage", sortable: true, align: "right" },
    { key: "criticality", header: "Criticality", sortable: true, render: (row) => <SeverityBadge severity={row.criticality === "High" ? "High" : row.criticality === "Medium" ? "Medium" : "Low"} /> },
    { key: "reorder_threshold", header: "Threshold", sortable: true, align: "right" },
    { key: "forecast_30d", header: "Forecast 30d", sortable: true, align: "right" },
    { key: "recommended_reorder_qty", header: "Reorder Qty", sortable: true, align: "right", className: "font-semibold text-ink-900" },
    { key: "stock_status", header: "Stock Status", sortable: true, render: (row) => <StatusBadge value={row.stock_status} /> },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Material Planning"
        title="Spares recommendation panel"
        description="Prioritized material view combining current stock, lead time, monthly usage, and business-rule reorder recommendations."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Tracked Parts" value={formatNumber(spares.length)} description="Parts mapped to defect-driven fleet components" icon={Boxes} />
        <KpiCard title="Critical Low" value={String(lowStockCritical)} description="High-criticality parts below reorder threshold" icon={ShieldAlert} accent="danger" />
        <KpiCard title="Projected Demand" value={formatNumber(projectedDemand)} description="Total 30-day forecast across tracked line items" icon={PackageSearch} accent="warning" />
        <KpiCard title="Immediate Reorders" value={String(immediateReorders)} description="Parts requiring a positive reorder recommendation" icon={ShoppingCart} accent="warning" />
      </div>

      <section className="panel p-6">
        <div className="mb-5 grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Top exposure line item</p>
            <p className="mt-3 text-lg font-semibold text-ink-900">{spares[0]?.component}</p>
            <p className="mt-2 text-sm text-slate-500">Estimated line value {formatCurrency((spares[0]?.recommended_reorder_qty || 0) * (spares[0]?.unit_cost || 0))}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Longest lead-time urgent item</p>
            <p className="mt-3 text-lg font-semibold text-ink-900">
              {spares.filter((item) => item.recommended_reorder_qty > 0).sort((left, right) => right.lead_time_days - left.lead_time_days)[0]?.part_id || "None"}
            </p>
            <p className="mt-2 text-sm text-slate-500">Highest lead-time reorder candidate across the current material set</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Healthy stock coverage</p>
            <p className="mt-3 text-lg font-semibold text-ink-900">{spares.filter((item) => item.stock_status === "Healthy").length} parts</p>
            <p className="mt-2 text-sm text-slate-500">Tracked parts currently above reorder thresholds</p>
          </div>
        </div>

        <DataTable data={spares} columns={columns} rowKey={(row) => row.part_id} initialSort={{ key: "recommended_reorder_qty", direction: "desc" }} />
      </section>
    </div>
  );
}
