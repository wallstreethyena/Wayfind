"""Command-line entrypoint. Offline by default; collection is explicit."""

import argparse
import hashlib
import json
import sys
from pathlib import Path

from . import __version__
from .analyze import audit
from .collect import collect
from .revenue import audit_revenue, collect_revenue, collect_revenue_rest
from .snapshot import AuditError, read_snapshot, write_json


def cell(value):
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("|", "&#124;")
        .replace("\n", " ")
        .replace("\r", " ")
        .replace("`", "&#96;")
    )


def table(rows, columns):
    lines = ["| " + " | ".join(columns) + " |", "| " + " | ".join("---" for _ in columns) + " |"]
    for row in rows:
        lines.append(
            "| "
            + " | ".join(cell("unknown" if row.get(c) is None else row[c]) for c in columns)
            + " |"
        )
    return "\n".join(lines)


def markdown(report):
    demo = "SYNTHETIC DEMO" if report["source_kind"] == "fixture" else "LIVE DATA SNAPSHOT"
    pairs = report["duplicates"]["candidate_pairs"]
    lines = [
        f"# Wayfind Python audit: {demo}",
        "",
        f"Captured: {cell(report['captured_at'])}. Scope: {cell(report['scope'])}.",
        "",
        f"Input rows: {report['input_counts']['places']} places, {report['input_counts']['ledger']} ledger records, {report['input_counts']['jobs']} job runs.",
        "",
        f"Consistency: {cell(report['consistency'])}. Input SHA-256: {report['input_sha256']}.",
        "",
        "## Findings for review",
        "",
        f"- {len(report['editorial_content_flags'])} verified editorial rows fail the content diagnostic.",
        f"- {len(pairs)} active/unknown-state possible duplicate pairs; {len(report['duplicates'].get('inactive_pairs', []))} additional pairs contain excluded/closed records. No records were merged.",
        "- Dollar costs and savings: unknown. Usage counts are not invoices.",
        "",
        "## Inventory and editorial coverage",
        "",
        "This is inventory-state coverage of wf_editorial, not all editorial sources or live rail eligibility.",
        "",
        table(
            report["coverage"],
            [
                "metro",
                "category",
                "records",
                "operational_unflagged",
                "flagged",
                "closed",
                "unknown",
                "missing_editorial_row",
                "unverified_editorial",
                "verified_but_thin",
                "verified_with_content",
                "editorial_content_pct",
            ],
        ),
        "",
        "## Recorded usage",
        "",
        "Stored cap only; effective policy and invoices may differ.",
        "",
        table(report["ledger"], ["month", "sku", "used", "cap", "utilization_pct", "state"]),
        "",
        "## Job outcomes",
        "",
        f"Window: {cell(report['observation_window']['since'])} to {cell(report['observation_window']['until'])} (end exclusive).",
        "",
        table(
            report["jobs"],
            [
                "job",
                "runs",
                "attempted",
                "succeeded",
                "failed",
                "zero_output_runs",
                "idle_runs",
                "zero_attempt_failure_runs",
                "inconsistent_counter_runs",
                "success_pct",
            ],
        ),
        "",
        "## Latest 24-hour job outcomes",
        "",
        f"Since {cell(report['recent_since'])}. Idle means all three counters are zero. Zero-attempt failures are separate; old failures do not prove a current outage.",
        "",
        table(
            report["recent_jobs"],
            [
                "job",
                "runs",
                "attempted",
                "succeeded",
                "failed",
                "zero_output_runs",
                "idle_runs",
                "zero_attempt_failure_runs",
            ],
        ),
        "",
        "## Duplicate review queue",
        "",
        f"Compared {report['duplicates']['compared_pairs']} nearby pairs. Skipped {report['duplicates']['skipped_records']} records lacking usable names, coordinates or categories.",
        "",
        table(pairs, ["left_id", "right_id", "name_similarity", "distance_m", "reason"]),
        "",
        "## Pairs containing excluded or closed records",
        "",
        "Retained for transparency, outside the active review queue. Exclusion alone does not establish which records describe the same place.",
        "",
        table(
            report["duplicates"].get("inactive_pairs", []),
            ["left_id", "right_id", "name_similarity", "distance_m", "reason"],
        ),
        "",
        "## Limits",
        "",
        *["- " + cell(x) for x in report["limitations"]],
        "",
    ]
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Read-only Wayfind batch audits; no provider calls"
    )
    parser.add_argument("--version", action="version", version=__version__)
    sub = parser.add_subparsers(dest="command", required=True)
    run = sub.add_parser("report", help="Analyze a complete exported snapshot offline")
    run.add_argument("--input", type=Path, required=True)
    run.add_argument(
        "--out", type=Path, required=True, help="New output directory; never overwritten"
    )
    run.add_argument("--max-pairs", type=int, default=100_000)
    export = sub.add_parser(
        "collect", help="Read database into a local snapshot (requires live extra)"
    )
    export.add_argument("--out", type=Path, required=True)
    export.add_argument("--days", type=int, default=7)
    export.add_argument("--max-rows", type=int, default=100_000)
    money = sub.add_parser(
        "revenue-collect", help="Paginated read-only commerce census; no partner requests"
    )
    money.add_argument("--out", type=Path, required=True)
    money.add_argument("--max-rows", type=int, default=100_000)
    money.add_argument("--transport", choices=("database", "rest"), default="database")
    money_report = sub.add_parser(
        "revenue-report", help="Analyze a complete commerce census offline"
    )
    money_report.add_argument("--input", type=Path, required=True)
    money_report.add_argument("--out", type=Path, required=True)
    money_report.add_argument("--pins", type=Path)
    args = parser.parse_args(argv)
    try:
        if args.command == "revenue-collect":
            if args.out.exists():
                raise AuditError("Output already exists")
            collector = collect_revenue_rest if args.transport == "rest" else collect_revenue
            write_json(args.out, collector(args.max_rows))
            print("Complete read-only revenue census written; eligibility and payout not verified.")
        elif args.command == "revenue-report":
            if args.out.exists() or args.input.stat().st_size > 100_000_000:
                raise AuditError("Output exists or input exceeds 100 MB")
            raw = args.input.read_bytes()
            policy = None
            if args.pins:
                if args.pins.stat().st_size > 10_000_000:
                    raise AuditError("Pin policy exceeds size ceiling")
                policy = json.loads(args.pins.read_text())
                if policy.get("snapshot_sha256") != hashlib.sha256(raw).hexdigest():
                    raise AuditError("Pin policy belongs to a different snapshot")
            result = audit_revenue(json.loads(raw), policy)
            args.out.mkdir(parents=True, exist_ok=False)
            write_json(args.out / "report.json", result)
            lines = [
                f"# Wayfind revenue audit: {result['source_kind']}",
                "",
                f"Captured: {cell(result['captured_at'])}",
                "",
                "Inventory counts: " + cell(result["counts"]),
                "",
                "Health evidence: " + cell(result["health_counts"]),
                "",
                f"Current-code pin references: {len(result['pin_checks'])}; missing inventory: {sum(p['state'] == 'missing_inventory' for p in result['pin_checks'])}.",
                "",
                f"Candidate rows: {len(result['candidates'])}. Eligible coverage incomplete.",
                "",
                "Pending, approved and paid commission, human clicks and measured cost: unknown.",
                "",
                *["- " + cell(x) for x in result["limitations"]],
                "",
            ]
            (args.out / "report.md").write_text("\n".join(lines))
            print(
                "Revenue report written; eligible coverage and payment verification remain incomplete."
            )
        elif args.command == "collect":
            if args.out.exists():
                raise AuditError("Output already exists")
            write_json(args.out, collect(args.days, args.max_rows))
            print("Complete read-only snapshot written.")
        else:
            if args.out.exists():
                raise AuditError("Output directory already exists; choose a new run directory")
            data, digest = read_snapshot(args.input)
            result = audit(data, args.max_pairs)
            result["input_sha256"] = digest
            result["tool_version"] = __version__
            args.out.mkdir(parents=True, exist_ok=False)
            write_json(args.out / "report.json", result)
            with (args.out / "report.md").open("x", encoding="utf-8") as handle:
                handle.write(markdown(result))
            print(
                f"Complete {data['source_kind']} report: {data['expected_counts']['places']} records, {len(result['duplicates']['candidate_pairs'])} review pairs; savings unknown."
            )
        return 0
    except (AuditError, OSError, ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
        # Validation messages are controlled; OS/JSON messages may contain private input.
        message = (
            str(exc)
            if isinstance(exc, AuditError)
            else "Invalid input or file operation failed; inspect local configuration"
        )
        print("wayfind-audit: " + message, file=sys.stderr)
        return 2
    except Exception:
        print(
            "wayfind-audit: analysis failed; no success claimed (check resources and schema)",
            file=sys.stderr,
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
