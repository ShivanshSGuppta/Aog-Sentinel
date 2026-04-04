from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.schemas import AuthUser, LoginRequest, LogoutRequest, RefreshRequest, SessionInfo
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=SessionInfo)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)) -> SessionInfo:
    service = AuthService(db)
    return service.authenticate_user(payload.email, payload.password, user_agent=request.headers.get("user-agent"), issued_ip=request.client.host if request.client else None)


@router.post("/refresh", response_model=SessionInfo)
def refresh(payload: RefreshRequest, request: Request, db: Session = Depends(get_db)) -> SessionInfo:
    service = AuthService(db)
    return service.refresh_session(payload.refresh_token, user_agent=request.headers.get("user-agent"), issued_ip=request.client.host if request.client else None)


@router.post("/logout", status_code=204)
def logout(payload: LogoutRequest, db: Session = Depends(get_db)) -> None:
    AuthService(db).logout(payload.refresh_token)


@router.get("/me", response_model=AuthUser, dependencies=[Depends(get_current_user)])
def me(request: Request, db: Session = Depends(get_db)) -> AuthUser:
    user = request.state.current_user
    return AuthService(db).get_auth_user(user)
