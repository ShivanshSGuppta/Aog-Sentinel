from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies.auth import get_current_user
from app.schemas import SpareRecommendation
from app.services.spares_service import get_spare_recommendations

router = APIRouter(prefix="/spares", tags=["spares"], dependencies=[Depends(get_current_user)])


@router.get("/recommendations", response_model=list[SpareRecommendation])
def spare_recommendations() -> list[SpareRecommendation]:
    return get_spare_recommendations()
