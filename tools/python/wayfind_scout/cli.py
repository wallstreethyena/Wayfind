"""CLI for the private dry-run scout."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .pipeline import load_json, run
from .policy import ScoutError


def _write_new(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as handle:
        json.dump(value, handle, indent=2, sort_keys=True)
        handle.write("\n")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Private, zero-provider-cost Wayfind scout")
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if args.out.exists():
            raise ScoutError("Output already exists")
        report = run(load_json(args.manifest))
        _write_new(args.out, report)
        summary = report["summary"]
        if not report["complete"]:
            print(
                f"wayfind-scout: incomplete run; {summary['sources_unavailable']} source(s) unavailable",
                file=sys.stderr,
            )
            return 2
        print(
            "Dry run complete: "
            f"{report['scope']['places']} places, {summary['event_candidates']} event candidates, "
            f"{summary['research_ready_places']} research-ready places, $0 provider calls."
        )
        return 0
    except (ScoutError, OSError, TypeError, KeyError, UnicodeError):
        print("wayfind-scout: run failed; no success claimed", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
