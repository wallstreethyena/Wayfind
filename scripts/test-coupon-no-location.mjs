#!/usr/bin/env node
// scripts/test-coupon-no-location.mjs — the Coupons tab with no usable location.
//
// OWNER DECISION 2026-10-29 (built on #1984's area picker + honest states): a
// visitor whose location is unknown, or outside every covered metro, sees the
// live Florida deals grouped under area headings ("Tampa", "Orlando", ...), never
// labelled "near you", STATEWIDE_PER_AREA per area plus "See all", with the area
// picker at the top. A known area is unchanged (dealTiers() proximity sheet); a
// known area with nothing live stays honest and never borrows another area's
// cards; expired deals never render.
//
// Locks, by CALLING the shipped code:
//   A. dealsByArea() on fixtures: grouping, ordering, expired/unplaced dropped,
//      never mints a row.
//   B. the real registry at a fixed date, and that dealTiers() with no center is
//      still nationwide-only (the proximity gate is not loosened).
//   C. renderToStaticMarkup of the real CouponsScreen for unknown / outside /
//      known / known-empty / loading.
//   D. jsdom mount: statewide cards emit commerce_impression with surface
//      "coupons" (once per partner card) and card_impression once per card.
import path from "node:path";
import { createRequire } from "node:module";
// React act() is a development-only testing API. Set the test environment
// before importing React or the JSX loader; Vercel invokes prebuild with
// NODE_ENV=production. Every SSR/mount/impression assertion still executes.
process.env.NODE_ENV = "development";
const { default: React } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { loadComponent } = await import("./lib/jsxLoad.mjs");

const REPO = process.cwd();
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const D = await import(path.resolve("lib/dealSheet.js"));
const { COUPONS } = await import(path.resolve("lib/coupons.js"));
const { METROS } = await import(path.resolve("lib/orderInFeatured.js"));
const TODAY = "2026-10-29";
const ORLANDO = { lat: 28.5384, lng: -81.3789 };
const MIAMI = { lat: 25.7617, lng: -80.1918 };
const COLUMBUS_OH = { lat: 39.9612, lng: -82.9988 };

/* ── A. dealsByArea on fixtures ───────────────────────────────────────────── */
const fx = (id, area, extra = {}) => ({ id, business: "Fixture " + id, area, title: "Deal " + id, details: "d", code: null, url: null, expires: null, ...extra });
const FIX = [
  fx("cpn-fx-srq-free", "Bradenton"),
  fx("cpn-fx-srq-money", "Sarasota", { title: "$10 for $20 of food", url: "/api/commerce/go?provider=clipp&offer=x", commerce: { provider: "clipp", offerId: "x" }, expires: "2026-11-30" }),
  fx("cpn-fx-tpa-free", "Tampa"),
  fx("cpn-fx-orl-money", "Orlando", { title: "50% off bowling", expires: "2026-12-01" }),
  fx("cpn-fx-orl-expired", "Orlando", { expires: "2026-10-27" }),
  fx("cpn-fx-unplaced", "Nowhere-in-particular"),
  fx("cpn-fx-national", "Nationwide", { title: "25% off movie tickets" }),
];
{
  const g = D.dealsByArea(FIX, TODAY);
  const all = g.flatMap((x) => x.deals.map((c) => c.id));
  ok(g.map((x) => x.metro).join(",") === "everywhere,sarasota,tampa,orlando", `groups: nationwide first, then most deals first, ties in METROS order (got ${g.map((x) => x.metro)})`);
  ok(g.every((x) => x.metro === "everywhere" ? x.deals.every((c) => D.dealScope(c).kind === "everywhere") : x.deals.every((c) => D.dealScope(c).metro === x.metro)), "every card sits under the heading of the area it is good in");
  ok(g.filter((x) => x.metro !== "everywhere").every((x) => x.label === METROS[x.metro].label), "area headings are the METROS labels (same vocabulary as the picker)");
  ok(g[1].deals[0].id === "cpn-fx-srq-money", "within an area, the earning deal leads");
  ok(!all.includes("cpn-fx-orl-expired"), "an expired deal is never grouped");
  ok(!all.includes("cpn-fx-unplaced"), "an unplaceable deal is never grouped");
  const inIds = new Set(FIX.map((c) => c.id));
  ok(all.every((id) => inIds.has(id)) && all.length === 5, "dealsByArea only partitions its input (5 live placed rows)");
  ok(D.dealsByArea([], TODAY).length === 0 && D.dealsByArea(null, TODAY).length === 0, "empty / null input -> no groups");
  ok(Number.isInteger(D.STATEWIDE_PER_AREA) && D.STATEWIDE_PER_AREA >= 2 && D.STATEWIDE_PER_AREA <= 6, "STATEWIDE_PER_AREA is a small fixed number");
}

/* ── B. real registry, fixed date ─────────────────────────────────────────── */
{
  const g = D.dealsByArea(COUPONS, TODAY);
  const total = g.reduce((n, x) => n + x.deals.length, 0);
  ok(total > 0 && g.filter((x) => x.metro !== "everywhere").length >= 3, `REAL registry: statewide view has deals in >=3 areas (got ${g.map((x) => x.metro + ":" + x.deals.length)})`);
  ok(g.flatMap((x) => x.deals).every((c) => !c.expires || String(c.expires).slice(0, 10) >= TODAY), "REAL registry: no expired row grouped");
  ok(g.some((x) => x.deals.some((c) => c.commerce || /^\/api\/[a-z-]+\/go\?/.test(String(c.url || "")))), "REAL registry: statewide view includes commerce-routed cards");
  const gate = D.dealTiers(COUPONS, TODAY, null);
  ok([...gate.featured, ...gate.ledger].every((c) => D.dealScope(c).kind === "everywhere"), "dealTiers() with no center is STILL nationwide-only (proximity gate not loosened)");
}

/* ── C. server render of the real screen ─────────────────────────────────── */
const CouponsScreen = (await loadComponent(path.join(REPO, "app/components/screens/Coupons.js"), REPO)).default;
ok(typeof CouponsScreen === "function", "CouponsScreen loads as a component");
const baseCtx = (extra) => ({
  cpnOffers: [], cpnOffersStatus: "ready", center: null, locResolved: true,
  savedCoupons: {}, walletOpen: false, setWalletOpen() {}, couponHandoff: null, user: null, setAuthOpen() {},
  toggleSaveCoupon() {}, copyCouponCode() {}, shareCoupon() {}, logEvent() {}, openExternal() {},
  pickCouponCenter() {}, recenterToMe() {},
  ...extra,
});
const decode = (h) => h.replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/<!-- -->/g, "");
const render = (extra) => decode(renderToStaticMarkup(React.createElement(CouponsScreen, { ctx: baseCtx(extra) })));
const cardsIn = (h) => (h.match(/<article[\s>]/g) || []).length;
const today = (await import(path.resolve("lib/siteTime.js"))).siteTodayStr();
{
  const html = render({});
  const g = D.dealsByArea(COUPONS, today);
  const expected = g.reduce((n, x) => n + (x.metro === "everywhere" ? x.deals.length : Math.min(D.STATEWIDE_PER_AREA, x.deals.length)), 0);
  const total = g.reduce((n, x) => n + x.deals.length, 0);
  ok(/data-coupon-mode="statewide"/.test(html), "unknown: statewide mode");
  ok(cardsIn(html) === expected && expected > 0, `unknown: renders ${D.STATEWIDE_PER_AREA} per area + every nationwide card (${cardsIn(html)} vs ${expected})`);
  ok(new RegExp("All deals · " + total + "<").test(html) && !/All deals · 0</.test(html), `unknown: tab count is the statewide live total (${total}), never 0`);
  ok(g.filter((x) => x.metro !== "everywhere").every((x) => html.includes('data-deal-area="' + x.metro + '"') && html.includes('aria-label="Deals in ' + x.label + '"')), "unknown: one labelled section per area");
  ok(g.filter((x) => x.metro !== "everywhere" && x.deals.length > D.STATEWIDE_PER_AREA).every((x) => html.includes("See all " + x.deals.length + " " + x.label + " deals")), "unknown: 'See all N <area> deals' for every area over the cap");
  const pickerAt = html.indexOf('data-area-state="unknown"');
  const firstSection = html.indexOf("data-deal-area=");
  ok(pickerAt > 0 && firstSection > pickerAt, "unknown: the area picker renders ABOVE the deals");
  ok(Object.keys(METROS).every((k) => html.includes('aria-label="Show deals in ' + METROS[k].label + '"')), "unknown: picker offers every covered metro");
  ok(!/near you/i.test(html), "unknown: nothing claims 'near you'");
  ok(/across Florida, by area/.test(html), "unknown: header says 'across Florida, by area'");
  ok(!/data-deals-state=/.test(html), "unknown: no empty state when deals exist");
  const ids = [...html.matchAll(/<article/g)].length;
  ok(ids > 0, "positive control: articles found by the probe");
  const hrefs = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*data-commerce-owner="CouponCard"/g)].map((m) => m[1]);
  const money = hrefs.filter((h) => /clipp|citypass|undercover/i.test(h));
  ok(money.length > 0 && money.every((h) => /^\/api\/[a-z-]+\/go\?/.test(h)), `partner CTAs go through /api/*/go (${money.length} partner CTAs)`);
  ok(!hrefs.some((h) => /anrdoezrs|clipp\.com|undercovertourist\.com/i.test(h)), "no raw partner/affiliate host in any CTA href");
}
{
  // Expired: a live fixture renders, its expired twin never does.
  const live = fx("cpn-fx-live-tpa", "Tampa", { title: "50% off live fixture", expires: "2099-01-01", business: "Fixture Live Tampa" });
  const dead = fx("cpn-fx-dead-tpa", "Tampa", { title: "50% off dead fixture", expires: "2020-01-01", business: "Fixture Dead Tampa" });
  const html = render({ cpnOffers: [live, dead] });
  ok(!html.includes("Fixture Dead Tampa"), "unknown: an expired deal never renders");
  const groups = D.dealsByArea([...COUPONS, live, dead], today);
  ok(groups.find((x) => x.metro === "tampa").deals.some((c) => c.id === live.id), "positive control: the live twin is in the Tampa group");
}
{
  const html = render({ center: COLUMBUS_OH });
  ok(/data-area-state="outside"/.test(html) && /data-coupon-mode="statewide"/.test(html) && cardsIn(html) > 0, "outside every metro: statewide view + outside-coverage picker");
  ok(!/near you/i.test(html), "outside: nothing claims 'near you'");
}
{
  const html = render({ center: ORLANDO });
  const t = D.dealTiers(COUPONS, today, ORLANDO);
  ok(cardsIn(html) === t.featured.length + t.ledger.length && cardsIn(html) > 0, `known (Orlando): exactly the proximity sheet (${cardsIn(html)} cards)`);
  ok(!/data-coupon-mode="statewide"/.test(html) && !/data-deal-area=/.test(html), "known: no statewide groups");
  ok(/Showing deals for Orlando/.test(html), "known: #1984 'Showing deals for' bar unchanged");
}
{
  const html = render({ center: MIAMI });
  const t = D.dealTiers(COUPONS, today, MIAMI);
  ok([...t.featured, ...t.ledger].every((c) => D.dealScope(c).kind === "everywhere"), "Miami has no metro-scoped deals (precondition)");
  ok(cardsIn(html) === t.featured.length + t.ledger.length, "known-area-with-nothing-local: only nationwide cards, never other areas' cards");
  ok(!/data-deal-area=/.test(html) && !/data-coupon-mode="statewide"/.test(html), "known-empty: no statewide fallback");
}
{
  const html = render({ locResolved: false });
  ok(!/data-coupon-mode="statewide"/.test(html), "still resolving (inside the patience window): #1984 loading behaviour, no statewide flash");
}
{
  // Source wiring: statewide only for unknown/outside, and via dealsByArea.
  const src = (await import("node:fs")).readFileSync(path.join(REPO, "app/components/screens/Coupons.js"), "utf8").replace(/\/\/.*$/gm, "");
  ok(/const statewide = areaState === "unknown" \|\| areaState === "outside";/.test(src), "Coupons.js: statewide is exactly unknown|outside");
  ok(/dealsByArea\(all, today\)/.test(src), "Coupons.js: statewide groups come from dealsByArea over the same registry list");
}

/* ── D. real mount in jsdom: impressions fire for statewide cards ─────────── */
{
  const require = createRequire(import.meta.url);
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM("<!doctype html><div id=root></div>", { url: "https://www.gowayfind.com/?go=coupons", pretendToBeVisual: true });
  const w = dom.window;
  Object.defineProperty(w.navigator, "userAgent", { value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1", configurable: true });
  const captured = [];
  w.posthog = { capture: (ev, props) => captured.push([ev, props]) };
  w.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe(el) { this.cb([{ isIntersecting: true, intersectionRatio: 1, target: el }]); } disconnect() {} unobserve() {} };
  w.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  for (const k of ["window", "document", "navigator", "IntersectionObserver", "HTMLElement", "Node"]) {
    try { Object.defineProperty(globalThis, k, { value: k === "window" ? w : w[k], configurable: true, writable: true }); } catch (e) {}
  }
  globalThis.fetch = w.fetch;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import("react-dom/client");
  const { act } = React;
  const root = createRoot(w.document.getElementById("root"));
  await act(async () => { root.render(React.createElement(CouponsScreen, { ctx: baseCtx({}) })); });
  const arts = [...w.document.querySelectorAll("article")];
  const imps = captured.filter(([ev, p]) => ev === "commerce_impression" && p && p.surface === "coupons");
  const cardImps = captured.filter(([ev, p]) => ev === "card_impression" && p && p.surface === "coupons");
  const partner = arts.filter((a) => /PARTNER/.test(a.textContent)).length;
  ok(arts.length > 0, `jsdom mount, no location: ${arts.length} cards mounted`);
  ok(imps.length > 0 && imps.length === partner, `commerce_impression once per rendered partner card, surface "coupons" (${imps.length}/${partner})`);
  ok(cardImps.length === arts.length, `card_impression once per rendered card (${cardImps.length}/${arts.length})`);
  ok(imps.every(([, p]) => p.provider && p.offer_id), "impression payloads carry provider + offer_id");
  // "See all" expands in place and the newly rendered cards impress too.
  const btn = w.document.querySelector("[data-see-all]");
  ok(!!btn, "a 'See all' control is mounted");
  if (btn) {
    const before = arts.length;
    await act(async () => { btn.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); });
    const after = w.document.querySelectorAll("article").length;
    ok(after > before, `'See all' expands the area in place (${before} -> ${after} cards)`);
    const cardImps2 = captured.filter(([ev, p]) => ev === "card_impression" && p && p.surface === "coupons");
    ok(cardImps2.length === after, `expanded cards fire card_impression too (${cardImps2.length}/${after})`);
  }
  await act(async () => { root.unmount(); });
}

if (fail.length) {
  console.error(`test-coupon-no-location: ${fail.length} FAILED (${pass} passed)`);
  for (const f of fail) console.error("  FAIL " + f);
  process.exit(1);
}
console.log(`test-coupon-no-location: OK — ${pass} assertions (fixtures + real registry @ ${TODAY}, SSR render of 5 location states, jsdom mount with impression capture)`);
