from __future__ import annotations

import math

import pandas as pd

from app.schemas import AircraftSummary, AtaBreakdownItem, DashboardSummary, MonthlyDefectItem, TopComponentItem
from app.services.data_loader import get_repository
from app.utils.dates import month_label


def _safe_mean(series: pd.Series) -> float:
    value = float(series.mean()) if not series.empty else 0.0
    return round(value, 1)


def get_dashboard_summary() -> DashboardSummary:
    repo = get_repository()
    defects = repo.defects
    closed = defects[defects["status"] == "Closed"]
    return DashboardSummary(
        total_aircraft=int(len(repo.aircraft)),
        open_defects=int(defects[defects["is_open"]].shape[0]),
        aog_events=int(defects[defects["aog_flag"]].shape[0]),
        repeat_defects=int(defects[defects["repeat_defect"]].shape[0]),
        avg_rectification_time=_safe_mean(closed["rectification_hours"]),
        dispatch_impacting_events=int(defects[defects["dispatch_impacting"]].shape[0]),
    )


def get_ata_breakdown() -> list[AtaBreakdownItem]:
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


def get_monthly_defects() -> list[MonthlyDefectItem]:
    repo = get_repository()
    defects = repo.defects.copy()
    month_range = pd.period_range(defects["month"].min(), defects["month"].max(), freq="M")
    grouped = (
        defects.groupby(defects["month"].dt.to_period("M"))
        .agg(defect_count=("defect_id", "count"), aog_count=("aog_flag", "sum"))
        .reindex(month_range, fill_value=0)
        .reset_index()
    )
    return [
        MonthlyDefectItem(
            month=month_label(row.index.to_timestamp()),
            defect_count=int(row.defect_count),
            aog_count=int(row.aog_count),
        )
        for row in grouped.itertuples(index=False)
    ]


def get_top_components(limit: int = 10) -> list[TopComponentItem]:
    repo = get_repository()
    grouped = (
        repo.defects.groupby(["component", "ata_chapter", "vendor"], as_index=False)
        .agg(
            defect_count=("defect_id", "count"),
            repeat_defect_count=("repeat_defect", "sum"),
            average_risk_score=("risk_score", "mean"),
            open_defects=("is_open", "sum"),
        )
        .sort_values(["defect_count", "average_risk_score"], ascending=[False, False])
        .head(limit)
    )
    return [
        TopComponentItem(
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


def get_aircraft_risk_ranking() -> list[AircraftSummary]:
    repo = get_repository()
    defects = repo.defects
    cutoff = repo.latest_report_date - pd.Timedelta(days=30)
    ranking: list[AircraftSummary] = []

    for aircraft in repo.aircraft.itertuples(index=False):
        aircraft_defects = defects[defects["aircraft_id"] == aircraft.aircraft_id]
        open_mean = aircraft_defects.loc[aircraft_defects["is_open"], "risk_score"].mean()
        recent_mean = aircraft_defects.loc[aircraft_defects["report_date"] >= cutoff, "risk_score"].mean()
        open_mean = 0.0 if pd.isna(open_mean) else float(open_mean)
        recent_mean = 0.0 if pd.isna(recent_mean) else float(recent_mean)
        current_risk_score = round(max(0.0, min(100.0, open_mean * 0.6 + recent_mean * 0.4)), 1)

        ranking.append(
            AircraftSummary(
                aircraft_id=aircraft.aircraft_id,
                aircraft_type=aircraft.aircraft_type,
                tail_number=aircraft.tail_number,
                fleet=aircraft.fleet,
                base_station=aircraft.base_station,
                status=aircraft.status,
                age_years=int(aircraft.age_years),
                flight_hours=int(aircraft.flight_hours),
                flight_cycles=int(aircraft.flight_cycles),
                current_risk_score=current_risk_score,
                open_defects=int(aircraft_defects[aircraft_defects["is_open"]].shape[0]),
                aog_events=int(aircraft_defects[aircraft_defects["aog_flag"]].shape[0]),
                repeat_defects=int(aircraft_defects[aircraft_defects["repeat_defect"]].shape[0]),
            )
        )

    return sorted(ranking, key=lambda item: (-item.current_risk_score, -item.open_defects, item.aircraft_id))
