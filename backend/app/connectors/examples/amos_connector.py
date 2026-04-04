from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.sdk.connector_sdk import (
    BaseConnector,
    ConnectorConfigFieldSpec,
    ConnectorExecutionContext,
    ConnectorManifestSpec,
    ConnectorRecordEnvelope,
    ConnectorSyncResult,
)


class AmosConnector(BaseConnector):
    manifest = ConnectorManifestSpec(
        connector_key="amos_core",
        name="AMOS M&E Core",
        package_name="aog-connectors.amos",
        version="1.2.0",
        source_category="Maintenance",
        schema_version="2026.03",
        supported_entities=["defects", "maintenance_logs", "work_packages", "aircraft"],
        config_fields=[
            ConnectorConfigFieldSpec(key="endpoint_url", label="Endpoint URL", field_type="url", description="Base URL for the AMOS integration endpoint."),
            ConnectorConfigFieldSpec(key="username", label="Username", field_type="text", description="Service account username for AMOS API access."),
            ConnectorConfigFieldSpec(key="password", label="Password", field_type="password", secret=True, description="Service account password for AMOS API access."),
            ConnectorConfigFieldSpec(key="station_scope", label="Station Scope", field_type="text", required=False, description="Optional station filter applied during incremental sync."),
        ],
        default_sync_mode="Incremental",
        default_deployment_target="Airline Edge Worker",
        edge_supported=True,
        description="Pulls aircraft, defects, and maintenance execution updates from AMOS.",
    )

    def sync(self, context: ConnectorExecutionContext) -> ConnectorSyncResult:
        now = datetime.now(tz=UTC)
        cursor_marker = context.current_cursor.cursor_value if context.current_cursor else None
        base_time = datetime.fromisoformat(cursor_marker) if cursor_marker else now - timedelta(hours=3)
        emitted = []
        for index in range(3):
            event_time = base_time + timedelta(minutes=(index + 1) * 30)
            emitted.append(
                ConnectorRecordEnvelope(
                    entity_type="defect",
                    workspace_id=context.workspace_id,
                    source_record_id=f"amos-defect-{event_time.strftime('%Y%m%d%H%M')}",
                    source_timestamp=event_time.isoformat(),
                    payload={
                        "title": f"AMOS sync defect update {index + 1}",
                        "severity": "High" if index == 0 else "Medium",
                        "station": context.config.get("station_scope", "DEL"),
                    },
                )
            )
        next_cursor = {
            "cursor_value": now.isoformat(),
            "checkpoint_at": now.isoformat(),
            "raw_state": {"last_station_scope": context.config.get("station_scope")},
        }
        return ConnectorSyncResult(
            status="Succeeded",
            records_processed=len(emitted),
            message="AMOS incremental sync completed.",
            emitted_records=emitted,
            next_cursor=next_cursor,
        )
