from __future__ import annotations

import logging
import time
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.connectors.examples import __all__ as _registered_connectors  # noqa: F401
from app.db.models import ConnectorConfig, ConnectorCursor, ConnectorInstall, ConnectorRun, OperationalEvent
from app.db.session import SessionLocal
from app.logging_config import configure_logging
from app.sdk.connector_sdk import ConnectorExecutionContext, ConnectorSyncCursor, registry, stable_id


configure_logging("connector-worker")
logger = logging.getLogger(__name__)


def execute_connector_run(db: Session, install: ConnectorInstall, run: ConnectorRun, *, force_full_sync: bool = False) -> ConnectorRun:
    config = db.scalar(select(ConnectorConfig).where(ConnectorConfig.install_id == install.install_id))
    cursor_row = db.scalar(select(ConnectorCursor).where(ConnectorCursor.install_id == install.install_id))
    connector_cls = registry.get(install.connector_key)
    connector = connector_cls()
    run.status = "Running"
    run.started_at = run.started_at or datetime.now(tz=UTC)
    db.commit()
    logger.info(
        "connector_run_started",
        extra={
            "event": "connector_run_started",
            "connector_id": install.connector_id,
            "install_id": install.install_id,
            "run_id": run.run_id,
            "force_full_sync": force_full_sync,
        },
    )

    try:
        result = connector.sync(
            ConnectorExecutionContext(
                db=db,
                workspace_id=install.workspace_id,
                connector_id=install.connector_id,
                install_id=install.install_id,
                config=(config.config if config else {}),
                current_cursor=(
                    ConnectorSyncCursor(
                        cursor_value=cursor_row.cursor_value,
                        checkpoint_at=cursor_row.checkpoint_at.isoformat() if cursor_row and cursor_row.checkpoint_at else None,
                        raw_state=cursor_row.raw_state if cursor_row else {},
                    )
                    if cursor_row
                    else None
                ),
                force_full_sync=force_full_sync,
            )
        )
        run.status = result.status
        run.ended_at = datetime.now(tz=UTC)
        run.records_processed = result.records_processed
        run.message = result.message

        if result.next_cursor:
            if cursor_row is None:
                cursor_row = ConnectorCursor(cursor_id=f"cur_{install.connector_id}", install_id=install.install_id)
                db.add(cursor_row)
            cursor_row.cursor_value = result.next_cursor.cursor_value
            cursor_row.checkpoint_at = datetime.fromisoformat(result.next_cursor.checkpoint_at) if result.next_cursor.checkpoint_at else datetime.now(tz=UTC)
            cursor_row.raw_state = result.next_cursor.raw_state

        for record in result.emitted_records:
            event_title = str(record.payload.get("title") or f"{install.name} {record.entity_type} sync")
            db.merge(
                OperationalEvent(
                    event_id=stable_id("evt", install.connector_id, record.source_record_id),
                    workspace_id=install.workspace_id,
                    event_type=record.entity_type,
                    severity=str(record.payload.get("severity") or "Medium"),
                    title=event_title,
                    created_at=datetime.fromisoformat(record.source_timestamp.replace("Z", "+00:00")),
                    source_connector_id=install.connector_id,
                    status="Open",
                    payload=record.payload,
                )
            )

        install.status = "Healthy" if result.status == "Succeeded" else "Warning"
        install.health_score = 95 if result.status == "Succeeded" else 72
        install.last_sync = datetime.now(tz=UTC)
        install.next_sync = install.last_sync + timedelta(minutes=15)
        db.commit()
        logger.info(
            "connector_run_completed",
            extra={
                "event": "connector_run_completed",
                "connector_id": install.connector_id,
                "install_id": install.install_id,
                "run_id": run.run_id,
                "status": result.status,
                "records_processed": result.records_processed,
            },
        )
    except Exception as exc:
        run.status = "Failed"
        run.ended_at = datetime.now(tz=UTC)
        run.message = str(exc)
        install.status = "Error"
        install.health_score = max(0, install.health_score - 18)
        install.next_sync = datetime.now(tz=UTC) + timedelta(minutes=10)
        db.commit()
        logger.exception(
            "connector_run_failed",
            extra={
                "event": "connector_run_failed",
                "connector_id": install.connector_id,
                "install_id": install.install_id,
                "run_id": run.run_id,
            },
        )
        raise

    return run


def process_pending_runs() -> int:
    processed = 0
    with SessionLocal() as db:
        pending_runs = list(
            db.scalars(
                select(ConnectorRun)
                .where(ConnectorRun.status.in_(("Queued", "Retry")))
                .order_by(ConnectorRun.started_at.asc().nullsfirst())
            )
        )
        if pending_runs:
            logger.info(
                "connector_poll_found_pending_runs",
                extra={"event": "connector_poll_found_pending_runs", "pending_count": len(pending_runs)},
            )
        for run in pending_runs:
            install = db.scalar(select(ConnectorInstall).where(ConnectorInstall.install_id == run.install_id))
            if install is None:
                logger.warning(
                    "connector_install_missing_for_run",
                    extra={"event": "connector_install_missing_for_run", "run_id": run.run_id, "install_id": run.install_id},
                )
                continue
            try:
                execute_connector_run(db, install, run)
                processed += 1
            except Exception:
                continue
    return processed


def run_worker_forever(poll_seconds: int | None = None) -> None:
    interval = poll_seconds or settings.connector_worker_poll_seconds
    logger.info(
        "connector_worker_started",
        extra={"event": "connector_worker_started", "poll_seconds": interval, "app_env": settings.app_env},
    )
    while True:
        try:
            processed = process_pending_runs()
            logger.info("connector_poll_complete", extra={"event": "connector_poll_complete", "processed": processed})
        except Exception:
            logger.exception("connector_poll_failed", extra={"event": "connector_poll_failed"})
        time.sleep(max(1, interval))


if __name__ == "__main__":
    run_worker_forever()
