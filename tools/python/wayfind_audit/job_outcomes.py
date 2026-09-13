"""Strict interpretations of job-specific pulse notes.

Generic pulse counters are retained elsewhere as telemetry.  They are not a
shared business-outcome schema: each producer defines its own units.
"""

import re
from datetime import datetime

PHOTO_REPAIR = re.compile(
    r"^photos: recovered=(\d+) classified=(\d+) blocked=(\d+) released=(\d+) "
    r"failed=(\d+) allowance=(unread|unreadable|\d+/\d+) batches=(\d+)(.*)$"
)
PHOTO_MONITOR = re.compile(
    r"^photos: (?P<ongoing>ongoing )?placeholder-rate (?P<rate>\d+)% of "
    r"(?P<sampled>\d+) probes(?:\s*\||$)"
)
PLACE_PHOTOS = re.compile(
    r"^place-photos: (\d+) active \((\d+) vaulted\), (\d+) rejected, "
    r"(\d+) failed, (\d+) deferred(.*)$"
)
REPAIR_DEADLINE = re.compile(
    r"^ — PARTIAL: stopped on its own (\d+)s budget after (\d+)/(\d+) attempted$"
)
REPAIR_ROW_FAILURE = re.compile(
    r"^ — PARTIAL: stopped after a batch reported a row failure to avoid same-run retry "
    r"\((\d+)/(\d+) attempted\)$"
)
PLACE_PHOTOS_PARTIAL = re.compile(
    r"^ — PARTIAL: stopped on its own (\d+)s budget with (\d+) candidate\(s\) unstarted"
    r"(?: \(|$)"
)
AT_RISK_PARTIAL = re.compile(
    r"\bat-risk PARTIAL \((?:deadline reached while paging|view read failed|"
    r"view returned a non-array response|photo confirmation read failed|"
    r"view row lacked the pagination cursor|view pagination cursor did not advance|"
    r"worklist pagination threw|pagination stopped before exhaustion); \d+/\d+\)"
)
AT_RISK_UNAVAILABLE_AFTER = re.compile(
    r"\bat-risk UNAVAILABLE after \d+ scanned "
    r"\(wf_photo_at_risk continuation read failed; partial page retained\)"
)
AT_RISK_UNAVAILABLE = re.compile(
    r"\bat-risk UNAVAILABLE \(wf_photo_at_risk read failed — general scan only\)"
)
AT_RISK_OBSERVED = re.compile(r"\bat-risk \d+/\d+")
AT_RISK_SKIPPED = "at-risk skipped (source=all)"


def _timestamp(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _unknown(job, reason):
    return {"job": job, "interpretation": "unknown", "reason": reason, "outcome": None}


def interpret_job_row(row, columns):
    """Return a domain outcome only when the producer note and counters agree."""
    values = dict(zip(columns, row, strict=True))
    job = values["job"]
    if job not in ("photo-repair", "photo-monitor", "place-photos"):
        return None
    note = values.get("note")
    if not isinstance(note, str) or not note:
        return _unknown(job, "missing_note")

    attempted = values["attempted"]
    succeeded = values["succeeded"]
    pulse_failed = values["failed"]

    if job == "photo-repair":
        match = PHOTO_REPAIR.fullmatch(note)
        if not match:
            return _unknown(job, "malformed_or_non_summary_note")
        recovered, classified, blocked, released, worker_errors, batches = map(
            int, (*match.groups()[:5], match.group(7))
        )
        if succeeded != recovered + classified + blocked or pulse_failed != worker_errors:
            return _unknown(job, "note_counter_mismatch")
        if attempted != succeeded + worker_errors:
            return _unknown(job, "note_counter_mismatch")
        tail = match.group(8)
        deadline = REPAIR_DEADLINE.fullmatch(tail)
        row_failure = REPAIR_ROW_FAILURE.fullmatch(tail)
        partial = bool(deadline or row_failure)
        if tail and not partial:
            return _unknown(job, "malformed_partial_note")
        attempted_pair = (
            deadline.groups()[1:] if deadline else (row_failure.groups() if row_failure else None)
        )
        attempted_limit = int(attempted_pair[1]) if attempted_pair else None
        if attempted_pair and int(attempted_pair[0]) != attempted:
            return _unknown(job, "note_counter_mismatch")
        return {
            "job": job,
            "interpretation": "known",
            "reason": None,
            "outcome": {
                "recovered": recovered,
                "classified": classified,
                "budget_blocked": blocked,
                "released": released,
                "worker_errors": worker_errors,
                "batches": batches,
                "allowance": match.group(6),
                "partial": partial,
                "partial_reason": (
                    "work_budget" if deadline else ("row_failure" if row_failure else None)
                ),
                "work_budget_seconds": int(deadline.group(1)) if deadline else None,
                "attempted_limit": attempted_limit,
            },
        }

    if job == "photo-monitor":
        match = PHOTO_MONITOR.match(note)
        if not match or int(match.group("sampled")) != attempted:
            return _unknown(job, "malformed_note" if not match else "note_counter_mismatch")
        placeholder_rate = int(match.group("rate"))
        if placeholder_rate > 100:
            return _unknown(job, "invalid_domain_value")
        if succeeded + pulse_failed != attempted:
            return _unknown(job, "note_counter_mismatch")
        ongoing = bool(match.group("ongoing"))
        if ongoing and succeeded == 0:
            return _unknown(job, "note_counter_mismatch")
        alert_state = (
            "deduplicated_alert"
            if ongoing
            else ("new_alert" if attempted > 0 and succeeded == 0 else "no_new_alert")
        )
        return {
            "job": job,
            "interpretation": "known",
            "reason": None,
            "outcome": {
                "sampled": attempted,
                "reported_placeholder_rate_pct": placeholder_rate,
                "alert_state": alert_state,
            },
        }

    match = PLACE_PHOTOS.fullmatch(note)
    if not match:
        return _unknown(job, "malformed_or_non_summary_note")
    active, vaulted, rejected, worker_errors, deferred = map(int, match.groups()[:5])
    if vaulted > active:
        return _unknown(job, "invalid_domain_value")
    if attempted != active + rejected + worker_errors + deferred:
        return _unknown(job, "note_counter_mismatch")
    if succeeded != active or pulse_failed != rejected + worker_errors + deferred:
        return _unknown(job, "note_counter_mismatch")
    tail = match.group(6)
    partial_match = PLACE_PHOTOS_PARTIAL.match(tail)
    main_partial = partial_match is not None
    if tail and not (tail.startswith(" (") or main_partial):
        return _unknown(job, "malformed_partial_note")
    if AT_RISK_PARTIAL.search(tail):
        worklist_state = "partial"
        partial = True
    elif AT_RISK_UNAVAILABLE_AFTER.search(tail):
        worklist_state = "unavailable_after_partial_scan"
        partial = True
    elif AT_RISK_UNAVAILABLE.search(tail):
        worklist_state = "unavailable"
        partial = None
    elif AT_RISK_OBSERVED.search(tail):
        worklist_state = "observed"
        partial = main_partial
    elif AT_RISK_SKIPPED in tail:
        worklist_state = "skipped"
        partial = main_partial
    else:
        worklist_state = "unknown"
        partial = True if main_partial else None
    return {
        "job": job,
        "interpretation": "known",
        "reason": None,
        "outcome": {
            "accepted": active,
            "valid_rejections": rejected,
            "worker_errors": worker_errors,
            "deferred": deferred,
            "vaulted": vaulted,
            "partial": partial,
            "worklist_state": worklist_state,
            "work_budget_seconds": int(partial_match.group(1)) if main_partial else None,
            "unstarted_candidates": int(partial_match.group(2)) if main_partial else None,
        },
    }


def summarize_job_outcomes(rows, columns, since, until):
    """Summarize recognized jobs without converting missing evidence to zero."""
    grouped = {}
    for row in rows:
        values = dict(zip(columns, row, strict=True))
        if not (_timestamp(since) <= _timestamp(values["ran_at"]) < _timestamp(until)):
            continue
        interpreted = interpret_job_row(row, columns)
        if interpreted is None:
            continue
        grouped.setdefault(values["job"], []).append((values, interpreted))

    summaries = []
    for job in sorted(grouped):
        entries = grouped[job]
        known = [item for _, item in entries if item["interpretation"] == "known"]
        complete = len(known) == len(entries)
        latest_values, latest = max(entries, key=lambda pair: _timestamp(pair[0]["ran_at"]))
        totals = None
        partial_runs = None
        if complete:
            numeric_keys = {
                "photo-repair": (
                    "recovered",
                    "classified",
                    "budget_blocked",
                    "released",
                    "worker_errors",
                ),
                "photo-monitor": ("sampled",),
                "place-photos": (
                    "accepted",
                    "valid_rejections",
                    "worker_errors",
                    "deferred",
                    "vaulted",
                ),
            }[job]
            totals = {key: sum(item["outcome"][key] for item in known) for key in numeric_keys}
            if job == "photo-monitor":
                totals.update(
                    new_alert_runs=sum(
                        item["outcome"]["alert_state"] == "new_alert" for item in known
                    ),
                    deduplicated_alert_runs=sum(
                        item["outcome"]["alert_state"] == "deduplicated_alert" for item in known
                    ),
                )
            else:
                partial_values = [item["outcome"]["partial"] for item in known]
                partial_runs = (
                    sum(partial_values)
                    if all(value is not None for value in partial_values)
                    else None
                )
        summaries.append(
            {
                "job": job,
                "runs": len(entries),
                "interpreted_runs": len(known),
                "unknown_runs": len(entries) - len(known),
                "partial_runs": partial_runs,
                "totals": totals,
                "latest": {
                    "ran_at": latest_values["ran_at"],
                    "interpretation": latest["interpretation"],
                    "reason": latest["reason"],
                    "outcome": latest["outcome"],
                },
            }
        )
    return {"window": {"since": since, "until": until}, "jobs": summaries}
