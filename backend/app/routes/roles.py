from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.dependencies.auth import get_current_user
from app.db.session import get_db
from app.schemas import RoleItem
from app.services.platform_service import list_roles

router = APIRouter(tags=["roles"], dependencies=[Depends(get_current_user)])


@router.get("/roles", response_model=list[RoleItem])
def roles(request: Request, db: Session = Depends(get_db)) -> list[RoleItem]:
    return list_roles(db, request.state.current_user)
