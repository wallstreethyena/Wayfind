import copy
import json
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from wayfind_audit.analyze import audit
from wayfind_audit.cli import main, markdown
from wayfind_audit.collect import collect
from wayfind_audit.duplicate_reviews import distinct_review
from wayfind_audit.snapshot import COLUMNS, AuditError, read_snapshot, validate


def place(pid="a", name="Harbor Cafe", lat=27.0, lng=-82.0, **updates):
    row = dict(
        zip(
            COLUMNS["places"],
            [
                pid,
                name,
                lat,
                lng,
                "test-metro",
                "food",
                "OPERATIONAL",
                False,
                False,
                True,
                True,
                False,
                25,
                150,
                1,
            ],
            strict=True,
        )
    )
    row.update(updates)
    return [row[c] for c in COLUMNS["places"]]


def sample(places=None):
    datasets = {
        "places": [place()] if places is None else places,
        "ledger": [["2026-09", "text_pro", 7, 10]],
        "jobs": [[1, "test-job", "2026-09-04T12:00:00+00:00", 5, 3, 2, None]],
    }
    return {
        "schema_version": 2,
        "source_kind": "fixture",
        "scope": "synthetic cases only",
        "captured_at": "2026-09-05T12:00:00+00:00",
        "consistency": "single_statement",
        "since": "2026-09-01T00:00:00+00:00",
        "until": "2026-09-05T12:00:00+00:00",
        "datasets": {k: {"columns": list(COLUMNS[k]), "rows": v} for k, v in datasets.items()},
        "expected_counts": {k: len(v) for k, v in datasets.items()},
    }


def test_coverage_states_and_denominator():
    data = sample(
        [
            place("good"),
            place("missing", editorial_exists=False, verified=None),
            place("thin", why_chars=0),
            place("unverified", verified=False),
            place("flag", excluded=True),
            place("review", needs_review=True),
            place("closed", status="CLOSED_PERMANENTLY"),
            place("unknown", status=None),
            place("unknown_flag", excluded=None),
        ]
    )
    row = audit(data)["coverage"][0]
    assert row["records"] == 9
    assert row["operational_unflagged"] == 4
    assert row["verified_with_content"] == 1
    assert row["missing_editorial_row"] == 1
    assert row["verified_but_thin"] == 1
    assert row["unverified_editorial"] == 1
    assert row["flagged"] == 2 and row["closed"] == 1 and row["unknown"] == 2
    assert row["editorial_content_pct"] == 25


def test_absence_not_zero_and_empty_complete_data():
    data = sample([])
    data["datasets"]["ledger"]["rows"][0][3] = None
    report = audit(data)
    assert report["coverage"] == []
    assert report["ledger"][0]["utilization_pct"] is None
    assert report["costs"]["actual_usd"] is None
    assert report["costs"]["savings_usd"] is None


def test_zero_cap_and_inconsistent_counters():
    data = sample()
    data["datasets"]["ledger"]["rows"][0][3] = 0
    data["datasets"]["jobs"]["rows"][0][4] = 9
    result = audit(data)
    assert result["ledger"][0]["state"] == "above_recorded_cap"
    assert result["ledger"][0]["utilization_pct"] is None
    assert result["jobs"][0]["inconsistent_counter_runs"] == 1
    assert result["jobs"][0]["pulse_succeeded_pct"] is None


def test_idle_is_not_zero_pulse_succeeded_failure():
    data = sample()
    data["datasets"]["jobs"]["rows"][0][3:6] = [0, 0, 0]
    result = audit(data)["jobs"][0]
    assert result["idle_runs"] == 1 and result["zero_pulse_succeeded_runs"] == 0
    assert result["pulse_succeeded_pct"] is None


@pytest.mark.parametrize(
    "mutate",
    [
        lambda d: d["expected_counts"].update(places=2),
        lambda d: d["datasets"].pop("ledger"),
        lambda d: d["datasets"]["places"]["columns"].reverse(),
        lambda d: d["datasets"]["places"]["rows"][0].__setitem__(2, float("nan")),
        lambda d: d["datasets"]["places"]["rows"][0].__setitem__(3, 200),
        lambda d: d["datasets"]["places"]["rows"][0].__setitem__(7, "false"),
        lambda d: d["datasets"]["ledger"]["rows"][0].__setitem__(2, -1),
        lambda d: d["datasets"]["jobs"]["rows"][0].__setitem__(2, "2027-01-01T00:00:00Z"),
        lambda d: d["datasets"]["jobs"]["rows"][0].__setitem__(6, 12),
        lambda d: d.update(captured_at="2026-09-05"),
        lambda d: d.update(schema_version=1),
        lambda d: d.update(source_kind="unknown"),
    ],
)
def test_bad_inputs_fail_loudly(mutate):
    data = sample()
    mutate(data)
    with pytest.raises(AuditError):
        validate(data)


def test_duplicate_input_ids_rejected():
    with pytest.raises(AuditError, match="duplicate"):
        validate(sample([place(), place()]))


def test_duplicate_nearby_not_same_chain_far_away():
    data = sample(
        [
            place("a"),
            place("b", lat=27.0001),
            place("c", lat=28),
            place("d", name="Another Shop"),
            place("e", category="hotels"),
            place("missing", lat=None),
        ]
    )
    result = audit(data)["duplicates"]
    assert [(r["left_id"], r["right_id"]) for r in result["candidate_pairs"]] == [("a", "b")]
    assert result["skipped_records"] == 1
    assert result["candidate_pairs"][0]["action"] == "review_only"


def test_duplicate_normalization_and_date_line():
    result = audit(
        sample(
            [
                place("a", name="Café & Bar", lat=0, lng=179.9998),
                place("b", name="Cafe and Bar", lat=0, lng=-179.9998),
            ]
        )
    )
    pairs = result["duplicates"]["candidate_pairs"]
    assert len(pairs) == 1 and 40 < pairs[0]["distance_m"] < 50


def test_pair_cap_never_reports_partial_success():
    with pytest.raises(AuditError, match="ceiling"):
        audit(sample([place("a"), place("b"), place("c")]), max_pairs=1)


def test_cli_real_report_and_no_overwrite(tmp_path, capsys):
    path = tmp_path / "input.json"
    path.write_text(json.dumps(sample()))
    dest = tmp_path / "out"
    assert main(["report", "--input", str(path), "--out", str(dest)]) == 0
    report = json.loads((dest / "report.json").read_text())
    assert report["source_kind"] == "fixture"
    assert len(report["input_sha256"]) == 64
    assert "SYNTHETIC DEMO" in (dest / "report.md").read_text()
    assert main(["report", "--input", str(path), "--out", str(dest)]) == 2
    assert "already exists" in capsys.readouterr().err


def test_broken_export_cannot_create_report(tmp_path):
    data = sample()
    data["expected_counts"]["places"] = 3
    path = tmp_path / "bad.json"
    path.write_text(json.dumps(data))
    dest = tmp_path / "out"
    assert main(["report", "--input", str(path), "--out", str(dest)]) == 2
    assert not dest.exists()


def test_input_hash_and_no_source_names_in_report(tmp_path):
    data = sample([place(name="PRIVATE VENUE NAME")])
    data["datasets"]["jobs"]["rows"][0][6] = "PRIVATE PULSE DETAIL"
    path = tmp_path / "input.json"
    path.write_text(json.dumps(data))
    loaded, digest = read_snapshot(path)
    result = audit(loaded)
    result["input_sha256"] = digest
    assert "PRIVATE VENUE NAME" not in json.dumps(result)
    assert "PRIVATE VENUE NAME" not in markdown(result)
    assert "PRIVATE PULSE DETAIL" not in json.dumps(result)
    assert "PRIVATE PULSE DETAIL" not in markdown(result)


def test_missing_configuration_is_an_error(monkeypatch):
    monkeypatch.delenv("WAYFIND_AUDIT_DATABASE_URL", raising=False)
    with pytest.raises(AuditError, match="required"):
        collect()


def test_collect_fixed_queries_readonly_and_dsn_not_logged(monkeypatch):
    monkeypatch.setenv("WAYFIND_AUDIT_DATABASE_URL", "SECRET-DSN")
    with patch("psycopg.connect", side_effect=RuntimeError("SECRET-DSN")):
        with pytest.raises(AuditError) as error:
            collect()
        assert "SECRET-DSN" not in str(error.value)


def test_collect_uses_snapshot_and_detects_truncation(monkeypatch):
    monkeypatch.setenv("WAYFIND_AUDIT_DATABASE_URL", "SECRET-DSN")
    cursor = MagicMock()
    cursor.__enter__.return_value = cursor
    cursor.fetchmany.side_effect = [[place("a"), place("b")]]
    connection = MagicMock()
    connection.__enter__.return_value = connection
    connection.cursor.return_value = cursor
    with patch("psycopg.connect", return_value=connection):
        with pytest.raises(AuditError, match="ceiling"):
            collect(max_rows=1)
    assert "READ ONLY" in cursor.execute.call_args_list[0].args[0]
    assert all(
        not call.args[0].lstrip().lower().startswith(("insert", "update", "delete"))
        for call in cursor.execute.call_args_list
    )


def test_collect_consumes_multiple_batches(monkeypatch):
    monkeypatch.setenv("WAYFIND_AUDIT_DATABASE_URL", "SECRET-DSN")
    cursor = MagicMock()
    cursor.__enter__.return_value = cursor
    cursor.fetchmany.side_effect = [[place("a")], [place("b")], [], [], []]
    connection = MagicMock()
    connection.__enter__.return_value = connection
    connection.cursor.return_value = cursor
    with patch("psycopg.connect", return_value=connection):
        result = collect()
    assert result["expected_counts"] == {"places": 2, "ledger": 0, "jobs": 0}
    assert result["consistency"] == "repeatable_read"
    assert datetime.fromisoformat(result["since"]) < datetime.fromisoformat(result["until"])


def test_deterministic_result_and_no_mutation():
    data = sample([place("a"), place("b")])
    before = copy.deepcopy(data)
    assert audit(data) == audit(data)
    assert data == before


def test_export_sql_matches_canonical_contract():
    from pathlib import Path

    from wayfind_audit.snapshot import render_export_sql

    assert Path(__file__).parents[1].joinpath("sql/snapshot.sql").read_text() == render_export_sql()


def test_spatial_join_matches_bruteforce():
    import math
    import random

    random.seed(81)
    rows = [
        place(
            str(i), lat=27 + random.uniform(-0.004, 0.004), lng=-82 + random.uniform(-0.004, 0.004)
        )
        for i in range(80)
    ]
    expected = set()
    for a in rows:
        for b in rows:
            if a[0] >= b[0]:
                continue
            lat1, lat2 = map(math.radians, [a[2], b[2]])
            dlat = lat1 - lat2
            dlng = math.radians(a[3] - b[3])
            chord = (
                2
                * 6371000
                * math.sqrt(
                    math.sin(dlat / 2) ** 2
                    + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
                )
            )
            if chord <= 150:
                expected.add((a[0], b[0]))
    result = audit(sample(rows))["duplicates"]
    assert {(p["left_id"], p["right_id"]) for p in result["candidate_pairs"]} == expected
    assert result["compared_pairs"] == len(expected) > 0


def test_failure_without_attempts_is_not_idle():
    data = sample()
    data["datasets"]["jobs"]["rows"][0][3:6] = [0, 0, 1]
    result = audit(data)
    assert result["jobs"][0]["idle_runs"] == 0
    assert result["jobs"][0]["zero_attempt_failure_runs"] == 1
    assert result["recent_jobs"][0]["zero_attempt_failure_runs"] == 1


def test_excluded_duplicate_retained_outside_active_queue():
    result = audit(sample([place("a"), place("b", excluded=True, status="EXCLUDED")]))
    assert result["duplicates"]["candidate_pairs"] == []
    assert len(result["duplicates"]["inactive_pairs"]) == 1
    assert result["input_counts"]["places"] == 2


def test_recent_jobs_excludes_old_failures_and_compares_timezones():
    data = sample()
    data["datasets"]["jobs"]["rows"] = [
        [1, "helper", "2026-09-01T12:00:00Z", 5, 0, 5, None],
        [2, "helper", "2026-09-05T07:00:00-04:00", 0, 0, 0, None],
    ]
    data["expected_counts"]["jobs"] = 2
    result = audit(data)
    assert result["jobs"][0]["zero_pulse_succeeded_runs"] == 1
    assert result["recent_jobs"][0]["runs"] == 1
    assert result["recent_jobs"][0]["idle_runs"] == 1
    assert result["recent_jobs"][0]["zero_pulse_succeeded_runs"] == 0


def test_distinct_restaurants_review_is_identity_scoped():
    rows = [
        place("ChIJJ-YCrau32YgRrR2M1W_RPF4", name="Sadelle's Coconut Grove"),
        place("ChIJgW_5qc632YgRJp09efZfDEg", name="Isabelle's Coconut Grove"),
    ]
    result = audit(sample(rows))["duplicates"]
    assert result["candidate_pairs"] == []
    assert len(result["reviewed_distinct_pairs"]) == 1
    rows[1][1] = "Sadelle's Coconut Grove"
    result = audit(sample(rows))["duplicates"]
    assert len(result["candidate_pairs"]) == 1
    assert result["reviewed_distinct_pairs"] == []


def test_ephesus_locations_review_is_symmetric_and_identity_scoped():
    first_id = "ChIJNblf529rw4gRV-g7pW90fGI"
    second_id = "ChIJj1pZOABrw4gRDH0EH8jmQa4"
    first_name = "ephesus mediterranean delights"
    second_name = "ephesus mediterranean delights ii"

    assert distinct_review(first_id, second_id, first_name, second_name, "food")
    assert distinct_review(second_id, first_id, second_name, first_name, "food")
    assert (
        distinct_review(first_id, second_id, first_name, "ephesus mediterranean delights", "food")
        is None
    )
    assert distinct_review(first_id + "x", second_id, first_name, second_name, "food") is None
    assert distinct_review(first_id, second_id, first_name, second_name, "restaurant") is None

    result = audit(
        sample(
            [
                place(first_id, name="Ephesus Mediterranean Delights"),
                place(second_id, name="Ephesus Mediterranean Delights II"),
            ]
        )
    )["duplicates"]
    assert result["candidate_pairs"] == []
    assert [(p["left_id"], p["right_id"]) for p in result["reviewed_distinct_pairs"]] == [
        (first_id, second_id)
    ]


def test_photo_repair_classification_is_not_reported_as_restoration_and_partial_is_explicit():
    data = sample()
    data["datasets"]["jobs"]["rows"] = [
        [
            1,
            "photo-repair",
            "2026-09-05T11:30:00Z",
            475,
            475,
            0,
            "photos: recovered=0 classified=475 blocked=0 released=0 failed=0 "
            "allowance=1061/2000 batches=19 — PARTIAL: stopped on its own 225s budget "
            "after 475/500 attempted",
        ]
    ]
    report = audit(data)
    outcome = report["job_outcomes"]["latest_24_hours"]["jobs"][0]
    assert outcome["totals"]["recovered"] == 0
    assert outcome["totals"]["classified"] == 475
    assert outcome["partial_runs"] == 1
    assert outcome["latest"]["outcome"]["attempted_limit"] == 500
    assert outcome["latest"]["outcome"]["work_budget_seconds"] == 225
    report["input_sha256"] = "0" * 64
    assert "PARTIAL" in markdown(report)
    assert "classified=475" in markdown(report)


def test_photo_monitor_pulse_failure_is_alert_state_not_broken_image_count():
    data = sample()
    data["datasets"]["jobs"]["rows"] = [
        [
            1,
            "photo-monitor",
            "2026-09-05T10:00:00Z",
            500,
            0,
            500,
            "photos: placeholder-rate 93% of 500 probes | open=475 (+475 this run) "
            "| key=photos:probe-no-spend:2026-09-05",
        ],
        [
            2,
            "photo-monitor",
            "2026-09-05T11:00:00Z",
            500,
            500,
            0,
            "photos: ongoing placeholder-rate 93% of 500 probes | open=475 (+0 this run) "
            "| key=photos:probe-no-spend:2026-09-05",
        ],
    ]
    data["expected_counts"]["jobs"] = 2
    outcome = audit(data)["job_outcomes"]["latest_24_hours"]["jobs"][0]
    assert outcome["totals"]["new_alert_runs"] == 1
    assert outcome["totals"]["deduplicated_alert_runs"] == 1
    assert outcome["latest"]["outcome"] == {
        "sampled": 500,
        "reported_placeholder_rate_pct": 93,
        "alert_state": "deduplicated_alert",
    }


def test_place_photo_rejections_are_not_worker_errors():
    data = sample()
    data["datasets"]["jobs"]["rows"] = [
        [
            1,
            "place-photos",
            "2026-09-05T11:00:00Z",
            625,
            22,
            603,
            "place-photos: 22 active (12 vaulted), 603 rejected, 0 failed, 0 deferred "
            "(at-risk scanned 625)",
        ]
    ]
    outcome = audit(data)["job_outcomes"]["full_window"]["jobs"][0]
    assert outcome["totals"]["accepted"] == 22
    assert outcome["totals"]["valid_rejections"] == 603
    assert outcome["totals"]["worker_errors"] == 0


@pytest.mark.parametrize("note", [None, "photos: recovered=bad", "unrelated summary"])
def test_missing_or_malformed_domain_note_stays_unknown(note):
    data = sample()
    data["datasets"]["jobs"]["rows"] = [
        [1, "photo-repair", "2026-09-05T11:00:00Z", 25, 25, 0, note]
    ]
    outcome = audit(data)["job_outcomes"]["full_window"]["jobs"][0]
    assert outcome["interpreted_runs"] == 0
    assert outcome["unknown_runs"] == 1
    assert outcome["totals"] is None
    assert outcome["partial_runs"] is None
    assert outcome["latest"]["outcome"] is None


def test_domain_outcomes_distinguish_full_window_from_latest_24_hours():
    data = sample()
    note = "place-photos: 0 active (0 vaulted), 25 rejected, 0 failed, 0 deferred"
    data["datasets"]["jobs"]["rows"] = [
        [1, "place-photos", "2026-09-03T11:00:00Z", 25, 0, 25, note],
        [2, "place-photos", "2026-09-05T11:00:00Z", 25, 0, 25, note],
    ]
    data["expected_counts"]["jobs"] = 2
    outcomes = audit(data)["job_outcomes"]
    assert outcomes["full_window"]["jobs"][0]["runs"] == 2
    assert outcomes["latest_24_hours"]["jobs"][0]["runs"] == 1
    assert outcomes["full_window"]["window"] != outcomes["latest_24_hours"]["window"]


def test_photo_monitor_rejects_impossible_reported_placeholder_rate():
    data = sample()
    data["datasets"]["jobs"]["rows"] = [
        [
            1,
            "photo-monitor",
            "2026-09-05T11:00:00Z",
            500,
            500,
            0,
            "photos: placeholder-rate 101% of 500 probes | key=photos:test:2026-09-05",
        ]
    ]
    latest = audit(data)["job_outcomes"]["full_window"]["jobs"][0]["latest"]
    assert latest["interpretation"] == "unknown"
    assert latest["reason"] == "invalid_domain_value"
    assert latest["outcome"] is None


def test_place_photos_rejects_more_vaulted_than_accepted():
    data = sample()
    data["datasets"]["jobs"]["rows"] = [
        [
            1,
            "place-photos",
            "2026-09-05T11:00:00Z",
            1,
            1,
            0,
            "place-photos: 1 active (2 vaulted), 0 rejected, 0 failed, 0 deferred",
        ]
    ]
    latest = audit(data)["job_outcomes"]["full_window"]["jobs"][0]["latest"]
    assert latest["interpretation"] == "unknown"
    assert latest["reason"] == "invalid_domain_value"


@pytest.mark.parametrize(
    ("worklist_text", "state", "partial"),
    [
        (
            "at-risk PARTIAL (deadline reached while paging; 5/100)",
            "partial",
            True,
        ),
        (
            "at-risk UNAVAILABLE after 100 scanned "
            "(wf_photo_at_risk continuation read failed; partial page retained)",
            "unavailable_after_partial_scan",
            True,
        ),
        (
            "at-risk UNAVAILABLE (wf_photo_at_risk read failed — general scan only)",
            "unavailable",
            None,
        ),
        ("at-risk PARTIAL (ambiguous producer text)", "unknown", None),
    ],
)
def test_place_photos_worklist_completeness_uses_known_producer_strings(
    worklist_text, state, partial
):
    data = sample()
    data["datasets"]["jobs"]["rows"] = [
        [
            1,
            "place-photos",
            "2026-09-05T11:00:00Z",
            25,
            0,
            25,
            "place-photos: 0 active (0 vaulted), 25 rejected, 0 failed, 0 deferred "
            f"({worklist_text}, replay 0/0, general scanned 25, 0 already covered)",
        ]
    ]
    summary = audit(data)["job_outcomes"]["full_window"]["jobs"][0]
    outcome = summary["latest"]["outcome"]
    assert outcome["worklist_state"] == state
    assert outcome["partial"] is partial
    assert summary["partial_runs"] == (1 if partial is True else None)
