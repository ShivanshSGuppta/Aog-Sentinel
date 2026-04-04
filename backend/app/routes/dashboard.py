from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies.auth import get_current_user
from app.schemas import AircraftSummary, AtaBreakdownItem, DashboardSummary, MonthlyDefectItem, TopComponentItem
from app.services.dashboard_service import (
    get_aircraft_risk_ranking,
    get_ata_breakdown,
    get_dashboard_summary,
    get_monthly_defects,
    get_top_components,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(get_current_user)])


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary() -> DashboardSummary:
    return get_dashboard_summary()


@router.get("/ata-breakdown", response_model=list[AtaBreakdownItem])
def dashboard_ata_breakdown() -> list[AtaBreakdownItem]:
    return get_ata_breakdown()


@router.get("/monthly-defects", response_model=list[MonthlyDefectItem])
def dashboard_monthly_defects() -> list[MonthlyDefectItem]:
    return get_monthly_defects()


@router.get("/top-components", response_model=list[TopComponentItem])
def dashboard_top_components() -> list[TopComponentItem]:
    return get_top_components()


@router.get("/aircraft-risk-ranking", response_model=list[AircraftSummary])
def dashboard_aircraft_risk_ranking() -> list[AircraftSummary]:
    return get_aircraft_risk_ranking()
