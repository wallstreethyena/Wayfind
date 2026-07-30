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
// Strip comments FIRST — chips.js documents the old dead URL in a comment, and a
// raw-text check fails on that prose. Fifth time this trap has fired today.
const chipsRaw = readFileSync(path.resolve("app/eat/[metro]/chips.js"), "utf8");
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
  "the sheet renders the tiers the RPC assigns rather than deciding the floor itself");
ok(!/>= 3|>=3/.test(sheet),
  "the 3-place floor lives in SQL, not duplicated in the page — two copies of a threshold drift");

// ── 3. the thin band is SHOWN ─────────────────────────────────────────────
ok(/nearby/.test(sheet), "a thin chip shows its honest count");
// Assert the thin rows are MAPPED into JSX. `thin.length` alone passed even with
// the whole block disabled, because the empty-state ternary also references it.
ok(/thin\.map\(/.test(sheet), "the thin rows are rendered — mapped into JSX, not just counted");
ok(/tier="thin"/.test(sheet) && /tier="full"/.test(sheet),
  "both tiers are passed to the chip component, so the visual hierarchy is data-driven");
ok(/\{thin\.length \? \(/.test(sheet),
  "the thin row is gated on having thin chips, not on a constant — `{false ? (` passed a looser check");
// Section headers: MAX 3 WORDS (owner). Longer ones read as system copy next to a
// premium hero.
{
  const subs = [...sheet.matchAll(/className="wf-eat-sub">([^<]+)</g)].map((m) => m[1].trim());
  ok(subs.length >= 2, `both section headers are present (${subs.length})`);
  for (const h of subs) ok(h.split(/\s+/).length <= 3, `header "${h}" is 3 words or fewer`);
  ok(subs.some((h) => /fewer|couple|few/i.test(h)),
    "the thin row's header still signals scarcity, so the count reads as honesty rather than an error");
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
ok(/\.wf-eat-chip-count\{[^}]*border-radius:999px/.test(sheet),
  "the count is a BADGE, not trailing text");
ok(/min-height:46px/.test(sheet), "full chips have a comfortable tap target");
ok(/\.wf-eat-chip a:active/.test(sheet) && /:focus-visible/.test(sheet),
  "press and keyboard-focus states exist, not just hover");
ok(/\.wf-eat-thin a\{[\s\S]{0,200}?color:\$\{C\.muted\}/.test(sheet),
  "thin chips are visually QUIETER than full chips so the hierarchy reads at a glance");
ok(/@media \(max-width:420px\)/.test(sheet), "mobile spacing is tuned rather than inherited");

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
