from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.dependencies.auth import get_current_user
from app.schemas import FlightLiveResponse, FlightOverview
from app.services.flight_service import get_flight_service

router = APIRouter(prefix="/flights", tags=["flights"], dependencies=[Depends(get_current_user)])


@router.get("/overview", response_model=FlightOverview)
def flights_overview(region: str = Query(default="global"), refresh: bool = Query(default=False)) -> FlightOverview:
    service = get_flight_service()
    return service.get_overview(region=region, refresh=refresh)


@router.get("/live", response_model=FlightLiveResponse)
def flights_live(
    limit: int | None = Query(default=None, ge=1, le=1000),
    region: str = Query(default="global"),
    min_altitude: float | None = Query(default=None, ge=0),
    max_altitude: float | None = Query(default=None, ge=0),
    query: str | None = Query(default=None, max_length=120),
    airline: str | None = Query(default=None, max_length=120),
    category: str | None = Query(default=None, max_length=64),
    on_ground: bool | None = Query(default=None),
    refresh: bool = Query(default=False),
) -> FlightLiveResponse:
    service = get_flight_service()
    return service.get_live_flights(
        limit=limit,
        region=region,
        min_altitude=min_altitude,
        max_altitude=max_altitude,
        query=query,
        airline=airline,
        category=category,
        on_ground=on_ground,
        refresh=refresh,
    )
