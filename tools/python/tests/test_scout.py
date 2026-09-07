import copy
import json
from datetime import date, datetime, timezone

import pytest

from wayfind_scout.fetch import fetch_https
from wayfind_scout.parsers import parse_ics, parse_jsonld, parse_rss
from wayfind_scout.pipeline import run
from wayfind_scout.policy import ScoutError, assert_public_host, validate_manifest

NOW = datetime(2026, 9, 7, 12, tzinfo=timezone.utc)


def manifest(fmt="jsonld"):
    return {
        "schema_version": 1,
        "mode": "dry_run",
        "places": [
            {
                "place_id": "place-1",
                "name": "Harbor Museum",
                "lat": 27.5,
                "lng": -82.5,
                "category": "attractions",
                "status": "OPERATIONAL",
                "excluded": False,
                "needs_review": False,
            }
        ],
        "sources": [
            {
                "source_id": "harbor-official",
                "source_class": "official_venue",
                "status": "approved",
                "format": fmt,
                "url": "https://events.example.org/calendar",
                "approved_hosts": ["events.example.org"],
                "place_ids": ["place-1"],
                "cost_after_free_micros": 0,
                "hard_fetch_ceiling_daily": 1,
                "max_records": 100,
                "retention_days": 30,
                "rights_verified_at": "2026-09-01",
                "rights_documentation_url": "https://events.example.org/terms",
                "rights": {
                    "internal_use": True,
                    "display_allowed": False,
                    "derived_facts_allowed": True,
                    "store_derived": True,
                    "raw_redistribution_allowed": False,
                    "commercial_api_allowed": False,
                },
            }
        ],
    }


def test_jsonld_event_and_place_require_literal_fields():
    body = b"""<script type="application/ld+json">{
      "@graph": [
        {"@type":"Event","name":"Night at the Harbor","startDate":"2026-10-31T19:00:00-04:00","location":{"name":"Harbor Museum"},"description":"Lantern tour.","url":"/night"},
        {"@type":"Event","name":"No Date"},
        {"@type":"Museum","name":"Harbor Museum","description":"Local maritime history."}
      ]}</script>"""
    rows = parse_jsonld(body, "https://events.example.org/calendar")
    assert [row["kind"] for row in rows] == ["event", "place"]
    assert rows[0]["start"] == "2026-10-31T19:00:00-04:00"
    assert rows[0]["event_url"] == "https://events.example.org/night"
    assert all(len(row["evidence_sha256"]) == 64 for row in rows)


def test_malformed_jsonld_is_unavailable_not_healthy_empty():
    with pytest.raises(ScoutError, match="no valid JSON"):
        parse_jsonld(b'{"@type":', "https://events.example.org/calendar")


def test_jsonld_script_ceiling_fails_instead_of_truncating():
    script = '<script type="application/ld+json">{"@type":"Museum","name":"Harbor Museum"}</script>'
    with pytest.raises(ScoutError, match="script ceiling"):
        parse_jsonld((script * 51).encode(), "https://events.example.org/calendar")


def test_nonempty_json_error_is_not_healthy_empty():
    with pytest.raises(ScoutError, match="no usable"):
        parse_jsonld(b'{"error":"rate limited"}', "https://events.example.org/calendar")


def test_explicit_empty_jsonld_graph_is_healthy_empty():
    assert (
        parse_jsonld(
            b'{"@context":"https://schema.org","@graph":[]}', "https://events.example.org/calendar"
        )
        == []
    )


@pytest.mark.parametrize("body", [b"{}", b"[null]", b"[0]", b'{"@graph":[{}]}'])
def test_nonempty_unusable_jsonld_shapes_are_not_healthy(body):
    with pytest.raises(ScoutError, match="no usable"):
        parse_jsonld(body, "https://events.example.org/calendar")


def test_ics_unfolds_and_preserves_explicit_timezone():
    body = b"""BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Lantern\r\n Walk\r\nDTSTART;TZID=America/New_York:20261031T190000\r\nLOCATION:Harbor Museum\r\nURL:https://events.example.org/lantern\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"""
    rows = parse_ics(body, "https://events.example.org/calendar.ics")
    assert rows[0]["title"] == "LanternWalk"
    assert rows[0]["start"] == "2026-10-31T19:00:00"
    assert rows[0]["timezone"] == "America/New_York"


def test_invalid_ics_timezone_is_not_healthy_empty():
    body = b"""BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Lantern Walk\r\nDTSTART;TZID=Not/AZone:20261031T190000\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"""
    with pytest.raises(ScoutError, match="no usable VEVENT"):
        parse_ics(body, "https://events.example.org/calendar.ics")


def test_rss_publish_date_is_never_event_date():
    body = b"""<rss><channel><item><title>Halloween Night</title>
      <link>https://events.example.org/halloween</link>
      <pubDate>Mon, 07 Sep 2026 12:00:00 GMT</pubDate>
      <startDate>2026-10-31</startDate></item></channel></rss>"""
    row = parse_rss(body, "https://events.example.org/feed")[0]
    assert row["published_at"].startswith("Mon, 07 Sep")
    assert row["start"] is None
    assert row["date_authority"] == "not_event_date"


@pytest.mark.parametrize(
    "mutate",
    [
        lambda m: m.update(mode="publish"),
        lambda m: m["places"].append(copy.deepcopy(m["places"][0])),
        lambda m: m["places"][0].update(needs_review=True),
        lambda m: m["sources"][0].update(status="pending"),
        lambda m: m["sources"][0].update(url="https://www.yelp.com/biz/x"),
        lambda m: m["sources"][0].update(cost_after_free_micros=1),
        lambda m: m["sources"][0].update(hard_fetch_ceiling_daily=None),
        lambda m: m["sources"][0].update(max_records=101),
        lambda m: m["sources"][0]["rights"].update(internal_use=False),
        lambda m: m["sources"][0]["rights"].update(store_derived=False),
        lambda m: m["sources"][0]["rights"].update(raw_redistribution_allowed=True),
        lambda m: m["sources"][0].update(rights_verified_at="2026-01-01"),
    ],
)
def test_manifest_fails_closed(mutate):
    value = manifest()
    mutate(value)
    with pytest.raises(ScoutError):
        validate_manifest(value, today=date(2026, 9, 7))


def test_private_network_destinations_are_rejected():
    def private(*_args, **_kwargs):
        return [(2, 1, 6, "", ("127.0.0.1", 443))]

    with pytest.raises(ScoutError, match="outside the public"):
        assert_public_host("events.example.org", resolver=private)


def test_live_fetch_pins_the_validated_ip():
    observed = {}

    class Response:
        status = 200

        def getheader(self, name):
            return {"Content-Type": "application/json", "Content-Length": "2"}.get(name)

        def read(self, _limit):
            return b"[]"

    class Connection:
        def request(self, method, target, headers):
            observed.update(method=method, target=target, headers=headers)

        def getresponse(self):
            return Response()

        def close(self):
            observed["closed"] = True

    def factory(host, address, timeout):
        observed.update(host=host, address=address, timeout=timeout)
        return Connection()

    def resolver(*_args, **_kwargs):
        return [(2, 1, 6, "", ("93.184.216.34", 443))]

    response = fetch_https(
        "https://events.example.org/feed?q=1",
        ["events.example.org"],
        resolver=resolver,
        connection_factory=factory,
    )
    assert response["body"] == b"[]"
    assert observed["host"] == "events.example.org"
    assert observed["address"] == "93.184.216.34"
    assert observed["target"] == "/feed?q=1"
    assert observed["closed"] is True


def test_pipeline_is_candidate_only_zero_cost_and_dedupes():
    value = manifest()
    body = json.dumps(
        [
            {
                "@type": "Event",
                "name": "Night at the Harbor",
                "startDate": "2026-10-31T19:00:00-04:00",
                "location": {"name": "Harbor Museum"},
            },
            {
                "@type": "Museum",
                "name": "Harbor Museum",
                "description": "Local maritime history.",
            },
            {
                "@type": "Event",
                "name": "Night at the Harbor",
                "startDate": "2026-10-31T19:00:00-04:00",
                "location": {"name": "Harbor Museum"},
            },
        ]
    ).encode()

    report = run(
        value,
        now=NOW,
        fetcher=lambda source: {
            "url": source["url"],
            "body": body,
            "content_type": "application/ld+json",
        },
    )
    assert report["summary"] == {
        "sources_fetched": 1,
        "sources_healthy_empty": 0,
        "sources_unavailable": 0,
        "event_candidates": 2,
        "discovery_leads": 0,
        "place_evidence_records": 1,
        "duplicate_candidate_groups": 1,
        "research_ready_places": 1,
        "paid_provider_calls": 0,
        "published_records": 0,
    }
    assert all(row["publishable"] is False for row in report["candidates"])
    assert all(row["verification_status"] == "candidate" for row in report["candidates"])
    assert all(
        row["duplicate_candidate"] is True for row in report["candidates"] if row["kind"] == "event"
    )
    assert all(
        row["duplicate_candidate"] is False
        for row in report["candidates"]
        if row["kind"] == "place"
    )
    assert report["editorial_packets"][0]["publishable"] is False


def test_multi_place_feed_does_not_fan_one_event_to_every_place():
    value = manifest()
    value["places"].append({**value["places"][0], "place_id": "place-2", "name": "Other Museum"})
    value["sources"][0]["place_ids"].append("place-2")
    body = b"""{"@type":"Event","name":"Night at the Harbor","startDate":"2026-10-31","location":{"name":"Harbor Museum"}}"""
    report = run(
        value,
        now=NOW,
        fetcher=lambda source: {"url": source["url"], "body": body},
    )
    assert [row["place_id"] for row in report["candidates"]] == ["place-1"]


def test_cross_host_candidate_url_is_rejected():
    body = b"""{"@type":"Museum","name":"Harbor Museum","description":"History.","url":"https://tracker.example.com/out"}"""
    report = run(
        manifest(),
        now=NOW,
        fetcher=lambda source: {"url": source["url"], "body": body},
    )
    assert report["candidates"] == []
    assert report["source_results"][0]["rejected_records"] == 1


def test_multi_place_rss_lead_stays_source_scoped():
    value = manifest("rss")
    value["places"].append({**value["places"][0], "place_id": "place-2", "name": "Other Museum"})
    value["sources"][0]["place_ids"].append("place-2")
    body = b"""<rss><channel><item><title>Fall calendar announced</title><link>https://events.example.org/fall</link></item></channel></rss>"""
    report = run(
        value,
        now=NOW,
        fetcher=lambda source: {
            "url": source["url"],
            "body": body,
            "content_type": "application/rss+xml",
        },
    )
    assert report["summary"]["discovery_leads"] == 1
    assert report["candidates"][0]["place_id"] is None
    assert report["candidates"][0]["identity_method"] == "source_scoped_discovery"


def test_html_login_page_cannot_be_a_healthy_empty_calendar():
    value = manifest("ics")
    report = run(
        value,
        now=NOW,
        fetcher=lambda source: {
            "url": source["url"],
            "body": b"<html>sign in</html>",
            "content_type": "text/html",
        },
    )
    assert report["complete"] is False
    assert report["source_results"][0]["status"] == "unavailable"


def test_record_ceiling_fails_source_instead_of_truncating():
    value = manifest()
    value["sources"][0]["max_records"] = 1
    body = json.dumps(
        [
            {"@type": "Museum", "name": "Harbor Museum"},
            {"@type": "Museum", "name": "Harbor Museum"},
        ]
    ).encode()
    report = run(
        value,
        now=NOW,
        fetcher=lambda source: {"url": source["url"], "body": body},
    )
    assert report["complete"] is False
    assert report["source_results"][0]["reason"].startswith("Source record ceiling")


def test_unavailable_source_is_not_a_healthy_empty_result():
    def fail(_source):
        raise ScoutError("Source returned HTTP 503")

    report = run(manifest(), now=NOW, fetcher=fail)
    assert report["summary"]["sources_unavailable"] == 1
    assert report["complete"] is False
    assert report["source_results"][0]["status"] == "unavailable"
    assert report["summary"]["event_candidates"] == 0


def test_healthy_empty_source_is_explicitly_fetched():
    report = run(
        manifest(),
        now=NOW,
        fetcher=lambda source: {
            "url": source["url"],
            "body": b"[]",
            "content_type": "application/json",
        },
    )
    assert report["source_results"] == [
        {
            "source_id": "harbor-official",
            "status": "healthy_empty",
            "records": 0,
            "accepted_records": 0,
            "rejected_records": 0,
        }
    ]
    assert report["summary"]["sources_unavailable"] == 0
    assert report["summary"]["sources_healthy_empty"] == 1
    assert report["complete"] is True
