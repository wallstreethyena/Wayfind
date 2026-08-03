// scripts/test-partner-rail-render.mjs — actually RENDER the partner rail.
//
// WHY THIS EXISTS, and why a static guard was not enough.
//
// Audit F2/F3 mounted IntentPartnerPick on the guide pages and on
// lib/landing.js — the two highest-traffic surfaces, which carried no bookable
// rail and no commerce at all respectively. Every static guard went green, the
// build went green, and the rail rendered NOTHING on 18 of 18 guides.
//
// The reason is the #486 shape exactly: nothing CALLED the component. Each
// pick is dropped unless it has an image, and the images arrive with the
// `inventory` prop — which the new call sites passed as []. The picks resolved
// perfectly and then every one of them was filtered out. A styled surface with
// no door.
//
// So this renders the component for real, across the shapes the new call sites
// produce, and asserts cards come out the other side. It carries a NEGATIVE
// control (inventory with no images must render nothing) so a version that
// renders unconditionally cannot pass either.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { landingRailIntent, LANDING_RAIL_INTENT } from "../lib/railPlacement.js";
import { guideRailIntent, GUIDE_RAIL_INTENT } from "../lib/railPlacement.js";
import { resolvedIntentPartnerPicks } from "../lib/intentPartnerPicks.js";

let pass = 0;
const fail = (m) => { console.error("test-partner-rail-render: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mod = await loadComponent(fileURLToPath(new URL("../app/components/IntentPartnerPick.js", import.meta.url)), REPO);
const Rail = mod && (mod.default || mod);
ok(typeof Rail === "function", "IntentPartnerPick compiles and exports a component");

// Inventory in the shape /api/viator/tours actually returns, merged. `image` is
// the field the rail filters on — the exact field the empty-rail bug turned on.
const INVENTORY = [
  { code: "5560271P1", title: "Manatee watching with guaranteed sighting", image: "https://media.viator.com/a.jpg", rating: 5, reviews: 120, fromPrice: 16 },
  { code: "292464P2", title: "Clear Kayak LED Night Glass Bottom Tour", image: "https://media.viator.com/b.jpg", rating: 4.7, reviews: 340, fromPrice: 59 },
];

const render = (props) => renderToStaticMarkup(createElement(Rail, props));

// ── 1. the rail renders cards when inventory carries images ───────────────
for (const [city, intent] of [["Orlando", "best-of"], ["Sarasota", "date-night"], ["Tampa", "family"]]) {
  const html = render({ city, intent, inventory: INVENTORY, lat: 28.5, lng: -81.4 });
  ok(html.includes("data-intent-partner-rail"), `${city}/${intent}: the rail element renders`);
  ok(/data-offer-id="/.test(html), `${city}/${intent}: at least one offer card renders`);
  ok(html.includes("/api/commerce/go?"), `${city}/${intent}: cards link through our redirect, never a partner URL`);
  ok(/Wayfind may earn a commission|commission/i.test(html), `${city}/${intent}: the commission disclosure renders with the earning links`);
}

// ── 2. THE BUG: images missing means nothing renders ──────────────────────
// This is the negative control AND the regression. If this ever renders cards,
// the filter that protects us from imageless junk has gone.
const noImages = INVENTORY.map(({ image, ...rest }) => rest);
const emptyHtml = render({ city: "Orlando", intent: "best-of", inventory: noImages, lat: 28.5, lng: -81.4 });
ok(!emptyHtml.includes("data-offer-id="), "negative control: inventory with no images renders NO cards (this is the exact state the guide pages were in)");

// ── 3. every declared placement resolves to picks the rail can show ───────
// Static-only: proves the intent each new call site passes is one the registry
// actually answers, so a placement cannot point at an intent with no inventory.
for (const cat of Object.keys(LANDING_RAIL_INTENT)) {
  const intent = landingRailIntent(cat);
  const row = LANDING_RAIL_INTENT[cat];
  ok(typeof row.why === "string" && row.why.length > 40, `landing "${cat}" states WHY it sells under this intent`);
  if (intent === null) continue;
  const picks = resolvedIntentPartnerPicks("Orlando", intent, INVENTORY, 12);
  ok(picks.length > 0, `landing "${cat}" -> intent "${intent}" resolves to at least one pick`);
}
for (const kind of Object.keys(GUIDE_RAIL_INTENT)) {
  const intent = guideRailIntent(kind);
  const row = GUIDE_RAIL_INTENT[kind];
  ok(typeof row.why === "string" && row.why.length > 40, `guide kind "${kind}" states WHY it sells under this intent`);
  if (intent === null) continue;
  const picks = resolvedIntentPartnerPicks("Orlando", intent, INVENTORY, 12);
  ok(picks.length > 0, `guide kind "${kind}" -> intent "${intent}" resolves to at least one pick`);
}

// ── 4. the deliberate nulls stay null ─────────────────────────────────────
ok(landingRailIntent("nightlife") === null, "nightlife sells nothing — no partner program carries bar inventory");
ok(guideRailIntent("hotel") === null, "hotel guides sell nothing here — they already monetize through Stay22 on their own links");
ok(landingRailIntent("not-a-category") === null, "an unknown category sells nothing rather than defaulting to something");

console.log(`test-partner-rail-render: OK — ${pass} assertions (the rail RENDERED across 3 city/intent shapes with real inventory, produced redirect-backed cards with a disclosure, and rendered nothing when images are absent — the state that made 18 of 18 guides blank)`);
