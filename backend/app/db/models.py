from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class User(TimestampMixin, Base):
    __tablename__ = "users"

    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(512))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    platform_role: Mapped[str] = mapped_column(String(64), default="viewer")
    location: Mapped[str | None] = mapped_column(String(64), nullable=True)


class Role(TimestampMixin, Base):
    __tablename__ = "roles"

    role_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)


class Permission(Base):
    __tablename__ = "permissions"

    permission_code: Mapped[str] = mapped_column(String(128), primary_key=True)
    description: Mapped[str] = mapped_column(Text)


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (UniqueConstraint("role_key", "permission_code", name="uq_role_permission"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    role_key: Mapped[str] = mapped_column(ForeignKey("roles.role_key", ondelete="CASCADE"))
    permission_code: Mapped[str] = mapped_column(ForeignKey("permissions.permission_code", ondelete="CASCADE"))


class Workspace(TimestampMixin, Base):
    __tablename__ = "workspaces"

    workspace_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    airline_name: Mapped[str] = mapped_column(String(255))
    airline_code: Mapped[str] = mapped_column(String(32), index=True)
    status: Mapped[str] = mapped_column(String(64))
    deployment_mode: Mapped[str] = mapped_column(String(128))
    primary_region: Mapped[str] = mapped_column(String(128))
    description: Mapped[str] = mapped_column(Text)
    branding: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class WorkspaceMembership(TimestampMixin, Base):
    __tablename__ = "workspace_memberships"
    __table_args__ = (UniqueConstraint("workspace_id", "user_id", name="uq_workspace_membership"),)

    membership_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.workspace_id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"), index=True)
    role_key: Mapped[str] = mapped_column(ForeignKey("roles.role_key", ondelete="RESTRICT"), index=True)


class WorkspaceFleet(TimestampMixin, Base):
    __tablename__ = "workspace_fleets"

    fleet_row_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.workspace_id", ondelete="CASCADE"), index=True)
    fleet_id: Mapped[str] = mapped_column(String(64))
    fleet_name: Mapped[str] = mapped_column(String(255))
    aircraft_count: Mapped[int] = mapped_column(Integer)


class WorkspaceSite(TimestampMixin, Base):
    __tablename__ = "workspace_sites"

    site_row_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.workspace_id", ondelete="CASCADE"), index=True)
    site_id: Mapped[str] = mapped_column(String(64))
    site_name: Mapped[str] = mapped_column(String(255))
    iata_code: Mapped[str] = mapped_column(String(16), index=True)
    site_type: Mapped[str] = mapped_column(String(64))
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)


class WorkspaceAircraft(TimestampMixin, Base):
    __tablename__ = "workspace_aircraft"

    aircraft_row_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.workspace_id", ondelete="CASCADE"), index=True)
    aircraft_id: Mapped[str] = mapped_column(String(64))
    tail_number: Mapped[str] = mapped_column(String(32), index=True)
    aircraft_type: Mapped[str] = mapped_column(String(64))
    default_callsign: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    station: Mapped[str | None] = mapped_column(String(32), nullable=True)
    risk_score: Mapped[float] = mapped_column(Float, default=0)
    operational_status: Mapped[str] = mapped_column(String(64), default="Active")


class SessionToken(TimestampMixin, Base):
    __tablename__ = "session_tokens"

    session_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"), index=True)
    refresh_token_hash: Mapped[str] = mapped_column(String(128), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    issued_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    audit_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    workspace_id: Mapped[str | None] = mapped_column(ForeignKey("workspaces.workspace_id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String(128))
    entity_type: Mapped[str] = mapped_column(String(128))
    entity_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ConnectorCatalog(Base):
    __tablename__ = "connector_catalog"

    connector_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    source_category: Mapped[str] = mapped_column(String(128))
    package_name: Mapped[str] = mapped_column(String(255))
    module_path: Mapped[str] = mapped_column(String(255))
    class_name: Mapped[str] = mapped_column(String(255))
    version: Mapped[str] = mapped_column(String(64))
    schema_version: Mapped[str] = mapped_column(String(64))
    supported_entities: Mapped[list[str]] = mapped_column(JSON, default=list)
    config_schema: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    default_sync_mode: Mapped[str] = mapped_column(String(64), default="scheduled")
    default_deployment_target: Mapped[str] = mapped_column(String(128), default="Hosted")
    edge_supported: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[str] = mapped_column(Text)


class ConnectorInstall(TimestampMixin, Base):
    __tablename__ = "connector_installs"

    install_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.workspace_id", ondelete="CASCADE"), index=True)
    connector_key: Mapped[str] = mapped_column(ForeignKey("connector_catalog.connector_key", ondelete="RESTRICT"), index=True)
    connector_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(64), default="Healthy")
    sync_mode: Mapped[str] = mapped_column(String(64), default="scheduled")
    deployment_target: Mapped[str] = mapped_column(String(128), default="Hosted")
    runtime_location: Mapped[str] = mapped_column(String(128), default="Control Plane")
    package_name: Mapped[str] = mapped_column(String(255))
    version: Mapped[str] = mapped_column(String(64))
    schema_version: Mapped[str] = mapped_column(String(64))
    health_score: Mapped[int] = mapped_column(Integer, default=100)
    last_sync: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_sync: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    supported_entities: Mapped[list[str]] = mapped_column(JSON, default=list)


class ConnectorConfig(TimestampMixin, Base):
    __tablename__ = "connector_configs"

    config_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    install_id: Mapped[str] = mapped_column(ForeignKey("connector_installs.install_id", ondelete="CASCADE"), unique=True)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    updated_by: Mapped[str | None] = mapped_column(ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)


class ConnectorRun(Base):
    __tablename__ = "connector_runs"

    run_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    install_id: Mapped[str] = mapped_column(ForeignKey("connector_installs.install_id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(64), default="Queued")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    records_processed: Mapped[int] = mapped_column(Integer, default=0)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)


class ConnectorCursor(Base):
    __tablename__ = "connector_cursors"

    cursor_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    install_id: Mapped[str] = mapped_column(ForeignKey("connector_installs.install_id", ondelete="CASCADE"), unique=True, index=True)
    cursor_value: Mapped[str | None] = mapped_column(String(255), nullable=True)
    checkpoint_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    raw_state: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class OperationalEvent(Base):
    __tablename__ = "operational_events"

    event_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.workspace_id", ondelete="CASCADE"), index=True)
    event_type: Mapped[str] = mapped_column(String(128))
    severity: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    source_connector_id: Mapped[str | None] = mapped_column(ForeignKey("connector_installs.connector_id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class Alert(Base):
    __tablename__ = "alerts"

    alert_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.workspace_id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    alert_type: Mapped[str] = mapped_column(String(128))
    severity: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(64))
    triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    owner_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    aircraft_reference: Mapped[str | None] = mapped_column(String(128), nullable=True)
    component: Mapped[str | None] = mapped_column(String(128), nullable=True)
    station: Mapped[str | None] = mapped_column(String(64), nullable=True)
    summary: Mapped[str] = mapped_column(Text)
    source_event_id: Mapped[str | None] = mapped_column(ForeignKey("operational_events.event_id", ondelete="SET NULL"), nullable=True)
    source_event_type: Mapped[str] = mapped_column(String(128))
    risk_score: Mapped[float] = mapped_column(Float, default=0)


class Case(Base):
    __tablename__ = "cases"

    case_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.workspace_id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    priority: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(64))
    owner_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    sla_due: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    linked_alert_count: Mapped[int] = mapped_column(Integer, default=0)
    aircraft_reference: Mapped[str | None] = mapped_column(String(128), nullable=True)
    category: Mapped[str] = mapped_column(String(128))


class CaseTimelineEntry(Base):
    __tablename__ = "case_timeline_entries"

    entry_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.case_id", ondelete="CASCADE"), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    actor_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    actor_name: Mapped[str] = mapped_column(String(255))
    entry_type: Mapped[str] = mapped_column(String(128))
    message: Mapped[str] = mapped_column(Text)
