from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies.auth import get_current_user
from app.schemas import AogIncident
from app.services.incident_service import get_aog_incidents

router = APIRouter(prefix="/incidents", tags=["incidents"], dependencies=[Depends(get_current_user)])


@router.get("/aog", response_model=list[AogIncident])
def incidents_aog() -> list[AogIncident]:
    return get_aog_incidents()
