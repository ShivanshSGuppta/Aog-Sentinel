from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.schemas import EnvironmentStatus, WorkspaceDetail, WorkspaceSummary
from app.services.platform_service import get_environment_status, get_workspace_detail, list_workspaces

router = APIRouter(tags=["workspaces"], dependencies=[Depends(get_current_user)])


@router.get('/workspaces', response_model=list[WorkspaceSummary])
def workspaces(request: Request, db: Session = Depends(get_db)) -> list[WorkspaceSummary]:
    return list_workspaces(db, request.state.current_user)


@router.get('/workspaces/current', response_model=WorkspaceDetail)
def current_workspace(request: Request, workspace_id: str | None = Query(default=None), db: Session = Depends(get_db)) -> WorkspaceDetail:
    return get_workspace_detail(db, request.state.current_user, workspace_id)


@router.get('/workspaces/{workspace_id}', response_model=WorkspaceDetail)
def workspace_detail(request: Request, workspace_id: str, db: Session = Depends(get_db)) -> WorkspaceDetail:
    return get_workspace_detail(db, request.state.current_user, workspace_id)


@router.get('/platform/environment', response_model=EnvironmentStatus, tags=['platform'])
def environment_status(db: Session = Depends(get_db)) -> EnvironmentStatus:
    return get_environment_status(db)
