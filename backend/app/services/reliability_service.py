from __future__ import annotations

import pandas as pd

from app.schemas import (
    AtaBreakdownItem,
    ComponentIssueItem,
    MonthlyRepeatDefectItem,
    RectificationDistributionItem,
    ReliabilitySummary,
    VendorIssueItem,
)
from app.services.data_loader import get_repository
from app.utils.dates import month_label


def get_reliability_summary() -> ReliabilitySummary:
    repo = get_repository()
    defects = repo.defects
    total = int(defects.shape[0])
    open_defects = int(defects[defects["is_open"]].shape[0])
    closed_defects = int(defects[defects["status"] == "Closed"].shape[0])
    aog_count = int(defects[defects["aog_flag"]].shape[0])
    repeat_count = int(defects[defects["repeat_defect"]].shape[0])

    ata_counts = defects.groupby("ata_chapter")["defect_id"].count().sort_values(ascending=False)
    vendor_counts = defects.groupby("vendor")["defect_id"].count().sort_values(ascending=False)
    repeat_by_aircraft = (
        defects[defects["repeat_defect"]]
        .groupby("aircraft_label")["defect_id"]
        .count()
        .sort_values(ascending=False)
    )

    top_repeat_aircraft = repeat_by_aircraft.index[0] if not repeat_by_aircraft.empty else "None"
    top_repeat_count = int(repeat_by_aircraft.iloc[0]) if not repeat_by_aircraft.empty else 0

    return ReliabilitySummary(
        total_defects=total,
        open_defects=open_defects,
        closed_defects=closed_defects,
        aog_count=aog_count,
        repeat_defect_count=repeat_count,
        repeat_defect_rate=round((repeat_count / total) * 100, 1) if total else 0.0,
        aog_rate=round((aog_count / total) * 100, 1) if total else 0.0,
        average_rectification_hours=round(float(defects["rectification_hours"].mean()), 1) if total else 0.0,
        most_problematic_ata_chapter=str(ata_counts.index[0]) if not ata_counts.empty else "None",
        most_problematic_vendor=str(vendor_counts.index[0]) if not vendor_counts.empty else "None",
        top_repeat_defect_aircraft=top_repeat_aircraft,
        top_repeat_defect_aircraft_count=top_repeat_count,
    )


def get_reliability_ata() -> list[AtaBreakdownItem]:
    repo = get_repository()
    grouped = (
        repo.defects.groupby("ata_chapter", as_index=False)
        .agg(
            defect_count=("defect_id", "count"),
            aog_count=("aog_flag", "sum"),
            repeat_defect_count=("repeat_defect", "sum"),
            average_risk_score=("risk_score", "mean"),
        )
        .sort_values(["defect_count", "average_risk_score"], ascending=[False, False])
    )
    return [
        AtaBreakdownItem(
            ata_chapter=row.ata_chapter,
            defect_count=int(row.defect_count),
            aog_count=int(row.aog_count),
            repeat_defect_count=int(row.repeat_defect_count),
            average_risk_score=round(float(row.average_risk_score), 1),
        )
        for row in grouped.itertuples(index=False)
    ]


def get_repeat_defects_by_month() -> list[MonthlyRepeatDefectItem]:
    repo = get_repository()
    defects = repo.defects.copy()
    month_range = pd.period_range(defects["month"].min(), defects["month"].max(), freq="M")
    grouped = (
        defects.groupby(defects["month"].dt.to_period("M"))
        .agg(repeat_defect_count=("repeat_defect", "sum"), total_defects=("defect_id", "count"))
        .reindex(month_range, fill_value=0)
        .reset_index()
    )
    return [
        MonthlyRepeatDefectItem(
            month=month_label(row.index.to_timestamp()),
            repeat_defect_count=int(row.repeat_defect_count),
            total_defects=int(row.total_defects),
        )
        for row in grouped.itertuples(index=False)
    ]


def get_vendor_issues() -> list[VendorIssueItem]:
    repo = get_repository()
    grouped = (
        repo.defects.groupby("vendor", as_index=False)
        .agg(
            defect_count=("defect_id", "count"),
            repeat_defect_count=("repeat_defect", "sum"),
            aog_count=("aog_flag", "sum"),
            average_risk_score=("risk_score", "mean"),
        )
        .sort_values(["defect_count", "average_risk_score"], ascending=[False, False])
    )
    return [
        VendorIssueItem(
            vendor=row.vendor,
            defect_count=int(row.defect_count),
            repeat_defect_count=int(row.repeat_defect_count),
            aog_count=int(row.aog_count),
            average_risk_score=round(float(row.average_risk_score), 1),
        )
        for row in grouped.itertuples(index=False)
    ]


def get_component_issues() -> list[ComponentIssueItem]:
    repo = get_repository()
    grouped = (
        repo.defects.groupby(["component", "ata_chapter", "vendor"], as_index=False)
        .agg(
            defect_count=("defect_id", "count"),
            repeat_defect_count=("repeat_defect", "sum"),
            average_risk_score=("risk_score", "mean"),
            open_defects=("is_open", "sum"),
        )
        .sort_values(["defect_count", "repeat_defect_count", "average_risk_score"], ascending=[False, False, False])
    )
    return [
        ComponentIssueItem(
            component=row.component,
            ata_chapter=row.ata_chapter,
            vendor=row.vendor,
            defect_count=int(row.defect_count),
            repeat_defect_count=int(row.repeat_defect_count),
            average_risk_score=round(float(row.average_risk_score), 1),
            open_defects=int(row.open_defects),
        )
        for row in grouped.itertuples(index=False)
    ]


def get_rectification_distribution() -> list[RectificationDistributionItem]:
    repo = get_repository()
    defects = repo.defects.copy()
    bins = [0, 4, 8, 12, 18, float("inf")]
    labels = ["0-4h", "4-8h", "8-12h", "12-18h", "18h+"]
    defects["bucket"] = pd.cut(
        defects["rectification_hours"],
        bins=bins,
        labels=labels,
        include_lowest=True,
        right=False,
    )
    grouped = defects.groupby("bucket", observed=False)["defect_id"].count().reindex(labels, fill_value=0)
    return [
        RectificationDistributionItem(bucket=bucket, item_count=int(count))
        for bucket, count in grouped.items()
    ]
