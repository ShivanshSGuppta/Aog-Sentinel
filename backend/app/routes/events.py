from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.schemas import OperationalEvent
from app.services.platform_service import list_events

router = APIRouter(prefix='/events', tags=['events'], dependencies=[Depends(get_current_user)])


@router.get('/feed', response_model=list[OperationalEvent])
def event_feed(request: Request, workspace_id: str | None = Query(default=None), db: Session = Depends(get_db)) -> list[OperationalEvent]:
    return list_events(db, request.state.current_user, workspace_id)
