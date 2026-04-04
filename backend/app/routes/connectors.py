from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.schemas import (
    ConnectorCatalogItem,
    ConnectorConfigUpdateRequest,
    ConnectorCursorState,
    ConnectorHealthSummary,
    ConnectorInstallRequest,
    ConnectorManifest,
    ConnectorRunSummary,
    ConnectorSummary,
    ConnectorSyncRequest,
    ConnectorValidationRequest,
    ConnectorValidationResult,
    SyncHistoryItem,
)
from app.services.platform_service import (
    get_connector_cursor,
    get_connector_health_summary,
    get_connector_manifest,
    get_connector_sync_history,
    install_connector,
    list_connector_catalog,
    list_connector_installs,
    list_connector_runs,
    list_connectors,
    sync_connector_install,
    update_connector_config,
    validate_connector_config,
)

router = APIRouter(prefix='/connectors', tags=['connectors'], dependencies=[Depends(get_current_user)])


@router.get('/catalog', response_model=list[ConnectorCatalogItem])
def connector_catalog(request: Request, db: Session = Depends(get_db)) -> list[ConnectorCatalogItem]:
    return list_connector_catalog(db, request.state.current_user)


@router.post('/install', response_model=ConnectorSummary)
def connector_install(payload: ConnectorInstallRequest, request: Request, db: Session = Depends(get_db)) -> ConnectorSummary:
    return install_connector(db, request.state.current_user, payload)


@router.get('/installs', response_model=list[ConnectorSummary])
def connector_installs(request: Request, workspace_id: str | None = Query(default=None), db: Session = Depends(get_db)) -> list[ConnectorSummary]:
    return list_connector_installs(db, request.state.current_user, workspace_id)


@router.get('', response_model=list[ConnectorSummary])
def connectors(request: Request, workspace_id: str | None = Query(default=None), db: Session = Depends(get_db)) -> list[ConnectorSummary]:
    return list_connectors(db, request.state.current_user, workspace_id)


@router.get('/health', response_model=ConnectorHealthSummary)
def connector_health(request: Request, workspace_id: str | None = Query(default=None), db: Session = Depends(get_db)) -> ConnectorHealthSummary:
    return get_connector_health_summary(db, request.state.current_user, workspace_id)


@router.get('/{connector_id}/schema', response_model=ConnectorManifest)
def connector_schema(connector_id: str, request: Request, db: Session = Depends(get_db)) -> ConnectorManifest:
    return get_connector_manifest(db, request.state.current_user, connector_id)


@router.get('/{connector_id}/sync-history', response_model=list[SyncHistoryItem])
def connector_sync_history(connector_id: str, request: Request, db: Session = Depends(get_db)) -> list[SyncHistoryItem]:
    return get_connector_sync_history(db, request.state.current_user, connector_id)


@router.put('/{connector_id}/config', response_model=ConnectorValidationResult)
def connector_config_update(connector_id: str, payload: ConnectorConfigUpdateRequest, request: Request, db: Session = Depends(get_db)) -> ConnectorValidationResult:
    return update_connector_config(db, request.state.current_user, connector_id, payload)


@router.post('/{connector_id}/validate-config', response_model=ConnectorValidationResult)
def connector_validate(connector_id: str, request_payload: ConnectorValidationRequest, request: Request, db: Session = Depends(get_db)) -> ConnectorValidationResult:
    return validate_connector_config(db, request.state.current_user, connector_id, request_payload.config)


@router.post('/{connector_id}/sync', response_model=ConnectorRunSummary)
def connector_sync(connector_id: str, payload: ConnectorSyncRequest, request: Request, db: Session = Depends(get_db)) -> ConnectorRunSummary:
    return sync_connector_install(db, request.state.current_user, connector_id, payload)


@router.get('/{connector_id}/runs', response_model=list[ConnectorRunSummary])
def connector_runs(connector_id: str, request: Request, db: Session = Depends(get_db)) -> list[ConnectorRunSummary]:
    return list_connector_runs(db, request.state.current_user, connector_id)


@router.get('/{connector_id}/cursor', response_model=ConnectorCursorState)
def connector_cursor(connector_id: str, request: Request, db: Session = Depends(get_db)) -> ConnectorCursorState:
    return get_connector_cursor(db, request.state.current_user, connector_id)
