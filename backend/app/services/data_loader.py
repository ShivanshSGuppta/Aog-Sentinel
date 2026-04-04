from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import pandas as pd

from app.config import settings
from app.utils.scoring import compute_risk_score, recommended_action


@dataclass
class DataRepository:
    aircraft: pd.DataFrame
    defects: pd.DataFrame
    maintenance_logs: pd.DataFrame
    spares: pd.DataFrame
    manual_chunks: pd.DataFrame
    latest_report_date: pd.Timestamp


def _to_bool(value: object) -> bool:
    return str(value).strip().lower() in {"true", "1", "yes", "y"}


def _read_csv(path: Path, **kwargs) -> pd.DataFrame:
    return pd.read_csv(path, **kwargs)


def _recompute_repeat_defects(defects: pd.DataFrame) -> pd.DataFrame:
    ordered = defects.sort_values(["aircraft_id", "report_date", "defect_id"]).copy()
    ordered["repeat_defect"] = False

    for _, group in ordered.groupby("aircraft_id", sort=False):
        history: list[tuple[pd.Timestamp, str, str]] = []
        for idx, row in group.iterrows():
            current_date = row["report_date"]
            for prior_date, prior_component, prior_ata in reversed(history):
                if (current_date - prior_date).days > 30:
                    break
                if prior_component == row["component"] or prior_ata == row["ata_chapter"]:
                    ordered.at[idx, "repeat_defect"] = True
                    break
            history.append((current_date, row["component"], row["ata_chapter"]))
    return ordered


def _load_aircraft(data_dir: Path) -> pd.DataFrame:
    aircraft = _read_csv(data_dir / "aircraft.csv")
    aircraft["aircraft_label"] = aircraft["tail_number"] + " / " + aircraft["aircraft_type"]
    return aircraft


def _load_spares(data_dir: Path) -> pd.DataFrame:
    spares = _read_csv(data_dir / "spares.csv")
    spares["current_stock"] = spares["current_stock"].astype(int)
    spares["lead_time_days"] = spares["lead_time_days"].astype(int)
    spares["reorder_threshold"] = spares["reorder_threshold"].astype(int)
    spares["avg_monthly_usage"] = spares["avg_monthly_usage"].astype(float)
    spares["unit_cost"] = spares["unit_cost"].astype(float)
    return spares


def _load_defects(data_dir: Path, aircraft: pd.DataFrame, spares: pd.DataFrame) -> pd.DataFrame:
    defects = _read_csv(data_dir / "defects.csv", parse_dates=["report_date"])
    defects["aog_flag"] = defects["aog_flag"].map(_to_bool)
    defects["repeat_defect"] = defects["repeat_defect"].map(_to_bool)
    defects["delay_minutes"] = defects["delay_minutes"].fillna(0).astype(int)
    defects["rectification_hours"] = defects["rectification_hours"].astype(float)

    defects = _recompute_repeat_defects(defects)

    spares_view = spares[["part_id", "current_stock", "reorder_threshold", "criticality"]].rename(
        columns={
            "current_stock": "spares_current_stock",
            "reorder_threshold": "spares_reorder_threshold",
            "criticality": "spares_criticality",
        }
    )
    defects = defects.merge(spares_view, on="part_id", how="left")
    defects["part_below_threshold"] = defects["spares_current_stock"].fillna(0) < defects["spares_reorder_threshold"].fillna(0)
    defects["risk_score"] = defects.apply(
        lambda row: compute_risk_score(
            severity=row["severity"],
            aog_flag=bool(row["aog_flag"]),
            repeat_defect=bool(row["repeat_defect"]),
            delay_minutes=int(row["delay_minutes"]),
            part_below_threshold=bool(row["part_below_threshold"]),
        ),
        axis=1,
    )
    defects["recommended_action"] = defects.apply(
        lambda row: recommended_action(
            severity=row["severity"],
            aog_flag=bool(row["aog_flag"]),
            repeat_defect=bool(row["repeat_defect"]),
        ),
        axis=1,
    )
    defects["is_open"] = defects["status"].ne("Closed")
    defects["dispatch_impacting"] = defects["aog_flag"] | (defects["delay_minutes"] >= 120) | (
        defects["severity"].isin(["Critical", "High"]) & defects["is_open"]
    )
    defects["month"] = defects["report_date"].dt.to_period("M").dt.to_timestamp()

    aircraft_view = aircraft[["aircraft_id", "tail_number", "aircraft_type", "base_station", "fleet", "status", "aircraft_label"]].rename(
        columns={"status": "aircraft_operational_status"}
    )
    defects = defects.merge(aircraft_view, on="aircraft_id", how="left")
    return defects.sort_values(["report_date", "defect_id"], ascending=[False, False]).reset_index(drop=True)


def _load_maintenance_logs(data_dir: Path) -> pd.DataFrame:
    logs = _read_csv(data_dir / "maintenance_logs.csv", parse_dates=["date"])
    logs["manhours"] = logs["manhours"].astype(float)
    return logs.sort_values(["date", "log_id"], ascending=[False, False]).reset_index(drop=True)


def _load_manual_chunks(data_dir: Path) -> pd.DataFrame:
    chunks = _read_csv(data_dir / "manual_chunks.csv")
    chunks["search_text"] = (
        chunks["source_doc"].astype(str)
        + " "
        + chunks["section_title"].astype(str)
        + " "
        + chunks["text"].astype(str)
    )
    return chunks


@lru_cache(maxsize=1)
def get_repository() -> DataRepository:
    data_dir = settings.data_dir
    aircraft = _load_aircraft(data_dir)
    spares = _load_spares(data_dir)
    defects = _load_defects(data_dir, aircraft, spares)
    maintenance_logs = _load_maintenance_logs(data_dir)
    manual_chunks = _load_manual_chunks(data_dir)
    latest_report_date = defects["report_date"].max()
    return DataRepository(
        aircraft=aircraft,
        defects=defects,
        maintenance_logs=maintenance_logs,
        spares=spares,
        manual_chunks=manual_chunks,
        latest_report_date=latest_report_date,
    )
