// scripts/check-copy-no-empty-hype.mjs
//
// THE TEST THIS ENCODES (brand doctrine, 2026-08-04):
//   Emotion in the promise. Specificity as the proof. Never one without the other.
//   "Could a competitor with no curation, no exclusions and paid placement write
//   this exact sentence?" If yes, it is hype and it fails.
//
// Wayfind's whole differentiation is "real reviews, no ads, no paid placement".
// Warmer copy is wanted; unbacked warmth is the one thing that trades the
// differentiation away. This guard draws that line mechanically: a superlative
// or an intensifier is allowed ONLY when a verifiable specific sits next to it —
// a number, a named place, a distance, a rating threshold, a stated exclusion.
//
// ── COMMENTS ARE STRIPPED FIRST, AND THAT IS NOT INCIDENTAL ───────────────
// This repo has hit "the regex matched its own explanatory comment" at least
// three separate times (check-editorial-publish, check-env-value-overrides,
// check-cuisine-never-queried). This file MUST discuss the banned words in
// order to document itself, so a version that scanned raw source would fail on
// its own prose. Strings only, comments gone, before a single pattern runs.
//
// ── AND IT CARRIES A FALSE-POSITIVE SELF-TEST ─────────────────────────────
// The banned list is written from the VOCABULARY of a mistake ("unforgettable"),
// not its SHAPE, and that kind of pattern over-matches — the failure mode that
// has recurred here. So §3 runs the matcher against lines that legitimately use
// the same words WITH a specific attached, and fails if any is flagged. If this
// guard cannot tell "unforgettable meals, 4.4★ and up" from "unforgettable
// experiences await", it is not ready to gate anyone's copy.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0;
const fail = (m) => { console.error("check-copy-no-empty-hype: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Bare intensifiers/superlatives that promise without proving.
//
// "hidden gem" WAS on this list and was removed after it flagged real copy. In
// most products it is an unmeasured obscurity claim. Here it names a curated
// table (lib/gems.js) of venues "Google's prominence ranking structurally
// buries", each verified against a source in-session and several carrying a
// MICHELIN citation. That is a stated mechanism, and it inverts the competitor
// test: a competitor CANNOT write it, because they do not have the table. Three
// of this file's four false positives came from writing the banned list out of
// the brief's vocabulary instead of this product's reality; that is recorded
// here so the next person does not re-add it.
const HYPE = [
  { rx: /\byou won'?t believe\b/i, why: "an unbacked promise — the reader cannot check it and neither can we" },
  { rx: /\bthis is a vibe\b/i, why: "pure mood with no place, number or constraint attached" },
  { rx: /\b(amazing|incredible|unforgettable|breathtaking|stunning|epic|insane)\b/i, why: "a bare intensifier; any competitor could write it about anything" },
  { rx: /\bmust[- ]see\b/i, why: "a superlative with no stated mechanism" },
  // SHAPE, NOT VOCABULARY. The bare word `best` over-matched immediately: it
  // flagged "Best drink here is the vanilla tea with tapioca and brown sugar" —
  // a curator's note about one menu item, dense with specifics, and exactly the
  // voice this work wants more of. The defect being guarded is a RANKING claim
  // over a SET of places with no method shown, so the pattern says that: `best`
  // followed by a plural place noun. "Best drink here" is not a ranking of
  // anything and never was.
  { rx: /\bbest\b\s+(?:\w+\s+){0,2}(places|spots|beaches|restaurants|bars|things|picks|hotels|stays|tours|experiences|eats)\b/i, contextual: true, why: "\"best\" with no mechanism stated anywhere on this surface (Wayfind Score, rating, review depth, 'no paid placement')" },
];

// A SPECIFIC is what earns the intensifier: a number, a rating, a distance, a
// price tier, a named constraint, or a stated exclusion.
const SPECIFIC = /\d|\b(rated|rating|review|reviews|★|miles?|mi\b|minutes?|\$|under|within|only|excluded?|no paid placement|merit|Score|clears?|cleared|filter)\b/i;

// The rule is "never `best` without the mechanism VISIBLE" — visible ON THE
// PAGE, not necessarily inside the same sentence. That distinction matters
// because `best` is the one banned word that is also a real SEARCH TERM: people
// type "best beaches near me", and /best-beaches/[metro] ranks by the Wayfind
// Score and says so on the page. Flagging that H1 would push us to rewrite a
// title for zero voice benefit and a real ranking cost — exactly what the brand
// brief warns against for search surfaces.
//
// So `best` is judged with FILE CONTEXT: earned when the surface states its
// method, hype when it does not. Every other banned word is judged on the
// sentence alone, because no intensifier is ever a search term.
const MECHANISM = /Wayfind Score|no paid placement|merit-based|ranked by|rating|review volume|review depth/i;
const isHype = (s, fileSrc) => {
  for (const h of HYPE) {
    if (!h.rx.test(s)) continue;
    if (SPECIFIC.test(s)) continue;
    if (h.contextual && fileSrc && MECHANISM.test(fileSrc)) continue;
    return h;
  }
  return null;
};

// ── 1. POSITIVE CONTROLS — the matcher must actually fire ─────────────────
// A matcher that recognises nothing reports a clean sweep over everything.
const MUST_FLAG = [
  "You won't believe this spot",
  "An unforgettable experience awaits",
  "This is a vibe",
  "The best places near you",
  "An absolutely amazing day out",
  "A must-see destination",
];
for (const s of MUST_FLAG) ok(!!isHype(s, ""), `positive control: "${s}" is flagged as empty hype`);

// ── 2. THE REAL SWEEP ─────────────────────────────────────────────────────
// ── SCOPE: UI COPY SURFACES, NOT THE EDITORIAL CORPUS ────────────────────
// The first draft swept all of app/ and lib/ and produced four false positives
// in a row, the last two from EDITORIAL DATA — lib/culture.js
// ("hundreds of wild manatees gather in the warm-water discharge by the power
// plant") and lib/curatedData.js. That prose is long-form, hand-verified, and
// already governed by lib/editorialValidator.js, which is the editor-in-chief
// for exactly this content. Two guards grading the same sentences by different
// rules is how a guard nobody trusts gets commented out.
//
// This file governs UI COPY: the strings a visitor reads at a decision moment —
// headings, empty states, CTAs, labels, share text, the app identity line. That
// is the surface list the brand brief itself enumerates.
const UI_FILES = [
  "app/manifest.js",
  "app/home.js",
  "lib/intentPages.js",
  "lib/google.js",
  "lib/landing.js",
  "lib/shareCards.js",
];
const UI_DIRS = ["app/components"];
const SKIP = /node_modules|\.next|\/api\/|commandCenter|editorialValidator|scripts|curatedData/;
const files = [];
const walk = (dir) => {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (SKIP.test(p)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.jsx?$/.test(p)) files.push(p);
  }
};
for (const d of UI_DIRS) walk(path.join(REPO, d));
for (const f of UI_FILES) { try { statSync(path.join(REPO, f)); files.push(path.join(REPO, f)); } catch {} }
ok(files.length > 25, `swept a real number of UI copy files (got ${files.length})`);

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
let scanned = 0;
const offenders = [];
for (const f of files) {
  const code = strip(readFileSync(f, "utf8"));
  for (const m of code.matchAll(/"([A-Z][^"]{14,160})"/g)) {
    const s = m[1];
    if (!/ /.test(s)) continue;
    scanned += 1;
    const h = isHype(s, code);
    if (h) offenders.push({ f: path.relative(REPO, f), s, why: h.why });
  }
}
ok(scanned > 150, `found a real body of user-visible prose to check (got ${scanned} strings) — a near-zero count would make the sweep vacuous`);
for (const o of offenders) {
  ok(false, `${o.f}: "${o.s.slice(0, 80)}" — ${o.why}. Add a verifiable specific (a number, a named filter, a stated exclusion) or cut the line.`);
}

// ── 3. FALSE-POSITIVE SELF-TEST — the part that keeps this usable ─────────
// These use the SAME banned words and are legitimate, because a checkable
// specific sits alongside. A guard that flags these would be uninstallable, and
// a guard nobody trusts gets commented out and takes its real catches with it.
const MUST_NOT_FLAG = [
  "Unforgettable meals, and every one clears 4.4 stars",
  "The best-rated 12 spots by review depth, no paid placement",
  "An amazing day within 30 miles of you",
  "Nothing bookable in this one yet — we'd rather show none than pad it",
  "We searched 60 miles and nothing cleared the bar",
  "Real nights out, priced like a Tuesday. Every pick is $ or $$",
  "Find the places you'll be telling your friends about tomorrow",
  "A better plan is closer than you think",
  "Nothing in that mood near you right now — roll again",
  // The real over-match that shipped in this file's first draft:
  "Best drink here is the vanilla tea with tapioca and brown sugar.",
  "Best time to go is right before sunset when the dock clears out.",
  // "hidden gem" names lib/gems.js — a curated, source-verified table — not a vibe.
  "Hidden gem experiences",
  "Explore hidden gems",
];
for (const s of MUST_NOT_FLAG) {
  const h = isHype(s, "");
  ok(!h, `false-positive control: "${s.slice(0, 62)}" must NOT be flagged (matched: ${h ? h.why : ""})`);
}

// The contextual rule must work in BOTH directions, or it is just an exemption.
ok(!!isHype("The Best Beaches Near You", ""), "\"best\" on a surface that states NO mechanism is still flagged");
ok(!isHype("The Best Beaches Near You", "ranked by the Wayfind Score, no paid placement"), "\"best\" is earned on a surface that states its method");

// ── 4. THE INTEGRITY LINES STILL EXIST, VERBATIM ──────────────────────────
// Warmer copy must never erode the credibility anchor. Asserted on the union of
// plausible locations rather than one path, so moving a line cannot silently
// pass this (CLAUDE.md — assert the invariant, not the file path).
const allSrc = files.map((f) => readFileSync(f, "utf8")).join("\n");
for (const line of ["no paid placement", "never change placement", "merit-based"]) {
  ok(allSrc.includes(line), `the integrity line "${line}" still exists somewhere in the product — it is the credibility anchor and may not be warmed away`);
}

console.log(`check-copy-no-empty-hype: OK — ${pass} assertions (${files.length} files, ${scanned} user-visible prose strings scanned with comments stripped; ${MUST_FLAG.length} positive controls fire, ${MUST_NOT_FLAG.length} legitimate lines using the same words are NOT flagged, integrity lines intact)`);
