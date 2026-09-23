#!/usr/bin/env node
// scripts/check-fall-registry-integrity.mjs — the fall registry cannot drift
// out from under lib/fallEvidence.js's rules without this guard saying so.
//
// WHY THIS EXISTS (WS4, 2026-09-23). scripts/check-augtober-rail.mjs already
// proves the pool is INTERNALLY consistent (same ids across the client/server/
// rail sets, every member has SOME documented offering with an https source).
// What it does NOT prove is FRESHNESS — that a documented offering is still
// true. Nothing stopped an entry verified two seasons ago from riding the
// rail forever. This guard adds that: every FALL_PLACE_IDS member needs a
// `verified` date that is itself dated inside the CURRENT fall season window
// (checked with lib/fallEvidence.verifiedInSeasonWindow(verified, today) —
// the SAME law fallSkin.js uses for the card itself, and the SAME "current
// season" seasonStart() shares with scripts/check-fall-offering-freshness.mjs)
// — UNLESS it is on the documented, evidence-backed
// lib/fallEvidence.YEAR_ROUND_EVERGREEN_IDS list, because its claim is a
// permanent business trait, not a dated seasonal one; even those still need a
// `verified` date inside the CURRENT window, only the literal FALL_TERMS word
// is waived for them (see evergreenThemeLive()). No silent exemptions: every
// id on the evergreen list carries its own justifying comment in
// fallEvidence.js.
//
// FIXED 2026-09-23 (independent PR #1495 audit finding): verifiedInSeasonWindow
// used to read the year OFF the verified date itself, so a verification from a
// PRIOR season passed this guard forever — see that function's own comment in
// lib/fallEvidence.js for the exact gap and the fix. `today` is now required.
//
// THE STATE AS OF THE SECOND PASS (2026-09-23, orchestrator-directed
// re-verification): this guard is expected to be GREEN. The first pass left
// it intentionally red for 7 entries with no current-season-verifiable
// evidence; this second pass resolved every one of them one of three ways —
// never by weakening the guard or deleting a real offering silently:
//   - Gasparilla Distillery, Paradeco, Oxford Exchange, On Swann, Ice
//     Screamin: REMOVED from the pool (fail-closed) after a real-browser
//     re-check found no current-season evidence and no live evergreen theme
//     on their own official pages. See lib/fallPool.js's v8.86 comment block
//     and docs/audits/fall-discovery/2026-09-23.md for the evidence behind
//     each removal. Their official sources stay in
//     data/fall-discovery/official-sources.json so the weekly pipeline can
//     re-propose any of them the moment fresh evidence exists.
//   - Mortem Manor: KEPT via the evergreenThemeLive() rule below — its own
//     page never uses a FALL_TERMS word, but does show the haunted-house
//     theme live plus an operating-status signal ("BUY TICKETS ONLINE NOW",
//     "OPEN YEAR-ROUND"), which is now an explicit, checkable evidence path
//     for YEAR_ROUND_EVERGREEN_IDS places — still gated on an in-window
//     `verified` date like every other entry.
//   - Dead Coconut Club: KEPT via the `offeringWindow` policy fix in
//     lib/fallEvidence.currentYearProof — a reputable secondary source
//     published before the season can still reach "medium" when the
//     offering's OWN explicit dated window covers today.
//
// TWO LAYERS. The static checks below (set equality, rejected-id exclusion,
// source/offering shape, verified-in-window-or-evergreen, dated-offering-not-
// expired) run unconditionally — they need nothing but the source files
// already in this repo. The LIVE checks (every member is still an OPERATIONAL,
// non-excluded inventory row; the documented offering is not merely the
// place's own name in a costume, checked against the place's REAL name) need
// wf_inventory and SKIP loudly without credentials — matching
// scripts/check-inventory-integrity.mjs's own pattern — rather than silently
// reporting green on a check that never ran.
import { FALL_CARD_IDS, fallSeasonEnd } from "../lib/fallSkin.js";
import { FALL_PLACE_IDS, FALL_PLACE_RAIL, FALL_REJECTED_IDS, FALL_OFFERING_SOURCES } from "../lib/fallPool.js";
import { YEAR_ROUND_EVERGREEN_IDS, verifiedInSeasonWindow, offeringActive, nameOnlyCandidate } from "../lib/fallEvidence.js";
import { siteTodayStr } from "../lib/siteTime.js";

let pass = 0;
const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };

const today = siteTodayStr();
const cardIds = new Set(FALL_CARD_IDS);
const poolIds = new Set(Object.keys(FALL_PLACE_IDS));
const railIds = new Set(Object.keys(FALL_PLACE_RAIL));
const srcIds = new Set(Object.keys(FALL_OFFERING_SOURCES));

// ── 1. client / server / rail sets are IDENTICAL (a set-equality check that
// fails loudly in EITHER direction — missing from one, or extra in another) ─
function setsEqual(a, b) {
  return a.size === b.size && [...a].every((x) => b.has(x));
}
ok(setsEqual(cardIds, poolIds), `lib/fallSkin.FALL_CARD_IDS (${cardIds.size}) and lib/fallPool.FALL_PLACE_IDS (${poolIds.size}) must be the identical id set — a place only on one side either renders the skin with nothing to say about it, or has an offering nothing ever shows. Missing from FALL_CARD_IDS: ${[...poolIds].filter((i) => !cardIds.has(i)).join(", ") || "none"}. Extra in FALL_CARD_IDS: ${[...cardIds].filter((i) => !poolIds.has(i)).join(", ") || "none"}.`);
ok(setsEqual(railIds, poolIds), `lib/fallPool.FALL_PLACE_RAIL (${railIds.size}) must cover the identical id set as FALL_PLACE_IDS (${poolIds.size}) — every pool member needs exactly one rail assignment. Missing from FALL_PLACE_RAIL: ${[...poolIds].filter((i) => !railIds.has(i)).join(", ") || "none"}. Extra: ${[...railIds].filter((i) => !poolIds.has(i)).join(", ") || "none"}.`);
ok(setsEqual(srcIds, poolIds), `lib/fallPool.FALL_OFFERING_SOURCES (${srcIds.size}) must cover the identical id set as FALL_PLACE_IDS (${poolIds.size}) — a pool member with no offering record has nowhere to prove itself. Missing: ${[...poolIds].filter((i) => !srcIds.has(i)).join(", ") || "none"}.`);

// ── 2. owner-rejected ids never re-enter ANY of the four sets ──────────────
for (const rid of FALL_REJECTED_IDS) {
  ok(!poolIds.has(rid) && !cardIds.has(rid) && !railIds.has(rid) && !srcIds.has(rid),
    `owner-rejected id ${rid} must never appear in FALL_PLACE_IDS / FALL_CARD_IDS / FALL_PLACE_RAIL / FALL_OFFERING_SOURCES — rejection is permanent until a human reverses it in lib/fallPool.js, not something a later sweep can quietly undo`);
}
ok(FALL_REJECTED_IDS.length >= 6, `positive control — the owner-rejected list still carries its known members (${FALL_REJECTED_IDS.length}); a guard reporting 0 here would be checking nothing`);

// ── 3. every pool member: https source, real offering text, current-season
// verification (or the documented evergreen exemption), and — for a DATED
// offering — its own end date has not passed. Collected, not short-circuited,
// so the report names every blocking entry in one run, per the task brief:
// "report exactly which entries block it."
const blockers = [];
for (const id of poolIds) {
  const entry = FALL_OFFERING_SOURCES[id];
  if (!entry) { blockers.push(`${id}: no FALL_OFFERING_SOURCES record`); continue; }

  if (!/^https:\/\//.test(String(entry.source || ""))) {
    blockers.push(`${id}: source is not an https URL (${entry.source || "none"})`);
  }
  if (!entry.offering || String(entry.offering).trim().length < 15) {
    blockers.push(`${id}: offering text missing or too short to be a real claim`);
  }

  // POLICY (orchestrator, 2026-09-23): EVERY entry needs a `verified` date
  // inside a fall season window — evergreen ids are NOT exempt from the
  // window, only from needing a literal FALL_TERMS word to earn that date.
  // lib/fallEvidence.YEAR_ROUND_EVERGREEN_IDS + evergreenThemeLive() document
  // and check WHAT counts as evidence for those ids (the theme being live on
  // the official page, not a fall word) — that check runs by hand at
  // re-verification time, before `verified` is written here; this guard only
  // confirms the date itself is real and current-season, for every entry.
  const evergreen = YEAR_ROUND_EVERGREEN_IDS.has(id);
  const windowOk = !!entry.verified && verifiedInSeasonWindow(entry.verified, today);
  if (!windowOk) {
    blockers.push(`${id}: no 'verified' date inside the CURRENT fall season window (Aug 26 - Thanksgiving, as of today ${today})${entry.verified ? ` — verified=${entry.verified} is not inside it (a PRIOR season's own verification no longer counts)` : " — field is absent"}${evergreen ? " (evergreen id — needs a verified re-check that the theme is live, via lib/fallEvidence.evergreenThemeLive, not a fall-word match)" : ""}`);
  }

  const until = entry.until || entry.ends;
  if (until && !offeringActive({ ends: until, today })) {
    blockers.push(`${id}: dated offering's own end date (${until}) has passed as of today (${today}) — it cannot remain listed as if still running`);
  }
}
ok(blockers.length === 0, `${blockers.length} of ${poolIds.size} FALL_PLACE_IDS entries are not current-season verified:\n    ` + (blockers.join("\n    ") || "(none)"));
// Print each blocker as its own line too, even though the summary assertion
// above already lists them — a reviewer scanning stderr for "BLOCKED" should
// not have to parse a single run-on message to find every offender.
for (const b of blockers) console.error("check-fall-registry-integrity: BLOCKED — " + b);

// positive control: fallSeasonEnd is a real function this guard actually
// calls through verifiedInSeasonWindow's own dependency chain, not a stub
ok(fallSeasonEnd(2026) === "2026-11-26", `positive control — fallSeasonEnd(2026) is the season law this guard's window check relies on (${fallSeasonEnd(2026)})`);
// RED-PROVE of the exact 2026-09-23 fix (independent PR #1495 audit): a
// verification from a PRIOR season must NOT pass just because it once fell
// inside THAT season's own window — this is the literal bug this guard used
// to assert as correct behavior (`verifiedInSeasonWindow("2025-10-01") ===
// true`, no `today` in sight). With `today` fixed at 2026-09-23: today itself
// and the season's own Aug 26 open both pass; a year-ago verification, a date
// before this year's season opened, and a date in the future all fail.
ok(verifiedInSeasonWindow("2026-09-23", "2026-09-23") === true
  && verifiedInSeasonWindow("2026-08-26", "2026-09-23") === true
  && verifiedInSeasonWindow("2025-10-01", "2026-09-23") === false
  && verifiedInSeasonWindow("2026-07-04", "2026-09-23") === false
  && verifiedInSeasonWindow("2026-12-25", "2026-09-23") === false,
  "verifiedInSeasonWindow(verified, today) executed against known in/out-of-window dates — a PRIOR season's own verification no longer counts as current (the exact fixed bug)");
// Cross-year sanity: the SAME function, asked from a DIFFERENT `today`, opens
// a DIFFERENT window — proving the anchor is genuinely `today`, not a
// hardcoded year baked into the guard.
ok(verifiedInSeasonWindow("2025-10-01", "2025-10-15") === true
  && verifiedInSeasonWindow("2025-10-01", "2026-09-23") === false,
  "the identical verified date passes when `today` is inside ITS season and fails once `today` has moved into the next one");

// ── 4. live checks: OPERATIONAL/excluded + the documented offering is not
// name-only against the place's REAL name. SKIPs loudly without credentials.
const URL_ = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

if (!URL_ || !KEY) {
  console.log("check-fall-registry-integrity: live OPERATIONAL/excluded + name-only checks SKIPPED — no Supabase credentials in env (set SUPABASE_URL + a readable key to enforce)");
} else {
  const ids = [...poolIds];
  const filter = ids.map((id) => encodeURIComponent(id)).join(",");
  const res = await fetch(`${URL_}/rest/v1/wf_inventory?select=place_id,name,status,excluded&place_id=in.(${filter})`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) {
    fails.push(`Supabase wf_inventory query failed (${res.status}) — cannot run the live checks with credentials present; treat as a failure, not a silent skip`);
  } else {
    const rows = await res.json();
    const byId = new Map(rows.map((r) => [r.place_id, r]));
    ok(rows.length > 0, `wf_inventory returned 0 of ${ids.length} requested rows — either the pool ids are wrong or this guard lost its subject`);
    for (const id of ids) {
      const row = byId.get(id);
      ok(!!row && row.status === "OPERATIONAL" && row.excluded !== true,
        `${id}: must be a live OPERATIONAL, non-excluded wf_inventory row — ${row ? `found status=${row.status} excluded=${row.excluded}` : "no matching row at all (place vanished from inventory)"}`);
      const entry = FALL_OFFERING_SOURCES[id];
      if (row && entry && entry.offering) {
        ok(!nameOnlyCandidate(row.name, entry.offering),
          `${id} (${row.name}): the documented offering, once the place's OWN name is stripped out of it, carries no primary fall term — a name-only pick has nowhere to hide`);
      }
    }
  }
}

if (fails.length) {
  console.error(`check-fall-registry-integrity: FAIL (${fails.length} of ${pass + fails.length})`);
  for (const m of fails) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`check-fall-registry-integrity: OK — ${pass} assertions (client/server/rail sets identical, rejected ids stay out, every member current-season verified or evergreen-exempt, no expired dated offering survives)`);
