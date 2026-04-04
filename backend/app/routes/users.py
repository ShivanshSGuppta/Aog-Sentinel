from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.dependencies.auth import get_current_user
from app.db.session import get_db
from app.schemas import WorkspaceSummary
from app.services.platform_service import list_user_workspaces

router = APIRouter(prefix="/users", tags=["users"], dependencies=[Depends(get_current_user)])


@router.get("/me/workspaces", response_model=list[WorkspaceSummary])
def my_workspaces(request: Request, db: Session = Depends(get_db)) -> list[WorkspaceSummary]:
    return list_user_workspaces(db, request.state.current_user)
