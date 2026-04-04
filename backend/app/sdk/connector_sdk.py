from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session


class ConnectorValidationError(BaseModel):
    field: str
    message: str


class ConnectorSyncCursor(BaseModel):
    cursor_value: str | None = None
    checkpoint_at: str | None = None
    raw_state: dict[str, Any] = Field(default_factory=dict)


class ConnectorHeartbeat(BaseModel):
    connector_id: str
    workspace_id: str
    runtime_location: str
    status: str
    observed_at: str
    message: str | None = None


class ConnectorRecordEnvelope(BaseModel):
    entity_type: str
    workspace_id: str
    source_record_id: str
    source_timestamp: str
    payload: dict[str, Any] = Field(default_factory=dict)
    cursor: ConnectorSyncCursor | None = None


class ConnectorConfigFieldSpec(BaseModel):
    key: str
    label: str
    field_type: str
    required: bool = True
    secret: bool = False
    description: str


class ConnectorManifestSpec(BaseModel):
    connector_key: str
    name: str
    package_name: str
    version: str
    source_category: str
    schema_version: str
    supported_entities: list[str]
    config_fields: list[ConnectorConfigFieldSpec] = Field(default_factory=list)
    default_sync_mode: str = "scheduled"
    default_deployment_target: str = "Hosted Worker"
    edge_supported: bool = False
    description: str = ""


class ConnectorSyncResult(BaseModel):
    status: str = "Succeeded"
    records_processed: int = 0
    message: str | None = None
    next_cursor: ConnectorSyncCursor | None = None
    emitted_records: list[ConnectorRecordEnvelope] = Field(default_factory=list)


@dataclass
class ConnectorExecutionContext:
    db: Session
    workspace_id: str
    connector_id: str
    install_id: str
    config: dict[str, Any]
    current_cursor: ConnectorSyncCursor | None = None
    force_full_sync: bool = False


class ConnectorCursorStore:
    def __init__(self, current_cursor: ConnectorSyncCursor | None = None) -> None:
        self._cursor = current_cursor or ConnectorSyncCursor()

    def get(self) -> ConnectorSyncCursor:
        return self._cursor

    def set(self, cursor_value: str | None, checkpoint_at: str | None = None, raw_state: dict[str, Any] | None = None) -> ConnectorSyncCursor:
        self._cursor = ConnectorSyncCursor(
            cursor_value=cursor_value,
            checkpoint_at=checkpoint_at or datetime.now(tz=UTC).isoformat(),
            raw_state=raw_state or {},
        )
        return self._cursor


class BaseConnector(ABC):
    manifest: ConnectorManifestSpec

    @classmethod
    def connector_key(cls) -> str:
        return cls.manifest.connector_key

    @classmethod
    def manifest_spec(cls) -> ConnectorManifestSpec:
        return cls.manifest

    def validate_config(self, config: dict[str, Any]) -> list[ConnectorValidationError]:
        fields = {field.key: field for field in self.manifest.config_fields}
        errors: list[ConnectorValidationError] = []
        for field in self.manifest.config_fields:
            value = config.get(field.key)
            if field.required and value in (None, ""):
                errors.append(ConnectorValidationError(field=field.key, message=f"{field.label} is required."))
        for key in config:
            if key not in fields:
                errors.append(ConnectorValidationError(field=key, message="Unknown configuration field."))
        return errors

    @abstractmethod
    def sync(self, context: ConnectorExecutionContext) -> ConnectorSyncResult:
        raise NotImplementedError

    def heartbeat(self, context: ConnectorExecutionContext, status: str, message: str | None = None) -> ConnectorHeartbeat:
        return ConnectorHeartbeat(
            connector_id=context.connector_id,
            workspace_id=context.workspace_id,
            runtime_location=context.config.get("runtime_location", "Control Plane"),
            status=status,
            observed_at=datetime.now(tz=UTC).isoformat(),
            message=message,
        )


class ConnectorRegistry:
    def __init__(self) -> None:
        self._registry: dict[str, type[BaseConnector]] = {}

    def register(self, connector_cls: type[BaseConnector]) -> None:
        self._registry[connector_cls.connector_key()] = connector_cls

    def get(self, connector_key: str) -> type[BaseConnector]:
        try:
            return self._registry[connector_key]
        except KeyError as exc:
            raise KeyError(f"Connector '{connector_key}' is not registered") from exc

    def items(self) -> list[type[BaseConnector]]:
        return list(self._registry.values())


registry = ConnectorRegistry()


def stable_id(prefix: str, *parts: str) -> str:
    digest = sha256("::".join(parts).encode("utf-8")).hexdigest()[:10]
    return f"{prefix}_{digest}"
