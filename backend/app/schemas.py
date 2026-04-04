from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str


class DashboardSummary(BaseModel):
    total_aircraft: int
    open_defects: int
    aog_events: int
    repeat_defects: int
    avg_rectification_time: float
    dispatch_impacting_events: int


class AtaBreakdownItem(BaseModel):
    ata_chapter: str
    defect_count: int
    aog_count: int
    repeat_defect_count: int
    average_risk_score: float


class MonthlyDefectItem(BaseModel):
    month: str
    defect_count: int
    aog_count: int


class MonthlyRepeatDefectItem(BaseModel):
    month: str
    repeat_defect_count: int
    total_defects: int


class TopComponentItem(BaseModel):
    component: str
    ata_chapter: str
    vendor: str
    defect_count: int
    repeat_defect_count: int
    average_risk_score: float
    open_defects: int


class VendorIssueItem(BaseModel):
    vendor: str
    defect_count: int
    repeat_defect_count: int
    aog_count: int
    average_risk_score: float


class ComponentIssueItem(TopComponentItem):
    pass


class AircraftSummary(BaseModel):
    aircraft_id: str
    aircraft_type: str
    tail_number: str
    fleet: str
    base_station: str
    status: str
    age_years: int
    flight_hours: int
    flight_cycles: int
    current_risk_score: float
    open_defects: int
    aog_events: int
    repeat_defects: int


class AogIncident(BaseModel):
    defect_id: str
    aircraft_id: str
    aircraft_label: str
    tail_number: str
    aircraft_type: str
    base_station: str
    report_date: str
    ata_chapter: str
    component: str
    defect_description: str
    severity: Literal["Critical", "High", "Medium", "Low"]
    aog_flag: bool
    delay_minutes: int
    repeat_defect: bool
    risk_score: float
    recommended_action: str
    status: str


class DefectRecord(AogIncident):
    rectification_hours: float
    vendor: str
    maintenance_action: str
    part_id: str


class MaintenanceLogItem(BaseModel):
    log_id: str
    date: str
    task_type: str
    component: str
    scheduled_unscheduled: str
    manhours: float
    doc_ref: str
    outcome: str


class RecurringComponentItem(BaseModel):
    component: str
    ata_chapter: str
    occurrence_count: int
    repeat_occurrences: int
    average_risk_score: float
    last_report_date: str


class AircraftReliabilitySnapshot(BaseModel):
    total_defects: int
    open_defects: int
    aog_events: int
    repeat_defects: int
    average_rectification_hours: float
    dispatch_impacting_events: int


class AircraftDetail(BaseModel):
    summary: AircraftSummary
    defect_trend: list[MonthlyDefectItem]
    ata_distribution: list[AtaBreakdownItem]
    recent_defects: list[DefectRecord]
    maintenance_logs: list[MaintenanceLogItem]
    recurring_components: list[RecurringComponentItem]
    reliability_snapshot: AircraftReliabilitySnapshot


class ReliabilitySummary(BaseModel):
    total_defects: int
    open_defects: int
    closed_defects: int
    aog_count: int
    repeat_defect_count: int
    repeat_defect_rate: float
    aog_rate: float
    average_rectification_hours: float
    most_problematic_ata_chapter: str
    most_problematic_vendor: str
    top_repeat_defect_aircraft: str
    top_repeat_defect_aircraft_count: int


class RectificationDistributionItem(BaseModel):
    bucket: str
    item_count: int


class SpareRecommendation(BaseModel):
    part_id: str
    component: str
    vendor: str
    current_stock: int
    lead_time_days: int
    avg_monthly_usage: float
    criticality: Literal["High", "Medium", "Low"]
    reorder_threshold: int
    forecast_30d: int
    recommended_reorder_qty: int
    stock_status: Literal["Critical Low", "Low", "Healthy"]
    unit_cost: float


class FlightFeedStatus(BaseModel):
    provider: str
    state: Literal["live", "cached", "unavailable"]
    region: str
    cached: bool
    last_refresh: str | None = None
    message: str | None = None


class FlightPosition(BaseModel):
    icao24: str
    callsign: str | None = None
    origin_country: str
    airline_company: str | None = None
    airline_prefix: str | None = None
    flight_category: Literal["Commercial", "Cargo", "Private/Business", "Military/Government", "Unknown"] = "Unknown"
    latitude: float
    longitude: float
    baro_altitude: float | None = None
    velocity: float | None = None
    heading: float | None = None
    vertical_rate: float | None = None
    on_ground: bool
    last_contact: str
    matched_aircraft_id: str | None = None
    matched_tail_number: str | None = None


class FlightLiveResponse(BaseModel):
    items: list[FlightPosition]
    status: FlightFeedStatus
    total_results: int
    applied_limit: int


class FlightOverview(BaseModel):
    airborne_count: int
    on_ground_count: int
    countries_covered: int
    displayed_flights: int
    last_refresh: str | None = None
    status: FlightFeedStatus


class FlightAirlineFacet(BaseModel):
    airline_company: str
    flight_count: int


class FlightCategoryFacet(BaseModel):
    category: Literal["Commercial", "Cargo", "Private/Business", "Military/Government", "Unknown"]
    flight_count: int


class WorkspaceSummary(BaseModel):
    workspace_id: str
    airline_name: str
    airline_code: str
    status: str
    deployment_mode: str
    primary_region: str
    description: str
    fleet_count: int
    site_count: int
    connector_count: int
    active_alerts: int
    open_cases: int


class SiteItem(BaseModel):
    site_id: str
    site_name: str
    iata_code: str
    type: str
    latitude: float | None = None
    longitude: float | None = None


class FleetItem(BaseModel):
    fleet_id: str
    fleet_name: str
    aircraft_count: int


class WorkspaceUserItem(BaseModel):
    user_id: str
    name: str
    role: str
    location: str


class WorkspaceDetail(WorkspaceSummary):
    branding: dict[str, str]
    fleets: list[FleetItem]
    sites: list[SiteItem]
    users: list[WorkspaceUserItem]


class EnvironmentStatus(BaseModel):
    control_plane_status: str
    data_plane_status: str
    event_bus_status: str
    connector_worker_status: str
    last_platform_sync: str
    active_incidents: int
    degraded_connectors: int
    version: str


class PermissionItem(BaseModel):
    permission_code: str
    description: str


class RoleItem(BaseModel):
    role_key: str
    display_name: str
    description: str
    permissions: list[str] = Field(default_factory=list)


class WorkspaceMembershipItem(BaseModel):
    membership_id: str
    workspace_id: str
    airline_name: str
    airline_code: str
    role_key: str


class AuthUser(BaseModel):
    user_id: str
    email: str
    full_name: str
    platform_role: str
    location: str | None = None
    memberships: list[WorkspaceMembershipItem] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)


class SessionInfo(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_at: str
    refresh_expires_at: str
    user: AuthUser


class LoginRequest(BaseModel):
    email: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class ConnectorConfigField(BaseModel):
    key: str
    label: str
    field_type: str
    required: bool
    secret: bool
    description: str


class SyncHistoryItem(BaseModel):
    run_id: str
    started_at: str
    ended_at: str | None = None
    status: str
    records_processed: int
    message: str | None = None


class ConnectorSummary(BaseModel):
    connector_id: str
    workspace_id: str
    name: str
    source_category: str
    status: str
    sync_mode: str
    deployment_target: str
    runtime_location: str
    package_name: str
    version: str
    schema_version: str
    health_score: int
    last_sync: str | None = None
    next_sync: str | None = None
    supported_entities: list[str]


class ConnectorManifest(ConnectorSummary):
    config_fields: list[ConnectorConfigField]


class ConnectorCatalogItem(BaseModel):
    connector_key: str
    name: str
    source_category: str
    package_name: str
    version: str
    schema_version: str
    supported_entities: list[str]
    config_fields: list[ConnectorConfigField]
    default_sync_mode: str
    default_deployment_target: str
    edge_supported: bool
    description: str


class ConnectorInstallRequest(BaseModel):
    connector_key: str
    workspace_id: str
    name: str | None = None
    sync_mode: str | None = None
    deployment_target: str | None = None
    runtime_location: str | None = None


class ConnectorConfigUpdateRequest(BaseModel):
    config: dict[str, Any] = Field(default_factory=dict)


class ConnectorSyncRequest(BaseModel):
    force_full_sync: bool = False


class ConnectorCursorState(BaseModel):
    connector_id: str
    cursor_value: str | None = None
    checkpoint_at: str | None = None
    raw_state: dict[str, Any] = Field(default_factory=dict)


class ConnectorRunSummary(BaseModel):
    run_id: str
    connector_id: str
    status: str
    started_at: str | None = None
    ended_at: str | None = None
    records_processed: int
    message: str | None = None


class ConnectorHealthSummary(BaseModel):
    total_connectors: int
    healthy_connectors: int
    warning_connectors: int
    failed_connectors: int
    average_health_score: float


class ConnectorValidationRequest(BaseModel):
    config: dict[str, Any]


class ConnectorValidationResult(BaseModel):
    connector_id: str
    valid: bool
    missing_required_fields: list[str]
    unknown_fields: list[str]
    message: str


class AlertItem(BaseModel):
    alert_id: str
    workspace_id: str
    title: str
    alert_type: str
    severity: str
    status: str
    triggered_at: str
    owner: str
    aircraft_reference: str
    component: str
    station: str
    summary: str
    source_event_type: str
    risk_score: float


class AlertCreateRequest(BaseModel):
    workspace_id: str
    title: str
    alert_type: str
    severity: str
    owner: str | None = None
    aircraft_reference: str | None = None
    component: str | None = None
    station: str | None = None
    summary: str
    source_event_type: str
    risk_score: float = Field(default=0, ge=0, le=100)


class AlertSummary(BaseModel):
    total_alerts: int
    open_alerts: int
    in_review_alerts: int
    critical_alerts: int
    high_alerts: int
    average_risk_score: float


class CaseTimelineEntry(BaseModel):
    entry_id: str
    timestamp: str
    actor: str
    entry_type: str
    message: str


class CaseTimelineCreateRequest(BaseModel):
    entry_type: str
    message: str


class CaseSummary(BaseModel):
    case_id: str
    workspace_id: str
    title: str
    priority: str
    status: str
    owner: str
    sla_due: str
    created_at: str
    updated_at: str
    linked_alert_count: int
    aircraft_reference: str
    category: str


class CaseCreateRequest(BaseModel):
    workspace_id: str
    title: str
    priority: str
    owner: str | None = None
    sla_due: str
    linked_alert_count: int = 0
    aircraft_reference: str | None = None
    category: str
    status: str = "Active"


class CaseDetail(CaseSummary):
    timeline: list[CaseTimelineEntry]


class OperationalEvent(BaseModel):
    event_id: str
    workspace_id: str
    event_type: str
    severity: str
    title: str
    created_at: str
    source_connector: str
    status: str


class NetworkLayerSummary(BaseModel):
    layer_id: str
    label: str
    enabled_default: bool
    feature_count: int
    status: str
    description: str


class OwnedFleetAircraft(BaseModel):
    overlay_id: str
    aircraft_id: str
    tail_number: str
    aircraft_type: str
    callsign: str
    latitude: float
    longitude: float
    status: str
    risk_score: float
    station: str


class OwnedFleetMatch(BaseModel):
    match_id: str
    aircraft_id: str
    tail_number: str
    callsign: str | None = None
    match_status: Literal["matched", "watch", "unmatched"]
    latitude: float | None = None
    longitude: float | None = None
    risk_score: float
    station: str | None = None
    live_flight_icao24: str | None = None


class MaintenanceBase(BaseModel):
    base_id: str
    name: str
    iata_code: str
    latitude: float
    longitude: float
    open_cases: int
    active_alerts: int


class DisruptionHotspot(BaseModel):
    hotspot_id: str
    label: str
    latitude: float
    longitude: float
    severity: str
    open_alerts: int
    reason: str


class WeatherOverlay(BaseModel):
    overlay_id: str
    label: str
    latitude: float
    longitude: float
    condition: str
    temperature_c: float | None = None
    wind_speed_kts: float | None = None
    visibility_km: float | None = None
    source_status: str


class CorridorSegment(BaseModel):
    segment_id: str
    start_latitude: float
    start_longitude: float
    end_latitude: float
    end_longitude: float
    traffic_count: int
    avg_heading: float
    intensity: str


class AirportOverlay(BaseModel):
    airport_id: str
    iata_code: str
    name: str
    latitude: float
    longitude: float
    inbound_count: int
    surface_count: int
    congestion_score: float
    severity: str


class NetworkWorkspaceResponse(BaseModel):
    workspace: WorkspaceSummary
    environment: EnvironmentStatus
    flight_overview: FlightOverview
    flight_feed: FlightLiveResponse
    airline_facets: list[FlightAirlineFacet]
    category_facets: list[FlightCategoryFacet]
    layers: list[NetworkLayerSummary]
    owned_fleet: list[OwnedFleetAircraft]
    maintenance_bases: list[MaintenanceBase]
    hotspots: list[DisruptionHotspot]
    weather_layers: list[WeatherOverlay]
    corridor_segments: list[CorridorSegment]
    airport_overlays: list[AirportOverlay]
    owned_fleet_matches: list[OwnedFleetMatch]
    alert_summary: AlertSummary


class DocSearchRequest(BaseModel):
    query: str = Field(min_length=3, max_length=500)


class DocSearchResult(BaseModel):
    chunk_id: str
    source_doc: str
    section_title: str
    text: str
    score: float
    search_mode: str
