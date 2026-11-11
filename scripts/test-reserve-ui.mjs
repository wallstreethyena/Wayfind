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
 * Needs registering in scripts/guards.txt by the integration step.
 */
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

const calls = [];
let partnersBody = { ok: true, placeIds: ["partner-1"] };
let partnersFails = false;
const jsonRes = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
globalThis.fetch = async (url, init) => {
  const u = String(url);
  calls.push({ url: u, method: (init && init.method) || "GET" });
  if (u.startsWith("/api/reserve/partners")) { if (partnersFails) throw new Error("offline"); return jsonRes(200, partnersBody); }
  return jsonRes(404, { ok: false, error: "NOT_MOCKED", message: "not mocked" });
};

const React = (await import("react")).default;
const { act } = await import("react");
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
  const Cta = (await loadComponent(path.join(ROOT, "app/components/ReserveCta.js"), ROOT)).default;
  let bubbled = 0;
  const m = await mount(React.createElement("div", { onClick: () => { bubbled++; } }, React.createElement(Cta, { place: place("partner-1") })));
  const btn = m.host.querySelector("button");
  await act(async () => { btn.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })); });
  ok(bubbled === 0, "ReserveCta stops propagation on its own, so a tap never reaches whatever wraps it");
  ok(btn.getAttribute("type") === "button" && btn.textContent.trim().startsWith("Reserve a table"), "ReserveCta renders <button type=button> labelled 'Reserve a table'");
  await m.unmount();
}

// ── 2. A non partner card is byte for byte the normal card ───────────────────
{
  const m = await mount(React.createElement(Card, props("other-1")));
  ok(m.host.querySelectorAll("[data-reserve-cta]").length === 0 && !/Reserve a table/.test(m.host.innerHTML), "a non partner card has no Reserve button");
  ok(m.host.querySelectorAll(".wf-place-card-cta").length === 0 && !m.host.querySelector(".wf-place-card").classList.contains("has-cta"), "…no empty slot and no has-cta class");
  const server = renderToStaticMarkup(React.createElement(Card, props("other-1")));
  const clientHtml = m.host.innerHTML;
  // jsdom re-serialises inline styles (colours, spacing) and the live card sets data-wf-live after mount; neither is markup we changed, so structure, classes and text are compared.
  const norm = (s) => s.replace(/<!--.*?-->/g, "").replace(/ data-wf-live="1"/g, "").replace(/ style="[^"]*"/g, "").replace(/&#x27;/g, "'");
  if (norm(clientHtml) !== norm(server)) { let i = 0; const a = norm(clientHtml), b = norm(server); while (a[i] === b[i]) i++; console.error("DIFF at " + i + "\n client: " + a.slice(i - 80, i + 160) + "\n server: " + b.slice(i - 80, i + 160)); }
  ok(norm(clientHtml) === norm(server), "non partner card markup after the partner list arrived equals its plain server markup");
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
  const fresh = await loadComponent(path.join(ROOT, "lib/reserveClient.js"), ROOT);
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
  const fresh = await loadComponent(path.join(ROOT, "lib/reserveClient.js"), ROOT);
  sessionStorage.clear();
  const n0 = calls.length;
  const a = await fresh.loadReservePartners();
  ok(a.has("partner-1") && calls.length === n0 + 1, "first load fetches once and returns the partner ids");
  ok(JSON.parse(sessionStorage.getItem("wf_reserve_partners_v1")).ids.includes("partner-1"), "…and writes the 5 minute sessionStorage cache");
  const fresh2 = await loadComponent(path.join(ROOT, "lib/reserveClient.js"), ROOT);
  const b = await fresh2.loadReservePartners();
  ok(b.has("partner-1") && calls.length === n0 + 1, "a new page load within 5 minutes reads sessionStorage and does not fetch");
}

// ── 6. The form rules mirror the server ──────────────────────────────────────
{
  const rc = await loadComponent(path.join(ROOT, "lib/reserveClient.js"), ROOT);
  const now = new Date("2026-11-11T15:00:00Z");
  const { min, max } = rc.reserveDateRange(now);
  ok(min === "2026-11-11" && max === "2027-01-10", `date range is today through today+60 days Eastern (got ${min}..${max})`);
  ok(rc.reserveDateRange(new Date("2026-11-12T03:00:00Z")).min === "2026-11-11", "…anchored to US Eastern, not UTC (3am UTC on the 12th is still the 11th)");
  const good = { partySize: 4, date: "2026-11-14", time: "19:00", guestName: "Gabe", note: "" };
  ok(rc.validateDraft(good, now) === null, "a good draft validates");
  ok(rc.summaryLine(good) === "4 people · Sat, Nov 14 · 7:00 PM · under Gabe", "summary line reads '4 people · Sat, Nov 14 · 7:00 PM · under Gabe' — got " + rc.summaryLine(good));
  const bad = (o) => rc.validateDraft({ ...good, ...o }, now) !== null;
  ok(bad({ partySize: 0 }) && bad({ partySize: 13 }) && !bad({ partySize: 1 }) && !bad({ partySize: 12 }), "party 1 to 12");
  ok(bad({ date: "2026-11-10" }) && !bad({ date: "2026-11-11" }) && !bad({ date: "2027-01-10" }) && bad({ date: "2027-01-11" }), "date today through +60 days");
  ok(bad({ time: "19:10" }) && !bad({ time: "19:45" }), "time in 15 minute steps");
  ok(bad({ guestName: "" }) && bad({ guestName: "x".repeat(41) }) && !bad({ guestName: "x".repeat(40) }), "name 1 to 40");
  ok(bad({ note: "x".repeat(201) }) && !bad({ note: "x".repeat(200) }), "note max 200");
  const slots = rc.reserveTimeSlots();
  ok(slots.length > 20 && slots.every((s) => /^\d{2}:(00|15|30|45)$/.test(s)), "time slots are all quarter hours");
}

// ── 7. Source locks that a render cannot see ─────────────────────────────────
{
  const { readFileSync } = await import("node:fs");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const card = strip(readFileSync(path.join(ROOT, "app/components/IconicPlaceCard.js"), "utf8"));
  ok(/useReservePartner\(\s*cta\s*\?\s*null/.test(card), "the card only subscribes to partner status when the caller left the cta slot free");
  ok(!/import\s+ReserveSheet|from\s+["'][^"']*ReserveSheet/.test(card) && !/import\s+[^;]*ReserveSheet/.test(strip(readFileSync(path.join(ROOT, "lib/reserveClient.js"), "utf8")).replace(/import\(/g, "")), "the sheet is never statically imported (lazy chunk only)");
  ok(/import\(\s*["']\.\.\/app\/components\/ReserveSheet\.js["']\s*\)/.test(strip(readFileSync(path.join(ROOT, "lib/reserveClient.js"), "utf8"))), "openReserveSheet loads the sheet with a dynamic import");
}

if (failures.length) {
  console.error("test-reserve-ui: FAIL");
  failures.forEach((f) => console.error("  FAIL: " + f));
  process.exit(1);
}
console.log(`test-reserve-ui: OK — ${pass} assertions`);
process.exit(0);
