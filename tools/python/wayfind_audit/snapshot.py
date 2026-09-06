"""Strict input contracts and fixed read-only queries against Wayfind's schema."""

import hashlib
import json
from datetime import datetime
from pathlib import Path

PLACE_COLUMNS = [
    "place_id",
    "name",
    "lat",
    "lng",
    "metro",
    "category",
    "status",
    "excluded",
    "needs_review",
    "editorial_exists",
    "verified",
    "has_issues",
    "hook_chars",
    "why_chars",
    "sourced_facts",
]
LEDGER_COLUMNS = ["month", "sku", "used", "cap"]
JOB_COLUMNS = ["id", "job", "ran_at", "attempted", "succeeded", "failed"]
COLUMNS = {"places": PLACE_COLUMNS, "ledger": LEDGER_COLUMNS, "jobs": JOB_COLUMNS}
# SQL content lengths are conservative diagnostics; see the boundary note below.
QUERIES = {
    "places": """
select i.place_id, i.name, i.lat, i.lng, i.metro, i.category, i.status,
       i.excluded, i.needs_review, e.place_id is not null as editorial_exists,
       e.verified, cardinality(e.issues) > 0 as has_issues,
       coalesce(char_length(btrim(e.hook)), 0) as hook_chars,
       coalesce(char_length(btrim(e.why_here)), 0) as why_chars,
       (select count(*)::integer from jsonb_array_elements(
          case when jsonb_typeof(e.facts) = 'array' then e.facts else '[]'::jsonb end
        ) f where coalesce(f->>'claim','') <> ''
          and jsonb_typeof(f->'source') = 'string'
          and (f->>'source') ~ '^https?://') as sourced_facts
from public.wf_inventory i
left join public.wf_editorial e using (place_id)
order by i.place_id
""",
    "ledger": "select month, sku, used, cap from public.wf_spend_ledger order by month, sku",
    "jobs": """select id, job, ran_at, attempted, succeeded, failed
from public.wf_job_pulse where ran_at >= %(since)s and ran_at < %(until)s
order by ran_at, id""",
}
# This is a conservative content diagnostic, not a replacement publication gate.
# SQL character counts differ from JS trim/UTF-16 for rare Unicode boundary cases;
# reports label that limitation and never publish, suppress or repair source rows.


class AuditError(ValueError):
    """An input or execution failure that must never look like an empty report."""


def timestamp(value):
    if not isinstance(value, str):
        raise AuditError("Timestamp must be an ISO string with timezone")
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise AuditError("Invalid timestamp") from exc
    if dt.tzinfo is None:
        raise AuditError("Timestamp requires timezone")
    return dt


def integer(value, label, nullable=False):
    if value is None and nullable:
        return
    if type(value) is not int or value < 0:
        raise AuditError(f"{label} must be a nonnegative integer")


def validate(data):
    if not isinstance(data, dict) or data.get("schema_version") != 1:
        raise AuditError("Expected snapshot schema_version 1")
    if data.get("source_kind") not in ("production", "fixture"):
        raise AuditError("source_kind must be production or fixture")
    timestamp(data.get("captured_at"))
    if not isinstance(data.get("scope"), str) or not data["scope"].strip():
        raise AuditError("Explicit scope is required")
    if data.get("consistency") not in ("repeatable_read", "single_statement", "multi_request"):
        raise AuditError("Explicit snapshot consistency is required")
    since, until = timestamp(data.get("since")), timestamp(data.get("until"))
    if since >= until:
        raise AuditError("since must precede until")
    counts = data.get("expected_counts")
    if not isinstance(counts, dict) or set(counts) != set(COLUMNS):
        raise AuditError("Expected counts required for all three datasets")
    if set(data.get("datasets", {})) != set(COLUMNS):
        raise AuditError("places, ledger and jobs datasets are all required")
    for name, columns in COLUMNS.items():
        table = data["datasets"][name]
        if not isinstance(table, dict) or table.get("columns") != columns:
            raise AuditError(f"{name}: column contract mismatch")
        rows = table.get("rows")
        integer(counts[name], f"{name} expected count")
        if not isinstance(rows, list) or len(rows) != counts[name]:
            raise AuditError(f"{name}: incomplete input / expected count mismatch")
        if len(rows) > 100_000:
            raise AuditError(f"{name}: input exceeds 100000-row safety ceiling")
        seen = set()
        for row in rows:
            if not isinstance(row, list) or len(row) != len(columns):
                raise AuditError(f"{name}: malformed row")
            key = tuple(row[:2]) if name == "ledger" else row[0]
            if key is None or key == "" or key in seen:
                raise AuditError(f"{name}: missing or duplicate primary key")
            seen.add(key)
            if name == "places":
                for idx in (0, 1):
                    if not isinstance(row[idx], str) or not row[idx].strip():
                        raise AuditError("places: nonempty id and name required")
                for idx in (4, 5, 6):
                    if row[idx] is not None and not isinstance(row[idx], str):
                        raise AuditError("places: invalid text field")
                for idx in range(7, 12):
                    if row[idx] is not None and type(row[idx]) is not bool:
                        raise AuditError("places: invalid boolean")
                if type(row[9]) is not bool:
                    raise AuditError("places: editorial_exists is required")
                for idx in range(12, 15):
                    integer(row[idx], "editorial content count")
                for idx, bound in ((2, 90), (3, 180)):
                    v = row[idx]
                    if v is not None and (type(v) not in (int, float) or not -bound <= v <= bound):
                        raise AuditError("places: invalid coordinate")
            elif name == "ledger":
                import re

                if not isinstance(row[0], str) or not re.fullmatch(
                    r"\d{4}-(0[1-9]|1[0-2])", row[0]
                ):
                    raise AuditError("ledger: invalid month")
                if not isinstance(row[1], str) or not row[1].strip():
                    raise AuditError("ledger: missing SKU")
                integer(row[2], "used")
                integer(row[3], "cap", nullable=True)
            else:
                integer(row[0], "job id")
                if not isinstance(row[1], str) or not row[1].strip():
                    raise AuditError("jobs: job name required")
                if not since <= timestamp(row[2]) < until:
                    raise AuditError("jobs: row outside declared observation window")
                for v in row[3:]:
                    integer(v, "job counter")
    return data


def read_snapshot(path):
    path = Path(path)
    if path.stat().st_size > 100_000_000:
        raise AuditError("Snapshot exceeds 100 MB safety ceiling")
    raw = path.read_bytes()
    data = json.loads(
        raw, parse_constant=lambda x: (_ for _ in ()).throw(AuditError("Nonfinite JSON"))
    )
    return validate(data), hashlib.sha256(raw).hexdigest()


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Refuse overwriting input/evidence; a new run gets a new directory.
    with path.open("x", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2, allow_nan=False)
        handle.write("\n")


def render_export_sql():
    """A complete single-statement export; no migrations or writes."""
    queries = dict(QUERIES)
    queries["jobs"] = (
        queries["jobs"]
        .replace("%(since)s", "(select until - interval '7 days' from clock)")
        .replace("%(until)s", "(select until from clock)")
    )
    sql = "-- Read-only single-statement export. No editorial prose or credentials.\n"
    sql += "with clock as (select statement_timestamp() as until),\n"
    sql += ",\n".join(name + " as (" + query + ")" for name, query in queries.items())
    sql += "\nselect jsonb_build_object('schema_version',1,'source_kind','production',"
    sql += "'scope','all wf_inventory rows','consistency','single_statement',"
    sql += "'captured_at',(select until from clock),'since',(select until - interval '7 days' from clock),"
    sql += "'until',(select until from clock),'expected_counts',jsonb_build_object("
    sql += ",".join("'" + n + "',(select count(*) from " + n + ")" for n in COLUMNS)
    sql += "),'datasets',jsonb_build_object("
    sql += ",".join(
        "'" + name + "',jsonb_build_object('columns','" + json.dumps(cols) + "'::jsonb,'rows',"
        "(select coalesce(jsonb_agg(jsonb_build_array("
        + ",".join(cols)
        + ")), '[]'::jsonb) from "
        + name
        + "))"
        for name, cols in COLUMNS.items()
    )
    return sql + ")) as snapshot;\n"
