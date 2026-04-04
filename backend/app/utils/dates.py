from __future__ import annotations

from datetime import datetime


def format_date(value: datetime) -> str:
    return value.strftime("%Y-%m-%d")


def month_label(value: datetime) -> str:
    return value.strftime("%b %Y")
