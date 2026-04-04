from __future__ import annotations

import unittest
from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.flight_service import FlightService


class MutableClock:
    def __init__(self, start: float = 1_710_000_000.0) -> None:
        self.value = start

    def __call__(self) -> float:
        return self.value

    def advance(self, seconds: float) -> None:
        self.value += seconds


def sample_payload() -> dict:
    return {
        "time": 1_710_000_000,
        "states": [
            [
                "abc123",
                "AIC101 ",
                "India",
                None,
                1_710_000_000,
                77.1025,
                28.7041,
                10668.0,
                False,
                232.0,
                91.0,
                0.1,
                None,
                None,
                None,
                False,
                0,
            ],
            [
                "def456",
                "DLH760 ",
                "Germany",
                None,
                1_709_999_950,
                13.405,
                52.52,
                0.0,
                True,
                15.0,
                180.0,
                0.0,
                None,
                None,
                None,
                False,
                0,
            ],
        ],
    }


class FlightServiceTests(unittest.TestCase):
    def test_normalizes_provider_payload(self) -> None:
        service = FlightService(ttl_seconds=20, default_limit=100, fetcher=lambda region: sample_payload())

        response = service.get_live_flights(region="global")

        self.assertEqual(response.status.state, "live")
        self.assertEqual(response.total_results, 2)
        self.assertEqual(response.items[0].icao24, "abc123")
        self.assertEqual(response.items[0].callsign, "AIC101")
        self.assertEqual(response.items[0].airline_company, "Air India")
        self.assertEqual(response.items[0].flight_category, "Commercial")
        self.assertFalse(response.items[0].on_ground)

    def test_uses_cache_within_ttl(self) -> None:
        calls = {"count": 0}

        def fetcher(region: str) -> dict:
            calls["count"] += 1
            return sample_payload()

        service = FlightService(ttl_seconds=20, default_limit=100, fetcher=fetcher)

        first = service.get_live_flights(region="global")
        second = service.get_live_flights(region="global")

        self.assertEqual(calls["count"], 1)
        self.assertEqual(first.status.state, "live")
        self.assertEqual(second.status.state, "cached")

    def test_manual_refresh_falls_back_to_fresh_cache(self) -> None:
        clock = MutableClock()
        responses = [sample_payload(), RuntimeError("provider down")]

        def fetcher(region: str) -> dict:
            next_item = responses.pop(0)
            if isinstance(next_item, Exception):
                raise next_item
            return next_item

        service = FlightService(ttl_seconds=20, default_limit=100, fetcher=fetcher, clock=clock)

        initial = service.get_live_flights(region="global")
        clock.advance(5)
        refreshed = service.get_live_flights(region="global", refresh=True)

        self.assertEqual(initial.status.state, "live")
        self.assertEqual(refreshed.status.state, "cached")
        self.assertEqual(len(refreshed.items), 2)
        self.assertIn("cached snapshot", refreshed.status.message or "")

    def test_returns_unavailable_when_provider_fails_without_cache(self) -> None:
        service = FlightService(
            ttl_seconds=20,
            default_limit=100,
            fetcher=lambda region: (_ for _ in ()).throw(RuntimeError("provider down")),
        )

        response = service.get_live_flights(region="global")

        self.assertEqual(response.status.state, "unavailable")
        self.assertEqual(response.total_results, 0)
        self.assertEqual(response.items, [])

    def test_expired_cache_does_not_mask_outage(self) -> None:
        clock = MutableClock()
        responses = [sample_payload(), RuntimeError("provider down")]

        def fetcher(region: str) -> dict:
            next_item = responses.pop(0)
            if isinstance(next_item, Exception):
                raise next_item
            return next_item

        service = FlightService(ttl_seconds=20, default_limit=100, fetcher=fetcher, clock=clock)
        service.get_live_flights(region="global")
        clock.advance(25)

        response = service.get_live_flights(region="global", refresh=True)

        self.assertEqual(response.status.state, "unavailable")
        self.assertEqual(response.items, [])

    def test_filters_by_airline_and_category(self) -> None:
        service = FlightService(ttl_seconds=20, default_limit=100, fetcher=lambda region: sample_payload())

        airline_response = service.get_live_flights(region="global", airline="Lufthansa")
        category_response = service.get_live_flights(region="global", category="Commercial")
        search_response = service.get_live_flights(region="global", query="air india")

        self.assertEqual(len(airline_response.items), 1)
        self.assertEqual(airline_response.items[0].airline_company, "Lufthansa")
        self.assertEqual(category_response.total_results, 2)
        self.assertEqual(search_response.items[0].airline_company, "Air India")

    def test_classifies_private_and_cargo_callsigns(self) -> None:
        payload = {
            "time": 1_710_000_000,
            "states": [
                ["ghi789", "FDX901 ", "United States", None, 1_710_000_000, -84.39, 33.75, 9200.0, False, 220.0, 110.0, 0.0, None, None, None, False, 0],
                ["jkl012", "N612EM ", "United States", None, 1_710_000_000, -80.19, 25.76, 6100.0, False, 155.0, 80.0, 0.0, None, None, None, False, 0],
            ],
        }
        service = FlightService(ttl_seconds=20, default_limit=100, fetcher=lambda region: payload)

        response = service.get_live_flights(region="global")

        categories = {item.callsign: item.flight_category for item in response.items}
        self.assertEqual(categories["FDX901"], "Cargo")
        self.assertEqual(categories["N612EM"], "Private/Business")


if __name__ == "__main__":
    unittest.main()
