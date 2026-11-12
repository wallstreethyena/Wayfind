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
let partnersBody = { ok: true, placeIds: ["partner-1"] };
let partnersFails = false;
const jsonRes = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const routes = {}; // "POST /api/reserve/book" -> async (body, init) => [status, json]
globalThis.fetch = async (url, init) => {
  const u = String(url);
  const method = (init && init.method) || "GET";
  let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) {}
  calls.push({ url: u, method, body });
  if (u.startsWith("/api/reserve/partners")) { if (partnersFails) throw new Error("offline"); return jsonRes(200, partnersBody); }
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
  { const sheetSrc = fs.readFileSync(path.join(ROOT, "app/components/ReserveSheet.js"), "utf8"); ok(/You're booked\./.test(sheetSrc) && !/Request sent|will answer here|wait for|waiting for the restaurant/i.test(sheetSrc), "the sheet says \"You're booked.\" and no longer talks about a request or waiting on the restaurant"); }
  await m.unmount();
}

// ── 1c. Signed out: the site's own sign in prompt, never a second one ───────
{
  const Sheet = await loadComponent(path.join(ROOT, "app/components/ReserveSheet.js"), ROOT);
  const hasDialog = () => !!document.querySelector('[role="dialog"]');
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 150)); });
  document.querySelectorAll("[data-reserve-host]").forEach((n) => n.remove()); // sheets opened by the earlier card taps
  document.querySelectorAll('[role="dialog"]').forEach((n) => n.remove());
  // (a) with the shell's header Sign in button present, the sheet opens the shell's sign in and stays hidden
  const door = document.createElement("button"); door.className = "wf-signin-button"; let clicks = 0; door.addEventListener("click", () => { clicks++; }); document.body.appendChild(door);
  await act(async () => { Sheet.showReserveSheet({ id: "partner-1", name: "Mario's" }, {}); }); await settle();
  ok(clicks === 1 && !hasDialog(), `signed out with the shell present: clicks the shell's own Sign in button once (clicks=${clicks}) and shows no second dialog`);
  const toast = document.getElementById("wf-like-feedback");
  ok(!!toast && toast.textContent === "Sign in to book a table", "…and says 'Sign in to book a table'");
  door.remove();
  // (b) no shell on this surface: the sheet itself says it, with a way to the site
  document.querySelectorAll("[data-reserve-host]").forEach((n) => n.remove());
  await act(async () => { Sheet.showReserveSheet({ id: "partner-1", name: "Mario's" }, {}); }); await settle();
  const dlg = document.querySelector('[role="dialog"]');
  ok(!!dlg && dlg.getAttribute("aria-modal") === "true" && /Sign in to book a table/.test(dlg.textContent) && !!dlg.querySelector('a[href="/"]'), "no shell: a modal dialog says 'Sign in to book a table' with a link to Wayfind");
  ok(!!dlg && !!dlg.querySelector('button[aria-label="Close"]'), "…with a Close button");
  await act(async () => { document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }); await settle();
  ok(!hasDialog(), "Escape closes the sheet");
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
  ok(JSON.parse(sessionStorage.getItem("wf_reserve_partners_v1")).ids.includes("partner-1"), "…and writes the 5 minute sessionStorage cache");
  const fresh2 = await loadComponent(path.join(ROOT, "lib/reservePartners.js"), ROOT);
  const b = await fresh2.loadReservePartners();
  ok(b.has("partner-1") && calls.length === n0 + 1, "a new page load within 5 minutes reads sessionStorage and does not fetch");
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
  ok(/useReservePartner\(\s*cta\s*\?\s*null/.test(card), "the card only subscribes to partner status when the caller left the cta slot free");
  const staticImports = (src) => [...src.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  ok(!staticImports(card).some((x) => /ReserveCta|ReserveSheet|reserveClientApi|reservePartners|reserveOpen/.test(x)), "the card statically imports only lib/reserveClient.js: button, sheet, API, loader and opener are lazy chunks (homepage JS budget)");
  ok(!/\blazy\(|\bSuspense\b|import\(\s*["']\.\/ReserveCta/.test(card) && /ReserveSlot\s*\?\s*<ReserveSlot\s+place=/.test(card), "the card has no lazy(), no Suspense and no import() for the button: the hook hands it the slot component");
  const partnersSrc = read("lib/reservePartners.js");
  ok(/import\s+ReserveCtaSlot\s+from\s+["']\.\.\/app\/components\/ReserveCta\.js["']/.test(partnersSrc) && /export\s*\{\s*ReserveCtaSlot\s*\}/.test(partnersSrc), "the button slot rides inside the lazy partners chunk (one async chunk, not two)");
  const client = read("lib/reserveClient.js");
  ok(!staticImports(client).some((x) => /reservePartners|reserveClientApi|reserveOpen/.test(x)) && /import\(\s*["']\.\/reservePartners\.js["']\s*\)/.test(client), "reserveClient (eager) reaches the partner loader only by dynamic import");
  ok(/import\(\s*["']\.\.\/app\/components\/ReserveSheet\.js["']\s*\)/.test(read("lib/reserveOpen.js")) && !staticImports(read("lib/reserveOpen.js")).some((x) => /ReserveSheet/.test(x)), "openReserveSheet loads the sheet with a dynamic import, never a static one");
  const home = readFileSync(path.join(ROOT, "app/home.js"), "utf8");
  ok(/className="wf-signin-button"/.test(home) && /querySelector\(\s*["']\.wf-signin-button["']\s*\)/.test(read("app/components/ReserveSheet.js")), "the shell's header Sign in button still carries .wf-signin-button, the door the sheet uses");
  ok(!staticImports(read("app/components/sheets/Detail.js")).some((x) => /ReserveSheet/.test(x)), "Detail.js never statically imports the sheet");
}

// ── 8. The sheet, signed in, against a mocked server: it books for real or it says nothing ─────
{
  const rc = await loadComponent(path.join(ROOT, "lib/reserveClientApi.js"), ROOT);
  const { siteTodayStr } = await loadComponent(path.join(ROOT, "lib/siteTime.js"), ROOT);
  const Sheet = await loadComponent(path.join(ROOT, "app/components/ReserveSheet.js"), ROOT);
  const DAY = rc.addDaysIso(siteTodayStr(), 3);
  // a seeded local session: supabase-js reads it from localStorage and never calls the network
  localStorage.setItem("sb-e2eplaceholder-auth-token", JSON.stringify({ access_token: "tok", refresh_token: "ref", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", user_metadata: { full_name: "Gabe Test" } } }));
  const settle = (ms = 80) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
  const dlg = () => document.querySelector('[role="dialog"]');
  const text = () => (dlg() ? dlg().textContent : "");
  const btn = (label) => [...(dlg() ? dlg().querySelectorAll("button") : [])].find((b) => (b.textContent || "").trim() === label);
  const click = async (el) => { await act(async () => { el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })); }); await settle(); };
  const setVal = async (el, v) => {
    const proto = el.tagName === "SELECT" ? w.HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    await act(async () => { el.dispatchEvent(new w.Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  };
  const closeSheet = async () => { await act(async () => { document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }); await settle(10); document.querySelectorAll("[data-reserve-host],[role=dialog]").forEach((n) => n.remove()); };
  const open = async () => { await act(async () => { Sheet.showReserveSheet({ id: "partner-1", name: "Mario's" }, {}); }); await settle(150); };
  const SLOTS = ["18:00", "18:30", "19:30"];
  const booking = (o) => ({ id: "22222222-2222-4222-8222-000000000000", confirmationCode: "K7M2QX", status: "confirmed", placeId: "partner-1", partySize: 2, date: DAY, time: "19:30", restaurantName: "Mario's Trattoria", restaurantPhone: "(941) 555-0100", ...o });
  const reset = () => { for (const k of Object.keys(routes)) delete routes[k]; calls.length = 0; routes["GET /api/reserve/mine"] = async () => [200, { ok: true, bookings: [] }]; routes["GET /api/reserve/slots"] = async () => [200, { ok: true, slots: SLOTS, phone: "(941) 555-0100", maxParty: 12 }]; };
  const bookCalls = () => calls.filter((c) => c.method === "POST" && c.url === "/api/reserve/book");
  // form -> summary, the path every flow below shares
  async function toSummary() {
    await click(btn("Use a form instead"));
    await setVal(dlg().querySelector("#wf-reserve-date"), DAY); await settle();
    await setVal(dlg().querySelector("#wf-reserve-time"), "19:30");
    await setVal(dlg().querySelector("#wf-reserve-name"), "Gabe");
    await click(btn("Review booking"));
  }

  // (a) form: times come ONLY from the server; summary; phone hidden until the switch; one tap to book
  reset(); await open();
  ok(!!dlg().querySelector("#wf-reserve-msg") && /How many people/.test(text()), "signed in with no booking: the chat opens");
  await click(btn("Use a form instead"));
  await setVal(dlg().querySelector("#wf-reserve-date"), DAY); await settle();
  const sl = calls.filter((c) => c.url.startsWith("/api/reserve/slots"));
  ok(sl.length >= 1 && sl[sl.length - 1].url === `/api/reserve/slots?placeId=partner-1&date=${DAY}&party=2`, "choosing a day asks /api/reserve/slots for that place, day and party: " + (sl[sl.length - 1] || {}).url);
  const opts = [...dlg().querySelectorAll("#wf-reserve-time option")].filter((o) => o.value).map((o) => o.value);
  ok(JSON.stringify(opts) === JSON.stringify(SLOTS), "the time list is exactly the server's open times, nothing made up: " + opts.join());
  ok(w.document.querySelector("#wf-reserve-name").value === "Gabe", "the name is prefilled from the account's first name");
  await setVal(dlg().querySelector("#wf-reserve-time"), "19:30");
  await click(btn("Review booking"));
  ok(!!btn("Book table") && !!dlg().querySelector("[data-reserve-summary]") && /4 people|2 people/.test(text()) && /Open at 7:30 PM/.test(text()), "the summary shows the booking, 'Open at 7:30 PM' and a Book table button");
  ok(!/You're booked/.test(text()) && !/Request sent/.test(text()), "the summary does not claim a booking");
  const sw = dlg().querySelector("[data-reserve-share]");
  ok(!!sw && sw.getAttribute("role") === "switch" && sw.checked === false && !dlg().querySelector('input[type="tel"]') && /Share my phone with Mario's so they can reach me/.test(text()), "phone sharing is an OFF switch and no phone box is shown");
  await click(sw);
  ok(!!dlg().querySelector('input[type="tel"]'), "turning the switch on reveals the phone box");
  await click(dlg().querySelector("[data-reserve-share]"));
  ok(!dlg().querySelector('input[type="tel"]'), "turning it off hides the box again");
  let release; const gate = new Promise((r) => { release = r; });
  routes["POST /api/reserve/book"] = async () => { await gate; return [201, { ok: true, booking: booking({ partySize: 2 }) }]; };
  await click(btn("Book table"));
  ok(bookCalls().length === 1 && !/You're booked/.test(text()) && /Booking/.test(text()), "while the request is in flight the sheet says Booking and does NOT say 'You're booked'");
  const b1 = bookCalls()[0].body;
  ok(b1.placeId === "partner-1" && b1.partySize === 2 && b1.date === DAY && b1.time === "19:30" && b1.guestName === "Gabe" && /^[0-9a-f-]{36}$/.test(b1.idempotencyKey), "the request carries place, party, day, time, name and an idempotency key");
  ok(!("phone" in b1) && !("phoneConsent" in b1), "with the switch off the request has no phone and no consent");
  release(); await settle(120);
  ok(/You're booked\./.test(text()) && !!dlg().querySelector('[data-reserve-status="confirmed"]') && /K7M2QX/.test(dlg().querySelector("[data-reserve-code]").textContent), "after the 201 (and only then): You're booked. with the confirmation code");
  ok(/Running late\? Call \(941\) 555-0100\./.test(text()) && !!btn("Add to calendar") && !!btn("Cancel booking"), "the restaurant phone line, Add to calendar and Cancel booking are offered");
  routes["POST /api/reserve/cancel"] = async () => [200, { ok: true, booking: booking({ status: "cancelled" }) }];
  await click(btn("Cancel booking"));
  ok(/Cancel this table\?/.test(text()) && !!btn("Yes, cancel it") && !!btn("Keep my table") && !calls.some((c) => c.url === "/api/reserve/cancel"), "Cancel booking asks once before anything is sent");
  await click(btn("Keep my table"));
  ok(!!btn("Cancel booking") && !calls.some((c) => c.url === "/api/reserve/cancel"), "Keep my table sends nothing");
  await click(btn("Cancel booking")); await click(btn("Yes, cancel it"));
  ok(!!dlg().querySelector('[data-reserve-status="cancelled"]') && /Your table is cancelled\./.test(text()) && calls.some((c) => c.url === "/api/reserve/cancel" && c.body.bookingId === booking().id), "cancelling shows Your table is cancelled. only after the server answered");
  await closeSheet();

  // (b) not confirmed: never 'booked', the SAME key on retry
  reset(); await open(); await toSummary();
  routes["POST /api/reserve/book"] = async () => [503, { ok: false, error: "BOOKING_NOT_CONFIRMED", message: "We could not confirm your table. Nothing was booked." }];
  await click(btn("Book table"));
  ok(!/You're booked/.test(text()) && /Nothing was booked/.test(text()) && !!btn("Book table"), "a 503 shows the server's message, no booking, and the Book table button stays");
  routes["POST /api/reserve/book"] = async () => [201, { ok: true, booking: booking() }];
  await click(btn("Book table"));
  const [f1, f2] = bookCalls().map((c) => c.body.idempotencyKey);
  ok(bookCalls().length === 2 && f1 === f2 && /You're booked\./.test(text()), "the retry reuses the same idempotency key (it can never book twice) and then shows the booking");
  await closeSheet();

  // (c) the slot filled up: alternatives, one tap, a NEW key
  reset(); await open(); await toSummary();
  routes["POST /api/reserve/book"] = async () => [409, { ok: false, error: "SLOT_FULL", message: "7:30 PM just filled up.", alternatives: ["18:30", "20:00"] }];
  await click(btn("Book table"));
  const alts = [...dlg().querySelectorAll("[data-reserve-alt]")];
  ok(!/You're booked/.test(text()) && /7:30 PM just filled up\./.test(text()) && alts.map((a) => a.getAttribute("data-reserve-alt")).join() === "18:30,20:00" && alts.map((a) => a.textContent).join() === "6:30 PM,8:00 PM", "a 409 shows 'just filled up' and the server's alternatives as chips, with no booking");
  routes["POST /api/reserve/book"] = async () => [201, { ok: true, booking: booking({ time: "20:00" }) }];
  await click(alts[1]);
  const c = bookCalls();
  ok(c.length === 2 && c[1].body.time === "20:00" && c[1].body.idempotencyKey !== c[0].body.idempotencyKey && /You're booked\./.test(text()) && /8:00 PM/.test(text()), "tapping a chip books THAT time with a new idempotency key");
  await closeSheet();

  // (d) phone only with consent
  reset(); await open(); await toSummary();
  await click(dlg().querySelector("[data-reserve-share]"));
  await setVal(dlg().querySelector("#wf-reserve-phone"), "12");
  await click(btn("Book table"));
  ok(bookCalls().length === 0 && /10 digits/.test(text()), "sharing on with a bad number is stopped in the sheet: nothing is sent");
  routes["POST /api/reserve/book"] = async () => [201, { ok: true, booking: booking() }];
  await setVal(dlg().querySelector("#wf-reserve-phone"), "941-555-0199");
  await click(btn("Book table"));
  const pb = bookCalls()[0] && bookCalls()[0].body;
  ok(!!pb && pb.phone === "(941) 555-0199" && pb.phoneConsent === true, "sharing on with a good number sends the formatted phone AND phoneConsent true");
  ok(!/555-0199/.test(text()), "the guest's own number is not echoed back in the booked view");
  await closeSheet();

  // (e) chat: only a verified, complete turn becomes a summary
  reset();
  routes["POST /api/reserve-chat"] = async () => [200, { ok: true, reply: "Got it.", draft: { partySize: 4, date: DAY, time: "19:30", guestName: "Gabe", note: null }, complete: true, verified: false }];
  await open();
  await setVal(dlg().querySelector("#wf-reserve-msg"), "4 on saturday at 7:30"); await click(dlg().querySelector('button[type="submit"]'));
  ok(!!dlg().querySelector("#wf-reserve-msg") && !btn("Book table"), "a complete but UNVERIFIED chat turn never reaches the summary");
  routes["POST /api/reserve-chat"] = async () => [200, { ok: true, reply: "Got it.", draft: { partySize: 4, date: DAY, time: "19:30", guestName: "Gabe", note: null }, complete: true, verified: true }];
  await setVal(dlg().querySelector("#wf-reserve-msg"), "yes"); await click(dlg().querySelector('button[type="submit"]'));
  ok(!!btn("Book table") && /4 people/.test(text()) && /Open at 7:30 PM/.test(text()), "a verified, complete chat turn shows the summary with the open time");
  const chatCalls = calls.filter((x) => x.url === "/api/reserve-chat");
  ok(chatCalls.length === 2 && chatCalls[1].body.draft && chatCalls[1].body.draft.date === DAY && chatCalls[1].body.draft.partySize === 4 && chatCalls[1].body.messages.every((m) => !m.local), "the second chat turn carries the day and party so the server can read real open times; the local greeting is not sent");
  await closeSheet();
  reset(); routes["POST /api/reserve-chat"] = async () => [200, { ok: true, fallback: "form", reason: "availability_unavailable" }];
  await open(); await setVal(dlg().querySelector("#wf-reserve-msg"), "hi"); await click(dlg().querySelector('button[type="submit"]'));
  ok(!!dlg().querySelector("#wf-reserve-date") && /Fill this in instead/.test(text()), "a form fallback from the server opens the form");
  await closeSheet();

  // (f) an existing booking: shown from the server's row; a proposal can be accepted or declined
  reset(); routes["GET /api/reserve/mine"] = async () => [200, { ok: true, bookings: [booking()] }];
  await open();
  ok(!!dlg().querySelector('[data-reserve-status="confirmed"]') && /K7M2QX/.test(text()), "an existing confirmed booking opens straight to its confirmation");
  await closeSheet();
  reset(); routes["GET /api/reserve/mine"] = async () => [200, { ok: true, bookings: [booking({ status: "proposed", proposedDate: DAY, proposedTime: "20:00" })] }];
  routes["POST /api/reserve/proposal"] = async (b) => [200, { ok: true, booking: booking(b.accept ? { time: "20:00" } : { status: "cancelled" }) }];
  await open();
  ok(/Mario's asked to move your table to 8:00 PM/.test(text()) && !!btn("Accept new time") && !!btn("Keep looking") && /Keep looking cancels your current table\./.test(text()), "a proposal reads '{name} asked to move your table to {time}' with Accept new time / Keep looking, and says declining cancels");
  ok(!calls.some((x) => x.url === "/api/reserve/proposal"), "nothing is sent until the guest chooses");
  await click(btn("Accept new time"));
  ok(calls.some((x) => x.url === "/api/reserve/proposal" && x.body.accept === true) && /You're booked\./.test(text()) && /8:00 PM/.test(text()), "Accept new time sends accept:true and shows the moved booking");
  await closeSheet();
  reset(); routes["GET /api/reserve/mine"] = async () => [200, { ok: true, bookings: [booking({ status: "proposed", proposedDate: DAY, proposedTime: "20:00" })] }];
  routes["POST /api/reserve/proposal"] = async () => [200, { ok: true, booking: booking({ status: "cancelled" }) }];
  await open(); await click(btn("Keep looking"));
  ok(calls.some((x) => x.url === "/api/reserve/proposal" && x.body.accept === false) && /Your table is cancelled\./.test(text()) && !!btn("Find another time"), "Keep looking sends accept:false and shows the table cancelled");
  await closeSheet();
}

if (failures.length) {
  console.error("test-reserve-ui: FAIL");
  failures.forEach((f) => console.error("  FAIL: " + f));
  process.exit(1);
}
console.log(`test-reserve-ui: OK — ${pass} assertions`);
process.exit(0);
