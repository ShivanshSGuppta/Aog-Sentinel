from __future__ import annotations

import unittest
from pathlib import Path
import sys
from unittest.mock import patch

from sqlalchemy import select

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db.bootstrap import bootstrap_database
from app.db.models import ConnectorRun, User
from app.db.session import SessionLocal
from app.schemas import (
    AlertCreateRequest,
    CaseCreateRequest,
    CaseTimelineCreateRequest,
    ConnectorConfigUpdateRequest,
    ConnectorInstallRequest,
    ConnectorSyncRequest,
    FlightAirlineFacet,
    FlightCategoryFacet,
    FlightFeedStatus,
    FlightLiveResponse,
    FlightOverview,
    FlightPosition,
)
from app.services.auth_service import AuthService
from app.services.platform_service import (
    add_case_timeline_entry,
    create_alert,
    create_case,
    get_alert_summary,
    get_connector_cursor,
    get_connector_health_summary,
    get_connector_manifest,
    get_network_workspace,
    get_workspace_detail,
    install_connector,
    list_cases,
    list_connector_catalog,
    list_connectors,
    list_workspaces,
    sync_connector_install,
    update_connector_config,
    validate_connector_config,
)
from app.workers.connector_worker import process_pending_runs


def sample_network_flights() -> list[FlightPosition]:
    return [
        FlightPosition(
            icao24="sbx201",
            callsign="SBX201",
            origin_country="India",
            airline_company="SkyBridge Airways",
            airline_prefix="SBX",
            flight_category="Commercial",
            latitude=28.6,
            longitude=77.2,
            baro_altitude=11800,
            velocity=225,
            heading=88,
            vertical_rate=0,
            on_ground=False,
            last_contact="2026-03-13T01:00:00+00:00",
        ),
        FlightPosition(
            icao24="abc123",
            callsign="AIC101",
            origin_country="India",
            airline_company="Air India",
            airline_prefix="AIC",
            flight_category="Commercial",
            latitude=28.6,
            longitude=77.2,
            baro_altitude=11200,
            velocity=230,
            heading=90,
            vertical_rate=0,
            on_ground=False,
            last_contact="2026-03-13T01:00:00+00:00",
        ),
        FlightPosition(
            icao24="def456",
            callsign="FDX901",
            origin_country="United States",
            airline_company="FedEx Express",
            airline_prefix="FDX",
            flight_category="Cargo",
            latitude=33.6,
            longitude=-84.4,
            baro_altitude=9400,
            velocity=220,
            heading=110,
            vertical_rate=0,
            on_ground=False,
            last_contact="2026-03-13T01:00:00+00:00",
        ),
    ]


class FakeFlightService:
    def __init__(self, items: list[FlightPosition]) -> None:
        self.items = items
        self.status = FlightFeedStatus(
            provider="test",
            state="live",
            region="global",
            cached=False,
            last_refresh="2026-03-13T01:00:00+00:00",
            message="ok",
        )

    def get_live_flights(self, *, limit=None, query=None, airline=None, category=None, **_: object) -> FlightLiveResponse:
        filtered = []
        query_text = (query or "").lower() if isinstance(query, str) else ""
        airline_text = (airline or "").lower() if isinstance(airline, str) else ""
        category_text = (category or "").lower() if isinstance(category, str) else ""
        for item in self.items:
            if airline_text and airline_text not in (item.airline_company or "").lower():
                continue
            if category_text and item.flight_category.lower() != category_text:
                continue
            if query_text and query_text not in " ".join([item.callsign or "", item.origin_country, item.airline_company or ""]).lower():
                continue
            filtered.append(item)
        return FlightLiveResponse(
            items=filtered[: limit or len(filtered)],
            status=self.status,
            total_results=len(filtered),
            applied_limit=limit or len(filtered),
        )

    def summarize_items(self, items, status) -> FlightOverview:
        return FlightOverview(
            airborne_count=sum(not item.on_ground for item in items),
            on_ground_count=sum(item.on_ground for item in items),
            countries_covered=len({item.origin_country for item in items}),
            displayed_flights=len(items),
            last_refresh=status.last_refresh,
            status=status,
        )

    def get_airline_facets(self, items):
        counts = {}
        for item in items:
            counts[item.airline_company or "Unknown"] = counts.get(item.airline_company or "Unknown", 0) + 1
        return [FlightAirlineFacet(airline_company=name, flight_count=count) for name, count in counts.items()]

    def get_category_facets(self, items):
        counts = {}
        for item in items:
            counts[item.flight_category] = counts.get(item.flight_category, 0) + 1
        return [FlightCategoryFacet(category=name, flight_count=count) for name, count in counts.items()]


class PlatformServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        bootstrap_database()

    def setUp(self) -> None:
        self.db = SessionLocal()
        self.auth = AuthService(self.db)
        self.user = self.db.scalar(select(User).where(User.email == "ekta.rao@sbx.airline.local"))
        self.admin = self.db.scalar(select(User).where(User.email == "platform.admin@aogsentinel.local"))
        assert self.user is not None
        assert self.admin is not None

    def tearDown(self) -> None:
        self.db.close()

    def test_auth_login_and_refresh(self) -> None:
        session = self.auth.authenticate_user("ekta.rao@sbx.airline.local", "Sentinel123!")
        refreshed = self.auth.refresh_session(session.refresh_token)

        self.assertEqual(session.user.email, "ekta.rao@sbx.airline.local")
        self.assertEqual(refreshed.user.user_id, self.user.user_id)

    def test_workspace_list_is_membership_filtered(self) -> None:
        user_workspaces = list_workspaces(self.db, self.user)
        admin_workspaces = list_workspaces(self.db, self.admin)

        self.assertEqual([item.workspace_id for item in user_workspaces], ["ws_skybridge"])
        self.assertGreaterEqual(len(admin_workspaces), 2)

    def test_returns_workspace_detail(self) -> None:
        detail = get_workspace_detail(self.db, self.user, "ws_skybridge")

        self.assertEqual(detail.airline_name, "SkyBridge Airways")
        self.assertGreaterEqual(len(detail.fleets), 1)
        self.assertGreaterEqual(len(detail.users), 1)

    def test_connector_catalog_and_health_summary(self) -> None:
        catalog = list_connector_catalog(self.db, self.admin)
        summary = get_connector_health_summary(self.db, self.user, "ws_skybridge")

        self.assertGreaterEqual(len(catalog), 4)
        self.assertEqual(summary.total_connectors, 4)
        self.assertGreaterEqual(summary.warning_connectors, 1)

    def test_connector_validation_detects_missing_fields(self) -> None:
        manifest = get_connector_manifest(self.db, self.user, "cn_amos_ops")
        required_keys = [field.key for field in manifest.config_fields if field.required]

        result = validate_connector_config(self.db, self.user, "cn_amos_ops", {required_keys[0]: "configured"})

        self.assertFalse(result.valid)
        self.assertGreaterEqual(len(result.missing_required_fields), 1)

    def test_connector_sync_persists_cursor(self) -> None:
        validation = update_connector_config(
            self.db,
            self.admin,
            "cn_amos_ops",
            ConnectorConfigUpdateRequest(
                config={
                    "endpoint_url": "https://edge.airline.local/api",
                    "username": "svc_connector",
                    "password": "secret",
                    "station_scope": "DEL",
                }
            ),
        )
        run = sync_connector_install(self.db, self.admin, "cn_amos_ops", ConnectorSyncRequest(force_full_sync=False))
        cursor = get_connector_cursor(self.db, self.admin, "cn_amos_ops")

        self.assertTrue(validation.valid)
        self.assertEqual(run.status, "Succeeded")
        self.assertIsNotNone(cursor.cursor_value)

    def test_connector_worker_processes_queued_runs(self) -> None:
        update_connector_config(
            self.db,
            self.admin,
            "cn_flight_feed",
            ConnectorConfigUpdateRequest(
                config={
                    "stream_endpoint": "wss://ops.airline.local/stream",
                    "api_token": "secret-token",
                    "fleet_filter": "A320",
                }
            ),
        )
        queued_run = ConnectorRun(
            run_id="run_cn_flight_feed_worker_test",
            install_id="inst_cn_flight_feed",
            status="Queued",
            records_processed=0,
        )
        self.db.merge(queued_run)
        self.db.commit()

        processed = process_pending_runs()
        cursor = get_connector_cursor(self.db, self.admin, "cn_flight_feed")
        refreshed = self.db.get(ConnectorRun, queued_run.run_id)

        self.assertGreaterEqual(processed, 1)
        assert refreshed is not None
        self.assertEqual(refreshed.status, "Succeeded")
        self.assertIsNotNone(cursor.cursor_value)

    def test_install_connector_creates_new_install(self) -> None:
        installs_before = list_connectors(self.db, self.admin, "ws_meridian")
        existing = next((item for item in installs_before if item.package_name == "aog-connectors.flight-ops"), None)
        created = existing or install_connector(
            self.db,
            self.admin,
            ConnectorInstallRequest(
                connector_key="flight_ops_stream",
                workspace_id="ws_meridian",
                name="Meridian Flight Stream",
            ),
        )
        installs = list_connectors(self.db, self.admin, "ws_meridian")

        self.assertEqual(created.workspace_id, "ws_meridian")
        self.assertTrue(any(item.connector_id == created.connector_id for item in installs))

    def test_cases_are_sorted_latest_first(self) -> None:
        cases = list_cases(self.db, self.user, "ws_skybridge")

        self.assertGreaterEqual(len(cases), 2)
        self.assertGreaterEqual(cases[0].updated_at, cases[-1].updated_at)

    def test_alert_and_case_creation_are_persistent(self) -> None:
        alert = create_alert(
            self.db,
            self.user,
            AlertCreateRequest(
                workspace_id="ws_skybridge",
                title="Hydraulic caution watch",
                alert_type="Engineering",
                severity="High",
                aircraft_reference="VT-SXF",
                component="Hydraulic Pump",
                station="DEL",
                summary="Pressure trend requires follow-up.",
                source_event_type="connector_event",
                risk_score=73,
            ),
        )
        case = create_case(
            self.db,
            self.user,
            CaseCreateRequest(
                workspace_id="ws_skybridge",
                title="Investigate hydraulic caution watch",
                priority="High",
                sla_due="2026-03-13T10:00:00+00:00",
                linked_alert_count=1,
                aircraft_reference="VT-SXF",
                category="Engineering Investigation",
            ),
        )
        updated = add_case_timeline_entry(
            self.db,
            self.user,
            case.case_id,
            CaseTimelineCreateRequest(entry_type="Update", message="Assigned troubleshooting to line maintenance."),
        )
        summary = get_alert_summary(self.db, self.user, "ws_skybridge")

        self.assertEqual(alert.workspace_id, "ws_skybridge")
        self.assertGreaterEqual(len(updated.timeline), 2)
        self.assertGreaterEqual(summary.total_alerts, summary.open_alerts)

    def test_network_workspace_wraps_live_feed_and_overlays(self) -> None:
        with patch("app.services.platform_service.get_flight_service", return_value=FakeFlightService(sample_network_flights())):
            payload = get_network_workspace(
                self.db,
                self.user,
                "ws_skybridge",
                region="global",
                limit=25,
                include_layers="owned_fleet,watch_aircraft,maintenance_bases,hotspots,airport_congestion",
            )

        self.assertEqual(payload.workspace.workspace_id, "ws_skybridge")
        self.assertGreaterEqual(len(payload.layers), 4)
        self.assertGreaterEqual(len(payload.owned_fleet), 1)
        self.assertGreaterEqual(len(payload.owned_fleet_matches), 1)
        self.assertGreaterEqual(len(payload.airport_overlays), 1)
        self.assertEqual(len(payload.weather_layers), 0)
        self.assertEqual(len(payload.corridor_segments), 0)
        self.assertIsNotNone(payload.flight_feed.status.state)
        self.assertGreaterEqual(len(payload.airline_facets), 1)
        self.assertGreaterEqual(len(payload.category_facets), 1)

    def test_network_workspace_applies_airline_and_category_filters(self) -> None:
        with patch("app.services.platform_service.get_flight_service", return_value=FakeFlightService(sample_network_flights())):
            payload = get_network_workspace(
                self.db,
                self.user,
                "ws_skybridge",
                region="global",
                limit=25,
                airline="Air India",
                category="Commercial",
                include_layers="owned_fleet",
            )

        self.assertTrue(all((item.airline_company or "") == "Air India" for item in payload.flight_feed.items))
        self.assertTrue(all(item.flight_category == "Commercial" for item in payload.flight_feed.items))


if __name__ == "__main__":
    unittest.main()
