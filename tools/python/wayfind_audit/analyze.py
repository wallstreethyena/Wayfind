"""Batch analytical joins; no network, writes, scoring changes or merges."""

import math
import re
import unicodedata
from datetime import timedelta
from difflib import SequenceMatcher

import duckdb

from .duplicate_reviews import distinct_review
from .snapshot import AuditError, timestamp, validate


def normalize_name(name):
    value = unicodedata.normalize("NFKD", name).casefold().replace("&", " and ")
    value = "".join(c for c in value if not unicodedata.combining(c))
    return " ".join(re.findall(r"\w+", value, flags=re.UNICODE))


def dict_rows(db, query):
    cursor = db.execute(query)
    keys = [d[0] for d in cursor.description]
    return [dict(zip(keys, row, strict=True)) for row in cursor.fetchall()]


def insert_rows(db, table, rows):
    # Parameterized batches amortize Python/SQL overhead without loading extensions
    # or constructing SQL from record contents. Table names are internal constants.
    if table not in ("places", "ledger", "jobs", "points"):
        raise AuditError("Unknown internal table")
    for offset in range(0, len(rows), 500):
        batch = rows[offset : offset + 500]
        placeholders = "(" + ",".join("?" for _ in batch[0]) + ")"
        db.execute(
            "insert into " + table + " values " + ",".join(placeholders for _ in batch),
            [value for row in batch for value in row],
        )


def audit(snapshot, max_pairs=100_000):
    validate(snapshot)
    if type(max_pairs) is not int or not 1 <= max_pairs <= 1_000_000:
        raise AuditError("max_pairs must be 1..1000000")
    with duckdb.connect(":memory:") as db:
        db.execute("SET memory_limit='512MB'")
        db.execute("SET threads=2")
        db.execute("SET enable_external_access=false")
        db.execute("SET max_temp_directory_size='0B'")
        db.execute("""create table places (
          place_id varchar, name varchar, lat double, lng double, metro varchar,
          category varchar, status varchar, excluded boolean, needs_review boolean,
          editorial_exists boolean, verified boolean, has_issues boolean,
          hook_chars integer, why_chars integer, sourced_facts integer)""")
        db.execute("create table ledger (month varchar, sku varchar, used bigint, cap bigint)")
        db.execute("""create table jobs (id bigint, job varchar, ran_at varchar,
          attempted bigint, succeeded bigint, failed bigint)""")
        db.execute("BEGIN TRANSACTION")
        for table in ("places", "ledger", "jobs"):
            rows = snapshot["datasets"][table]["rows"]
            if rows:
                insert_rows(db, table, rows)
        db.execute("COMMIT")
        # Unknown flags never count as audited eligibility. This is inventory-state
        # coverage, NOT per-rail eligibility or all possible editorial sources.
        db.execute("""create view states as select *,
          case when excluded is true or needs_review is true then 'flagged'
            when status in ('CLOSED_PERMANENTLY','CLOSED_TEMPORARILY') then 'closed'
            when status = 'OPERATIONAL' and excluded is false and needs_review is false
              then 'operational_unflagged' else 'unknown' end as inventory_state,
          case when not editorial_exists then 'missing_row'
            when verified is not true or has_issues is true then 'unverified_or_flagged'
            when hook_chars < 20 or why_chars < 120 or sourced_facts < 1 then 'verified_but_thin'
            else 'verified_with_content' end as editorial_state
          from places""")
        coverage = dict_rows(
            db,
            """select coalesce(nullif(metro,''),'UNKNOWN') as metro,
          coalesce(nullif(category,''),'UNKNOWN') as category,
          count(*) as records,
          count(*) filter(where inventory_state='operational_unflagged') as operational_unflagged,
          count(*) filter(where inventory_state='flagged') as flagged,
          count(*) filter(where inventory_state='closed') as closed,
          count(*) filter(where inventory_state='unknown') as unknown,
          count(*) filter(where inventory_state='operational_unflagged' and editorial_state='missing_row') as missing_editorial_row,
          count(*) filter(where inventory_state='operational_unflagged' and editorial_state='unverified_or_flagged') as unverified_editorial,
          count(*) filter(where inventory_state='operational_unflagged' and editorial_state='verified_but_thin') as verified_but_thin,
          count(*) filter(where inventory_state='operational_unflagged' and editorial_state='verified_with_content') as verified_with_content
          from states group by 1,2 order by missing_editorial_row desc, metro, category""",
        )
        for row in coverage:
            denominator = row["operational_unflagged"]
            row["editorial_content_pct"] = (
                round(100 * row["verified_with_content"] / denominator, 2) if denominator else None
            )
        content_flags = dict_rows(
            db,
            """select place_id, editorial_state,
          hook_chars, why_chars, sourced_facts from states
          where editorial_state='verified_but_thin' order by place_id""",
        )
        ledger = dict_rows(
            db,
            """select *,
          case when cap is null then 'unknown_cap'
            when used > cap then 'above_recorded_cap'
            when used = cap then 'at_recorded_cap' else 'below_recorded_cap' end as state
          from ledger order by month desc, sku""",
        )
        for row in ledger:
            row["utilization_pct"] = (
                round(100 * row["used"] / row["cap"], 2) if row["cap"] else None
            )
            row["recorded_remaining"] = (
                max(0, row["cap"] - row["used"]) if row["cap"] is not None else None
            )
        jobs = dict_rows(
            db,
            """select job, count(*) as runs,
          sum(attempted) as attempted, sum(succeeded) as succeeded, sum(failed) as failed,
          count(*) filter(where attempted > 0 and succeeded = 0) as zero_output_runs,
          count(*) filter(where attempted = 0 and succeeded = 0 and failed = 0) as idle_runs,
          count(*) filter(where attempted = 0 and failed > 0) as zero_attempt_failure_runs,
          count(*) filter(where succeeded + failed <> attempted) as inconsistent_counter_runs,
          min(ran_at) as first_run, max(ran_at) as last_run
          from jobs group by job order by zero_output_runs desc, job""",
        )
        for row in jobs:
            row["success_pct"] = (
                round(100 * row["succeeded"] / row["attempted"], 2)
                if row["attempted"] and not row["inconsistent_counter_runs"]
                else None
            )
        recent_since = (timestamp(snapshot["until"]) - timedelta(hours=24)).isoformat()
        recent_jobs = dict_rows(
            db,
            """select job, count(*) as runs,
          sum(attempted) as attempted, sum(succeeded) as succeeded, sum(failed) as failed,
          count(*) filter(where attempted > 0 and succeeded = 0) as zero_output_runs,
          count(*) filter(where attempted = 0 and succeeded = 0 and failed = 0) as idle_runs,
          count(*) filter(where attempted = 0 and failed > 0) as zero_attempt_failure_runs
          from jobs where cast(ran_at as timestamptz) >= cast('"""
            + recent_since
            + """' as timestamptz)
          group by job order by job""",
        )
        duplicate_result = duplicates(db, snapshot["datasets"]["places"]["rows"], max_pairs)
        return {
            "schema_version": 1,
            "source_kind": snapshot["source_kind"],
            "scope": snapshot["scope"],
            "captured_at": snapshot["captured_at"],
            "consistency": snapshot["consistency"],
            "observation_window": {"since": snapshot["since"], "until": snapshot["until"]},
            "input_counts": snapshot["expected_counts"],
            "coverage": coverage,
            "editorial_content_flags": content_flags,
            "ledger": ledger,
            "jobs": jobs,
            "recent_jobs": recent_jobs,
            "recent_since": max(timestamp(snapshot["since"]), timestamp(recent_since)).isoformat(),
            "duplicates": duplicate_result,
            "costs": {
                "actual_usd": None,
                "savings_usd": None,
                "reason": "Ledger units are grants, not invoices or per-request billing. No cost estimates inferred.",
            },
            "limitations": [
                "Coverage measures wf_inventory state and joined wf_editorial only. Owner/legacy editorial and per-rail predicates are not included.",
                "Content lengths are a conservative SQL diagnostic; Unicode trim/UTF-16 boundary cases can differ from the JavaScript publisher.",
                "Ledger cap is the stored cap, not proof of current effective policy, remaining free quota or paid cost.",
                "Zero-output job runs are observations, not proof of wasted paid calls or current incidents.",
                "Duplicate candidates require human review. Nearby same-name businesses may be distinct.",
                "Fuzzy matching only compares named, located records in the same known category within 150 meters.",
                "Raw snapshot content is local and subject to its source retention policy; reports contain IDs and aggregates, not source names or coordinates.",
            ],
        }


def duplicates(db, rows, max_pairs):
    points = []
    missing = 0
    for row in rows:
        place_id, name, lat, lng, _, category = row[:6]
        norm = normalize_name(name)
        if lat is None or lng is None or not category or len(norm) < 3:
            missing += 1
            continue
        la, lo = math.radians(lat), math.radians(lng)
        # Earth-centered cells avoid longitude/date-line/polar boundary bugs.
        x, y, z = (
            6371000 * math.cos(la) * math.cos(lo),
            6371000 * math.cos(la) * math.sin(lo),
            6371000 * math.sin(la),
        )
        points.append(
            [
                place_id,
                norm,
                category,
                x,
                y,
                z,
                math.floor(x / 150),
                math.floor(y / 150),
                math.floor(z / 150),
            ]
        )
    db.execute("""create table points(id varchar, name varchar, category varchar,
        x double,y double,z double,cx bigint,cy bigint,cz bigint)""")
    if points:
        db.execute("BEGIN TRANSACTION")
        insert_rows(db, "points", points)
        db.execute("COMMIT")
    query = """with neighbors as (
      select p.*, p.cx+dx as nx, p.cy+dy as ny, p.cz+dz as nz
      from points p
      cross join generate_series(-1,1) ox(dx)
      cross join generate_series(-1,1) oy(dy)
      cross join generate_series(-1,1) oz(dz)
    )
    select a.id,b.id,a.name,b.name,
      sqrt(pow(a.x-b.x,2)+pow(a.y-b.y,2)+pow(a.z-b.z,2)) as distance
      from neighbors a join points b on a.id < b.id and a.category=b.category
      and a.nx=b.cx and a.ny=b.cy and a.nz=b.cz
      where pow(a.x-b.x,2)+pow(a.y-b.y,2)+pow(a.z-b.z,2)<=22500
      order by a.id,b.id"""
    candidates = db.execute(query + " limit ?", [max_pairs + 1]).fetchall()
    if len(candidates) > max_pairs:
        raise AuditError(
            "Duplicate comparison ceiling reached; refusing a partial report. Increase --max-pairs or explicitly scope input."
        )
    out = []
    inactive = []
    reviewed = []
    categories = {r[0]: r[5] for r in rows}
    state = {r[0]: (r[6], r[7]) for r in rows}
    for left, right, a, b, distance in candidates:
        # Symmetric ratio avoids SequenceMatcher's argument-order sensitivity.
        ratio = min(
            SequenceMatcher(None, a, b, autojunk=False).ratio(),
            SequenceMatcher(None, b, a, autojunk=False).ratio(),
        )
        if ratio >= 0.92:
            review = distinct_review(left, right, a, b, categories[left])
            if review:
                reviewed.append({"left_id": left, "right_id": right, **review})
                continue
            # Retain inactive pairs as evidence, but do not send deliberately
            # excluded records back to the active duplicate review queue.
            target = (
                inactive
                if any(
                    state[x][1] is True
                    or state[x][0] in ("EXCLUDED", "CLOSED_PERMANENTLY", "CLOSED_TEMPORARILY")
                    for x in (left, right)
                )
                else out
            )
            target.append(
                {
                    "left_id": left,
                    "right_id": right,
                    "name_similarity": round(ratio, 4),
                    "distance_m": round(distance, 1),
                    "reason": "same_normalized_name" if a == b else "similar_name",
                    "action": "review_only",
                }
            )
    return {
        "candidate_pairs": out,
        "inactive_pairs": inactive,
        "reviewed_distinct_pairs": reviewed,
        "compared_pairs": len(candidates),
        "located_named_records": len(points),
        "skipped_records": missing,
        "radius_m": 150,
        "minimum_name_similarity": 0.92,
        "complete_within_scope": True,
    }
