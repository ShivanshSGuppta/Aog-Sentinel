"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Filter, Siren, Timer } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { KpiCard } from "@/components/kpi-card";
import { LoadingState } from "@/components/loading-state";
import { RiskBadge } from "@/components/risk-badge";
import { SeverityBadge } from "@/components/severity-badge";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { AogIncident } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const severityOptions = ["All", "Critical", "High", "Medium", "Low"];
const statusOptions = ["All", "Open", "In Work", "Deferred", "Closed"];

export default function AogPage() {
  const [incidents, setIncidents] = useState<AogIncident[]>([]);
  const [severityFilter, setSeverityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [aircraftFilter, setAircraftFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getAogIncidents();
        if (!active) return;
        setIncidents(data);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load incident queue.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  const aircraftOptions = useMemo(() => ["All", ...new Set(incidents.map((item) => item.aircraft_label))], [incidents]);

  const filtered = useMemo(() => {
    return incidents.filter((item) => {
      const matchesSeverity = severityFilter === "All" || item.severity === severityFilter;
      const matchesStatus = statusFilter === "All" || item.status === statusFilter;
      const matchesAircraft = aircraftFilter === "All" || item.aircraft_label === aircraftFilter;
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        [item.defect_id, item.component, item.ata_chapter, item.defect_description, item.aircraft_label]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return matchesSeverity && matchesStatus && matchesAircraft && matchesSearch;
    });
  }, [aircraftFilter, incidents, search, severityFilter, statusFilter]);

  if (loading) {
    return <LoadingState title="Loading AOG queue" description="Scoring current high-priority incidents for engineering attention." />;
  }

  if (error) {
    return <EmptyState title="AOG queue unavailable" description={error} />;
  }

  const avgRisk = filtered.length ? filtered.reduce((total, item) => total + item.risk_score, 0) / filtered.length : 0;
  const columns: DataTableColumn<AogIncident>[] = [
    { key: "defect_id", header: "Defect", sortable: true, className: "font-medium text-ink-900" },
    { key: "aircraft_label", header: "Aircraft", sortable: true },
    { key: "report_date", header: "Date", sortable: true, render: (row) => formatDate(row.report_date) },
    { key: "ata_chapter", header: "ATA" },
    { key: "component", header: "Component", render: (row) => <div className="max-w-[190px]">{row.component}</div> },
    { key: "defect_description", header: "Defect Description", render: (row) => <div className="max-w-[280px] leading-6">{row.defect_description}</div> },
    { key: "severity", header: "Severity", sortable: true, render: (row) => <SeverityBadge severity={row.severity} /> },
    { key: "delay_minutes", header: "Delay", sortable: true, align: "right", render: (row) => `${row.delay_minutes}m` },
    { key: "repeat_defect", header: "Repeat", sortable: true, align: "center", render: (row) => <StatusBadge value={row.repeat_defect ? "Open" : "Closed"} /> },
    { key: "risk_score", header: "Risk", sortable: true, align: "right", render: (row) => <RiskBadge score={row.risk_score} /> },
    { key: "recommended_action", header: "Recommended Action", render: (row) => <div className="max-w-[300px] leading-6">{row.recommended_action}</div> },
    { key: "status", header: "Status", sortable: true, render: (row) => <StatusBadge value={row.aog_flag ? "AOG" : row.status} /> },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="AOG Control"
        title="Prioritized AOG and high-risk incident queue"
        description="Interactive queue for dispatch-critical defects with filters for severity, aircraft, status, and recommended next action."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Queue Depth" value={String(filtered.length)} description="Incidents currently matching the applied filters" icon={Siren} accent="danger" />
        <KpiCard title="Active AOG" value={String(filtered.filter((item) => item.aog_flag).length)} description="Incidents explicitly flagged as AOG" icon={AlertTriangle} accent="danger" />
        <KpiCard title="Repeat Cases" value={String(filtered.filter((item) => item.repeat_defect).length)} description="Incidents linked to recurrence history" icon={Timer} accent="warning" />
        <KpiCard title="Average Risk" value={avgRisk.toFixed(1)} description="Mean risk score across the filtered incident queue" icon={Filter} accent="warning" />
      </div>

      <section className="panel p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search defect, component, ATA, or aircraft" />
          <Select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
            {severityOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
          <Select value={aircraftFilter} onChange={(event) => setAircraftFilter(event.target.value)}>
            {aircraftOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </div>
      </section>

      {filtered.length === 0 ? (
        <EmptyState title="No incidents match these filters" description="Adjust severity, aircraft, or status filters to broaden the current AOG view." />
      ) : (
        <div className="panel p-6">
          <DataTable
            data={filtered}
            columns={columns}
            rowKey={(row) => row.defect_id}
            initialSort={{ key: "risk_score", direction: "desc" }}
            rowClassName={(row) => (row.severity === "Critical" || row.risk_score >= 85 ? "border-l-4 border-l-danger" : undefined)}
          />
        </div>
      )}
    </div>
  );
}
