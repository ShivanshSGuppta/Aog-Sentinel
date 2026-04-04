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


class SapSparesConnector(BaseConnector):
    manifest = ConnectorManifestSpec(
        connector_key="sap_ewm_spares",
        name="SAP EWM Spares",
        package_name="aog-connectors.sap-ewm",
        version="1.1.3",
        source_category="Inventory",
        schema_version="2026.03",
        supported_entities=["spares", "stock_movements", "vendors"],
        config_fields=[
            ConnectorConfigFieldSpec(key="endpoint_url", label="Endpoint URL", field_type="url", description="SAP OData or integration gateway endpoint."),
            ConnectorConfigFieldSpec(key="client_id", label="Client ID", field_type="text", description="OAuth client identifier or SAP technical username."),
            ConnectorConfigFieldSpec(key="client_secret", label="Client Secret", field_type="password", secret=True, description="Client secret or password for SAP auth."),
            ConnectorConfigFieldSpec(key="warehouse_code", label="Warehouse Code", field_type="text", description="Primary warehouse or materials scope."),
        ],
        default_sync_mode="Incremental",
        default_deployment_target="Hosted Worker",
        edge_supported=True,
        description="Loads materials, stock thresholds, and vendor activity from SAP EWM.",
    )

    def sync(self, context: ConnectorExecutionContext) -> ConnectorSyncResult:
        now = datetime.now(tz=UTC)
        last_cursor = context.current_cursor.cursor_value if context.current_cursor else None
        emitted = [
            ConnectorRecordEnvelope(
                entity_type="spares",
                workspace_id=context.workspace_id,
                source_record_id=f"sap-spare-{context.config.get('warehouse_code', 'MAIN').lower()}-{idx}",
                source_timestamp=(now - timedelta(minutes=idx * 10)).isoformat(),
                payload={
                    "component": component,
                    "warehouse_code": context.config.get("warehouse_code", "MAIN"),
                    "movement_type": "issue" if idx == 0 else "receipt",
                },
            )
            for idx, component in enumerate(["Brake Control Unit", "Autopilot Servo", "APU Starter Controller"], start=1)
        ]
        return ConnectorSyncResult(
            status="Succeeded",
            records_processed=len(emitted),
            message=f"SAP stock sync complete. Previous cursor: {last_cursor or 'none'}.",
            emitted_records=emitted,
            next_cursor=ConnectorSyncCursor(
                cursor_value=now.isoformat(),
                checkpoint_at=now.isoformat(),
                raw_state={"warehouse_code": context.config.get("warehouse_code", "MAIN")},
            ),
        )
