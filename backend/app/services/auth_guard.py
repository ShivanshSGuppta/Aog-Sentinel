from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from threading import Lock

from app.config import settings


@dataclass
class LoginAttemptState:
    attempts: deque[datetime] = field(default_factory=deque)
    blocked_until: datetime | None = None


class LoginRateLimiter:
    def __init__(self, window_seconds: int, max_attempts: int, block_seconds: int) -> None:
        self.window_seconds = max(1, window_seconds)
        self.max_attempts = max(1, max_attempts)
        self.block_seconds = max(1, block_seconds)
        self._lock = Lock()
        self._states: dict[str, LoginAttemptState] = {}

    def _prune_attempts(self, state: LoginAttemptState, now: datetime) -> None:
        window_start = now - timedelta(seconds=self.window_seconds)
        while state.attempts and state.attempts[0] < window_start:
            state.attempts.popleft()

    def check(self, key: str) -> int | None:
        now = datetime.now(tz=UTC)
        with self._lock:
            state = self._states.get(key)
            if state is None:
                return None
            self._prune_attempts(state, now)
            if state.blocked_until and state.blocked_until > now:
                return max(1, int((state.blocked_until - now).total_seconds()))
            if state.blocked_until and state.blocked_until <= now:
                state.blocked_until = None
            if not state.attempts and state.blocked_until is None:
                self._states.pop(key, None)
            return None

    def register_failure(self, key: str) -> int:
        now = datetime.now(tz=UTC)
        with self._lock:
            state = self._states.setdefault(key, LoginAttemptState())
            self._prune_attempts(state, now)
            state.attempts.append(now)
            if len(state.attempts) >= self.max_attempts:
                state.blocked_until = now + timedelta(seconds=self.block_seconds)
                return self.block_seconds
            return 0

    def register_success(self, key: str) -> None:
        with self._lock:
            self._states.pop(key, None)


login_rate_limiter = LoginRateLimiter(
    window_seconds=settings.auth_login_window_seconds,
    max_attempts=settings.auth_login_max_attempts,
    block_seconds=settings.auth_login_block_seconds,
)


def build_login_key(email: str, issued_ip: str | None) -> str:
    normalized_email = email.strip().lower()
    ip_value = issued_ip or "unknown"
    return f"{normalized_email}|{ip_value}"


def redact_email(email: str) -> str:
    normalized = email.strip().lower()
    local, sep, domain = normalized.partition("@")
    if not sep:
        return "masked"
    prefix = local[:2] if local else "**"
    return f"{prefix}***@{domain}"
