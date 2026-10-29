#!/usr/bin/env node
/**
 * test-coupon-location-state.mjs — renders the REAL CouponsScreen (via jsxLoad)
 * and locks the no-location behaviour of the Coupons screen.
 *
 * Root cause this protects: `center` is null on first paint and stays null for
 * visitors who deny location, and dealTiers() (correctly) fails closed for city
 * deals, so those visitors saw "0 deals" with no way to answer the proximity
 * question. The geo-gate stays exactly as strict; the screen now gives the
 * visitor a way to answer it (area picker, "Use my location") and says which of
 * the honest states they are in. Pure rendering: renderToStaticMarkup, no browser.
 */
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { COUPONS } from "../lib/coupons.js";
import { dealTiers, dealScope, coveredMetros, auditHiddenOffers, areaStateFor, AREA_PATIENCE_MS } from "../lib/dealSheet.js";
import { METROS } from "../lib/orderInFeatured.js";
import { siteTodayStr } from "../lib/siteTime.js";

let n = 0; const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };

const REPO = fileURLToPath(new URL("..", import.meta.url));
const Coupons = (await loadComponent(fileURLToPath(new URL("../app/components/screens/Coupons.js", import.meta.url)), REPO)).default;

const today = siteTodayStr();
const NATIONAL = { id: "cpn-loc-national", business: "Fixture National Co", area: "United States", title: "Nationwide fixture offer", details: "d", code: null, url: "https://example.com", expires: null, intents: [], match: [] };
const TAMPA_ONLY = { id: "cpn-loc-tampa", business: "Fixture Tampa Grill", area: "Tampa", title: "Tampa only fixture offer", details: "d", code: null, url: "https://example.com", expires: null, intents: [], match: [] };
const SARASOTA_ONLY = { id: "cpn-loc-sarasota", business: "Fixture Sarasota Cafe", area: "Sarasota", title: "Sarasota only fixture offer", details: "d", code: null, url: "https://example.com", expires: null, intents: [], match: [] };
const OFFERS = [NATIONAL, TAMPA_ONLY, SARASOTA_ONLY];

const noop = () => {};
const render = (over = {}) => renderToStaticMarkup(createElement(Coupons, { ctx: {
  cpnOffers: OFFERS, cpnOffersStatus: "ready", center: null, locResolved: true,
  savedCoupons: {}, walletOpen: false, setWalletOpen: noop, couponHandoff: null, user: null, setAuthOpen: noop,
  toggleSaveCoupon: noop, copyCouponCode: noop, shareCoupon: noop, logEvent: noop, openExternal: noop,
  pickCouponCenter: noop, recenterToMe: noop, ...over,
} }));

const TAMPA = { lat: 27.9506, lng: -82.4572 };
const OUTSIDE = { lat: 40.7128, lng: -74.006 }; // New York, >75mi from every covered metro

// Non-vacuity: the fixtures are real scopes, and the registry has a deal for another metro.
ok(dealScope(NATIONAL).kind === "everywhere" && dealScope(TAMPA_ONLY).metro === "tampa" && dealScope(SARASOTA_ONLY).metro === "sarasota", "fixtures resolve to everywhere / tampa / sarasota");
ok(dealTiers([NATIONAL, TAMPA_ONLY], today, TAMPA).ledger.some((c) => c.id === TAMPA_ONLY.id), "positive control: the Tampa fixture is renderable to a Tampa viewer");

// 1. center unknown (location resolved to nothing)
{
  const h = render({ center: null, locResolved: true });
  ok(/data-area-state="unknown"/.test(h), "unknown: the area picker block renders");
  ok(coveredMetros().every((m) => h.includes('aria-label="Show deals in ' + m.label + '"')), "unknown: one picker button per covered metro (list derived from the METROS registry)");
  ok(/Use my location/.test(h), "unknown: 'Use my location' is offered");
  ok(h.includes(NATIONAL.title), "unknown: an everywhere deal still renders");
  // Owner decision 2026-10-29: unknown location -> the statewide view, every city
  // card under its own area heading (scripts/test-coupon-no-location.mjs locks the
  // grouping). The proximity sheet itself is unchanged: dealTiers() with no center
  // still returns nationwide only.
  ok(/data-coupon-mode="statewide"/.test(h) && /across Florida, by area/.test(h), "unknown: statewide mode, header says 'across Florida, by area'");
  ok([...dealTiers(OFFERS, today, null).featured, ...dealTiers(OFFERS, today, null).ledger].every((c) => dealScope(c).kind === "everywhere"), "unknown: dealTiers proximity gate unchanged (no center -> nationwide only)");
  ok(!/near you/.test(h), "unknown: no 'near you' claim anywhere on the screen");
  ok(!/ in (Tampa|Sarasota|Orlando)</.test(h.split("Choose your area")[0]), "unknown: header names no metro as the viewer's");
}

// 2. unknown AND nothing to show: the explanation, not a dead end
{
  const h = render({ center: null, locResolved: true, cpnOffers: [] });
  const onlyRegistryNational = dealTiers(COUPONS, today, null);
  if ([...onlyRegistryNational.featured, ...onlyRegistryNational.ledger].length === 0) {
    ok(/data-deals-state="needs-area"/.test(h) && /Choose an area to see deals/.test(h), "unknown + empty: needs-area copy with the picker");
  } else {
    ok(/data-area-state="unknown"/.test(h), "unknown + registry national deals: picker still present");
  }
}

// 3. loading: location still resolving, and offers still being fetched
{
  const none = { cpnOffers: [] };
  const regNone = [...dealTiers(COUPONS, today, null).featured, ...dealTiers(COUPONS, today, null).ledger].length === 0;
  if (regNone) {
    const loc = render({ ...none, center: null, locResolved: false });
    ok(/data-deals-state="locating"/.test(loc) && /Finding your area/.test(loc), "loading: location unresolved shows 'Finding your area', not 'no deals'");
    ok(!/data-area-state/.test(loc), "loading: the picker does not nag while location is still resolving");
    const off = render({ ...none, center: OUTSIDE, cpnOffersStatus: "loading" });
    ok(/data-deals-state="offers-loading"/.test(off) && /Loading deals/.test(off), "loading: offers fetch in flight shows 'Loading deals'");
  }
}

// 4. center inside a covered metro
{
  const h = render({ center: TAMPA, locResolved: true });
  ok(h.includes(TAMPA_ONLY.title), "tampa: a Tampa deal renders");
  ok(!h.includes(SARASOTA_ONLY.title), "tampa: a Sarasota deal does NOT render");
  ok(h.includes(NATIONAL.title), "tampa: an everywhere deal renders");
  ok(/verified (offer|offers) in Tampa/.test(h), "tampa: header count names the metro ('... in Tampa')");
  ok(!/near you/.test(h), "tampa: no 'near you'");
  ok(/Showing deals for Tampa/.test(h) && />Change</.test(h), "tampa: 'Showing deals for Tampa' plus a Change affordance");
  ok(!/data-area-state="unknown"/.test(h) && !/data-area-state="outside"/.test(h), "tampa: the big picker is not shown when the area is known");
  ok(/Partner savings in Tampa/.test(h) && /Free &amp; local in Tampa/.test(h), "tampa: BOTH tier heads carry the metro name (both tiers render here, so neither check is vacuous)");
}

// 5. metro known, nothing there (pick a covered metro the registry has no deal for)
{
  // "Empty" means no deal scoped to THIS metro. Nationwide cards (the Undercover
  // Tourist rows) may still render there, and that is correct.
  const emptyMetro = coveredMetros().find((m) => { const t = dealTiers(COUPONS, today, { lat: m.lat, lng: m.lng }); return [...t.featured, ...t.ledger].every((c) => dealScope(c).kind === "everywhere"); });
  if (emptyMetro) {
    const h = render({ center: { lat: emptyMetro.lat, lng: emptyMetro.lng }, cpnOffers: [], locResolved: true });
    const t = dealTiers(COUPONS, today, { lat: emptyMetro.lat, lng: emptyMetro.lng });
    if (t.featured.length + t.ledger.length === 0) {
      ok(/data-deals-state="metro-empty"/.test(h) && h.includes("No verified deals in " + emptyMetro.label + " right now") && /good anywhere/.test(h), "metro empty: names the metro and says national offers still show when they exist");
    } else {
      ok(!/data-deals-state=/.test(h) && t.featured.concat(t.ledger).every((c) => h.includes(c.business)), "metro with only nationwide deals: those render, no empty state");
    }
    ok(!/data-coupon-mode="statewide"/.test(h) && !/data-deal-area="(tampa|sarasota|orlando|stpete)"/.test(h), "metro empty: never falls back to other areas' cards");
    ok(!/data-area-state="unknown"/.test(h) && /Showing deals for/.test(h), "metro empty: it is not mistaken for 'location unknown'");
  }
  ok(!!emptyMetro, "a covered metro with zero metro-scoped registry deals exists (Miami today), so the metro-empty path is exercised, not skipped");
}

// 6. center outside every metro
{
  const h = render({ center: OUTSIDE, locResolved: true });
  ok(/data-area-state="outside"/.test(h) && /Pick an area to see local deals/.test(h), "outside: picker with outside-coverage copy");
  ok(/data-coupon-mode="statewide"/.test(h) && /data-deal-area="tampa"/.test(h), "outside: statewide view, city deals sit under their own area heading");
  ok(h.includes(NATIONAL.title), "outside: an everywhere deal renders");
}

// 7. partner note only when actually the case
{
  ok(!/temporarily unavailable/.test(render({ center: TAMPA })), "no partner note when nothing is wrong");
  ok(/data-deals-note="partner-unavailable"/.test(render({ center: TAMPA, cpnOffersStatus: "failed" })), "partner note shows when the offers fetch failed");
  const lapsed = { id: "cpn-loc-lapsed", business: "Clipp", area: "Tampa", title: "lapsed", url: "https://example.com", expires: "2020-01-01" };
  ok(auditHiddenOffers([lapsed], today, "tampa").length === 0, "an ordinary expired deal (not an audit fuse date) is NOT reported as hidden by a fuse");
  const fuseDate = COUPONS.find((c) => /^cpn-clipp/.test(c.id)).expires;
  const fused = { ...lapsed, id: "cpn-loc-fused", expires: fuseDate };
  const after = new Date(Date.parse(fuseDate + "T12:00:00Z") + 3 * 864e5).toISOString().slice(0, 10);
  ok(auditHiddenOffers([fused], after, "tampa").length === 1 && auditHiddenOffers([fused], after, "orlando").length === 0 && auditHiddenOffers([fused], after, null).length === 0, "a lapsed Clipp fuse offer is hidden-by-fuse only for its own metro, never when the metro is unknown");
}

// 8. wiring: the picker goes through the single home.js center path
{
  const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
  const fn = home.match(/function pickCouponCenter\([\s\S]*?\n  \}\n/);
  ok(fn && /manualRef\.current = true/.test(fn[0]) && /setCenter\(/.test(fn[0]) && /setLocName\(/.test(fn[0]) && /setLocResolved\(true\)/.test(fn[0]), "pickCouponCenter sets center + label + resolved through the manual-pin path (persisted by the wf_center writer, which stamps ts)");
  ok(/pickCouponCenter, recenterToMe/.test(home), "ctx hands pickCouponCenter and recenterToMe to the Coupons screen");
  ok(Object.keys(METROS).length === coveredMetros().length, "picker metro list is the nearestMetro registry, not a second list");
}

// Patience gate (pure): an unresolved location becomes "unknown" once the screen has
// waited AREA_PATIENCE_MS, so a visitor who denied location while the IP lookup failed
// still gets the picker. Known/outside/resolved states are never affected by waiting.
ok(areaStateFor({ metroKey: null, centerKnown: false, locResolved: false, waitedMs: 0 }) === "loading", "patience: fresh mount with no center is loading");
ok(areaStateFor({ metroKey: null, centerKnown: false, locResolved: false, waitedMs: AREA_PATIENCE_MS - 1 }) === "loading", "patience: still loading just under the window");
ok(areaStateFor({ metroKey: null, centerKnown: false, locResolved: false, waitedMs: AREA_PATIENCE_MS }) === "unknown", "patience: unresolved location becomes unknown at the window so the picker appears");
ok(areaStateFor({ metroKey: null, centerKnown: false, locResolved: true, waitedMs: 0 }) === "unknown", "patience: a resolved-to-nothing location is unknown immediately");
ok(areaStateFor({ metroKey: "tampa", centerKnown: true, locResolved: true, waitedMs: 0 }) === "known" && areaStateFor({ metroKey: null, centerKnown: true, locResolved: true, waitedMs: 0 }) === "outside", "patience: known and outside never depend on waiting");
ok(AREA_PATIENCE_MS >= 3000 && AREA_PATIENCE_MS <= 15000, "patience window is a few seconds, not instant and not forever");
{
  const src = readFileSync(new URL("../app/components/screens/Coupons.js", import.meta.url), "utf8");
  ok(/const areaState = areaStateFor\(\{/.test(src) && /setTimeout\(\(\) => setWaitedMs\(AREA_PATIENCE_MS\), AREA_PATIENCE_MS\)/.test(src), "Coupons.js derives areaState through areaStateFor and arms the patience timer");
}

if (fails.length) { for (const f of fails) console.error("FAIL:", f); console.error(`test-coupon-location-state: FAIL (${fails.length}/${n})`); process.exit(1); }
console.log(`test-coupon-location-state: OK, ${n} assertions (renders CouponsScreen for null / Tampa / outside-coverage centers)`);
