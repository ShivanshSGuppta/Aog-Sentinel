export interface DashboardSummary {
  total_aircraft: number;
  open_defects: number;
  aog_events: number;
  repeat_defects: number;
  avg_rectification_time: number;
  dispatch_impacting_events: number;
}

export interface AtaBreakdownItem {
  ata_chapter: string;
  defect_count: number;
  aog_count: number;
  repeat_defect_count: number;
  average_risk_score: number;
}

export interface MonthlyDefectItem {
  month: string;
  defect_count: number;
  aog_count: number;
}

export interface MonthlyRepeatDefectItem {
  month: string;
  repeat_defect_count: number;
  total_defects: number;
}

export interface TopComponentItem {
  component: string;
  ata_chapter: string;
  vendor: string;
  defect_count: number;
  repeat_defect_count: number;
  average_risk_score: number;
  open_defects: number;
}

export interface AircraftSummary {
  aircraft_id: string;
  aircraft_type: string;
  tail_number: string;
  fleet: string;
  base_station: string;
  status: string;
  age_years: number;
  flight_hours: number;
  flight_cycles: number;
  current_risk_score: number;
  open_defects: number;
  aog_events: number;
  repeat_defects: number;
}

export interface AogIncident {
  defect_id: string;
  aircraft_id: string;
  aircraft_label: string;
  tail_number: string;
  aircraft_type: string;
  base_station: string;
  report_date: string;
  ata_chapter: string;
  component: string;
  defect_description: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  aog_flag: boolean;
  delay_minutes: number;
  repeat_defect: boolean;
  risk_score: number;
  recommended_action: string;
  status: string;
}

export interface DefectRecord extends AogIncident {
  rectification_hours: number;
  vendor: string;
  maintenance_action: string;
  part_id: string;
}

export interface MaintenanceLogItem {
  log_id: string;
  date: string;
  task_type: string;
  component: string;
  scheduled_unscheduled: string;
  manhours: number;
  doc_ref: string;
  outcome: string;
}

export interface RecurringComponentItem {
  component: string;
  ata_chapter: string;
  occurrence_count: number;
  repeat_occurrences: number;
  average_risk_score: number;
  last_report_date: string;
}

export interface AircraftReliabilitySnapshot {
  total_defects: number;
  open_defects: number;
  aog_events: number;
  repeat_defects: number;
  average_rectification_hours: number;
  dispatch_impacting_events: number;
}

export interface AircraftDetail {
  summary: AircraftSummary;
  defect_trend: MonthlyDefectItem[];
  ata_distribution: AtaBreakdownItem[];
  recent_defects: DefectRecord[];
  maintenance_logs: MaintenanceLogItem[];
  recurring_components: RecurringComponentItem[];
  reliability_snapshot: AircraftReliabilitySnapshot;
}

export interface ReliabilitySummary {
  total_defects: number;
  open_defects: number;
  closed_defects: number;
  aog_count: number;
  repeat_defect_count: number;
  repeat_defect_rate: number;
  aog_rate: number;
  average_rectification_hours: number;
  most_problematic_ata_chapter: string;
  most_problematic_vendor: string;
  top_repeat_defect_aircraft: string;
  top_repeat_defect_aircraft_count: number;
}

export interface VendorIssueItem {
  vendor: string;
  defect_count: number;
  repeat_defect_count: number;
  aog_count: number;
  average_risk_score: number;
}

export interface ComponentIssueItem extends TopComponentItem {}

export interface SpareRecommendation {
  part_id: string;
  component: string;
  vendor: string;
  current_stock: number;
  lead_time_days: number;
  avg_monthly_usage: number;
  criticality: "High" | "Medium" | "Low";
  reorder_threshold: number;
  forecast_30d: number;
  recommended_reorder_qty: number;
  stock_status: "Critical Low" | "Low" | "Healthy";
  unit_cost: number;
}

export interface DocSearchResult {
  chunk_id: string;
  source_doc: string;
  section_title: string;
  text: string;
  score: number;
  search_mode: string;
}

export interface RectificationDistributionItem {
  bucket: string;
  item_count: number;
}

export interface FlightFeedStatus {
  provider: string;
  state: "live" | "cached" | "unavailable";
  region: string;
  cached: boolean;
  last_refresh: string | null;
  message: string | null;
}

export interface FlightPosition {
  icao24: string;
  callsign: string | null;
  origin_country: string;
  airline_company: string | null;
  airline_prefix: string | null;
  flight_category: "Commercial" | "Cargo" | "Private/Business" | "Military/Government" | "Unknown";
  latitude: number;
  longitude: number;
  baro_altitude: number | null;
  velocity: number | null;
  heading: number | null;
  vertical_rate: number | null;
  on_ground: boolean;
  last_contact: string;
  matched_aircraft_id: string | null;
  matched_tail_number: string | null;
}

export interface FlightLiveResponse {
  items: FlightPosition[];
  status: FlightFeedStatus;
  total_results: number;
  applied_limit: number;
}

export interface FlightOverview {
  airborne_count: number;
  on_ground_count: number;
  countries_covered: number;
  displayed_flights: number;
  last_refresh: string | null;
  status: FlightFeedStatus;
}

export interface FlightAirlineFacet {
  airline_company: string;
  flight_count: number;
}

export interface FlightCategoryFacet {
  category: "Commercial" | "Cargo" | "Private/Business" | "Military/Government" | "Unknown";
  flight_count: number;
}

export interface WorkspaceSummary {
  workspace_id: string;
  airline_name: string;
  airline_code: string;
  status: string;
  deployment_mode: string;
  primary_region: string;
  description: string;
  fleet_count: number;
  site_count: number;
  connector_count: number;
  active_alerts: number;
  open_cases: number;
}

export interface SiteItem {
  site_id: string;
  site_name: string;
  iata_code: string;
  type: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface FleetItem {
  fleet_id: string;
  fleet_name: string;
  aircraft_count: number;
}

export interface WorkspaceUserItem {
  user_id: string;
  name: string;
  role: string;
  location: string;
}

export interface WorkspaceDetail extends WorkspaceSummary {
  branding: Record<string, string>;
  fleets: FleetItem[];
  sites: SiteItem[];
  users: WorkspaceUserItem[];
}

export interface EnvironmentStatus {
  control_plane_status: string;
  data_plane_status: string;
  event_bus_status: string;
  connector_worker_status: string;
  last_platform_sync: string;
  active_incidents: number;
  degraded_connectors: number;
  version: string;
}

export interface PermissionItem {
  permission_code: string;
  description: string;
}

export interface RoleItem {
  role_key: string;
  display_name: string;
  description: string;
  permissions: string[];
}

export interface WorkspaceMembershipItem {
  membership_id: string;
  workspace_id: string;
  airline_name: string;
  airline_code: string;
  role_key: string;
}

export interface AuthUser {
  user_id: string;
  email: string;
  full_name: string;
  platform_role: string;
  location: string | null;
  memberships: WorkspaceMembershipItem[];
  permissions: string[];
}

export interface SessionInfo {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at: string;
  refresh_expires_at: string;
  user: AuthUser;
}

export interface ConnectorConfigField {
  key: string;
  label: string;
  field_type: string;
  required: boolean;
  secret: boolean;
  description: string;
}

export interface SyncHistoryItem {
  run_id: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  records_processed: number;
  message?: string | null;
}

export interface ConnectorSummary {
  connector_id: string;
  workspace_id: string;
  name: string;
  source_category: string;
  status: string;
  sync_mode: string;
  deployment_target: string;
  runtime_location: string;
  package_name: string;
  version: string;
  schema_version: string;
  health_score: number;
  last_sync: string | null;
  next_sync: string | null;
  supported_entities: string[];
}

export interface ConnectorManifest extends ConnectorSummary {
  config_fields: ConnectorConfigField[];
}

export interface ConnectorCatalogItem {
  connector_key: string;
  name: string;
  source_category: string;
  package_name: string;
  version: string;
  schema_version: string;
  supported_entities: string[];
  config_fields: ConnectorConfigField[];
  default_sync_mode: string;
  default_deployment_target: string;
  edge_supported: boolean;
  description: string;
}

export interface ConnectorRunSummary {
  run_id: string;
  connector_id: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  records_processed: number;
  message: string | null;
}

export interface ConnectorCursorState {
  connector_id: string;
  cursor_value: string | null;
  checkpoint_at: string | null;
  raw_state: Record<string, unknown>;
}

export interface ConnectorHealthSummary {
  total_connectors: number;
  healthy_connectors: number;
  warning_connectors: number;
  failed_connectors: number;
  average_health_score: number;
}

export interface ConnectorValidationResult {
  connector_id: string;
  valid: boolean;
  missing_required_fields: string[];
  unknown_fields: string[];
  message: string;
}

export interface AlertItem {
  alert_id: string;
  workspace_id: string;
  title: string;
  alert_type: string;
  severity: string;
  status: string;
  triggered_at: string;
  owner: string;
  aircraft_reference: string;
  component: string;
  station: string;
  summary: string;
  source_event_type: string;
  risk_score: number;
}

export interface AlertSummary {
  total_alerts: number;
  open_alerts: number;
  in_review_alerts: number;
  critical_alerts: number;
  high_alerts: number;
  average_risk_score: number;
}

export interface CaseTimelineEntry {
  entry_id: string;
  timestamp: string;
  actor: string;
  entry_type: string;
  message: string;
}

export interface CaseSummary {
  case_id: string;
  workspace_id: string;
  title: string;
  priority: string;
  status: string;
  owner: string;
  sla_due: string;
  created_at: string;
  updated_at: string;
  linked_alert_count: number;
  aircraft_reference: string;
  category: string;
}

export interface CaseDetail extends CaseSummary {
  timeline: CaseTimelineEntry[];
}

export interface OperationalEvent {
  event_id: string;
  workspace_id: string;
  event_type: string;
  severity: string;
  title: string;
  created_at: string;
  source_connector: string;
  status: string;
}

export interface NetworkLayerSummary {
  layer_id: string;
  label: string;
  enabled_default: boolean;
  feature_count: number;
  status: string;
  description: string;
}

export interface OwnedFleetAircraft {
  overlay_id: string;
  aircraft_id: string;
  tail_number: string;
  aircraft_type: string;
  callsign: string;
  latitude: number;
  longitude: number;
  status: string;
  risk_score: number;
  station: string;
}

export interface OwnedFleetMatch {
  match_id: string;
  aircraft_id: string;
  tail_number: string;
  callsign: string | null;
  match_status: "matched" | "watch" | "unmatched";
  latitude: number | null;
  longitude: number | null;
  risk_score: number;
  station: string | null;
  live_flight_icao24: string | null;
}

export interface MaintenanceBase {
  base_id: string;
  name: string;
  iata_code: string;
  latitude: number;
  longitude: number;
  open_cases: number;
  active_alerts: number;
}

export interface DisruptionHotspot {
  hotspot_id: string;
  label: string;
  latitude: number;
  longitude: number;
  severity: string;
  open_alerts: number;
  reason: string;
}

export interface WeatherOverlay {
  overlay_id: string;
  label: string;
  latitude: number;
  longitude: number;
  condition: string;
  temperature_c: number | null;
  wind_speed_kts: number | null;
  visibility_km: number | null;
  source_status: string;
}

export interface CorridorSegment {
  segment_id: string;
  start_latitude: number;
  start_longitude: number;
  end_latitude: number;
  end_longitude: number;
  traffic_count: number;
  avg_heading: number;
  intensity: string;
}

export interface AirportOverlay {
  airport_id: string;
  iata_code: string;
  name: string;
  latitude: number;
  longitude: number;
  inbound_count: number;
  surface_count: number;
  congestion_score: number;
  severity: string;
}

export interface NetworkWorkspaceResponse {
  workspace: WorkspaceSummary;
  environment: EnvironmentStatus;
  flight_overview: FlightOverview;
  flight_feed: FlightLiveResponse;
  airline_facets: FlightAirlineFacet[];
  category_facets: FlightCategoryFacet[];
  layers: NetworkLayerSummary[];
  owned_fleet: OwnedFleetAircraft[];
  maintenance_bases: MaintenanceBase[];
  hotspots: DisruptionHotspot[];
  weather_layers: WeatherOverlay[];
  corridor_segments: CorridorSegment[];
  airport_overlays: AirportOverlay[];
  owned_fleet_matches: OwnedFleetMatch[];
  alert_summary: AlertSummary;
}
