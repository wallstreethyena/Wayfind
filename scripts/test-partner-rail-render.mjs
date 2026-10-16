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
import React, { createElement } from "react";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { landingRailIntent, LANDING_RAIL_INTENT } from "../lib/railPlacement.js";
import { guideRailIntent, GUIDE_RAIL_INTENT } from "../lib/railPlacement.js";
import { INTENT_PARTNER_PICKS, INTENT_PARTNER_RAILS, PARTNER_INVENTORY_CANDIDATE_COUNT, resolvedIntentPartnerPicks } from "../lib/intentPartnerPicks.js";

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
  { code: "FOOD1P1", title: "Downtown Walking Food Tour", image: "https://media.viator.com/food.jpg", rating: 4.9, reviews: 180, fromPrice: 79 },
];

const render = (props) => renderToStaticMarkup(createElement(Rail, props));

// ── 1. the rail renders cards when inventory carries images ───────────────
for (const [city, intent] of [["Orlando", "best-of"], ["Sarasota", "date-night"], ["Tampa", "family"]]) {
  const html = render({ city, intent, inventory: INVENTORY, lat: 28.5, lng: -81.4 });
  ok(html.includes("data-intent-partner-rail"), `${city}/${intent}: the rail element renders`);
  ok(/data-offer-id="/.test(html), `${city}/${intent}: at least one offer card renders`);
  ok(html.includes("/api/commerce/go?"), `${city}/${intent}: cards link through our redirect, never a partner URL`);
  ok(!/commission/i.test(html), `${city}/${intent}: the rail renders no inline commission disclosure (one footer disclosure plus one on true detail pages is the law now)`);
}

// ── 2. THE BUG: images missing means nothing renders ──────────────────────
// This is the negative control AND the regression. If this ever renders cards,
// the filter that protects us from imageless junk has gone.
//
// Orlando/best-of is deliberately NOT the probe here (Lane C, 2026-09-15): it
// now carries a curated rail card (orlando-pass-gocity-explorer) with its own
// verified, baked-in `image` that does not come from the `inventory` prop at
// all, so it renders correctly REGARDLESS of what `inventory` supplies —
// that is the point of a curated artPick, not a bug.
//
// Orlando/hidden-gems is ALSO no longer the probe (Lane E, 2026-09-16): it now
// carries its own curated rail card (orlando-tour-echoes-of-history, the newly
// lit WeGoTrip tour) with its own baked-in image, same shape as best-of above.
// Tampa/hidden-gems has exactly one plain, imageless curated pick and no rail
// (verified by call, not assumed — see the positive control below), so it is
// the probe now: "no inventory art in, no card out".
const noImages = INVENTORY.map(({ image, ...rest }) => rest);
ok(!INTENT_PARTNER_PICKS.tampa?.["hidden-gems"]?.image && !(INTENT_PARTNER_RAILS.tampa?.["hidden-gems"]?.length),
  "positive control: Tampa/hidden-gems has no baked-in image on its featured pick and no rail, so the negative control below is a real test of the inventory-image filter, not an artPick short-circuit");
const emptyHtml = render({ city: "Tampa", intent: "hidden-gems", inventory: noImages, lat: 28.5, lng: -81.4 });
ok(!emptyHtml.includes("data-offer-id="), "negative control: inventory with no images renders NO cards (this is the exact state the guide pages were in)");

// Joined Awin programmes must be visible through the existing real rail even
// before any live API enrichment; images are the merchant's own product art.
for (const [city, intent, offerId, provider, lat, lng] of [
  ["Orlando", "family", "orlando-ifly-adrenaline", "awin_adrenaline", 28.43, -81.47],
  ["Miami", "hidden-gems", "miami-art-tour-gowithguide", "awin_gowithguide", 25.76, -80.19],
  ["Tampa", "date-night", "tampa-events-gigsberg", "awin_gigsberg", 27.95, -82.46],
  ["Orlando", "date-night", "orlando-theater-ticketsmarter", "ticketsmarter", 28.54, -81.38],
]) {
  const html = render({ city, intent, inventory: [], lat, lng });
  ok(html.includes(`data-offer-id="${offerId}"`), `${city}/${intent}: the verified new Awin card actually renders without API inventory`);
  ok(html.includes(`provider=${provider}`) && html.includes(`offer=${offerId}`), `${offerId}: rendered card uses its internal tracked earning route`);
  const otherCity = city === "Miami" ? "Orlando" : "Miami";
  const elsewhere = render({ city: otherCity, intent, inventory: [], lat: 25.76, lng: -80.19 });
  ok(!elsewhere.includes(`data-offer-id="${offerId}"`), `${offerId}: another city cannot display the offer`);
  ok(!html.includes('provider=awin_extranomical'), `${city}: California-only Extranomical is not placed in Florida`);
}

for (const [city, intent, offerId] of [
  ["Miami, Oklahoma", "hidden-gems", "miami-art-tour-gowithguide"],
  ["Orlando, West Virginia", "family", "orlando-ifly-adrenaline"],
  ["Tampa, Kansas", "date-night", "tampa-events-gigsberg"],
  ["Orlando, CA", "date-night", "orlando-theater-ticketsmarter"],
]) {
  const html = render({ city, intent, inventory: [], lat: 0, lng: 0 });
  ok(!html.includes(`data-offer-id="${offerId}"`), `${city}: same-name city in another state cannot display the Florida partner`);
}

// Restaurant pages have their own food-only intent. The same unfiltered cache
// payload may carry kayaks for valid activity surfaces; those rows must not be
// relabelled as a date and shown above a restaurant ranking.
const restaurantHtml = render({ city: "Parrish", intent: landingRailIntent("restaurants"), inventory: INVENTORY, lat: 27.58, lng: -82.43 });
ok(landingRailIntent("restaurants") === "food" && guideRailIntent("restaurant") === "food",
  "restaurant landings and guides declare the narrow food intent rather than sharing date-night");
ok(restaurantHtml.includes('data-offer-id="FOOD1P1"') && !restaurantHtml.includes('data-offer-id="292464P2"') && !restaurantHtml.includes('data-offer-id="5560271P1"'),
  "rendered restaurant rail keeps the food tour and rejects kayak/manatee activity inventory");
ok(restaurantHtml.includes("A local food experience worth booking") && !restaurantHtml.includes("A local date worth booking"),
  "rendered restaurant rail describes food honestly instead of labelling arbitrary inventory as a date");

// ── 3. every declared placement resolves to picks the rail can show ───────
// Static-only: proves the intent each new call site passes is one the registry
// actually answers, so a placement cannot point at an intent with no inventory.
for (const cat of Object.keys(LANDING_RAIL_INTENT)) {
  const intent = landingRailIntent(cat);
  const row = LANDING_RAIL_INTENT[cat];
  ok(typeof row.why === "string" && row.why.length > 40, `landing "${cat}" states WHY it sells under this intent`);
  if (intent === null) continue;
  const picks = resolvedIntentPartnerPicks("Orlando", intent, INVENTORY, PARTNER_INVENTORY_CANDIDATE_COUNT);
  ok(picks.length > 0, `landing "${cat}" -> intent "${intent}" resolves to at least one pick`);
}
for (const kind of Object.keys(GUIDE_RAIL_INTENT)) {
  const intent = guideRailIntent(kind);
  const row = GUIDE_RAIL_INTENT[kind];
  ok(typeof row.why === "string" && row.why.length > 40, `guide kind "${kind}" states WHY it sells under this intent`);
  if (intent === null) continue;
  const picks = resolvedIntentPartnerPicks("Orlando", intent, INVENTORY, PARTNER_INVENTORY_CANDIDATE_COUNT);
  ok(picks.length > 0, `guide kind "${kind}" -> intent "${intent}" resolves to at least one pick`);
}

// ── 4. the deliberate nulls stay null ─────────────────────────────────────
ok(landingRailIntent("nightlife") === null, "nightlife sells nothing — no partner program carries bar inventory");
ok(guideRailIntent("hotel") === null, "hotel guides sell nothing here — they already monetize through Stay22 on their own links");
ok(landingRailIntent("not-a-category") === null, "an unknown category sells nothing rather than defaulting to something");

// Exercise the real route clients and their shared drop components. Rendering
// IntentPartnerPick alone cannot prove that a customer can reach a new offer.
// This hook host runs the actual effects, callbacks and state transitions; only
// Next's routing hook and network responses are adapted for offline Node.
function hookHost() {
  const slots = [], pending = [];
  let cursor = 0;
  const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const dispatcher = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useMemo(make, deps) { const i = cursor++; if (!(i in slots) || !same(slots[i].deps, deps)) slots[i] = { deps, value: make() }; return slots[i].value; },
    useCallback(fn, deps) { return dispatcher.useMemo(() => fn, deps); },
    useContext(context) { cursor++; return context._currentValue; },
    useEffect(effect, deps) { const i = cursor++; if (!(i in slots) || !same(slots[i].deps, deps)) pending.push([i, effect, deps]); },
  };
  const internals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  return {
    render(fn, props) {
      cursor = 0;
      const previous = internals.ReactCurrentDispatcher.current;
      internals.ReactCurrentDispatcher.current = dispatcher;
      try { return fn(props); } finally { internals.ReactCurrentDispatcher.current = previous; }
    },
    flush() { for (const [i, effect, deps] of pending.splice(0)) { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; } },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}
function visit(root, predicate) {
  if (Array.isArray(root)) return root.map((child) => visit(child, predicate)).find(Boolean) || null;
  if (!React.isValidElement(root)) return null;
  return predicate(root) ? root : visit(root.props.children, predicate);
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const routerStub = path.join(REPO, `.partner-route-${process.pid}.mjs`);
writeFileSync(routerStub, 'export const useSearchParams = () => new URLSearchParams(globalThis.__partnerRouteQuery || "");\nexport const useRouter = () => ({ back() {} });\nexport const usePathname = () => "/family";\n');
const routerAdapter = { onGraph(graph) {
  let count = 0;
  for (const output of graph.values()) {
    const source = readFileSync(output, "utf8");
    if (source.includes('from "next/navigation"')) { writeFileSync(output, source.replaceAll('from "next/navigation"', `from ${JSON.stringify(routerStub)}`)); count++; }
  }
  ok(count > 0, "the actual route graph used the offline Next hook adapter");
} };
const originalFetch = globalThis.fetch;
const requests = [];
let responseMode = "empty", mockWeather = { temp: 75, rain: 0, wet: false, label: "Clear" };
globalThis.fetch = async (url) => {
  const requested = String(url);
  requests.push(requested);
  if (requested.startsWith("/api/weather?")) return Response.json(mockWeather);
  if (requested.startsWith("/api/date-night?")) return Response.json(responseMode === "failed" ? { error: "fixture inventory failure" } : { rails: [] });
  if (requested.startsWith("/api/events?")) return Response.json({ events: [] });
  throw new Error(`Unexpected outbound request in curated route fixture: ${requested}`);
};
try {
  const dateClient = await loadComponent(path.join(REPO, "app/date-night/client.js"), REPO, routerAdapter);
  const familyClient = await loadComponent(path.join(REPO, "app/family/client.js"), REPO, routerAdapter);
  const dateEntry = (query) => {
    globalThis.__partnerRouteQuery = query;
    const pageNode = dateClient.default();
    const pageHost = hookHost();
    const tree = pageHost.render(pageNode.type, pageNode.props);
    const rails = visit(tree, (node) => node.type?.name === "DateNightRails");
    ok(!!rails, "the actual date-night route client reaches its shared DateNightRails");
    return rails;
  };
  const orlandoQuery = "city=Orlando%2C+FL&lat=28.5384&lng=-81.3789";
  const tampaQuery = "city=Tampa%2C+Florida&lat=27.9506&lng=-82.4572";
  for (const [query, offerId] of [[orlandoQuery, "orlando-theater-ticketsmarter"], [tampaQuery, "tampa-events-gigsberg"]]) {
    const rails = dateEntry(query), host = hookHost();
    let tree = host.render(rails.type, rails.props);
    let html = renderToStaticMarkup(tree);
    ok(html.includes(`data-offer-id="${offerId}"`) && html.includes('aria-busy="true"'), `${offerId}: actual page offers are visible while organic inventory is still loading`);
    const earning = visit(tree, (node) => node.type?.name === "IntentPartnerPick");
    ok(earning?.props.curatedOnly === true && earning.props.photoNoSpend === true, `${offerId}: actual mount explicitly requests curated products without paid enrichment`);
    // The same component owns the homepage drop; it must remain optional.
    ok(renderToStaticMarkup(createElement(rails.type, { ...rails.props, active: false })) === "", `${offerId}: inactive homepage drop renders nothing`);
    const dropProps = { active: true, center: rails.props.center, city: rails.props.city };
    ok(renderToStaticMarkup(createElement(rails.type, dropProps)).includes(`data-offer-id="${offerId}"`), `${offerId}: active homepage drop needs no standalone-only partnerCity prop`);
    ok(!renderToStaticMarkup(createElement(rails.type, { ...dropProps, center: null })).includes("data-intent-partner-rail"), `${offerId}: homepage drop requires a location`);
    host.unmount();
    for (const mode of ["empty", "failed"]) {
      responseMode = mode;
      const settled = hookHost();
      settled.render(rails.type, { ...rails.props, eventsSlot: () => ({ pending: false, failed: false, byRail: {} }) });
      settled.flush(); await tick(); await tick();
      tree = settled.render(rails.type, { ...rails.props, eventsSlot: () => ({ pending: false, failed: false, byRail: {} }) });
      html = renderToStaticMarkup(tree);
      ok(html.includes(`data-offer-id="${offerId}"`), `${offerId}: curated offers remain reachable when organic inventory is ${mode}`);
      ok(html.includes(mode === "failed" ? "We could not build" : "Nothing near you clears"), `${offerId}: ${mode} inventory keeps its truthful existing explanation`);
      settled.unmount();
    }
  }
  for (const query of [
    "", "city=Orlando%2C+WV", "city=Tampa%2C+Kansas&lat=27.9506&lng=-82.4572",
    "city=Orlando%2C+FL&lat=25.7617&lng=-80.1918", "city=Tampa%2C+FL&lat=28.5384&lng=-81.3789",
    "city=Orlando%2C+FL&lat=29.65&lng=-82.33",
  ]) {
    const rails = dateEntry(query);
    const html = renderToStaticMarkup(createElement(rails.type, rails.props));
    ok(!html.includes("data-intent-partner-rail"), `actual date-night route rejects missing, foreign or contradictory location: ${query}`);
  }
  {
    globalThis.__partnerRouteQuery = orlandoQuery;
    const pageNode = dateClient.default(), pageHost = hookHost();
    pageHost.render(pageNode.type, pageNode.props);
    globalThis.__partnerRouteQuery = "city=Orlando&lat=25.7617&lng=-80.1918";
    const tree = pageHost.render(pageNode.type, pageNode.props);
    const rails = visit(tree, (node) => node.type?.name === "DateNightRails");
    ok(!renderToStaticMarkup(rails).includes("data-intent-partner-rail"), "actual date-night URL transition cannot monetize the previous coordinates before location effects settle");
    pageHost.unmount();
  }
  const familyNode = familyClient.default();
  const familyCase = async ({ query = orlandoQuery, props = familyNode.props, weather = mockWeather } = {}) => {
    globalThis.__partnerRouteQuery = query; mockWeather = weather;
    const host = hookHost();
    let tree = host.render(familyNode.type, props);
    const before = renderToStaticMarkup(tree);
    host.flush(); await tick(); await tick();
    tree = host.render(familyNode.type, props); host.flush();
    tree = host.render(familyNode.type, props);
    return { host, tree, before, html: renderToStaticMarkup(tree), render: () => { tree = host.render(familyNode.type, props); return renderToStaticMarkup(tree); } };
  };
  for (const props of [{}, { embedded: true, center: { lat: 28.5384, lng: -81.3789 }, city: "Orlando, FL" }]) {
    const result = await familyCase({ props });
    ok(!result.before.includes('data-offer-id="orlando-ifly-adrenaline"'), "actual Family page waits for weather context readiness");
    ok(result.html.includes('data-offer-id="orlando-ifly-adrenaline"'), `actual ${props.embedded ? "embedded" : "standalone route"} Family page displays the local indoor offer`);
    ok(result.html.includes("provider=awin_adrenaline") && result.html.includes("offer=orlando-ifly-adrenaline"), "actual family card uses the owned earning redirect");
    result.host.unmount();
  }
  for (const query of ["", "city=Orlando%2C+West+Virginia", "city=Orlando%2C+WV&lat=28.5384&lng=-81.3789", "city=Orlando%2C+FL&lat=25.7617&lng=-80.1918", "city=Tampa&lat=27.9506&lng=-82.4572", "city=Orlando&lat=28.70&lng=-81.38&radiusMi=10"]) {
    const result = await familyCase({ query });
    ok(!result.html.includes('data-offer-id="orlando-ifly-adrenaline"'), `actual family route respects identity and selected radius: ${query}`);
    result.host.unmount();
  }
  const distance = await familyCase({ query: "city=Orlando&lat=28.70&lng=-81.38&radiusMi=25" });
  ok(distance.html.includes('data-offer-id="orlando-ifly-adrenaline"'), "same actual origin can display iFLY when the selected radius includes its published point");
  distance.host.unmount();
  const changedLocation = await familyCase();
  globalThis.__partnerRouteQuery = "city=Orlando&lat=25.7617&lng=-80.1918";
  ok(!changedLocation.render().includes('data-offer-id="orlando-ifly-adrenaline"'), "actual Family URL transition cannot monetize the previous origin before its location effect settles");
  changedLocation.host.unmount();
  for (const [key, value] of [["ages", "baby"], ["weather", "outdoor"], ["weather", "indoor"], ["cost", "free"], ["unknown", "unverified"]]) {
    const result = await familyCase();
    const filters = visit(result.tree, (node) => node.type?.name === "FamilyFilters");
    ok(!!filters, "actual Family page exposes its existing filter controls");
    filters.props.onChange(key, value);
    ok(!result.render().includes('data-offer-id="orlando-ifly-adrenaline"'), `actual ${key}=${value} filter hides a product with no reviewed matching filter facts`);
    filters.props.onChange("", "");
    ok(result.render().includes('data-offer-id="orlando-ifly-adrenaline"'), "clearing actual filters restores the verified unfiltered product");
    result.host.unmount();
  }
  const storm = await familyCase({ weather: { temp: 75, rain: 100, wet: true, label: "Thunderstorm" } });
  ok(storm.html.includes("Outdoor picks are paused") && storm.html.includes('data-offer-id="orlando-ifly-adrenaline"'), "indoor-only weather gate may retain the verified indoor iFLY product");
  visit(storm.tree, (node) => node.type?.name === "FamilyFilters").props.onChange("weather", "outdoor");
  ok(!storm.render().includes('data-offer-id="orlando-ifly-adrenaline"'), "a paused outdoor request cannot display an indoor product as a matching result");
  storm.host.unmount();
  // Run shared rail effects with poison live inventory and coupon props. Both
  // initial data and stale hydrated data must stay out of a curated-only rail.
  const railHost = hookHost(), beforeRequests = requests.length;
  const curatedProps = { city: "Orlando", intent: "family", lat: 28.5384, lng: -81.3789, inventory: INVENTORY, initialInventory: INVENTORY, couponIntent: "family", curatedOnly: true, curatedOfferIds: ["orlando-ifly-adrenaline"], photoNoSpend: true };
  let curatedTree = railHost.render(Rail, curatedProps);
  railHost.flush(); await tick();
  curatedTree = railHost.render(Rail, curatedProps);
  const curatedHtml = renderToStaticMarkup(curatedTree);
  ok(curatedHtml.includes('data-offer-id="orlando-ifly-adrenaline"') && (curatedHtml.match(/data-offer-id=/g) || []).length === 1, "curated-only allowlist renders only the exact reviewed product, never supplied inventory or coupons");
  ok(requests.length === beforeRequests, "actual curated-only effects issue zero inventory, deals, photo or provider fetches");
  ok(!requests.some((url) => /viator|\/api\/deals|\/api\/photo|https?:/i.test(url)), "actual route/state effects made no paid, self-supply or external request");
  railHost.unmount();
  const emptyHost = hookHost();
  emptyHost.render(Rail, { ...curatedProps, inventory: [], initialInventory: [] });
  emptyHost.flush(); await tick();
  ok(requests.length === beforeRequests, "curated-only effects also issue zero self-supply requests when both inventories are empty");
  emptyHost.unmount();
} finally {
  globalThis.fetch = originalFetch;
  delete globalThis.__partnerRouteQuery;
  unlinkSync(routerStub);
}

console.log(`test-partner-rail-render: OK — ${pass} assertions; actual /date-night and /family client graphs, shared embedded components, loading/failure, coordinates/state, family filters/radius/weather and zero curated enrichment requests`);
