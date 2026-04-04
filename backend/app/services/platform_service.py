from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import (
    Alert,
    Case,
    CaseTimelineEntry,
    ConnectorCatalog,
    ConnectorConfig,
    ConnectorCursor,
    ConnectorInstall,
    ConnectorRun,
    OperationalEvent,
    Role,
    RolePermission,
    User,
    Workspace,
    WorkspaceAircraft,
    WorkspaceFleet,
    WorkspaceMembership,
    WorkspaceSite,
)
from app.schemas import (
    AlertCreateRequest,
    AlertItem,
    AlertSummary,
    AirportOverlay,
    CaseCreateRequest,
    CaseDetail,
    CaseSummary,
    CaseTimelineCreateRequest,
    CaseTimelineEntry as CaseTimelineEntrySchema,
    ConnectorCatalogItem,
    ConnectorConfigField,
    ConnectorConfigUpdateRequest,
    ConnectorCursorState,
    ConnectorHealthSummary,
    ConnectorInstallRequest,
    ConnectorManifest,
    ConnectorRunSummary,
    ConnectorSummary,
    ConnectorSyncRequest,
    ConnectorValidationResult,
    DisruptionHotspot,
    EnvironmentStatus,
    FleetItem,
    NetworkLayerSummary,
    NetworkWorkspaceResponse,
    OperationalEvent as OperationalEventSchema,
    OwnedFleetAircraft,
    OwnedFleetMatch,
    RoleItem,
    SiteItem,
    SyncHistoryItem,
    WeatherOverlay,
    WorkspaceDetail,
    WorkspaceSummary,
    WorkspaceUserItem,
)
from app.services.auth_service import AuthService
from app.services.flight_service import get_flight_service
from app.services.network_layer_service import (
    build_airport_overlays,
    build_corridor_segments,
    build_hotspots,
    build_maintenance_bases,
    build_owned_fleet_matches,
    build_weather_layers,
    load_airports_reference,
)
from app.workers.connector_worker import execute_connector_run


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat()


def _resolve_workspace(db: Session, auth: AuthService, user: User, workspace_id: str | None = None) -> Workspace:
    resolved_id = auth.ensure_workspace_access(user, workspace_id)
    workspace = db.get(Workspace, resolved_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail=f"Workspace '{resolved_id}' not found")
    return workspace


def _resolve_connector_install(db: Session, auth: AuthService, user: User, connector_id: str) -> ConnectorInstall:
    install = db.scalar(select(ConnectorInstall).where(ConnectorInstall.connector_id == connector_id))
    if install is None:
        raise HTTPException(status_code=404, detail=f"Connector '{connector_id}' not found")
    auth.ensure_workspace_access(user, install.workspace_id)
    return install


def _workspace_summary_model(db: Session, workspace: Workspace) -> WorkspaceSummary:
    connector_count = db.scalar(select(func.count()).select_from(ConnectorInstall).where(ConnectorInstall.workspace_id == workspace.workspace_id)) or 0
    active_alerts = db.scalar(
        select(func.count()).select_from(Alert).where(Alert.workspace_id == workspace.workspace_id, Alert.status.in_(["Open", "In Review"]))
    ) or 0
    open_cases = db.scalar(
        select(func.count()).select_from(Case).where(Case.workspace_id == workspace.workspace_id, Case.status.in_(["Active", "Escalated", "Monitoring"]))
    ) or 0
    fleet_count = db.scalar(select(func.count()).select_from(WorkspaceFleet).where(WorkspaceFleet.workspace_id == workspace.workspace_id)) or 0
    site_count = db.scalar(select(func.count()).select_from(WorkspaceSite).where(WorkspaceSite.workspace_id == workspace.workspace_id)) or 0
    return WorkspaceSummary(
        workspace_id=workspace.workspace_id,
        airline_name=workspace.airline_name,
        airline_code=workspace.airline_code,
        status=workspace.status,
        deployment_mode=workspace.deployment_mode,
        primary_region=workspace.primary_region,
        description=workspace.description,
        fleet_count=int(fleet_count),
        site_count=int(site_count),
        connector_count=int(connector_count),
        active_alerts=int(active_alerts),
        open_cases=int(open_cases),
    )


def _user_name_map(db: Session, workspace_id: str) -> dict[str, str]:
    rows = db.execute(
        select(User.user_id, User.full_name)
        .join(WorkspaceMembership, WorkspaceMembership.user_id == User.user_id)
        .where(WorkspaceMembership.workspace_id == workspace_id)
    ).all()
    return {user_id: full_name for user_id, full_name in rows}


def _site_map(db: Session, workspace_id: str) -> dict[str, tuple[float | None, float | None]]:
    sites = db.scalars(select(WorkspaceSite).where(WorkspaceSite.workspace_id == workspace_id)).all()
    return {site.iata_code: (site.latitude, site.longitude) for site in sites}


# Workspace and environment

def list_workspaces(db: Session, user: User) -> list[WorkspaceSummary]:
    auth = AuthService(db)
    if user.platform_role == "platform_admin":
        workspaces = db.scalars(select(Workspace).order_by(Workspace.airline_name)).all()
    else:
        workspaces = db.scalars(
            select(Workspace)
            .join(WorkspaceMembership, WorkspaceMembership.workspace_id == Workspace.workspace_id)
            .where(WorkspaceMembership.user_id == user.user_id)
            .order_by(Workspace.airline_name)
        ).all()
    return [_workspace_summary_model(db, workspace) for workspace in workspaces]


def list_user_workspaces(db: Session, user: User) -> list[WorkspaceSummary]:
    return list_workspaces(db, user)


def get_workspace_detail(db: Session, user: User, workspace_id: str | None = None) -> WorkspaceDetail:
    auth = AuthService(db)
    workspace = _resolve_workspace(db, auth, user, workspace_id)
    summary = _workspace_summary_model(db, workspace)
    fleets = db.scalars(select(WorkspaceFleet).where(WorkspaceFleet.workspace_id == workspace.workspace_id)).all()
    sites = db.scalars(select(WorkspaceSite).where(WorkspaceSite.workspace_id == workspace.workspace_id)).all()
    memberships = db.execute(
        select(WorkspaceMembership, User)
        .join(User, User.user_id == WorkspaceMembership.user_id)
        .where(WorkspaceMembership.workspace_id == workspace.workspace_id)
    ).all()
    return WorkspaceDetail(
        **summary.model_dump(),
        branding=workspace.branding,
        fleets=[FleetItem(fleet_id=item.fleet_id, fleet_name=item.fleet_name, aircraft_count=item.aircraft_count) for item in fleets],
        sites=[SiteItem(site_id=item.site_id, site_name=item.site_name, iata_code=item.iata_code, type=item.site_type, latitude=item.latitude, longitude=item.longitude) for item in sites],
        users=[WorkspaceUserItem(user_id=user_row.user_id, name=user_row.full_name, role=membership.role_key.replace("_", " ").title(), location=user_row.location or "-") for membership, user_row in memberships],
    )


def get_environment_status(db: Session) -> EnvironmentStatus:
    connector_statuses = db.scalars(select(ConnectorInstall.status)).all()
    degraded = sum(status in {"Warning", "Error"} for status in connector_statuses)
    active_incidents = db.scalar(select(func.count()).select_from(Alert).where(Alert.status.in_(["Open", "In Review"]))) or 0
    if any(status == "Error" for status in connector_statuses):
        connector_worker_status = "Degraded"
    elif connector_statuses:
        connector_worker_status = "Healthy"
    else:
        connector_worker_status = "Idle"
    last_sync = db.scalar(select(func.max(ConnectorInstall.last_sync)))
    return EnvironmentStatus(
        control_plane_status="Healthy",
        data_plane_status="Active",
        event_bus_status="Operational",
        connector_worker_status=connector_worker_status,
        last_platform_sync=_iso(last_sync or datetime.now(tz=UTC)) or datetime.now(tz=UTC).isoformat(),
        active_incidents=int(active_incidents),
        degraded_connectors=int(degraded),
        version="v2.0",
    )


def list_roles(db: Session, user: User) -> list[RoleItem]:
    auth = AuthService(db)
    auth.ensure_permission(user, "roles.read")
    roles = db.scalars(select(Role).order_by(Role.role_key)).all()
    items: list[RoleItem] = []
    for role in roles:
        permissions = db.scalars(select(RolePermission.permission_code).where(RolePermission.role_key == role.role_key)).all()
        items.append(RoleItem(role_key=role.role_key, display_name=role.display_name, description=role.description, permissions=sorted(permissions)))
    return items


# Connectors

def list_connector_catalog(db: Session, user: User) -> list[ConnectorCatalogItem]:
    auth = AuthService(db)
    auth.ensure_permission(user, "connectors.read")
    catalog = db.scalars(select(ConnectorCatalog).order_by(ConnectorCatalog.name)).all()
    return [
        ConnectorCatalogItem(
            connector_key=item.connector_key,
            name=item.name,
            source_category=item.source_category,
            package_name=item.package_name,
            version=item.version,
            schema_version=item.schema_version,
            supported_entities=item.supported_entities,
            config_fields=[ConnectorConfigField(**field) for field in item.config_schema.get("fields", [])],
            default_sync_mode=item.default_sync_mode,
            default_deployment_target=item.default_deployment_target,
            edge_supported=item.edge_supported,
            description=item.description,
        )
        for item in catalog
    ]


def list_connectors(db: Session, user: User, workspace_id: str | None = None) -> list[ConnectorSummary]:
    auth = AuthService(db)
    resolved_workspace_id = auth.ensure_workspace_access(user, workspace_id)
    installs = db.scalars(select(ConnectorInstall).where(ConnectorInstall.workspace_id == resolved_workspace_id).order_by(ConnectorInstall.health_score.desc())).all()
    return [
        ConnectorSummary(
            connector_id=item.connector_id,
            workspace_id=item.workspace_id,
            name=item.name,
            source_category=db.get(ConnectorCatalog, item.connector_key).source_category if db.get(ConnectorCatalog, item.connector_key) else "Unknown",
            status=item.status,
            sync_mode=item.sync_mode,
            deployment_target=item.deployment_target,
            runtime_location=item.runtime_location,
            package_name=item.package_name,
            version=item.version,
            schema_version=item.schema_version,
            health_score=item.health_score,
            last_sync=_iso(item.last_sync),
            next_sync=_iso(item.next_sync),
            supported_entities=item.supported_entities,
        )
        for item in installs
    ]


def list_connector_installs(db: Session, user: User, workspace_id: str | None = None) -> list[ConnectorSummary]:
    return list_connectors(db, user, workspace_id)


def get_connector_manifest(db: Session, user: User, connector_id: str) -> ConnectorManifest:
    install = _resolve_connector_install(db, AuthService(db), user, connector_id)
    catalog = db.get(ConnectorCatalog, install.connector_key)
    if catalog is None:
        raise HTTPException(status_code=404, detail=f"Connector manifest missing for '{connector_id}'")
    return ConnectorManifest(
        connector_id=install.connector_id,
        workspace_id=install.workspace_id,
        name=install.name,
        source_category=catalog.source_category,
        status=install.status,
        sync_mode=install.sync_mode,
        deployment_target=install.deployment_target,
        runtime_location=install.runtime_location,
        package_name=install.package_name,
        version=install.version,
        schema_version=install.schema_version,
        health_score=install.health_score,
        last_sync=_iso(install.last_sync),
        next_sync=_iso(install.next_sync),
        supported_entities=install.supported_entities,
        config_fields=[ConnectorConfigField(**field) for field in catalog.config_schema.get("fields", [])],
    )


def get_connector_sync_history(db: Session, user: User, connector_id: str) -> list[SyncHistoryItem]:
    install = _resolve_connector_install(db, AuthService(db), user, connector_id)
    runs = db.scalars(select(ConnectorRun).where(ConnectorRun.install_id == install.install_id).order_by(ConnectorRun.started_at.desc())).all()
    return [
        SyncHistoryItem(
            run_id=item.run_id,
            started_at=_iso(item.started_at) or datetime.now(tz=UTC).isoformat(),
            ended_at=_iso(item.ended_at),
            status=item.status,
            records_processed=item.records_processed,
            message=item.message,
        )
        for item in runs
    ]


def list_connector_runs(db: Session, user: User, connector_id: str) -> list[ConnectorRunSummary]:
    install = _resolve_connector_install(db, AuthService(db), user, connector_id)
    runs = db.scalars(select(ConnectorRun).where(ConnectorRun.install_id == install.install_id).order_by(ConnectorRun.started_at.desc())).all()
    return [
        ConnectorRunSummary(
            run_id=item.run_id,
            connector_id=install.connector_id,
            status=item.status,
            started_at=_iso(item.started_at),
            ended_at=_iso(item.ended_at),
            records_processed=item.records_processed,
            message=item.message,
        )
        for item in runs
    ]


def get_connector_cursor(db: Session, user: User, connector_id: str) -> ConnectorCursorState:
    install = _resolve_connector_install(db, AuthService(db), user, connector_id)
    cursor = db.scalar(select(ConnectorCursor).where(ConnectorCursor.install_id == install.install_id))
    return ConnectorCursorState(
        connector_id=connector_id,
        cursor_value=cursor.cursor_value if cursor else None,
        checkpoint_at=_iso(cursor.checkpoint_at) if cursor else None,
        raw_state=cursor.raw_state if cursor else {},
    )


def validate_connector_config(db: Session, user: User, connector_id: str, config: dict[str, Any]) -> ConnectorValidationResult:
    manifest = get_connector_manifest(db, user, connector_id)
    allowed_keys = {field.key for field in manifest.config_fields}
    required_keys = {field.key for field in manifest.config_fields if field.required}
    provided_keys = set(config.keys())
    missing_required_fields = sorted(required_keys - {key for key in provided_keys if config.get(key) not in (None, "")})
    unknown_fields = sorted(provided_keys - allowed_keys)
    valid = not missing_required_fields and not unknown_fields
    return ConnectorValidationResult(
        connector_id=connector_id,
        valid=valid,
        missing_required_fields=missing_required_fields,
        unknown_fields=unknown_fields,
        message="Configuration is valid." if valid else "Configuration requires attention before connector activation.",
    )


def install_connector(db: Session, user: User, payload: ConnectorInstallRequest) -> ConnectorSummary:
    auth = AuthService(db)
    resolved_workspace_id = auth.ensure_workspace_access(user, payload.workspace_id)
    auth.ensure_permission(user, "connectors.write", resolved_workspace_id)
    catalog = db.get(ConnectorCatalog, payload.connector_key)
    if catalog is None:
        raise HTTPException(status_code=404, detail=f"Connector catalog item '{payload.connector_key}' not found")
    connector_id = f"cn_{catalog.connector_key}_{resolved_workspace_id.split('_')[-1]}"
    existing = db.scalar(select(ConnectorInstall).where(ConnectorInstall.connector_id == connector_id))
    if existing is not None:
        raise HTTPException(status_code=409, detail=f"Connector '{connector_id}' is already installed")
    install = ConnectorInstall(
        install_id=f"inst_{connector_id}",
        workspace_id=resolved_workspace_id,
        connector_key=catalog.connector_key,
        connector_id=connector_id,
        name=payload.name or catalog.name,
        status="Healthy",
        sync_mode=payload.sync_mode or catalog.default_sync_mode,
        deployment_target=payload.deployment_target or catalog.default_deployment_target,
        runtime_location=payload.runtime_location or ("Airline Edge Worker" if catalog.edge_supported else "Control Plane"),
        package_name=catalog.package_name,
        version=catalog.version,
        schema_version=catalog.schema_version,
        health_score=100,
        last_sync=None,
        next_sync=datetime.now(tz=UTC) + timedelta(minutes=15),
        supported_entities=catalog.supported_entities,
    )
    db.add(install)
    db.flush()
    db.add(ConnectorConfig(config_id=f"cfg_{connector_id}", install_id=install.install_id, config={}, updated_by=user.user_id))
    db.commit()
    return list_connectors(db, user, resolved_workspace_id)[0] if False else ConnectorSummary(
        connector_id=install.connector_id,
        workspace_id=install.workspace_id,
        name=install.name,
        source_category=catalog.source_category,
        status=install.status,
        sync_mode=install.sync_mode,
        deployment_target=install.deployment_target,
        runtime_location=install.runtime_location,
        package_name=install.package_name,
        version=install.version,
        schema_version=install.schema_version,
        health_score=install.health_score,
        last_sync=_iso(install.last_sync),
        next_sync=_iso(install.next_sync),
        supported_entities=install.supported_entities,
    )


def update_connector_config(db: Session, user: User, connector_id: str, payload: ConnectorConfigUpdateRequest) -> ConnectorValidationResult:
    auth = AuthService(db)
    install = _resolve_connector_install(db, auth, user, connector_id)
    auth.ensure_permission(user, "connectors.write", install.workspace_id)
    validation = validate_connector_config(db, user, connector_id, payload.config)
    if not validation.valid:
        return validation
    config = db.scalar(select(ConnectorConfig).where(ConnectorConfig.install_id == install.install_id))
    if config is None:
        config = ConnectorConfig(config_id=f"cfg_{connector_id}", install_id=install.install_id, config={}, updated_by=user.user_id)
        db.add(config)
    config.config = payload.config
    config.updated_by = user.user_id
    db.commit()
    return validation


def sync_connector_install(db: Session, user: User, connector_id: str, payload: ConnectorSyncRequest) -> ConnectorRunSummary:
    auth = AuthService(db)
    install = _resolve_connector_install(db, auth, user, connector_id)
    auth.ensure_permission(user, "connectors.sync", install.workspace_id)
    run = ConnectorRun(run_id=f"run_{connector_id}_{int(datetime.now(tz=UTC).timestamp())}", install_id=install.install_id, status="Queued", records_processed=0)
    db.add(run)
    db.commit()
    if settings.connector_sync_inline:
        execute_connector_run(db, install, run, force_full_sync=payload.force_full_sync)
        db.refresh(run)
    return ConnectorRunSummary(
        run_id=run.run_id,
        connector_id=connector_id,
        status=run.status,
        started_at=_iso(run.started_at),
        ended_at=_iso(run.ended_at),
        records_processed=run.records_processed,
        message=run.message,
    )


def get_connector_health_summary(db: Session, user: User, workspace_id: str | None = None) -> ConnectorHealthSummary:
    connectors = list_connectors(db, user, workspace_id)
    healthy = sum(item.status == "Healthy" for item in connectors)
    warning = sum(item.status == "Warning" for item in connectors)
    failed = sum(item.status == "Error" for item in connectors)
    average = sum(item.health_score for item in connectors) / len(connectors) if connectors else 0
    return ConnectorHealthSummary(
        total_connectors=len(connectors),
        healthy_connectors=healthy,
        warning_connectors=warning,
        failed_connectors=failed,
        average_health_score=round(average, 1),
    )


# Alerts, cases, events

def _owner_name(user_names: dict[str, str], user_id: str | None) -> str:
    if user_id is None:
        return "Unassigned"
    return user_names.get(user_id, "Unassigned")


def list_alerts(db: Session, user: User, workspace_id: str | None = None) -> list[AlertItem]:
    auth = AuthService(db)
    resolved_workspace_id = auth.ensure_workspace_access(user, workspace_id)
    auth.ensure_permission(user, "alerts.read", resolved_workspace_id)
    user_names = _user_name_map(db, resolved_workspace_id)
    alerts = db.scalars(select(Alert).where(Alert.workspace_id == resolved_workspace_id).order_by(Alert.triggered_at.desc())).all()
    return [
        AlertItem(
            alert_id=item.alert_id,
            workspace_id=item.workspace_id,
            title=item.title,
            alert_type=item.alert_type,
            severity=item.severity,
            status=item.status,
            triggered_at=_iso(item.triggered_at) or datetime.now(tz=UTC).isoformat(),
            owner=_owner_name(user_names, item.owner_user_id),
            aircraft_reference=item.aircraft_reference or "-",
            component=item.component or "-",
            station=item.station or "-",
            summary=item.summary,
            source_event_type=item.source_event_type,
            risk_score=item.risk_score,
        )
        for item in alerts
    ]


def create_alert(db: Session, user: User, payload: AlertCreateRequest) -> AlertItem:
    auth = AuthService(db)
    resolved_workspace_id = auth.ensure_workspace_access(user, payload.workspace_id)
    auth.ensure_permission(user, "alerts.write", resolved_workspace_id)
    alert = Alert(
        alert_id=f"alt_{int(datetime.now(tz=UTC).timestamp())}",
        workspace_id=resolved_workspace_id,
        title=payload.title,
        alert_type=payload.alert_type,
        severity=payload.severity,
        status="Open",
        triggered_at=datetime.now(tz=UTC),
        owner_user_id=user.user_id,
        aircraft_reference=payload.aircraft_reference or "",
        component=payload.component or "",
        station=payload.station or "",
        summary=payload.summary,
        source_event_id=None,
        source_event_type=payload.source_event_type,
        risk_score=payload.risk_score,
    )
    db.add(alert)
    db.commit()
    return list_alerts(db, user, resolved_workspace_id)[0]


def get_alert_summary(db: Session, user: User, workspace_id: str | None = None) -> AlertSummary:
    alerts = list_alerts(db, user, workspace_id)
    total = len(alerts)
    open_alerts = sum(item.status == "Open" for item in alerts)
    in_review = sum(item.status == "In Review" for item in alerts)
    critical = sum(item.severity == "Critical" for item in alerts)
    high = sum(item.severity == "High" for item in alerts)
    average = sum(item.risk_score for item in alerts) / total if total else 0
    return AlertSummary(
        total_alerts=total,
        open_alerts=open_alerts,
        in_review_alerts=in_review,
        critical_alerts=critical,
        high_alerts=high,
        average_risk_score=round(average, 1),
    )


def list_cases(db: Session, user: User, workspace_id: str | None = None) -> list[CaseSummary]:
    auth = AuthService(db)
    resolved_workspace_id = auth.ensure_workspace_access(user, workspace_id)
    auth.ensure_permission(user, "cases.read", resolved_workspace_id)
    user_names = _user_name_map(db, resolved_workspace_id)
    cases = db.scalars(select(Case).where(Case.workspace_id == resolved_workspace_id).order_by(Case.updated_at.desc())).all()
    return [
        CaseSummary(
            case_id=item.case_id,
            workspace_id=item.workspace_id,
            title=item.title,
            priority=item.priority,
            status=item.status,
            owner=_owner_name(user_names, item.owner_user_id),
            sla_due=_iso(item.sla_due) or datetime.now(tz=UTC).isoformat(),
            created_at=_iso(item.created_at) or datetime.now(tz=UTC).isoformat(),
            updated_at=_iso(item.updated_at) or datetime.now(tz=UTC).isoformat(),
            linked_alert_count=item.linked_alert_count,
            aircraft_reference=item.aircraft_reference or "-",
            category=item.category,
        )
        for item in cases
    ]


def create_case(db: Session, user: User, payload: CaseCreateRequest) -> CaseDetail:
    auth = AuthService(db)
    resolved_workspace_id = auth.ensure_workspace_access(user, payload.workspace_id)
    auth.ensure_permission(user, "cases.write", resolved_workspace_id)
    now = datetime.now(tz=UTC)
    case = Case(
        case_id=f"cas_{int(now.timestamp())}",
        workspace_id=resolved_workspace_id,
        title=payload.title,
        priority=payload.priority,
        status=payload.status,
        owner_user_id=user.user_id,
        sla_due=datetime.fromisoformat(payload.sla_due.replace("Z", "+00:00")),
        created_at=now,
        updated_at=now,
        linked_alert_count=payload.linked_alert_count,
        aircraft_reference=payload.aircraft_reference or "",
        category=payload.category,
    )
    db.add(case)
    db.add(
        CaseTimelineEntry(
            entry_id=f"ctl_{case.case_id}_1",
            case_id=case.case_id,
            timestamp=now,
            actor_user_id=user.user_id,
            actor_name=user.full_name,
            entry_type="Created",
            message="Case opened from control-plane workflow.",
        )
    )
    db.commit()
    return get_case_detail(db, user, case.case_id)


def get_case_detail(db: Session, user: User, case_id: str) -> CaseDetail:
    case = db.get(Case, case_id)
    if case is None:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")
    auth = AuthService(db)
    auth.ensure_workspace_access(user, case.workspace_id)
    auth.ensure_permission(user, "cases.read", case.workspace_id)
    user_names = _user_name_map(db, case.workspace_id)
    timeline = db.scalars(select(CaseTimelineEntry).where(CaseTimelineEntry.case_id == case.case_id).order_by(CaseTimelineEntry.timestamp.asc())).all()
    return CaseDetail(
        case_id=case.case_id,
        workspace_id=case.workspace_id,
        title=case.title,
        priority=case.priority,
        status=case.status,
        owner=_owner_name(user_names, case.owner_user_id),
        sla_due=_iso(case.sla_due) or datetime.now(tz=UTC).isoformat(),
        created_at=_iso(case.created_at) or datetime.now(tz=UTC).isoformat(),
        updated_at=_iso(case.updated_at) or datetime.now(tz=UTC).isoformat(),
        linked_alert_count=case.linked_alert_count,
        aircraft_reference=case.aircraft_reference or "-",
        category=case.category,
        timeline=[
            CaseTimelineEntrySchema(
                entry_id=item.entry_id,
                timestamp=_iso(item.timestamp) or datetime.now(tz=UTC).isoformat(),
                actor=item.actor_name,
                entry_type=item.entry_type,
                message=item.message,
            )
            for item in timeline
        ],
    )


def add_case_timeline_entry(db: Session, user: User, case_id: str, payload: CaseTimelineCreateRequest) -> CaseDetail:
    case = db.get(Case, case_id)
    if case is None:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")
    auth = AuthService(db)
    auth.ensure_workspace_access(user, case.workspace_id)
    auth.ensure_permission(user, "cases.write", case.workspace_id)
    now = datetime.now(tz=UTC)
    db.add(
        CaseTimelineEntry(
            entry_id=f"ctl_{case_id}_{int(now.timestamp())}",
            case_id=case.case_id,
            timestamp=now,
            actor_user_id=user.user_id,
            actor_name=user.full_name,
            entry_type=payload.entry_type,
            message=payload.message,
        )
    )
    case.updated_at = now
    db.commit()
    return get_case_detail(db, user, case_id)


def list_events(db: Session, user: User, workspace_id: str | None = None) -> list[OperationalEventSchema]:
    auth = AuthService(db)
    resolved_workspace_id = auth.ensure_workspace_access(user, workspace_id)
    auth.ensure_permission(user, "events.read", resolved_workspace_id)
    installs = {item.connector_id: item.name for item in db.scalars(select(ConnectorInstall).where(ConnectorInstall.workspace_id == resolved_workspace_id)).all()}
    events = db.scalars(select(OperationalEvent).where(OperationalEvent.workspace_id == resolved_workspace_id).order_by(OperationalEvent.created_at.desc())).all()
    return [
        OperationalEventSchema(
            event_id=item.event_id,
            workspace_id=item.workspace_id,
            event_type=item.event_type,
            severity=item.severity,
            title=item.title,
            created_at=_iso(item.created_at) or datetime.now(tz=UTC).isoformat(),
            source_connector=installs.get(item.source_connector_id or "", item.source_connector_id or "System"),
            status=item.status,
        )
        for item in events
    ]


# Network workspace

DEFAULT_NETWORK_LAYERS = {
    "owned_fleet",
    "watch_aircraft",
    "maintenance_bases",
    "hotspots",
    "airport_congestion",
}


def _requested_layers(include_layers: str | None) -> set[str]:
    if not include_layers:
        return set(DEFAULT_NETWORK_LAYERS)
    return {item.strip() for item in include_layers.split(",") if item.strip()}

def get_network_workspace(
    db: Session,
    user: User,
    workspace_id: str | None = None,
    *,
    region: str = "global",
    limit: int | None = None,
    min_altitude: float | None = None,
    max_altitude: float | None = None,
    query: str | None = None,
    airline: str | None = None,
    category: str | None = None,
    include_layers: str | None = None,
    on_ground: bool | None = None,
    refresh: bool = False,
) -> NetworkWorkspaceResponse:
    auth = AuthService(db)
    workspace = _resolve_workspace(db, auth, user, workspace_id)
    auth.ensure_permission(user, "network.read", workspace.workspace_id)

    flight_service = get_flight_service()
    requested_layers = _requested_layers(include_layers)
    derivation_limit = min(max((limit or 250) * 2, 250), 420)
    derivation_feed = flight_service.get_live_flights(
        limit=derivation_limit,
        region=region,
        min_altitude=min_altitude,
        max_altitude=max_altitude,
        query=query,
        airline=airline,
        category=category,
        on_ground=on_ground,
        refresh=refresh,
    )
    overview = flight_service.summarize_items(derivation_feed.items, derivation_feed.status)
    feed = flight_service.get_live_flights(
        limit=limit,
        region=region,
        min_altitude=min_altitude,
        max_altitude=max_altitude,
        query=query,
        airline=airline,
        category=category,
        on_ground=on_ground,
        refresh=refresh,
    )
    live_flights = [item.model_dump() for item in derivation_feed.items]
    airline_facets = flight_service.get_airline_facets(derivation_feed.items)
    category_facets = flight_service.get_category_facets(derivation_feed.items)

    alerts = list_alerts(db, user, workspace.workspace_id)
    alert_summary = get_alert_summary(db, user, workspace.workspace_id)
    cases = list_cases(db, user, workspace.workspace_id)
    alerts_by_station = Counter(item.station for item in alerts if item.station and item.station != "-")
    cases_by_station = Counter(item.aircraft_reference.split("-")[0] if item.aircraft_reference and "-" in item.aircraft_reference else item.aircraft_reference for item in cases if item.aircraft_reference and item.aircraft_reference != "-")

    sites = db.scalars(select(WorkspaceSite).where(WorkspaceSite.workspace_id == workspace.workspace_id)).all()
    site_lookup = {site.iata_code: (site.latitude, site.longitude) for site in sites}
    maintenance_bases = build_maintenance_bases(
        [{"site_name": item.site_name, "iata_code": item.iata_code, "latitude": item.latitude, "longitude": item.longitude} for item in sites],
        alerts_by_station,
        cases_by_station,
    ) if "maintenance_bases" in requested_layers else []

    workspace_aircraft = db.scalars(select(WorkspaceAircraft).where(WorkspaceAircraft.workspace_id == workspace.workspace_id)).all()
    owned_fleet_matches: list[OwnedFleetMatch] = []
    owned_fleet: list[OwnedFleetAircraft] = []
    if requested_layers & {"owned_fleet", "watch_aircraft", "owned_matches"}:
        owned_fleet_matches, owned_fleet = build_owned_fleet_matches(
            [
                {
                    "aircraft_id": item.aircraft_id,
                    "tail_number": item.tail_number,
                    "aircraft_type": item.aircraft_type,
                    "default_callsign": item.default_callsign,
                    "station": item.station,
                    "risk_score": item.risk_score,
                    "operational_status": item.operational_status,
                }
                for item in workspace_aircraft
            ],
            live_flights,
            site_lookup,
        )

    airport_overlays: list[AirportOverlay] = []
    weather_layers: list[WeatherOverlay] = []
    hotspots: list[DisruptionHotspot] = []
    if requested_layers & {"airport_congestion", "weather", "hotspots"}:
        region_airports = load_airports_reference()
        derived_airports = build_airport_overlays(live_flights, region_airports)
        if "airport_congestion" in requested_layers:
            airport_overlays = derived_airports
        if "weather" in requested_layers:
            weather_layers = build_weather_layers(derived_airports, refresh=refresh)
        if "hotspots" in requested_layers:
            hotspots = build_hotspots(alerts_by_station, derived_airports)

    corridor_segments = build_corridor_segments(live_flights) if "corridors" in requested_layers else []

    layers = [
        NetworkLayerSummary(layer_id="owned_fleet", label="Owned Fleet", enabled_default=True, feature_count=len(owned_fleet), status="Healthy", description="Airline fleet overlays matched against live traffic."),
        NetworkLayerSummary(layer_id="watch_aircraft", label="Watch Aircraft", enabled_default=True, feature_count=sum(item.risk_score >= 70 for item in owned_fleet), status="Healthy", description="High-risk owned aircraft and dispatch watch markers."),
        NetworkLayerSummary(layer_id="maintenance_bases", label="Maintenance Bases", enabled_default=True, feature_count=len(maintenance_bases), status="Healthy", description="Maintenance control sites with active engineering workload."),
        NetworkLayerSummary(layer_id="hotspots", label="Hotspots", enabled_default=True, feature_count=len(hotspots), status="Healthy", description="Derived disruption hotspots from alert density and network pressure."),
        NetworkLayerSummary(layer_id="weather", label="Weather", enabled_default=False, feature_count=len(weather_layers), status="Derived" if any(item.source_status != "live" for item in weather_layers) else "Healthy", description="Airport weather overlays from public weather sources with fallback derivation."),
        NetworkLayerSummary(layer_id="corridors", label="Route Corridors", enabled_default=False, feature_count=len(corridor_segments), status="Healthy", description="Traffic density corridors derived from current live-flight positions."),
        NetworkLayerSummary(layer_id="airport_congestion", label="Airport Congestion", enabled_default=True, feature_count=len(airport_overlays), status="Healthy", description="Derived arrival and surface pressure around major airports."),
        NetworkLayerSummary(layer_id="owned_matches", label="Owned Matches", enabled_default=False, feature_count=len(owned_fleet_matches), status="Healthy", description="Live matching status between connected fleet records and flight traffic."),
    ]

    matched_map = {item.live_flight_icao24: item for item in owned_fleet_matches if item.live_flight_icao24}
    enriched_items = []
    for flight in feed.items:
        enriched_items.append(flight.model_copy(update={
            "matched_aircraft_id": matched_map.get(flight.icao24).aircraft_id if matched_map.get(flight.icao24) else None,
            "matched_tail_number": matched_map.get(flight.icao24).tail_number if matched_map.get(flight.icao24) else None,
        }))
    feed.items = enriched_items

    return NetworkWorkspaceResponse(
        workspace=_workspace_summary_model(db, workspace),
        environment=get_environment_status(db),
        flight_overview=overview,
        flight_feed=feed,
        airline_facets=airline_facets,
        category_facets=category_facets,
        layers=layers,
        owned_fleet=owned_fleet,
        maintenance_bases=maintenance_bases,
        hotspots=hotspots,
        weather_layers=weather_layers,
        corridor_segments=corridor_segments,
        airport_overlays=airport_overlays,
        owned_fleet_matches=owned_fleet_matches,
        alert_summary=alert_summary,
    )
