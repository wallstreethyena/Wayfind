// scripts/test-card-gate.mjs — v6.40 GLOBAL card-integrity guardrail.
//
// THE LESSON (July 16 incident, owner-reported): three different data paths
// (the v6.38 inventory union, the Google-outage inventory fallback, and the
// skeleton place-ID index) each leaked rows that were not card-complete —
// nameless cards, photoless cards, and Score-less cards — because each path
// had its OWN idea of "a place". The fix class is a single render-time
// CONTRACT (lib/score.js cardComplete) enforced at the card components, plus
// serve-time gates so unenriched rows never leave the server. This test locks
// BOTH layers so no future data source can ship a broken card again.
import { readFileSync } from "fs";
import { createRequire } from "node:module";
const ts = createRequire(import.meta.url)("typescript");
import { cardComplete } from "../lib/score.js";
import { rankInventory } from "../lib/inventoryServe.js";

let pass = 0;
const fail = (m) => { console.error("test-card-gate: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// ── the render contract: name + id + rating signals, ALWAYS ─────────────────
ok(cardComplete({ id: "a", name: "Keke's Breakfast Cafe", rating: 4.7, reviews: 3723 }) === true, "real place passes");
ok(cardComplete({ id: "c", name: "Rated newcomer", rating: 4.9 }) === true, "named + rating passes");
ok(cardComplete({ id: "c2", name: "Raw-field place", rating: 4.4, userRatingCount: 210 }) === true, "raw Google field name (userRatingCount) counts as review signal");
ok(cardComplete({ id: "c3", name: "Reviews only", reviews: 87 }) === true, "review volume alone passes (Score computes from it)");
ok(cardComplete({ id: "b", name: "Photo-only Fresh Spot", photos: [{ name: "x" }] }) === false,
  "v6.40 FLIP: a photo alone no longer qualifies — no rating signals means no Score, and a Score-less card never renders (the July 16 'things to do' bug)");
ok(cardComplete({ id: "b2", name: "Photo string only", photo: "/api/photo?ref=x" }) === false, "photo-string-only refused for the same reason");
ok(cardComplete({ id: "d", displayName: { text: "Raw Google Row" }, rating: 4.8 }) === false, "un-normalized Google-shaped row (no name) is refused — the Family/All nameless bug");
ok(cardComplete({ id: "e", name: "" }) === false, "empty name refused");
ok(cardComplete({ id: "f", name: "   " }) === false, "whitespace name refused");
ok(cardComplete({ id: "g", name: "Ghost With Nothing" }) === false, "name with zero substance refused");
ok(cardComplete({ name: "No Id Place", rating: 5 }) === false, "missing id refused");
ok(cardComplete(null) === false, "null refused");

// ── the serve gate: unenriched inventory rows never leave the server ────────
const enriched = { place_id: "wf1", name: "Enriched Museum", lat: 27.5, lng: -82.4, google_types: ["museum"], signals: { rating: 4.6, reviews: 812 }, photo_ref: "ph1", status: "OPERATIONAL" };
const skeleton = { place_id: "wf2", name: "Skeleton Row (promoted, not yet enriched)", lat: 27.5, lng: -82.4, google_types: ["museum"], signals: {}, status: "OPERATIONAL" };
const zeroRated = { place_id: "wf3", name: "Zero-rated Row", lat: 27.5, lng: -82.4, google_types: ["museum"], signals: { rating: 0, reviews: 0 }, status: "OPERATIONAL" };
const served = rankInventory([enriched, skeleton, zeroRated], 27.5, -82.4, 24000, 10);
ok(served.length === 1, "rankInventory serves ONLY rows with real rating signals (got " + served.length + ")");
ok(served[0] && served[0].displayName && served[0].displayName.text === "Enriched Museum", "the enriched row is the one served");
ok(typeof served[0].rating === "number" && served[0].rating > 0, "a served inventory row ALWAYS carries a rating — so the client always computes a Wayfind Score for it");

// ── the components actually enforce the contract ────────────────────────────
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
// RE-POINTED AGAIN 2026-08-21, and this time at the RULE. Two earlier versions
// of this assertion pinned the exact list of hooks allowed above the gate
// (useBestPhoto, then + useMarketPhotoFallback, then + usePlaceProduct), and
// each went red the next time a hook legitimately had to move above it — the
// pinned-punctuation failure mode this repo keeps paying for. Worse, the pin
// pushed back: the photo-heal useState/useEffect stayed BELOW the gate to keep
// this regex green, which is a rules-of-hooks violation and, when the gate
// flipped mid-life, a blank feed.
//
// The invariant was never the list. It is: NOTHING RENDERS BEFORE COMPLETENESS
// IS DECIDED — the gate is PlaceCard's first return. Hook ORDER is a separate
// invariant and now has its own guard, scripts/check-hook-order.mjs, which
// enforces it across every component in the app rather than this one.
//
// Read with the TypeScript parser, so a `return` inside a callback above the
// gate (every useEffect has one) is correctly not PlaceCard's return.
{
  const src = ts.createSourceFile("home.js", home, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JSX);
  let placeCard = null;
  const find = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && n.name.text === "PlaceCard") placeCard = n;
    if (!placeCard) ts.forEachChild(n, find);
  };
  ts.forEachChild(src, find);
  ok(!!(placeCard && placeCard.body), "PlaceCard is a function declaration in app/home.js");
  // Its own returns — not the ones belonging to callbacks it creates.
  const returns = [];
  const walk = (n) => {
    if (n !== placeCard && (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n))) return;
    if (ts.isReturnStatement(n)) returns.push(n);
    ts.forEachChild(n, walk);
  };
  ts.forEachChild(placeCard.body, walk);
  ok(returns.length > 0, "PlaceCard returns something");
  const first = returns[0].getText(src).replace(/\s+/g, " ");
  ok(/^return null;?$/.test(first) && /if \(!cardComplete\(p\)\) return null;/.test(home.slice(Math.max(0, returns[0].getStart() - 40), returns[0].getEnd())),
    "PlaceCard's completeness gate is its FIRST return — an incomplete card renders nothing, and nothing paints before that is decided (first return was: " + first + ")");
}
ok(/import \{[^}]*cardComplete[^}]*\} from "\.\.\/lib\/score"/.test(home), "home.js imports cardComplete from lib/score");
ok(/if \(p\.wfScore == null && Number\(p\.rating\) > 0\) p\.wfScore = wayfindScore\(/.test(home),
  "PlaceCard self-heals a missing wfScore from rating signals (a rated card ALWAYS shows the Score badge)");
// v6.46 (owner): the client-ranked food top-10 was replaced by the engine-
// backed BestNearby card (wf_best_picks already serves complete rows). If
// the client-ranked list ever returns, it must return WITH its gate.
ok(!/=== "Food"\), condCtx, boostBase\)/.test(home) || /=== "Food"\), condCtx, boostBase\)\.filter\(cardComplete\)/.test(home),
  "if the client-ranked food top-10 ever returns, it must return WITH its cardComplete gate");
// v6.45 (owner): the "Best things to do today" card is retired from the home
// page, so its gate went with it. The food top-10 gate above still stands;
// this assertion now pins that the retired list does not quietly return
// WITHOUT its cardComplete gate.
ok(!/rankByConditions\(todoPool/.test(home) || /rankByConditions\(todoPool, condCtx, boostBase\)\.filter\(cardComplete\)/.test(home),
  "if the Things-to-do top-10 ever returns, it must return WITH its cardComplete gate");

const kit = readFileSync(new URL("../app/components/kit.js", import.meta.url), "utf8");
ok(/import \{ wayfindScore \} from "\.\.\/\.\.\/lib\/google"/.test(kit), "kit.js imports the ONE score formula (wayfindScore)");
// v7.00 — RE-POINTED, not relaxed. This used to pin the literal two lines
//   let s = toDisplayScore(p && p.wfScore);
//   if (s == null && p && Number(p.rating) > 0) s = toDisplayScore(wayfindScore(
// which went red the moment the chip started routing through displayedWfScore()
// so creator evidence became visible on the card (owner, 2026-08-07). The
// INVARIANT this guard exists for is unchanged and is asserted in three parts:
// the chip reads the place's own score, it self-heals from raw rating signals
// rather than printing "Score pending", and the healed value still comes from
// the ONE formula. What it no longer does is pin the exact expression, which is
// what made a legitimate refactor look like a regression.
ok(/let s = toDisplayScore\(/.test(kit),
  "PlaceScoreChip no longer derives its number through toDisplayScore — the badge and the chip would stop agreeing");
ok(/if \(s == null && p && Number\(p\.rating\) > 0\) s = toDisplayScore\(/.test(kit),
  "PlaceScoreChip self-heals: rating signals present -> a real Score renders, never 'Score pending'");
ok(/wayfindScore\(Number\(p\.rating\), Number\(p\.reviews != null \? p\.reviews : p\.userRatingCount\) \|\| 0\)/.test(kit),
  "…and the self-healed value still comes from wayfindScore(), the one formula — not a locally restated one");

const inv = readFileSync(new URL("../lib/inventoryServe.js", import.meta.url), "utf8");
ok(/if \(!\(typeof _sr\.rating === "number" && _sr\.rating > 0\)\) continue;/.test(inv),
  "rankInventory's unenriched-row skip is in place (serve-time gate)");

console.log(`test-card-gate: OK — ${pass} assertions (no card renders without a name AND a Wayfind Score; unenriched rows never leave the server)`);
