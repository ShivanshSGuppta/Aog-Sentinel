from __future__ import annotations

import pandas as pd

from app.schemas import (
    AircraftDetail,
    AircraftReliabilitySnapshot,
    AtaBreakdownItem,
    DefectRecord,
    MaintenanceLogItem,
    MonthlyDefectItem,
    RecurringComponentItem,
)
from app.services.dashboard_service import get_aircraft_risk_ranking
from app.services.data_loader import get_repository
from app.utils.dates import format_date, month_label


def get_aircraft_detail(aircraft_id: str) -> AircraftDetail:
    repo = get_repository()
    ranking = {item.aircraft_id: item for item in get_aircraft_risk_ranking()}
    if aircraft_id not in ranking:
        raise KeyError(aircraft_id)

    defects = repo.defects[repo.defects["aircraft_id"] == aircraft_id].copy()
    logs = repo.maintenance_logs[repo.maintenance_logs["aircraft_id"] == aircraft_id].copy()

    defect_trend = _build_defect_trend(defects)
    ata_distribution = _build_ata_distribution(defects)
    recent_defects = _build_recent_defects(defects)
    maintenance_logs = _build_maintenance_logs(logs)
    recurring_components = _build_recurring_components(defects)
    snapshot = AircraftReliabilitySnapshot(
        total_defects=int(defects.shape[0]),
        open_defects=int(defects[defects["is_open"]].shape[0]),
        aog_events=int(defects[defects["aog_flag"]].shape[0]),
        repeat_defects=int(defects[defects["repeat_defect"]].shape[0]),
        average_rectification_hours=round(float(defects["rectification_hours"].mean()), 1) if not defects.empty else 0.0,
        dispatch_impacting_events=int(defects[defects["dispatch_impacting"]].shape[0]),
    )

    return AircraftDetail(
        summary=ranking[aircraft_id],
        defect_trend=defect_trend,
        ata_distribution=ata_distribution,
        recent_defects=recent_defects,
        maintenance_logs=maintenance_logs,
        recurring_components=recurring_components,
        reliability_snapshot=snapshot,
    )


def _build_defect_trend(defects: pd.DataFrame) -> list[MonthlyDefectItem]:
    if defects.empty:
        return []
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


def _build_ata_distribution(defects: pd.DataFrame) -> list[AtaBreakdownItem]:
    grouped = (
        defects.groupby("ata_chapter", as_index=False)
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


def _build_recent_defects(defects: pd.DataFrame) -> list[DefectRecord]:
    rows = defects.sort_values(["report_date", "risk_score"], ascending=[False, False]).head(12)
    return [
        DefectRecord(
            defect_id=row.defect_id,
            aircraft_id=row.aircraft_id,
            aircraft_label=row.aircraft_label,
            tail_number=row.tail_number,
            aircraft_type=row.aircraft_type,
            base_station=row.base_station,
            report_date=format_date(row.report_date),
            ata_chapter=row.ata_chapter,
            component=row.component,
            defect_description=row.defect_description,
            severity=row.severity,
            aog_flag=bool(row.aog_flag),
            delay_minutes=int(row.delay_minutes),
            repeat_defect=bool(row.repeat_defect),
            risk_score=round(float(row.risk_score), 1),
            recommended_action=row.recommended_action,
            status=row.status,
            rectification_hours=round(float(row.rectification_hours), 1),
            vendor=row.vendor,
            maintenance_action=row.maintenance_action,
            part_id=row.part_id,
        )
        for row in rows.itertuples(index=False)
    ]


def _build_maintenance_logs(logs: pd.DataFrame) -> list[MaintenanceLogItem]:
    rows = logs.sort_values("date", ascending=False).head(15)
    return [
        MaintenanceLogItem(
            log_id=row.log_id,
            date=format_date(row.date),
            task_type=row.task_type,
            component=row.component,
            scheduled_unscheduled=row.scheduled_unscheduled,
            manhours=round(float(row.manhours), 1),
            doc_ref=row.doc_ref,
            outcome=row.outcome,
        )
        for row in rows.itertuples(index=False)
    ]


def _build_recurring_components(defects: pd.DataFrame) -> list[RecurringComponentItem]:
    if defects.empty:
        return []
    grouped = (
        defects.groupby(["component", "ata_chapter"], as_index=False)
        .agg(
            occurrence_count=("defect_id", "count"),
            repeat_occurrences=("repeat_defect", "sum"),
            average_risk_score=("risk_score", "mean"),
            last_report_date=("report_date", "max"),
        )
        .sort_values(["repeat_occurrences", "occurrence_count", "average_risk_score"], ascending=[False, False, False])
        .head(8)
    )
    return [
        RecurringComponentItem(
            component=row.component,
            ata_chapter=row.ata_chapter,
            occurrence_count=int(row.occurrence_count),
            repeat_occurrences=int(row.repeat_occurrences),
            average_risk_score=round(float(row.average_risk_score), 1),
            last_report_date=format_date(row.last_report_date),
        )
        for row in grouped.itertuples(index=False)
    ]
