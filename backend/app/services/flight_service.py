from __future__ import annotations

import base64
import json
import re
import ssl
import threading
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import certifi

from app.config import settings
from app.schemas import FlightAirlineFacet, FlightCategoryFacet, FlightFeedStatus, FlightLiveResponse, FlightOverview, FlightPosition


PROVIDER_NAME = "OpenSky Network"
OPENSKY_URL = "https://opensky-network.org/api/states/all"
AIRLINE_REFERENCE = Path(settings.data_dir) / "reference" / "airline_operator_reference.json"
REGION_BBOXES: dict[str, tuple[float, float, float, float] | None] = {
    "global": None,
    "north-america": (7.0, -168.0, 72.0, -52.0),
    "south-america": (-57.0, -82.0, 13.0, -34.0),
    "europe": (34.0, -26.0, 72.0, 45.0),
    "africa": (-35.0, -19.0, 38.0, 55.0),
    "middle-east": (12.0, 28.0, 42.0, 65.0),
    "south-asia": (5.0, 60.0, 37.0, 98.0),
    "east-asia": (18.0, 98.0, 52.0, 150.0),
    "southeast-asia": (-12.0, 92.0, 24.0, 141.0),
    "oceania": (-49.0, 110.0, 2.0, 180.0),
}

CATEGORY_ORDER = [
    "Commercial",
    "Cargo",
    "Private/Business",
    "Military/Government",
    "Unknown",
]
PRIVATE_CALLSIGN_PATTERN = re.compile(r"^(N\d+[A-Z0-9]{0,4}|[A-Z]{1,2}-[A-Z0-9]{3,5})$")
MILITARY_PREFIXES = {
    "RCH",
    "ASY",
    "CNV",
    "RRR",
    "LAGR",
    "IAM",
    "NAVY",
    "ARMY",
    "RAF",
    "CFC",
}


@dataclass
class CacheEntry:
    fetched_at: float
    items: list[FlightPosition]


@dataclass
class FeedSnapshot:
    items: list[FlightPosition]
    status: FlightFeedStatus


@lru_cache(maxsize=1)
def load_airline_reference() -> dict[str, dict[str, str]]:
    if not AIRLINE_REFERENCE.exists():
        return {}
    payload = json.loads(AIRLINE_REFERENCE.read_text())
    if isinstance(payload, dict):
        return {str(key).upper(): dict(value) for key, value in payload.items() if isinstance(value, dict)}
    return {}


class FlightService:
    def __init__(
        self,
        ttl_seconds: int,
        default_limit: int,
        username: str | None = None,
        password: str | None = None,
        fetcher: Any | None = None,
        clock: Any | None = None,
    ) -> None:
        self.ttl_seconds = ttl_seconds
        self.default_limit = default_limit
        self.username = username
        self.password = password
        self.fetcher = fetcher or self._fetch_provider_data
        self.clock = clock or time.time
        self._cache: dict[str, CacheEntry] = {}
        self._lock = threading.Lock()

    def get_overview(self, region: str = "global", refresh: bool = False) -> FlightOverview:
        resolved_region = self._resolve_region(region)
        snapshot = self._get_feed_snapshot(resolved_region, refresh=refresh)
        return self.summarize_items(snapshot.items, snapshot.status)

    def summarize_items(self, items: list[FlightPosition], status: FlightFeedStatus) -> FlightOverview:
        airborne_count = sum(not item.on_ground for item in items)
        on_ground_count = sum(item.on_ground for item in items)
        countries_covered = len({item.origin_country for item in items})
        return FlightOverview(
            airborne_count=airborne_count,
            on_ground_count=on_ground_count,
            countries_covered=countries_covered,
            displayed_flights=len(items),
            last_refresh=status.last_refresh,
            status=status,
        )

    def get_live_flights(
        self,
        limit: int | None = None,
        region: str = "global",
        min_altitude: float | None = None,
        max_altitude: float | None = None,
        query: str | None = None,
        airline: str | None = None,
        category: str | None = None,
        on_ground: bool | None = None,
        refresh: bool = False,
    ) -> FlightLiveResponse:
        resolved_region = self._resolve_region(region)
        snapshot = self._get_feed_snapshot(resolved_region, refresh=refresh)
        filtered = self._filter_items(
            snapshot.items,
            region=resolved_region,
            min_altitude=min_altitude,
            max_altitude=max_altitude,
            query=query,
            airline=airline,
            category=category,
            on_ground=on_ground,
        )
        applied_limit = limit or self.default_limit
        limited = filtered[:applied_limit]
        return FlightLiveResponse(
            items=limited,
            status=snapshot.status,
            total_results=len(filtered),
            applied_limit=applied_limit,
        )

    def get_airline_facets(self, items: list[FlightPosition], limit: int = 24) -> list[FlightAirlineFacet]:
        counts: dict[str, int] = {}
        for item in items:
            name = item.airline_company or "Unknown"
            counts[name] = counts.get(name, 0) + 1
        ordered = sorted(counts.items(), key=lambda entry: (-entry[1], entry[0]))
        return [FlightAirlineFacet(airline_company=name, flight_count=count) for name, count in ordered[:limit]]

    def get_category_facets(self, items: list[FlightPosition]) -> list[FlightCategoryFacet]:
        counts = {category: 0 for category in CATEGORY_ORDER}
        for item in items:
            counts[item.flight_category] = counts.get(item.flight_category, 0) + 1
        return [FlightCategoryFacet(category=category, flight_count=counts.get(category, 0)) for category in CATEGORY_ORDER if counts.get(category, 0) > 0 or category == "Unknown"]

    def _get_feed_snapshot(self, region: str, refresh: bool = False) -> FeedSnapshot:
        cache_key = region
        now = self.clock()
        with self._lock:
            cached = self._cache.get(cache_key)
            if not refresh and cached and now - cached.fetched_at <= self.ttl_seconds:
                return FeedSnapshot(
                    items=list(cached.items),
                    status=self._build_status(
                        state="cached",
                        region=region,
                        fetched_at=cached.fetched_at,
                        message="Serving a cached live-flight snapshot.",
                    ),
                )

        try:
            provider_payload = self.fetcher(region)
            items = self._normalize_provider_payload(provider_payload)
            fetched_at = self.clock()
            with self._lock:
                self._cache[cache_key] = CacheEntry(fetched_at=fetched_at, items=list(items))
            return FeedSnapshot(
                items=items,
                status=self._build_status(
                    state="live",
                    region=region,
                    fetched_at=fetched_at,
                    message="Live state vectors from OpenSky.",
                ),
            )
        except Exception as exc:
            with self._lock:
                cached = self._cache.get(cache_key)
            if cached and now - cached.fetched_at <= self.ttl_seconds:
                return FeedSnapshot(
                    items=list(cached.items),
                    status=self._build_status(
                        state="cached",
                        region=region,
                        fetched_at=cached.fetched_at,
                        message=f"OpenSky unavailable, serving cached snapshot: {exc}",
                    ),
                )
            return FeedSnapshot(
                items=[],
                status=self._build_status(
                    state="unavailable",
                    region=region,
                    fetched_at=None,
                    message=f"OpenSky feed unavailable: {exc}",
                ),
            )

    def _resolve_region(self, region: str | None) -> str:
        candidate = (region or "global").strip().lower()
        return candidate if candidate in REGION_BBOXES else "global"

    def _filter_items(
        self,
        items: list[FlightPosition],
        region: str,
        min_altitude: float | None,
        max_altitude: float | None,
        query: str | None,
        airline: str | None,
        category: str | None,
        on_ground: bool | None,
    ) -> list[FlightPosition]:
        query_text = (query or "").strip().lower()
        airline_text = (airline or "").strip().lower()
        category_text = (category or "").strip().lower()
        filtered: list[FlightPosition] = []
        for item in items:
            if on_ground is not None and item.on_ground != on_ground:
                continue
            if min_altitude is not None:
                if item.baro_altitude is None or item.baro_altitude < min_altitude:
                    continue
            if max_altitude is not None:
                if item.baro_altitude is None or item.baro_altitude > max_altitude:
                    continue
            if airline_text:
                company = (item.airline_company or "").lower()
                prefix = (item.airline_prefix or "").lower()
                if airline_text not in company and airline_text != prefix:
                    continue
            if category_text and category_text not in {"all", "all traffic"}:
                if item.flight_category.lower() != category_text:
                    continue
            if query_text:
                haystack = " ".join(
                    filter(
                        None,
                        [
                            item.icao24,
                            item.callsign or "",
                            item.origin_country,
                            item.airline_company or "",
                            item.airline_prefix or "",
                        ],
                    )
                ).lower()
                if query_text not in haystack:
                    continue
            filtered.append(item)

        filtered.sort(
            key=lambda item: (
                item.on_ground,
                -datetime.fromisoformat(item.last_contact).timestamp(),
                -(item.baro_altitude or 0.0),
            )
        )
        return filtered

    def _fetch_provider_data(self, region: str) -> dict[str, Any]:
        params: dict[str, float] = {}
        bbox = REGION_BBOXES.get(region)
        if bbox is not None:
            params = {
                "lamin": bbox[0],
                "lomin": bbox[1],
                "lamax": bbox[2],
                "lomax": bbox[3],
            }
        url = OPENSKY_URL if not params else f"{OPENSKY_URL}?{urlencode(params)}"
        request = Request(url, headers={"User-Agent": "AOG Sentinel/1.0"})
        if self.username and self.password:
            token = base64.b64encode(f"{self.username}:{self.password}".encode("utf-8")).decode("ascii")
            request.add_header("Authorization", f"Basic {token}")
        ssl_context = ssl.create_default_context(cafile=certifi.where())
        try:
            with urlopen(request, timeout=15, context=ssl_context) as response:
                if response.status != 200:
                    raise RuntimeError(f"provider returned HTTP {response.status}")
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:  # pragma: no cover - network/provider path
            raise RuntimeError(f"provider returned HTTP {exc.code}") from exc
        except URLError as exc:  # pragma: no cover - network/provider path
            raise RuntimeError("provider request failed") from exc

    def _normalize_provider_payload(self, payload: dict[str, Any]) -> list[FlightPosition]:
        states = payload.get("states") or []
        items: list[FlightPosition] = []
        for state in states:
            latitude = self._safe_float(self._state_value(state, 6))
            longitude = self._safe_float(self._state_value(state, 5))
            if latitude is None or longitude is None:
                continue

            last_contact_epoch = int(self._state_value(state, 4) or payload.get("time") or int(self.clock()))
            callsign_raw = self._state_value(state, 1)
            callsign = callsign_raw.strip() if isinstance(callsign_raw, str) and callsign_raw.strip() else None
            origin_country = str(self._state_value(state, 2) or "Unknown").strip()
            airline_company, airline_prefix, flight_category = self._enrich_operator(callsign, origin_country)

            items.append(
                FlightPosition(
                    icao24=str(self._state_value(state, 0) or "unknown").strip(),
                    callsign=callsign,
                    origin_country=origin_country,
                    airline_company=airline_company,
                    airline_prefix=airline_prefix,
                    flight_category=flight_category,
                    latitude=latitude,
                    longitude=longitude,
                    baro_altitude=self._safe_float(self._state_value(state, 7)),
                    velocity=self._safe_float(self._state_value(state, 9)),
                    heading=self._safe_float(self._state_value(state, 10)),
                    vertical_rate=self._safe_float(self._state_value(state, 11)),
                    on_ground=bool(self._state_value(state, 8)),
                    last_contact=self._format_timestamp(last_contact_epoch),
                )
            )
        return items

    def _enrich_operator(self, callsign: str | None, origin_country: str) -> tuple[str | None, str | None, str]:
        normalized = (callsign or "").strip().upper()
        if not normalized:
            return None, None, "Unknown"

        prefix_match = re.match(r"^([A-Z]{2,5})", normalized)
        prefix = prefix_match.group(1) if prefix_match else None
        reference = load_airline_reference()
        if prefix and prefix in reference:
            payload = reference[prefix]
            return payload.get("airline_company"), prefix, payload.get("flight_category", "Unknown")

        if prefix and prefix in MILITARY_PREFIXES:
            return "Government / Military", prefix, "Military/Government"
        if PRIVATE_CALLSIGN_PATTERN.match(normalized):
            return "Private / Business", None, "Private/Business"
        if normalized.startswith(("FDX", "UPS", "BCS", "ABX", "GTI", "CLX")):
            return "Cargo Operator", prefix, "Cargo"
        if len(normalized) >= 3 and normalized[:3].isalpha() and any(char.isdigit() for char in normalized[3:]):
            return None, normalized[:3], "Commercial"
        return None, prefix, "Unknown"

    def _build_status(
        self,
        state: str,
        region: str,
        fetched_at: float | None,
        message: str,
    ) -> FlightFeedStatus:
        return FlightFeedStatus(
            provider=PROVIDER_NAME,
            state=state,
            region=region,
            cached=state == "cached",
            last_refresh=self._format_timestamp(fetched_at) if fetched_at is not None else None,
            message=message,
        )

    @staticmethod
    def _state_value(state: list[Any], index: int) -> Any:
        return state[index] if len(state) > index else None

    @staticmethod
    def _safe_float(value: Any) -> float | None:
        if value is None:
            return None
        return float(value)

    @staticmethod
    def _format_timestamp(value: float | int | None) -> str:
        if value is None:
            return datetime.now(tz=UTC).isoformat()
        return datetime.fromtimestamp(float(value), tz=UTC).isoformat()


@lru_cache(maxsize=1)
def get_flight_service() -> FlightService:
    return FlightService(
        ttl_seconds=settings.flights_cache_ttl_seconds,
        default_limit=settings.flights_default_limit,
        username=settings.opensky_username,
        password=settings.opensky_password,
    )
