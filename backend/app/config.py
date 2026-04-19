from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
ENV_FILE = BACKEND_DIR / ".env"
DEFAULT_ALLOWED_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
DEFAULT_JWT_SECRET_KEY = "change-me-aog-sentinel-secret-key-2026"
DEFAULT_BOOTSTRAP_PASSWORD = "Sentinel123!"

load_dotenv(ENV_FILE)


def _parse_allowed_origins(raw_value: str) -> tuple[str, ...]:
    origins = [item.strip() for item in raw_value.split(",") if item.strip()]
    return tuple(origins) if origins else ("http://localhost:3000", "http://127.0.0.1:3000")


def _parse_bool(raw_value: str | None, default: bool = False) -> bool:
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def _env_or_default(key: str, default: str) -> str:
    value = os.getenv(key)
    if value is None or not value.strip():
        return default
    return value


def _env_optional(key: str) -> str | None:
    value = os.getenv(key)
    if value is None or not value.strip():
        return None
    return value


@dataclass(frozen=True)
class Settings:
    app_name: str = "AOG Sentinel API"
    app_description: str = (
        "Airline engineering analytics API for fleet reliability, AOG triage, "
        "spares planning, and technical document retrieval."
    )
    app_env: str = _env_or_default("AOG_ENV", "development").strip().lower()
    data_dir: Path = Path(_env_or_default("AOG_DATA_DIR", DATA_DIR.as_posix()))
    database_url: str = os.getenv("AOG_DATABASE_URL", f"sqlite:///{(DATA_DIR / 'aog_sentinel.db').as_posix()}")
    sql_echo: bool = _parse_bool(os.getenv("AOG_SQL_ECHO"), False)
    allowed_origins: tuple[str, ...] = _parse_allowed_origins(
        os.getenv("AOG_ALLOWED_ORIGINS", DEFAULT_ALLOWED_ORIGINS)
    )
    allowed_origin_regex: str | None = _env_optional("AOG_ALLOWED_ORIGIN_REGEX")
    doc_model_name: str = os.getenv("AOG_DOC_MODEL", "all-MiniLM-L6-v2")
    docs_force_fallback: bool = os.getenv("AOG_DOCS_FORCE_FALLBACK", "false").lower() == "true"
    opensky_username: str | None = os.getenv("OPENSKY_USERNAME") or None
    opensky_password: str | None = os.getenv("OPENSKY_PASSWORD") or None
    flights_cache_ttl_seconds: int = int(os.getenv("FLIGHTS_CACHE_TTL_SECONDS", "20"))
    flights_default_limit: int = int(os.getenv("FLIGHTS_DEFAULT_LIMIT", "250"))
    weather_cache_ttl_seconds: int = int(os.getenv("WEATHER_CACHE_TTL_SECONDS", "900"))
    connector_worker_poll_seconds: int = int(os.getenv("AOG_CONNECTOR_WORKER_POLL_SECONDS", "10"))
    connector_sync_inline: bool = _parse_bool(os.getenv("AOG_CONNECTOR_SYNC_INLINE"), True)
    auth_login_window_seconds: int = int(os.getenv("AOG_AUTH_LOGIN_WINDOW_SECONDS", "300"))
    auth_login_max_attempts: int = int(os.getenv("AOG_AUTH_LOGIN_MAX_ATTEMPTS", "8"))
    auth_login_block_seconds: int = int(os.getenv("AOG_AUTH_LOGIN_BLOCK_SECONDS", "600"))
    jwt_secret_key: str = os.getenv("AOG_JWT_SECRET_KEY", DEFAULT_JWT_SECRET_KEY)
    jwt_algorithm: str = os.getenv("AOG_JWT_ALGORITHM", "HS256")
    access_token_minutes: int = int(os.getenv("AOG_ACCESS_TOKEN_MINUTES", "20"))
    refresh_token_days: int = int(os.getenv("AOG_REFRESH_TOKEN_DAYS", "14"))
    enable_api_docs: bool = _parse_bool(os.getenv("AOG_ENABLE_API_DOCS"), False)
    bootstrap_platform_data: bool = _parse_bool(os.getenv("AOG_BOOTSTRAP_PLATFORM_DATA"), True)
    bootstrap_default_password: str = os.getenv("AOG_BOOTSTRAP_DEFAULT_PASSWORD", DEFAULT_BOOTSTRAP_PASSWORD)
    bootstrap_admin_email: str = os.getenv("AOG_BOOTSTRAP_ADMIN_EMAIL", "platform.admin@aogsentinel.local")
    bootstrap_admin_name: str = os.getenv("AOG_BOOTSTRAP_ADMIN_NAME", "Platform Administrator")

    def __post_init__(self) -> None:
        if self.app_env != "production":
            return

        errors: list[str] = []
        if not self.jwt_secret_key.strip() or self.jwt_secret_key == DEFAULT_JWT_SECRET_KEY:
            errors.append("AOG_JWT_SECRET_KEY must be set to a non-default value in production.")
        if self.bootstrap_platform_data and (
            not self.bootstrap_default_password.strip() or self.bootstrap_default_password == DEFAULT_BOOTSTRAP_PASSWORD
        ):
            errors.append(
                "AOG_BOOTSTRAP_DEFAULT_PASSWORD must be set to a non-default value in production when bootstrap is enabled."
            )
        if errors:
            raise RuntimeError("Invalid production configuration:\n- " + "\n- ".join(errors))


settings = Settings()
