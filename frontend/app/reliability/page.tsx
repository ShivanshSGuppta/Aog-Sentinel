"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Building2, RefreshCw, ShieldAlert, TimerReset } from "lucide-react";

import { ChartCard } from "@/components/chart-card";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { KpiCard } from "@/components/kpi-card";
import { LoadingState } from "@/components/loading-state";
import { RiskBadge } from "@/components/risk-badge";
import { SectionHeader } from "@/components/section-header";
import { api } from "@/lib/api";
import { CHART_COLORS } from "@/lib/constants";
import type {
  AircraftSummary,
  AtaBreakdownItem,
  ComponentIssueItem,
  MonthlyRepeatDefectItem,
  RectificationDistributionItem,
  ReliabilitySummary,
  VendorIssueItem,
} from "@/lib/types";
import { formatHours, formatPercent } from "@/lib/utils";

export default function ReliabilityPage() {
  const [summary, setSummary] = useState<ReliabilitySummary | null>(null);
  const [ataData, setAtaData] = useState<AtaBreakdownItem[]>([]);
  const [repeatData, setRepeatData] = useState<MonthlyRepeatDefectItem[]>([]);
  const [vendorData, setVendorData] = useState<VendorIssueItem[]>([]);
  const [componentData, setComponentData] = useState<ComponentIssueItem[]>([]);
  const [rectification, setRectification] = useState<RectificationDistributionItem[]>([]);
  const [aircraftRanking, setAircraftRanking] = useState<AircraftSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [summaryData, ataResponse, repeatResponse, vendorResponse, componentResponse, rectificationResponse, aircraftResponse] = await Promise.all([
          api.getReliabilitySummary(),
          api.getReliabilityAta(),
          api.getReliabilityRepeatDefects(),
          api.getReliabilityVendors(),
          api.getReliabilityComponents(),
          api.getReliabilityRectificationDistribution(),
          api.getAircraftRiskRanking(),
        ]);

        if (!active) return;
        setSummary(summaryData);
        setAtaData(ataResponse);
        setRepeatData(repeatResponse);
        setVendorData(vendorResponse);
        setComponentData(componentResponse);
        setRectification(rectificationResponse);
        setAircraftRanking(aircraftResponse);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load reliability analytics.");
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
    return <LoadingState title="Loading reliability analytics" description="Aggregating ATA, vendor, and recurrence performance across the fleet." />;
  }

  if (error || !summary) {
    return <EmptyState title="Reliability analytics unavailable" description={error || "Unable to load reliability data from the API."} />;
  }

  const worstComponents = componentData.slice(0, 10);
  const topRepeatAircraft = [...aircraftRanking].sort((left, right) => right.repeat_defects - left.repeat_defects).slice(0, 8);

  const componentColumns: DataTableColumn<ComponentIssueItem>[] = [
    { key: "component", header: "Component", sortable: true, className: "font-medium text-ink-900" },
    { key: "ata_chapter", header: "ATA" },
    { key: "vendor", header: "Vendor" },
    { key: "defect_count", header: "Defects", sortable: true, align: "right" },
    { key: "repeat_defect_count", header: "Repeat", sortable: true, align: "right" },
    { key: "average_risk_score", header: "Avg Risk", sortable: true, align: "right", render: (row) => <RiskBadge score={row.average_risk_score} /> },
  ];

  const vendorColumns: DataTableColumn<VendorIssueItem>[] = [
    { key: "vendor", header: "Vendor", sortable: true, className: "font-medium text-ink-900" },
    { key: "defect_count", header: "Defects", sortable: true, align: "right" },
    { key: "repeat_defect_count", header: "Repeat", sortable: true, align: "right" },
    { key: "aog_count", header: "AOG", sortable: true, align: "right" },
    { key: "average_risk_score", header: "Avg Risk", sortable: true, align: "right", render: (row) => <RiskBadge score={row.average_risk_score} /> },
  ];

  const aircraftColumns: DataTableColumn<AircraftSummary>[] = [
    { key: "tail_number", header: "Aircraft", sortable: true, className: "font-medium text-ink-900" },
    { key: "base_station", header: "Base", sortable: true },
    { key: "repeat_defects", header: "Repeat", sortable: true, align: "right" },
    { key: "open_defects", header: "Open", sortable: true, align: "right" },
    { key: "current_risk_score", header: "Risk", sortable: true, align: "right", render: (row) => <RiskBadge score={row.current_risk_score} /> },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Reliability Review"
        title="Fleet reliability analytics for engineering governance"
        description="Use ATA, repeat defect, vendor, component, and rectification views to support reliability meetings and engineering action tracking."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard title="Repeat Defect Rate" value={formatPercent(summary.repeat_defect_rate)} description="Repeat defects as a share of total defect volume" icon={RefreshCw} accent="warning" />
        <KpiCard title="AOG Rate" value={formatPercent(summary.aog_rate)} description="AOG event concentration across all defects" icon={ShieldAlert} accent="danger" />
        <KpiCard title="Mean Rectification" value={formatHours(summary.average_rectification_hours)} description="Average rectification effort across the fleet" icon={Activity} accent="success" />
        <KpiCard title="Top ATA" value={summary.most_problematic_ata_chapter} description="ATA chapter driving the highest defect load" icon={TimerReset} accent="warning" />
        <KpiCard title="Top Vendor" value={summary.most_problematic_vendor} description="Vendor with the highest issue concentration" icon={Building2} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="ATA reliability breakdown" description="ATA concentration with AOG and repeat context for fleet-level system performance." contentClassName="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ataData.slice(0, 8)} layout="vertical" margin={{ left: 36 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fill: CHART_COLORS.secondary, fontSize: 12 }} />
              <YAxis dataKey="ata_chapter" type="category" width={120} tick={{ fill: CHART_COLORS.secondary, fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="defect_count" fill={CHART_COLORS.primary} radius={[0, 10, 10, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Repeat defects by month" description="Monthly recurrence trend for reliability control and escalation tracking." contentClassName="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={repeatData}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fill: CHART_COLORS.secondary, fontSize: 12 }} />
              <YAxis tick={{ fill: CHART_COLORS.secondary, fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="repeat_defect_count" stroke={CHART_COLORS.accent} strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="total_defects" stroke={CHART_COLORS.secondary} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <ChartCard title="Vendor issue frequency" description="Vendor concentration supports reliability and supply-quality review." contentClassName="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={vendorData.slice(0, 8)}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
              <XAxis dataKey="vendor" tick={{ fill: CHART_COLORS.secondary, fontSize: 11 }} angle={-20} textAnchor="end" height={70} />
              <YAxis tick={{ fill: CHART_COLORS.secondary, fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="defect_count" fill={CHART_COLORS.accent} radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Rectification hours distribution" description="Distribution of rectification effort for maintenance planning and support resource visibility." contentClassName="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rectification}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
              <XAxis dataKey="bucket" tick={{ fill: CHART_COLORS.secondary, fontSize: 12 }} />
              <YAxis tick={{ fill: CHART_COLORS.secondary, fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="item_count" fill={CHART_COLORS.secondary} radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <ChartCard title="Worst-performing components" description="Highest-frequency components with repeat tendency and elevated risk." contentClassName="pt-0">
          <DataTable data={worstComponents} columns={componentColumns} rowKey={(row) => `${row.component}-${row.vendor}`} initialSort={{ key: "defect_count", direction: "desc" }} />
        </ChartCard>
        <ChartCard title="Top repeat defect aircraft" description="Aircraft most affected by recurrent issues over the current data set." contentClassName="pt-0">
          <DataTable data={topRepeatAircraft} columns={aircraftColumns} rowKey={(row) => row.aircraft_id} initialSort={{ key: "repeat_defects", direction: "desc" }} />
        </ChartCard>
      </div>

      <ChartCard title="Vendor issue counts" description="Supporting vendor-level view for engineering governance and supplier review." contentClassName="pt-0">
        <DataTable data={vendorData} columns={vendorColumns} rowKey={(row) => row.vendor} initialSort={{ key: "defect_count", direction: "desc" }} />
      </ChartCard>
    </div>
  );
}
