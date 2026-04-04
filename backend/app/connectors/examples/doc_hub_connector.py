from __future__ import annotations

from datetime import UTC, datetime

from app.sdk.connector_sdk import (
    BaseConnector,
    ConnectorConfigFieldSpec,
    ConnectorExecutionContext,
    ConnectorManifestSpec,
    ConnectorRecordEnvelope,
    ConnectorSyncCursor,
    ConnectorSyncResult,
)


class DocumentHubConnector(BaseConnector):
    manifest = ConnectorManifestSpec(
        connector_key="document_hub",
        name="Engineering Document Hub",
        package_name="aog-connectors.doc-hub",
        version="0.9.1",
        source_category="Documents",
        schema_version="2026.03",
        supported_entities=["documents", "manual_chunks"],
        config_fields=[
            ConnectorConfigFieldSpec(key="repository_url", label="Repository URL", field_type="url", description="Document repository base URL or sync endpoint."),
            ConnectorConfigFieldSpec(key="access_token", label="Access Token", field_type="password", secret=True, description="Repository access token used for incremental sync."),
        ],
        default_sync_mode="Scheduled",
        default_deployment_target="Hosted Worker",
        edge_supported=False,
        description="Synchronizes maintenance manuals, vendor bulletins, and indexed chunks.",
    )

    def sync(self, context: ConnectorExecutionContext) -> ConnectorSyncResult:
        now = datetime.now(tz=UTC)
        emitted = [
            ConnectorRecordEnvelope(
                entity_type="documents",
                workspace_id=context.workspace_id,
                source_record_id="docs-index-refresh",
                source_timestamp=now.isoformat(),
                payload={"title": "Document index refresh", "status": "completed"},
            )
        ]
        return ConnectorSyncResult(
            status="Succeeded",
            records_processed=1,
            message="Document metadata sync completed.",
            emitted_records=emitted,
            next_cursor=ConnectorSyncCursor(cursor_value=now.isoformat(), checkpoint_at=now.isoformat(), raw_state={}),
        )
