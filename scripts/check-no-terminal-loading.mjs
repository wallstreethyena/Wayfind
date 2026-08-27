#!/usr/bin/env node
/**
 * check-no-terminal-loading — a skeleton is a PROMISE. It may never be the
 * last thing a render chain can say.
 *
 * THE BUG THIS EXISTS FOR (owner, 2026-08-23, two screenshots of gowayfind.com
 * in Parrish, FL: "this is not workign for parrish fl why please fix this").
 * The "What Should We Do Today?" drop showed three grey place-card skeletons
 * that never resolved. Measured on his own browser: localStorage.wf_center held
 *   { lat: 35.2619678, lng: -81.126481, loc: "Parrish, FL", manual: true }
 * — a pin outside Gastonia, NORTH CAROLINA under a Florida town's name. That
 * point is 500+ miles from any LANDING_CITIES entry, so /api/rails answered
 * covered:false, and app/components/DaypartRail.js ended its render chain:
 *
 *     ) : selRail && thinSet.has(selRail.id) ? ( ...honest empty... )
 *     ) : selRail ? (
 *         <ul role="status" aria-busy="true"><PlaceCardSkeleton count={3} /></ul>
 *     ) : null}
 *
 * The skeleton was the FINAL else. "Still ranking", "the fetch failed", "the
 * fetch never settled" and "Wayfind does not cover this town" were four
 * different facts rendering as one identical grey box with no way out of it.
 *
 * lib/loadState.js was written for this exact defect on 2026-08-12 — after the
 * SAME rail was reported stuck once before — and BestNearby/TodaysBest were
 * moved onto it. Nothing stopped a component from simply not adopting it, and
 * DaypartRail never did. scripts/check-no-stuck-loading.mjs only executes
 * loadState's own contract; it never asked whether anybody used it. This guard
 * asks the codebase.
 *
 * TWO ASSERTIONS:
 *   1. STRUCTURAL, repo-wide — no JSX ternary may end `) : null}` with a
 *      skeleton / aria-busy in its final arm.
 *   2. PINNED, at the call site that broke — DaypartRail settles through
 *      lib/loadState.js, gates its skeleton on an explicit in-flight flag, and
 *      renders an honest terminal branch after it.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(REPO, rel), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// Anything that renders as "we are working on it". Kept deliberately broad —
// a future spinner with a new name is the same promise to the reader.
const LOADING_MARK = /aria-busy=\{?["']?true|<PlaceCardSkeleton|<Skeleton|className="[^"]*\bwf-skel\b/;

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "_to_delete", "_agent-export", "_incoming",
  "design-baseline", "design-after-p3", "design-after-final", "public", "ios", "resources", "tmp"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    let st;
    try { st = statSync(p); } catch (e) { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

/* ── 1. STRUCTURAL: a skeleton may not be the final arm of a ternary ─────── */
// The shape we forbid, textually: `? (  …loading UI…  ) : null}`. Walking back
// from each `) : null}` to the `? (` that opens its final arm gives exactly the
// branch a reader lands in when every earlier condition was false.
const offenders = [];
for (const file of walk(path.join(REPO, "app")).concat(walk(path.join(REPO, "lib")))) {
  const src = strip(readFileSync(file, "utf8"));
  const rel = path.relative(REPO, file);
  const re = /\)\s*:\s*null\s*\}/g;
  let m;
  while ((m = re.exec(src))) {
    const head = src.slice(Math.max(0, m.index - 2000), m.index);
    const open = head.lastIndexOf("? (");
    if (open === -1) continue;
    const arm = head.slice(open);
    // A nested ternary inside the arm means this arm has its own branches and
    // the loading UI is not necessarily the terminal one — that case is caught
    // by the inner `) : null}` on its own pass.
    if (/\?\s*\(/.test(arm.slice(3))) continue;
    if (LOADING_MARK.test(arm)) {
      const line = src.slice(0, m.index).split("\n").length;
      offenders.push(`${rel}:${line} — a loading state is the final arm of this ternary; a reader whose data never arrives has nothing to read and nothing to press`);
    }
  }
}
ok(offenders.length === 0, offenders.join("\n  "));

/* ── 2. PINNED: DaypartRail, the call site that broke ───────────────────── */
const RAIL = strip(read("app/components/DaypartRail.js"));

ok(/from "\.\.\/\.\.\/lib\/loadState\.js"/.test(RAIL),
  "DaypartRail imports lib/loadState.js — the module written for this exact grey box");
// v8.73 — the fetch moved into a named `inflight` promise so a response that
// lands AFTER the deadline can still be applied (see check-rail-pool-waves for
// why: /api/rails was measured cold at 25.4s against a 12s deadline, and the
// reader was shown "we couldn't reach the ranking service" for a request that
// was about to succeed). This assertion FOLLOWED that rather than being
// deleted, because the invariant it protects is unchanged and still load-
// bearing: a fetch that never settles must still reach a RENDERED state.
//
// Asserted in two halves, because either alone is a false green — settleLoad
// wrapping something that is not the rails fetch would pass the first, and the
// fetch existing without a deadline would pass the second.
ok(/const inflight = fetch\(`\/api\/rails\?/.test(RAIL),
  "the /api/rails request is a named promise, so both the deadline and the late lane can read it");
ok(/settleLoad\(\(\) => inflight, \{ timeoutMs: [A-Z_]+ \}\)/.test(RAIL),
  "…and it runs through settleLoad with an explicit budget, so a fetch that never settles still reaches a rendered state instead of leaving the skeleton up");
ok(!/fetch\(`\/api\/rails[\s\S]{0,400}?\.catch\(/.test(RAIL),
  "the old bare fetch().then().catch() chain is gone — .catch handles rejection, and rejection was never the failure mode that stuck");
ok(/setRailLoad\(LOAD_FAILED\)/.test(RAIL) && /setRailLoad\([^)]*"uncovered"/.test(RAIL),
  "a failed load and an uncovered location are recorded as DIFFERENT facts, not one empty payload");

// Every skeleton in this file must be gated on the in-flight flag.
for (const chunk of RAIL.split(/\n(?=\s*\) : )/)) {
  if (!LOADING_MARK.test(chunk)) continue;
  ok(/isPending\(railLoad\)/.test(chunk) || /loading:/.test(chunk),
    "every skeleton branch in DaypartRail is gated on isPending(railLoad):\n      " + chunk.trim().slice(0, 160));
}

ok(/isFailed\(railLoad\)/.test(RAIL) && /setRetryNonce/.test(RAIL),
  "a failed rail load is re-claimable — the reader gets a Try again that actually re-runs the fetch");
ok(/onRecenter/.test(RAIL),
  "an uncovered/unlocated drop offers the one-tap location fix, not just an apology");

// The regression that made the server props dead and guaranteed an empty first
// paint (dd783d8): `shown` must read the places prop again.
ok(/const shown = live \|\| \{ places: places \|\| \{\}/.test(RAIL),
  "shown falls back to the SERVER props — `places: {}` made the prop dead and every pre-fetch render empty");

/* ── report ─────────────────────────────────────────────────────────────── */
if (fail.length) {
  console.error(`check-no-terminal-loading: FAIL (${fail.length} of ${pass + fail.length})`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-no-terminal-loading: OK (${pass} assertions) — no render chain ends on a promise`);
