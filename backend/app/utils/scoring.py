from __future__ import annotations

SEVERITY_SCORES = {
    "Critical": 100,
    "High": 75,
    "Medium": 50,
    "Low": 25,
}


def clamp_score(value: float) -> float:
    return round(max(0.0, min(100.0, value)), 1)


def compute_risk_score(
    severity: str,
    aog_flag: bool,
    repeat_defect: bool,
    delay_minutes: int,
    part_below_threshold: bool,
) -> float:
    severity_component = SEVERITY_SCORES.get(severity, 0)
    aog_component = 100 if aog_flag else 0
    repeat_component = 100 if repeat_defect else 0
    delay_component = min((delay_minutes / 300) * 100, 100)
    spares_component = 100 if part_below_threshold else 0

    score = (
        severity_component * 0.35
        + aog_component * 0.25
        + repeat_component * 0.15
        + delay_component * 0.15
        + spares_component * 0.10
    )
    return clamp_score(score)


def recommended_action(severity: str, aog_flag: bool, repeat_defect: bool) -> str:
    if severity == "Critical" and aog_flag:
        return "Immediate engineering escalation and component replacement review"
    if severity == "High" and repeat_defect:
        return "Prioritize troubleshooting, inspect recurrence history, verify spares"
    if severity == "Medium":
        return "Plan rectification in next maintenance window"
    if severity == "Low":
        return "Monitor and schedule routine follow-up"
    if severity == "High":
        return "Prioritize troubleshooting, inspect recurrence history, verify spares"
    return "Plan rectification in next maintenance window"
