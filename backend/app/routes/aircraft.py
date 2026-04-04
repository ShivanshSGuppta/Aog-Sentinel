from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies.auth import get_current_user
from app.schemas import AircraftDetail
from app.services.aircraft_service import get_aircraft_detail

router = APIRouter(prefix="/aircraft", tags=["aircraft"], dependencies=[Depends(get_current_user)])


@router.get("/{aircraft_id}", response_model=AircraftDetail)
def aircraft_detail(aircraft_id: str) -> AircraftDetail:
    try:
        return get_aircraft_detail(aircraft_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Aircraft {aircraft_id} not found") from exc
