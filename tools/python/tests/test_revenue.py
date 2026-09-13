import copy
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import pytest

from wayfind_audit.revenue import (
    TABLES,
    NoRedirect,
    audit_revenue,
    collect_revenue_rest,
    link_health,
    tracking,
    validate,
)
from wayfind_audit.snapshot import AuditError


def fixture():
    return {
        "schema_version": "revenue-1",
        "source_kind": "fixture",
        "captured_at": "2026-09-09T03:00:00Z",
        "consistency": "repeatable_read",
        "datasets": {n: [] for n in TABLES},
        "expected_counts": {n: 0 for n in TABLES},
        "pages": {n: [0] for n in TABLES},
    }


def test_empty_is_labelled_and_not_money():
    r = audit_revenue(fixture())
    assert r["source_kind"] == "fixture"
    assert r["inventory_complete"] is True
    assert r["eligible_coverage_complete"] is False
    assert r["paid_commission"] is None


@pytest.mark.parametrize("code", [0, 403, 429, 500, 503])
def test_blocks_never_healthy(code):
    row = {"link_ok": True, "http_status": code, "last_checked_at": "2026-09-09T02:00:00Z"}
    assert link_health(row, datetime(2026, 9, 9, 3, tzinfo=timezone.utc)) == "unknown"


def test_stale_and_fresh_controls():
    now = datetime(2026, 9, 9, 3, tzinfo=timezone.utc)
    row = {"link_ok": True, "last_checked_at": "2026-09-09T02:00:00Z"}
    assert link_health(row, now) == "stored_healthy"
    row["last_checked_at"] = "2026-09-01T02:00:00Z"
    assert link_health(row, now) == "unknown"


def test_tracking_is_exact_and_host_locked():
    row = {
        "product_code": "173028P1",
        "product_url": "https://www.viator.com/tours/x/d5403-173028P1?pid=P00308545",
    }
    assert tracking(row, "viator")
    row["product_url"] = row["product_url"].replace("viator.com", "viator.com.evil.test")
    assert not tracking(row, "viator")
    dest = "https://www.undercovertourist.com/orlando/disney-jollywood-nights-ticket/"
    deal = {
        "dest_url": dest,
        "affiliate_url": "https://www.anrdoezrs.net/links/101643573/type/dlg/sid/test/" + dest,
    }
    assert tracking(deal, "undercover_tourist")
    deal["dest_url"] += "wrong/"
    assert not tracking(deal, "undercover_tourist")


def test_incomplete_pages_and_duplicate_ids_fail():
    d = fixture()
    row = {k: None for k in TABLES["places"][2].split(",")}
    row.update(place_id="p1", name="Free park")
    d["datasets"]["places"] = [row, copy.deepcopy(row)]
    d["expected_counts"]["places"] = 2
    d["pages"]["places"] = [2]
    with pytest.raises(AuditError, match="duplicate"):
        validate(d)
    d = fixture()
    d["expected_counts"]["places"] = 1
    with pytest.raises(AuditError, match="incomplete"):
        validate(d)
    d = fixture()
    d["pages"]["places"] = []
    with pytest.raises(AuditError, match="pagination"):
        validate(d)


def test_free_place_without_offer_is_unknown_not_leak():
    d = fixture()
    d["datasets"]["places"] = [
        {"place_id": "free-park", "name": "Park", "category": "parks", "metro": "Tampa"}
    ]
    d["expected_counts"]["places"] = 1
    d["pages"]["places"] = [1]
    r = audit_revenue(d)
    assert r["entities"][0]["classification"] == "unknown"
    assert r["paid_commission"] is None


def test_rest_collection_exact_counts_and_failures(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://gbhtoehdxkzjsmmkisgu.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-not-real")
    calls = []

    class Reply:
        def __init__(self, request, count):
            self.request = request
            self.headers = {"Content-Range": "*/" + count}

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def geturl(self):
            return self.request.full_url

        def read(self, limit):
            return json.dumps([]).encode()

    def opener(request, timeout):
        assert request.get_method() == "GET"
        assert timeout == 30
        calls.append(request.full_url)
        return Reply(request, "0")

    result = collect_revenue_rest(opener=opener)
    assert len(calls) == 6
    assert result["consistency"] == "multi_request"
    with pytest.raises(AuditError, match="exact count"):
        collect_revenue_rest(opener=lambda r, timeout: Reply(r, "*"))
    with pytest.raises(AuditError, match="incomplete census"):
        collect_revenue_rest(opener=lambda r, timeout: Reply(r, "1"))
    assert NoRedirect().redirect_request(None, None, 302, "", {}, "https://evil.test") is None


def test_rest_keyset_crosses_page_boundary(monkeypatch):
    from urllib.parse import parse_qs, urlsplit

    monkeypatch.setenv("SUPABASE_URL", "https://gbhtoehdxkzjsmmkisgu.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-not-real")
    all_places = [
        {"place_id": f"p{i:04d}", "name": "Park", "category": "parks", "metro": "Tampa"}
        for i in range(1001)
    ]
    seen_cursors = []

    class Page:
        def __init__(self, request):
            self.url = request.full_url
            q = parse_qs(urlsplit(self.url).query)
            if "/wf_inventory?" in self.url:
                cursor = q.get("place_id", [None])[0]
                seen_cursors.append(cursor)
                self.rows = all_places[:1000] if cursor is None else all_places[1000:]
                self.headers = {"Content-Range": "0-999/1001" if cursor is None else "0-0/1"}
            else:
                self.rows = []
                self.headers = {"Content-Range": "*/0"}

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def geturl(self):
            return self.url

        def read(self, limit):
            return json.dumps(self.rows).encode()

    result = collect_revenue_rest(opener=lambda request, timeout: Page(request))
    assert result["pages"]["places"] == [1000, 1]
    assert result["expected_counts"]["places"] == 1001
    assert seen_cursors == [None, "gt.p0999"]


def test_actual_code_pins_and_missing_product(tmp_path):
    from wayfind_audit.cli import main

    data = fixture()
    data["datasets"]["places"] = [
        {
            "place_id": "shell-key",
            "name": "Shell Key Preserve",
            "category": "parks",
            "metro": "Tampa",
        }
    ]
    data["expected_counts"]["places"] = 1
    data["pages"]["places"] = [1]
    snapshot, pins = tmp_path / "snapshot.json", tmp_path / "pins.json"
    snapshot.write_text(json.dumps(data))
    repo = Path(__file__).resolve().parents[3]
    subprocess.run(
        ["node", str(repo / "scripts/export-revenue-pins.mjs"), str(snapshot), str(pins)],
        check=True,
        cwd=repo,
    )
    policy = json.loads(pins.read_text())
    assert policy["pins"][0]["offer_id"] == "173028P1"
    report = audit_revenue(data, policy)
    assert report["pin_checks"][0]["state"] == "missing_inventory"
    assert (
        main(
            [
                "revenue-report",
                "--input",
                str(snapshot),
                "--pins",
                str(pins),
                "--out",
                str(tmp_path / "out"),
            ]
        )
        == 0
    )
    snapshot.write_text(json.dumps(data) + " ")
    assert (
        main(
            [
                "revenue-report",
                "--input",
                str(snapshot),
                "--pins",
                str(pins),
                "--out",
                str(tmp_path / "bad"),
            ]
        )
        == 2
    )
