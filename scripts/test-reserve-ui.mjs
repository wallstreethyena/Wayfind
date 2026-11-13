#!/usr/bin/env node
/**
 * test-reserve-ui — the "Reserve a table" front end, proven by RENDERING.
 *
 * The card must carry exactly one wide "Reserve a table" button, only for a
 * Wayfind reservation partner, only in the existing .wf-place-card-cta slot,
 * and every other card must stay byte for byte what it was. Partner status is
 * client state (false on the server and on the hydrating render), so the real
 * IconicPlaceCard is mounted in jsdom with React 18 createRoot and a mocked
 * fetch. Nothing here touches the network, Supabase or the live site.
 *
 * NODE_ENV: React's act() throws under NODE_ENV=production (the Vercel build and the production
 * pass of scripts/run-guards.mjs). This guard exercises real rendering, so it pins NODE_ENV to
 * "test" BEFORE react is imported, exactly like scripts/test-home-feed-rerender.mjs, and takes
 * act from React.act. It passes in both run modes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

// Placeholders shaped like keys (never real): lets lib/supabase build a client that reads a seeded local session.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://e2eplaceholder.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "e2e-placeholder-anon-key-not-real";
process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY = "e2e-placeholder-not-a-real-key";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0; const failures = [];
const ok = (c, m) => { pass++; if (!c) failures.push(m); };

// ── a browser-ish world, installed BEFORE any component loads ────────────────
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "https://gowayfind.com/", pretendToBeVisual: true });
const w = dom.window;
const defineGlobal = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
for (const k of ["window", "document", "HTMLElement", "Node", "Event", "CustomEvent", "MouseEvent", "KeyboardEvent", "sessionStorage", "localStorage", "getComputedStyle"]) defineGlobal(k, w[k]);
defineGlobal("navigator", w.navigator);
defineGlobal("requestAnimationFrame", w.requestAnimationFrame.bind(w));
defineGlobal("cancelAnimationFrame", w.cancelAnimationFrame.bind(w));
defineGlobal("IS_REACT_ACT_ENVIRONMENT", true);
defineGlobal("BroadcastChannel", undefined); // node's BroadcastChannel would deliver MessageEvents that jsdom's Event global rejects once a signed in client exists

const calls = [];
let partnersBody = { ok: true, placeIds: ["partner-1", "partner-req", "partner-ot"], lanes: { "partner-1": "instant", "partner-req": "request", "partner-ot": "handoff" } };
let partnersFails = false;
let partnersGate = null; // a promise the partners fetch waits on, to test the loading state
const jsonRes = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const routes = {}; // "POST /api/reserve/book" -> async (body, init) => [status, json]
globalThis.fetch = async (url, init) => {
  const u = String(url);
  const method = (init && init.method) || "GET";
  let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) {}
  calls.push({ url: u, method, body });
  if (u.startsWith("/api/reserve/partners")) { if (partnersGate) await partnersGate; if (partnersFails) throw new Error("offline"); return jsonRes(200, partnersBody); }
  const key = method + " " + u.split("?")[0];
  if (routes[key]) { const [status, json] = await routes[key](body, u); return jsonRes(status, json); }
  return jsonRes(404, { ok: false, error: "NOT_MOCKED", message: "not mocked" });
};

process.env.NODE_ENV = "test"; // before ANY react import: act() throws under production
const React = (await import("react")).default;
const act = React.act;
if (typeof act !== "function") throw new Error("React.act is missing: this guard needs React 18.3+");
const { createRoot, hydrateRoot } = await import("react-dom/client");
const { renderToStaticMarkup, renderToString } = await import("react-dom/server");
const { loadComponent } = await import("./lib/jsxLoad.mjs");

const Card = (await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT)).default;
// jsdom defines `window`, so the card picks useLayoutEffect, which warns during the server render calls below. Not under test.
{ const e = console.error; console.error = (...a) => { if (/useLayoutEffect does nothing/.test(String(a[0]))) return; e(...a); }; }
const noop = () => {};
const place = (id, extra) => ({ id, name: "Mario's Trattoria", rating: 4.7, reviews: 640, types: ["restaurant"], governed_score: 91, wfScore: 91, lat: 27.33, lng: -82.53, distMi: 1.4, ...extra });
const props = (id, extra) => ({ place: place(id), rank: 1, href: "/p/" + id, onSave: noop, onLike: noop, onDislike: noop, onShare: noop, ...extra });
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

async function mount(el) {
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(el); });
  await flush();
  return { host, unmount: () => act(async () => { root.unmount(); }) };
}
const wide = (host) => [...host.querySelectorAll(".wf-place-card-cta > *")];

// ── 1. A partner card ────────────────────────────────────────────────────────
{
  const m = await mount(React.createElement(Card, props("partner-1")));
  const buttons = [...m.host.querySelectorAll("button")].filter((b) => (b.textContent || "").trim().startsWith("Reserve a table"));
  ok(buttons.length === 1, `a partner card has exactly ONE "Reserve a table" button (got ${buttons.length})`);
  const b = buttons[0];
  ok(!!b && b.getAttribute("type") === "button" && b.getAttribute("aria-label") === "Reserve a table at Mario's Trattoria", "button is type=button with aria-label 'Reserve a table at {name}'");
  ok(!!b && !!b.closest(".wf-place-card-cta") && b.parentElement.classList.contains("wf-place-card-cta"), "the button sits inside the existing .wf-place-card-cta slot");
  const actions = m.host.querySelector(".wf-place-card-actions");
  ok(!!actions && !!b && !!(b.compareDocumentPosition(actions) & w.Node.DOCUMENT_POSITION_FOLLOWING), "the button comes BEFORE .wf-place-card-actions in the card");
  ok(m.host.querySelectorAll(".wf-place-card-cta").length === 1 && wide(m.host).length === 1, "one slot, one wide button");
  ok(m.host.querySelector(".wf-place-card").classList.contains("has-cta"), "the card gets the existing has-cta class");
  ok(!!b.closest(".wf-place-card"), "the button is inside the card");
  ok(!/Directions/i.test(m.host.textContent || "") && ![...m.host.querySelectorAll("a,button")].some((x) => /direction/i.test((x.getAttribute("aria-label") || "") + x.textContent)), "no Directions control on the card");
  ok(!/booked|confirmed/i.test(b.textContent), "the button never claims a table is booked");
  // a tap on the button must not open the card
  let opened = 0;
  await m.unmount();
  const m2 = await mount(React.createElement(Card, props("partner-1", { onOpen: () => { opened++; } })));
  const before = calls.length;
  const btn = [...m2.host.querySelectorAll("button")].find((x) => x.textContent.startsWith("Reserve a table"));
  await act(async () => { btn.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })); });
  ok(opened === 0, "tapping Reserve a table does not open the card (stopPropagation)");
  await m2.unmount();
}

// ── 1b. The button itself stops the tap (not only the slot wrapper around it) ─
{
  const Cta = (await loadComponent(path.join(ROOT, "app/components/ReserveCta.js"), ROOT)).ReserveCta;
  let bubbled = 0;
  const m = await mount(React.createElement("div", { onClick: () => { bubbled++; } }, React.createElement(Cta, { place: place("partner-1") })));
  const btn = m.host.querySelector("button");
  await act(async () => { btn.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })); });
  ok(bubbled === 0, "ReserveCta stops propagation on its own, so a tap never reaches whatever wraps it");
  ok(btn.getAttribute("type") === "button" && btn.textContent.trim().startsWith("Reserve a table"), "ReserveCta renders <button type=button> labelled 'Reserve a table'");
  ok(btn.textContent.trim() === "Reserve a table\u203a", "ReserveCta renders the real single-character chevron (U+203A) in a real render, not mojibake");
  { const cs = fs.readFileSync(path.join(ROOT, "app/components/ReserveConcierge.js"), "utf8"); ok(/"Booked\. "/.test(cs) && /Request sent to /.test(cs) && !/You're booked/.test(cs), "the concierge says \"Booked.\" for a confirmed booking and \"Request sent\" for a request"); }
  await m.unmount();
}

// ── 2. A non partner card is byte for byte the normal card ───────────────────
{
  const cafe = { place: place("other-1", { name: "Sunrise Cafe", types: ["cafe", "food"], primaryType: "cafe" }) };
  const m = await mount(React.createElement(Card, props("other-1", cafe)));
  ok(m.host.querySelectorAll("[data-reserve-cta]").length === 0 && !/Reserve a table/.test(m.host.innerHTML), "a walk in cafe has no reservation button of any kind");
  ok(m.host.querySelectorAll(".wf-place-card-cta").length === 0 && !m.host.querySelector(".wf-place-card").classList.contains("has-cta"), "…no empty slot and no has-cta class");
  const server = renderToStaticMarkup(React.createElement(Card, props("other-1", cafe)));
  const clientHtml = m.host.innerHTML;
  // jsdom re-serialises inline styles (colours, spacing) and the live card sets data-wf-live after mount; neither is markup we changed, so structure, classes and text are compared.
  const norm = (s) => s.replace(/<!--.*?-->/g, "").replace(/ data-wf-live="1"/g, "").replace(/ style="[^"]*"/g, "").replace(/&#x27;/g, "'");
  if (norm(clientHtml) !== norm(server)) { let i = 0; const a = norm(clientHtml), b = norm(server); while (a[i] === b[i]) i++; console.error("DIFF at " + i + "\n client: " + a.slice(i - 80, i + 160) + "\n server: " + b.slice(i - 80, i + 160)); }
  ok(norm(clientHtml) === norm(server), "cafe card markup after the partner list arrived equals its plain server markup");
  await m.unmount();
}

// ── 3. A caller's own cta wins: one wide button, never two ───────────────────
{
  const cta = React.createElement("a", { href: "/api/hotels/go?x=1", className: "caller-cta" }, "Check rates");
  const m = await mount(React.createElement(Card, props("partner-1", { cta })));
  ok(wide(m.host).length === 1 && m.host.querySelectorAll(".wf-place-card-cta").length === 1, "caller cta + partner status: count of wide buttons is 1");
  ok(!!m.host.querySelector(".caller-cta") && !/Reserve a table/.test(m.host.innerHTML), "…and it is the caller's cta, not Reserve");
  await m.unmount();
}

// ── 4. Hydration: server HTML has no button, no mismatch, button arrives after ─
{
  const html = renderToString(React.createElement(Card, props("partner-1")));
  ok(!/Reserve a table/.test(html) && !html.includes("wf-place-card-cta"), "server HTML never carries the Reserve button (partner status is false on the server)");
  const host = document.createElement("div"); host.innerHTML = html; document.body.appendChild(host);
  const errs = []; const origErr = console.error; console.error = (...a) => { errs.push(a.join(" ")); };
  let root;
  await act(async () => { root = hydrateRoot(host, React.createElement(Card, props("partner-1"))); });
  await flush();
  console.error = origErr;
  ok(!errs.some((e) => /hydrat|did not match|mismatch/i.test(e)), "hydrating a partner card produces no hydration mismatch warning " + errs.filter((e) => /hydrat|match/i.test(e)).slice(0, 1).join(" "));
  ok(!!host.querySelector("[data-reserve-cta]"), "…and the button appears right after hydration");
  await act(async () => { root.unmount(); });
}

// ── 5. The partner list: one GET, cached, failure is empty and never throws ──
{
  const partnerGets = calls.filter((c) => c.url.startsWith("/api/reserve/partners")).length;
  ok(partnerGets === 1, `ONE partners GET for all the cards above (got ${partnerGets})`);
  const fresh = await loadComponent(path.join(ROOT, "lib/reservePartners.js"), ROOT);
  sessionStorage.clear();
  partnersFails = true;
  const warns = []; const origWarn = console.warn; console.warn = (...a) => warns.push(a.join(" "));
  const s1 = await fresh.loadReservePartners();
  const s2 = await fresh.loadReservePartners();
  console.warn = origWarn;
  ok(s1 instanceof Set && s1.size === 0 && s2.size === 0, "a failing partners call gives an EMPTY set and does not throw");
  ok(warns.length === 1, `…with exactly one console.warn (got ${warns.length})`);
  const c1 = calls.filter((c) => c.url.startsWith("/api/reserve/partners")).length;
  await fresh.loadReservePartners();
  ok(calls.filter((c) => c.url.startsWith("/api/reserve/partners")).length === c1, "…and it is remembered, not retried on every card");
  partnersFails = false;
}
{
  const fresh = await loadComponent(path.join(ROOT, "lib/reservePartners.js"), ROOT);
  sessionStorage.clear();
  const n0 = calls.length;
  const a = await fresh.loadReservePartners();
  ok(a.has("partner-1") && calls.length === n0 + 1, "first load fetches once and returns the partner ids");
  ok(JSON.parse(sessionStorage.getItem("wf_reserve_partners_v2")).ids.includes("partner-1"), "…and writes the 5 minute sessionStorage cache");
  const fresh2 = await loadComponent(path.join(ROOT, "lib/reservePartners.js"), ROOT);
  const b = await fresh2.loadReservePartners();
  ok(b.has("partner-1") && calls.length === n0 + 1, "a new page load within 5 minutes reads sessionStorage and does not fetch");
}

// ── 5b. Capability to CTA: every lane label, ask for sit down places, nothing for walk in, failure and loading ─
{
  const cap = await loadComponent(path.join(ROOT, "lib/reserveCapability.js"), ROOT);
  ok(cap.RESERVE_LABELS.instant === "Reserve a table" && cap.RESERVE_LABELS.request === "Request a table" && cap.RESERVE_LABELS.handoff === "Reserve on OpenTable" && cap.RESERVE_LABELS.ask === "Ask about a table", "the four labels are exactly: Reserve a table, Request a table, Reserve on OpenTable, Ask about a table");
  ok(!/[–—]/.test(Object.values(cap.RESERVE_LABELS).join("")), "labels carry no dashes");
  const sit = (types, primaryType, extra) => cap.isSitDownPlace({ id: "x", name: "N", types, primaryType, ...extra });
  ok(sit(["restaurant", "food"], "restaurant") && sit(["bar", "night_club"], "bar") && sit(["steak_house", "restaurant"], "steak_house") && sit(["seafood_restaurant"], null), "restaurants, bars, steakhouses are sit down");
  ok(!sit(["cafe", "food"], "cafe") && !sit(["restaurant", "cafe"], "cafe") && !sit(["bakery", "food"], "bakery") && !sit(["restaurant", "meal_takeaway"], "meal_takeaway") && !sit(["fast_food_restaurant", "restaurant"], "fast_food_restaurant") && !sit(["ice_cream_shop"], "ice_cream_shop") && !sit(["coffee_shop", "cafe"], null), "cafes, bakeries, takeaway, fast food, ice cream are NOT sit down");
  ok(!sit(["lodging", "restaurant"], "hotel") && !sit(["park", "tourist_attraction"], "park") && !sit([], null), "hotels, parks and untyped places are not sit down");
  const caps = (state, lanes, ids) => ({ state, lanes: lanes || {}, ids: new Set(ids || Object.keys(lanes || {})) });
  const rest = { id: "r1", types: ["restaurant"], primaryType: "restaurant" };
  ok(cap.reserveLaneFor(rest, caps("loading")) === null, "while the list loads: nothing, not even Ask about a table");
  ok(cap.reserveLaneFor(rest, caps("ok", { r1: "request" })) === "request" && cap.reserveLaneFor(rest, caps("ok", {})) === "ask", "ok: the verified lane, else Ask for a sit down place");
  ok(cap.reserveLaneFor({ id: "c1", types: ["cafe"], primaryType: "cafe" }, caps("ok", {})) === null, "ok: a cafe without a route gets nothing");
  ok(cap.reserveLaneFor(rest, caps("failed")) === "ask" && cap.reserveLaneFor({ id: "r1", types: ["cafe"], primaryType: "cafe" }, caps("failed")) === null, "failed list: a restaurant still gets Ask about a table (never a verified label), a cafe gets nothing");
  ok(cap.reserveLaneFor(rest, caps("ok", {}, ["r1"])) === "ask", "a listed id with no lane (older payload) reads as Ask, never as a promise");
}
{
  const btnFor = (m) => [...m.host.querySelectorAll("[data-reserve-cta]")];
  const lane = async (id, extra, C = Card) => { const m = await mount(React.createElement(C, props(id, extra))); const b = btnFor(m); return { m, b }; };
  // each lane renders its own label and aria label, in the one existing slot, signed out
  ok(!Object.keys(localStorage).some((k) => /auth-token/.test(k)), "SETUP: no session exists (the checks below are a signed out visitor)");
  for (const [id, label] of [["partner-1", "Reserve a table"], ["partner-req", "Request a table"], ["partner-ot", "Reserve on OpenTable"], ["other-rest", "Ask about a table"]]) {
    const { m, b } = await lane(id);
    ok(b.length === 1 && b[0].textContent.trim() === label + "›" && b[0].getAttribute("aria-label") === label + " at Mario's Trattoria" && b[0].parentElement.classList.contains("wf-place-card-cta") && wide(m.host).length === 1, `${id}: exactly one wide button labelled "${label}" in the existing slot, visible while signed out`);
    ok(!/booked|confirmed/i.test(b[0].textContent), `${id}: label never claims a booking`);
    await m.unmount();
  }
  { const { m, b } = await lane("other-bar", { place: place("other-bar", { name: "The Tap", types: ["bar", "establishment"], primaryType: "bar" }) });
    ok(b.length === 1 && b[0].textContent.startsWith("Ask about a table"), "a bar with no route gets Ask about a table"); await m.unmount(); }
  // walk in places and non food get nothing
  for (const [nm, pl] of [["cafe", { types: ["cafe"], primaryType: "cafe" }], ["bakery", { types: ["bakery", "food"], primaryType: "bakery" }], ["takeaway", { types: ["meal_takeaway", "restaurant"], primaryType: "meal_takeaway" }], ["fast food", { types: ["fast_food_restaurant"], primaryType: "fast_food_restaurant" }], ["park", { types: ["park"], primaryType: "park" }]]) {
    const { m, b } = await lane("walk-" + nm, { place: place("walk-" + nm, pl) });
    ok(b.length === 0 && m.host.querySelectorAll(".wf-place-card-cta").length === 0 && !/table/i.test(m.host.textContent), `${nm}: no reservation action and no empty slot`);
    await m.unmount();
  }
  // a caller cta is never displaced (all current caller ctas are hotel, event or commerce): one wide button, the caller's
  { const cta = React.createElement("a", { href: "/api/hotels/go?x=1", className: "caller-cta" }, "Check rates");
    for (const id of ["partner-1", "other-rest"]) { const { m, b } = await lane(id, { cta }); ok(b.length === 0 && !!m.host.querySelector(".caller-cta") && wide(m.host).length === 1, `${id}: a caller cta keeps the slot, no second primary button`); await m.unmount(); } }
  // tapping opens the concierge for THAT restaurant (the sheet is the real lazy chunk, the concierge posts its place id)
  for (const [id, label] of [["partner-1", "Reserve a table"], ["partner-req", "Request a table"], ["partner-ot", "Reserve on OpenTable"], ["other-rest", "Ask about a table"]]) {
    routes["POST /api/reserve/concierge"] = async () => [200, { ok: true, say: "ok", state: { placeId: id }, card: null }];
    const before = calls.length;
    let opened = 0; const { m, b } = await lane(id, { onOpen: () => { opened++; } });
    await act(async () => { b[0].dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })); });
    await act(async () => { await new Promise((r) => setTimeout(r, 150)); });
    const dlg = document.querySelector('[role="dialog"]');
    ok(opened === 0 && !!dlg && !!dlg.querySelector("[data-reserve-concierge]") && /Mario's Trattoria/.test(dlg.textContent), `${label}: tap opens the concierge sheet for the restaurant (card stays closed)`);
    ok(!!dlg && (dlg.querySelector("#wf-reserve-title") || {}).textContent === label, `${label}: the sheet title repeats the button, never a stronger promise (got ${(dlg && dlg.querySelector("#wf-reserve-title") || {}).textContent})`);
    ok(document.documentElement.hasAttribute("data-wf-reserve-open") && /\.wf-sd\{visibility:hidden\}/.test(dlg.parentElement.innerHTML), `${label}: while the sheet is open the fixed Santa dock is hidden so it cannot cover the message box`);
    const input = dlg && dlg.querySelector("#wf-reserve-msg");
    if (input) { Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, "value").set.call(input, "tomorrow at 7 for 2"); await act(async () => { input.dispatchEvent(new w.Event("input", { bubbles: true })); }); await act(async () => { dlg.querySelector("form:last-of-type").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true })); await new Promise((r) => setTimeout(r, 80)); }); }
    const turnCall = calls.slice(before).find((c) => c.url === "/api/reserve/concierge");
    ok(!!turnCall && turnCall.body.context.placeId === id, `${label}: the concierge turn carries context.placeId = ${id}`);
    document.querySelectorAll("[data-reserve-host],[role=dialog]").forEach((x) => x.remove());
    delete routes["POST /api/reserve/concierge"];
    await m.unmount();
  }
  // loading: the server HTML and a card whose list is still pending render nothing new
  ok(!/Ask about a table|Request a table|OpenTable/.test(renderToStaticMarkup(React.createElement(Card, props("other-rest")))), "server HTML never carries Ask about a table either (nothing is drawn before the list answers)");
  { const Fresh = (await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT)).default;
    sessionStorage.clear();
    let release; partnersGate = new Promise((r) => { release = r; });
    const m = await mount(React.createElement(Fresh, props("other-rest")));
    ok(btnFor(m).length === 0, "while the capability request is still loading, a restaurant card shows no reservation action");
    release(); partnersGate = null; await flush();
    ok(btnFor(m).length === 1 && btnFor(m)[0].textContent.startsWith("Ask about a table"), "…and once it answers (no route) the Ask entry appears");
    await m.unmount(); }
  // failed load: restaurants still get the honest Ask entry, never a verified label; cafes get nothing
  { const Fresh = (await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT)).default;
    sessionStorage.clear(); partnersFails = true;
    const w0 = console.warn; console.warn = () => {};
    const a = await lane("partner-1", {}, Fresh);
    const c = await lane("walk-failed", { place: place("walk-failed", { types: ["cafe"], primaryType: "cafe" }) }, Fresh);
    console.warn = w0; partnersFails = false;
    ok(a.b.length === 1 && a.b[0].textContent.startsWith("Ask about a table") && !/Reserve a table|Request a table|OpenTable/.test(a.m.host.textContent.replace("Ask about a table", "")), "failed capability request: a restaurant gets Ask about a table (the concierge checks live), never a verified label");
    ok(c.b.length === 0, "failed capability request: a cafe still gets nothing");
    await a.m.unmount(); await c.m.unmount(); sessionStorage.clear(); }
  // RailCard: the same entry in its money-action slot, and the caller's own cta (commerce) is never displaced
  { const Rail = (await loadComponent(path.join(ROOT, "app/components/RailCard.js"), ROOT)).default;
    const railProps = (id, extra) => ({ title: "Mario's Trattoria", photo: null, place: place(id), rank: 1, onSave: noop, onLike: noop, onDislike: noop, onShare: noop, ...extra });
    const r1 = await mount(React.createElement(Rail, railProps("partner-1")));
    ok(r1.host.querySelectorAll("[data-reserve-cta]").length === 1 && r1.host.querySelector("[data-reserve-cta]").textContent.startsWith("Reserve a table"), "RailCard: a partner restaurant card carries the Reserve entry");
    await r1.unmount();
    const r2 = await mount(React.createElement(Rail, railProps("partner-1", { cta: { label: "Book on Viator", href: "https://example.com/x", external: true } })));
    ok(r2.host.querySelectorAll("[data-reserve-cta]").length === 0 && /Book on Viator/.test(r2.host.textContent), "RailCard: a caller commerce cta is kept and no second primary button appears");
    await r2.unmount();
    const r3 = await mount(React.createElement(Rail, railProps("other-rest")));
    ok(r3.host.querySelectorAll("[data-reserve-cta]").length === 1 && r3.host.textContent.includes("Ask about a table"), "RailCard: a sit down restaurant with no route gets Ask about a table");
    await r3.unmount();
    const r4 = await mount(React.createElement(Rail, railProps("walk-r", { place: place("walk-r", { types: ["bakery"], primaryType: "bakery" }) })));
    ok(r4.host.querySelectorAll("[data-reserve-cta]").length === 0, "RailCard: a bakery gets nothing");
    await r4.unmount(); }
}

// ── 6. The form rules (shape checks; the database decides what is open) ─────
{
  const rc = await loadComponent(path.join(ROOT, "lib/reserveClientApi.js"), ROOT);
  const now = new Date("2026-11-11T15:00:00Z");
  const { min, max } = rc.reserveDateRange(now);
  ok(min === "2026-11-11" && max === "2027-01-10", `date range is today through today+60 days Eastern (got ${min}..${max})`);
  ok(rc.reserveDateRange(new Date("2026-11-12T00:00:00Z")).min === "2026-11-11", "anchored to US Eastern, not UTC (midnight UTC on the 12th is 7 PM on the 11th)");
  const good = { partySize: 4, date: "2026-11-14", time: "19:00", guestName: "Gabe", note: "" };
  ok(rc.validateDraft(good, now) === null, "a good draft validates");
  ok(rc.summaryLine(good) === "4 people · Sat, Nov 14 · 7:00 PM · under Gabe", "summary line reads '4 people · Sat, Nov 14 · 7:00 PM · under Gabe' - got " + rc.summaryLine(good));
  const bad = (o, mp) => rc.validateDraft({ ...good, ...o }, now, mp) !== null;
  ok(bad({ partySize: 0 }) && bad({ partySize: 13 }) && !bad({ partySize: 1 }) && !bad({ partySize: 12 }), "party 1 to 12 by default");
  ok(bad({ partySize: 9 }, 8) && !bad({ partySize: 8 }, 8), "the restaurant's own max party is honoured");
  ok(bad({ date: "2026-11-10" }) && !bad({ date: "2026-11-11" }) && !bad({ date: "2027-01-10" }) && bad({ date: "2027-01-11" }), "date today through +60 days");
  ok(bad({ time: "19:10" }) && !bad({ time: "19:45" }), "time in 15 minute steps");
  ok(bad({ guestName: "" }) && bad({ guestName: "x".repeat(41) }) && !bad({ guestName: "x".repeat(40) }), "name 1 to 40");
  ok(bad({ note: "x".repeat(201) }) && !bad({ note: "x".repeat(200) }), "note max 200");
  for (const gone of ["reserveTimeSlots", "sendReserveRequest", "myReserveRequests", "draftIsSendable"]) ok(!(gone in rc), `${gone} is gone: the form never invents times or sends a request`);
  ok(rc.cleanPhoneInput("941-555-0199") === "(941) 555-0199" && rc.cleanPhoneInput("+1 (941) 555 0199") === "(941) 555-0199" && rc.cleanPhoneInput("123") === null && rc.cleanPhoneInput("abc") === null && rc.cleanPhoneInput("(041) 555-0199") === null, "phone input is cleaned to (xxx) xxx-xxxx or refused");
  const k1 = rc.newIdempotencyKey(), k2 = rc.newIdempotencyKey();
  ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(k1) && k1 !== k2, "idempotency keys are fresh v4 uuids");
  const ics = rc.buildIcs({ id: "b1", confirmationCode: "K7M2QX", date: "2026-11-14", time: "19:30", partySize: 4, restaurantName: "Joe's; Bar, Grill", restaurantPhone: "(941) 555-0100" }, new Date("2026-11-11T15:00:00Z"));
  ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n") && ics.includes("DTSTART:20261114T193000\r\n") && ics.includes("DTEND:20261114T210000\r\n"), "the calendar file starts at the booked time and lasts the 90 minute seating");
  ok(ics.includes("SUMMARY:Table at Joe's\\; Bar\\, Grill\r\n") && ics.includes("Confirmation code K7M2QX.") && ics.includes("UID:b1@gowayfind.com"), "calendar text escapes ; and , and carries the confirmation code (regression: the ; escape was a no-op)");
  ok(rc.buildIcs({ date: "x", time: "y" }) === "", "no calendar file for a booking without a date and time");
}

// ── 7. Source locks that a render cannot see ─────────────────────────────────
{
  const { readFileSync } = await import("node:fs");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const read = (f) => strip(readFileSync(path.join(ROOT, f), "utf8"));
  const card = read("app/components/IconicPlaceCard.js");
  ok(/useReserveEntry\(\s*cta\s*\?\s*null/.test(card), "the card only subscribes to partner status when the caller left the cta slot free");
  const staticImports = (src) => [...src.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  ok(!staticImports(card).some((x) => /ReserveCta|ReserveSheet|reserveClientApi|reservePartners|reserveOpen/.test(x)), "the card statically imports only lib/reserveClient.js: button, sheet, API, loader and opener are lazy chunks (homepage JS budget)");
  ok(!/\blazy\(|\bSuspense\b|import\(\s*["']\.\/ReserveCta/.test(card) && /ReserveSlot\s*\?\s*<ReserveSlot\s+place=/.test(card), "the card has no lazy(), no Suspense and no import() for the button: the hook hands it the slot component");
  const partnersSrc = read("lib/reservePartners.js");
  ok(/import\s+ReserveCtaSlot\s+from\s+["']\.\.\/app\/components\/ReserveCta\.js["']/.test(partnersSrc) && /export\s*\{\s*ReserveCtaSlot\s*\}/.test(partnersSrc), "the button slot rides inside the lazy partners chunk (one async chunk, not two)");
  const client = read("lib/reserveClient.js");
  ok(!staticImports(client).some((x) => /reservePartners|reserveClientApi|reserveOpen/.test(x)) && /import\(\s*["']\.\/reservePartners\.js["']\s*\)/.test(client), "reserveClient (eager) reaches the partner loader only by dynamic import");
  ok(/import\(\s*["']\.\.\/app\/components\/ReserveSheet\.js["']\s*\)/.test(read("lib/reserveOpen.js")) && !staticImports(read("lib/reserveOpen.js")).some((x) => /ReserveSheet/.test(x)), "openReserveSheet loads the sheet with a dynamic import, never a static one");
  const home = readFileSync(path.join(ROOT, "app/home.js"), "utf8");
  ok(/className="wf-signin-button"/.test(home) && /querySelector\(\s*["']\.wf-signin-button["']\s*\)/.test(read("app/components/ReserveConcierge.js")), "the shell's header Sign in button still carries .wf-signin-button, the door the sheet uses");
  ok(!staticImports(read("app/components/sheets/Detail.js")).some((x) => /ReserveSheet/.test(x)), "Detail.js never statically imports the sheet");
}

// ── 8. The concierge, against a mocked server: every card renders, and it books for real or says nothing ─────
{
  const rc = await loadComponent(path.join(ROOT, "lib/reserveClientApi.js"), ROOT);
  const { siteTodayStr } = await loadComponent(path.join(ROOT, "lib/siteTime.js"), ROOT);
  const Concierge = (await loadComponent(path.join(ROOT, "app/components/ReserveConcierge.js"), ROOT)).default;
  const Sheet = await loadComponent(path.join(ROOT, "app/components/ReserveSheet.js"), ROOT);
  const History = await loadComponent(path.join(ROOT, "app/components/ReserveHistory.js"), ROOT);
  const DAY = rc.addDaysIso(siteTodayStr(), 3);
  const WD = rc.weekdayLabel(DAY);
  localStorage.setItem("sb-e2eplaceholder-auth-token", JSON.stringify({ access_token: "tok", refresh_token: "ref", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "t@example.com", user_metadata: {}, app_metadata: {} } }));
  const settle = (ms = 80) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
  const click = async (el) => { await act(async () => { el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })); }); await settle(); };
  const setVal = async (el, v) => { Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, "value").set.call(el, v); await act(async () => { el.dispatchEvent(new w.Event("input", { bubbles: true })); }); };
  const submit = async (form) => { await act(async () => { form.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true })); }); await settle(); };
  const reset = () => { for (const k of Object.keys(routes)) delete routes[k]; calls.length = 0; localStorage.removeItem("wf_reserve_handoffs"); };
  const callsTo = (m, u) => calls.filter((c) => c.method === m && c.url.split("?")[0] === u);
  const STATE = { placeId: "partner-1", restaurantName: "Mario's Trattoria", lane: "instant", date: DAY, time: null, partySize: 4 };
  const turn = (card, say, extra) => async () => [200, { ok: true, say: say || "Here you go.", state: STATE, missing: [], card, profile: { hasName: true, hasPhone: false, display: "Gabriel P." }, ...extra }];
  const timesCard = { type: "times", date: DAY, partySize: 4, options: [{ time: "18:45", label: "6:45 PM" }, { time: "19:00", label: "7:00 PM" }] };
  async function mountC(props) {
    const m = await mount(React.createElement(Concierge, { initialPlace: { id: "partner-1", name: "Mario's Trattoria" }, ...props }));
    await settle(60);
    return m;
  }
  const q = (m) => (sel) => m.host.querySelector(sel);
  const bt = (m, label) => [...m.host.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === label);
  const say = async (m, t) => { await setVal(m.host.querySelector("#wf-reserve-msg"), t); await submit(m.host.querySelector("form:last-of-type")); };

  // (a) the opening message goes to the concierge with context and state; a times card renders chips; a tap books with an idempotency key
  reset();
  routes["POST /api/reserve/concierge"] = turn(timesCard, "I found 6:45 PM and 7:00 PM for 4.");
  routes["POST /api/reserve/book"] = async () => [201, { ok: true, booking: { id: "b1", status: "confirmed", confirmationCode: "K7M2QX", restaurantName: "Mario's Trattoria", date: DAY, time: "19:00", partySize: 4 } }];
  let m = await mountC({ initialMessage: "four tomorrow around 7" });
  const t1 = callsTo("POST", "/api/reserve/concierge")[0];
  ok(!!t1 && t1.body.context.placeId === "partner-1" && t1.body.messages[0].content === "four tomorrow around 7" && !!t1.body.state, "the seeded message posts {messages, context:{placeId}, state} to /api/reserve/concierge");
  const chips = [...m.host.querySelectorAll("[data-reserve-time]")];
  ok(chips.length === 2 && chips[0].textContent === "6:45 PM" && chips[1].textContent === "7:00 PM" && /I found 6:45 PM/.test(m.host.textContent), "times card: the server's sentence plus one chip per open time");
  ok(!!m.host.querySelector('[role="log"][aria-live="polite"]'), "the thread is an aria-live log");
  ok(calls.filter((c) => c.url === "/api/reserve/book").length === 0, "nothing is booked until a chip is tapped");
  await click(chips[1]);
  ok(callsTo("POST", "/api/reserve/book").length === 0, "tapping a time chip makes ZERO /book calls (it only shows the confirm step)");
  const cf = m.host.querySelector('[data-reserve-card="confirm"]');
  ok(!!cf && cf.textContent.includes(`Mario's Trattoria, ${WD} at 7:00 PM for 4.`) && /Booking as Gabriel P\./.test(cf.textContent), "confirm card: '<Restaurant>, <Weekday> at <time> for <N>. Booking as <profile.display>.' (got " + (cf && cf.textContent.slice(0, 120)) + ")");
  ok(!!cf.querySelector('[data-reserve-confirm="1"]') && cf.querySelector('[data-reserve-confirm="1"]').textContent === "Confirm booking" && !!bt(m, "Pick another time"), "confirm card has a primary 'Confirm booking' (data-reserve-confirm) and a quiet 'Pick another time'");
  await click(bt(m, "Pick another time"));
  ok(callsTo("POST", "/api/reserve/book").length === 0 && m.host.querySelectorAll("[data-reserve-time]").length === 2 && !m.host.querySelector('[data-reserve-card="confirm"]'), "'Pick another time' brings the times back and still books nothing");
  await click(m.host.querySelector('[data-reserve-time="19:00"]'));
  routes["POST /api/reserve/book"] = (() => { const inner = routes["POST /api/reserve/book"]; return async (b, u) => { await new Promise((r) => setTimeout(r, 40)); return inner(b, u); }; })();
  const confirmBtn = m.host.querySelector('[data-reserve-confirm="1"]');
  await act(async () => { confirmBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })); confirmBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })); });
  ok(confirmBtn.disabled, "Confirm booking is disabled while the booking is in flight");
  await settle(120);
  ok(callsTo("POST", "/api/reserve/book").length === 1, "a double tap on Confirm booking posts /book exactly once (got " + callsTo("POST", "/api/reserve/book").length + ")");
  const bk = callsTo("POST", "/api/reserve/book")[0];
  ok(!!bk && bk.body.placeId === "partner-1" && bk.body.date === DAY && bk.body.time === "19:00" && bk.body.partySize === 4 && /^[0-9a-f-]{36}$/.test(bk.body.idempotencyKey), "tapping a time posts /api/reserve/book with placeId, date, time, party and an idempotency key");
  const bookedEl = m.host.querySelector('[data-reserve-card="booked"]');
  ok(!!bookedEl && bookedEl.textContent.includes(`Booked. Mario's Trattoria, ${WD} at 7:00 PM for 4.`), "booked card reads exactly 'Booked. <Restaurant>, <Weekday> at <h:mm PM> for <N>.' (got " + (bookedEl && bookedEl.textContent.slice(0, 90)) + ")");
  ok(/K7M2QX/.test(bookedEl.textContent) && !!bt(m, "Add to itinerary") && !!bt(m, "Add to calendar") && !!bt(m, "Cancel") && /^https:\/\/www\.google\.com\/maps\/dir\//.test(bookedEl.querySelector("[data-reserve-directions]").getAttribute("href")), "booked card: confirmation code, Add to itinerary, Directions, Add to calendar, Cancel");
  ok(/Booking as Gabriel P\./.test(m.host.textContent) && !!bt(m, "Change"), "'Booking as Gabriel P. · Change' comes from response.profile.display");
  await click(bt(m, "Add to itinerary"));
  ok(JSON.stringify(JSON.parse(localStorage.getItem("wf_trips_v1") || "{}")).includes("partner-1"), "Add to itinerary files the place into wf_trips_v1");
  routes["POST /api/reserve/cancel"] = async () => [200, { ok: true, booking: { id: "b1", status: "cancelled" } }];
  await click(bt(m, "Cancel"));
  ok(/Cancel this table\?/.test(m.host.textContent) && callsTo("POST", "/api/reserve/cancel").length === 0, "Cancel asks once before sending");
  await click(bt(m, "Yes, cancel it"));
  ok(callsTo("POST", "/api/reserve/cancel").length === 1 && /Your table is cancelled\./.test(m.host.textContent), "confirming cancels through /api/reserve/cancel");
  await m.unmount();

  // (b) retry reuses the idempotency key; a request status says 'Request sent', never 'Booked'
  reset();
  routes["POST /api/reserve/concierge"] = turn({ type: "request", date: DAY, time: "19:15", partySize: 4 }, "Mario's takes requests.");
  let n = 0;
  routes["POST /api/reserve/book"] = async () => (++n === 1 ? [500, { ok: false, error: "SERVER", message: "Try again." }] : [201, { ok: true, booking: { id: "b2", status: "requested", restaurantName: "Mario's Trattoria", date: DAY, time: "19:15", partySize: 4 } }]);
  m = await mountC({ initialMessage: "request 7:15 for four" });
  ok(!!bt(m, "Send request") && !!m.host.querySelector('[data-reserve-card="request"]'), "request card renders a 'Send request' button");
  await click(bt(m, "Send request"));
  ok(/Try again\./.test(m.host.textContent) && !/Booked/.test(m.host.textContent), "a failed send says so and never claims a booking");
  await click(bt(m, "Try again"));
  const keysSeen = callsTo("POST", "/api/reserve/book").map((c) => c.body.idempotencyKey);
  ok(keysSeen.length === 2 && keysSeen[0] === keysSeen[1], "a retry reuses the same idempotency key");
  const reqEl = m.host.querySelector('[data-reserve-card="requested"]');
  ok(!!reqEl && reqEl.textContent.includes(`Request sent to Mario's Trattoria for ${WD} at 7:15 PM for 4. We'll show their answer in My reservations.`) && !/Booked/.test(m.host.textContent), "requested status shows 'Request sent to <name> for <Weekday> at <time> for <N>. We'll show their answer in My reservations.' and never 'Booked'");
  await m.unmount();

  // (c) SLOT_FULL shows the alternatives from the error as chips
  reset();
  routes["POST /api/reserve/concierge"] = turn(timesCard);
  routes["POST /api/reserve/book"] = async () => [409, { ok: false, error: "SLOT_FULL", alternatives: ["19:30", "20:00"] }];
  m = await mountC({ initialMessage: "x" });
  await click(m.host.querySelector('[data-reserve-time="19:00"]'));
  await click(m.host.querySelector('[data-reserve-confirm="1"]'));
  const alts = [...m.host.querySelectorAll("[data-reserve-time]")].map((b) => b.textContent);
  ok(/7:00 PM just filled up/.test(m.host.textContent) && alts.includes("7:30 PM") && alts.includes("8:00 PM") && !/Booked/.test(m.host.textContent), "SLOT_FULL: 'just filled up' plus the server's alternative times as chips");
  await m.unmount();

  // (d) handoff: a link, the finish-on-OpenTable note, never 'Booked'; the tap is logged
  reset();
  const goUrl = `/api/reserve/go?placeId=partner-1&date=${DAY}&time=19%3A00&party=4`;
  routes["POST /api/reserve/concierge"] = turn({ type: "handoff", url: goUrl, label: "Open Mario's on OpenTable", sentTime: "19:00" }, "Mario's books through OpenTable.");
  m = await mountC({ initialMessage: "x" });
  const go = m.host.querySelector("[data-reserve-go]");
  ok(!!go && go.tagName === "A" && go.getAttribute("href") === goUrl && go.getAttribute("target") === "_blank" && /noopener/.test(go.getAttribute("rel")) && go.textContent === "Open Mario's on OpenTable", "handoff card: link to card.url, target _blank, rel noopener, labelled card.label");
  ok(/You'll finish on OpenTable\. Wayfind hasn't booked this yet\./.test(m.host.textContent) && !/Booked/.test(m.host.textContent) && !/booked at|You're booked/i.test(m.host.textContent), "handoff card never says Booked and carries the finish-on-OpenTable note");
  ok(!/opentable\.com/i.test(m.host.innerHTML), "the client never builds an OpenTable address");
  go.addEventListener("click", (e) => e.preventDefault());
  await click(go);
  const hand = JSON.parse(localStorage.getItem("wf_reserve_handoffs") || "[]");
  ok(hand.length === 1 && hand[0].placeId === "partner-1" && hand[0].time === "19:00" && hand[0].party === 4, "tapping the handoff link logs it to wf_reserve_handoffs");
  await m.unmount();

  // (e) profile card: save checkbox (checked), PUT /api/reserve/profile, then the turn is resent
  reset();
  let first = true;
  routes["POST /api/reserve/concierge"] = async () => (first ? ((first = false), [200, { ok: true, say: "What name should I use?", state: STATE, card: { type: "profile", needs: ["name"] } }]) : [200, { ok: true, say: "Thanks. Here are times.", state: STATE, card: timesCard, profile: { display: "Gabe P." } }]);
  routes["PUT /api/reserve/profile"] = async (b) => [200, { ok: true, profile: { firstName: b.firstName } }];
  m = await mountC({ initialMessage: "x" });
  const save = m.host.querySelector("[data-reserve-save-name]");
  ok(!!save && save.checked && /Save for future bookings/.test(m.host.textContent) && !!m.host.querySelector("#wf-rc-first") && !!m.host.querySelector("#wf-rc-last") && !!m.host.querySelector("#wf-rc-phone"), "profile card: first, last, optional mobile and a checked 'Save for future bookings'");
  await setVal(m.host.querySelector("#wf-rc-first"), "Gabe"); await setVal(m.host.querySelector("#wf-rc-last"), "Pereira");
  await submit(m.host.querySelector('[data-reserve-card="profile"]'));
  const put = callsTo("PUT", "/api/reserve/profile")[0];
  ok(!!put && put.body.firstName === "Gabe" && put.body.lastName === "Pereira" && put.body.consent === true, "submitting PUTs the profile with consent:true");
  ok(callsTo("POST", "/api/reserve/concierge").length === 2 && !!m.host.querySelector("[data-reserve-time]"), "…then the last turn is resent");
  await m.unmount();
  // unchecked: nothing saved, the name rides the one booking
  reset(); first = true;
  routes["POST /api/reserve/concierge"] = async () => (first ? ((first = false), [200, { ok: true, say: "Name?", state: STATE, card: { type: "profile" } }]) : [200, { ok: true, say: "ok", state: STATE, card: timesCard }]);
  routes["POST /api/reserve/book"] = async () => [201, { ok: true, booking: { id: "b3", status: "confirmed", confirmationCode: "ZZ9", date: DAY, time: "19:00", partySize: 4 } }];
  m = await mountC({ initialMessage: "x" });
  await setVal(m.host.querySelector("#wf-rc-first"), "Sam");
  await click(m.host.querySelector("[data-reserve-save-name]"));
  await submit(m.host.querySelector('[data-reserve-card="profile"]'));
  await click(m.host.querySelector('[data-reserve-time="19:00"]'));
  await click(m.host.querySelector('[data-reserve-confirm="1"]'));
  ok(callsTo("PUT", "/api/reserve/profile").length === 0 && callsTo("POST", "/api/reserve/book")[0].body.guestName === "Sam", "Save unchecked: no profile PUT, the name travels once with the booking");
  await m.unmount();

  // (f) signin card opens the shell's own sign in; choose and alternatives chips resend with the chosen place
  reset();
  routes["POST /api/reserve/concierge"] = turn({ type: "signin" }, "Sign in to book.");
  const door = document.createElement("button"); door.className = "wf-signin-button"; let door_clicks = 0; door.addEventListener("click", () => { door_clicks++; }); document.body.appendChild(door);
  m = await mountC({ initialMessage: "x" });
  ok(!!bt(m, "Sign in to book"), "signin card has a 'Sign in to book' button");
  const writes = []; const origSet = w.Storage.prototype.setItem;
  w.Storage.prototype.setItem = function (k, v) { if (k === "wf_reserve_pending_v1") writes.push(JSON.parse(v)); return origSet.call(this, k, v); };
  await click(bt(m, "Sign in to book"));
  w.Storage.prototype.setItem = origSet;
  ok(door_clicks === 1, "…which uses the site's own sign in door (.wf-signin-button)");
  const pend = writes[0] || null; // (the test session is already signed in, so the card's own listener clears it at once; real signed out visitors keep it until sign in)
  sessionStorage.setItem("wf_reserve_pending_v1", JSON.stringify({ placeId: "partner-1", name: "Mario's Trattoria", t: Date.now() }));
  ok(!!pend && pend.placeId === "partner-1" && pend.name === "Mario's Trattoria" && !("note" in pend), "tapping Sign in to book saves the pending intent {placeId, name} in sessionStorage (survives a full page OAuth redirect)");
  await m.unmount();
  { // after a redirect: no sheet open, a session exists, the home shell calls resumeReserveIntent -> the sheet reopens on the same restaurant, once
    const ro = await loadComponent(path.join(ROOT, "lib/reserveOpen.js"), ROOT);
    routes["POST /api/reserve/concierge"] = turn(null, "Sure.");
    ok(ro.resumeReserveIntent() === true, "resumeReserveIntent reopens the sheet from the saved intent");
    await settle(200);
    const dlg2 = document.querySelector('[role="dialog"]');
    ok(!!dlg2 && !!dlg2.querySelector("[data-reserve-concierge]") && /Mario's Trattoria/.test(dlg2.textContent), "the resumed sheet is the concierge for the same restaurant");
    ok(sessionStorage.getItem("wf_reserve_pending_v1") === null && ro.resumeReserveIntent() === false, "the intent is consumed once, never reopens twice");
    sessionStorage.setItem("wf_reserve_pending_v1", JSON.stringify({ placeId: "partner-1", name: "M", t: Date.now() - 31 * 60 * 1000 }));
    ok(ro.resumeReserveIntent() === false && sessionStorage.getItem("wf_reserve_pending_v1") === null, "a stale intent (over 30 minutes) is dropped, not resumed");
    document.querySelectorAll("[data-reserve-host],[role=dialog]").forEach((x) => x.remove());
  }
  door.remove();
  reset();
  routes["POST /api/reserve/concierge"] = turn({ type: "choose", restaurants: [{ placeId: "r-1", name: "Mario's North", address: "1 Main St" }, { placeId: "r-2", name: "Mario's South", address: "2 Main St" }] }, "Which one?");
  m = await mountC({ initialPlace: null, initialMessage: "mario's" });
  ok(m.host.querySelectorAll("[data-reserve-choose]").length === 2, "choose card renders one chip per restaurant");
  routes["POST /api/reserve/concierge"] = turn(null, "Great.");
  await click(m.host.querySelector('[data-reserve-choose="r-2"]'));
  const cc = callsTo("POST", "/api/reserve/concierge").pop();
  ok(cc.body.context.placeId === "r-2", "choosing a restaurant resends the turn with context.placeId set");
  await m.unmount();
  reset();
  routes["POST /api/reserve/find"] = async () => [200, { ok: true, picks: [] }];
  routes["POST /api/reserve/concierge"] = turn({ type: "alternatives", picks: [{ placeId: "pick-1", name: "Osteria Uno", locality: "Tampa", cuisines: ["Italian"] }] }, "Fully booked. Try these.");
  m = await mountC({ initialMessage: "x" });
  ok(!!m.host.querySelector('[data-reserve-pick="pick-1"]') && callsTo("POST", "/api/reserve/find").length === 0, "alternatives card shows pick chips from the card without another lookup");
  ok(!/Places you can book/.test(m.host.textContent) && /Similar places nearby/.test(m.host.textContent), "suggestions are titled 'Similar places nearby', never 'Places you can book'");
  await m.unmount();
  reset();
  routes["POST /api/reserve/concierge"] = turn({ type: "alternatives", picks: [], contact: { url: "/p/joy-1", label: "Call or visit Joy Bar" } }, "I can't book Joy Bar through Wayfind yet.");
  m = await mountC({ initialMessage: "x" });
  const contactA = m.host.querySelector("[data-reserve-contact]");
  ok(!!contactA && contactA.getAttribute("href") === "/p/joy-1" && contactA.textContent === "Call or visit Joy Bar" && !m.host.querySelector("[data-reserve-pick]"), "a no-provider answer gives the restaurant's own page as a button, and no invented picks");
  await m.unmount();
  reset();
  routes["POST /api/reserve/concierge"] = turn(null, "What day works?");
  m = await mountC({ initialMessage: "x" });
  ok(!m.host.querySelector("[data-reserve-card]") && /What day works\?/.test(m.host.textContent), "a null card is just the assistant bubble");
  await m.unmount();

  // (g) the sheet is a host around the concierge
  reset();
  routes["POST /api/reserve/concierge"] = turn(null, "Sure.");
  await act(async () => { Sheet.showReserveSheet({ id: "partner-1", name: "Mario's" }, { prefill: { date: DAY, time: "19:30", partySize: 4 } }); }); await settle(150);
  const dlg = document.querySelector('[role="dialog"]');
  ok(!!dlg && !!dlg.querySelector("[data-reserve-concierge]") && callsTo("POST", "/api/reserve/concierge").length === 1 && /Table for 4/.test(callsTo("POST", "/api/reserve/concierge")[0].body.messages[0].content), "the sheet hosts the concierge, seeded with the prefill as plain words");
  ok((dlg.querySelector("#wf-reserve-title") || {}).textContent === "Find a table", "a sheet opened without a lane says 'Find a table', never 'Reserve a table'");
  await act(async () => { document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }); await settle(10);
  ok(!document.documentElement.hasAttribute("data-wf-reserve-open"), "closing the sheet brings the Santa dock back");
  document.querySelectorAll("[data-reserve-host],[role=dialog]").forEach((x) => x.remove());

  // (h) My reservations: every status label
  reset();
  const hb = (id, status, extra) => ({ id, status, placeId: "p", partySize: 2, date: DAY, time: "19:00", restaurantName: "R-" + id, ...extra });
  routes["GET /api/reserve/history"] = async () => [200, { ok: true, bookings: [hb("req", "requested"), hb("dec", "declined", { declineReason: "Closed for a private event" }), hb("con", "confirmed", { confirmationCode: "CODE1" }), hb("can", "cancelled"), hb("pro", "proposed", { proposedDate: DAY, proposedTime: "20:00" })] }];
  await act(async () => { History.showReserveHistory(); }); await settle(150);
  const row = (id) => (document.querySelector(`[data-reserve-row="${id}"]`) || { textContent: "" }).textContent;
  ok(/Waiting for the restaurant/.test(row("req")) && !/Booked/.test(row("req")), "history: requested reads 'Waiting for the restaurant'");
  ok(/Declined/.test(row("dec")) && /Closed for a private event/.test(row("dec")), "history: declined reads 'Declined' with the reason");
  ok(/Booked/.test(row("con")) && /CODE1/.test(row("con")) && /Cancelled/.test(row("can")) && /New time offered/.test(row("pro")), "history: confirmed, cancelled and proposed keep their labels");
  document.querySelectorAll("[data-reserve-host],[role=dialog]").forEach((x) => x.remove());

  // (i) the restaurant page: Accept / Decline only on requested rows
  reset();
  const Manage = (await loadComponent(path.join(ROOT, "app/reserve/manage/[token]/ManageClient.js"), ROOT)).default;
  const mb = (id, status) => ({ id, status, date: DAY, time: "19:00", partySize: 2, guestName: "Guest " + id, confirmationCode: "C" + id });
  routes["GET /api/reserve/manage"] = async () => [200, { ok: true, partner: { name: "Mario's" }, today: DAY, bookings: [mb("r1", "requested"), mb("c1", "confirmed")] }];
  routes["POST /api/reserve/manage"] = async () => [200, { ok: true }];
  const mm = await mount(React.createElement(Manage, { token: "tok123" }));
  await settle(80);
  const lis = [...mm.host.querySelectorAll("li")];
  const lab = (li) => [...li.querySelectorAll("button")].map((b) => b.textContent.trim());
  ok(lis.length === 2 && lab(lis[0]).includes("Accept") && lab(lis[0]).includes("Decline") && !lab(lis[1]).includes("Accept") && !lab(lis[1]).includes("Decline"), "manage: Accept and Decline appear on the requested row only");
  await click([...lis[0].querySelectorAll("button")].find((b) => b.textContent === "Accept"));
  const acc = callsTo("POST", "/api/reserve/manage")[0];
  ok(!!acc && acc.body.token === "tok123" && acc.body.bookingId === "r1" && acc.body.action === "accept", "Accept posts {token, bookingId, action:'accept'} to /api/reserve/manage");
  await click([...mm.host.querySelectorAll("li")[0].querySelectorAll("button")].find((b) => b.textContent === "Decline"));
  await setVal(mm.host.querySelector("#dwhy-r1"), "Full that night");
  await click([...mm.host.querySelectorAll("button")].find((b) => b.textContent === "Send decline"));
  const dec = callsTo("POST", "/api/reserve/manage").pop();
  ok(dec.body.action === "decline" && dec.body.reason === "Full that night", "Decline posts action:'decline' with the optional reason");
  await mm.unmount();

  // (j) source locks
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const boo = strip(fs.readFileSync(path.join(ROOT, "app/components/BooCompanion.js"), "utf8"));
  ok(/const\s+ReserveConcierge\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*["']\.\/ReserveConcierge\.js["']\s*\)\s*\)/.test(boo) && !/^\s*import[^;\n]*ReserveConcierge/m.test(boo) && /<ReserveConcierge[\s/>]/.test(boo) && /<ReservePicks[\s/>]/.test(boo), "BooCompanion loads ReserveConcierge with lazy(import()), never statically, renders it inline, and keeps the pick chips");
}


if (failures.length) {
  console.error("test-reserve-ui: FAIL");
  failures.forEach((f) => console.error("  FAIL: " + f));
  process.exit(1);
}
console.log(`test-reserve-ui: OK — ${pass} assertions`);
process.exit(0);
