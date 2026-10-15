#!/usr/bin/env node
// test-hotel-cta-impression — the hotel "Check rates" primary CTA must emit
// exactly one commerce_impression (provider stay22, surface detail_primary)
// when it is SEEN, and nothing when it renders no link.
//
// WHY (2026-10-14): stay22 showed 0 commerce_impression ever. The tour-list
// variant of BookingCTA had an IntersectionObserver; the primary variant (the
// only hotel surface) had only the click event, so a zero-click hotel funnel
// was unreadable: nobody-saw-it and nobody-wanted-it looked identical.
//
// HARNESS: no jsdom here, so the REAL compiled BookingCTA is called directly
// under a minimal hook dispatcher; effects run, the anchor's ref is bound to a
// fake element, and a fake IntersectionObserver delivers visibility.
import React from "react";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";

const fail = (m) => { console.error("test-hotel-cta-impression: FAIL - " + m); process.exit(1); };
let passed = 0;
const ok = (c, m) => { if (!c) fail(m); passed++; };

const REPO = fileURLToPath(new URL("..", import.meta.url));
const captured = [];
globalThis.window = { posthog: { capture: (e, p) => captured.push([e, p]) } };
const observers = [];
globalThis.IntersectionObserver = class {
  constructor(cb) { this.cb = cb; this.els = []; observers.push(this); }
  observe(el) { this.els.push(el); }
  unobserve(el) { this.els = this.els.filter((x) => x !== el); }
  disconnect() { this.els = []; }
};
const { default: BookingCTA } = await loadComponent(fileURLToPath(new URL("../app/components/BookingCTA.js", import.meta.url)), REPO);

function mount(props) {
  const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE || React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  const cells = []; const effects = []; let i = 0;
  const dispatcher = {
    useRef: (v) => { const k = i++; return (cells[k] ||= { current: v }); },
    useState: (v) => { const k = i++; cells[k] ||= [v, () => {}]; return cells[k]; },
    useEffect: (fn) => { i++; effects.push(fn); },
    useSyncExternalStore: (sub, get, getServer) => { i++; return (getServer || get)(); },
    useMemo: (fn) => { i++; return fn(); },
    useCallback: (fn) => { i++; return fn; },
  };
  const slot = "ReactCurrentDispatcher" in internals ? internals : null;
  const prev = slot ? slot.ReactCurrentDispatcher.current : internals.H;
  if (slot) slot.ReactCurrentDispatcher.current = dispatcher; else internals.H = dispatcher;
  let tree;
  try { tree = BookingCTA(props); } finally { if (slot) slot.ReactCurrentDispatcher.current = prev; else internals.H = prev; }
  const found = [];
  (function walk(n) { if (!n || typeof n !== "object") return; if (Array.isArray(n)) return n.forEach(walk);
    if (n.props) { if (n.type === "a") found.push(n); walk(n.props.children); } })(tree);
  const anchor = found[0] || null;
  const ref = anchor && (anchor.ref || anchor.props.ref);
  if (ref) ref.current = { getAttribute: () => null };
  observers.length = 0;
  for (const fn of effects) fn();
  const seeIt = () => { for (const o of observers) o.cb(o.els.map((el) => ({ isIntersecting: true, target: el }))); };
  return { tree, anchor, seeIt };
}
const impressions = () => captured.filter(([e]) => e === "commerce_impression");

const verified = { id: "ChIJn_4zMBJAw4gRnyPviItiNRs", name: "Art Ovation Hotel, Autograph Collection", address: "1255 N Palm Ave, Sarasota, FL", lat: 27.336549, lng: -82.544937, types: ["lodging", "hotel"] };

// 1. verified hotel: link renders, ONE impression on view, none before, none on repeat.
let m = mount({ variant: "primary", detail: verified, kind: "hotels", label: "Check rates" });
ok(m.tree && m.anchor && String(m.anchor.props.href).startsWith("/api/hotels/go?"), "verified hotel renders a /api/hotels/go Check rates link");
ok(impressions().length === 0, "no impression before the CTA is visible");
m.seeIt(); m.seeIt();
ok(impressions().length === 1, "exactly one impression after the CTA is seen twice");
const p = impressions()[0][1];
ok(p.provider === "stay22" && p.surface === "detail_primary" && p.category === "hotels", "impression carries provider stay22, surface detail_primary, category hotels");
ok(p.offer_id === verified.id, "impression offer_id is the verified hotel id");

// 2. unverified hotel: CTA renders nothing, so nothing to observe and no impression.
captured.length = 0;
m = mount({ variant: "primary", detail: { ...verified, id: "ChIJunverifiedunverifiedxx", name: "Some Other Inn" }, kind: "hotels", label: "Check rates" });
ok(!m.anchor, "an unverified hotel renders no CTA anchor");
m.seeIt();
ok(impressions().length === 0, "no impression for a hidden/null hotel CTA");

// 3. non-hotel primary CTA must not emit a stay22 impression.
captured.length = 0;
m = mount({ variant: "primary", detail: { id: "ChIJmuseumxxxxxxxxxxxxxx", name: "Ringling Museum", address: "5401 Bay Shore Rd, Sarasota, FL", types: ["museum", "tourist_attraction"] }, kind: "museum", label: "Tickets" });
m.seeIt();
ok(impressions().every(([, q]) => q.provider !== "stay22"), "a non-hotel primary CTA never emits a stay22 impression");

console.log(`test-hotel-cta-impression: ${passed} checks passed`);
