import copy
import json
from datetime import datetime, timezone

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
