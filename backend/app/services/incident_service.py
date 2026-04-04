from __future__ import annotations

from app.schemas import AogIncident
from app.services.data_loader import get_repository
from app.utils.dates import format_date


def get_aog_incidents() -> list[AogIncident]:
    repo = get_repository()
    defects = repo.defects
    incidents = defects[
        defects["aog_flag"]
        | (defects["risk_score"] >= 70)
        | (defects["severity"].isin(["Critical", "High"]) & defects["is_open"])
    ].copy()

    incidents = incidents.sort_values(["risk_score", "report_date"], ascending=[False, False])
    return [
        AogIncident(
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
        )
        for row in incidents.itertuples(index=False)
    ]
