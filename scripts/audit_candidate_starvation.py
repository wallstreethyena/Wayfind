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
         "vulnerableRails:s.vulnerableRails||null,overlappingRails:!!s.overlappingRails,"
         "broadByDesign:s.broadByDesign||null})))))"],
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
    a("## Surfaces")
    a("")
    a("| surface | route | radius | categories | verdict |")
    a("|---|---|---|---|---|")
    for s in report["surfaces"]:
        a(f"| {s['title']} | `{s['route']}` | {s['radiusMi']} mi | {', '.join(s['categories'])} | **{s['verdict']}** |")
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

    metros = [m.strip() for m in args.metros.split(",") if m.strip() in METROS]
    out_surfaces = []
    for s in regs:
        measurements: dict = {}
        if args.mode == "production-readonly":
            for metro in metros:
                lat, lng = METROS[metro]
                try:
                    measurements[metro] = node_json(
                        "scripts/audit-starvation-measure.mjs",
                        f"--surface={s['id']}", f"--lat={lat}", f"--lng={lng}")
                except Exception as exc:  # a metro that cannot be read is reported, never silently dropped
                    measurements[metro] = f"MEASUREMENT FAILED: {exc}"
        first = next((m for m in measurements.values() if isinstance(m, dict)), None)
        verdict = classify(s, static_hits, first)
        out_surfaces.append({**s, **verdict, "measurements": measurements})

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
        "surfaces": out_surfaces,
    }
    verdicts = {s["id"]: s["verdict"] for s in out_surfaces}
    report["summary"] = {
        "vulnerable": [k for k, v in verdicts.items() if v == "VULNERABLE"],
        "fixed": [k for k, v in verdicts.items() if v == "FIXED"],
        "safe": [k for k, v in verdicts.items() if v == "SAFE"],
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
        print("")
        for s in out_surfaces:
            print(f"  {s['id']:<18} {s['verdict']:<15} {s['radiusMi']:>3}mi  {', '.join(s['categories'])}")
            for e in s["evidence"]:
                print(f"      · {e}")
        print("")
        print(f"  artifacts/candidate-starvation-audit.json written")

    # Exit non-zero when a control failed. A VULNERABLE surface is a finding, not
    # a broken auditor, so it does not fail the run — the Friday report is meant
    # to be readable, not to page.
    return 0 if (controls is None or controls["ok"]) else 1


if __name__ == "__main__":
    sys.exit(main())
