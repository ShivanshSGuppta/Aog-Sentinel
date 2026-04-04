from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import Permission, RolePermission, SessionToken, User, Workspace, WorkspaceMembership
from app.schemas import AuthUser, SessionInfo, WorkspaceMembershipItem

password_hasher = PasswordHasher()


class TokenError(Exception):
    pass


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def authenticate_user(self, email: str, password: str, user_agent: str | None = None, issued_ip: str | None = None) -> SessionInfo:
        user = self.db.scalar(select(User).where(User.email == email.lower().strip()))
        if user is None or not user.is_active or not verify_password(password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
        return self._issue_session(user, user_agent=user_agent, issued_ip=issued_ip)

    def refresh_session(self, refresh_token: str, user_agent: str | None = None, issued_ip: str | None = None) -> SessionInfo:
        payload = decode_token(refresh_token, expected_type="refresh")
        session_id = str(payload.get("sid") or "")
        session = self.db.get(SessionToken, session_id)
        if session is None or session.revoked_at is not None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token is invalid")
        if _as_utc(session.expires_at) < datetime.now(tz=UTC):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token has expired")
        if session.refresh_token_hash != hash_secret(refresh_token):
            session.revoked_at = datetime.now(tz=UTC)
            self.db.commit()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token has been rotated")
        user = self.db.get(User, session.user_id)
        if user is None or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User session is no longer active")
        self.db.delete(session)
        self.db.commit()
        return self._issue_session(user, user_agent=user_agent, issued_ip=issued_ip)

    def logout(self, refresh_token: str) -> None:
        payload = decode_token(refresh_token, expected_type="refresh")
        session_id = str(payload.get("sid") or "")
        session = self.db.get(SessionToken, session_id)
        if session is None:
            return
        session.revoked_at = datetime.now(tz=UTC)
        self.db.commit()

    def get_auth_user(self, user: User) -> AuthUser:
        memberships = self.db.execute(
            select(WorkspaceMembership, Workspace).join(Workspace, Workspace.workspace_id == WorkspaceMembership.workspace_id).where(WorkspaceMembership.user_id == user.user_id)
        ).all()
        membership_items = [
            WorkspaceMembershipItem(
                membership_id=membership.membership_id,
                workspace_id=workspace.workspace_id,
                airline_name=workspace.airline_name,
                airline_code=workspace.airline_code,
                role_key=membership.role_key,
            )
            for membership, workspace in memberships
        ]
        permissions = sorted(self.get_permissions_for_user(user.user_id))
        return AuthUser(
            user_id=user.user_id,
            email=user.email,
            full_name=user.full_name,
            platform_role=user.platform_role,
            location=user.location,
            memberships=membership_items,
            permissions=permissions,
        )

    def get_permissions_for_user(self, user_id: str, workspace_id: str | None = None) -> set[str]:
        user = self.db.get(User, user_id)
        if user is None:
            return set()
        if user.platform_role == "platform_admin":
            return {item.permission_code for item in self.db.scalars(select(Permission)).all()}

        role_keys: set[str] = set()
        query = select(WorkspaceMembership.role_key).where(WorkspaceMembership.user_id == user_id)
        if workspace_id:
            query = query.where(WorkspaceMembership.workspace_id == workspace_id)
        role_keys.update(self.db.scalars(query).all())
        if not role_keys and user.platform_role and user.platform_role in {"viewer", "airline_admin", "reliability_engineer", "maintenance_control", "logistics_controller"}:
            role_keys.add(user.platform_role)
        permissions = set()
        for role_key in role_keys:
            permissions.update(
                self.db.scalars(select(RolePermission.permission_code).where(RolePermission.role_key == role_key)).all()
            )
        return permissions

    def ensure_workspace_access(self, user: User, workspace_id: str | None) -> str:
        membership_workspace_id = workspace_id
        if membership_workspace_id is None:
            membership_workspace_id = self.db.scalar(
                select(WorkspaceMembership.workspace_id).where(WorkspaceMembership.user_id == user.user_id).limit(1)
            )
        if membership_workspace_id is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No workspace membership available")
        if user.platform_role == "platform_admin":
            return membership_workspace_id
        membership = self.db.scalar(
            select(WorkspaceMembership).where(
                WorkspaceMembership.user_id == user.user_id,
                WorkspaceMembership.workspace_id == membership_workspace_id,
            )
        )
        if membership is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Workspace access denied")
        return membership_workspace_id

    def ensure_permission(self, user: User, permission_code: str, workspace_id: str | None = None) -> None:
        permissions = self.get_permissions_for_user(user.user_id, workspace_id)
        if permission_code not in permissions:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Missing permission: {permission_code}")

    def _issue_session(self, user: User, user_agent: str | None = None, issued_ip: str | None = None) -> SessionInfo:
        now = datetime.now(tz=UTC)
        access_expires = now + timedelta(minutes=settings.access_token_minutes)
        refresh_expires = now + timedelta(days=settings.refresh_token_days)
        session_id = f"sess_{secrets.token_urlsafe(18)}"
        access_token = encode_token(
            {
                "sub": user.user_id,
                "email": user.email,
                "platform_role": user.platform_role,
                "type": "access",
                "iat": int(now.timestamp()),
                "exp": int(access_expires.timestamp()),
            }
        )
        refresh_token = encode_token(
            {
                "sub": user.user_id,
                "sid": session_id,
                "type": "refresh",
                "iat": int(now.timestamp()),
                "exp": int(refresh_expires.timestamp()),
            }
        )
        self.db.add(
            SessionToken(
                session_id=session_id,
                user_id=user.user_id,
                refresh_token_hash=hash_secret(refresh_token),
                expires_at=refresh_expires,
                revoked_at=None,
                user_agent=user_agent,
                issued_ip=issued_ip,
            )
        )
        self.db.commit()
        self.db.refresh(user)
        return SessionInfo(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_at=access_expires.isoformat(),
            refresh_expires_at=refresh_expires.isoformat(),
            user=self.get_auth_user(user),
        )


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except Exception:
        return False


def encode_token(payload: dict[str, Any]) -> str:
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token is invalid or expired") from exc
    if payload.get("type") != expected_type:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token type is invalid")
    return payload


def resolve_user_from_access_token(db: Session, access_token: str) -> User:
    payload = decode_token(access_token, expected_type="access")
    user = db.get(User, str(payload.get("sub") or ""))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is not active")
    return user
