import type {
  AircraftDetail,
  AircraftSummary,
  AlertItem,
  AlertSummary,
  AtaBreakdownItem,
  AuthUser,
  AogIncident,
  CaseDetail,
  CaseSummary,
  ComponentIssueItem,
  ConnectorCatalogItem,
  ConnectorCursorState,
  ConnectorHealthSummary,
  ConnectorManifest,
  ConnectorRunSummary,
  ConnectorSummary,
  ConnectorValidationResult,
  DashboardSummary,
  DocSearchResult,
  EnvironmentStatus,
  FlightLiveResponse,
  FlightOverview,
  MonthlyDefectItem,
  MonthlyRepeatDefectItem,
  NetworkWorkspaceResponse,
  OperationalEvent,
  RectificationDistributionItem,
  ReliabilitySummary,
  RoleItem,
  SessionInfo,
  SpareRecommendation,
  SyncHistoryItem,
  TopComponentItem,
  VendorIssueItem,
  WorkspaceDetail,
  WorkspaceSummary,
} from "@/lib/types";
import { clearStoredSession, getStoredSession, setStoredSession } from "@/lib/auth-store";

const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
const API_BASE_URL =
  configuredApiBaseUrl && configuredApiBaseUrl.length > 0
    ? configuredApiBaseUrl.replace(/\/+$/, "")
    : process.env.NODE_ENV === "production"
      ? ""
      : "http://127.0.0.1:8000";

function requireApiBaseUrl() {
  if (API_BASE_URL) return API_BASE_URL;
  throw new Error(
    "NEXT_PUBLIC_API_BASE_URL is required in production. Set it to the public Render URL of the backend service.",
  );
}

let refreshPromise: Promise<SessionInfo | null> | null = null;

function buildHeaders(init?: RequestInit, withAuth = true): HeadersInit {
  const headers = new Headers(init?.headers || {});
  if (!headers.has("Content-Type") && init?.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (withAuth) {
    const session = getStoredSession();
    if (session?.accessToken) headers.set("Authorization", `Bearer ${session.accessToken}`);
  }
  return headers;
}

async function rawFetch(path: string, init?: RequestInit, withAuth = true) {
  const apiBaseUrl = requireApiBaseUrl();
  try {
    return await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: buildHeaders(init, withAuth),
      cache: "no-store",
    });
  } catch {
    throw new Error(`Cannot reach the API at ${apiBaseUrl}. Verify the backend is running and accessible from this browser.`);
  }
}

async function refreshAccessToken(): Promise<SessionInfo | null> {
  const apiBaseUrl = requireApiBaseUrl();
  const session = getStoredSession();
  if (!session?.refreshToken) return null;
  if (!refreshPromise) {
    refreshPromise = fetch(`${apiBaseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refreshToken }),
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          clearStoredSession();
          return null;
        }
        const payload = (await response.json()) as SessionInfo;
        setStoredSession({
          accessToken: payload.access_token,
          refreshToken: payload.refresh_token,
          expiresAt: payload.expires_at,
          refreshExpiresAt: payload.refresh_expires_at,
        });
        return payload;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function request<T>(path: string, init?: RequestInit, options?: { withAuth?: boolean; retryOnAuth?: boolean }): Promise<T> {
  const withAuth = options?.withAuth ?? true;
  const retryOnAuth = options?.retryOnAuth ?? withAuth;
  let response = await rawFetch(path, init, withAuth);

  if (response.status === 401 && retryOnAuth && withAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await rawFetch(path, init, withAuth);
    }
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed for ${path}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function buildQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    search.set(key, String(value));
  });
  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
}

export const api = {
  login: (email: string, password: string) =>
    request<SessionInfo>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }, { withAuth: false, retryOnAuth: false }),
  refreshSession: () => refreshAccessToken(),
  logout: async () => {
    const session = getStoredSession();
    if (!session?.refreshToken) return;
    await request<void>("/auth/logout", { method: "POST", body: JSON.stringify({ refresh_token: session.refreshToken }) }, { retryOnAuth: false });
    clearStoredSession();
  },
  getMe: () => request<AuthUser>("/auth/me"),
  getMyWorkspaces: () => request<WorkspaceSummary[]>("/users/me/workspaces"),
  getRoles: () => request<RoleItem[]>("/roles"),

  getDashboardSummary: () => request<DashboardSummary>("/dashboard/summary"),
  getDashboardAtaBreakdown: () => request<AtaBreakdownItem[]>("/dashboard/ata-breakdown"),
  getDashboardMonthlyDefects: () => request<MonthlyDefectItem[]>("/dashboard/monthly-defects"),
  getDashboardTopComponents: () => request<TopComponentItem[]>("/dashboard/top-components"),
  getAircraftRiskRanking: () => request<AircraftSummary[]>("/dashboard/aircraft-risk-ranking"),
  getAircraftDetail: (aircraftId: string) => request<AircraftDetail>(`/aircraft/${aircraftId}`),
  getAogIncidents: () => request<AogIncident[]>("/incidents/aog"),
  getReliabilitySummary: () => request<ReliabilitySummary>("/reliability/summary"),
  getReliabilityAta: () => request<AtaBreakdownItem[]>("/reliability/ata"),
  getReliabilityRepeatDefects: () => request<MonthlyRepeatDefectItem[]>("/reliability/repeat-defects"),
  getReliabilityVendors: () => request<VendorIssueItem[]>("/reliability/vendors"),
  getReliabilityComponents: () => request<ComponentIssueItem[]>("/reliability/components"),
  getReliabilityRectificationDistribution: () => request<RectificationDistributionItem[]>("/reliability/rectification-distribution"),
  getSpareRecommendations: () => request<SpareRecommendation[]>("/spares/recommendations"),
  searchDocuments: (query: string) =>
    request<DocSearchResult[]>("/docs/search", {
      method: "POST",
      body: JSON.stringify({ query }),
    }),
  getFlightsOverview: (params?: { region?: string; refresh?: boolean }) => request<FlightOverview>(`/flights/overview${buildQuery(params || {})}`),
  getLiveFlights: (params?: {
    limit?: number;
    region?: string;
    min_altitude?: number;
    max_altitude?: number;
    query?: string;
    airline?: string;
    category?: string;
    on_ground?: boolean;
    refresh?: boolean;
  }) => request<FlightLiveResponse>(`/flights/live${buildQuery(params || {})}`),
  getWorkspaces: () => request<WorkspaceSummary[]>("/workspaces"),
  getCurrentWorkspace: (workspaceId?: string | null) => request<WorkspaceDetail>(`/workspaces/current${buildQuery({ workspace_id: workspaceId })}`),
  getWorkspaceDetail: (workspaceId: string) => request<WorkspaceDetail>(`/workspaces/${workspaceId}`),
  getEnvironmentStatus: () => request<EnvironmentStatus>("/platform/environment"),
  getConnectorCatalog: () => request<ConnectorCatalogItem[]>("/connectors/catalog"),
  getConnectors: (workspaceId?: string | null) => request<ConnectorSummary[]>(`/connectors${buildQuery({ workspace_id: workspaceId })}`),
  getConnectorInstalls: (workspaceId?: string | null) => request<ConnectorSummary[]>(`/connectors/installs${buildQuery({ workspace_id: workspaceId })}`),
  getConnectorHealth: (workspaceId?: string | null) => request<ConnectorHealthSummary>(`/connectors/health${buildQuery({ workspace_id: workspaceId })}`),
  getConnectorSchema: (connectorId: string) => request<ConnectorManifest>(`/connectors/${connectorId}/schema`),
  getConnectorSyncHistory: (connectorId: string) => request<SyncHistoryItem[]>(`/connectors/${connectorId}/sync-history`),
  getConnectorRuns: (connectorId: string) => request<ConnectorRunSummary[]>(`/connectors/${connectorId}/runs`),
  getConnectorCursor: (connectorId: string) => request<ConnectorCursorState>(`/connectors/${connectorId}/cursor`),
  installConnector: (payload: { connector_key: string; workspace_id: string; name?: string; sync_mode?: string; deployment_target?: string; runtime_location?: string }) =>
    request<ConnectorSummary>("/connectors/install", { method: "POST", body: JSON.stringify(payload) }),
  updateConnectorConfig: (connectorId: string, config: Record<string, string>) =>
    request<ConnectorValidationResult>(`/connectors/${connectorId}/config`, { method: "PUT", body: JSON.stringify({ config }) }),
  validateConnectorConfig: (connectorId: string, config: Record<string, string>) =>
    request<ConnectorValidationResult>(`/connectors/${connectorId}/validate-config`, { method: "POST", body: JSON.stringify({ config }) }),
  syncConnector: (connectorId: string, forceFullSync = false) =>
    request<ConnectorRunSummary>(`/connectors/${connectorId}/sync`, { method: "POST", body: JSON.stringify({ force_full_sync: forceFullSync }) }),
  getAlerts: (workspaceId?: string | null) => request<AlertItem[]>(`/alerts${buildQuery({ workspace_id: workspaceId })}`),
  createAlert: (payload: Record<string, unknown>) => request<AlertItem>("/alerts", { method: "POST", body: JSON.stringify(payload) }),
  getAlertSummary: (workspaceId?: string | null) => request<AlertSummary>(`/alerts/summary${buildQuery({ workspace_id: workspaceId })}`),
  getCases: (workspaceId?: string | null) => request<CaseSummary[]>(`/cases${buildQuery({ workspace_id: workspaceId })}`),
  createCase: (payload: Record<string, unknown>) => request<CaseDetail>("/cases", { method: "POST", body: JSON.stringify(payload) }),
  getCaseDetail: (caseId: string) => request<CaseDetail>(`/cases/${caseId}`),
  addCaseTimelineEntry: (caseId: string, payload: { entry_type: string; message: string }) =>
    request<CaseDetail>(`/cases/${caseId}/timeline`, { method: "POST", body: JSON.stringify(payload) }),
  getEventFeed: (workspaceId?: string | null) => request<OperationalEvent[]>(`/events/feed${buildQuery({ workspace_id: workspaceId })}`),
  getNetworkWorkspace: (params?: {
    workspace_id?: string;
    limit?: number;
    region?: string;
    min_altitude?: number;
    max_altitude?: number;
    query?: string;
    airline?: string;
    category?: string;
    include_layers?: string;
    on_ground?: boolean;
    refresh?: boolean;
  }) => request<NetworkWorkspaceResponse>(`/network/workspace${buildQuery(params || {})}`),
};
