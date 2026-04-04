"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Bot, Cable, CheckCheck, PlugZap, RefreshCcw } from "lucide-react";

import { useWorkspace } from "@/components/workspace-provider";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { KpiCard } from "@/components/kpi-card";
import { LoadingState } from "@/components/loading-state";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type {
  ConnectorCatalogItem,
  ConnectorCursorState,
  ConnectorHealthSummary,
  ConnectorManifest,
  ConnectorSummary,
  ConnectorValidationResult,
  SyncHistoryItem,
} from "@/lib/types";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";

function sampleConfigValue(key: string) {
  if (key.includes("endpoint")) return "https://ops.airline.local/api";
  if (key.includes("username")) return "svc_aog_connector";
  if (key.includes("password")) return "secure-password";
  if (key.includes("client_id")) return "aog-sentinel-client";
  if (key.includes("client_secret")) return "client-secret";
  if (key.includes("warehouse")) return "BOM_SPARES";
  return "configured";
}

export default function ConnectorsPage() {
  const { workspaceId, workspace, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const [catalog, setCatalog] = useState<ConnectorCatalogItem[]>([]);
  const [connectors, setConnectors] = useState<ConnectorSummary[]>([]);
  const [health, setHealth] = useState<ConnectorHealthSummary | null>(null);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [manifest, setManifest] = useState<ConnectorManifest | null>(null);
  const [syncHistory, setSyncHistory] = useState<SyncHistoryItem[]>([]);
  const [cursor, setCursor] = useState<ConnectorCursorState | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState<ConnectorValidationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [connectorData, healthData, catalogData] = await Promise.all([
          api.getConnectors(workspaceId),
          api.getConnectorHealth(workspaceId),
          api.getConnectorCatalog(),
        ]);
        if (!active) return;
        setConnectors(connectorData);
        setHealth(healthData);
        setCatalog(catalogData);
        setSelectedConnectorId((current) => current && connectorData.some((item) => item.connector_id === current) ? current : connectorData[0]?.connector_id || null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load connector inventory.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!selectedConnectorId) return;
    const connectorId = selectedConnectorId;
    let active = true;

    async function loadDetail() {
      setDetailLoading(true);
      try {
        const [manifestData, historyData, cursorData] = await Promise.all([
          api.getConnectorSchema(connectorId),
          api.getConnectorSyncHistory(connectorId),
          api.getConnectorCursor(connectorId),
        ]);
        if (!active) return;
        setManifest(manifestData);
        setSyncHistory(historyData);
        setCursor(cursorData);
        setValidation(null);
        setConfigValues((current) => {
          const next = { ...current };
          manifestData.config_fields.forEach((field) => {
            if (!(field.key in next)) next[field.key] = "";
          });
          return next;
        });
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load connector manifest.");
      } finally {
        if (active) setDetailLoading(false);
      }
    }

    void loadDetail();
    return () => {
      active = false;
    };
  }, [selectedConnectorId]);

  const selectedConnector = useMemo(
    () => connectors.find((item) => item.connector_id === selectedConnectorId) || null,
    [connectors, selectedConnectorId]
  );

  const columns: DataTableColumn<ConnectorSummary>[] = [
    {
      key: "name",
      header: "Connector",
      sortable: true,
      render: (row) => (
        <button type="button" className="text-left" onClick={() => setSelectedConnectorId(row.connector_id)}>
          <div className="font-medium text-ink-900">{row.name}</div>
          <div className="text-xs text-slate-500">{row.package_name}</div>
        </button>
      ),
    },
    { key: "source_category", header: "Source", sortable: true },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (row) => <StatusBadge value={row.status} />,
    },
    { key: "sync_mode", header: "Sync mode", sortable: true },
    {
      key: "health_score",
      header: "Health",
      sortable: true,
      align: "right",
      render: (row) => <span className="font-medium text-ink-900">{row.health_score}</span>,
    },
    {
      key: "last_sync",
      header: "Last sync",
      sortable: true,
      render: (row) => <span className="text-xs text-slate-500">{formatDateTime(row.last_sync)}</span>,
    },
  ];

  const historyColumns: DataTableColumn<SyncHistoryItem>[] = [
    { key: "run_id", header: "Run" },
    {
      key: "started_at",
      header: "Started",
      render: (row) => <span className="text-xs text-slate-500">{formatDateTime(row.started_at)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge value={row.status} />,
    },
    {
      key: "records_processed",
      header: "Records",
      align: "right",
      render: (row) => formatNumber(row.records_processed),
    },
  ];

  const degradedCount = useMemo(() => {
    if (!health) return 0;
    return health.warning_connectors + health.failed_connectors;
  }, [health]);

  const handleLoadSample = () => {
    if (!manifest) return;
    const nextValues: Record<string, string> = {};
    manifest.config_fields.forEach((field) => {
      nextValues[field.key] = sampleConfigValue(field.key);
    });
    setConfigValues(nextValues);
  };

  const handleValidate = async () => {
    if (!selectedConnectorId) return;
    const connectorId = selectedConnectorId;
    const result = await api.validateConnectorConfig(connectorId, configValues);
    setValidation(result);
  };

  if (workspaceLoading || loading) {
    return <LoadingState title="Loading connector control plane" description="Resolving workspace manifests, sync history, and runtime health." />;
  }

  if (workspaceError || error || !workspace || !health) {
    return <EmptyState title="Connector control plane unavailable" description={workspaceError || error || "Unable to load connector inventory."} />;
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Connector SDK"
        title="Manifest-driven integration control plane"
        description="Hosted and airline-side connector runtimes share the same normalized schema, validation contract, and sync observability model."
        action={
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Active workspace</p>
            <p className="mt-1 font-semibold text-ink-900">{workspace.airline_name}</p>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Connectors" value={formatNumber(health.total_connectors)} description="Registered adapters in the active airline workspace" icon={PlugZap} />
        <KpiCard title="Healthy" value={formatNumber(health.healthy_connectors)} description="Connectors within policy and sync tolerance" icon={CheckCheck} accent="success" />
        <KpiCard title="Degraded" value={formatNumber(degradedCount)} description="Warning or failed connectors needing intervention" icon={Activity} accent="warning" />
        <KpiCard title="Avg Health" value={health.average_health_score.toFixed(1)} description="Aggregate runtime health across connector workers" icon={Cable} accent="aqua" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="panel p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-ink-900">Connector registry</h3>
              <p className="mt-1 text-sm text-slate-600">Select a connector to inspect its manifest, supported entities, and validation schema.</p>
            </div>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
          <DataTable data={connectors} columns={columns} rowKey={(row) => row.connector_id} initialSort={{ key: "health_score", direction: "desc" }} rowClassName={(row) => row.connector_id === selectedConnectorId ? "bg-aqua/10" : undefined} />
        </div>

        <div className="space-y-6">
          <div className="panel p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Selected connector</p>
                <h3 className="mt-2 text-lg font-semibold text-ink-900">{selectedConnector?.name || "Select a connector"}</h3>
                <p className="mt-2 text-sm text-slate-600">{selectedConnector?.package_name || "Manifest and runtime metadata appear here once selected."}</p>
              </div>
              {selectedConnector ? <StatusBadge value={selectedConnector.status} /> : null}
            </div>
            {selectedConnector ? (
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Deployment</p>
                  <p className="mt-1 font-medium text-ink-900">{selectedConnector.deployment_target}</p>
                  <p className="text-sm text-slate-500">{selectedConnector.runtime_location}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Contract</p>
                  <p className="mt-1 font-medium text-ink-900">Schema {selectedConnector.schema_version}</p>
                  <p className="text-sm text-slate-500">Version {selectedConnector.version}</p>
                </div>
              </div>
            ) : null}
            {manifest ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {manifest.supported_entities.map((entity) => (
                  <span key={entity} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                    {entity}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="panel p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-ink-900">Configuration validation</h3>
                <p className="mt-1 text-sm text-slate-600">Manifest fields are rendered directly from the connector schema.</p>
              </div>
              <Button variant="secondary" onClick={handleLoadSample} disabled={!manifest}>
                Load sample
              </Button>
            </div>
            {detailLoading ? <p className="mt-4 text-sm text-slate-500">Loading manifest…</p> : null}
            {manifest ? (
              <div className="mt-4 space-y-3">
                {manifest.config_fields.map((field) => (
                  <div key={field.key}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <label className="font-medium text-ink-900" htmlFor={field.key}>
                        {field.label}
                      </label>
                      <span className="text-xs text-slate-400">{field.required ? "Required" : "Optional"}</span>
                    </div>
                    <Input
                      id={field.key}
                      type={field.secret ? "password" : "text"}
                      value={configValues[field.key] || ""}
                      placeholder={field.description}
                      onChange={(event) => setConfigValues((current) => ({ ...current, [field.key]: event.target.value }))}
                    />
                    <p className="mt-1 text-xs text-slate-500">{field.description}</p>
                  </div>
                ))}
                <Button onClick={() => void handleValidate()} disabled={!selectedConnectorId}>
                  <Bot className="h-4 w-4" />
                  Validate configuration
                </Button>
                {validation ? (
                  <div className={cn(
                    "rounded-2xl border px-4 py-3 text-sm",
                    validation.valid ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"
                  )}>
                    <p className="font-medium">{validation.message}</p>
                    {validation.missing_required_fields.length ? <p className="mt-1">Missing: {validation.missing_required_fields.join(", ")}</p> : null}
                    {validation.unknown_fields.length ? <p className="mt-1">Unknown: {validation.unknown_fields.join(", ")}</p> : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Select a connector to review configuration fields.</p>
            )}
          </div>
        </div>
      </div>

      <div className="panel p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-ink-900">Packaged connector catalog</h3>
            <p className="mt-1 text-sm text-slate-600">Local example adapters ship with the platform and can run in hosted or airline-side edge modes.</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
            {formatNumber(catalog.length)} packages
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {catalog.map((item) => {
            const installed = connectors.some((connector) => connector.package_name === item.package_name);
            return (
              <div key={item.connector_key} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink-900">{item.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.package_name}</p>
                  </div>
                  <StatusBadge value={installed ? "Installed" : "Available"} />
                </div>
                <p className="mt-3 text-sm text-slate-600">{item.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">{item.source_category}</span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">Schema {item.schema_version}</span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">{item.edge_supported ? "Hosted + edge" : "Hosted"}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel p-6">
        <h3 className="text-lg font-semibold text-ink-900">Sync history</h3>
        <p className="mt-1 text-sm text-slate-600">Recent connector executions, record counts, and run outcomes.</p>
        {cursor ? (
          <div className="mt-4 grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Cursor</p>
              <p className="mt-2 text-sm font-medium text-ink-900">{cursor.cursor_value || "Not established"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Checkpoint</p>
              <p className="mt-2 text-sm font-medium text-ink-900">{formatDateTime(cursor.checkpoint_at)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Raw state keys</p>
              <p className="mt-2 text-sm font-medium text-ink-900">{formatNumber(Object.keys(cursor.raw_state || {}).length)}</p>
            </div>
          </div>
        ) : null}
        <div className="mt-4">
          <DataTable data={syncHistory} columns={historyColumns} rowKey={(row) => row.run_id} initialSort={{ key: "started_at", direction: "desc" }} />
        </div>
      </div>
    </div>
  );
}
