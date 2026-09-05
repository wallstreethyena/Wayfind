#!/usr/bin/env node
/**
 * check-rail-seed-not-frozen — a rail may not stay pinned to a seed the data
 * has already replaced.
 *
 * THE DEFECT, measured on production 2026-09-05 (Parrish, 390x844, real
 * Chromium, network log beside DOM count):
 *
 *   rail                         DOM cards   the browser had received
 *   Bars, Cocktails & Rooftops       5                188
 *   Date-Night Dining                1                  7
 *   Social-Play Activities           1                 26
 *
 * Nothing was slow and nothing 404'd. /api/night-out delivered the full ranked
 * rails on every cache state, and the browser threw them away.
 *
 * WHY. NightOutRails mounts every rail against a client-side fail-soft fallback
 * (composeNightOutRails over the homepage's already-loaded pool) and then swaps
 * in the real payload: `const payload = remote || fallback`. usePagedRail keyed
 * its seed on endpoint + params, which do not change across that swap, so
 * `askedKeyRef` short-circuited the mount effect and the rail kept the
 * fallback's rows forever. The second half is worse than the first: hasMore was
 * derived from the frozen seed (1 < 1 = false), so the rail could not heal even
 * when the reader scrolled it — the data was in memory and unreachable.
 *
 * WHAT IS ASSERTED, and why in this shape:
 *
 *  · seedSignature is CALLED, not read. It lives in lib/railPage.js precisely so
 *    a guard can execute it. The three properties that matter are behavioural:
 *    same content under a new array identity must produce the SAME string (or
 *    the fix would re-seed a reader mid-scroll, which is the thing the original
 *    design was protecting), and either different rows OR a different total must
 *    produce a DIFFERENT string (or the swap stays invisible). The total is not
 *    decoration: 1-of-1 and 1-of-7 hold identical items and only the total tells
 *    them apart, and that difference IS the hasMore lockout.
 *
 *  · The hook must fold that signature into the identity that gates re-seeding.
 *    Asserting the call alone would pass on a version that computes the
 *    signature and ignores it, so the composition is asserted at its position in
 *    `key`.
 *
 * Red-proved by dropping `${seedSig}` from the key (goes red on composition) and
 * by making seedSignature ignore its total (goes red on the 1-of-1 vs 1-of-7
 * property). Both were watched turning red.
 */
import { readFileSync } from "node:fs";
import { seedSignature } from "../lib/railPage.js";

let n = 0;
const bad = [];
const ok = (c, m) => { n++; if (!c) bad.push(m); };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

// ── the function, CALLED ────────────────────────────────────────────────────
const rowsA = [{ id: "a" }, { id: "b" }, { id: "c" }];
const rowsSame = [{ id: "a" }, { id: "b" }, { id: "c" }]; // same content, new identity
const rowsDiff = [{ id: "a" }, { id: "b" }, { id: "z" }];

ok(typeof seedSignature === "function", "positive control: lib/railPage.js exports seedSignature");
ok(seedSignature(rowsA, 188) === seedSignature(rowsSame, 188),
  "a re-render with a fresh array of the SAME rows changes the signature — this would re-seed a reader who has scrolled past page 0, which is the behaviour the original design protected");
ok(seedSignature(rowsA, 188) !== seedSignature(rowsDiff, 188),
  "different rows produce the same signature — the fallback-to-remote swap would stay invisible");
ok(seedSignature([{ id: "a" }], 1) !== seedSignature([{ id: "a" }], 7),
  "1-of-1 and 1-of-7 produce the same signature — that pair IS the hasMore lockout (1 < 1 is false), so the rail could never load more");
ok(seedSignature([{ id: "a" }, { id: "b" }], 2) !== seedSignature([{ id: "b" }, { id: "a" }], 2),
  "row ORDER does not reach the signature — a re-ranked rail would not re-seed");
ok(seedSignature([], null) === seedSignature(null, null) && seedSignature([], null) === seedSignature(undefined, null),
  "an empty seed is not stable across [] / null / undefined — a rail with nothing to show would thrash its key");
ok(seedSignature([{ place_id: "p1" }], 1) !== seedSignature([{ place_id: "p2" }], 1),
  "the default id reader does not see place_id — inventory rows key on it");
ok(seedSignature([{ x: 1 }], 1, (r) => r.x) !== seedSignature([{ x: 2 }], 1, (r) => r.x),
  "a caller-supplied getId is ignored");
// Total over garbage: this runs inside a render and must never throw.
let threw = false;
try { seedSignature([null, undefined, {}], 3); } catch (e) { threw = true; }
ok(!threw, "seedSignature throws on malformed rows — it runs during render, where a throw is a blank rail");

// ── the hook must USE it where re-seeding is decided ────────────────────────
const hook = strip(readFileSync(new URL("../app/components/usePagedRail.js", import.meta.url), "utf8"));
ok(/import \{[^}]*\bseedSignature\b[^}]*\} from "\.\.\/\.\.\/lib\/railPage\.js"/.test(hook),
  "usePagedRail does not import seedSignature from the shared module — a second copy of this rule is how the two drift");
ok(/seedSignature\(seedItems, seedTotal, getId\)/.test(hook),
  "usePagedRail does not CALL seedSignature with the seed it was handed");

const keyLine = (hook.match(/const key = [^\n]*/) || [""])[0];
ok(!!keyLine, "positive control: the hook still computes a `key`");
ok(/seedSig/.test(keyLine),
  `the seed signature is not part of the key that gates re-seeding, so a content swap under the same endpoint+params is invisible again (key: ${keyLine.trim()})`);
ok(/JSON\.stringify\(params/.test(keyLine),
  "the key no longer varies with params — a location change would stop re-seeding");

// The seed ref must be rebuilt when that key changes; without this line the
// signature would be computed, folded in, and still never consulted.
ok(/seedRef\.current\.key !== key\) seedRef\.current = \{ key, items: seedItems, total: seedTotal \}/.test(hook),
  "the seed ref is no longer refreshed when the key changes — the signature would be decoration");

// …and hasMore must still be derived from the seed, because that is the half of
// the bug that locked the rail out of recovering by itself.
ok(/seedItems\.length < seedTotal/.test(hook) || /seed\.items\.length < seed\.total/.test(hook),
  "hasMore is no longer derived from the seed's own total — the lockout this guard exists for cannot be detected");

// ── the caller this was written for ─────────────────────────────────────────
const rails = strip(readFileSync(new URL("../app/components/NightOutRails.js", import.meta.url), "utf8"));
ok(/const payload = remote \|\| fallback;/.test(rails),
  "NightOutRails no longer swaps a fallback for the remote payload — if that is deliberate, this guard's premise changed and it should be re-read, not deleted");
ok(/usePagedRail\(/.test(rails),
  "NightOutRails no longer uses usePagedRail — follow the code rather than dropping this file");

if (bad.length) {
  for (const m of bad) console.error("  - " + m);
  console.error(`check-rail-seed-not-frozen: FAIL — ${bad.length}/${n} assertions`);
  process.exit(1);
}
console.log(`check-rail-seed-not-frozen: OK — ${n} assertions (seedSignature EXECUTED over 9 shapes incl. identity-vs-content, the 1-of-1 vs 1-of-7 total, row order, empty-seed stability and a malformed-row total-over-garbage case; the hook's key composition and seed-ref refresh asserted at position; NightOutRails' fallback swap confirmed present as the caller this protects)`);
