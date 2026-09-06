"""Direct database collection: fixed SELECTs in one read-only transaction."""

import os
from datetime import datetime, timedelta, timezone

from .snapshot import COLUMNS, QUERIES, AuditError, validate


def collect(days=7, max_rows=100_000):
    if not 1 <= days <= 30 or not 1 <= max_rows <= 100_000:
        raise AuditError("days must be 1..30; max_rows must be 1..100000")
    dsn = os.environ.get("WAYFIND_AUDIT_DATABASE_URL", "").strip()
    if not dsn:
        raise AuditError("WAYFIND_AUDIT_DATABASE_URL is required for collection")
    try:
        import psycopg
    except ImportError as exc:
        raise AuditError("Install live extra: uv sync --locked --extra live") from exc
    until = datetime.now(timezone.utc)
    since = until - timedelta(days=days)
    result = {
        "schema_version": 1,
        "source_kind": "production",
        "scope": "all wf_inventory rows",
        "captured_at": until.isoformat(),
        "since": since.isoformat(),
        "until": until.isoformat(),
        "consistency": "repeatable_read",
        "datasets": {},
        "expected_counts": {},
    }
    try:
        # Environment-supplied credentials never enter logs or exception messages.
        with psycopg.connect(dsn, connect_timeout=10, sslmode="require") as conn:
            with conn.cursor() as cur:
                cur.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
                cur.execute("SET LOCAL statement_timeout = '30s'")
                cur.execute("SET LOCAL idle_in_transaction_session_timeout = '60s'")
                for name, query in QUERIES.items():
                    cur.execute(
                        query + " LIMIT %(row_limit)s",
                        {"since": since, "until": until, "row_limit": max_rows + 1},
                    )
                    rows = []
                    while batch := cur.fetchmany(1000):
                        rows.extend(
                            [
                                [v.isoformat() if isinstance(v, datetime) else v for v in r]
                                for r in batch
                            ]
                        )
                        if len(rows) > max_rows:
                            raise AuditError(
                                f"{name}: row ceiling reached; no partial snapshot written"
                            )
                    result["datasets"][name] = {"columns": COLUMNS[name], "rows": rows}
                    result["expected_counts"][name] = len(rows)
    except AuditError:
        raise
    except Exception as exc:
        # Never print a DB exception: it can contain DSNs, keys or returned data.
        raise AuditError(
            "Database collection failed; verify connectivity, SELECT permissions and schema"
        ) from exc
    return validate(result)
