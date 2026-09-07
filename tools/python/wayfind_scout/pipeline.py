"""Candidate-only scout pipeline; never publishes or writes to Wayfind."""

from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .fetch import fetch_https
from .parsers import parse_source
from .policy import ScoutError, normalized_host, validate_manifest


def _norm(value):
    text = unicodedata.normalize("NFKD", str(value or "")).casefold()
    return " ".join(re.findall(r"[a-z0-9]+", text))


def _fingerprint(record, place_id):
    return "|".join((_norm(record.get("title")), str(record.get("start") or ""), place_id))


def _default_fetch(source):
    return fetch_https(source["url"], source["approved_hosts"])


def _assigned_place_ids(item, source, places):
    mapped = [places[place_id] for place_id in source["place_ids"]]
    if item["kind"] == "event":
        identity_name = item.get("location_name")
    elif item["kind"] == "place":
        identity_name = item.get("title")
    else:
        identity_name = None
    if identity_name:
        matches = [row["place_id"] for row in mapped if _norm(row["name"]) == _norm(identity_name)]
        return matches if len(matches) == 1 else []
    return [mapped[0]["place_id"]] if len(mapped) == 1 else []


def _validate_response_shape(source, response):
    content_type = str(response.get("content_type") or "").casefold()
    if source["format"] == "ics" and "html" in content_type:
        raise ScoutError("ICS source returned HTML instead of a calendar")
    if source["format"] in ("rss", "atom") and "html" in content_type:
        raise ScoutError("RSS/Atom source returned HTML instead of XML")
    if source["format"] == "jsonld" and any(
        marker in content_type for marker in ("calendar", "rss", "atom", "xml")
    ):
        raise ScoutError("JSON-LD source returned an incompatible content type")


def run(manifest, *, fetcher=None, now=None):
    instant = now or datetime.now(timezone.utc)
    validate_manifest(manifest, today=instant.date())
    fetcher = fetcher or _default_fetch
    places = {row["place_id"]: row for row in manifest["places"]}
    records, source_results = [], []
    for source in manifest["sources"]:
        try:
            response = fetcher(source)
            body = response["body"]
            _validate_response_shape(source, response)
            parsed = parse_source(source["format"], body, response.get("url") or source["url"])
            if len(parsed) > source["max_records"]:
                raise ScoutError("Source record ceiling reached; refusing a partial result")
            source_results.append(
                {
                    "source_id": source["source_id"],
                    "status": "fetched" if parsed else "healthy_empty",
                    "records": len(parsed),
                }
            )
        except (ScoutError, UnicodeError, ValueError) as exc:
            source_results.append(
                {"source_id": source["source_id"], "status": "unavailable", "reason": str(exc)}
            )
            continue
        approved_hosts = {host.casefold().rstrip(".") for host in source["approved_hosts"]}
        accepted = []
        for item in parsed:
            try:
                if normalized_host(item["event_url"]) not in approved_hosts:
                    continue
            except (KeyError, ScoutError):
                continue
            if item["kind"] == "discovery_lead":
                assignments = [(None, "source_scoped_discovery")]
            else:
                assignments = [
                    (
                        place_id,
                        (
                            "exact_official_name"
                            if item.get("location_name") or item["kind"] == "place"
                            else "single_place_official_source"
                        ),
                    )
                    for place_id in _assigned_place_ids(item, source, places)
                ]
            for place_id, identity in assignments:
                records.append(
                    {
                        **item,
                        "place_id": place_id,
                        "source_id": source["source_id"],
                        "source_url": response.get("url") or source["url"],
                        "observed_at": instant.isoformat(),
                        "expires_at": (
                            instant + timedelta(days=source["retention_days"])
                        ).isoformat(),
                        "identity_method": identity,
                        "verification_status": "candidate",
                        "publishable": False,
                        "paid_calls": 0,
                        "rights": {
                            "display_allowed": source["rights"]["display_allowed"],
                            "raw_redistribution_allowed": False,
                            "commercial_api_allowed": False,
                        },
                    }
                )
                accepted.append(records[-1])
        source_results[-1]["accepted_records"] = len(accepted)
        source_results[-1]["rejected_records"] = len(parsed) - len(accepted)

    fingerprints = Counter(
        _fingerprint(row, row["place_id"])
        for row in records
        if row["kind"] == "event" and row.get("start")
    )
    duplicates = sorted(key for key, count in fingerprints.items() if count > 1)
    for row in records:
        row["duplicate_candidate"] = (
            row["kind"] == "event"
            and row.get("start") is not None
            and _fingerprint(row, row["place_id"]) in duplicates
        )
    packets = []
    for place_id, place in places.items():
        evidence = [
            row
            for row in records
            if row["place_id"] == place_id
            and row["kind"] == "place"
            and bool(row.get("description"))
        ]
        packets.append(
            {
                "place_id": place_id,
                "category": place.get("category"),
                "evidence_count": len(evidence),
                "evidence_sha256": sorted({row["evidence_sha256"] for row in evidence}),
                "description_status": "research_ready" if evidence else "insufficient_evidence",
                "editorial_action": "human_or_model_draft_then_human_review",
                "publishable": False,
            }
        )
    unavailable = sum(row["status"] == "unavailable" for row in source_results)
    return {
        "schema_version": 1,
        "mode": "dry_run",
        "complete": unavailable == 0,
        "captured_at": instant.isoformat(),
        "scope": {"places": len(places), "sources": len(manifest["sources"])},
        "summary": {
            "sources_fetched": sum(
                row["status"] in ("fetched", "healthy_empty") for row in source_results
            ),
            "sources_healthy_empty": sum(
                row["status"] == "healthy_empty" for row in source_results
            ),
            "sources_unavailable": unavailable,
            "event_candidates": sum(row["kind"] == "event" for row in records),
            "discovery_leads": sum(row["kind"] == "discovery_lead" for row in records),
            "place_evidence_records": sum(row["kind"] == "place" for row in records),
            "duplicate_candidate_groups": len(duplicates),
            "research_ready_places": sum(
                row["description_status"] == "research_ready" for row in packets
            ),
            "paid_provider_calls": 0,
            "published_records": 0,
        },
        "source_results": source_results,
        "candidates": records,
        "duplicate_fingerprints": duplicates,
        "editorial_packets": packets,
        "limitations": [
            "Candidates and duplicate groups require review; nothing was merged or published.",
            "RSS/Atom publication timestamps are discovery recency only, never event dates.",
            "Official structured data can be stale or wrong and requires re-verification.",
            "Research-ready means evidence exists, not that an editorial description is approved.",
            "Yelp and Tripadvisor pages are blocked; this pilot does not scrape them.",
        ],
    }


def load_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ScoutError("Manifest or fixture could not be read") from exc
