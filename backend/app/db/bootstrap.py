from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.connectors.examples import AmosConnector, DocumentHubConnector, FlightOpsConnector, SapSparesConnector
from app.db.base import Base
from app.db.models import (
    Alert,
    AuditLog,
    Case,
    CaseTimelineEntry,
    ConnectorCatalog,
    ConnectorConfig,
    ConnectorCursor,
    ConnectorInstall,
    ConnectorRun,
    OperationalEvent,
    Permission,
    Role,
    RolePermission,
    SessionToken,
    User,
    Workspace,
    WorkspaceAircraft,
    WorkspaceFleet,
    WorkspaceMembership,
    WorkspaceSite,
)
from app.db.session import SessionLocal, engine
from app.sdk.connector_sdk import BaseConnector
from app.services.auth_service import hash_password

SEED_PATH = Path(settings.data_dir) / "platform_seed.json"

ROLE_DEFINITIONS: dict[str, dict[str, Any]] = {
    "platform_admin": {
        "display_name": "Platform Admin",
        "description": "Global platform administration across all airline workspaces.",
        "permissions": [
            "workspace.read",
            "workspace.write",
            "roles.read",
            "alerts.read",
            "alerts.write",
            "cases.read",
            "cases.write",
            "connectors.read",
            "connectors.write",
            "connectors.sync",
            "events.read",
            "network.read",
            "admin.read",
            "admin.write",
            "analytics.read",
            "docs.read",
            "users.read",
        ],
    },
    "airline_admin": {
        "display_name": "Airline Admin",
        "description": "Workspace administration and airline-level oversight.",
        "permissions": [
            "workspace.read",
            "alerts.read",
            "alerts.write",
            "cases.read",
            "cases.write",
            "connectors.read",
            "connectors.write",
            "connectors.sync",
            "events.read",
            "network.read",
            "admin.read",
            "analytics.read",
            "docs.read",
            "users.read",
        ],
    },
    "reliability_engineer": {
        "display_name": "Reliability Engineer",
        "description": "Engineering analytics, alerts, and case investigation.",
        "permissions": [
            "workspace.read",
            "alerts.read",
            "alerts.write",
            "cases.read",
            "cases.write",
            "connectors.read",
            "events.read",
            "network.read",
            "analytics.read",
            "docs.read",
        ],
    },
    "maintenance_control": {
        "display_name": "Maintenance Control",
        "description": "Maintenance control actions, incident triage, and watchlist management.",
        "permissions": [
            "workspace.read",
            "alerts.read",
            "alerts.write",
            "cases.read",
            "cases.write",
            "connectors.read",
            "events.read",
            "network.read",
            "analytics.read",
            "docs.read",
        ],
    },
    "logistics_controller": {
        "display_name": "Logistics Controller",
        "description": "Materials, spares exposure, and operational coordination.",
        "permissions": [
            "workspace.read",
            "alerts.read",
            "cases.read",
            "cases.write",
            "connectors.read",
            "events.read",
            "network.read",
            "analytics.read",
            "docs.read",
        ],
    },
    "viewer": {
        "display_name": "Viewer",
        "description": "Read-only access to the airline workspace.",
        "permissions": [
            "workspace.read",
            "alerts.read",
            "cases.read",
            "connectors.read",
            "events.read",
            "network.read",
            "analytics.read",
            "docs.read",
        ],
    },
}

CONNECTOR_CLASSES: tuple[type[BaseConnector], ...] = (
    AmosConnector,
    SapSparesConnector,
    FlightOpsConnector,
    DocumentHubConnector,
)

SITE_COORDINATES: dict[str, tuple[float, float]] = {
    "DEL": (28.5562, 77.1),
    "BOM": (19.0896, 72.8656),
    "BLR": (13.1986, 77.7066),
    "HYD": (17.2403, 78.4294),
    "MAA": (12.9941, 80.1709),
    "LHR": (51.47, -0.4543),
    "DUB": (53.4213, -6.2701),
}

PACKAGE_TO_CONNECTOR_KEY = {
    "aog-connectors.amos": "amos_core",
    "aog-connectors.sap-ewm": "sap_ewm_spares",
    "aog-connectors.flight-ops": "flight_ops_stream",
    "aog-connectors.doc-hub": "document_hub",
}


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def seed_email(name: str, airline_code: str) -> str:
    local = ".".join(part.lower() for part in name.split())
    return f"{local}@{airline_code.lower()}.airline.local"


ROLE_MAP = {
    "Platform Admin": "platform_admin",
    "Maintenance Control Lead": "maintenance_control",
    "Reliability Engineer": "reliability_engineer",
    "Materials Planner": "logistics_controller",
    "Engineering Director": "airline_admin",
    "Connector Admin": "airline_admin",
}


def ensure_schema() -> None:
    Base.metadata.create_all(bind=engine)


class Bootstrapper:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.payload = json.loads(SEED_PATH.read_text()) if SEED_PATH.exists() else {}
        self.user_names: dict[str, str] = {}

    def run(self) -> None:
        self.seed_permissions_and_roles()
        self.db.flush()
        self.seed_connector_catalog()
        self.db.flush()
        if settings.bootstrap_platform_data:
            self.seed_platform_records()
        self.db.commit()

    def upsert(self, instance: Any) -> None:
        self.db.merge(instance)

    def seed_permissions_and_roles(self) -> None:
        existing_permissions = {item.permission_code for item in self.db.scalars(select(Permission)).all()}
        for role_key, definition in ROLE_DEFINITIONS.items():
            role = self.db.get(Role, role_key)
            if role is None:
                role = Role(
                    role_key=role_key,
                    display_name=definition["display_name"],
                    description=definition["description"],
                )
                self.db.add(role)
            for permission_code in definition["permissions"]:
                if permission_code not in existing_permissions:
                    self.db.add(Permission(permission_code=permission_code, description=permission_code.replace(".", " ").title()))
                    existing_permissions.add(permission_code)
                mapping = self.db.scalar(
                    select(RolePermission).where(
                        RolePermission.role_key == role_key,
                        RolePermission.permission_code == permission_code,
                    )
                )
                if mapping is None:
                    self.db.add(RolePermission(role_key=role_key, permission_code=permission_code))

    def seed_connector_catalog(self) -> None:
        for connector_cls in CONNECTOR_CLASSES:
            manifest = connector_cls.manifest_spec()
            item = self.db.get(ConnectorCatalog, manifest.connector_key)
            payload = dict(
                connector_key=manifest.connector_key,
                name=manifest.name,
                source_category=manifest.source_category,
                package_name=manifest.package_name,
                module_path=connector_cls.__module__,
                class_name=connector_cls.__name__,
                version=manifest.version,
                schema_version=manifest.schema_version,
                supported_entities=manifest.supported_entities,
                config_schema={"fields": [field.model_dump() for field in manifest.config_fields]},
                default_sync_mode=manifest.default_sync_mode,
                default_deployment_target=manifest.default_deployment_target,
                edge_supported=manifest.edge_supported,
                description=manifest.description,
            )
            if item is None:
                self.db.add(ConnectorCatalog(**payload))
            else:
                for key, value in payload.items():
                    setattr(item, key, value)

    def seed_platform_records(self) -> None:
        default_admin = User(
            user_id="usr_platform_admin",
            email=settings.bootstrap_admin_email,
            full_name=settings.bootstrap_admin_name,
            password_hash=hash_password(settings.bootstrap_default_password),
            is_active=True,
            platform_role="platform_admin",
            location="Control Plane",
        )
        self.upsert(default_admin)
        self.user_names[default_admin.user_id] = default_admin.full_name

        for workspace_seed in self.payload.get("workspaces", []):
            workspace = Workspace(
                workspace_id=workspace_seed["workspace_id"],
                airline_name=workspace_seed["airline_name"],
                airline_code=workspace_seed["airline_code"],
                status=workspace_seed["status"],
                deployment_mode=workspace_seed["deployment_mode"],
                primary_region=workspace_seed["primary_region"],
                description=workspace_seed["description"],
                branding=workspace_seed.get("branding", {}),
            )
            self.upsert(workspace)

            for fleet in workspace_seed.get("fleets", []):
                self.upsert(
                    WorkspaceFleet(
                        fleet_row_id=f"{workspace.workspace_id}:{fleet['fleet_id']}",
                        workspace_id=workspace.workspace_id,
                        fleet_id=fleet["fleet_id"],
                        fleet_name=fleet["fleet_name"],
                        aircraft_count=fleet["aircraft_count"],
                    )
                )

            for site in workspace_seed.get("sites", []):
                coords = SITE_COORDINATES.get(site["iata_code"], (None, None))
                self.upsert(
                    WorkspaceSite(
                        site_row_id=f"{workspace.workspace_id}:{site['site_id']}",
                        workspace_id=workspace.workspace_id,
                        site_id=site["site_id"],
                        site_name=site["site_name"],
                        iata_code=site["iata_code"],
                        site_type=site["type"],
                        latitude=coords[0],
                        longitude=coords[1],
                    )
                )

            for user_seed in workspace_seed.get("users", []):
                email = (
                    f"{'.'.join(part.lower() for part in user_seed['name'].split())}@aogsentinel.local"
                    if user_seed["role"] == "Platform Admin"
                    else seed_email(user_seed["name"], workspace.airline_code)
                )
                user = User(
                    user_id=user_seed["user_id"],
                    email=email,
                    full_name=user_seed["name"],
                    password_hash=hash_password(settings.bootstrap_default_password),
                    is_active=True,
                    platform_role="platform_admin" if user_seed["role"] == "Platform Admin" else "viewer",
                    location=user_seed.get("location"),
                )
                self.upsert(user)
                self.user_names[user.user_id] = user.full_name
                membership = WorkspaceMembership(
                    membership_id=f"mbr_{workspace.workspace_id}_{user.user_id}",
                    workspace_id=workspace.workspace_id,
                    user_id=user.user_id,
                    role_key=ROLE_MAP.get(user_seed["role"], "viewer"),
                )
                self.upsert(membership)

        self.db.flush()

        for connector_seed in self.payload.get("connectors", []):
            connector_key = PACKAGE_TO_CONNECTOR_KEY.get(connector_seed["package_name"], "amos_core")
            catalog = self.db.get(ConnectorCatalog, connector_key)
            install = ConnectorInstall(
                install_id=f"inst_{connector_seed['connector_id']}",
                workspace_id=connector_seed["workspace_id"],
                connector_key=connector_key,
                connector_id=connector_seed["connector_id"],
                name=connector_seed["name"],
                status=connector_seed["status"],
                sync_mode=connector_seed["sync_mode"],
                deployment_target=connector_seed["deployment_target"],
                runtime_location=connector_seed["runtime_location"],
                package_name=connector_seed["package_name"],
                version=connector_seed["version"],
                schema_version=connector_seed["schema_version"],
                health_score=connector_seed["health_score"],
                last_sync=parse_dt(connector_seed.get("last_sync")),
                next_sync=parse_dt(connector_seed.get("next_sync")),
                supported_entities=connector_seed["supported_entities"],
            )
            self.upsert(install)
            self.db.flush()
            self.upsert(
                ConnectorConfig(
                    config_id=f"cfg_{connector_seed['connector_id']}",
                    install_id=install.install_id,
                    config={field["key"]: "configured" for field in connector_seed.get("config_fields", [])},
                    updated_by="usr_platform_admin",
                )
            )
            self.upsert(
                ConnectorCursor(
                    cursor_id=f"cur_{connector_seed['connector_id']}",
                    install_id=install.install_id,
                    cursor_value=connector_seed.get("last_sync"),
                    checkpoint_at=parse_dt(connector_seed.get("last_sync")),
                    raw_state={"seeded_from": connector_seed["connector_id"]},
                )
            )
            for run_seed in connector_seed.get("sync_history", []):
                self.upsert(
                    ConnectorRun(
                        run_id=run_seed["run_id"],
                        install_id=install.install_id,
                        status=run_seed["status"],
                        started_at=parse_dt(run_seed.get("started_at")),
                        ended_at=parse_dt(run_seed.get("ended_at")),
                        records_processed=run_seed.get("records_processed", 0),
                        message=None,
                    )
                )

        self.db.flush()

        for event_seed in self.payload.get("events", []):
            source_connector_id = None
            for connector_seed in self.payload.get("connectors", []):
                if connector_seed["name"] == event_seed.get("source_connector"):
                    source_connector_id = connector_seed["connector_id"]
                    break
            self.upsert(
                OperationalEvent(
                    event_id=event_seed["event_id"],
                    workspace_id=event_seed["workspace_id"],
                    event_type=event_seed["event_type"],
                    severity=event_seed["severity"],
                    title=event_seed["title"],
                    created_at=parse_dt(event_seed["created_at"]),
                    source_connector_id=source_connector_id,
                    status=event_seed["status"],
                    payload={},
                )
            )

        self.db.flush()

        for alert_seed in self.payload.get("alerts", []):
            owner_user_id = self.find_user_id_by_name(alert_seed.get("owner"))
            event_id = next((item["event_id"] for item in self.payload.get("events", []) if item["event_type"] == alert_seed.get("source_event_type")), None)
            self.upsert(
                Alert(
                    alert_id=alert_seed["alert_id"],
                    workspace_id=alert_seed["workspace_id"],
                    title=alert_seed["title"],
                    alert_type=alert_seed["alert_type"],
                    severity=alert_seed["severity"],
                    status=alert_seed["status"],
                    triggered_at=parse_dt(alert_seed["triggered_at"]),
                    owner_user_id=owner_user_id,
                    aircraft_reference=alert_seed.get("aircraft_reference") or "",
                    component=alert_seed.get("component") or "",
                    station=alert_seed.get("station") or "",
                    summary=alert_seed["summary"],
                    source_event_id=event_id,
                    source_event_type=alert_seed["source_event_type"],
                    risk_score=float(alert_seed["risk_score"]),
                )
            )

        self.db.flush()

        for case_seed in self.payload.get("cases", []):
            owner_user_id = self.find_user_id_by_name(case_seed.get("owner"))
            self.upsert(
                Case(
                    case_id=case_seed["case_id"],
                    workspace_id=case_seed["workspace_id"],
                    title=case_seed["title"],
                    priority=case_seed["priority"],
                    status=case_seed["status"],
                    owner_user_id=owner_user_id,
                    sla_due=parse_dt(case_seed["sla_due"]),
                    created_at=parse_dt(case_seed["created_at"]),
                    updated_at=parse_dt(case_seed["updated_at"]),
                    linked_alert_count=case_seed["linked_alert_count"],
                    aircraft_reference=case_seed.get("aircraft_reference") or "",
                    category=case_seed["category"],
                )
            )
            for timeline_entry in case_seed.get("timeline", []):
                actor_user_id = self.find_user_id_by_name(timeline_entry.get("actor"))
                self.upsert(
                    CaseTimelineEntry(
                        entry_id=timeline_entry["entry_id"],
                        case_id=case_seed["case_id"],
                        timestamp=parse_dt(timeline_entry["timestamp"]),
                        actor_user_id=actor_user_id,
                        actor_name=timeline_entry["actor"],
                        entry_type=timeline_entry["entry_type"],
                        message=timeline_entry["message"],
                    )
                )

        self.db.flush()

        for network_seed in self.payload.get("network", []):
            for index, aircraft in enumerate(network_seed.get("owned_fleet", []), start=1):
                self.upsert(
                    WorkspaceAircraft(
                        aircraft_row_id=f"{network_seed['workspace_id']}:aircraft:{index}",
                        workspace_id=network_seed["workspace_id"],
                        aircraft_id=aircraft["aircraft_id"],
                        tail_number=aircraft["tail_number"],
                        aircraft_type=aircraft["aircraft_type"],
                        default_callsign=aircraft.get("callsign"),
                        station=aircraft.get("station"),
                        risk_score=float(aircraft.get("risk_score", 0)),
                        operational_status=aircraft.get("status", "Active"),
                    )
                )

        self.upsert(
            AuditLog(
                audit_id="audit_bootstrap",
                user_id="usr_platform_admin",
                workspace_id=None,
                action="bootstrap.seed",
                entity_type="platform",
                entity_id="initial-seed",
                details={"source": str(SEED_PATH.name)},
                occurred_at=datetime.now(tz=UTC),
            )
        )

    def find_user_id_by_name(self, name: str | None) -> str | None:
        if not name:
            return None
        for user_id, full_name in self.user_names.items():
            if full_name == name:
                return user_id
        return None


def bootstrap_database() -> None:
    ensure_schema()
    with SessionLocal() as db:
        Bootstrapper(db).run()
