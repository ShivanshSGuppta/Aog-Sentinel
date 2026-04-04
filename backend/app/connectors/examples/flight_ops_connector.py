from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.sdk.connector_sdk import (
    BaseConnector,
    ConnectorConfigFieldSpec,
    ConnectorExecutionContext,
    ConnectorManifestSpec,
    ConnectorRecordEnvelope,
    ConnectorSyncCursor,
    ConnectorSyncResult,
)


class FlightOpsConnector(BaseConnector):
    manifest = ConnectorManifestSpec(
        connector_key="flight_ops_stream",
        name="Flight Ops Stream",
        package_name="aog-connectors.flight-ops",
        version="1.0.8",
        source_category="Flight Operations",
        schema_version="2026.03",
        supported_entities=["flights", "stations", "disruptions"],
        config_fields=[
            ConnectorConfigFieldSpec(key="stream_endpoint", label="Stream Endpoint", field_type="url", description="Ops event stream or websocket endpoint."),
            ConnectorConfigFieldSpec(key="api_key", label="API Key", field_type="password", secret=True, description="Credential used to subscribe to flight operations events."),
            ConnectorConfigFieldSpec(key="callsign_prefix", label="Callsign Prefix", field_type="text", required=False, description="Optional callsign prefix for airline-owned traffic matching."),
        ],
        default_sync_mode="Streaming",
        default_deployment_target="Hosted Worker",
        edge_supported=False,
        description="Streams flight movement and disruption events into the network intelligence layer.",
    )

    def sync(self, context: ConnectorExecutionContext) -> ConnectorSyncResult:
        now = datetime.now(tz=UTC)
        prefix = context.config.get("callsign_prefix", "SBX")
        emitted = []
        for index, station in enumerate(["DEL", "BOM", "BLR"], start=1):
            event_time = now - timedelta(minutes=index * 8)
            emitted.append(
                ConnectorRecordEnvelope(
                    entity_type="disruption",
                    workspace_id=context.workspace_id,
                    source_record_id=f"flight-ops-{station.lower()}-{index}",
                    source_timestamp=event_time.isoformat(),
                    payload={
                        "title": f"{prefix}{200 + index} turnaround pressure at {station}",
                        "severity": "High" if index == 1 else "Medium",
                        "station": station,
                    },
                )
            )
        return ConnectorSyncResult(
            status="Succeeded",
            records_processed=len(emitted),
            message="Flight operations watchlist refreshed.",
            emitted_records=emitted,
            next_cursor=ConnectorSyncCursor(cursor_value=now.isoformat(), checkpoint_at=now.isoformat(), raw_state={"callsign_prefix": prefix}),
        )
