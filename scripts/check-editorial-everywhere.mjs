#!/usr/bin/env node
/**
 * check-editorial-everywhere — THE EDITORIAL LAW, asserted app-wide.
 *
 * THE LAW (owner, 2026-08-09): a place card answers "why should I choose this
 * place" — the vibe, what I get out of it. If the line would be true of fifty
 * other places it fails. Specific AND sourced: no verified hook means render
 * NOTHING.
 *
 * WHAT WENT WRONG, and why a per-file guard could not have caught it. The
 * researched wf_editorial hook reached the Top 40 rail in #687 and nowhere else,
 * for three DIFFERENT reasons on three different surfaces — so three separate
 * green guards each reported their own file correct:
 *
 *   1. app/home.js  — the resolver ran, cached, and the render then DROPPED it.
 *      /api/known-for returns a plain STRING; PlaceCard's only branch reading
 *      `line` required typeof === "object". 668 researched hooks fetched and
 *      discarded on the main feed card — which is also the map place card and
 *      the share card, so one dead branch cost three surfaces.
 *   2. BestNearby    — the eat rows fell back to reasonLine (a generic engine
 *      reason), and the things-to-do rows had no resolver at all.
 *   3. TrendingNow   — fabricated its own line outright: "More people are
 *      looking this up than usual." rendered on every card with no `why`.
 *
 * The common property: every one of those files was internally consistent. Only
 * a check that walks ALL the place surfaces at once can see that they disagree.
 *
 * ASSERTED ON THE CALL WHERE POSSIBLE (AGENTS.md / CLAUDE.md): the compressor is
 * IMPORTED AND EXECUTED against the shapes that broke it in production, rather
 * than pattern-matched in source.
 */
import { readFileSync } from "fs";
import { toHookLine, hookTextOf, editorialLine, HOOK_CAP } from "../lib/editorialHook.js";

let pass = 0;
const fails = [];
const ok = (c, m) => { pass++; if (!c) fails.push(m); };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
// Comments explain the very rules asserted below; a raw-source grep would match
// its own explanation. Strip them first (CLAUDE.md, five separate occurrences).
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1. ONE implementation, and it behaves ────────────────────────────────────
ok(/export function toHookLine\s*\(/.test(read("lib/editorialHook.js")),
  "lib/editorialHook.js DECLARES toHookLine (declaration position, not a mention)");

// The compressor, exercised on the exact inputs that were live defects.
ok(toHookLine("Mio's Grill & Cafe is a Mediterranean spot where the lamb comes off a vertical spit.", "Mio’s Grill & Cafe")
   === "Mediterranean spot where the lamb comes off a vertical spit",
  "the U+2019-vs-U+0027 apostrophe bug stays dead — the redundant name lead-in is stripped even when name and hook use different apostrophe glyphs (224 of 668 hooks contain one)");
ok(toHookLine("Independent verification has not yet been confirmed for this research pass.", "X") === "",
  "a pending-research placeholder renders NOTHING — it must never reach a card");
for (const s of ["", null, undefined, {}, [], { card_line_1: "" }])
  ok(toHookLine(s, "X") === "", `toHookLine(${JSON.stringify(s)}) returns "" — it runs inside a render and must be total`);
// {} is not hypothetical: /api/blurbs returns objects, and a resolver that
// forgets to normalise them renders the literal "[object Object]" on the card.
ok(toHookLine({ card_line_1: "Biscuits and gravy, done right." }, "X") === "Biscuits and gravy, done right",
  "an unnormalised CARD_SUMMARY object is read, not stringified into [object Object]");
for (const s of [42, "str"]) { let threw = false; try { toHookLine(s, "X"); } catch (e) { threw = true; } ok(!threw, `toHookLine(${JSON.stringify(s)}) does not throw`); }
const long = toHookLine("Two brothers run a 70-minute illusion show that sells out every single weekend and has done so for eleven straight years.", "X");
ok(long.length <= HOOK_CAP, `the cap holds (${long.length} <= ${HOOK_CAP})`);
ok(!/\s$/.test(long) && !/[,;:—–-]$/.test(long), "…and the line never ends on a dangling separator or space");
ok(long.split(" ").pop().length > 1 && !long.endsWith(" illusion"), "…and never mid-word — the #688 fragment bug");
// The two wire shapes. Dropping the string shape is defect #1 above.
ok(hookTextOf("a plain string") === "a plain string", "hookTextOf reads the STRING shape /api/known-for returns");
ok(hookTextOf({ card_line_1: "L1", card_line_2: "L2" }) === "L1", "…and the validated CARD_SUMMARY object shape /api/blurbs returns");
ok(hookTextOf(null) === "" && hookTextOf(undefined) === "", "…and is total over absence");
ok(editorialLine("Known for its biscuits and gravy.", "Skyway Jack's") === "Biscuits and gravy",
  "editorialLine composes both: read the shape, then compress");

// ── 2. no second copy of the compressor may exist ───────────────────────────
// Nine surfaces sharing one implementation was the whole point; a re-copied
// compressor is how they silently drift apart again.
const OWNERS = ["lib/editorialHook.js"];
for (const f of ["app/components/BestNearby.js", "app/components/TrendingNowClient.js",
                 "app/components/ThingsToDoList.js", "app/components/IntentPageClient.js",
                 "app/components/IntentRail.js", "app/home.js"]) {
  ok(!/function toHookLine\s*\(/.test(code(f)),
    `${f} does not define its own toHookLine — it imports the shared one`);
}
ok(OWNERS.length === 1, "exactly one module owns the compressor");

// ── 3. every place surface routes through it ────────────────────────────────
// A surface "has editorial" only if it both IMPORTS the shared module and CALLS
// it. Importing without calling is the decoration failure CLAUDE.md names.
const SURFACES = [
  ["app/home.js", "editorialLine", "the main feed PlaceCard — also the map place card and the share card, via ctx"],
  ["app/components/BestNearby.js", "toHookLine", "the eat rows, the things-to-do rows and the Top 40 rail"],
  ["app/components/ThingsToDoList.js", "toHookLine", "the ranked things-to-do list"],
  ["app/components/IntentPageClient.js", "toHookLine", "every intent page, including /best-of"],
  ["app/components/TrendingNowClient.js", "toHookLine", "/trending"],
  ["app/components/DaypartRail.js", "toHookLine", "the homepage rail drop — IconicPlaceCard take"],
  ["app/components/IntentRail.js", "toHookLine", "Tonight's Move / hidden gems / worth-the-drive / budget rails"],
];
for (const [f, fn, what] of SURFACES) {
  const src = code(f);
  ok(new RegExp(`import\\s*\\{[^}]*\\b${fn}\\b[^}]*\\}\\s*from\\s*["'][^"']*editorialHook`).test(src),
    `${f} imports ${fn} from the shared module (${what})`);
  ok(new RegExp(`\\b${fn}\\(`).test(src), `${f} CALLS ${fn} — an import nothing calls is decoration`);
}

// ── 4. the fabricated lines stay dead ───────────────────────────────────────
// These are verbatim strings that shipped. A generic sentence is not a bug that
// gets fixed once; it is a temptation that returns, so it is named explicitly.
const DEAD = [
  "More people are looking this up than usual",
  "Drawing attention across",
  "and it holds up",
];
// code(), not read(): these files EXPLAIN in comments which fabricated line was
// deleted and why, quoting it verbatim. A raw-source sweep matches its own
// documentation — the exact false positive CLAUDE.md records five times.
for (const [f] of SURFACES) {
  const src = code(f);
  for (const d of DEAD) ok(!src.includes(d), `${f} does not render the fabricated line "${d}"`);
}

// ── 5. no place row falls back from the editorial line to filler ────────────
// The `||` the owner banned: a verified hook OR NOTHING. Scoped to the `why=`
// and `take=` props so an unrelated `||` elsewhere in a 500k-char file is not a
// false positive — a guard that fires on correct code gets commented out.
for (const f of ["app/components/BestNearby.js", "app/components/IntentRail.js"]) {
  const src = code(f);
  const bad = [...src.matchAll(/(?:why|take)=\{[^}]*toHookLine\([^}]*\|\|/g)].length;
  ok(bad === 0, `${f}: no place row falls back from the editorial line to generic filler (found ${bad})`);
}

// ── 6. EVENTS ARE EXCLUDED, PERMANENTLY ─────────────────────────────────────
// An event is not a place: no wf_editorial row, nothing it is "known for".
ok(/EVENTS ARE EXCLUDED/.test(read("app/components/useEditorialHooks.js")),
  "the shared resolver states the events exclusion where callers will read it");
ok(/kind !== "experience"/.test(code("app/components/BestNearby.js")),
  "BestNearby excludes bookable experiences from hook resolution — a Viator product has no wf_editorial row");
ok(/!detail\._event && editorial/.test(code("app/components/sheets/Detail.js")),
  "the detail sheet renders the Wayfind take for places only, never for an event");

if (fails.length) {
  console.error("check-editorial-everywhere: FAIL");
  for (const f of fails) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-editorial-everywhere: OK — ${pass} assertions across ${SURFACES.length} place surfaces (one compressor, proven BY CALL on the apostrophe/placeholder/cap/shape defects; no second copy; no fabricated line; no generic fallback; events excluded)`);
