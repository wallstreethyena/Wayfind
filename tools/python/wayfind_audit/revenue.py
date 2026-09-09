"""Read-only commerce census. Never fetch partner URLs or write application data."""

import json
import os
from collections import Counter
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .snapshot import AuditError, timestamp

# Fixed SELECTs avoid the expensive dynamic place-product view. No guessed eligibility.
TABLES = {
    "places": (
        "wf_inventory",
        "place_id",
        "place_id,name,category,metro",
        "status='OPERATIONAL' and excluded=false and needs_review=false",
    ),
    "events": (
        "wf_events",
        "event_id",
        "event_id,event_name,venue,start_date,end_date,event_status,is_free,official_ticket_url,official_event_url,link_ok",
        "true",
    ),
    "experiences": (
        "wf_experiences",
        "product_code",
        "product_code,provider,title,product_url,link_ok,last_checked_at,fail_count",
        "true",
    ),
    "deals": (
        "wf_deals",
        "id",
        "id,provider,title,dest_url,affiliate_url,link_ok,http_status,last_checked_at,fail_count,ends_at",
        "active=true",
    ),
    "coverage": (
        "wf_affiliate_coverage",
        "id",
        "id,entity_type,entity_id,provider,offer_id,offer_url,status,confidence,evidence,reason,expires_at",
        "true",
    ),
    "opportunities": (
        "wf_affiliate_opportunities",
        "id",
        "id,place_id,hits,first_seen_at,last_seen_at,resolved_at",
        "true",
    ),
}


def validate(data):
    if data.get("schema_version") != "revenue-1" or data.get("source_kind") not in (
        "production",
        "fixture",
    ):
        raise AuditError("Expected labelled revenue-1 snapshot")
    timestamp(data.get("captured_at"))
    if data.get("consistency") not in ("repeatable_read", "multi_request"):
        raise AuditError("Explicit consistency required")
    if set(data.get("datasets", {})) != set(TABLES):
        raise AuditError("All six revenue datasets are required")
    for name, (_, key, columns, _) in TABLES.items():
        rows = data["datasets"][name]
        expected = data.get("expected_counts", {}).get(name)
        pages = data.get("pages", {}).get(name)
        if type(expected) is not int or not isinstance(rows, list) or len(rows) != expected:
            raise AuditError(f"{name}: incomplete census")
        if len(rows) > 100_000 or not isinstance(pages, list) or not pages:
            raise AuditError(f"{name}: missing pagination or row ceiling exceeded")
        if (
            any(type(n) is not int or not 0 <= n <= 1000 for n in pages)
            or sum(pages) != expected
            or pages[-1] == 1000
        ):
            raise AuditError(f"{name}: pagination did not terminate")
        ids = set()
        for row in rows:
            if not isinstance(row, dict) or not set(columns.split(",")) <= set(row):
                raise AuditError(f"{name}: missing columns")
            ident = row[key]
            if (
                not isinstance(ident, (str, int))
                or isinstance(ident, bool)
                or ident == ""
                or ident in ids
            ):
                raise AuditError(f"{name}: missing or duplicate ID")
            ids.add(ident)
            if "link_ok" in row and row["link_ok"] is not None and type(row["link_ok"]) is not bool:
                raise AuditError(f"{name}: invalid health evidence")
    return data


def collect_revenue(max_rows=100_000):
    if type(max_rows) is not int or not 1 <= max_rows <= 100_000:
        raise AuditError("max_rows must be 1..100000")
    dsn = os.environ.get("WAYFIND_AUDIT_DATABASE_URL", "").strip()
    if not dsn:
        raise AuditError("WAYFIND_AUDIT_DATABASE_URL is required")
    data = {
        "schema_version": "revenue-1",
        "source_kind": "production",
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "consistency": "repeatable_read",
        "datasets": {},
        "expected_counts": {},
        "pages": {},
    }
    try:
        import psycopg
        from psycopg.rows import dict_row

        with psycopg.connect(
            dsn, sslmode="require", connect_timeout=10, row_factory=dict_row
        ) as conn:
            with conn.cursor() as cur:
                cur.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
                cur.execute("SET LOCAL statement_timeout = '30s'")
                cur.execute("SET LOCAL idle_in_transaction_session_timeout = '60s'")
                for name, (table, key, columns, where) in TABLES.items():
                    cur.execute(f"select count(*) as n from public.{table} where {where}")
                    expected = cur.fetchone()["n"]
                    if expected > max_rows:
                        raise AuditError(f"{name}: row ceiling reached")
                    rows, pages, last = [], [], None
                    while True:
                        after = f" and {key} > %s" if last is not None else ""
                        cur.execute(
                            f"select {columns} from public.{table} where {where}{after} order by {key} limit 1000",
                            (last,) if last is not None else (),
                        )
                        batch = cur.fetchall()
                        pages.append(len(batch))
                        if len(rows) + len(batch) > max_rows:
                            raise AuditError(f"{name}: row ceiling reached")
                        rows.extend(batch)
                        if len(batch) < 1000:
                            break
                        last = batch[-1][key]
                    # UUID/date values become stable JSON scalars, never credentials.
                    data["datasets"][name] = json.loads(json.dumps(rows, default=str))
                    data["expected_counts"][name], data["pages"][name] = expected, pages
    except AuditError:
        raise
    except Exception as exc:
        raise AuditError(
            "Revenue collection failed; check SELECT access, connectivity and schema"
        ) from exc
    return validate(data)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def collect_revenue_rest(max_rows=100_000, opener=None):
    """Use existing canary secrets; GET only, fixed project and table allowlist."""
    origin = os.environ.get("SUPABASE_URL", "").rstrip("/")
    opener = opener or build_opener(NoRedirect()).open
    secret = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if origin != "https://gbhtoehdxkzjsmmkisgu.supabase.co" or not secret:
        raise AuditError("Expected Wayfind SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
    if type(max_rows) is not int or not 1 <= max_rows <= 100_000:
        raise AuditError("max_rows must be 1..100000")
    data = {
        "schema_version": "revenue-1",
        "source_kind": "production",
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "consistency": "multi_request",
        "datasets": {},
        "expected_counts": {},
        "pages": {},
    }
    try:
        for name, (table, key, columns, _) in TABLES.items():
            rows, pages, last, expected = [], [], None, None
            while True:
                params = {"select": columns, "order": key + ".asc", "limit": "1000"}
                if name == "places":
                    params.update(
                        status="eq.OPERATIONAL", excluded="eq.false", needs_review="eq.false"
                    )
                if name == "deals":
                    params["active"] = "eq.true"
                if last is not None:
                    params[key] = "gt." + str(last)
                request = Request(
                    origin + "/rest/v1/" + table + "?" + urlencode(params),
                    headers={
                        "apikey": secret,
                        "Authorization": "Bearer " + secret,
                        "Prefer": "count=exact",
                    },
                    method="GET",
                )
                with opener(request, timeout=30) as response:
                    if response.geturl() != request.full_url:
                        raise AuditError("Unexpected database redirect")
                    count = response.headers.get("Content-Range", "").rsplit("/", 1)[-1]
                    if not count.isdigit():
                        raise AuditError(f"{name}: missing exact count")
                    if expected is None:
                        expected = int(count)
                    if expected > max_rows:
                        raise AuditError(f"{name}: row ceiling reached")
                    raw = response.read(10_000_001)
                    if len(raw) > 10_000_000:
                        raise AuditError(f"{name}: page size ceiling reached")
                    batch = json.loads(raw)
                if not isinstance(batch, list) or len(batch) > 1000:
                    raise AuditError(f"{name}: invalid page")
                pages.append(len(batch))
                rows.extend(batch)
                if len(rows) > max_rows:
                    raise AuditError(f"{name}: row ceiling reached")
                if len(batch) < 1000:
                    break
                next_key = batch[-1][key]
                if next_key == last:
                    raise AuditError(f"{name}: cursor did not advance")
                last = next_key
            data["datasets"][name], data["pages"][name], data["expected_counts"][name] = (
                rows,
                pages,
                expected,
            )
    except AuditError:
        raise
    except Exception as exc:
        raise AuditError(
            "Revenue REST collection failed; verify existing canary credentials and SELECT access"
        ) from exc
    return validate(data)


def link_health(row, now):
    status = row.get("http_status")
    if status in (403, 429, 0) or (isinstance(status, int) and status >= 500):
        return "unknown"
    checked = row.get("last_checked_at")
    if not checked or not 0 <= (now - timestamp(checked)).total_seconds() <= 86400:
        return "unknown"
    if row.get("link_ok") is False:
        return "stored_unhealthy"
    return "stored_healthy" if row.get("link_ok") is True else "unknown"


def tracking(row, provider):
    """Structural checks only. Account approval and commission remain unknown."""
    value = row.get("product_url") if provider == "viator" else row.get("affiliate_url")
    try:
        u = urlsplit(value or "")
        if u.scheme != "https" or u.username or u.password or u.port:
            return False
        if provider == "viator":
            return (
                u.hostname in ("viator.com", "www.viator.com")
                and parse_qs(u.query).get("pid") == ["P00308545"]
                and u.path.endswith("-" + row["product_code"])
            )
        dest = row.get("dest_url") or ""
        d = urlsplit(dest)
        prefix = "https://www.anrdoezrs.net/links/101643573/type/dlg/sid/"
        tail = value[len(prefix) :] if value.startswith(prefix) else ""
        sid, sep, target = tail.partition("/")
        return bool(
            sid
            and sep
            and target == dest
            and d.scheme == "https"
            and d.hostname in ("undercovertourist.com", "www.undercovertourist.com")
            and not d.username
            and not d.password
            and not d.port
            and not d.query
            and not d.fragment
        )
    except (ValueError, TypeError):
        return False


def audit_revenue(data):
    validate(data)
    d, now = data["datasets"], timestamp(data["captured_at"])
    links = []
    for name, key, provider in (
        ("experiences", "product_code", "viator"),
        ("deals", "id", "undercover_tourist"),
    ):
        for row in d[name]:
            links.append(
                {
                    "dataset": name,
                    "id": row[key],
                    "health": link_health(row, now),
                    "tracking_structure": tracking(row, provider),
                    "account_eligibility": "unknown",
                    "commission": "unknown",
                }
            )
    ledger = {}
    for row in d["coverage"]:
        ledger.setdefault((row["entity_type"], str(row["entity_id"])), []).append(row)
    gaps = []
    for kind, name, key in (("place", "places", "place_id"), ("event", "events", "event_id")):
        for row in d[name]:
            records = ledger.get((kind, str(row[key])), [])
            gaps.append(
                {
                    "entity_type": kind,
                    "entity_id": row[key],
                    "classification": "unknown",
                    "reason": "Eligibility and rendered card surfaces not exhaustively verified",
                    "ledger_states": sorted({r["status"] for r in records}),
                    "candidate_count": sum(r["status"] == "candidate" for r in records),
                }
            )
    return {
        "schema_version": "revenue-report-1",
        "source_kind": data["source_kind"],
        "captured_at": data["captured_at"],
        "consistency": data["consistency"],
        "inventory_complete": True,
        "eligible_coverage_complete": False,
        "counts": data["expected_counts"],
        "pages": data["pages"],
        "links": links,
        "entities": gaps,
        "health_counts": dict(Counter(x["health"] for x in links)),
        "candidates": [r for r in d["coverage"] if r["status"] == "candidate"],
        "pending_commission": None,
        "approved_commission": None,
        "paid_commission": None,
        "measured_audit_cost": None,
        "human_clicks": None,
        "limitations": [
            "No partner requests or synthetic clicks",
            "Stored health is time-bounded evidence, not current product/date verification",
            "Configured tracking IDs do not prove account approval",
            "No partner statements, traffic export or cost records supplied",
            "Free places are not automatically revenue leaks",
            "Dynamic card surfaces and eligible-offer matching remain incomplete",
        ],
    }
