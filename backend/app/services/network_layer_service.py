from __future__ import annotations

import json
import math
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.config import settings
from app.schemas import AirportOverlay, CorridorSegment, DisruptionHotspot, MaintenanceBase, OwnedFleetAircraft, OwnedFleetMatch, WeatherOverlay

EARTH_RADIUS_KM = 6371.0
AIRPORTS_REFERENCE = Path(settings.data_dir) / "reference" / "airports_reference.json"


@dataclass
class WeatherCacheEntry:
    fetched_at: float
    payload: WeatherOverlay


_weather_cache: dict[str, WeatherCacheEntry] = {}
_weather_lock = threading.Lock()


def load_airports_reference() -> list[dict[str, Any]]:
    if not AIRPORTS_REFERENCE.exists():
        return []
    return json.loads(AIRPORTS_REFERENCE.read_text())


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def build_maintenance_bases(sites: list[dict[str, Any]], alerts_by_station: dict[str, int], cases_by_station: dict[str, int]) -> list[MaintenanceBase]:
    bases: list[MaintenanceBase] = []
    for site in sites:
        lat = site.get("latitude")
        lon = site.get("longitude")
        if lat is None or lon is None:
            continue
        station = site["iata_code"]
        bases.append(
            MaintenanceBase(
                base_id=f"base_{station.lower()}",
                name=site["site_name"],
                iata_code=station,
                latitude=float(lat),
                longitude=float(lon),
                open_cases=cases_by_station.get(station, 0),
                active_alerts=alerts_by_station.get(station, 0),
            )
        )
    return bases


def build_owned_fleet_matches(
    workspace_aircraft: list[dict[str, Any]],
    live_flights: list[dict[str, Any]],
    site_lookup: dict[str, tuple[float | None, float | None]],
) -> tuple[list[OwnedFleetMatch], list[OwnedFleetAircraft]]:
    matches: list[OwnedFleetMatch] = []
    overlays: list[OwnedFleetAircraft] = []
    remaining_flights = list(live_flights)
    for aircraft in workspace_aircraft:
        flight_match = None
        default_callsign = (aircraft.get("default_callsign") or "").strip().upper()
        tail_number = (aircraft.get("tail_number") or "").strip().upper().replace("-", "")
        for flight in remaining_flights:
            callsign = (flight.get("callsign") or "").strip().upper()
            if not callsign:
                continue
            if default_callsign and callsign == default_callsign:
                flight_match = flight
                break
            if tail_number and tail_number in callsign.replace("-", ""):
                flight_match = flight
                break
        if flight_match is not None:
            remaining_flights.remove(flight_match)

        station = aircraft.get("station") or ""
        fallback_lat, fallback_lon = site_lookup.get(station, (None, None))
        latitude = float(flight_match["latitude"]) if flight_match else fallback_lat
        longitude = float(flight_match["longitude"]) if flight_match else fallback_lon
        match_status = "matched" if flight_match else "unmatched"
        if float(aircraft.get("risk_score") or 0) >= 70:
            match_status = "watch" if flight_match else "watch"

        matches.append(
            OwnedFleetMatch(
                match_id=f"match_{aircraft['aircraft_id']}",
                aircraft_id=aircraft["aircraft_id"],
                tail_number=aircraft["tail_number"],
                callsign=flight_match.get("callsign") if flight_match else aircraft.get("default_callsign"),
                match_status=match_status,
                latitude=latitude,
                longitude=longitude,
                risk_score=float(aircraft.get("risk_score") or 0),
                station=station or None,
                live_flight_icao24=flight_match.get("icao24") if flight_match else None,
            )
        )
        if latitude is not None and longitude is not None:
            overlays.append(
                OwnedFleetAircraft(
                    overlay_id=f"of_{aircraft['aircraft_id']}",
                    aircraft_id=aircraft["aircraft_id"],
                    tail_number=aircraft["tail_number"],
                    aircraft_type=aircraft["aircraft_type"],
                    callsign=(flight_match.get("callsign") if flight_match else aircraft.get("default_callsign") or aircraft["tail_number"]),
                    latitude=float(latitude),
                    longitude=float(longitude),
                    status="Dispatch Watch" if float(aircraft.get("risk_score") or 0) >= 70 else aircraft.get("operational_status", "Active"),
                    risk_score=float(aircraft.get("risk_score") or 0),
                    station=station or "-",
                )
            )
    return matches, overlays


def build_corridor_segments(live_flights: list[dict[str, Any]]) -> list[CorridorSegment]:
    segments: dict[tuple[int, int, int], dict[str, Any]] = {}
    for flight in live_flights:
        heading = flight.get("heading")
        lat = flight.get("latitude")
        lon = flight.get("longitude")
        if heading is None or lat is None or lon is None or flight.get("on_ground"):
            continue
        bucket = (round(float(lat) / 5), round(float(lon) / 5), round(float(heading) / 30))
        entry = segments.setdefault(
            bucket,
            {
                "latitudes": [],
                "longitudes": [],
                "headings": [],
                "count": 0,
            },
        )
        entry["latitudes"].append(float(lat))
        entry["longitudes"].append(float(lon))
        entry["headings"].append(float(heading))
        entry["count"] += 1

    results: list[CorridorSegment] = []
    for index, (_, payload) in enumerate(sorted(segments.items(), key=lambda item: item[1]["count"], reverse=True)[:18], start=1):
        start_lat = sum(payload["latitudes"]) / len(payload["latitudes"])
        start_lon = sum(payload["longitudes"]) / len(payload["longitudes"])
        avg_heading = sum(payload["headings"]) / len(payload["headings"])
        distance = 4.0 + min(payload["count"], 12) * 0.35
        end_lat = start_lat + distance * math.cos(math.radians(avg_heading))
        end_lon = start_lon + distance * math.sin(math.radians(avg_heading))
        count = payload["count"]
        intensity = "high" if count >= 10 else "medium" if count >= 5 else "low"
        results.append(
            CorridorSegment(
                segment_id=f"corr_{index}",
                start_latitude=start_lat,
                start_longitude=start_lon,
                end_latitude=end_lat,
                end_longitude=end_lon,
                traffic_count=count,
                avg_heading=avg_heading,
                intensity=intensity,
            )
        )
    return results


def build_airport_overlays(live_flights: list[dict[str, Any]], region_airports: list[dict[str, Any]]) -> list[AirportOverlay]:
    overlays: list[AirportOverlay] = []
    for airport in region_airports:
        inbound = 0
        surface = 0
        for flight in live_flights:
            distance = haversine_km(airport["latitude"], airport["longitude"], float(flight["latitude"]), float(flight["longitude"]))
            if distance > 170:
                continue
            altitude = float(flight.get("baro_altitude") or 0)
            if flight.get("on_ground") and distance <= 35:
                surface += 1
            elif altitude <= 4000:
                inbound += 1
        congestion_score = min(100.0, inbound * 6 + surface * 8)
        severity = "Critical" if congestion_score >= 75 else "High" if congestion_score >= 45 else "Medium" if congestion_score >= 15 else "Low"
        overlays.append(
            AirportOverlay(
                airport_id=airport["airport_id"],
                iata_code=airport["iata_code"],
                name=airport["name"],
                latitude=float(airport["latitude"]),
                longitude=float(airport["longitude"]),
                inbound_count=inbound,
                surface_count=surface,
                congestion_score=round(congestion_score, 1),
                severity=severity,
            )
        )
    return sorted(overlays, key=lambda item: (item.congestion_score, item.inbound_count + item.surface_count), reverse=True)[:10]


def build_hotspots(alerts_by_station: dict[str, int], airport_overlays: list[AirportOverlay]) -> list[DisruptionHotspot]:
    hotspots: list[DisruptionHotspot] = []
    for airport in airport_overlays[:6]:
        station_alerts = alerts_by_station.get(airport.iata_code, 0)
        open_alerts = station_alerts + airport.inbound_count
        severity = "Critical" if airport.congestion_score >= 75 or station_alerts >= 3 else airport.severity
        reason = f"Inbound pressure {airport.inbound_count}, surface traffic {airport.surface_count}, station alerts {station_alerts}."
        hotspots.append(
            DisruptionHotspot(
                hotspot_id=f"hot_{airport.iata_code.lower()}",
                label=f"{airport.iata_code} network pressure",
                latitude=airport.latitude,
                longitude=airport.longitude,
                severity=severity,
                open_alerts=open_alerts,
                reason=reason,
            )
        )
    return hotspots


def build_weather_layers(airports: list[AirportOverlay], refresh: bool = False) -> list[WeatherOverlay]:
    overlays: list[WeatherOverlay] = []
    for airport in airports[:6]:
        overlays.append(fetch_weather_overlay(airport, refresh=refresh))
    return overlays


def fetch_weather_overlay(airport: AirportOverlay, refresh: bool = False) -> WeatherOverlay:
    cache_key = airport.iata_code
    now = time.time()
    with _weather_lock:
        cached = _weather_cache.get(cache_key)
        if not refresh and cached and now - cached.fetched_at <= settings.weather_cache_ttl_seconds:
            return cached.payload

    try:
        params = urlencode({
            "latitude": airport.latitude,
            "longitude": airport.longitude,
            "current": "temperature_2m,wind_speed_10m,visibility,weather_code",
        })
        request = Request(f"https://api.open-meteo.com/v1/forecast?{params}", headers={"User-Agent": "AOG Sentinel/1.0"})
        with urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
        current = payload.get("current", {})
        overlay = WeatherOverlay(
            overlay_id=f"wx_{airport.iata_code.lower()}",
            label=f"{airport.iata_code} weather",
            latitude=airport.latitude,
            longitude=airport.longitude,
            condition=weather_code_label(current.get("weather_code")),
            temperature_c=_safe_float(current.get("temperature_2m")),
            wind_speed_kts=round((_safe_float(current.get("wind_speed_10m")) or 0) * 0.539957, 1) if current.get("wind_speed_10m") is not None else None,
            visibility_km=round((_safe_float(current.get("visibility")) or 0) / 1000, 1) if current.get("visibility") is not None else None,
            source_status="live",
        )
    except (HTTPError, URLError, TimeoutError, ValueError, KeyError):
        overlay = WeatherOverlay(
            overlay_id=f"wx_{airport.iata_code.lower()}",
            label=f"{airport.iata_code} weather",
            latitude=airport.latitude,
            longitude=airport.longitude,
            condition="Operational visibility" if airport.congestion_score < 55 else "Convective watch",
            temperature_c=27.0 if airport.latitude >= 0 else 18.0,
            wind_speed_kts=12.0 if airport.congestion_score < 55 else 22.0,
            visibility_km=8.0 if airport.congestion_score < 55 else 4.5,
            source_status="derived",
        )

    with _weather_lock:
        _weather_cache[cache_key] = WeatherCacheEntry(fetched_at=now, payload=overlay)
    return overlay


def weather_code_label(code: Any) -> str:
    mapping = {
        0: "Clear",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Fog",
        48: "Depositing rime fog",
        51: "Light drizzle",
        61: "Rain",
        63: "Moderate rain",
        65: "Heavy rain",
        71: "Snow",
        80: "Rain showers",
        95: "Thunderstorm",
    }
    try:
        return mapping.get(int(code), "Operational weather")
    except (TypeError, ValueError):
        return "Operational weather"


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    return float(value)
