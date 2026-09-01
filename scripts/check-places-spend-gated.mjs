// scripts/check-places-spend-gated.mjs
//
// THE BUG THIS CLOSES (2026-09-01). app/api/cron/promote-index/route.js
// imported gateShut() and checked it once at the top of the handler, but
// never called spendAllow()/wf_spend_take PER PLACE. WAYFIND_GATE=free is
// supposed to hard-cap this drain inside Google's monthly free tier the same
// way it caps lib/placeDetails.js — instead every Details (New) fetch here
// since 2026-08-13 was un-ledgered, unmetered, uncapped in free mode.
//
// WHY scripts/check-spend-guard.mjs DID NOT CATCH THIS. That guard (the
// "$1,878 guard") already asserts a GATED_FILES list is "gated" — but its
// test is `/spendGate/.test(src) && /gateShut\(\)/.test(src)`. gateShut() and
// spendAllow() are DIFFERENT guarantees: gateShut() is a manual kill switch
// (WAYFIND_GATE=shut → zero calls) an operator has to remember exists;
// spendAllow() is the automatic, PER-CALL ledger metering that makes
// WAYFIND_GATE=free actually bound spend. promote-index/route.js called
// gateShut() and nothing else, which satisfied check-spend-guard.mjs's test
// completely while leaving free-mode metering entirely absent — the guard's
// own success message ("every metered call site gated") was true of the
// weaker guarantee and read as true of the stronger one. check-spend-guard.mjs
// section 4 DOES pin spendAllow(...) for three call sites (placeDetails.js,
// the search route, the photo route) but promote-index/route.js was never
// added to that section — a hand-maintained list is exactly the kind of
// thing a new call site silently misses.
//
// THIS GUARD, DIFFERENTLY. Not a hand-maintained list: it WALKS every real
// candidate file under app/api/cron/** and scripts/** and requires that any
// file making a genuine fetch() call to places.googleapis.com ALSO calls
// spendAllow(...) somewhere in the same file. A future cron route or script
// that talks to Google Places cannot ship ungated without editing this list
// of exemptions by hand — and every exemption has to argue for itself below.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (cond, msg) => { if (!cond) { console.error("  FAIL: " + msg); fails++; } };

function walk(dir, matchFile) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p, matchFile));
    else if (matchFile(e)) out.push(p);
  }
  return out;
}

// Brace-matched fetch() call extraction (same bounding technique as
// check-cron-post-nostore.mjs). Deliberately NOT a full string/comment-
// stripping tokenizer: an earlier version of this guard tried blanking out
// string and comment bodies first and broke on scripts/harvest-whenintampa.mjs,
// which parses .env.local with the regex literal /^["']|["']$/g — the stray
// quote characters INSIDE that character class desynced a naive quote-
// tracking state machine for the rest of the file (real JS tokenizing has to
// disambiguate regex literals from division, which a hand-rolled scanner
// here should not attempt). Instead, only the single character immediately
// before "fetch(" is checked: a real call is never glued to an identifier
// (`someFetch(`) NOR opened directly out of a string/template quote
// (`"fetch("`, `` `fetch(` ``) — the exact shape scripts/check-cuisine-never-
// queried.mjs's forbidden-word list data hit (see this guard's self-tests).
// Whole pure-comment lines (trimmed content starts with "//") are blanked
// before scanning — safe because it removes entire lines rather than
// truncating from the first "//" (which would mangle a real "https://" URL
// on the same line). Needed because scripts/check-no-disney-sources.mjs's
// own header comment contains the prose "code that fetch()es / navigates
// one.", and a naive scan reads "fetch()" out of that english sentence as a
// zero-argument call — harmless on its own, but enough to satisfy this
// guard's "a real fetch() call exists somewhere in this file" precondition
// for the indirect (wrapped-helper) detection path below, false-flagging a
// file that never calls Google at all (see this guard's self-tests).
function stripCommentLines(src) {
  return src.split("\n").map((l) => (l.trim().startsWith("//") ? "" : l)).join("\n");
}

function fetchCalls(srcIn) {
  const src = stripCommentLines(srcIn);
  const calls = [];
  let i = 0;
  while ((i = src.indexOf("fetch(", i)) !== -1) {
    const before = src[i - 1] || "";
    if (/[A-Za-z0-9_$."'`]/.test(before)) { i += 6; continue; }
    let depth = 0, j = i + 5, end = -1;
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === "(") depth++;
      else if (c === ")") { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end === -1) break;
    calls.push({ index: i, text: src.slice(i, end + 1) });
    i = end + 1;
  }
  return calls;
}

// Does this file genuinely call the Google Places API? Two shapes count:
//   (a) DIRECT — a real fetch() call whose own argument names the host
//       (app/api/cron/*/route.js, promote-worker.mjs, seed-places.mjs, ...).
//   (b) INDIRECT — a local helper (post(), fetchImpl(), ...) does the real
//       fetch() and the host string lives elsewhere in the same file
//       (census-build.mjs's/census-sweep.mjs's `post(url, ...)` wrapper). This
//       requires BOTH a genuine fetch() call AND the host string on a real
//       code line — not merely a comment mentioning it (check-photos.mjs) or
//       a string fixture with no fetch() call anywhere in the file
//       (check-no-disney-sources.mjs, test-house-card-photo.mjs,
//       check-cuisine-never-queried.mjs, check-cuisine-sheet.mjs,
//       check-metered-matcher.mjs all mention the host as DATA, not a call).
function callsGooglePlaces(src) {
  const calls = fetchCalls(src);
  if (calls.some((c) => c.text.includes("places.googleapis.com"))) return true;
  if (!calls.length) return false;
  return src.split("\n").some((l) => l.includes("places.googleapis.com") && !l.trim().startsWith("//"));
}

// Comment lines stripped first (same treatment as fetchCalls, same reason):
// this guard's OWN header comment on app/api/cron/promote-index/route.js
// documents the fix in prose ("spendAllow("details_enterprise_atmosphere")
// grant per place") — a real trap caught red-proving this guard. Scanning
// raw src would have let a file DESCRIBE calling spendAllow without actually
// calling it and still pass.
const callsSpendAllow = (src) => /\bspendAllow\s*\(/.test(stripCommentLines(src));

const SELF = fileURLToPath(import.meta.url);
const cronFiles = walk(join(ROOT, "app/api/cron"), (e) => e === "route.js" || e === "route.ts");
// Excludes THIS file. Its own self-tests below are fixture STRINGS containing
// "fetch(...places.googleapis.com...)" as example source text, not real
// calls — a simple before-character check (deliberately not a full string
// tokenizer; see fetchCalls' comment) cannot tell a fixture string's inner
// content from real code once the match is not adjacent to the opening
// quote, so this guard would otherwise flag itself.
const scriptFiles = walk(join(ROOT, "scripts"), (e) => e.endsWith(".mjs")).filter((p) => p !== SELF);
const candidates = [...cronFiles, ...scriptFiles];

ok(cronFiles.length > 0, "found no cron route files — the walker is broken, so this guard is inert");
ok(scriptFiles.length > 0, "found no scripts/*.mjs files — the walker is broken, so this guard is inert");

// EXEMPTIONS — every file here calls Google Places with no spendAllow() in
// the same file. None is silently normalized; each is argued individually.
// A file NOT in this list that fails the check below is a real, actionable
// finding, not a false positive this guard needs tuning to avoid.
const EXEMPT = {
  // ── genuinely urgent, out of scope for THIS single-purpose cost fix ──────
  "app/api/cron/hero-images/route.js":
    "ACTIVELY SCHEDULED cron (see vercel.json) with ZERO Google-spend gating " +
    "of any kind — no gateShut(), no spendAllow(), nothing; WAYFIND_GATE=shut " +
    "does not stop it either. This is a real, unaddressed gap in the same risk " +
    "class as the bug this PR fixes, discovered during this investigation. " +
    "Deliberately NOT fixed here — this PR is scoped to the confirmed " +
    "promote-index ledger bug and must not grow into an unrelated rewrite of " +
    "a second cron's spend posture without its own review. Flagged here so " +
    "the gap stays loud instead of being silently normalized by omission.",
  "app/api/cron/atlas-build/route.js":
    "Calls gateShut()/gateFree() and skips the WHOLE run in free mode, rather " +
    "than metering per call with spendAllow() — a structurally different " +
    "(and safer: a full skip, not a per-call leak) pattern than the bug this " +
    "PR fixes, but still not ledger-metered, so it cannot pass this check " +
    "either. Its own field mask and gating strategy are a separate owner " +
    "decision (#438's lesson already lives here); out of scope for this fix.",

  // ── pre-existing hand-run scripts, human-gated by their own mechanism ────
  // Every one below is invoked from a terminal, by a person, reading output —
  // never from a schedule — which is a materially different risk than an
  // unattended cron silently leaking spend. None is a green light to leave
  // as-is forever; each is exempted from THIS check, not from ever being
  // wired to the shared ledger.
  "scripts/promote-index.mjs":
    "The ORIGINAL hand-run promoter (superseded operationally by " +
    "promote-worker.mjs, which IS gated by this PR, but still present and " +
    "runnable). Three explicit gears (PLAN free / --enrich paid+preview / " +
    "--apply after a typed confirmation) plus its own --max-spend hard cap — " +
    "a self-contained safety, not the shared WAYFIND_GATE ledger, but a real " +
    "one a human must clear before any Google call.",
  "scripts/census-build.mjs": "Hand-run census sweep; --apply/--dry gated (see its own usage banner).",
  "scripts/census-sweep.mjs": "Hand-run census sweep; --apply/--dry gated.",
  "scripts/census-parity.mjs": "Hand-run parity check against Google; no --apply/--dry flag found — higher-risk unknown, worth a follow-up audit.",
  "scripts/seed-places.mjs": "Hand-run seeder; --apply/--dry gated.",
  "scripts/seed-anchors.mjs": "Hand-run seeder; --apply/--dry gated.",
  "scripts/seed-fall-2026.mjs": "Hand-run, dated one-off seasonal seeder; --apply/--dry gated.",
  "scripts/backfill-photo-refs.mjs": "Hand-run backfill; --apply/--dry gated.",
  "scripts/backfill-photo-refs-2026-08-26.mjs": "Hand-run, dated one-off backfill; --apply/--dry gated.",
  "scripts/backfill-event-heroes-2026-08-26.mjs": "Hand-run, dated one-off backfill; --apply/--dry gated.",
  "scripts/ingest-verified-2026-08-26.mjs": "Hand-run, dated one-off ingest; --apply/--dry gated.",
  "scripts/ingest-verified-2026-08-27.mjs": "Hand-run, dated one-off ingest; --apply/--dry gated.",
  "scripts/ingest-verified-2026-08-28.mjs": "Hand-run, dated one-off ingest; --apply/--dry gated.",
  "scripts/creator-video-intake.mjs": "Hand-run creator intake; no --apply/--dry flag found — higher-risk unknown, worth a follow-up audit.",
  "scripts/resolve-birthday-place-ids.mjs": "Hand-run resolver; no --apply/--dry flag found — higher-risk unknown, worth a follow-up audit.",
  "scripts/resolve-local-pick-ids.mjs": "Hand-run resolver; no --apply/--dry flag found — higher-risk unknown, worth a follow-up audit.",
  "scripts/resolve-summer-place-ids.mjs": "Hand-run resolver; no --apply/--dry flag found — higher-risk unknown, worth a follow-up audit.",
  "scripts/harvest-whenintampa.mjs": "Hand-run harvester; no --apply/--dry flag found — higher-risk unknown, worth a follow-up audit.",
};

let checked = 0;
for (const file of candidates) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  const src = readFileSync(file, "utf8");
  if (!callsGooglePlaces(src)) continue;
  checked++;
  if (EXEMPT[rel]) continue; // argued above, not silently skipped
  ok(callsSpendAllow(src),
    `${rel} makes a real fetch() call to places.googleapis.com but never calls spendAllow(...) in the same file — WAYFIND_GATE=free will not meter or cap this call. Either wire it to lib/spendGate.js's spendAllow() (per-place, fail-closed, before the Google fetch — see app/api/cron/promote-index/route.js's details() for the pattern), or add a specifically-argued entry to this guard's EXEMPT list explaining why not.`);
}
// Exempted files are still required to actually match the shape they're
// exempted FOR, or the entry is dead weight nobody would notice going stale.
for (const rel of Object.keys(EXEMPT)) {
  const p = join(ROOT, rel);
  ok(existsSync(p), `EXEMPT lists ${rel}, which does not exist — stale entry, remove it`);
  if (existsSync(p)) {
    const src = readFileSync(p, "utf8");
    ok(callsGooglePlaces(src), `EXEMPT lists ${rel} as a Google Places caller needing an exemption, but it no longer calls places.googleapis.com — remove the now-pointless entry`);
  }
}

ok(checked > 0, "found no file calling places.googleapis.com anywhere under app/api/cron/** or scripts/** — the host-detection is broken, so this guard is inert");

// The two positive controls THIS PR fixed must actually pass for real, not
// merely be assumed to.
{
  const routeSrc = readFileSync(join(ROOT, "app/api/cron/promote-index/route.js"), "utf8");
  const workerSrc = readFileSync(join(ROOT, "scripts/promote-worker.mjs"), "utf8");
  ok(callsGooglePlaces(routeSrc), "sanity: promote-index/route.js must be detected as a Google Places caller");
  ok(callsSpendAllow(routeSrc), "promote-index/route.js must call spendAllow(...) — this is the exact 2026-09-01 bug this guard exists to catch");
  ok(callsGooglePlaces(workerSrc), "sanity: promote-worker.mjs must be detected as a Google Places caller");
  ok(callsSpendAllow(workerSrc), "promote-worker.mjs must call spendAllow(...) — same bug, same fix, the hand-run path");
}

// Prove the detector can fail, and does not fire on correct code.
{
  const ungated = 'async function f(k,id){ return fetch(`https://places.googleapis.com/v1/places/${id}`, { headers: h }); }';
  const gated = 'async function f(k,id){ if(!(await spendAllow("details_enterprise_atmosphere"))) return null; return fetch(`https://places.googleapis.com/v1/places/${id}`, { headers: h }); }';
  const commentOnly = '// docs: see places.googleapis.com for the API reference\nfunction f(){ return doSomethingElse(); }';
  const dataOnly = 'const KNOWN_HOSTS = ["places.googleapis.com", "example.com"];\nfunction check(u){ return KNOWN_HOSTS.includes(u); }';
  const wrappedNoHost = 'async function f(){ return fetch("https://example.com/x", { headers: h }); }';

  ok(callsGooglePlaces(ungated) && !callsSpendAllow(ungated), "self-test: an ungated direct fetch() must be detected as a violation");
  ok(callsGooglePlaces(gated) && callsSpendAllow(gated), "self-test: a spendAllow-gated fetch() must pass");
  ok(!callsGooglePlaces(commentOnly), "self-test: a comment-only mention of the host, with no real fetch() call, must NOT be flagged");
  ok(!callsGooglePlaces(dataOnly), "self-test: a string-literal fixture mentioning the host, with no real fetch() call anywhere in the file, must NOT be flagged (this is exactly why check-cuisine-never-queried.mjs, check-no-disney-sources.mjs, test-house-card-photo.mjs and check-metered-matcher.mjs are not in EXEMPT — they are correctly never candidates)");
  ok(!callsGooglePlaces(wrappedNoHost), "self-test: a real fetch() call to an unrelated host must NOT be flagged");

  // The indirect (wrapped-helper) shape: fetch() and the host string live in
  // the same file but not the same call — census-build.mjs's post() shape.
  const wrappedGoogle = 'async function post(url,body){ return fetch(url,{method:"POST",body}); }\nawait post("https://places.googleapis.com/v1/places:searchText", {});';
  ok(callsGooglePlaces(wrappedGoogle), "self-test: a fetch() call plus the host string elsewhere in the same file (the wrapped-helper shape) must be detected");

  // The exact false positive this guard tripped on itself while being
  // written: "fetch(" as SCAN DATA inside a string literal (a forbidden-word
  // list), never invoked as a call, with no places.googleapis.com anywhere.
  const stringDataOnly = 'for (const forbidden of ["fetch(", "searchText", "places.googleapis.com", "queryFor"]) { check(forbidden); }';
  ok(fetchCalls(stringDataOnly).length === 0, 'self-test: "fetch(" as a string-literal list ENTRY must not be counted as a real call (scripts/check-cuisine-never-queried.mjs)');
  ok(!callsGooglePlaces(stringDataOnly), "self-test: with no real fetch() call, a places.googleapis.com string sitting in that same list must not be flagged either");

  // The exact false positive check-no-disney-sources.mjs hit: an English
  // sentence in a comment reading "...code that fetch()es...", plus TEST
  // FIXTURE data mentioning the host on real (non-comment) lines elsewhere —
  // no genuine Google call anywhere in the file.
  const commentProseFile = [
    "// sourceUrls cites one, or code that fetch()es / navigates one.",
    'const FIXTURES = [',
    '  ["https://places.googleapis.com/v1/places/x", null],',
    "];",
  ].join("\n");
  ok(fetchCalls(commentProseFile).length === 0, 'self-test: "fetch()es" inside an English sentence in a COMMENT must not be counted as a real call (scripts/check-no-disney-sources.mjs)');
  ok(!callsGooglePlaces(commentProseFile), "self-test: with the only 'fetch(' in a comment, a places.googleapis.com fixture string elsewhere must not be flagged either");
}

if (fails) { console.error(`check-places-spend-gated: ${fails} failure(s)`); process.exit(1); }
console.log(`check-places-spend-gated: OK — ${checked} file(s) call places.googleapis.com; every one either calls spendAllow(...) in the same file or carries an individually-argued EXEMPT entry (${Object.keys(EXEMPT).length} exemptions, 2 flagged urgent/out-of-scope)`);
