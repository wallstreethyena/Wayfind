import copy
import json
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from wayfind_audit.analyze import audit
from wayfind_audit.cli import main, markdown
from wayfind_audit.collect import collect
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
        "jobs": [[1, "test-job", "2026-09-04T12:00:00+00:00", 5, 3, 2]],
    }
    return {
        "schema_version": 1,
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
    assert result["jobs"][0]["success_pct"] is None


def test_idle_is_not_zero_output_failure():
    data = sample()
    data["datasets"]["jobs"]["rows"][0][3:] = [0, 0, 0]
    result = audit(data)["jobs"][0]
    assert result["idle_runs"] == 1 and result["zero_output_runs"] == 0
    assert result["success_pct"] is None


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
        lambda d: d.update(captured_at="2026-09-05"),
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
    path = tmp_path / "input.json"
    path.write_text(json.dumps(data))
    loaded, digest = read_snapshot(path)
    result = audit(loaded)
    result["input_sha256"] = digest
    assert "PRIVATE VENUE NAME" not in json.dumps(result)
    assert "PRIVATE VENUE NAME" not in markdown(result)


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
    data["datasets"]["jobs"]["rows"][0][3:] = [0, 0, 1]
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
        [1, "helper", "2026-09-01T12:00:00Z", 5, 0, 5],
        [2, "helper", "2026-09-05T07:00:00-04:00", 0, 0, 0],
    ]
    data["expected_counts"]["jobs"] = 2
    result = audit(data)
    assert result["jobs"][0]["zero_output_runs"] == 1
    assert result["recent_jobs"][0]["runs"] == 1
    assert result["recent_jobs"][0]["idle_runs"] == 1
    assert result["recent_jobs"][0]["zero_output_runs"] == 0
