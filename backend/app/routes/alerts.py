from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.schemas import AlertCreateRequest, AlertItem, AlertSummary
from app.services.platform_service import create_alert, get_alert_summary, list_alerts

router = APIRouter(prefix='/alerts', tags=['alerts'], dependencies=[Depends(get_current_user)])


@router.get('', response_model=list[AlertItem])
def alerts(request: Request, workspace_id: str | None = Query(default=None), db: Session = Depends(get_db)) -> list[AlertItem]:
    return list_alerts(db, request.state.current_user, workspace_id)


@router.post('', response_model=AlertItem)
def alerts_create(payload: AlertCreateRequest, request: Request, db: Session = Depends(get_db)) -> AlertItem:
    return create_alert(db, request.state.current_user, payload)


@router.get('/summary', response_model=AlertSummary)
def alert_summary(request: Request, workspace_id: str | None = Query(default=None), db: Session = Depends(get_db)) -> AlertSummary:
    return get_alert_summary(db, request.state.current_user, workspace_id)
