#!/usr/bin/env node
/**
 * check-cuisine-sheet — the Phase 4 sheet honours the rules the data layer set.
 *
 * Three things it must not do, all of which would look fine in a screenshot:
 *   1. compose a search query from a cuisine (the Puerto-Rico bug, in the UI);
 *   2. hardcode the chip list instead of deriving it from wf_cuisine_chips();
 *   3. hide the 1-2 band. An honest thin chip still routes a user to a bookable
 *      place; a hidden one routes them to Google.
 *
 * Plus the tile swap: the chooser replaces "Family favorites" in the quick-link
 * grid, and falls back to it outside the three metros with real inventory —
 * routing a Miami user to Orlando's chip list would show counts for restaurants
 * 200 miles away, which is the same lie as widening a radius.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { cuisineMetroFor, CUISINE_METROS, CUISINE_METRO_RADIUS_MI } from "../lib/cuisine.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const SHEET = "app/eat/[metro]/page.js";
ok(existsSync(path.resolve(SHEET)), "the cuisine sheet exists");
const rawSheet = readFileSync(path.resolve(SHEET), "utf8");
const sheet = rawSheet.replace(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const home = readFileSync(path.resolve("app/home.js"), "utf8");

// ── 1. never a query ──────────────────────────────────────────────────────
for (const forbidden of ["textQuery", "searchText", "places.googleapis.com", "queryFor", "locationBias"]) {
  ok(!sheet.includes(forbidden), `the sheet must not contain "${forbidden}" — a cuisine is a filter, never a query`);
}
// THE P0 BUG THIS GUARD MISSED. It asserted the link SHAPE (a cuisine= param, no
// q=) and never that anything on the other end READ it. The chips pointed at
// /?cat=food&cuisine=<slug>; home.js reads only go/date/cat and STRIPS unknown
// params, so every chip landed back on the plain home page — dead UI on the newest
// monetized surface. Text-presence dressed as behaviour, for the fourth time
// today. So: resolve the target route and require that it exists.
// ─────────────────────────────────────────────────────────────────────────────
// TRANSLATED FOR THE v3 REDESIGN (owner-signed, docs/mocks/eat-hero-chips-mock-v3.html)
//
// The chooser moved INSIDE the cream hero card and became two tiers — six
// gold-framed featured cards plus a dotted-leader index — with NO pills anywhere.
// Several assertions below were written against the old pill/thin markup and would
// now fail on a design the owner signed. Each was REPLACED, not deleted, by one
// protecting the SAME property under the new markup:
//
//   OLD assertion                        NEW assertion (same property)
//   chips.js is the component       ->   CuisineMenu.js is the component
//   tier="full" / tier="thin" props  ->   splitTiers() CALLED: 6 featured + rest
//   thin.map( renders thin rows      ->   index.map( renders the index rows
//   {thin.length ? ( gating          ->   {index.length ? ( gating
//   a header matching /fewer|few/    ->   every index row renders its own count
//   .wf-eat-chip-count has           ->   NO border-radius:999px anywhere: the
//     border-radius:999px                  count is a serif numeral, not a pill
//   .wf-eat-thin a is quieter        ->   featured cards carry a gold double
//     ("hierarchy at a glance")            hairline the index rows do not
//   .wf-eat-chip a:active/:focus     ->   :active and :focus-visible on both tiers
//   @media (max-width:420px)         ->   the mock's 900px and 520px breakpoints
//
// Design-INDEPENDENT protections are unchanged: no cuisine may reach a query, the
// list is derived and never literal, hrefs resolve to a real route, SSG is intact,
// "could not ask" stays distinct from "nothing here", 46px tap targets, and the tap
// is instrumented.
// ─────────────────────────────────────────────────────────────────────────────
// Strip comments FIRST — the component documents the old dead URL in a comment, and
// a raw-text check fails on that prose. Fifth time this trap has fired today.
const chipsRaw = readFileSync(path.resolve("app/eat/[metro]/CuisineMenu.js"), "utf8");
const chipsSrc = chipsRaw.replace(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
const hrefs = [...chipsSrc.matchAll(/href=\{`([^`]+)`\}/g)].map((m) => m[1]);
ok(hrefs.length >= 1, `the chip component builds a link (${hrefs.length} found)`);
for (const h of hrefs) {
  ok(!/[?&](q|query|search)=/.test(h), `chip href "${h}" is not a search query`);
  // Turn the template into a route directory and require the page to exist.
  const route = h.replace(/^\//, "").replace(/\$\{[^}]*metro[^}]*\}/g, "[metro]")
                 .replace(/\$\{[^}]*\}/g, "[cuisine]").replace(/\/+$/, "");
  const target = path.resolve("app", route, "page.js");
  ok(existsSync(target),
    `chip href "${h}" resolves to a REAL page (expected app/${route}/page.js). A link to a route that does not exist is dead UI.`);
}
ok(!/\?cat=food&cuisine=/.test(chipsSrc),
  "chips no longer point at /?cat=food&cuisine= — nothing ever read that param");
// ...and the destination must actually filter by the cuisine it was handed.
const dest = readFileSync(path.resolve("app/eat/[metro]/[cuisine]/page.js"), "utf8");
ok(/wf_cuisine_places/.test(dest), "the destination filters inventory by the cuisine it was given");
ok(/p_cuisine: params\.cuisine/.test(dest), "it uses the cuisine from the URL, not a hardcoded one");
ok(/notFound\(\)/.test(dest), "an empty or unknown cuisine 404s rather than rendering an empty list");
ok(/generateStaticParams/.test(dest), "SSG is intact — only (metro, cuisine) pairs with places get a route");

// ── 2. derived, not hardcoded ─────────────────────────────────────────────
// Assert the RPC is CALLED, not merely mentioned. Checking for the string
// "rpc/wf_cuisine_chips" passed even when chipsFor() was left defined but
// unused and the chips replaced by a literal — the text was still in the file.
ok(/rpc\/wf_cuisine_chips/.test(sheet), "the chip list comes from wf_cuisine_chips()");
ok(/await chipsFor\(params\.metro\)/.test(sheet),
  "chipsFor() is actually AWAITED — a defined-but-uncalled fetch still contains the RPC name and would pass a text check");
// No array literal of chip-shaped objects anywhere in the page.
ok(!/\[\s*\{\s*cuisine\s*:/.test(sheet),
  "no hardcoded array of chip objects — the list must be derived");
ok(!/const (CHIPS|CUISINE_CHIPS|chips)\s*=\s*\[/.test(sheet), "chips are never assigned from a literal");
ok(/tier === "full"/.test(sheet) && /tier === "thin"/.test(sheet),
  "the sheet still reads the tiers the RPC assigns rather than deciding the floor itself (they now drive structured data and the empty state)");
ok(!/>= 3|>=3/.test(sheet),
  "the 3-place floor lives in SQL, not duplicated in the page — two copies of a threshold drift");

// ── 3. the two tiers, DERIVED — splitTiers is CALLED, not read ────────────
// Replaces the old tier="full"/tier="thin" prop check. That asserted markup; this
// asserts behaviour, which is what actually decides who gets a featured card.
const { splitTiers, FEATURED_COUNT } = await import("../lib/cuisineTiers.js");
ok(FEATURED_COUNT === 6, `six cuisines are featured, two rows of three (got ${FEATURED_COUNT})`);
{
  // Real Orlando shape (2026-07-30), in the RPC's own order.
  const live = [
    { cuisine: "breakfast", places: 38 }, { cuisine: "american", places: 31 },
    { cuisine: "steakhouse", places: 22 }, { cuisine: "seafood", places: 16 },
    { cuisine: "brazilian", places: 12 }, { cuisine: "korean", places: 11 },
    { cuisine: "mexican", places: 9 }, { cuisine: "vegetarian", places: 9 },
    { cuisine: "cuban", places: 2 },
  ];
  const { featured, index } = splitTiers(live);
  ok(featured.length === 6 && index.length === 3, `the split is 6 featured + the rest (${featured.length}/${index.length})`);
  ok(featured[0].cuisine === "breakfast",
    "Orlando features Breakfast — derived from its own counts, with no per-metro branching");
  ok(featured.every((f, i) => i === 0 || f.places <= featured[i - 1].places),
    "featured order follows the RPC's places-desc order — the page does not re-sort and become a second ordering authority");
  ok(index.every((r) => live.some((l) => l.cuisine === r.cuisine)),
    "the index is the REMAINDER of the same derived list, not a separate query");
  // Tampa's shape, where Cuban sits exactly at rank 6 — the owner's prediction.
  const tampa = [
    { cuisine: "seafood", places: 20 }, { cuisine: "american", places: 18 },
    { cuisine: "italian", places: 12 }, { cuisine: "breakfast", places: 9 },
    { cuisine: "steakhouse", places: 5 }, { cuisine: "cuban", places: 3 },
    { cuisine: "greek", places: 2 },
  ];
  ok(splitTiers(tampa).featured.some((f) => f.cuisine === "cuban"),
    "Tampa features Cuban automatically — the derivation, not a special case");
  // Degenerate inputs must not throw or invent rows.
  ok(splitTiers([]).featured.length === 0 && splitTiers([]).index.length === 0, "an empty list yields no tiers");
  ok(splitTiers(null).featured.length === 0, "a null list is handled rather than thrown on");
  ok(splitTiers(live.slice(0, 3)).featured.length === 3 && splitTiers(live.slice(0, 3)).index.length === 0,
    "fewer than six cuisines means fewer featured cards and an EMPTY index — never padding to six");
}
// No static list of featured cuisines anywhere.
ok(!/\[\s*"(breakfast|cuban|seafood|american)"/i.test(chipsSrc + sheet),
  "the featured six are never a hardcoded array of cuisine names");
ok(!/params\.metro\s*===\s*["']/.test(chipsSrc) && !/metro\s*===\s*["'](tampa|orlando)/.test(chipsSrc),
  "no per-metro branching in the chooser — one derivation serves every metro");

// ── the honest count is still shown on EVERY row ──────────────────────────
// Replaces "a thin chip shows its honest count" + the /fewer|couple|few/ header
// check. The 1-2 band is no longer a separate section with a scarcity header; it
// is merged into the index, where each row carries its real number. The property
// — a 2-place cuisine is listed honestly rather than hidden — is unchanged.
ok(/index\.map\(/.test(chipsSrc), "the index rows are rendered — mapped into JSX, not just counted");
ok(/featured\.map\(/.test(chipsSrc), "the featured cards are mapped too");
ok(/\{index\.length \? \(/.test(chipsSrc),
  "the index is gated on having rows, not on a constant — `{false ? (` passed a looser check");
ok(/\{c\.places\}/.test(chipsSrc),
  "every row renders its own place count — the honesty that used to live in the 'fewer nearby' header");
{
  const tiers = [...chipsSrc.matchAll(/className="wf-eat-tiert">([^<]+)</g)].map((m) => m[1].trim());
  ok(tiers.length === 2, `both tier headers are present (${tiers.length})`);
  for (const h of tiers) ok(h.split(/\s+/).length <= 4, `tier header "${h}" stays short`);
  ok(tiers.some((h) => /popular/i.test(h)) && tiers.some((h) => /also on the menu/i.test(h)),
    "the two tiers read as one editorial system: 'Popular here' and 'Also on the menu'");
}

// ── the three states stay distinct ────────────────────────────────────────
// null (could not ask) vs [] (asked, nothing there) vs rows. Collapsing the
// first two is the conflation that hid a five-day outage.
ok(/chips === null/.test(sheet), "'could not ask' is a distinct state from 'nothing here'");
ok(/unavailable \?/.test(sheet), "...and it renders a different message");
ok(/temporary problem on our side/.test(rawSheet), "the unavailable copy says it is our problem, not an empty neighbourhood");

// ── layout is the shared template, not a copy ─────────────────────────────
ok(/from "\.\.\/\.\.\/components\/EditorialLandingHero"/.test(sheet),
  "the sheet imports EditorialLandingHero rather than copying /best-beaches markup");
ok(/prefix="wf-eat-premium"/.test(sheet), "it passes its OWN class prefix");
ok(/editorialHeroCss\("wf-eat-premium"\)/.test(sheet), "and generates CSS for that prefix");
ok(/\/cards\/food-choices-adobestock-301125732\.jpeg/.test(sheet), "the spec's hero image is used");
ok(existsSync(path.resolve("public/cards/food-choices-adobestock-301125732.jpeg")),
  "the hero image is COMMITTED — it was sitting untracked in the working tree");

// An unknown metro must 404, not 200. A 200 with an apology body is one
// indexable URL per typo, every one of them empty.
ok(/notFound\(\)/.test(sheet), "an unknown metro calls notFound() rather than rendering a 200");
ok(!/No cuisine coverage for that area yet/.test(sheet), "...and does not render a soft-404 body");

// ── the tap is instrumented (owner: show me which cuisines users want) ────
ok(/track\("cuisine_chip"/.test(chipsSrc), "a chip tap emits cuisine_chip");
for (const field of ["cuisine", "metro", "tier", "places"])
  ok(new RegExp(field).test(chipsSrc), `the event carries ${field} — a 2-place thin tap must be distinguishable from a 38-place full one`);
ok(/from "\.\.\/\.\.\/\.\.\/lib\/track"/.test(chipsSrc),
  "it uses lib/track (the tracker for surfaces outside the app shell), not a second copy");
const destParts = readFileSync(path.resolve("app/eat/[metro]/[cuisine]/parts.js"), "utf8");
ok(/track\("cuisine_place_open"/.test(destParts), "opening a place from the filtered list is instrumented too");

// ── the premium chip treatment ────────────────────────────────────────────
// NO PILLS ANYWHERE — the inverse of the old "the count is a BADGE" assertion,
// which required border-radius:999px. The signed mock renders counts as serif
// numerals inside gold-framed cards and as italic figures on index rows; a pill
// would put a third visual language into a card built to have one.
ok(!/border-radius:999px/.test(sheet),
  "no pill radius anywhere in the chooser CSS — the signed design has no pills");
ok(/\.wf-eat-fnum\{[^}]*font-family:\$\{MOCK\.serif\}/.test(sheet),
  "the featured count is a SERIF NUMERAL, per the mock");
ok(/\.wf-eat-fnum small\{/.test(sheet), "…with 'places' as the small italic suffix, not a separate badge");
// The double gold hairline is border + an inset ::before rule — the detail that
// makes a featured card read as framed rather than merely bordered.
ok(/\.wf-eat-featured a\{[\s\S]{0,400}?border:1px solid rgba\(185,138,47,\.35\)/.test(sheet),
  "featured cards carry the mock's gold border");
ok(/\.wf-eat-featured a::before\{[^}]*inset:6px[^}]*border:1px solid rgba\(185,138,47,\.18\)/.test(sheet),
  "…and the inset second hairline, which is what makes the frame read as double");
// Hierarchy, replacing the old "thin chips are quieter" check: the distinction is
// now the frame itself — index rows are dotted-leader lines with no card at all.
ok(/\.wf-eat-idots\{[^}]*border-bottom:1px dotted/.test(sheet),
  "index rows use dotted leaders — visually a menu index, not a card, so the two tiers read as a hierarchy at a glance");
ok(!/\.wf-eat-index a\{[^}]*border:1px solid rgba\(185,138,47/.test(sheet),
  "index rows do NOT carry the featured gold frame — the hierarchy would collapse if both tiers were framed");
// Tap targets and states.
ok(/min-height:46px/.test(sheet), "46px tap targets on mobile");
ok(/\.wf-eat-featured a:active/.test(sheet) && /\.wf-eat-featured a:focus-visible/.test(sheet),
  "featured cards have press AND keyboard-focus states, not just hover");
ok(/\.wf-eat-index a:focus-visible/.test(sheet),
  "index rows are keyboard-focusable too — they are anchors, not decorative rows");
ok(/@media \(max-width:900px\)/.test(sheet) && /@media \(max-width:520px\)/.test(sheet),
  "the mock's two breakpoints are both implemented");
ok(/\.wf-eat-featured\{grid-template-columns:1fr 1fr\}/.test(sheet.replace(/\s+/g, " ").replace(/ \{/g, "{")) ||
   /grid-template-columns:1fr 1fr/.test(sheet),
  "featured collapses to 2-up on mobile, per the mock and the directive");
ok(/columns:2/.test(sheet), "the index drops to 2 columns on mobile");

// ── the tile swap ─────────────────────────────────────────────────────────
ok(/eatMetro \? \["utensils", "What are you in the mood for\?", onEat\] : \["users", "Family favorites", onFamily\]/.test(home),
  "the chooser replaces Family favorites in the quick-link grid, falling back to it when no sheet serves the location");
ok(/cuisineMetroFor\(center\.lat, center\.lng\)/.test(home), "the metro comes from the app's persisted center");
ok(/goIntent\("\/eat\/" \+ eatMetro\)/.test(home), "the tile routes to the metro's own sheet");
ok(/tile: "What are you in the mood for\?", metro: eatMetro/.test(home), "the tap is instrumented with the metro");

// ── the resolver refuses to guess ─────────────────────────────────────────
for (const [name, lat, lng, want] of [
  ["Orlando", 28.54, -81.38, "orlando"],
  ["Disney Springs", 28.37, -81.52, "orlando"],
  ["St Petersburg", 27.77, -82.64, "tampa"],
  ["Bradenton", 27.50, -82.57, "manatee-sarasota"],
  ["Miami", 25.76, -80.19, null],
  ["Jacksonville", 30.33, -81.66, null],
]) ok(cuisineMetroFor(lat, lng) === want, `${name} resolves to ${want} (got ${cuisineMetroFor(lat, lng)})`);
ok(cuisineMetroFor(NaN, NaN) === null && cuisineMetroFor(undefined, 1) === null,
  "the resolver returns null on missing coordinates rather than picking a metro at random");
ok(Object.keys(CUISINE_METROS).length === 3,
  "only the three metros with real food inventory have a sheet — every other metro is at exactly 40 places, a seed not coverage");
ok(CUISINE_METRO_RADIUS_MI === 75, `the radius is the app's standard 75mi (got ${CUISINE_METRO_RADIUS_MI})`);
// Both sides exercised: some locations resolve, some must not.
ok(cuisineMetroFor(28.54, -81.38) && !cuisineMetroFor(25.76, -80.19),
  "the resolver both accepts and refuses — a resolver that always answered would pass every other assertion here");

if (fail.length) {
  console.error("check-cuisine-sheet: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`check-cuisine-sheet: OK — ${pass} assertions (never a query, derived chips, thin band shown, shared template, tile swap with an honest fallback)`);
