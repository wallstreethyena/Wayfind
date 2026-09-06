"""Generate a standalone SELECT from the collector's canonical query contracts."""

from pathlib import Path

from wayfind_audit.snapshot import render_export_sql

Path(__file__).resolve().parents[1].joinpath("sql/snapshot.sql").write_text(render_export_sql())
