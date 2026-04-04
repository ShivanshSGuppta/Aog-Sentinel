from __future__ import annotations

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db.models import User
from app.db.session import get_db
from app.services.auth_service import AuthService, resolve_user_from_access_token


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authorization header is required")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token is required")
    return token


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> User:
    token = _extract_bearer_token(authorization)
    user = resolve_user_from_access_token(db, token)
    request.state.current_user = user
    return user


def get_auth_service(db: Session = Depends(get_db)) -> AuthService:
    return AuthService(db)
