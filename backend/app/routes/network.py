from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.schemas import NetworkWorkspaceResponse
from app.services.platform_service import get_network_workspace

router = APIRouter(prefix='/network', tags=['network'], dependencies=[Depends(get_current_user)])


@router.get('/workspace', response_model=NetworkWorkspaceResponse)
def network_workspace(
    request: Request,
    workspace_id: str | None = Query(default=None),
    region: str = Query(default='global'),
    limit: int | None = Query(default=250, ge=1, le=1000),
    min_altitude: float | None = Query(default=None, ge=0),
    max_altitude: float | None = Query(default=None, ge=0),
    query: str | None = Query(default=None),
    airline: str | None = Query(default=None),
    category: str | None = Query(default=None),
    include_layers: str | None = Query(default=None),
    on_ground: bool | None = Query(default=None),
    refresh: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> NetworkWorkspaceResponse:
    return get_network_workspace(
        db,
        request.state.current_user,
        workspace_id,
        region=region,
        limit=limit,
        min_altitude=min_altitude,
        max_altitude=max_altitude,
        query=query,
        airline=airline,
        category=category,
        include_layers=include_layers,
        on_ground=on_ground,
        refresh=refresh,
    )
