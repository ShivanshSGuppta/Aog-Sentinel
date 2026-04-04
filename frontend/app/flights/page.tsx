"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CloudDrizzle,
  Crosshair,
  Layers3,
  LocateFixed,
  Minus,
  PlaneTakeoff,
  Plus,
  Radar,
  RefreshCcw,
  Route,
  Search,
  TowerControl,
} from "lucide-react";

import { FlightRadarMap, type FlightRadarMapHandle } from "@/components/flight-radar-map";
import { useWorkspace } from "@/components/workspace-provider";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { FlightPosition, NetworkWorkspaceResponse } from "@/lib/types";
import { cn, formatDateTime, formatFeet, formatKnots, formatNumber, formatVerticalRate } from "@/lib/utils";

const REGION_OPTIONS = [
  { value: "global", label: "Global" },
  { value: "north-america", label: "North America" },
  { value: "south-america", label: "South America" },
  { value: "europe", label: "Europe" },
  { value: "africa", label: "Africa" },
  { value: "middle-east", label: "Middle East" },
  { value: "south-asia", label: "South Asia" },
  { value: "east-asia", label: "East Asia" },
  { value: "southeast-asia", label: "Southeast Asia" },
  { value: "oceania", label: "Oceania" },
] as const;

const ALTITUDE_BANDS = [
  { value: "all", label: "All altitudes", min: undefined, max: undefined },
  { value: "surface", label: "Surface to 3,000 ft", min: 0, max: 915 },
  { value: "low", label: "3,000 to 15,000 ft", min: 915, max: 4572 },
  { value: "cruise", label: "15,000 to 35,000 ft", min: 4572, max: 10668 },
  { value: "high", label: "Above 35,000 ft", min: 10668, max: undefined },
] as const;

const FLIGHT_CATEGORY_TABS = [
  { value: "all", label: "All Traffic" },
  { value: "Commercial", label: "Commercial" },
  { value: "Cargo", label: "Cargo" },
  { value: "Private/Business", label: "Private / Business" },
  { value: "Military/Government", label: "Military / Government" },
  { value: "Unknown", label: "Unknown" },
] as const;

const DEFAULT_LAYER_IDS = ["owned_fleet", "watch_aircraft", "maintenance_bases", "hotspots", "airport_congestion"];
const DESKTOP_PANEL_GAP = 14;
const DESKTOP_BOTTOM_SAFE_OFFSET = 156;

function formatFeedState(state: NetworkWorkspaceResponse["flight_overview"]["status"]["state"] | undefined) {
  if (state === "live") return { label: "Live feed", tone: "success" as const };
  if (state === "cached") return { label: "Cached feed", tone: "warning" as const };
  return { label: "Feed unavailable", tone: "danger" as const };
}

function displayCallsign(flight: FlightPosition) {
  return flight.callsign || flight.matched_tail_number || flight.icao24.toUpperCase();
}

function formatGroundState(onGround: boolean) {
  return onGround ? "On Ground" : "Airborne";
}

function formatHeading(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return `${Math.round(value)}°`;
}

function buildRenderedFlights(flights: FlightPosition[], decluttered: boolean, selectedFlightId: string | null) {
  if (!decluttered) return flights;
  const target = 90;
  const step = Math.max(1, Math.ceil(flights.length / target));
  const sampled = flights.filter((_, index) => index % step === 0);
  if (selectedFlightId && !sampled.some((item) => item.icao24 === selectedFlightId)) {
    const selected = flights.find((item) => item.icao24 === selectedFlightId);
    if (selected) sampled.unshift(selected);
  }
  return sampled;
}

function CanvasLoading({ label }: { label: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-[#06080B] text-white">
      <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/72 backdrop-blur">
        <RefreshCcw className="h-4 w-4 animate-spin text-[#7ED7E0]" />
        {label}
      </div>
    </div>
  );
}

function StatChip({ label, value, subvalue }: { label: string; value: string; subvalue?: string }) {
  return (
    <div className="min-w-[128px] rounded-2xl border border-white/10 bg-black/38 px-4 py-3 backdrop-blur-md">
      <p className="text-[10px] uppercase tracking-[0.28em] text-white/42">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
      {subvalue ? <p className="mt-1 text-xs text-white/42">{subvalue}</p> : null}
    </div>
  );
}

function ToneBadge({ label, tone }: { label: string; tone: "success" | "warning" | "danger" | "neutral" }) {
  const toneClasses = {
    success: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
    warning: "border-amber-400/25 bg-amber-400/10 text-amber-200",
    danger: "border-rose-400/25 bg-rose-400/10 text-rose-200",
    neutral: "border-white/12 bg-white/6 text-white/76",
  };

  return <span className={cn("inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium", toneClasses[tone])}>{label}</span>;
}

function InspectorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-white/6 bg-white/[0.03] px-3 py-2.5">
      <span className="text-[11px] uppercase tracking-[0.24em] text-white/38">{label}</span>
      <span className="text-right text-sm font-medium text-white/86">{value}</span>
    </div>
  );
}

function LayerToggle({ label, active, onClick, count }: { label: string; active: boolean; onClick: () => void; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-4 py-2 text-sm font-medium transition",
        active ? "border-[#7ED7E0]/40 bg-[#7ED7E0]/12 text-[#DDF9FC]" : "border-white/10 bg-white/[0.04] text-white/66 hover:bg-white/[0.08]"
      )}
    >
      {label} <span className="ml-1 text-xs opacity-70">{count}</span>
    </button>
  );
}

export default function FlightsPage() {
  const radarMapRef = useRef<FlightRadarMapHandle | null>(null);
  const topPanelRef = useRef<HTMLDivElement | null>(null);
  const hasLoadedOnceRef = useRef(false);
  const networkDataRef = useRef<NetworkWorkspaceResponse | null>(null);
  const { workspaceId, workspace, loading: workspaceLoading, error: workspaceError } = useWorkspace();

  const [networkData, setNetworkData] = useState<NetworkWorkspaceResponse | null>(null);
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [region, setRegion] = useState("global");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [airlineFilter, setAirlineFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [altitudeBand, setAltitudeBand] = useState("all");
  const [groundFilter, setGroundFilter] = useState("all");
  const [decluttered, setDecluttered] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeLayerIds, setActiveLayerIds] = useState<string[]>(DEFAULT_LAYER_IDS);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [topPanelHeight, setTopPanelHeight] = useState(168);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(queryInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    networkDataRef.current = networkData;
  }, [networkData]);

  const altitudeRange = useMemo(() => ALTITUDE_BANDS.find((item) => item.value === altitudeBand) || ALTITUDE_BANDS[0], [altitudeBand]);

  const onGround = useMemo(() => {
    if (groundFilter === "airborne") return false;
    if (groundFilter === "ground") return true;
    return undefined;
  }, [groundFilter]);

  const requestParams = useMemo(
    () => ({
      region,
      limit: 250,
      min_altitude: altitudeRange.min,
      max_altitude: altitudeRange.max,
      query: query || undefined,
      airline: airlineFilter || undefined,
      category: categoryFilter !== "all" ? categoryFilter : undefined,
      include_layers: activeLayerIds.join(","),
      on_ground: onGround,
    }),
    [activeLayerIds, airlineFilter, altitudeRange.max, altitudeRange.min, categoryFilter, onGround, query, region]
  );
  const requestParamsRef = useRef(requestParams);

  useEffect(() => {
    requestParamsRef.current = requestParams;
  }, [requestParams]);

  const loadNetwork = useCallback(
    async (options?: { forceRefresh?: boolean; background?: boolean }) => {
      if (!workspaceId) return;
      const forceRefresh = options?.forceRefresh ?? false;
      const background = options?.background ?? false;
      const hasCurrentData = Boolean(networkDataRef.current);
      const params = requestParamsRef.current;

      if (!hasLoadedOnceRef.current && !hasCurrentData) {
        setInitialLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);

      try {
        const payload = await api.getNetworkWorkspace({
          workspace_id: workspaceId,
          ...params,
          refresh: forceRefresh,
        });

        setNetworkData(payload);
        setSelectedFlightId((current) => {
          if (current && payload.flight_feed.items.some((item) => item.icao24 === current)) return current;
          return payload.flight_feed.items[0]?.icao24 || null;
        });
        setActiveLayerIds((current) => {
          const available = payload.layers.map((item) => item.layer_id);
          const next = current.length
            ? current.filter((item) => available.includes(item))
            : payload.layers.filter((item) => item.enabled_default).map((item) => item.layer_id);
          const normalized = next.length ? next : DEFAULT_LAYER_IDS.filter((item) => available.includes(item));
          if (normalized.length === current.length && normalized.every((item, index) => item === current[index])) {
            return current;
          }
          return normalized;
        });
        hasLoadedOnceRef.current = true;
      } catch (err) {
        if (!background || !hasCurrentData) {
          setError(err instanceof Error ? err.message : "Unable to load network intelligence workspace.");
        }
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    [workspaceId]
  );

  useEffect(() => {
    if (!workspaceId) return;
    void loadNetwork({ forceRefresh: false, background: hasLoadedOnceRef.current || Boolean(networkDataRef.current) });
  }, [loadNetwork, requestParams, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    const interval = window.setInterval(() => {
      void loadNetwork({ forceRefresh: false, background: true });
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [loadNetwork, workspaceId]);

  useEffect(() => {
    const node = topPanelRef.current;
    if (!node) return;

    const syncHeight = () => {
      setTopPanelHeight(Math.ceil(node.getBoundingClientRect().height));
    };

    syncHeight();
    window.addEventListener("resize", syncHeight);

    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", syncHeight);
    }

    const observer = new ResizeObserver(() => syncHeight());
    observer.observe(node);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncHeight);
    };
  }, [networkData]);

  const renderedFlights = useMemo(() => buildRenderedFlights(networkData?.flight_feed.items || [], decluttered, selectedFlightId), [decluttered, networkData?.flight_feed.items, selectedFlightId]);
  const selectedFlight = useMemo(() => networkData?.flight_feed.items.find((item) => item.icao24 === selectedFlightId) || null, [networkData?.flight_feed.items, selectedFlightId]);

  const status = networkData?.flight_feed.status || networkData?.flight_overview.status;
  const feedTone = formatFeedState(status?.state);
  const listFlights = renderedFlights.slice(0, 14);
  const watchAircraft = useMemo(() => (networkData?.owned_fleet || []).filter((item) => item.risk_score >= 70).slice(0, 6), [networkData?.owned_fleet]);
  const matchedOwnedFleet = useMemo(() => (networkData?.owned_fleet_matches || []).filter((item) => item.match_status !== "unmatched"), [networkData?.owned_fleet_matches]);
  const categoryFacetMap = useMemo(
    () => new Map((networkData?.category_facets || []).map((item) => [item.category, item.flight_count])),
    [networkData?.category_facets]
  );
  const desktopInspectorTop = topPanelHeight + DESKTOP_PANEL_GAP;
  const refreshLabel = refreshing ? "Refreshing" : "Refresh";

  const toggleLayer = (layerId: string) => {
    setActiveLayerIds((current) => (current.includes(layerId) ? current.filter((item) => item !== layerId) : [...current, layerId]));
  };

  const handleZoomIn = () => radarMapRef.current?.zoomIn();
  const handleZoomOut = () => radarMapRef.current?.zoomOut();
  const handleResetView = () => radarMapRef.current?.resetView();

  const showInitialWorkspaceLoader = (!workspace && workspaceLoading) || (!networkData && initialLoading);

  if (showInitialWorkspaceLoader) {
    return <CanvasLoading label="Loading network intelligence workspace" />;
  }

  if ((!workspace && workspaceError) || (!networkData && error) || !networkData || !workspace) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#06080B] px-6 text-white">
        <div className="max-w-xl rounded-[32px] border border-white/10 bg-[#0A0F15]/82 p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl">
          <h2 className="text-2xl font-semibold">Network workspace unavailable</h2>
          <p className="mt-3 text-sm text-white/62">{workspaceError || error || "Unable to load network data from the API."}</p>
          <Link href="/dashboard" className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm text-white/78">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen overflow-hidden bg-[#06080B] text-white">
      <div className="absolute inset-0">
        <FlightRadarMap
          ref={radarMapRef}
          flights={renderedFlights}
          selectedFlightId={selectedFlightId}
          region={region}
          activeLayerIds={activeLayerIds}
          ownedFleet={networkData.owned_fleet}
          maintenanceBases={networkData.maintenance_bases}
          hotspots={networkData.hotspots}
          weatherLayers={networkData.weather_layers}
          corridorSegments={networkData.corridor_segments}
          airportOverlays={networkData.airport_overlays}
          ownedFleetMatches={networkData.owned_fleet_matches}
          onSelect={(flight) => setSelectedFlightId(flight.icao24)}
          className="rounded-none border-0"
        />
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(126,215,224,0.1),transparent_24%),linear-gradient(180deg,rgba(0,0,0,0.42),transparent_18%,transparent_72%,rgba(0,0,0,0.34))]" />

      <div ref={topPanelRef} className="pointer-events-none absolute inset-x-0 top-0 z-30 p-3 sm:p-5">
        <div className="pointer-events-auto rounded-[28px] border border-[#9FBCD3]/16 bg-[rgba(7,20,35,0.9)] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.36)] backdrop-blur-xl">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-3 rounded-2xl bg-white/[0.05] px-3 py-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#7ED7E0] text-[#071218]">
                  <Radar className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">AOG Sentinel</p>
                  <p className="text-xs uppercase tracking-[0.24em] text-[#A8C4D7]">Network Intelligence</p>
                </div>
              </div>
              <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-sm text-white/84 transition hover:bg-white/[0.1] hover:text-white">
                <ArrowLeft className="h-4 w-4" />
                Back to dashboard
              </Link>
              <ToneBadge label={feedTone.label} tone={feedTone.tone} />
              <ToneBadge label={workspace.airline_name} tone="neutral" />
              {refreshing ? <ToneBadge label="Background refresh" tone="neutral" /> : null}
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(240px,1.2fr)_minmax(180px,0.9fr)_repeat(3,minmax(130px,0.7fr))_auto] xl:min-w-[1060px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/38" />
                <Input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Search callsign, airline, ICAO24, or country" className="border-white/12 bg-white/[0.06] pl-11 text-white shadow-none placeholder:text-white/34" />
              </div>
              <Select value={airlineFilter} onChange={(event) => setAirlineFilter(event.target.value)} className="border-white/12 bg-white/[0.06] text-white shadow-none [&>option]:bg-[#11161D]">
                <option value="">All airlines</option>
                {(networkData.airline_facets || []).filter((option) => option.airline_company !== "Unknown").map((option) => (
                  <option key={option.airline_company} value={option.airline_company}>{option.airline_company}</option>
                ))}
              </Select>
              <Select value={region} onChange={(event) => setRegion(event.target.value)} className="border-white/10 bg-white/[0.05] text-white shadow-none [&>option]:bg-[#11161D]">
                {REGION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
              <Select value={altitudeBand} onChange={(event) => setAltitudeBand(event.target.value)} className="border-white/10 bg-white/[0.05] text-white shadow-none [&>option]:bg-[#11161D]">
                {ALTITUDE_BANDS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
              <Select value={groundFilter} onChange={(event) => setGroundFilter(event.target.value)} className="border-white/10 bg-white/[0.05] text-white shadow-none [&>option]:bg-[#11161D]">
                <option value="all">All traffic</option>
                <option value="airborne">Airborne only</option>
                <option value="ground">On ground only</option>
              </Select>
              <button type="button" onClick={() => void loadNetwork({ forceRefresh: true, background: true })} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]">
                <RefreshCcw className={cn("h-4 w-4 text-[#7ED7E0]", refreshing && "animate-spin")} />
                {refreshLabel}
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/8 pt-3">
            {FLIGHT_CATEGORY_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setCategoryFilter(tab.value)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-medium transition",
                  categoryFilter === tab.value
                    ? "border-[#7ED7E0]/45 bg-[#7ED7E0]/12 text-[#E4FAFD]"
                    : "border-white/12 bg-white/[0.04] text-white/72 hover:bg-white/[0.08]"
                )}
              >
                {tab.label}
                <span className="ml-2 text-xs opacity-70">
                  {tab.value === "all" ? formatNumber(networkData.flight_feed.total_results) : formatNumber(categoryFacetMap.get(tab.value) || 0)}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/8 pt-3">
            {networkData.layers.map((layer) => (
              <LayerToggle key={layer.layer_id} label={layer.label} count={layer.feature_count} active={activeLayerIds.includes(layer.layer_id)} onClick={() => toggleLayer(layer.layer_id)} />
            ))}
          </div>
        </div>
      </div>

      <div
        className="pointer-events-none absolute left-3 z-20 hidden w-[380px] xl:block xl:p-2"
        style={{ top: `${desktopInspectorTop}px`, bottom: `${DESKTOP_BOTTOM_SAFE_OFFSET}px` }}
      >
        <div className="pointer-events-auto flex h-full min-h-0 flex-col rounded-[28px] border border-[#9FBCD3]/16 bg-[rgba(7,20,35,0.92)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.36)] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[#A8C4D7]">Selected flight</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">{selectedFlight ? displayCallsign(selectedFlight) : "No flight selected"}</h2>
              <p className="mt-2 text-sm text-white/72">{selectedFlight ? `${selectedFlight.airline_company || selectedFlight.origin_country} · ${formatGroundState(selectedFlight.on_ground)}` : "Select a live flight from the map or quick list."}</p>
            </div>
            {selectedFlight ? <ToneBadge label={formatGroundState(selectedFlight.on_ground)} tone={selectedFlight.on_ground ? "neutral" : "success"} /> : null}
          </div>

          <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid gap-2">
              <InspectorRow label="Altitude" value={selectedFlight ? formatFeet(selectedFlight.baro_altitude) : "-"} />
              <InspectorRow label="Speed" value={selectedFlight ? formatKnots(selectedFlight.velocity) : "-"} />
              <InspectorRow label="Heading" value={selectedFlight ? formatHeading(selectedFlight.heading) : "-"} />
              <InspectorRow label="Vertical rate" value={selectedFlight ? formatVerticalRate(selectedFlight.vertical_rate) : "-"} />
              <InspectorRow label="Last contact" value={selectedFlight ? formatDateTime(selectedFlight.last_contact) : "-"} />
              <InspectorRow label="Owned match" value={selectedFlight?.matched_tail_number ? `${selectedFlight.matched_tail_number} linked` : "No owned-fleet link"} />
            </div>

            <div className="mt-6 border-t border-white/8 pt-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.28em] text-[#A8C4D7]">Visible flights</p>
                <span className="text-xs text-white/54">{formatNumber(renderedFlights.length)} rendered</span>
              </div>
              <div className="mt-3 space-y-2">
                {listFlights.map((flight) => (
                  <button key={flight.icao24} type="button" onClick={() => setSelectedFlightId(flight.icao24)} className={cn("flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left transition", selectedFlightId === flight.icao24 ? "border-[#7ED7E0]/40 bg-[#7ED7E0]/10" : "border-white/8 bg-white/[0.03] hover:bg-white/[0.06]") }>
                    <div>
                      <p className="text-sm font-medium text-white">{displayCallsign(flight)}</p>
                      <p className="mt-1 text-xs text-white/58">{flight.airline_company || flight.origin_country}</p>
                    </div>
                    <span className="text-xs text-white/64">{formatFeet(flight.baro_altitude)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 border-t border-white/8 pt-5">
              <p className="text-xs uppercase tracking-[0.28em] text-[#A8C4D7]">Operational overlays</p>
              <div className="mt-3 grid gap-2">
                <InspectorRow label="Owned fleet" value={formatNumber(networkData.owned_fleet.length)} />
                <InspectorRow label="Matched fleet" value={formatNumber(matchedOwnedFleet.length)} />
                <InspectorRow label="Weather nodes" value={formatNumber(networkData.weather_layers.length)} />
                <InspectorRow label="Airport pressure" value={formatNumber(networkData.airport_overlays.length)} />
                <InspectorRow label="Corridors" value={formatNumber(networkData.corridor_segments.length)} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-3">
        <button type="button" onClick={handleZoomIn} className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-[#0A0F15]/82 text-white shadow-lg backdrop-blur hover:bg-white/[0.08]">
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" onClick={handleZoomOut} className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-[#0A0F15]/82 text-white shadow-lg backdrop-blur hover:bg-white/[0.08]">
          <Minus className="h-4 w-4" />
        </button>
        <button type="button" onClick={handleResetView} className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-[#0A0F15]/82 text-white shadow-lg backdrop-blur hover:bg-white/[0.08]">
          <LocateFixed className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setDecluttered((current) => !current)} className={cn("pointer-events-auto flex h-12 w-12 items-center justify-center rounded-2xl border text-white shadow-lg backdrop-blur hover:bg-white/[0.08]", decluttered ? "border-[#7ED7E0]/40 bg-[#7ED7E0]/12" : "border-white/10 bg-[#0A0F15]/82")}>
          <Layers3 className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setMobileInspectorOpen((current) => !current)} className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-[#0A0F15]/82 text-white shadow-lg backdrop-blur hover:bg-white/[0.08] xl:hidden">
          <Crosshair className="h-4 w-4" />
        </button>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3 sm:p-5">
        <div className="flex flex-wrap items-center gap-3 xl:pl-[392px] xl:pr-20">
          <StatChip label="Airborne" value={formatNumber(networkData.flight_overview.airborne_count)} subvalue={workspace.airline_code} />
          <StatChip label="On ground" value={formatNumber(networkData.flight_overview.on_ground_count)} />
          <StatChip label="Countries" value={formatNumber(networkData.flight_overview.countries_covered)} />
          <StatChip label="Visible" value={formatNumber(renderedFlights.length)} subvalue={decluttered ? "decluttered" : "full density"} />
          <StatChip label="Matched fleet" value={formatNumber(matchedOwnedFleet.length)} subvalue={`${formatNumber(watchAircraft.length)} watch`} />
          <StatChip label="Weather" value={formatNumber(networkData.weather_layers.length)} subvalue={networkData.weather_layers[0]?.source_status || "inactive"} />
          <StatChip label="Corridors" value={formatNumber(networkData.corridor_segments.length)} subvalue="density derived" />
          <StatChip label="Airport pressure" value={formatNumber(networkData.airport_overlays.length)} subvalue={networkData.airport_overlays[0]?.iata_code || "global"} />
        </div>
      </div>

      <div className={cn("pointer-events-none absolute inset-x-3 bottom-3 z-30 xl:hidden", mobileInspectorOpen ? "block" : "hidden")}>
        <div className="pointer-events-auto rounded-[28px] border border-white/10 bg-[#0A0F15]/92 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-white/38">Selected flight</p>
              <h2 className="mt-2 text-xl font-semibold text-white">{selectedFlight ? displayCallsign(selectedFlight) : "No flight selected"}</h2>
              <p className="mt-1 text-sm text-white/56">{selectedFlight ? selectedFlight.origin_country : "Select a flight from the map."}</p>
            </div>
            <button type="button" className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/64" onClick={() => setMobileInspectorOpen(false)}>
              Close
            </button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <InspectorRow label="Altitude" value={selectedFlight ? formatFeet(selectedFlight.baro_altitude) : "-"} />
            <InspectorRow label="Speed" value={selectedFlight ? formatKnots(selectedFlight.velocity) : "-"} />
            <InspectorRow label="Heading" value={selectedFlight ? formatHeading(selectedFlight.heading) : "-"} />
            <InspectorRow label="Last contact" value={selectedFlight ? formatDateTime(selectedFlight.last_contact) : "-"} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/60">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1"><CloudDrizzle className="h-3.5 w-3.5" /> {networkData.weather_layers.length} weather</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1"><Route className="h-3.5 w-3.5" /> {networkData.corridor_segments.length} corridors</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1"><TowerControl className="h-3.5 w-3.5" /> {networkData.airport_overlays.length} airports</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1"><PlaneTakeoff className="h-3.5 w-3.5" /> {matchedOwnedFleet.length} matched</span>
          </div>
        </div>
      </div>
    </div>
  );
}
