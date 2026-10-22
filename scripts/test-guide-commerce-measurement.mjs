#!/usr/bin/env node
// test-guide-commerce-measurement — guide deal cards must be MEASURABLE.
//
// 2026-10-15 production evidence (PostHog, /guides/things-to-do-sarasota):
//   1. commerce_cta_clicked surface=coupons fired from a GUIDE, with no
//      commerce_impression behind it: GuideDealCards emitted only deal_card_
//      impression, so guide coupon clicks had no CTR denominator, and the
//      surface label claimed the Coupons tab.
//   2. the same click fired commerce_cta_clicked twice, 142 ms apart, same
//      click_id (a double-activation the click beacon did not debounce).
//   3. wf_deals.ends_at (UTC timestamptz) was sliced as text, a day late in ET.
//   4. two long-expired partner coupons kept re-entering the renewal queue.
//
// HARNESS: no jsdom, so the REAL compiled components are CALLED under a minimal
// hook dispatcher (same technique as test-hotel-cta-impression). Effects run,
// refs bind to fake elements, a fake IntersectionObserver delivers visibility,
// and every PostHog capture is recorded. Counts are asserted on those captures.
import React from "react";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { COUPONS } from "../lib/coupons.js";
import { PARTNER_DEAL_COUPONS } from "../lib/partnerDeals.js";
import { couponIsLive } from "../lib/coupons.js";
import { guideDealCommerce, GUIDE_DEALS_SURFACE } from "../lib/guideDeals.js";
import { etDate, collectPartnerOffers } from "../lib/partnerPathInventory.js";
import { evaluatePartnerPaths } from "../lib/partnerPathHealth.js";

const fail = (m) => { console.error("test-guide-commerce-measurement: FAIL - " + m); process.exit(1); };
let passed = 0;
const ok = (c, m) => { if (!c) fail(m); passed++; };

const REPO = fileURLToPath(new URL("..", import.meta.url));
const TODAY = "2026-09-27"; // pinned like check-guide-deal-cards: a lapsing fuse must not break unrelated builds

const captured = [];
let nowMs = 1_000_000;
Date.now = () => nowMs;
const docNodes = [];
globalThis.window = {
  posthog: { capture: (e, p) => captured.push([e, p]) },
  location: { hostname: "www.gowayfind.com" },
  localStorage: { getItem: () => null, setItem: () => {} },
  navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS) AppleWebKit/605 Safari/604", webdriver: false },
};
const listeners = [];
globalThis.document = {
  querySelectorAll: () => docNodes.slice(),
  addEventListener: (t, fn) => listeners.push([t, fn]),
  removeEventListener: () => {},
};
const observers = [];
globalThis.IntersectionObserver = class {
  constructor(cb) { this.cb = cb; this.els = []; observers.push(this); }
  observe(el) { this.els.push(el); }
  unobserve(el) { this.els = this.els.filter((x) => x !== el); }
  disconnect() { this.els = []; }
};

const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE || React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
function callWithHooks(fn, props, effects) {
  const cells = []; let i = 0;
  const dispatcher = {
    useRef: (v) => { const k = i++; return (cells[k] ||= { current: v }); },
    useState: (v) => { const k = i++; cells[k] ||= [v, () => {}]; return cells[k]; },
    useEffect: (f) => { i++; effects.push(f); },
    useMemo: (f) => { i++; return f(); },
    useCallback: (f) => { i++; return f; },
  };
  const slot = "ReactCurrentDispatcher" in internals ? internals : null;
  const prev = slot ? slot.ReactCurrentDispatcher.current : internals.H;
  if (slot) slot.ReactCurrentDispatcher.current = dispatcher; else internals.H = dispatcher;
  try { return fn(props); } finally { if (slot) slot.ReactCurrentDispatcher.current = prev; else internals.H = prev; }
}

// Mount a component tree: DealCard children are expanded (they own a hook);
// everything else is a leaf. Returns the anchors (with fake elements bound).
function mount(Comp, props) {
  const effects = [];
  const anchors = [];
  docNodes.length = 0;
  observers.length = 0;
  const tree = callWithHooks(Comp, props, effects);
  (function walk(n) {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n.type === "function" && n.type.name === "DealCard") return walk(callWithHooks(n.type, n.props, effects));
    if (n.type === "a" && n.props && n.props["data-deal-card"]) {
      const el = { getAttribute: (k) => (k === "data-deal-card" ? n.props["data-deal-card"] : k === "data-merchant" ? n.props["data-merchant"] : null) };
      const ref = n.ref || n.props.ref;
      if (ref) ref.current = el;
      anchors.push({ props: n.props, el });
      docNodes.push(el);
    } else if (n.type === "section" && (n.ref || n.props.ref)) {
      (n.ref || n.props.ref).current = { getAttribute: () => null };
    }
    if (n.props) walk(n.props.children);
  })(tree);
  for (const f of effects) f();
  const seeAll = () => { for (const o of observers) o.cb(o.els.map((el) => ({ isIntersecting: true, intersectionRatio: 1, target: el }))); };
  return { anchors, seeAll };
}
const named = (e) => captured.filter(([n]) => n === e);

// ── fixtures from the REAL registry ────────────────────────────────────────
const live = COUPONS.filter((c) => c && c.url && couponIsLive(c, TODAY));
const affiliateRows = live.filter((c) => String(c.url).startsWith("/api/commerce/go?")).slice(0, 2);
const freeRow = live.find((c) => !String(c.url).startsWith("/api/commerce/go"));
ok(affiliateRows.length === 2 && !!freeRow, `registry fixtures: need 2 live affiliate rows and 1 non-affiliate row (got ${affiliateRows.length}, ${!!freeRow})`);
const toDeal = (c) => {
  const gc = guideDealCommerce(c.url);
  return { id: c.id, business: c.business, title: c.title, details: c.details, area: c.area, badge: null, cta: null, image: null, category: "dining",
    url: (gc || {}).href || c.url, commerce: (gc || {}).ctx || null, external: !String(c.url).startsWith("/"), ends: null };
};
const deals = [...affiliateRows, freeRow].map(toDeal);

// ── 1. guide deal cards: one commerce_impression per visible affiliate card ──
{
  const { default: GuideDealCards } = await loadComponent(fileURLToPath(new URL("../app/guides/[slug]/GuideDealCards.js", import.meta.url)), REPO);
  const m = mount(GuideDealCards, { slug: "things-to-do-sarasota", region: "Sarasota", deals });
  ok(m.anchors.length === 3, "all three deal cards render an anchor");
  ok(named("commerce_impression").length === 0, "no commerce_impression before any card is visible");
  m.seeAll(); m.seeAll();
  const imps = named("commerce_impression").map(([, p]) => p);
  ok(imps.length === 2, `exactly one commerce_impression per visible AFFILIATE card, none for the free card, none on re-intersection (got ${imps.length})`);
  ok(imps.every((p) => p.surface === GUIDE_DEALS_SURFACE && p.surface === "guide_deals"), "impressions carry the truthful surface guide_deals");
  ok(new Set(imps.map((p) => p.offer_id)).size === 2 && imps.every((p) => p.provider && p.content_id), "each impression names its own provider, offer and content");
  // the click beacon reads the same four keys off the href -> the pair joins.
  for (const a of m.anchors.filter((x) => String(x.props.href).startsWith("/api/commerce/go?"))) {
    ok(/\bsponsored\b/.test(a.props.rel) && /\bnofollow\b/.test(a.props.rel), "internal affiliate redirects carry sponsored + nofollow even though external=false");
    const q = new URL(a.props.href, "https://x.test").searchParams;
    ok(q.get("surface") === "guide_deals", "the affiliate href's surface is guide_deals, not coupons");
    ok(imps.some((p) => p.offer_id === q.get("offer") && p.provider === q.get("provider") && p.content_id === q.get("content")), "the impression and the click href agree on provider/offer/content (CTR join)");
  }
  const freeAnchor = m.anchors.find((x) => x.props["data-deal-card"] === freeRow.id);
  ok(freeAnchor.props.href === freeRow.url, "a non-affiliate card keeps its registry href untouched");
  ok(named("deal_card_impression").length === 3 && named("guide_impression").length === 1, "existing product events (deal_card_impression x3, guide_impression x1) are unchanged");
  captured.length = 0;
  m.anchors[0].props.onClick(); m.anchors[0].props.onClick();
  ok(named("deal_card_clicked").length === 1, "deal_card_clicked still fires once per card per pageview");
  ok(named("commerce_cta_clicked").length === 0, "the card itself does not emit commerce_cta_clicked (the beacon owns the click: no second emitter)");
  const courtesy = mount(GuideDealCards, { slug: "free-guide", region: "Sarasota", deals: [{ ...toDeal(freeRow), url: "/coupons", commerce: null, external: false }] });
  ok(courtesy.anchors.length === 1 && !/\bsponsored\b/.test(courtesy.anchors[0].props.rel || ""), "an internal courtesy link stays unsponsored");
}

// ── 2. click beacon: one activation -> one commerce_cta_clicked ─────────────
{
  captured.length = 0;
  const effects = [];
  const { default: Beacon, DOUBLE_ACTIVATION_MS } = await loadComponent(fileURLToPath(new URL("../app/components/CommerceClickBeacon.js", import.meta.url)), REPO);
  callWithHooks(Beacon, { surface: "guide" }, effects);
  listeners.length = 0;
  for (const f of effects) f();
  const handler = (listeners.find(([t]) => t === "click") || [])[1];
  ok(typeof handler === "function", "the beacon registers one document click listener");
  ok(listeners.filter(([t]) => t === "click").length === 1, "exactly one click listener");
  const attrs = { href: deals[0].url };
  const anchor = { getAttribute: (k) => (k in attrs ? attrs[k] : null), setAttribute: (k, v) => { attrs[k] = v; } };
  anchor.closest = () => anchor;
  const click = () => handler({ target: anchor });
  const clicks = () => named("commerce_cta_clicked");

  nowMs = 5_000_000; click();
  nowMs += 142; click(); // the production double-activation
  ok(clicks().length === 1, `a second click 142 ms later is the same activation: ONE commerce_cta_clicked (got ${clicks().length})`);
  ok(clicks()[0][1].surface === "guide_deals", "the click carries surface guide_deals (read off the href)");
  nowMs += DOUBLE_ACTIVATION_MS + 1; click();
  ok(clicks().length === 2, "a genuine later click on the same card still counts");
  // a different card is never swallowed by the first card's debounce
  const attrs2 = { href: deals[1].url };
  const other = { getAttribute: (k) => (k in attrs2 ? attrs2[k] : null), setAttribute: (k, v) => { attrs2[k] = v; } };
  other.closest = () => other;
  handler({ target: other });
  ok(clicks().length === 3, "a click on a different card inside the window counts");
}

// ── 3. Undercover Tourist ends_at is a UTC instant: convert to the ET date ──
{
  ok(etDate("2026-11-01T03:59:00+00:00") === "2026-10-31", "Nov 1 03:59Z is Oct 31 23:59 EDT -> 2026-10-31 (was sliced to 2026-11-01)");
  ok(etDate("2026-11-02T03:59:00+00:00") === "2026-11-01", "Nov 2 03:59Z is Nov 1 22:59 EST (after DST ends) -> 2026-11-01");
  ok(etDate("2026-11-01T04:00:00Z") === "2026-11-01", "04:00Z is 00:00 EDT Nov 1 -> 2026-11-01 (the first instant of the next ET day)");
  ok(etDate("2026-10-31") === "2026-10-31", "a bare date passes through unchanged");
  ok(etDate(null) === null && etDate("") === null, "no ends_at -> null (evergreen)");
  const inv = collectPartnerOffers({ dbDeals: [{ id: 9, provider: "undercover_tourist", active: true, link_ok: true, ends_at: "2026-11-01T03:59:00+00:00" }] });
  const ut = inv.offers.find((o) => o.provider === "undercover_tourist");
  ok(ut.expires === "2026-10-31", "the inventory feeds the ET last-live-day to the evaluator");
  // boundary through the real evaluator: live on its last ET day, gone the day after
  const onLast = evaluatePartnerPaths([ut], "2026-10-31");
  const dayAfter = evaluatePartnerPaths([ut], "2026-11-01");
  ok(onLast.providers.undercover_tourist.live === 1, "live on its last ET day (Oct 31)");
  ok(dayAfter.providers.undercover_tourist.live === 0, "not live the day after (Nov 1) - the old slice kept it live a day too long");
}

// ── 4. dead partner coupons stay purged ─────────────────────────────────────
{
  const dead = ["cpn-partner-orlando-deal-klook-pass", "cpn-partner-tampa-deal-florida-aquarium"];
  ok(dead.every((id) => !COUPONS.some((c) => c && c.id === id) && !PARTNER_DEAL_COUPONS.some((c) => c.id === id)), "the two lapsed 2026-08-08 partner coupons are gone from the registry");
  ok(PARTNER_DEAL_COUPONS.length >= 1, "the live partner coupon (Adventure Island) remains");
}

console.log(`test-guide-commerce-measurement: ${passed} checks passed`);
