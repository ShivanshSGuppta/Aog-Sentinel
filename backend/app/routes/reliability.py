from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies.auth import get_current_user
from app.schemas import (
    AtaBreakdownItem,
    ComponentIssueItem,
    MonthlyRepeatDefectItem,
    RectificationDistributionItem,
    ReliabilitySummary,
    VendorIssueItem,
)
from app.services.reliability_service import (
    get_component_issues,
    get_rectification_distribution,
    get_reliability_ata,
    get_reliability_summary,
    get_repeat_defects_by_month,
    get_vendor_issues,
)

router = APIRouter(prefix="/reliability", tags=["reliability"], dependencies=[Depends(get_current_user)])


@router.get("/summary", response_model=ReliabilitySummary)
def reliability_summary() -> ReliabilitySummary:
    return get_reliability_summary()


@router.get("/ata", response_model=list[AtaBreakdownItem])
def reliability_ata() -> list[AtaBreakdownItem]:
    return get_reliability_ata()


@router.get("/repeat-defects", response_model=list[MonthlyRepeatDefectItem])
def reliability_repeat_defects() -> list[MonthlyRepeatDefectItem]:
    return get_repeat_defects_by_month()


@router.get("/vendors", response_model=list[VendorIssueItem])
def reliability_vendors() -> list[VendorIssueItem]:
    return get_vendor_issues()


@router.get("/components", response_model=list[ComponentIssueItem])
def reliability_components() -> list[ComponentIssueItem]:
    return get_component_issues()


@router.get("/rectification-distribution", response_model=list[RectificationDistributionItem])
def reliability_rectification_distribution() -> list[RectificationDistributionItem]:
    return get_rectification_distribution()
