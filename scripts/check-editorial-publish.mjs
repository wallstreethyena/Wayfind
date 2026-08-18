// scripts/check-editorial-publish.mjs — THE EDITORIAL PUBLISH PATH.
//
// The defect this exists to prevent from coming back (v6.49, owner-reported as
// "lots of detail cards DO NOT have any information in them as to why someone
// should go"):
//
//   app/api/cron/atlas-build/route.js wrote every row with `verified: false`,
//   and NOTHING in the codebase ever set it true. The flag had been ticked by
//   hand once, on 2026-07-22..24, and never again. Measured against production:
//   169 rows were clean (zero validator issues), averaging a 515-character
//   why_here and 4.3 sourced facts — the longest and best-sourced writing in
//   the table — and not one of them reached a user. Meanwhile 2 rows the
//   validator HAD flagged were live, because someone had ticked them earlier.
//   The flag was, if anything, inversely correlated with quality.
//
// There are two ways to "fix" that, and only one of them is right:
//
//   RIGHT — make `verified` agree with the validator by construction, at write
//   time, so the two can never drift again. The gate stays exactly where it is.
//
//   WRONG — delete the `verified` filter from the read path so everything
//   renders. That publishes the 101 rows the validator flagged: places filed
//   under the wrong category, chain locations with generic copy, rows whose
//   place_id could not be resolved at all, and rows that are a city pin rather
//   than a venue. It would trade "no reason to go" for "a confidently wrong
//   reason to go", which is worse for a product whose whole claim is curation.
//
// So this file asserts BOTH halves: the flag is derived, AND every reader still
// gates on it. Weakening either one fails here.
import { readFileSync } from "node:fs";

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error("FAIL: " + msg); } };
const raw = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

// Assertions must read CODE, not prose. The route's own defect notes quote
// `verified: false` verbatim, so an unstripped grep fails on a comment — and,
// far worse, a POSITIVE assertion could pass on a line that survives only
// inside a comment, which is the silent-green failure mode this whole file
// exists to avoid. Whole-line `//` and `/* … */` are removed; a trailing
// comment after real code is left alone, so `verified: false, // legacy` still
// reads as the code it is. The length floor catches the one way a naive
// stripper misfires: an unbalanced `/*` inside a string eating the remainder of
// the file, which would turn every assertion below into a vacuous pass.
const read = (p) => {
  const src = raw(p);
  const out = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  ok(out.length > src.length * 0.25, `stripping comments from ${p} left the code intact — a runaway /* would blank it and every assertion reading it would pass for the wrong reason`);
  return out;
};

const atlas = read("app/api/cron/atlas-build/route.js");
const editorial = read("lib/atlasEditorial.js");
const rule = read("lib/editorialRule.js");
const vercel = JSON.parse(raw("vercel.json"));

// ─── 1. The flag is DERIVED, never hardcoded ────────────────────────────────
// The row builder moved out of the route into lib/atlasEditorial.js so the
// publish decision could be unit-tested with real inputs
// (scripts/test-atlas-editorial-row.mjs) instead of only grepped for. The rule
// below is unchanged — it is read against the file the surface is now made of.
//
// Bounded window: editorialRow() only. An unbounded read would match the word
// "verified" anywhere in the module and pass for the wrong reason.
ok(/import \{ editorialRow \} from "\.\.\/\.\.\/\.\.\/\.\.\/lib\/atlasEditorial"/.test(atlas),
  "the cron route builds its rows through lib/atlasEditorial — if it ever grows a second, local row builder, everything asserted below stops describing what actually gets written");
const rowStart = editorial.indexOf("export function editorialRow(");
ok(rowStart >= 0, "lib/atlasEditorial still exports editorialRow — this guardrail is pinned to it");
const rowEnd = editorial.indexOf("\n}", rowStart);
ok(rowEnd > rowStart, "editorialRow's closing brace is findable — without a real end marker every assertion below reads the rest of the file and can PASS for the wrong reason");
const row = rowStart >= 0 && rowEnd > rowStart ? editorial.slice(rowStart, rowEnd) : "";
ok(row.length > 0, "editorialRow's window parsed to something non-empty");

ok(!/verified:\s*false/.test(row),
  "editorialRow does NOT hardcode `verified: false` — that is the exact line that made every row the fleet writes invisible from birth");
ok(!/verified:\s*true/.test(row),
  "editorialRow does NOT hardcode `verified: true` either — publishing unconditionally would push the validator's flagged rows live, which is the opposite failure and a worse one");
ok(/verified:\s*flags === null/.test(row),
  "editorialRow derives verified from the SAME `flags` value it stores in `issues` — one expression, so the flag and the evidence for it cannot disagree");
ok(/const found = \[\.\.\.\(Array\.isArray\(issues\) \? issues : \[\]\), \.\.\.contentIssues\(parsed, facts\)\]/.test(row),
  "the flag list merges the CALLER's reason for giving up with what the content itself fails on — the caller alone only knows about RIDE-LEVEL and PENDING SOURCE, so deriving verified from it alone would publish anything the model answered at all");
ok(/const flags = found\.length \? found : null/.test(row),
  "the flag list is normalised once: [] and null both collapse to null, so `issues is null` stays a usable SQL predicate rather than a two-case one");
ok(/issues:\s*flags/.test(row),
  "the stored issues column is that same normalised value — if this ever diverges from what verified was computed from, the guarantee above is void");

// The content bar itself. These three thresholds are duplicated, on purpose, in
// supabase/editorial-publish-backfill.sql — a row written today and a row
// repaired from the backlog have to clear the same bar or "verified" means two
// different things depending on when the row was written.
const ciStart = editorial.indexOf("export function contentIssues(");
ok(ciStart >= 0, "lib/atlasEditorial still exports contentIssues — the content bar `verified` is derived from");
const ciEnd = editorial.indexOf("\n}", ciStart);
ok(ciEnd > ciStart, "contentIssues' closing brace is findable");
const ci = ciStart >= 0 && ciEnd > ciStart ? editorial.slice(ciStart, ciEnd) : "";
ok(ci.length > 0, "contentIssues' window parsed to something non-empty");
ok(/why_here[^\n]*\.trim\(\)\.length < 120\) out\.push\("insufficient-why-here"\)/.test(ci),
  "a card with no real why_here is flagged, not published — 'why should I go' answered in under 120 characters is the exact defect this release fixes, and it must fail on write rather than reach a user");
ok(/if \(!facts\.length\) out\.push\("no-sourced-facts"\)/.test(ci),
  "a card with zero SOURCED facts is flagged — facts are filtered to real http(s) sources above, so this is the check that an opinion is backed by something");
ok(/hook[^\n]*\.trim\(\)\.length < 20\) out\.push\("thin-hook"\)/.test(ci),
  "a one-word hook is flagged — upstream only tests that a hook is truthy");
// …and the one-time backfill has to hold the backlog to that same bar. Two
// copies of a threshold drift; this is the lock that makes them drift together.
const sql = raw("supabase/editorial-publish-backfill.sql");
ok(/length\(btrim\(hook\)\), 0\) >= 20/.test(sql) && /length\(btrim\(why_here\)\), 0\) >= 120/.test(sql) && /jsonb_array_length\(facts\), 0\) >= 1/.test(sql),
  "supabase/editorial-publish-backfill.sql holds the backlog to the SAME three thresholds the write path applies — otherwise `verified` means one thing for a row written today and another for a row repaired from the backlog");
ok((sql.match(/coalesce\(array_length\(issues, 1\), 0\) = 0/g) || []).length >= 2,
  "the backfill's preview and its UPDATE share the issues predicate — a preview that does not match the statement it is previewing is worse than no preview");

ok(/published: rows\.filter\(\(r\) => r\.verified\)\.length/.test(atlas),
  "the response separates `published` from `sourced` — a widening gap is the run reporting that the model has started producing thin cards, and it is invisible if the two are assumed equal");

// ─── 2. Every reader STILL gates on verified ────────────────────────────────
// Re-point, never weaken: this list is the full set of places that publish
// editorial. A new read site must be added here, not left ungated.
for (const [file, needle, what] of [
  ["lib/editorialRule.js", 'row.verified !== true', "the shared editorial mapper"],
  ["app/api/editorial/route.js", "verified=is.true", "the per-place detail route"],
  ["lib/landing.js", "verified=is.true", "the landing/ranking pages"],
  ["app/best-beaches/[metro]/page.js", "verified=is.true", "the beaches metro page"],
  ["lib/todaysBest.js", '.eq("verified", true)', "Today's Best / things-to-do hooks"],
  ["app/components/IntentPageClient.js", '.eq("verified", true)', "the intent pages"],
  ["app/api/known-for/route.js", "verified=is.true", "the rail/sheet known-for route"],
]) {
  ok(read(file).includes(needle), `${what} still gates on verified (${file}) — the fix for missing editorial is the flag's VALUE, never removing the gate`);
}
ok(/if \(!row \|\| row\.verified !== true\) return null;/.test(rule),
  "mapWfEditorial fails CLOSED on a missing or unverified row — it returns null rather than a partly-populated card");
ok(read("app/api/known-for/route.js").includes("atlasLinesFor"),
  "known-for consults the owner's Atlas cards — Siesta/Lido empty was a missing READ of publish-ready Atlas copy, not a reason to skip Atlas");
ok(read("lib/knownFor.js").includes("row.verified === false"),
  "knownFor.editorialUsable rejects an explicit verified:false — unpublished fleet rows stay off the card");

// ─── 3. The fleet actually runs ─────────────────────────────────────────────
// Coverage froze at 503/3457 on 2026-07-24 for one reason: nothing scheduled
// this route. It was documented as "the owner just re-triggers it", which is a
// process, not a system.
//
// v6.65 — THIS ASSERTION WAS HALF RIGHT, AND THE HALF IT GOT WRONG COST FIVE
// DAYS. It treated "scheduled" as equivalent to "working". On 2026-07-29 the
// route was scheduled, returned HTTP 200 on every invocation, and logged zero
// errors in seven days — while having published NOTHING since 2026-07-24: 525
// rows written, 0 published, 515 stored PENDING SOURCE. Because
// wf_atlas_missing skips any place that already has a row, each run
// permanently removed 25 eligible places from its own future queue.
// Scheduled-and-failing was strictly worse than not scheduled, and this guard
// was green the whole time.
//
// So the rule is no longer "always scheduled". It is: scheduled UNLESS the
// route carries an explicit, documented halt. A halt is not a free pass —
// check-atlas-diag-not-live.mjs makes it valid only while the ATLAS-DIAG
// diagnostics are present, so "disabled" cannot quietly become the resting
// state. Silence in either direction is what this pair of guards forbids.
const crons = Array.isArray(vercel.crons) ? vercel.crons : [];
const atlasCron = crons.find((c) => c && typeof c.path === "string" && c.path.startsWith("/api/cron/atlas-build"));
// Read the RAW file: the halt notice is a comment, and read() strips comments.
const halted = /THE SCHEDULE IS DISABLED/.test(raw("app/api/cron/atlas-build/route.js"));
ok(!!atlasCron || halted,
  "vercel.json schedules /api/cron/atlas-build, OR the route carries an explicit 'THE SCHEDULE IS DISABLED' notice saying why — " +
  "without one of the two, coverage only advances when someone remembers to poke it, which is how it stalled for four days");
ok(!(atlasCron && halted),
  "the route says the schedule is DISABLED while vercel.json still schedules it — the notice and the config disagree, and the config is what runs");
ok(!atlasCron || /^\S+ \S+ \S+ \S+ \S+$/.test(String(atlasCron.schedule || "")), "the atlas-build cron carries a well-formed 5-field schedule");
if (halted) {
  // A halt must say when it started and what ends it, or it is just an outage
  // with better handwriting.
  const hdr = raw("app/api/cron/atlas-build/route.js");
  ok(/last successfully published row/i.test(hdr), "the halt notice records when the route last actually succeeded");
  ok(/issue #\d+/i.test(hdr), "the halt notice cites the issue tracking the fix — a halt needs an owner and an exit");
}
// The schedule may pass ?limit — it does, to move the backlog at a useful rate.
// That number multiplies a metered Google Places call and a metered model call
// by 24 runs a day, so it is bounded here as well as in the route.
const schedLimit = Number(new URLSearchParams(String((atlasCron && atlasCron.path) || "").split("?")[1] || "").get("limit") || 0);
ok(schedLimit <= 25, `the scheduled ?limit (${schedLimit}) stays inside the route's per-run cap of 25 — the route clamps it anyway, but a schedule that asks for more is a statement of intent that should be argued with here`);

// ─── 4. The run cannot silently lose a paid batch ───────────────────────────
// The upsert is a single call after every place resolves, so overrunning
// maxDuration discards every Places Details call and every model call in the
// batch. pool() runs 6 wide, so ?limit=25 is 5 rounds at up to 8s+20s each =
// 140s against a 60s budget. Unattended on a schedule, that must be bounded by
// a clock rather than by luck.
ok(/export const maxDuration = 60;/.test(atlas), "atlas-build still declares maxDuration = 60 — the deadline below is derived from it and the two must be read together");
ok(/const DISPATCH_DEADLINE_MS = (\d+);/.test(atlas), "atlas-build declares a dispatch deadline");
const dl = Number((atlas.match(/const DISPATCH_DEADLINE_MS = (\d+);/) || [])[1] || 0);
ok(dl > 0 && dl <= 50000, `the dispatch deadline (${dl}ms) leaves at least 10s of the 60s budget for the upsert and the response`);
ok(/if \(Date\.now\(\) - startedAt > DISPATCH_DEADLINE_MS\) \{ deferred\+\+; return; \}/.test(atlas),
  "the deadline is checked before each place is DISPATCHED, and a place past it is deferred rather than half-processed — wf_atlas_missing hands it back next run");
ok(/deferred,/.test(atlas), "the response reports `deferred` — a persistently non-zero value is the operator's signal to lower ?limit, and it is invisible without this");
ok(/processed: rows\.length/.test(atlas), "the response reports rows actually produced, not the batch size — the old `places.length` read as a full success even when the run fell over");

// ─── 5. Cost safety ─────────────────────────────────────────────────────────
// Every place costs a Google Places Details call plus a model call. Scheduled,
// that is real money, so the per-run bound must stay.
ok(/Math\.min\(parseInt\(url\.searchParams\.get\("limit"\)[^)]*\)[^,]*, 25\)/.test(atlas.replace(/\s+/g, " ")) || /, 25\)/.test(atlas),
  "the per-run limit is still capped at 25 — an unbounded ?limit on a scheduled route is an unbounded bill");
ok(/if \(!secret \|\| \(auth !== "Bearer " \+ secret/.test(atlas),
  "the route is still CRON_SECRET-gated and fails closed when the secret is unset — a public endpoint that spends per request is the worst version of this file");

if (failed) { console.error(`\ncheck-editorial-publish: ${failed} assertion(s) failed`); process.exit(1); }
console.log("check-editorial-publish: OK");
