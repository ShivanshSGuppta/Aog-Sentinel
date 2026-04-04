from __future__ import annotations

import math

import numpy as np

from app.schemas import SpareRecommendation
from app.services.data_loader import get_repository


STATUS_PRIORITY = {"Critical Low": 2, "Low": 1, "Healthy": 0}
CRITICALITY_PRIORITY = {"High": 2, "Medium": 1, "Low": 0}


def _stock_status(current_stock: int, reorder_threshold: int, criticality: str) -> str:
    if current_stock < reorder_threshold and criticality == "High":
        return "Critical Low"
    if current_stock < reorder_threshold:
        return "Low"
    return "Healthy"


def get_spare_recommendations() -> list[SpareRecommendation]:
    repo = get_repository()
    spares = repo.spares.copy()
    spares["forecast_30d"] = np.ceil(spares["avg_monthly_usage"] * 1.1).astype(int)
    spares["recommended_reorder_qty"] = np.maximum(
        0,
        spares["reorder_threshold"] + spares["forecast_30d"] - spares["current_stock"],
    )
    spares["stock_status"] = spares.apply(
        lambda row: _stock_status(
            current_stock=int(row["current_stock"]),
            reorder_threshold=int(row["reorder_threshold"]),
            criticality=str(row["criticality"]),
        ),
        axis=1,
    )
    spares["sort_rank"] = spares["stock_status"].map(STATUS_PRIORITY) * 100 + spares["criticality"].map(CRITICALITY_PRIORITY) * 10 + spares["recommended_reorder_qty"]
    spares = spares.sort_values(["sort_rank", "lead_time_days"], ascending=[False, False])

    return [
        SpareRecommendation(
            part_id=row.part_id,
            component=row.component,
            vendor=row.vendor,
            current_stock=int(row.current_stock),
            lead_time_days=int(row.lead_time_days),
            avg_monthly_usage=round(float(row.avg_monthly_usage), 1),
            criticality=row.criticality,
            reorder_threshold=int(row.reorder_threshold),
            forecast_30d=int(row.forecast_30d),
            recommended_reorder_qty=int(row.recommended_reorder_qty),
            stock_status=row.stock_status,
            unit_cost=round(float(row.unit_cost), 2),
        )
        for row in spares.itertuples(index=False)
    ]
