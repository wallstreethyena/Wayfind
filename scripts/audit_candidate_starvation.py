#!/usr/bin/env python3
"""
audit_candidate_starvation — Wayfind's system-wide candidate-starvation auditor.

THE FAILURE CLASS. lib/browseInventory.js named it before anyone had a word for
it: "identity ∩ anchor top-N is thin BY CONSTRUCTION". A surface reads a BROAD
owned category, keeps the highest-scoring N, and only THEN asks the narrow
question — is this a dinner show, a Cuban lunch counter, a pickleball court, a
private dining room. The narrow set competes against the whole category for
those N slots and loses, so the rail is thin and the data was never the problem.
Found and fixed six times under six different names; each fix was local to one
surface. This file is the systemic version.

The execution order it looks for, and rejects:

    broad inventory category -> arbitrary/database limit or broad top-N
                             -> specific category/rail/intent classifier

The execution order it requires instead:

    complete nearby owned candidate universe
      -> universal serviceability gates (open · not excluded · actually rated)
      -> exact surface/category identity
      -> Wayfind Score ranking
      -> output/presentation bound

WHAT PYTHON IS, AND IS NOT. Python is the auditor and the orchestrator. It is
NOT the source of truth for Wayfind category identity, and it holds no regex for
Beach, Dinner, Date Night or Family. Every question about what a place IS is
answered by calling the shipped JavaScript through two Node bridges:

    scripts/lib/starvationSurfaces.mjs   the registry, built from real predicates
    scripts/audit-starvation-measure.mjs one surface, one point, both retrievals
    scripts/audit-starvation-controls.mjs category honesty + the mutation test

Modes:
    --mode=static              source discovery + classification only (no DB)
    --mode=controls            static, plus the honesty and mutation controls
    --mode=production-readonly  everything, plus live per-metro measurement
                                (needs SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)

Outputs:
    artifacts/candidate-starvation-audit.json
    docs/audits/candidate-starvation-audit-YYYY-MM-DD.md   (with --report)

Read-only. It never writes to the database and never calls a paid provider.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import math
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NODE = os.environ.get("NODE_BIN", "node")

# Metros the audit covers. Wayfind is Florida-first and the failure only shows
# where the owned library is DENSE, so a thin town proves nothing either way.
METROS = {
    "parrish": (27.5949, -82.4265),
    "tampa": (27.9506, -82.4572),
    "sarasota": (27.3364, -82.5307),
    "orlando": (28.5383, -81.3792),
    "miami": (25.7617, -80.1918),
}


def parse_metros(raw: str) -> list[str]:
    """Parse once, reject ambiguity, and preserve the caller's order."""
    parts = [part.strip() for part in str(raw or "").split(",")]
    if not parts or any(not part for part in parts):
        raise ValueError("--metros must contain one or more non-empty metro ids")
    unknown = sorted({part for part in parts if part not in METROS})
    if unknown:
        raise ValueError("unknown metro(s): " + ", ".join(unknown))
    return list(dict.fromkeys(parts))


def _count(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def validate_measurement(result: object, surface: dict, lat: float, lng: float) -> list[str]:
    """Validate the Node bridge contract before its numbers enter a report."""
    errors: list[str] = []
    if not isinstance(result, dict):
        return ["measurement is not an object"]
    if result.get("measurementVersion") != 1:
        errors.append("measurementVersion is not 1")
    if result.get("surface") != surface.get("id"):
        errors.append(f"surface identity mismatch: {result.get('surface')!r}")
    if result.get("route") != surface.get("route"):
        errors.append(f"route identity mismatch: {result.get('route')!r}")
    if result.get("categories") != surface.get("categories"):
        errors.append("category identity mismatch")
    for key, expected in (("lat", lat), ("lng", lng)):
        value = result.get(key)
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or abs(value - expected) > 1e-9:
            errors.append(f"{key} mismatch: {value!r}")

    old = result.get("old")
    nxt = result.get("next")
    rails = result.get("rails")
    evidence = result.get("readEvidence")
    if not isinstance(old, dict): errors.append("old result is missing")
    if not isinstance(nxt, dict): errors.append("next result is missing")
    if not isinstance(rails, list): errors.append("rails result is missing")
    if not isinstance(evidence, dict): errors.append("readEvidence is missing")
    if errors:
        return errors

    for label, value in (
        ("old.reachedClassifier", old.get("reachedClassifier")),
        ("old.qualified", old.get("qualified")),
        ("next.rows", nxt.get("rows")),
        ("next.servable", nxt.get("servable")),
        ("next.withinRadius", nxt.get("withinRadius")),
        ("next.qualified", nxt.get("qualified")),
        ("next.sourceFailures", nxt.get("sourceFailures")),
        ("next.unknownFailures", nxt.get("unknownFailures")),
        ("recovered", result.get("recovered")),
    ):
        if not _count(value): errors.append(f"{label} is not a non-negative integer")
    if all(_count(nxt.get(k)) for k in ("rows", "servable", "withinRadius", "qualified")):
        if not (nxt["qualified"] <= nxt["withinRadius"] <= nxt["servable"] <= nxt["rows"]):
            errors.append("next admission counts are inconsistent")
    if _count(old.get("qualified")) and _count(old.get("reachedClassifier")):
        if old["qualified"] > old["reachedClassifier"]:
            errors.append("old admission counts are inconsistent")

    expected_categories = set(surface.get("categories") or [])
    per_category = evidence.get("perCategory")
    if not isinstance(per_category, dict) or set(per_category) != expected_categories:
        errors.append("per-category evidence does not exactly cover requested categories")
        per_category = {}
    source_failures = unknown_failures = 0
    truncations = []
    for category, item in per_category.items():
        if not isinstance(item, dict) or item.get("status") not in ("fulfilled", "rejected", "unknown"):
            errors.append(f"{category} has invalid read evidence")
            unknown_failures += 1
            continue
        if item["status"] == "fulfilled":
            if not _count(item.get("rows")) or not isinstance(item.get("truncated"), bool):
                errors.append(f"{category} fulfilled without rows/truncation evidence")
            else:
                truncations.append(item["truncated"])
            if item.get("error") is not None:
                errors.append(f"{category} fulfilled with an error")
        else:
            source_failures += 1
            unknown_failures += 1
            if item.get("rows") is not None or item.get("truncated") is not None or not item.get("error"):
                errors.append(f"{category} failure was presented as measured")

    extra_unknown = max(0, len(evidence.get("failures") or []) - source_failures)
    unknown_failures += extra_unknown
    actual_truncated = True if any(truncations) else (None if unknown_failures else False)
    if evidence.get("sourceFailures") != source_failures:
        errors.append("source failure count disagrees with per-category evidence")
    if evidence.get("unknownFailures") != unknown_failures:
        errors.append("unknown failure count disagrees with read evidence")
    if evidence.get("actualTruncated") is not actual_truncated:
        errors.append("actual truncation disagrees with per-category evidence")
    complete = bool(expected_categories) and not source_failures and not unknown_failures and actual_truncated is False
    if evidence.get("complete") is not complete:
        errors.append("read completeness disagrees with evidence")
    if nxt.get("sourceFailures") != source_failures or nxt.get("unknownFailures") != unknown_failures:
        errors.append("next failure counts disagree with read evidence")
    if nxt.get("truncated") is not actual_truncated or nxt.get("complete") is not complete:
        errors.append("next completeness disagrees with read evidence")
    rows_read = nxt.get("rowsRead")
    if not isinstance(rows_read, dict) or set(rows_read) != expected_categories:
        errors.append("rowsRead does not exactly cover requested categories")
    else:
        for category, item in per_category.items():
            if rows_read.get(category) != item.get("rows"):
                errors.append(f"rowsRead disagrees for {category}")

    expected_rails = set(surface.get("rails") or []) - set((surface.get("railsNotMeasured") or {}).keys())
    if isinstance(rails, list):
        ids = [row.get("id") for row in rails if isinstance(row, dict)]
        if len(ids) != len(rails) or len(ids) != len(set(ids)) or set(ids) != expected_rails:
            errors.append("rail identity does not exactly cover the measured surface")
        for row in rails:
            if not isinstance(row, dict): continue
            if not _count(row.get("old")) or not _count(row.get("next")):
                errors.append(f"rail {row.get('id')!r} has invalid counts")
    return errors

# ---------------------------------------------------------------------------
# STATIC DISCOVERY
#
# Finds every place that reads owned inventory, and reports HOW. This half is
# text analysis and it is honest about that: it reports the SHAPE of the call,
# and the classification of a surface is only trusted once the live measurement
# agrees with it. A static reading alone is a hypothesis.
# ---------------------------------------------------------------------------

SCAN_DIRS = ("app", "lib", "scripts")
SKIP_PARTS = ("node_modules", ".next", "dist", "build")

# `serveFromInventory(cat, lat, lng, radiusM, n, sub, options)` — the sub is the
# 6th argument and is what makes a read identity-first (v8.49).
SERVE_CALL = re.compile(r"serveFromInventory\s*\(", re.M)
# The identity-first reader. Its presence is what turns a hand-declared status
# into evidence — a surface is FIXED because the code says so, not because the
# registry says so.
OWNED_POOL_CALL = re.compile(r"(?:fetchOwnedPool|readOwnedCategory)\s*\(", re.M)
RAW_READ = re.compile(r"/rest/v1/wf_inventory\?", re.M)
ORDER_PARAM = re.compile(r"order=")
RANGE_PAGING = re.compile(r"Range-Unit|readOwnedCategory|fetchOwnedPool")


def strip_comments(src: str) -> str:
    """Comments are prose, not code. A guard that reads raw source matches its own
    explanation — five separate false greens in this repo came from exactly that.

    LINE NUMBERS ARE PART OF THE EVIDENCE, so a blanked comment is replaced by the
    same number of newlines rather than by a space. The first version collapsed
    them and every citation in the report was two lines short, which is exactly
    the kind of small wrongness that makes a reader stop trusting the big
    numbers."""
    def blank(m: "re.Match[str]") -> str:
        return "\n" * m.group(0).count("\n")
    src = re.sub(r"/\*[\s\S]*?\*/", blank, src)
    src = re.sub(r"^[ \t]*//.*$", "", src, flags=re.M)
    return src


def split_args(call: str) -> list[str]:
    """Split one call's argument list on top-level commas. Good enough for the
    shapes in this repo, and it never has to be perfect: it only decides whether
    a 6th argument was written, and the answer is checked against the live
    measurement before anything is called SAFE."""
    out, depth, cur, quote = [], 0, "", None
    for ch in call:
        if quote:
            cur += ch
            if ch == quote and not cur.endswith("\\" + ch):
                quote = None
            continue
        if ch in "\"'`":
            quote = ch
            cur += ch
        elif ch in "([{":
            depth += 1
            cur += ch
        elif ch in ")]}":
            if depth == 0:
                out.append(cur.strip())
                return out
            depth -= 1
            cur += ch
        elif ch == "," and depth == 0:
            out.append(cur.strip())
            cur = ""
        else:
            cur += ch
    out.append(cur.strip())
    return out



MAP_BEFORE = re.compile(r"([A-Za-z_$][\w$]*)\s*\.map\(\s*\(?\s*([A-Za-z_$][\w$]*)")


def resolve_category_arg(src, call_at, cat_arg):
    """A string literal resolves to itself. An identifier resolves to the array the
    enclosing `.map()` iterates, when that array is a literal list of strings in the
    same file. Anything else resolves to None and is reported as UNRESOLVED rather
    than quietly assumed to be fine."""
    if not cat_arg:
        return None
    lit = re.fullmatch(r"""[\"'`]([a-z-]+)[\"'`]""", cat_arg.strip())
    if lit:
        return [lit.group(1)]
    before = src[max(0, call_at - 300): call_at]
    hits = MAP_BEFORE.findall(before)
    if not hits:
        return None
    array_var, param = hits[-1]
    if param != cat_arg.strip():
        return None
    decl = re.search(r"const\s+" + re.escape(array_var) + r"\s*=\s*\[([^\]]*)\]", src)
    if not decl:
        return None
    members = re.findall(r"""[\"'`]([a-z-]+)[\"'`]""", decl.group(1))
    return members or None


def scan_sources() -> list[dict]:
    findings: list[dict] = []
    for d in SCAN_DIRS:
        for path in sorted((ROOT / d).rglob("*.js")):
            if any(p in path.parts for p in SKIP_PARTS):
                continue
            raw = path.read_text(encoding="utf8", errors="replace")
            src = strip_comments(raw)
            rel = str(path.relative_to(ROOT))

            for m in SERVE_CALL.finditer(src):
                if rel == "lib/inventoryServe.js":
                    continue  # the definition, not a caller
                args = split_args(src[m.end():])
                line = src[: m.start()].count("\n") + 1
                sub = args[5] if len(args) > 5 else None
                has_sub = bool(sub) and sub not in ("undefined", "null", "")
                cat_arg = args[0] if args else None
                findings.append({
                    "file": rel, "line": line, "kind": "serveFromInventory",
                    "category": cat_arg,
                    # A read inside `xs.map((cat) => serveFromInventory(cat, …))`
                    # names no category at the call site. Resolving it to the array
                    # the code actually iterates is what lets the audit tell a
                    # DELIBERATE broad read from an unaudited one, instead of
                    # reporting every loop as an unknown.
                    "resolvedCategories": resolve_category_arg(src, m.start(), cat_arg),
                    "n": args[4] if len(args) > 4 else None,
                    "sub": sub if has_sub else None,
                    "identityAtRead": has_sub,
                    "evidence": re.sub(r"\s+", " ", src[m.start(): m.end() + 160]).strip()[:200],
                })

            for m in OWNED_POOL_CALL.finditer(src):
                line = src[: m.start()].count("\n") + 1
                window = src[m.end(): m.end() + 700]
                findings.append({
                    "file": rel, "line": line, "kind": "ownedPool",
                    # `identity:` is the whole point. A fetchOwnedPool call with no
                    # predicate is a deterministic exhaustive read and nothing more
                    # — better than before, and not the fix.
                    "hasIdentity": bool(re.search(r"\bidentity\s*:", window)),
                    "categories": (re.search(r"categories\s*:\s*(\[[^\]]*\]|[A-Za-z0-9_]+)", window).group(1)
                                   if re.search(r"categories\s*:", window) else None),
                    "evidence": re.sub(r"\s+", " ", window[:180]).strip(),
                })

            for m in RAW_READ.finditer(src):
                window = src[max(0, m.start() - 400): m.start() + 700]
                line = src[: m.start()].count("\n") + 1
                # A read keyed on exact place ids cannot starve anything: the
                # filter already names every row it wants, so order and limit are
                # bookkeeping. Separating these is what keeps the "unordered
                # read" list short enough that a reader acts on it.
                exact = bool(re.search(r"place_id=(?:in\.\(|eq\.)", window))
                findings.append({
                    "file": rel, "line": line, "kind": "rawRead",
                    "exactId": exact,
                    "ordered": bool(ORDER_PARAM.search(window)),
                    "paged": bool(RANGE_PAGING.search(window)),
                    "limit": (re.search(r"limit=\$\{?([A-Za-z0-9_.]+)\}?|limit=(\d+)", window).group(0)
                              if re.search(r"limit=", window) else None),
                    "evidence": re.sub(r"\s+", " ", window[380: 560]).strip()[:200],
                })
    return findings


# ---------------------------------------------------------------------------
# NODE BRIDGES
# ---------------------------------------------------------------------------

def node_json(script: str, *args: str) -> dict | list:
    proc = subprocess.run(
        [NODE, str(ROOT / script), *args, "--json"],
        cwd=ROOT, capture_output=True, text=True,
    )
    if proc.returncode not in (0, 1) or not proc.stdout.strip():
        raise RuntimeError(f"{script} failed (rc={proc.returncode}): {(proc.stderr or proc.stdout)[-600:]}")
    return json.loads(proc.stdout.strip().splitlines()[-1])


def surfaces() -> list[dict]:
    proc = subprocess.run(
        [NODE, "-e",
         "import('./scripts/lib/starvationSurfaces.mjs').then(m=>console.log(JSON.stringify("
         "m.SURFACES.map(s=>({id:s.id,title:s.title,route:s.route,reader:s.reader,status:s.status,"
         "categories:s.categories,radiusMi:s.radiusMi,rails:s.rails,oldN:s.oldN,"
         "vulnerableRails:s.vulnerableRails||null,overlappingRails:!!s.overlappingRails,shippedIn:s.shippedIn||null,"
         "broadByDesign:s.broadByDesign||null,railsNotMeasured:s.railsNotMeasured||null})))))"],
        cwd=ROOT, capture_output=True, text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"surface registry failed: {proc.stderr[-600:]}")
    return json.loads(proc.stdout.strip())


# ---------------------------------------------------------------------------
# CLASSIFICATION
#
# A surface is only SAFE or FIXED when the evidence says so. "Do not assume every
# caller is broken" cuts both ways: do not assume one is fine either.
# ---------------------------------------------------------------------------

def classify(surface: dict, static_hits: list[dict], measured: dict | None) -> dict:
    """Verdict from EVIDENCE, in this order: what the route's code does, then what
    the live measurement found. The registry's declared status is never the answer
    — it is only the thing the evidence is allowed to contradict."""
    route = surface["route"]
    serve_hits = [h for h in static_hits if h["file"] == route and h["kind"] == "serveFromInventory"]
    pool_hits = [h for h in static_hits if h["file"] == route and h["kind"] == "ownedPool"]
    reader_hits = [h for h in static_hits
                   if h["file"] == surface.get("reader", "") and h["kind"] in ("ownedPool", "rawRead")]
    broad = [h for h in serve_hits if not h["identityAtRead"]]
    declared_broad = set(surface.get("broadByDesign") or [])

    # A broad read is only forgiven when the registry NAMES the category and says
    # why. Anything else is unaudited.
    def explained(h):
        cats = h.get("resolvedCategories")
        # An unresolved category is never assumed to be fine.
        return bool(cats) and all(c in declared_broad for c in cats)

    unexplained = [h for h in broad if not explained(h)]

    why: list[str] = []
    identity_first = [h for h in pool_hits if h["hasIdentity"]]
    if identity_first:
        why.append(f"{len(identity_first)} identity-first read(s) through lib/ownedPool.js at {route} "
                   f"(deterministic order=place_id.asc, paged to exhaustion, predicate applied before any cost bound)")
    if surface.get("reader", "").endswith("nightOutPool.js") and reader_hits:
        why.append(f"reads through {surface['reader']}, which delegates to lib/ownedPool.js")

    if unexplained:
        verdict = "VULNERABLE"
        why.append(f"{len(unexplained)} broad read(s) with no identity argument and no declared reason: "
                   + ", ".join(f"line {h['line']} cat {h.get('resolvedCategories') or h['category']} n {h['n']}" for h in unexplained))
    elif identity_first or surface.get("reader", "").endswith("nightOutPool.js"):
        verdict = "FIXED"
        for cat in sorted(declared_broad):
            why.append(f"`{cat}` is read broad BY DESIGN: {surface['broadByDesign'][cat]}")
    elif serve_hits:
        verdict = "SAFE"
        why.append("every owned read on this route carries a chip contract, which serveFromInventory "
                   "applies BEFORE its top-N cut (v8.49)")
    else:
        verdict = "NOT APPLICABLE"
        why.append("no owned-inventory read found on this route")

    if measured:
        gained = measured.get("recovered", 0)
        lost = measured.get("railsThatLost", [])
        why.append(f"measured at {measured['lat']},{measured['lng']}: "
                   f"{measured['old']['qualified']} qualifying under a cap-first read vs "
                   f"{measured['next']['qualified']} under a complete owned read (+{gained})")
        # The measurement outranks the source reading in BOTH directions, because a
        # source reading is a hypothesis and this is the product.
        if verdict in ("SAFE", "FIXED") and gained > 0 and unexplained:
            verdict = "VULNERABLE"
            why.append("the source read clean, but the live measurement recovered candidates — the measurement wins")
        if lost:
            why.append("RAILS THAT LOST CANDIDATES: " + ", ".join(f"{r['id']} {r['old']}->{r['next']}" for r in lost))
    return {"verdict": verdict, "evidence": why}


# ---------------------------------------------------------------------------
# REPORT
# ---------------------------------------------------------------------------

def write_markdown(report: dict, path: Path) -> None:
    L: list[str] = []
    a = L.append
    a(f"# Candidate-starvation audit — {report['date']}")
    a("")
    a(f"Mode `{report['mode']}` · {len(report['surfaces'])} surfaces · "
      f"{report['static']['ownedReads']} owned reads found in source · "
      f"{report['static']['unorderedRawReads']} raw reads with no `order=`")
    a("")
    a("The order this audit requires, and the order it rejects:")
    a("")
    a("```")
    a("REJECT   broad category -> database limit or broad top-N -> narrow classifier")
    a("REQUIRE  complete nearby owned universe -> serviceability gates -> exact identity")
    a("         -> Wayfind Score -> output bound")
    a("```")
    a("")
    sm = report.get("summary") or {}
    if sm.get("distinctPlacesRecoveredPending") is not None:
        a("## What this change recovers")
        a("")
        a("| | distinct places | rail slots |")
        a("|---|---|---|")
        a(f"| pending in this change | **{sm['distinctPlacesRecoveredPending']}** | {sm['railSlotsPending']} |")
        a(f"| already shipped earlier | {sm['distinctPlacesRecoveredAlreadyShipped']} | {sm['railSlotsAlreadyShipped']} |")
        a("")
        a("**Read the left column.** A rail slot is not a place: one restaurant that qualifies for two")
        a("rails counts twice, and the metro boxes overlap, so summing slots counts the same venue")
        a("several times over. Distinct place ids are the honest unit. Surfaces marked *already shipped*")
        a("were repaired in an earlier PR and their recovery is in production already.")
        a("")
    a("## How the \"shipped read\" column is produced, and what is modelled")
    a("")
    a("Both columns read the SAME owned rows. Only the cut differs: the shipped column re-applies the")
    a("cut the route used to make (the database window, the chip contract where the route carried one,")
    a("then the real `rankInventory` top-N) to those same rows.")
    a("")
    a("One part of that is a **model, not a measurement**: the old `limit=1000` carried no `ORDER BY`,")
    a("so which thousand Postgres returned is unknowable after the fact. It is modelled here as the")
    a("first 1,000 by `place_id`. Any deterministic stand-in is arbitrary. What is *not* arbitrary is")
    a("that a thousand arrived and the rest did not.")
    a("")
    a("## Surfaces")
    a("")
    a("| surface | route | radius | categories | verdict |")
    a("|---|---|---|---|---|")
    for s in report["surfaces"]:
        a(f"| {s['title']} | `{s['route']}` | {s['radiusMi']} mi | {', '.join(s['categories'])} | **{s['verdict']}**{' (shipped ' + s['shippedIn'] + ')' if s.get('shippedIn') else ''} |")
    a("")
    for s in report["surfaces"]:
        a(f"### {s['title']} — {s['verdict']}")
        a("")
        for e in s["evidence"]:
            a(f"- {e}")
        a("")
        for metro, m in (s.get("measurements") or {}).items():
            if not isinstance(m, dict) or "old" not in m:
                a(f"- {metro}: {m}")
                continue
            a(f"**{metro}** — owned rows in box {m['next']['rows']}, servable {m['next']['servable']}, "
              f"within {s['radiusMi']}mi {m['next']['withinRadius']}, qualifying {m['next']['qualified']}"
              + ("  **[TRUNCATED]**" if m["next"].get("truncated") else ""))
            a("")
            a("| rail | shipped read | complete read | gained |")
            a("|---|---|---|---|")
            for r in m["rails"]:
                d = r["next"] - r["old"]
                a(f"| {r['title']} | {r['old']} | {r['next']} | {'+' if d > 0 else ''}{d} |")
            a("")
            for rid, reason in (m.get("railsNotMeasured") or {}).items():
                a(f"`{rid}` is not measured here: {reason}")
                a("")
            if m["stillZero"]:
                a(f"Still zero with the COMPLETE owned pool — not candidate starvation, so no amount of "
                  f"retrieval will move it: `{', '.join(m['stillZero'])}`")
                a("")
    c = report.get("controls")
    if c:
        a("## Honesty controls")
        a("")
        a(f"{c['assertions']} assertions, {'all held' if c['ok'] else str(len(c['failures'])) + ' FAILED'}. "
          "Category honesty (restaurant is not a beach, a waterfront restaurant is not a night cruise, "
          "a breakfast counter is not a date dinner, a bar is not a performing-arts show, a hotel is not "
          "an attraction), the universal serviceability refusals, and — per surface — a qualifying "
          "candidate buried below the broad-category cap proven reachable identity-first and "
          "UNREACHABLE cap-first in the same run.")
        a("")
        for sid, mu in (c.get("mutations") or {}).items():
            a(f"- `{sid}`: buried at corpus index {mu['buriedIndex']} of {mu['corpus']}; "
              f"identity-first admits {mu['identityFirst']}, cap-first admits {mu['capFirst']} and never the buried row")
        a("")
        for f in c.get("failures") or []:
            a(f"- **FAILED**: {f}")
        a("")
    a("## Legacy watchlist audit")
    a("")
    a("These six items began as deferred findings. They remain audited after repair so deleting a helper,")
    a("identity, completeness check, or successor path cannot turn missing evidence into a clean report.")
    a("")
    for w in report.get("watchlistAudit", []):
        a(f"**{w['verdict']} — `{w['file']}`**")
        a("")
        for evidence in w["evidence"]:
            a(f"- {evidence}")
        a(f"- historical cut: {w['cut']}")
        a(f"- historical impact: {w['impact']}")
        a("")
    a("## Historical source-shape probes")
    a("")
    a("These source-only probes preserve the original hypotheses without upgrading them into evidence.")
    a("The executable legacy audit above decides whether each repaired invariant still holds.")
    a("")
    for w in report.get("sourceWatchlist", []):
        a(f"**`{w['file']}`**")
        a("")
        a(f"- classification: `{w['classification']}` · source shape: `{w['sourceStatus']}` ({w['sourceEvidence']})")
        a(f"- the cut: {w['cut']}")
        a(f"- what it costs: {w['impact']}")
        a(f"- why it was left: {w['why_deferred']}")
        a("")
    a("## Raw reads with no `order=`")
    a("")
    a("An unordered `limit=` read returns an arbitrary slice in Postgres heap order, which any UPDATE "
      "reshuffles. It is the upstream half of the bug and it is invisible: the same query returns a "
      "different answer tomorrow and nothing goes red.")
    a("")
    for h in report["static"]["unordered"]:
        a(f"- `{h['file']}:{h['line']}` — {h.get('limit') or 'no limit found'}")
    a("")
    path.write_text("\n".join(L), encoding="utf8")



# ---------------------------------------------------------------------------
# THE OLD SIX-ITEM WATCHLIST IS NOW AN AUDITED CONTRACT
#
# These began as prose describing work deferred from the first audit. All six
# have since been repaired. Leaving the prose unchanged would make the weekly
# report lie in the other direction; deleting it would let any repair disappear
# without the auditor noticing. Keep the historical cut and impact, then prove
# the current resolution from executable source. A missing file, helper, call,
# identity, completeness check, or successor path is VULNERABLE. In particular,
# deleting the retired generic feed is only a fix while the dedicated Night Out
# path exists and no runtime caller still asks for the retired endpoint.
# ---------------------------------------------------------------------------

LEGACY_WATCHLIST = [
    {
        "id": "generic-intent-feed",
        "file": "app/api/intent-candidates/route.js:70",
        "cut": "per-category top-400, then a GLOBAL `places.slice(0, limit)` (400, max 600) by raw Wayfind Score before any rail identity runs",
        "why_deferred": "its consumers apply their own identity downstream, and its largest consumer — Night Out — now has its own identity-first route, so this is the client's fail-soft fallback rather than the shipped answer",
        "impact": "a niche venue that did not crack the global top-400 by score is invisible to every rail that would have wanted it",
    },
    {
        "id": "inventory-box-batch",
        "file": "lib/inventoryBoxBatch.js:93",
        "cut": "a consolidated union read across a metro cluster's WIDE boxes with `limit = min(1000 * cities, 20000)` and NO `order=`",
        "why_deferred": "it is a hot path feeding the landing pools, where the sub is always 'all' and no narrow identity follows — the damage is nondeterminism rather than starvation, and it deserves its own change with its own measurement",
        "impact": "a cluster whose union exceeds the limit is ranked over an arbitrary heap slice, so the same query returns a different top list after any UPDATE",
    },
    {
        "id": "morning-identity-pools",
        "file": "lib/railsData.js:993-994",
        "cut": "buildIdentityPool for breakfast and quickeats passes no `typeOv`, so its tier-2 read has no category or type filter at all: every row in the box, ordered by review count, top 300, and only then isBreakfastPlace / isQuickService",
        "why_deferred": "ordered (so deterministic) and on a small radius, and it sits inside the rail-menu compute where a change needs its own latency measurement",
        "impact": "a genuine breakfast cafe with modest review count, in a dense box holding 300 more-reviewed rows of any category, never reaches the predicate",
    },
    {
        "id": "nearby-complete-rings",
        "file": "lib/nearbyPool.js:258",
        "cut": "`limit=400` per ring ordered by review count, with identity applied after the read but before any further cut",
        "why_deferred": "identity already runs before every count-based cut, and the ring ladder widens when the identity-passed count is short — the mildest form of the shape",
        "impact": "a long-tail identity match outside the 400 most-reviewed rows of a dense ring is still excluded",
    },
    {
        "id": "date-night-shopping",
        "file": "app/api/date-night/route.js",
        "cut": "not a retrieval bug — the `shopping` rail is declared in DATE_NIGHT_RAIL_DEFS but no `shopping` category is ever read, so it can never populate",
        "why_deferred": "found by this audit, fixed separately: adding a read is a product change, not a retrieval fix",
        "impact": "one Date Night rail is permanently empty everywhere",
    },
    {
        "id": "today-instagram-exact-ids",
        "file": "app/api/today-discovery/route.js",
        "cut": "not a retrieval bug — the Instagram rail's evidence is a curated creator-video set, and the places carrying it are still reached only through the broad food/nightlife/hotels/shopping reads",
        "why_deferred": "the honest fix is an exact place-id read for the curated set, like Birthday's rewards, which is a small change with its own proof",
        "impact": "an Instagram-corroborated place outside the top 400 of its category is invisible to the rail built for it",
    },
]

# Upstream's source-only view uses the same six historical hypotheses without
# inheriting the executable verdict. Keeping one metadata list prevents a
# description change from silently drifting between the two report sections.
WATCHLIST = [
    {key: item[key] for key in ("file", "cut", "why_deferred", "impact")}
    for item in LEGACY_WATCHLIST
]

# These probes verify only that the source shape behind each hypothesis still
# exists. They do not upgrade a source observation into production evidence.
WATCHLIST_PROBES = {
    "app/api/intent-candidates/route.js:70": ("present", r"serveFromInventory\([^)]*PER_CAT_N\)[\s\S]*places\.slice\(0,\s*limit\)"),
    "lib/inventoryBoxBatch.js:93": ("present", r"limit\s*=\s*Math\.min\(1000\s*\*\s*cluster\.cities\.length,\s*20000\)"),
    "lib/railsData.js:993-994": ("present", r"buildIdentityPool\([\s\S]{0,500}isBreakfastPlace[\s\S]{0,500}\{\s*readCache\s*\}"),
    "lib/nearbyPool.js:258": ("present", r"order=signals->reviews\.desc\.nullslast&limit=400"),
    "app/api/date-night/route.js": ("absent", r"(?:categories\s*:\s*\[\s*[\"']shopping[\"']|serveFromInventory\(\s*[\"']shopping[\"'])"),
    "app/api/today-discovery/route.js": ("present", r"broadCategories\s*=\s*\[[^\]]*[\"']shopping[\"'][^\]]*\]"),
}


def evaluate_watchlist(root: Path = ROOT) -> list[dict]:
    evaluated = []
    for item in WATCHLIST:
        mode, pattern = WATCHLIST_PROBES[item["file"]]
        rel = item["file"].split(":", 1)[0]
        path = root / rel
        if not path.is_file():
            state = "RETIRED"
            evidence = f"{rel} no longer exists"
        else:
            source = strip_comments(path.read_text(encoding="utf8", errors="replace"))
            matched = bool(re.search(pattern, source, re.S))
            shape_holds = matched if mode == "present" else not matched
            state = "MATCHED" if shape_holds else "CHANGED"
            evidence = "source probe still matches" if shape_holds else "source probe no longer matches"
        evaluated.append({
            **item,
            "classification": "SOURCE_HYPOTHESIS",
            "sourceStatus": state,
            "sourceEvidence": evidence,
        })
    return evaluated


def _source(root: Path, rel: str) -> str | None:
    path = root / rel
    if not path.is_file():
        return None
    return strip_comments(path.read_text(encoding="utf8", errors="replace"))


def _function(src: str | None, name: str) -> str | None:
    """Return one named JS function through its balanced closing brace.

    Scoping checks to the function prevents a reassuring token elsewhere in a
    large route from satisfying the contract. This is deliberately a small JS
    scanner, not a parser; unresolved or malformed source fails closed.
    """
    if not src:
        return None
    m = re.search(r"\b(?:export\s+)?(?:async\s+)?function\s+" + re.escape(name) + r"\s*\([^)]*\)\s*\{", src)
    if not m:
        return None
    # The regex ends on the function body's opening brace. Searching from the
    # function name would stop on a destructured parameter or `deps = {}`.
    start = m.end() - 1
    depth, quote, escaped = 0, None, False
    for i in range(start, len(src)):
        ch = src[i]
        if quote:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
                quote = None
            continue
        if ch in "\"'`":
            quote = ch
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return src[m.start(): i + 1]
    return None


def _calls(src: str | None, name: str) -> list[str]:
    """Return balanced calls to `name`; an unterminated call is not evidence."""
    if not src:
        return []
    found: list[str] = []
    for m in re.finditer(r"\b" + re.escape(name) + r"\s*\(", src):
        start = src.find("(", m.start())
        depth, quote, escaped = 0, None, False
        for i in range(start, len(src)):
            ch = src[i]
            if quote:
                if escaped:
                    escaped = False
                elif ch == "\\":
                    escaped = True
                elif ch == quote:
                    quote = None
                continue
            if ch in "\"'`":
                quote = ch
            elif ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    found.append(src[m.start(): i + 1])
                    break
    return found


def _result(meta: dict, checks: list[tuple[bool, str, str]]) -> dict:
    failures = [failure for held, _, failure in checks if not held]
    evidence = [proof for held, proof, _ in checks if held]
    evidence.extend(f"FAILED: {failure}" for failure in failures)
    return {
        **meta,
        "verdict": "FIXED" if not failures else "VULNERABLE",
        "evidence": evidence,
        "failures": failures,
    }


def audit_legacy_watchlist(root: Path = ROOT) -> list[dict]:
    """Prove the six former watchlist fixes; never infer safety from absence."""
    by_id = {item["id"]: item for item in LEGACY_WATCHLIST}
    out: list[dict] = []
    owned_src = _source(root, "lib/ownedPool.js")
    owned_read = _function(owned_src, "readOwnedCategory")
    owned_fetch = _function(owned_src, "fetchOwnedPool")
    owned_reader_held = bool(
        owned_read and "order=place_id.asc" in owned_read and '"Range-Unit": "items"' in owned_read
        and "truncated: false" in owned_read and owned_fetch
        and re.search(r"if\s*\(\s*truncated\s*&&\s*!opts\.allowTruncated\s*\)", owned_fetch)
    )

    # 1. The cap-first endpoint was retired. Absence alone is not proof: require
    # its dedicated successor and prove no app/lib caller still names the old
    # endpoint or hook.
    old_route = root / "app/api/intent-candidates/route.js"
    old_hook = root / "app/components/useIntentCandidates.js"
    night_route = _source(root, "app/api/night-out/route.js")
    night_component = _source(root, "app/components/NightOutRails.js")
    night_reader = _source(root, "lib/nightOutPool.js")
    night_fetch = _function(night_reader, "fetchNightOutPool")
    night_admit = _function(night_reader, "admitNightOutRows")
    runtime_refs = []
    for top in ("app", "lib"):
        base = root / top
        if not base.is_dir():
            runtime_refs.append(f"missing runtime tree {top}/")
            continue
        for path in base.rglob("*.js"):
            src = strip_comments(path.read_text(encoding="utf8", errors="replace"))
            if re.search(r"/api/intent-candidates|\buseIntentCandidates\b", src):
                runtime_refs.append(str(path.relative_to(root)))
    out.append(_result(by_id["generic-intent-feed"], [
        (not old_route.exists() and not old_hook.exists(),
         "the cap-first endpoint and duplicate client hook are retired",
         "the retired cap-first endpoint or client hook exists"),
        (not runtime_refs, "no app/lib runtime caller names the retired feed",
         "retired feed still has runtime references: " + ", ".join(runtime_refs)),
        (bool(night_route and re.search(r"\bfetchNightOutPool\s*\(", night_route)),
         "the dedicated Night Out route calls its identity-first owned reader",
         "dedicated Night Out successor is missing or does not call fetchNightOutPool"),
        (bool(night_component and re.search(r"fetchJsonWithDeadline\s*\(\s*[\"']/api/night-out\?", night_component)),
         "NightOutRails calls the dedicated bounded endpoint",
         "NightOutRails does not call the dedicated Night Out endpoint"),
        (bool(night_fetch and night_admit and "readCategory(" in night_fetch
              and "admitNightOutRows(raw" in night_fetch and "railOf(place)" in night_admit),
         "the successor reads the owned pool before calling the shipped Night Out identity",
         "the dedicated Night Out reader or its identity admission is missing"),
    ]))

    # 2. The union reader is an accelerator only. Deterministic order plus a
    # exact count plus full-limit refusal keeps incomplete universes out of cache.
    batch = _source(root, "lib/inventoryBoxBatch.js")
    union = _function(batch, "fetchUnionBox")
    prime = _function(batch, "primeConsolidatedInventoryReads")
    rejects_full = bool(union and re.search(
        r"if\s*\(\s*!Array\.isArray\(rows\)\s*\|\|\s*rows\.length\s*>=\s*limit\s*\)\s*return\s*\[\]", union))
    out.append(_result(by_id["inventory-box-batch"], [
        (union is not None and prime is not None,
         "the union reader and cache-prime caller both exist",
         "fetchUnionBox or primeConsolidatedInventoryReads is missing"),
        (bool(union and "order=place_id.asc" in union),
         "the union read has stable place_id order",
         "union read is not ordered by place_id.asc"),
        (bool(union and '"count=exact"' in union
              and "contentRangeTotal(r.headers)" in union
              and "total === null || total !== rows.length" in union
              and len(_calls(union, "fetchDeadline")) == 1
              and _function(batch, "contentRangeTotal")),
         "exact server count proves completeness and failure cannot narrow the union",
         "union lacks exact count proof or retries a narrowed universe"),
        (rejects_full,
         "a non-array or full-limit response is refused as ambiguous",
         "union reader does not refuse rows.length >= limit"),
        (bool(prime and re.search(r"if\s*\(\s*!rows\.length\s*\)\s*return", prime)
              and "deps.readUnion || fetchUnionBox" in prime),
         "an empty/refused accelerator result leaves the authoritative reads unprimed",
         "the prime path can cache a refused result or no longer uses fetchUnionBox"),
    ]))

    # 3. Breakfast and Quick Eats share one complete owned-food read. Require
    # both real identities inside that read, use of its survivors, and a call
    # after creators are assigned (one of the helper's declared source pools).
    rails = _source(root, "lib/railsData.js")
    morning = _function(rails, "buildMorningIdentityPools")
    owned_calls = _calls(morning, "fetchOwnedPool")
    morning_call = owned_calls[0] if len(owned_calls) == 1 else ""
    creator_at = rails.find("pools.creators = creators") if rails else -1
    invocation_at = rails.rfind("buildMorningIdentityPools(pools, origin)") if rails else -1
    out.append(_result(by_id["morning-identity-pools"], [
        (morning is not None and len(owned_calls) == 1,
         "one shared morning helper performs one exhaustive owned read",
         "buildMorningIdentityPools is missing or does not contain exactly one fetchOwnedPool call"),
        (bool(re.search(r"categories\s*:\s*\[\s*[\"']food[\"']\s*\]", morning_call)
              and re.search(r"\bidentity\s*:", morning_call)),
         "the shared read injects identity into the owned food pool",
         "the shared read lacks food category or an injected identity"),
        ("isBreakfastPlace(place)" in morning_call and "isStrongQuickService(place)" in morning_call,
         "breakfast and strong Quick Eats identities both run inside admission",
         "one of the two real morning identities is outside the owned-pool admission"),
        (bool(morning and "owned.places" in morning),
         "both output pools are assembled from admitted owned survivors",
         "the helper does not consume the admitted owned.places result"),
        (owned_reader_held,
         "the shared owned reader is ordered, exhaustive, and refuses truncation",
         "lib/ownedPool.js is missing or no longer proves ordered paging and truncation refusal"),
        (bool(rails and not re.search(r"buildIdentityPool\s*\(\s*pools\s*,\s*origin\s*,\s*(?:isBreakfastPlace|isQuickService)", rails)),
         "the old broad top-300 morning widening calls are absent",
         "Breakfast or Quick Eats still calls the broad capped buildIdentityPool path"),
        (creator_at >= 0 and invocation_at > creator_at,
         "the helper runs after pools.creators is assigned",
         "the morning helper is missing at its consumer or runs before creators are available"),
    ]))

    # 4. Nearby rings use the shared exhaustive pager. The truncated refusal
    # must execute before any returned row faces identity and scoring.
    nearby = _source(root, "lib/nearbyPool.js")
    nearby_fn = _function(nearby, "buildNearbyPool")
    read_at = nearby_fn.find("readOwnedCategory(") if nearby_fn else -1
    trunc_at = nearby_fn.find("result.truncated") if nearby_fn else -1
    rows_at = nearby_fn.find("result.rows") if nearby_fn else -1
    identity_at = nearby_fn.find("identity: cfg.identity") if nearby_fn else -1
    out.append(_result(by_id["nearby-complete-rings"], [
        (read_at >= 0, "each selected ring reads through readOwnedCategory",
         "buildNearbyPool is missing or bypasses readOwnedCategory"),
        (bool(nearby_fn and "pageSize:" in nearby_fn and "maxRows:" in nearby_fn),
         "the ring reader declares paging and a loud runaway bound",
         "the exhaustive ring read lost its page size or runaway bound"),
        (read_at < trunc_at < rows_at if read_at >= 0 else False,
         "a truncated/incomplete read is refused before rows face selection",
         "result.truncated is missing or checked after candidate iteration"),
        (bool(nearby_fn and "includeStatus" in nearby_fn and "finish(best, !complete)" in nearby_fn
              and rails and "includeStatus: true" in rails
              and "built.some((result) => result.degraded)" in rails
              and 'throw new Error("Nearby inventory reads incomplete")' in rails),
         "incomplete Nearby reads reach the rail failure contract",
         "Nearby can turn an incomplete read into a healthy cached fallback"),
        (identity_at > rows_at >= 0,
         "the category identity runs only over the completed ring",
         "the completed rows do not reach cfg.identity after the truncation check"),
        (not bool(nearby_fn and re.search(r"limit=400|signals->reviews\.desc\.nullslast", nearby_fn)),
         "the old review-ranked 400-row shelf is absent",
         "the old review-ranked 400-row candidate shelf returned"),
        (owned_reader_held,
         "the shared owned reader is ordered, exhaustive, and refuses truncation",
         "lib/ownedPool.js is missing or no longer proves ordered paging and truncation refusal"),
    ]))

    # 5. Shopping is a real input to Date Night, with its shipped predicate
    # injected before ranking, and degradation prevents a partial answer from
    # masquerading as complete.
    date = _source(root, "app/api/date-night/route.js")
    date_fn = _function(date, "buildDateNightAnswer")
    date_calls = _calls(date_fn, "fetchOwnedPool")
    shopping_calls = [c for c in date_calls if re.search(r"categories\s*:\s*\[\s*[\"']shopping[\"']\s*\]", c)]
    shopping_call = shopping_calls[0] if len(shopping_calls) == 1 else ""
    out.append(_result(by_id["date-night-shopping"], [
        (len(shopping_calls) == 1 and bool(re.search(r"\bidentity\s*:\s*isDateShopping\b", shopping_call)),
         "Shopping has one exhaustive owned read with isDateShopping injected",
         "Date Night lacks exactly one shopping read with isDateShopping at admission"),
        (bool(date_fn and (re.search(r"Promise\.resolve\(\s*shoppingPool\.places\s*\)", date_fn)
                           or re.search(r"ownedPools\.then\s*\(\s*\(\s*\[\s*,\s*shopping\s*\]\s*\)\s*=>\s*shopping\.places", date_fn))),
         "admitted shopping survivors feed the rail composer",
         "shoppingPool.places does not reach composition"),
        (bool(date_fn and re.search(r"shoppingPool\.stats\.degraded", date_fn)),
         "shopping read degradation marks the answer incomplete",
         "a degraded shopping read can masquerade as a complete answer"),
        (not bool(date_fn and re.search(r"serveFromInventory\s*\(\s*[\"']shopping[\"']", date_fn)),
         "Shopping does not fall back to a broad capped category shelf",
         "Date Night Shopping uses broad serveFromInventory again"),
        (owned_reader_held,
         "the shared owned reader is ordered, exhaustive, and refuses truncation",
         "lib/ownedPool.js is missing or no longer proves ordered paging and truncation refusal"),
    ]))

    # 6. Instagram identity is an exact curated Place-ID set, so those rows are
    # admitted independently of broad category shelves and merged before them.
    today = _source(root, "app/api/today-discovery/route.js")
    ids_fn = _function(today, "instagramPlaceIds")
    exact_fn = _function(today, "exactInstagramInventory")
    get_fn = _function(today, "GET")
    exact_reader = _function(_source(root, "lib/inventoryServe.js"), "serveInventoryByPlaceIds")
    exact_calls = _calls(exact_fn, "serveInventoryByPlaceIds")
    creator_at = get_fn.find("for (const raw of creatorExact)") if get_fn else -1
    broad_at = get_fn.find("pools.forEach") if get_fn else -1
    out.append(_result(by_id["today-instagram-exact-ids"], [
        (bool(ids_fn and "allCreators()" in ids_fn and "spot.placeId" in ids_fn
              and re.search(r"instagram", ids_fn, re.I)),
         "the exact set is derived from curated Instagram creator place IDs",
         "instagramPlaceIds is missing or no longer derives curated Instagram place IDs"),
        (bool(exact_fn and "instagramPlaceIds()" in exact_fn and len(exact_calls) == 1),
         "the curated IDs are read through one chunked exact-ID call site",
         "exactInstagramInventory is missing or bypasses serveInventoryByPlaceIds"),
        (bool(exact_calls and re.search(r"\bfailLoud\s*:\s*true\b", exact_calls[0])),
         "exact-ID read failure is loud rather than a plausible empty rail",
         "the exact Instagram read is not fail-loud"),
        (bool(exact_reader and "place_id=in.(${list})" in exact_reader
              and "if (options.failLoud) throw error" in exact_reader),
         "the shared exact-ID reader queries place_id and propagates fail-loud errors",
         "serveInventoryByPlaceIds is missing or no longer exact and fail-loud"),
        (bool(get_fn and "exactInstagramInventory(lat, lng, radiusM)" in get_fn),
         "the shipped Today request awaits the exact Instagram inventory",
         "the Today GET path does not call exactInstagramInventory"),
        (creator_at >= 0 and broad_at > creator_at,
         "exact creator places are admitted before broad category shelves",
         "creatorExact is missing from composition or is admitted after broad shelves"),
    ]))

    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mode", default="controls", choices=["static", "controls", "production-readonly"])
    ap.add_argument("--metros", default="parrish", help="comma-separated: " + ",".join(METROS))
    ap.add_argument("--surface", default="", help="limit to one surface id")
    ap.add_argument("--report", action="store_true", help="also write docs/audits/…md")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    static_hits = scan_sources()
    owned_reads = [h for h in static_hits if h["kind"] == "serveFromInventory"]
    raw_reads = [h for h in static_hits if h["kind"] == "rawRead"]
    # scripts/ are diagnostics and guards, not serving paths — an unordered read
    # there cannot starve a reader. They are still SCANNED (so a diagnostic that
    # quietly became a serving helper would show up), just reported separately.
    unordered = [h for h in raw_reads if not h["ordered"] and not h["exactId"] and not h["file"].startswith("scripts/")]
    exact_id_reads = [h for h in raw_reads if h["exactId"]]
    unordered_scripts = [h for h in raw_reads if not h["ordered"] and h["file"].startswith("scripts/")]

    regs = surfaces()
    if args.surface:
        regs = [s for s in regs if s["id"] == args.surface]
        if not regs:
            print(f"unknown surface {args.surface}", file=sys.stderr)
            return 2

    controls = None
    if args.mode in ("controls", "production-readonly"):
        controls = node_json("scripts/audit-starvation-controls.mjs")

    try:
        metros = parse_metros(args.metros)
    except ValueError as exc:
        print(f"audit_candidate_starvation: {exc}", file=sys.stderr)
        return 2
    production_errors: list[dict] = []
    requested_measurements = len(regs) * len(metros) if args.mode == "production-readonly" else 0
    completed_measurements = 0
    out_surfaces = []
    for s in regs:
        measurements: dict = {}
        if args.mode == "production-readonly":
            for metro in metros:
                lat, lng = METROS[metro]
                try:
                    measured = node_json(
                        "scripts/audit-starvation-measure.mjs",
                        f"--surface={s['id']}", f"--lat={lat}", f"--lng={lng}")
                    invalid = validate_measurement(measured, s, lat, lng)
                    if invalid:
                        raise RuntimeError("invalid measurement: " + "; ".join(invalid))
                    measurements[metro] = measured
                    if measured["readEvidence"]["complete"]:
                        completed_measurements += 1
                    else:
                        production_errors.append({
                            "surface": s["id"], "metro": metro,
                            "error": "owned read was incomplete, failed, or truncated",
                        })
                except Exception as exc:  # a metro that cannot be read is reported, never silently dropped
                    measurements[metro] = {"status": "ERROR", "error": str(exc)}
                    production_errors.append({"surface": s["id"], "metro": metro, "error": str(exc)})
        first = next((m for m in measurements.values() if isinstance(m, dict) and "old" in m), None)
        verdict = classify(s, static_hits, first)
        out_surfaces.append({**s, **verdict, "measurements": measurements})

    watchlist_audit = audit_legacy_watchlist()
    unresolved_watchlist = [item for item in watchlist_audit if item["verdict"] != "FIXED"]
    source_watchlist = evaluate_watchlist()
    report = {
        "date": _dt.date.today().isoformat(),
        "mode": args.mode,
        "metros": metros if args.mode == "production-readonly" else [],
        "static": {
            "ownedReads": len(owned_reads),
            "readsWithIdentityAtRead": sum(1 for h in owned_reads if h["identityAtRead"]),
            "broadReads": [h for h in owned_reads if not h["identityAtRead"]],
            "rawReads": len(raw_reads),
            "unorderedRawReads": len(unordered),
            "unordered": unordered,
            "unorderedInScripts": len(unordered_scripts),
            "exactIdReads": len(exact_id_reads),
        },
        "controls": controls,
        "watchlistAudit": watchlist_audit,
        "watchlist": unresolved_watchlist,
        "unresolvedWatchlist": unresolved_watchlist,
        "sourceWatchlist": source_watchlist,
        "resolvedWatchlist": [item for item in watchlist_audit if item["verdict"] == "FIXED"],
        "surfaces": out_surfaces,
    }
    verdicts = {s["id"]: s["verdict"] for s in out_surfaces}

    # THE HONEST TOTALS. Rail SLOTS double-count a place that sits on two rails
    # and, summed across overlapping metro boxes, count one restaurant many times.
    # Distinct place ids are the number that can be called "places we were
    # hiding". And a surface already repaired in an earlier PR is counted apart
    # from what merging THIS change would add.
    pending, shipped = set(), set()
    slots_pending = slots_shipped = 0
    for s in out_surfaces:
        already = bool(s.get("shippedIn"))
        for m in (s.get("measurements") or {}).values():
            if not isinstance(m, dict):
                continue
            ids = set(m.get("recoveredPlaceIds") or [])
            (shipped if already else pending).update(ids)
            if already:
                slots_shipped += m.get("recovered", 0)
            else:
                slots_pending += m.get("recovered", 0)
    production_complete = (args.mode == "production-readonly"
                           and requested_measurements > 0
                           and completed_measurements == requested_measurements
                           and not production_errors)
    report["production"] = {
        "complete": production_complete if args.mode == "production-readonly" else None,
        "requestedMeasurements": requested_measurements,
        "completedMeasurements": completed_measurements,
        "errors": production_errors,
    }
    report["summary"] = {
        "vulnerable": [k for k, v in verdicts.items() if v == "VULNERABLE"],
        "fixed": [k for k, v in verdicts.items() if v == "FIXED"],
        "safe": [k for k, v in verdicts.items() if v == "SAFE"],
        "distinctPlacesRecoveredPending": len(pending) if production_complete else None,
        "distinctPlacesRecoveredAlreadyShipped": len(shipped - pending) if production_complete else None,
        "railSlotsPending": slots_pending if production_complete else None,
        "railSlotsAlreadyShipped": slots_shipped if production_complete else None,
        "watchlistFixed": [item["id"] for item in watchlist_audit if item["verdict"] == "FIXED"],
        "watchlistVulnerable": [item["id"] for item in unresolved_watchlist],
    }

    (ROOT / "artifacts").mkdir(exist_ok=True)
    (ROOT / "artifacts" / "candidate-starvation-audit.json").write_text(
        json.dumps(report, indent=2), encoding="utf8")
    if args.report:
        (ROOT / "docs" / "audits").mkdir(parents=True, exist_ok=True)
        write_markdown(report, ROOT / "docs" / "audits" / f"candidate-starvation-audit-{report['date']}.md")

    if not args.quiet:
        print(f"\ncandidate-starvation audit — mode {args.mode}")
        print(f"  owned reads in source            : {len(owned_reads)} "
              f"({report['static']['readsWithIdentityAtRead']} carry identity AT the read)")
        print(f"  raw wf_inventory reads           : {len(raw_reads)}  ({len(unordered)} with NO order=)")
        if controls:
            print(f"  honesty + mutation controls      : {controls['assertions']} assertions, "
                  + ("all held" if controls["ok"] else f"{len(controls['failures'])} FAILED"))
        print(f"  legacy watchlist fixes           : {len(watchlist_audit) - len(unresolved_watchlist)}/{len(watchlist_audit)} verified")
        for item in unresolved_watchlist:
            print(f"      · {item['id']}: " + "; ".join(item["failures"]))
        print("")
        for s in out_surfaces:
            print(f"  {s['id']:<18} {s['verdict']:<15} {s['radiusMi']:>3}mi  {', '.join(s['categories'])}")
            for e in s["evidence"]:
                print(f"      · {e}")
        print("")
        print(f"  artifacts/candidate-starvation-audit.json written")

    # Registered VULNERABLE surfaces remain report findings. The six legacy
    # items are different: they are repaired invariants now, so every mode must
    # fail if one regresses. Production mode also fails when any requested
    # measurement is missing, rejected, or truncated. JSON is written first.
    controls_ok = controls is None or controls["ok"]
    legacy_ok = not unresolved_watchlist
    production_ok = args.mode != "production-readonly" or production_complete
    return 0 if controls_ok and legacy_ok and production_ok else 1


if __name__ == "__main__":
    sys.exit(main())
