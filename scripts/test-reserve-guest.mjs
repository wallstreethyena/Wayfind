#!/usr/bin/env node
/**
 * test-reserve-guest — the guest side of Reserve v2, proven by RENDERING (jsdom + React 18 createRoot, mocked fetch).
 *
 * Covers: the Wayfind confirmation card, the OpenTable handoff (no times, no "booked", a /api/reserve/go link),
 * the "none" state, saved profile reuse (no name question), the name question when no profile exists (collected in a
 * structured input that posts to /api/reserve/profile, never into the chat model), similar picks, My reservations,
 * the Booking profile editor, the Santa and Boo table chips, and the 44px tap target rule on every state.
 * Nothing touches the network, Supabase or the live site. NODE_ENV is pinned to "test" before react loads (act() throws in production).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://e2eplaceholder.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "e2e-placeholder-anon-key-not-real";
process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY = "e2e-placeholder-not-a-real-key";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0; const failures = [];
const ok = (c, m) => { pass++; if (!c) failures.push(m); };

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: "https://gowayfind.com/", pretendToBeVisual: true });
const w = dom.window;
const defineGlobal = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
for (const k of ["window", "document", "HTMLElement", "Node", "Event", "CustomEvent", "MouseEvent", "KeyboardEvent", "sessionStorage", "localStorage", "getComputedStyle"]) defineGlobal(k, w[k]);
defineGlobal("navigator", w.navigator);
defineGlobal("requestAnimationFrame", w.requestAnimationFrame.bind(w));
defineGlobal("cancelAnimationFrame", w.cancelAnimationFrame.bind(w));
defineGlobal("IS_REACT_ACT_ENVIRONMENT", true);
defineGlobal("BroadcastChannel", undefined);

const calls = [];
const routes = {};
const jsonRes = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
globalThis.fetch = async (url, init) => {
  const u = String(url);
  const method = (init && init.method) || "GET";
  let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) {}
  calls.push({ url: u, method, body });
  const key = method + " " + u.split("?")[0];
  if (routes[key]) { const [status, json] = await routes[key](body, u); return jsonRes(status, json); }
  return jsonRes(404, { ok: false, error: "NOT_MOCKED", message: "not mocked" });
};

process.env.NODE_ENV = "test";
const React = (await import("react")).default;
const act = React.act;
const { createRoot } = await import("react-dom/client");
const { loadComponent } = await import("./lib/jsxLoad.mjs");

const rc = await loadComponent(path.join(ROOT, "lib/reserveClientApi.js"), ROOT);
const { siteTodayStr } = await loadComponent(path.join(ROOT, "lib/siteTime.js"), ROOT);
const Sheet = await loadComponent(path.join(ROOT, "app/components/ReserveSheet.js"), ROOT);
const History = await loadComponent(path.join(ROOT, "app/components/ReserveHistory.js"), ROOT);
const Profile = await loadComponent(path.join(ROOT, "app/components/ReserveProfile.js"), ROOT);
const Picks = (await loadComponent(path.join(ROOT, "app/components/ReservePicks.js"), ROOT)).default;

const DAY = rc.addDaysIso(siteTodayStr(), 3);
localStorage.setItem("sb-e2eplaceholder-auth-token", JSON.stringify({ access_token: "tok", refresh_token: "ref", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", user_metadata: { full_name: "Gabe Test" } } }));

const settle = (ms = 80) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const dlg = () => document.querySelector('[role="dialog"]');
const text = () => (dlg() ? dlg().textContent : "");
const btn = (label) => [...(dlg() ? dlg().querySelectorAll("button") : [])].find((b) => (b.textContent || "").trim() === label);
const click = async (el) => { await act(async () => { el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })); }); await settle(); };
const setVal = async (el, v) => {
  const proto = el.tagName === "SELECT" ? w.HTMLSelectElement.prototype : w.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
  await act(async () => { el.dispatchEvent(new w.Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
};
const setCheck = async (el, v) => { if (el.checked !== v) await click(el); };
const submit = async (form) => { await act(async () => { form.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true })); }); await settle(); };
const closeAll = async () => { await act(async () => { document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }); await settle(10); document.querySelectorAll("[data-reserve-host],[role=dialog]").forEach((n) => n.remove()); };
const open = async (place, opts) => { await act(async () => { Sheet.showReserveSheet(place || { id: "partner-1", name: "Mario's" }, opts || {}); }); await settle(180); };
// Mobile rule: every tap target in the dialog is at least 44px tall (inline min height or height).
const smallTargets = () => [...dlg().querySelectorAll("button, a, select, input:not([type=checkbox])")].filter((el) => {
  const st = el.style; const h = parseFloat(st.minHeight || st.height || "0");
  return !(h >= 44) && !(el.type === "checkbox");
}).map((el) => (el.textContent || el.id || el.tagName).slice(0, 24));
const noSideways = () => !dlg() || ![...dlg().querySelectorAll("*")].some((el) => /^\d+px$/.test(el.style.width || "") && parseInt(el.style.width, 10) > 390);

const booking = (o) => ({ id: "22222222-2222-4222-8222-000000000000", confirmationCode: "K7M2QX", status: "confirmed", placeId: "partner-1", partySize: 4, date: DAY, time: "19:15", restaurantName: "Mario's Trattoria", restaurantPhone: "(941) 555-0100", ...o });
const PATH = (p, extra) => async () => [200, { ok: true, path: p, restaurant: { placeId: "x", name: "X", phone: "(813) 555-0142" }, ...extra }];
const reset = (over = {}) => {
  for (const k of Object.keys(routes)) delete routes[k];
  calls.length = 0; localStorage.removeItem("wf_trips_v1"); localStorage.removeItem("wf_reserve_handoffs");
  routes["GET /api/reserve/path"] = PATH("wayfind");
  routes["GET /api/reserve/profile"] = async () => [200, { ok: true, profile: { firstName: "Gabriel", lastName: "Pereira", defaultPartySize: 4 } }];
  routes["GET /api/reserve/mine"] = async () => [200, { ok: true, bookings: [] }];
  routes["GET /api/reserve/slots"] = async () => [200, { ok: true, slots: ["18:00", "19:30"], phone: "(941) 555-0100", maxParty: 12 }];
  routes["POST /api/reserve/find"] = async () => [200, { ok: true, picks: [{ placeId: "pick-1", name: "Osteria Uno", locality: "Tampa", cuisines: ["Italian"], score: 88, path: "wayfind" }, { placeId: "pick-2", name: "Bella Due", locality: "St. Petersburg", cuisines: ["Italian", "Pizza"], score: 84, path: "opentable" }, { placeId: "pick-3", name: "Terzo", locality: "Tampa", cuisines: [], score: 80, path: "wayfind" }] }];
  Object.assign(routes, over);
};
const calls_ = (m, u) => calls.filter((c) => c.method === m && c.url.split("?")[0] === u);

// ── 1-5. The sheet is a host around the concierge (the booking, request and handoff cards are covered in test-reserve-ui) ──
reset();
routes["POST /api/reserve/concierge"] = async () => [200, { ok: true, say: "Sure.", state: { placeId: "ot-1" }, card: { type: "handoff", url: "/api/reserve/go?placeId=ot-1&date=" + DAY + "&time=19%3A30&party=4", label: "Open Ulele on OpenTable" } }];
await open({ id: "ot-1", name: "Ulele" }, { prefill: { date: DAY, time: "19:30", partySize: 4 } });
ok(!!dlg().querySelector("[data-reserve-concierge]") && /Ulele/.test(text()), "the sheet opens the concierge for the place");
{ const go = dlg().querySelector("[data-reserve-go]"); ok(!!go && go.getAttribute("href").startsWith("/api/reserve/go?") && !/Booked/.test(text()) && !/opentable\.com/i.test(dlg().innerHTML), "handoff: a /api/reserve/go link, no OpenTable address built here, never 'Booked'"); }
ok(smallTargets().length === 0 && noSideways(), "concierge in the sheet: 44px tap targets, no sideways scroll (small: " + smallTargets().join() + ")");
await closeAll();
for (let i = 0; i < 25; i++) rc.addHandoff({ placeId: "p" + i, name: "P" + i, date: DAY, time: "19:00", party: 2 });
ok(rc.readHandoffs().length === 20 && rc.readHandoffs()[0].placeId === "p24", "handoffs are capped at 20, newest first");
ok(rc.nearestHalfHour("19:15") === "19:30" && rc.nearestHalfHour("19:10") === "19:00" && rc.nearestHalfHour("23:50") === "23:30" && rc.nearestHalfHour("00:05") === "00:00", "around time rounds to the nearest :00 or :30");

// ── 6. My reservations ───────────────────────────────────────────────────────
reset();
rc.addHandoff({ placeId: "ot-1", name: "Ulele", date: DAY, time: "19:30", party: 4 });
routes["GET /api/reserve/history"] = async () => [200, { ok: true, bookings: [booking(), booking({ id: "b2", status: "proposed", proposedDate: DAY, proposedTime: "20:00", restaurantName: "Joe's" }), booking({ id: "b3", status: "cancelled", date: "2026-01-01", restaurantName: "Old Place" })] }];
routes["POST /api/reserve/cancel"] = async () => [200, { ok: true, booking: booking({ status: "cancelled" }) }];
routes["POST /api/reserve/proposal"] = async () => [200, { ok: true, booking: booking({ id: "b2", time: "20:00", restaurantName: "Joe's" }) }];
await act(async () => { History.showReserveHistory(); }); await settle(150);
ok(!!dlg() && /My reservations/.test(text()) && /Mario's Trattoria/.test(text()) && /Joe's/.test(text()) && /Old Place/.test(text()) && /Code K7M2QX/.test(text()), "history lists the guest's bookings from /api/reserve/history");
ok(/Started on OpenTable/.test(text()) && /Ulele/.test(text()) && !/Ulele[^]*booked/i.test(dlg().querySelector("[data-reserve-handoffs]").textContent), "OpenTable handoffs show as 'Started on OpenTable', never as booked");
ok(!!btn("Accept new time") && !!btn("Keep looking"), "a proposed time can be accepted or declined");
await click(dlg().querySelector("[data-reserve-cancel]"));
ok(/Cancel this table\?/.test(text()) && calls_("POST", "/api/reserve/cancel").length === 0, "Cancel asks once before sending anything");
await click(btn("Yes, cancel it"));
ok(calls_("POST", "/api/reserve/cancel").length === 1 && /Cancelled/.test(dlg().querySelector('[data-reserve-row="22222222-2222-4222-8222-000000000000"]').textContent), "confirming cancels through /api/reserve/cancel and the row says Cancelled");
await click(btn("Accept new time"));
ok(calls_("POST", "/api/reserve/proposal")[0].body.accept === true, "Accept new time posts accept:true");
ok(smallTargets().length === 0 && noSideways(), "history: 44px tap targets, no sideways scroll (small: " + smallTargets().join() + ")");
await closeAll();

// ── 7. Booking profile editor ────────────────────────────────────────────────
reset();
routes["PUT /api/reserve/profile"] = async (b) => [200, { ok: true, profile: { ...b, consentAt: "now" } }];
routes["DELETE /api/reserve/profile"] = async () => [200, { ok: true }];
await act(async () => { Profile.showReserveProfile(); }); await settle(150);
ok(dlg().querySelector("#wf-rp-first").value === "Gabriel" && dlg().querySelector("#wf-rp-last").value === "Pereira" && dlg().querySelector("[data-rp-party]").textContent === "4", "the editor loads the saved profile");
ok(/Save these details and reuse them for future reservations/.test(text()), "the consent text is 'Save these details and reuse them for future reservations'");
await setVal(dlg().querySelector("#wf-rp-email"), "gabe@example.com"); await setVal(dlg().querySelector("#wf-rp-phone"), "941-555-0199");
await submit(dlg().querySelector("[data-reserve-profile-form]"));
ok(calls_("PUT", "/api/reserve/profile").length === 0 && /Tick the box/.test(text()), "Save without the consent box sends nothing");
await setCheck(dlg().querySelector("[data-rp-consent]"), true);
await submit(dlg().querySelector("[data-reserve-profile-form]"));
const pp = calls_("PUT", "/api/reserve/profile")[0];
ok(!!pp && pp.body.firstName === "Gabriel" && pp.body.lastName === "Pereira" && pp.body.preferredEmail === "gabe@example.com" && pp.body.mobilePhone === "+19415550199" && pp.body.defaultPartySize === 4 && pp.body.consent === true, "Save PUTs first, last, preferredEmail, E.164 mobilePhone, party size and consent:true");
ok(smallTargets().length === 0 && noSideways(), "profile editor: 44px tap targets, no sideways scroll (small: " + smallTargets().join() + ")");
await click(dlg().querySelector("[data-rp-delete]"));
ok(calls_("DELETE", "/api/reserve/profile").length === 0, "Delete asks first");
await click(dlg().querySelector("[data-rp-delete-yes]"));
ok(calls_("DELETE", "/api/reserve/profile").length === 1 && dlg().querySelector("#wf-rp-first").value === "" && /deleted/.test(text()), "Delete my booking details calls DELETE and clears the form");
await closeAll();

// ── 8. Santa and Boo table chips ─────────────────────────────────────────────
reset();
{
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  const intent = { query: "", cuisine: "italian", date: DAY, time: "19:00", partySize: 4 };
  await act(async () => { root.render(React.createElement(Picks, { intent, point: { lat: 27.9, lng: -82.5 }, title: "Tables to look at" })); });
  await settle(120);
  const chips = [...host.querySelectorAll("[data-reserve-pick]")];
  const fb = calls_("POST", "/api/reserve/find").pop();
  ok(chips.length === 3 && !!fb && fb.body.cuisine === "italian" && fb.body.date === DAY && fb.body.time === "19:00" && fb.body.party === 4 && fb.body.lat === 27.9 && !("query" in fb.body), "Santa intent chips: up to 3 picks from /api/reserve/find with cuisine, day, time, party and the feed's point (no name, no phone)");
  ok(chips.every((c) => parseFloat(c.style.minHeight) >= 44), "chips are 44px or taller");
  calls.length = 0;
  await click(chips[1]); await settle(200);
  ok(!!dlg() && !!dlg().querySelector("[data-reserve-concierge]") && /Bella Due/.test(text()), "tapping a chip opens the Reserve sheet (concierge) for that place");
  await act(async () => { root.unmount(); }); host.remove();
  await closeAll();
}
{
  const src = fs.readFileSync(path.join(ROOT, "app/components/BooCompanion.js"), "utf8");
  ok(/const ReservePicks = lazy\(\(\) => import\("\.\/ReservePicks\.js"\)\)/.test(src) && !/^import[^\n]*ReservePicks/m.test(src) && /<ReservePicks key=\{reserve\.k\}/.test(src) && /data\.reserve/.test(src), "BooCompanion loads ReservePicks lazily and shows it when the reply carries a table request");
  const acct = fs.readFileSync(path.join(ROOT, "app/components/sheets/Account.js"), "utf8");
  ok(/import\("\.\.\/ReserveHistory\.js"\)/.test(acct) && /import\("\.\.\/ReserveProfile\.js"\)/.test(acct) && !/^import[^\n]*Reserve/m.test(acct), "the account sheet reaches My reservations and Booking profile only by dynamic import");
  const copy = ["ReserveSheet", "ReserveConcierge", "ReserveHistory", "ReserveProfile", "ReservePicks", "reserveUi"].map((f) => fs.readFileSync(path.join(ROOT, "app/components/" + f + ".js"), "utf8")).join("\n");
  const uiText = [...copy.matchAll(/>([^<>{}\n]{12,})</g)].map((m) => m[1]).concat([...copy.matchAll(/"([A-Z][^"\n]{12,})"/g)].map((m) => m[1]));
  ok(uiText.length > 20 && !uiText.some((t) => /[\u2013\u2014]/.test(t)) && !uiText.some((t) => / - /.test(t)), "no long dashes or spaced dashes in the UI copy (" + uiText.length + " strings checked)");
}

if (failures.length) {
  console.error("test-reserve-guest: FAIL");
  failures.forEach((f) => console.error("  FAIL: " + f));
  process.exit(1);
}
console.log(`test-reserve-guest: OK — ${pass} assertions`);
process.exit(0);
