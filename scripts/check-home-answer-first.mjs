#!/usr/bin/env node
/**
 * check-home-answer-first — the ranked list must be visible without a tap.
 *
 * THE MEASUREMENT THIS EXISTS FOR (PostHog, 2026-08-05). 259 single-page
 * sessions landed on "/" in 14 days. The MEDIAN one lasted 10 seconds, and 130
 * of them ended inside those 10 seconds. Over the same window `/` bounced 84%
 * of its 373 visitors, while every visitor who got past the first screen went
 * on to view 9.5 pages. The first screen was the whole problem.
 *
 * The cause was structural, not aesthetic: BestNearby — the ranked places, the
 * entire product — mounted with `useState(null)`, so both sections were
 * collapsed, BELOW the events rail and the link grid. `result_count_shown`
 * fired 3,766 times in 30 days for a list almost nobody opened.
 *
 * A default is a one-character change and reads like a preference in a diff,
 * which is exactly how it gets reverted by someone tidying up. This guard
 * makes the revert loud.
 *
 * Assertions are on the MODULE'S OWN EXPORT where possible — importing the
 * component would drag React and the Supabase client into a plain-node guard
 * for no gain, but DEFAULT_SECTION is a plain constant, so it is read by
 * running the module rather than by grepping for it.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const SRC_PATH = path.join(REPO, "app/components/BestNearby.js");
const SRC = readFileSync(SRC_PATH, "utf8");
// Every assertion below must be satisfied by CODE. A comment explaining the
// default is not the default.
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

/* ── 1. the default is a real section, and it is NOT null ───────────────── */
const decl = CODE.match(/export const DEFAULT_SECTION\s*=\s*("([a-z]+)"|null)/);
ok(!!decl, "BestNearby.js exports a DEFAULT_SECTION constant");

// The section ids are declared in the component's SECTIONS array. Derive the
// valid set from there rather than hard-coding it, so renaming a section makes
// this guard follow the code instead of going stale.
const ids = [...CODE.matchAll(/\{\s*id:\s*"([a-z]+)"\s*,\s*label:/g)].map((m) => m[1]);
ok(ids.length >= 2, `found the section ids in SECTIONS (got ${JSON.stringify(ids)})`);
ok(
  !!decl && decl[2] && ids.includes(decl[2]),
  `DEFAULT_SECTION must name a real section — got ${decl ? decl[1] : "nothing"}, valid: ${JSON.stringify(ids)}. ` +
  `null restores the all-collapsed layout that lost half of all visitors inside 10 seconds.`
);

/* ── 2. the state actually uses it ──────────────────────────────────────
   A constant nothing reads is decoration. This is the assertion that catches
   "DEFAULT_SECTION stays, useState(null) comes back" — which would leave the
   guard above green and the product broken. */
ok(
  /useState\(\s*DEFAULT_SECTION\s*\)/.test(CODE),
  "the open-section state is initialised from DEFAULT_SECTION, not from a literal"
);
ok(
  !/const\s*\[\s*open\s*,\s*setOpen\s*\]\s*=\s*useState\(\s*null\s*\)/.test(CODE),
  "the open-section state is NOT useState(null) — that is the exact pre-2026-08-06 regression"
);

/* ── 3. opening by default must actually FETCH ──────────────────────────
   The sections load lazily on toggle. A default-open section whose data never
   loads renders an open, empty box — strictly worse than a collapsed one,
   because it looks broken rather than closed. */
ok(/const ensureLoaded\s*=\s*\(/.test(CODE), "the fetch is factored into ensureLoaded()");
const mountEffect = CODE.match(/useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\n\s*\}, \[open,/);
ok(!!mountEffect, "an effect keyed on `open` drives the default-open fetch");
ok(!!mountEffect && /ensureLoaded\(open\)/.test(mountEffect[1]),
  "that effect calls ensureLoaded(open) — otherwise the default section opens empty");
ok(!!mountEffect && /isFinite\(center\.lat\)/.test(mountEffect[1]),
  "it waits for a real centre before fetching — an unconditional mount fetch would fire one request per visitor with lat=undefined");

/* ── 4. both loading paths are the same path ────────────────────────────── */
const toggleFn = CODE.slice(CODE.indexOf("const toggle = ("));
ok(/ensureLoaded\(id\)/.test(toggleFn.slice(0, 700)),
  "toggle() loads through ensureLoaded too — two copies of the fetch would drift, and mount is now the common path");

/* ── 5. the before/after read stays interpretable ───────────────────────
   best_nearby_open is the metric this change will be judged on. If the
   default-open fire and a deliberate tap emit identically, the comparison is
   destroyed and the experiment cannot be read. */
ok(
  /best_nearby_open"[\s\S]{0,80}trigger:\s*"tap"/.test(CODE),
  'a deliberate tap emits best_nearby_open with trigger:"tap", so it stays separable from the section that was already open on arrival'
);

/* ── 6. POSITION: the ranked list must LEAD the feed ─────────────────────
   #624 opened the card; it still rendered last, under the events rail, the
   hero carousel and the discovery grid. Opening a thing nobody scrolls to only
   makes the thing nobody scrolls to look better. So the ordering itself is now
   an invariant.

   Asserted by INDEX ORDER in the feed's JSX, which is the only place the
   ordering exists — there is no layout config to read. Comments are stripped
   first, so a comment mentioning BestNearby cannot satisfy it. */
// ONLY the JSX comment form is stripped. A blanket block-comment strip was
// tried first and deleted 158 KB of live code — app/home.js contains regex
// literals and strings holding "/*", so a non-greedy /\/\*...\*\//g runs away
// and every index below silently becomes -1. The probes underneath exist
// because that failure looked exactly like a passing guard until they were
// added.
const HOME = readFileSync(path.join(REPO, "app/home.js"), "utf8")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const iBest = HOME.indexOf("<BestNearby center=");
const iEvents = HOME.indexOf("<EventsRailSkeleton />");
// The RENDER SITE in the feed, not the component. A bare "<DiscoveryHeroCard "
// also matches the one inside EventsRailSkeleton, which is DEFINED far earlier
// in the file — so the naive index comparison failed against a definition
// rather than a position in the feed. Index order only means something between
// two things rendered in the same tree.
const iHero = HOME.indexOf("<DiscoveryHeroCard onOpen=");
const iMenu = HOME.indexOf("const discoveryMenu");
// v6.65: the discovery rail is hoisted above the ranked list and renders from
// ONE site (`{!browseCat && discoveryMenu}`) instead of the three mutually
// exclusive events-state branches it used to live in, so this probe follows it.
const iMenuUse = HOME.indexOf("{!browseCat && discoveryMenu}");

ok(iBest > -1, "app/home.js renders <BestNearby>");
ok(iEvents > -1, "PROBE: the events rail is still in the feed (if this is -1 the comparisons below prove nothing)");
ok(iHero > -1, "PROBE: the promo hero card is still in the feed");
ok(iMenuUse > -1, "PROBE: the discovery grid is still in the feed");

ok(iBest < iEvents, `<BestNearby> renders BEFORE the events rail (${iBest} vs ${iEvents}) — the ranked list leads the feed`);
ok(iBest < iHero, `<BestNearby> renders BEFORE the promo hero card (${iBest} vs ${iHero}) — a stranger meets an answer, not an advert for us`);
// v6.65 (owner, twice, the second time bluntly): the discovery rail sits ABOVE
// the ranked list, alongside the category row that moved in v6.62. Both are
// NAVIGATION — two skimmable rows of controls — not competing answers, and the
// ranked list still leads over events, the hero rail and every content surface
// below, which is what the v6.58 measurement was actually about. The assertion
// is kept and inverted rather than deleted, so the position stays pinned.
ok(iMenuUse > 0 && iMenuUse < iBest, `the discovery rail renders ABOVE <BestNearby> (${iMenuUse} vs ${iBest}) — owner directive 2026-08-08`);
ok(iBest < iEvents && iBest < iHero, "…and the ranked list still leads every CONTENT surface (events, hero) — the v6.58 measurement stands");
ok((HOME.match(/discoveryMenu\}/g) || []).length === 1,
  "the discovery rail renders from exactly ONE site — it used to sit in three mutually exclusive events-state branches, which is how it ended up below the fold in every one of them");

/* It must also sit OUTSIDE the events-present branch. Nested there, a visitor
   with no events nearby saw no ranked list at all — the case where they most
   need something to look at. */
const eventsBranch = HOME.indexOf("foryouEvents && foryouEvents.length > 0");
ok(eventsBranch > -1, "PROBE: the events-present branch exists");
ok(
  iBest < eventsBranch,
  `<BestNearby> is not nested inside the events-present branch (${iBest} vs ${eventsBranch}) — it must render when there are no events nearby too`
);

/* ── 7. THE REASON LINE ────────────────────────────────────────────────
   wf_best_picks returns `reasons text[]` and wf_things_to_do returns
   `subtitle`. Both have always come back over the wire and NEITHER was ever
   rendered — the engine explained every pick to nobody, while the list showed
   a distance and a score and left "why" to the imagination.

   §A RUNS reasonLine over the real shapes the RPC produces, including the ones
   that are not arrays of strings. It is a total function over untrusted data;
   a throw here renders nothing at all. */
// Imported from lib/, not from the component — a plain-node guard cannot
// parse JSX, and pure logic that a guard must EXECUTE belongs in lib/ anyway
// (same reason lib/score.js exists).
const bn = await import(new URL("../lib/reasonLine.js", import.meta.url).href).catch(() => null);

if (bn && typeof bn.reasonLine === "function") {
  const { reasonLine } = bn;
  ok(reasonLine(["Breakfast — right for the hour", "Local favorite — 4.8★ from 1128 reviews"])
     === "Breakfast — right for the hour · Local favorite — 4.8★ from 1128 reviews",
     "reasonLine joins the engine's two reasons into one sentence");
  ok(reasonLine(["Breakfast — right for the hour"]) === "Breakfast — right for the hour",
     "a single reason renders alone, without a dangling separator");
  ok(reasonLine(["a", "b", "c"]) === "a · b",
     "at most TWO reasons — a third cannot fit two lines at 390px, and the row height is load-bearing");
  ok(reasonLine(["x", "x"]) === "x", "a repeated reason is not printed twice");
  ok(reasonLine(["  ", "real"]) === "real", "blank entries are dropped, not rendered as empty separators");
  // Every one of these is a shape the wire can actually produce.
  for (const bad of [null, undefined, [], [null], [""], ["   "], [undefined, null], 42, "str", {}]) {
    let out, threw = false;
    try { out = reasonLine(bad); } catch (e) { threw = true; }
    ok(!threw, `reasonLine(${JSON.stringify(bad)}) does not throw — it runs inside a render`);
    ok(out === null, `reasonLine(${JSON.stringify(bad)}) returns null, not "" — the caller branches on truthiness`);
  }
} else {
  fail.push("could not import reasonLine from lib/reasonLine.js");
}

/* §B — it must actually be PASSED to the row, on every list that has one. A
   perfect formatter nothing calls is decoration. */
const BN = readFileSync(SRC_PATH, "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
// v7.06 — THE RULE INVERTED, by owner directive (2026-08-09): "no verified hook
// means render nothing". Until now the eat row read
// why={toHookLine(...) || reasonLine(...)} and the things-to-do row read
// why={reasonLine([r.subtitle])}, on the older principle that a row must never
// LOSE text. That principle is exactly what put a generic engine reason — one
// true of fifty other places — under a card whose whole job is to say why THIS
// one. The place rows now render the verified editorial line or nothing at all.
//
// The invariant this section protects is unchanged in substance: every row list
// still routes `why` through a GOVERNED source and nothing generic is invented.
// What changed is WHICH source governs WHICH list. All three halves are
// asserted, because dropping any one of them is a real regression:
const hookWhy = [...BN.matchAll(/why=\{toHookLine\(/g)].length;
ok(hookWhy >= 2, `both PLACE row lists render the verified editorial line (found ${hookWhy}, expected 2: eat, things-to-do)`);
// The fallback that the law forbids. This is the assertion that would have gone
// red on the old code, and it is what keeps the filler from creeping back.
const fallbackWhy = [...BN.matchAll(/why=\{[^}]*toHookLine\([^}]*\|\|/g)].length;
ok(fallbackWhy === 0, `no place row falls back from the editorial line to generic filler (found ${fallbackWhy}) — "no verified hook means render nothing"`);
// ...but a TOUR is not a place. A Viator product has no wf_editorial row, so a
// hook it can never have must not blank the supplier subtitle it legitimately
// does have. reasonLine still governs that one list.
const tourWhy = [...BN.matchAll(/why=\{reasonLine\(/g)].length;
ok(tourWhy >= 1, `the tours row still renders its supplier subtitle through reasonLine (found ${tourWhy}) — a product with no editorial row must not be blanked`);
ok(/function Row\(\{[^}]*\bwhy\b/.test(BN), "Row accepts a `why` prop");
ok(/\{why \? \(/.test(BN), "Row renders the why line conditionally — a place with no reason must not get an empty div");

/* §C — the clip. The expanded panel is overflow:hidden with a hard maxHeight
   tuned to the pre-reason row. Taller rows silently lose the bottom of the
   list: no error, no warning, nothing in a diff. */
ok(/const ROW_MAX_H = (\d+);/.test(BN), "the row height budget is a named constant");
const rowMax = Number((BN.match(/const ROW_MAX_H = (\d+);/) || [])[1]);
ok(rowMax >= 96, `ROW_MAX_H is at least 96 (got ${rowMax}) — 64 was the pre-reason row and a two-line why adds ~32px, so the last rows get clipped`);
ok(/maxHeight: isOpen \? 10 \* ROW_MAX_H/.test(BN), "the panel's maxHeight is computed from ROW_MAX_H, not from a literal");

// ═══════════════════════════════════════════════════════════════════════════
// v6.97 — THE ANSWER HEADLINE, THE HEAD SLICE, AND THE MOOD ROW.
//
// The surface now states an answer before it asks anything: a headline, a real
// count, three results, a way to see the rest, and four moods. Each of those is
// a promise to a reader who has about ten seconds, and each can rot silently.
// ═══════════════════════════════════════════════════════════════════════════
{
  // Reuses the module-level BN, which already strips {/* JSX comments */} with
  // the NARROW pattern this repo learned the hard way (a greedy /* */ strip
  // once deleted 158KB of live code from app/home.js because regex literals
  // contain "/*"). Re-reading raw would make every assertion below match this
  // file's own explanatory comments — which is exactly how the "old eyebrow is
  // gone" check first failed: the only remaining occurrence was in a comment
  // describing its removal.

  // ── the headline ──
  ok(/<h2[^>]*>\s*\{headline\.lead\}/.test(BN.replace(/\n\s*/g, " ")),
     "the answer renders as an h2 — it is the page's real heading, not decorative text");
  ok(/backgroundClip: "text"[\s\S]{0,80}\{headline\.tail\}/.test(BN),
     "…with the time-of-day half carrying the gradient, as approved");
  ok(!/Nearby, right now/.test(BN),
     "the old eyebrow is gone — it described the section instead of answering the question");

  // ── every number in it is real ──
  ok(/const n = openList\.length;/.test(BN),
     "the headline's count comes from the list actually rendered, never a literal");
  ok(/n \? n \+ " places "/.test(BN),
     "the count clause is DROPPED when the list is empty or loading — '0 places scored' is worse than no count");
  ok(!/\b30 places\b/.test(BN) && !/See all 30\b/.test(BN),
     "no hard-coded result count survives from the mockup — the mockup said 30, the engine says what it says");
  ok(/See all \{list\.length\} ranked near you/.test(BN),
     "the see-all label counts the real list, so it can never over-promise");
  ok(/hourLabel\(ctx\.hour\)[\s\S]{0,40}ctx\.dayName/.test(BN),
     "the hour and day come from the same nowContext() the RANKING uses — a headline on a different clock than the sort is a lie about what was ranked");
  ok(/Math\.floor/.test(BN.slice(BN.indexOf("function hourLabel"), BN.indexOf("function hourLabel") + 400)),
     "the hour label is whole-hour — minute precision on a daypart-bucketed ranking claims accuracy the sort does not have");
  ok(/no paid placement/.test(BN), "the integrity line ships with the answer, not buried in a footer");

  // ── the head slice ──
  const head = BN.match(/const HEAD_COUNT = (\d+)/);
  ok(!!head && Number(head[1]) === 3, `HEAD_COUNT is 3 (got ${head && head[1]}) — the approved design shows three above the fold`);
  ok((BN.match(/showAll \? list : list\.slice\(0, HEAD_COUNT\)/g) || []).length === 2,
     "BOTH lists (eat and things-to-do) slice to the head — one that ignored it would push the other's see-all off screen");
  ok(/setShowAll\(false\);/.test(BN.slice(BN.indexOf("const toggle ="), BN.indexOf("const toggle =") + 400)),
     "switching section resets see-all — it is a statement about the list in front of you, not a sticky preference");

  // ── the mood row points at REAL pages ──
  const moodBlock = BN.slice(BN.indexOf("const MOODS = ["), BN.indexOf("];", BN.indexOf("const MOODS = [")));
  const hrefs = [...moodBlock.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
  ok(hrefs.length >= 3, `the mood row has real destinations (got ${hrefs.length})`);
  for (const h of hrefs) {
    const dir = path.join(REPO, "app", h.replace(/^\//, ""));
    ok(existsSync(path.join(dir, "page.js")),
       `mood chip "${h}" resolves to a real page (app${h}/page.js) — a chip that 404s is a dead end at the exact moment someone is deciding to trust this`);
  }
  ok(/href: null/.test(moodBlock),
     "the current view renders as SELECTED STATE, not a link to the page the reader is already on");
  ok(/Or change the mood/.test(BN), "the row is labelled, so the chips read as alternatives rather than filters already applied");
}

// ═══════════════════════════════════════════════════════════════════════════
// v6.97b — THE REST OF THE APPROVED SCROLL: creator finds get their own row,
// the guides finally get linked from home, and the six categories move below
// the answer instead of being the first thing a stranger has to solve.
//
// RESTORED in v6.98. This entire block shipped in #631 and was DELETED by
// #632 — a PR about creator photo consent, which touched none of the code
// below. Sixteen assertions went with it and the suite stayed green, because
// a guard that checks less still passes. check-guard-integrity.mjs catches
// assertions written BELOW the report; nothing caught assertions removed
// outright. The TDZ rule at the bottom is the one that took the home page
// down once already, and it has been unprotected since 2026-08-06.
//
// SUPERSEDED in part by v6.62 (2026-08-08, owner: "add this to the top of
// the page", re: the category row). The categories-below-the-answer ORDER
// assertion below is now categories-ABOVE-the-answer — a direct, explicit
// reversal, not a regression. Everything else in this block (BestNearby
// before CreatorFinds, the shared videoPlaces array, the TDZ rule, the
// bridge) is untouched; only the categories' position moved.
// ═══════════════════════════════════════════════════════════════════════════
{
  const HOME = readFileSync(path.join(REPO, "app/home.js"), "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  // ── order on the page: categories, then the answer, then creators ──
  // Anchor on the TAG, not on whichever prop happened to come first: #634
  // added `category=` to <BestNearby> and this restored assertion went red on
  // the very first run, which is the same pin-the-literal-source fragility
  // that broke four guards this week. The claim is about ORDER, not props.
  const iBestNearby = HOME.indexOf("<BestNearby ");
  const iFinds = HOME.indexOf("<CreatorFinds items=");
  const iCats = HOME.indexOf("<CategoryMenu tight activeCat=");
  ok(iBestNearby > 0 && iFinds > 0 && iCats > 0, "all three home sections render (answer, creator finds, categories)");
  ok(iBestNearby < iFinds, "the ANSWER comes before the creator row");
  ok(iCats > 0 && iCats < iBestNearby, "the six categories sit ABOVE the answer and the creator row (v6.62, owner: \"add this to the top of the page\") — the ranked list below is still unmoved relative to events/hero/discovery, see the v6.58 block above");

  // ── one list, two surfaces ──
  ok(/<CreatorFinds items=\{videoPlaces\}/.test(HOME) && /<BestNearby[^>]*videoPlaces=\{videoPlaces\}/.test(HOME),
     "the ranked-list section and the creator row read the SAME videoPlaces array — two derivations of one list is how these surfaces drift apart");
  ok(!/videoPlaces=\{\(\(\) =>/.test(HOME),
     "videoPlaces is no longer an IIFE inlined in JSX, recomputed every render for a section that is switched off");

  // ── THE TDZ RULE, learned the hard way ──
  // useMemo evaluates its dependency ARRAY on the first render, so a hook that
  // reads a `const` declared further down throws "Cannot access before
  // initialization" and takes the whole page down. `check:jsx` passes on it —
  // tsc does not model temporal dead zones. This shipped-blocking bug was
  // caught by hand; this assertion is why it cannot come back.
  const iMemo = HOME.indexOf("const videoPlaces = useMemo(");
  ok(iMemo > 0, "videoPlaces is memoised");
  for (const dep of ["suggested", "places", "locName"]) {
    const iDecl = HOME.indexOf(`const [${dep},`);
    ok(iDecl > 0 && iDecl < iMemo,
       `"${dep}" is declared BEFORE the videoPlaces useMemo that depends on it — a later declaration is a temporal-dead-zone crash on first render, and tsc does not see it`);
  }

  // ── the bridge ──
  ok(/<LocalEdit center=\{center\}/.test(HOME), "the home screen links to the guides — they pull traffic from Google and dead-end without this");
  const LE = readFileSync(path.join(REPO, "app/components/LocalEdit.js"), "utf8");
  ok(/if \(!rows\.length\) return null;/.test(LE),
     "LocalEdit renders NOTHING when no guide covers the reader's area — a 'local edit' heading over guides from three hours away is a false claim");
  const radius = Number((LE.match(/LOCAL_EDIT_RADIUS_MI = (\d+)/) || [])[1]);
  ok(radius > 0 && radius <= 120, `the local radius is real and bounded (${radius} mi)`);
  ok(/export function readMinutes/.test(LE) && /WORDS_PER_MIN/.test(LE),
     "read time is COMPUTED from the guide's own body — a hand-typed '5 min' is a number nobody ever updates");
  ok(/g\.teaser/.test(LE) && !/teaser:\s*"/.test(LE),
     "the teaser is the guide's OWN teaser, not new copy written here that can drift from what the article delivers");

  // ── the creator row ──
  const CF = readFileSync(path.join(REPO, "app/components/CreatorFinds.js"), "utf8");
  // 2026-08-07: the empty-state guard, updated for registry-hydrated cards. The
  // row now renders the nearest city's SCOUTED spots when the pool is empty
  // (owner: "I don't see creators on Sarasota"), so the null-return condition
  // gained `!scouted.length`. The invariant is unchanged: render NOTHING only
  // when there is genuinely nothing — no local find, no registry spots, and no
  // bridge.
  // v7.07 — REGISTRY SPOTS ARE NO LONGER A FALLBACK. scoutedSpots() returned []
  // unless the pool was completely empty, so a reader with three pool finds saw
  // three cards while the registry held twenty more inside the same 25 miles.
  // The owner's ruling: "the limiter is the place pool, not the library."
  // mergeCreatorInventory() now merges both into ONE inventory.
  //
  // The invariant is unchanged and is what is asserted: render NOTHING only when
  // there is genuinely nothing — no inventory at all, and no bridge. It is
  // strictly STRONGER now, because `inventory` covers pool and registry rows
  // together, where the old condition needed two separate terms to say it.
  ok(/if \(!inventory\.length && !bridge\) return null;/.test(CF),
     "the creator row renders nothing ONLY when there is no inventory at all (pool or registry) AND no bridge — an empty 'your differentiator' shelf advertises the absence");
  ok(/mergeCreatorInventory\(\{ pool: items, byCity/.test(CF),
     "the row builds ONE inventory from the pool and the registry together, rather than treating the registry as an empty-pool fallback");
  // 2026-08-07 (owner: pin placeholders "not what I wanted"): the scouted cards
  // resolve REAL venue photos. Locked by structure — the search route now
  // returns photo_ref, and the component hydrates + renders it.
  {
    const searchRoute = readFileSync(path.join(REPO, "app/api/places/search/route.js"), "utf8");
    ok(/photo_ref: photoRef/.test(searchRoute) && /p\.photos\[0\]\.name/.test(searchRoute),
      "the places/search route surfaces photo_ref (first photo resource name) so a caller can render a venue photo without a second round-trip");
    // v7.07 — the resolver was generalised from a photo lookup into a full
    // hydrator (resolveScoutedPlace): the SAME cached call now also returns the
    // real types, rating and price the FIELD_MASK was already paying for. Types
    // are what lib/dining.js needs to name a cuisine, and without them a cuisine
    // filter over scouted spots would have no data behind it.
    ok(/resolveScoutedPlace\(/.test(CF) && /\/api\/places\/search\?q=/.test(CF),
      "CreatorFinds resolves each scouted spot through the cached search endpoint");
    ok(/types: Array\.isArray\(first\.types\)/.test(CF),
      "…and keeps the REAL Google types off that response — a hydrated rating or cuisine is looked up, never invented");
    // v7.02: the row renders the shared RailCard, so the <img> moved out of
    // this file. FOLLOW THE CODE — assert both halves of the invariant across
    // the two files rather than deleting the protection: CreatorFinds hands
    // the resolved photo to the card, and the card renders a real <img> when
    // it has one and a placeholder tile only when it does not.
    const RC = readFileSync(path.join(REPO, "app/components/RailCard.js"), "utf8");
    // v7.07 — the hydrated place, not a photo-only map. `h` is the resolved
    // Google place or null, and the SAME null decides every optional field on
    // the card: photo, score and facts. That is the honesty rule in one
    // variable — a card shows what was resolved and omits what was not.
    ok(/photo=\{\(h && h\.photo\) \|\| null\}/.test(CF),
      "…and hands that resolved photo to the card (the placeholder shows only while loading or on a genuine miss)");
    ok(/score=\{h && h\.rating \? cardScore\(/.test(CF),
      "…a registry card scores ONLY when the lookup returned a real rating — an unresolved spot carries no score, never a zero or a guess");
    ok(/photo\s*\n?\s*\?\s*<img/.test(RC) && /wf-place-card-monogram/.test(RC),
      "…and RailCard renders a real <img> when given a photo, falling back to the monogram tile only when there is none");
    ok(/\/api\/photo\?ref=/.test(CF) && /REF_RX\.test\(ref\)/.test(CF),
      "the photo goes through the guarded /api/photo proxy with a shape-checked ref — never a bare Google URL");
    ok(/center=\{center\}/.test(HOME) || /center: center/.test(HOME),
      "home.js passes the viewer center to CreatorFinds so the photo search is location-biased");
  }
  // Tests the PROPERTY (does it read a video thumbnail field?), not the word.
  // The first version grepped for "thumbnail" in raw source and failed on this
  // component's own comment explaining that it never uses one — the same
  // comment-matching mistake that bit the "old eyebrow is gone" check.
  ok(/p\.photo/.test(CF) && !/\bv\.thumbnail\b|videos\[0\]\.thumbnail/.test(CF),
     "cards use the PLACE's own photo and never read a video thumbnail field (the never-re-host rule)");
  ok(/PLATFORM\[v\.platform\]/.test(CF), "the platform badge comes from the single PLATFORM source, so a new platform is covered automatically");

  // ── v6.98 COVERAGE: one card is worse than none ──
  // The row was built for empty and for full, never for ONE. A reader in
  // Parrish got a single orphan card with dead space beside it, which reads as
  // a broken feature rather than as thin coverage. RANKING_AND_FEATURING_SPEC
  // §4 already ruled: below three, offer the nearest covered metro instead of
  // rendering a thin local list.
  //
  // The rule is EXECUTED here, not grepped. That is why it lives in lib/ — a
  // grep proves a constant exists, only a run proves the rule holds.
  const CFL = await import(new URL("../lib/creatorFinds.js", import.meta.url).href);
  // Executed, not grepped: scoutedSpots is pure logic in lib/, so prove it.
  {
    const byCity = [{ city: "Sarasota", distMi: 4, spots: [
      { key: "a", name: "Marie Selby Botanical Gardens", city: "Sarasota", video: { platform: "tiktok", creator: "thefloridaqueenie_" } },
      { key: "b", name: "Perspire Sauna Studio", city: "Sarasota", video: { platform: "tiktok", creator: "theerynlalonde" } },
      { key: "c", name: "Quiero Coffee", city: "Sarasota", video: { platform: "instagram", creator: "tampaiman" } },
    ] }];
    const br = CFL.bridgeCity(byCity, 0);
    const spots = CFL.scoutedSpots(byCity, br, 0);
    ok(spots.length === 3 && spots[0].name === "Marie Selby Botanical Gardens",
      `an empty pool renders the city's 3 real scouted spots, not a lone arrow (got ${spots.map((s) => s.name).join(", ")})`);
    ok(CFL.scoutedSpots(byCity, br, 5).length === 0,
      "when the pool ALREADY has finds (rowCount>0), the with-photo path is untouched — no registry fallback");
    ok(CFL.scoutedSpots(byCity, null, 0).length === 0, "no bridge -> no scouted fallback");
    ok(CFL.scoutedSpots(null, br, 0).length === 0, "no byCity -> no scouted fallback (fail-closed)");
  }
  ok(CFL.CREATOR_FINDS_MIN >= 2 && CFL.CREATOR_FINDS_MIN <= 4, `the thin-row threshold is real and small (${CFL.CREATOR_FINDS_MIN})`);
  ok(CFL.CREATOR_BRIDGE_MAX_MI > 0 && CFL.CREATOR_BRIDGE_MAX_MI <= 120, `"worth the drive" is bounded (${CFL.CREATOR_BRIDGE_MAX_MI} mi)`);

  const FAR = { city: "Faraway", spots: [1, 2, 3], distMi: CFL.CREATOR_BRIDGE_MAX_MI + 1 };
  const THIN = { city: "Thintown", spots: [1], distMi: 5 };
  const DEEP = { city: "Deepcity", spots: [1, 2, 3, 4, 5], distMi: 30 };
  const NOCOORD = { city: "Unplaced", spots: [1, 2, 3], distMi: null };

  ok(CFL.bridgeCity([THIN, DEEP], 1) && CFL.bridgeCity([THIN, DEEP], 1).city === "Deepcity",
     "ONE local find bridges to the nearest city that actually has depth — this is the Parrish case the owner reported, and the whole reason this rule exists");
  ok(CFL.bridgeCity([DEEP], CFL.CREATOR_FINDS_MIN) === null,
     "a healthy row is left alone — the bridge appears only BELOW the threshold, never as permanent furniture");
  ok(CFL.bridgeCity([THIN], 1) === null,
     "it never points at a city as thin as the one the reader is standing in — sending someone thirty miles for one card is the same disappointment, one town over");
  ok(CFL.bridgeCity([FAR], 0) === null,
     `a city past ${CFL.CREATOR_BRIDGE_MAX_MI} mi is a different trip, not a suggestion`);
  ok(CFL.bridgeCity([NOCOORD], 0) === null,
     "a city with no coordinates is SKIPPED, never guessed at — same fail-closed rule as beachMilesFrom()");
  ok(CFL.bridgeCity(undefined, 0) === null && CFL.bridgeCity(null, 1) === null,
     "no city data at all is not a crash and not a claim");
  const picked = CFL.bridgeCity([DEEP], 0);
  ok(picked && picked.count === DEEP.spots.length,
     "the count printed is that city's OWN spot total — never arithmetic against what the reader is already looking at, which is the kind of number that goes subtly wrong");

  // ── orderFinds is DISTANCE-FIRST (2026-08-07, owner screenshot from
  // Parrish: the LOCAL finds row led with a big-reach Bradenton TikTok spot
  // while his own town's creator spots existed — reach outranked nearness on
  // a surface whose whole name is "local"). Proven by CALLING it: an
  // own-band low-reach spot must beat a farther high-reach one; within a
  // band the old boost-then-score judgement must still hold; unknown
  // distance sorts last, never guessed closer.
  {
    const near = { p: { name: "PJ Sandwich", distMi: 2, wfScore: 80 } };
    const farBig = { p: { name: "Spinning Coffee", distMi: 11, wfScore: 95 } };
    const noDist = { p: { name: "Mystery", wfScore: 99 } };
    const o1 = CFL.orderFinds([farBig, noDist, near]).map((x) => x.p.name);
    ok(o1[0] === "PJ Sandwich", `a 2-mi spot outranks an 11-mi spot on the LOCAL row regardless of score/reach (got ${o1.join(" > ")})`);
    ok(o1[o1.length - 1] === "Mystery", "unknown distance sorts LAST — never silently treated as nearby");
    const sameBandA = { p: { name: "A", distMi: 3, wfScore: 90 } };
    const sameBandB = { p: { name: "B", distMi: 5, wfScore: 95 } };
    const o2 = CFL.orderFinds([sameBandA, sameBandB]).map((x) => x.p.name);
    ok(o2[0] === "B", "within one distance band the score/boost judgement still decides (same-band 95 beats 90)");
    ok(Number.isFinite(CFL.CREATOR_FINDS_BAND_MI) && CFL.CREATOR_FINDS_BAND_MI >= 5 && CFL.CREATOR_FINDS_BAND_MI <= 15,
      `the band width is a sane constant (${CFL.CREATOR_FINDS_BAND_MI} mi) — raw-mile sorting would let GPS jitter reshuffle the row`);
  }

  // ── displayName beats the matcher root on every browse surface (2026-08-07:
  // the sheet showed a Parrish place literally named "Ryan" — the deliberately
  // shortened MATCH root leaking into the UI as a label). Proven by calling
  // the real builder over the real registry.
  {
    const CV = await import(new URL("../lib/creatorVideos.js", import.meta.url).href);
    const groups = CV.spotsByCity({ lat: 27.5864, lng: -82.4257 }); // Parrish
    const all = groups.flatMap((g) => g.spots.map((x) => x.name));
    ok(all.length > 10, `the browse builder returns real inventory (${all.length} spots) — an empty walk would make the next check vacuous`);
    ok(!all.includes("Ryan"), "no spot renders under the bare matcher root \"Ryan\" — displayName carries the human label");
    ok(all.includes("Ryan's Coffee House"), "…and the Parrish coffee house appears under its actual name");
  }

  // The distance decides; it is never SHOWN. lib/creatorVideos.js says in its
  // own comment that CITY_COORDS is for sorting and is "never shown to a
  // user" — a "35 mi" label built from a city centroid would break that and
  // claim a precision the data cannot back up.
  ok(!/distMi/.test(CF),
     "the row never renders a distance — city centroids sort, they do not measure, and lib/creatorVideos.js promises they are never shown");
  // v7.02 corollary: the cards now share the /best-of card's facts row, and
  // that row DOES print a distance elsewhere. The ban above still holds here
  // because the two card kinds in this row are not the same: pool rows carry a
  // measured distMi, registry rows carry a city centroid, and one facts row
  // cannot tell them apart at render time. So neither prints one.
  ok(/function cardFacts\(/.test(CF) && !/ mi"/.test(CF),
     "cardFacts() builds this row's meta from reviews / price / open-closed only — no distance string is assembled anywhere in it");
  ok(/Creators in \$\{bridge\.city\}/.test(CF) && /poolCount \|\| registryRows\.length \? "Finds from local creators"/.test(CF),
     "with no local find the heading names the city the finds are ACTUALLY in — 'local' is a claim, and another city's spots are not the reader's");
  ok(/byCity=\{socialFindByCity\}/.test(HOME),
     "the row reads the SAME spotsByCity memo the bookshelf hero already uses — a second derivation is how two surfaces start disagreeing about where the finds are");
  ok(/onBrowse=\{\(\) => setSocialFind\(\{ browse: true \}\)\}/.test(HOME),
     "the bridge opens the existing library browse view rather than inventing a second destination for the same content");
}

// THE REPORT MUST BE THE LAST THING BEFORE THE SUMMARY.
//
// It used to sit in the middle of this file. `ok()` here COLLECTS failures
// rather than exiting on the first one (so a run reports everything wrong at
// once, which is the better behaviour) — but that makes placement load-bearing:
// every assertion written below the report was collected into `fail` and then
// never looked at. Nineteen assertions were added in v6.97 and silently
// discarded; the guard cheerfully printed "69 assertions passed" while holding
// nine real failures. Anything appended after this block is invisible.
// scripts/check-guard-integrity.mjs asserts this ordering across the suite.
if (fail.length) {
  console.error(`check-home-answer-first: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-home-answer-first: ${pass} assertions passed (default section "${decl[2]}", ${ids.length} sections, ranked list leads the feed at index ${iBest})`);
