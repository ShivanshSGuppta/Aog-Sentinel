from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.schemas import AuthUser, LoginRequest, LogoutRequest, RefreshRequest, SessionInfo
from app.services.auth_guard import build_login_key, login_rate_limiter, redact_email
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


@router.post("/login", response_model=SessionInfo)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)) -> SessionInfo:
    issued_ip = request.client.host if request.client else None
    login_key = build_login_key(payload.email, issued_ip)
    retry_after = login_rate_limiter.check(login_key)
    if retry_after is not None:
        logger.warning(
            "auth_login_rate_limited",
            extra={"event": "auth_login_rate_limited", "ip": issued_ip or "unknown", "email": redact_email(payload.email), "retry_after_seconds": retry_after},
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please retry later.",
            headers={"Retry-After": str(retry_after)},
        )

    service = AuthService(db)
    try:
        session = service.authenticate_user(
            payload.email,
            payload.password,
            user_agent=request.headers.get("user-agent"),
            issued_ip=issued_ip,
        )
    except HTTPException:
        blocked_seconds = login_rate_limiter.register_failure(login_key)
        logger.warning(
            "auth_login_failed",
            extra={"event": "auth_login_failed", "ip": issued_ip or "unknown", "email": redact_email(payload.email), "blocked_seconds": blocked_seconds},
        )
        raise

    login_rate_limiter.register_success(login_key)
    logger.info(
        "auth_login_succeeded",
        extra={"event": "auth_login_succeeded", "ip": issued_ip or "unknown", "email": redact_email(payload.email)},
    )
    return session


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
