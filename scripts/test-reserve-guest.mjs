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

// ── 1. Wayfind path: the confirmation card ───────────────────────────────────
reset(); routes["POST /api/reserve/book"] = async () => [201, { ok: true, booking: booking() }];
await open();
ok(!!dlg().querySelector("#wf-reserve-msg") && !/What name should I put/.test(text()), "wayfind with a saved profile opens the chat and never asks for a name");
await click(btn("Use a form instead"));
await setVal(dlg().querySelector("#wf-reserve-date"), DAY); await settle();
await setVal(dlg().querySelector("#wf-reserve-time"), "19:30");
await click(btn("Review booking"));
await click(btn("Book table"));
const bookBody = calls_("POST", "/api/reserve/book")[0] && calls_("POST", "/api/reserve/book")[0].body;
ok(!!bookBody && !("guestName" in bookBody) && bookBody.partySize === 4, "profile reuse: the booking request carries no name (the server fills it from the profile) and the usual party of 4");
ok(/You're booked at 7:15 PM for 4 at Mario's Trattoria\./.test(text()) && /K7M2QX/.test(text()), "confirm card reads \"You're booked at 7:15 PM for 4 at Mario's Trattoria.\" with the confirmation code");
const dir = dlg().querySelector("[data-reserve-directions]");
ok(!!dir && dir.tagName === "A" && /^https:\/\/www\.google\.com\/maps\/dir\//.test(dir.getAttribute("href")) && dir.getAttribute("href").includes("partner-1"), "Directions is a Google Maps link for the place");
ok(!!btn("Add to itinerary") && !!btn("Cancel booking") && !!btn("Add to calendar"), "Add to itinerary, Add to calendar and Cancel booking are offered");
await click(btn("Add to itinerary"));
const trips = JSON.parse(localStorage.getItem("wf_trips_v1") || "{}");
ok(JSON.stringify(trips).includes("partner-1") && /Added to your itinerary/.test(text()), "Add to itinerary files the place into wf_trips_v1");
ok(smallTargets().length === 0 && noSideways(), "confirm card: every tap target is 44px or taller, nothing wider than 390px (small: " + smallTargets().join() + ")");
await closeAll();

// ── 2. Name question when there is no profile ────────────────────────────────
reset({ "GET /api/reserve/profile": async () => [200, { ok: true, profile: null }] });
routes["PUT /api/reserve/profile"] = async (b) => [200, { ok: true, profile: { firstName: b.firstName, defaultPartySize: 2, consentAt: "now" } }];
routes["POST /api/reserve-chat"] = async () => [200, { ok: true, reply: "Got it. What day?", draft: { partySize: 2, date: null, time: null, note: null }, complete: false, verified: false }];
await open();
const nameForm = dlg().querySelector("[data-reserve-name-form]");
ok(/What name should I put the table under\?/.test(text()) && !!nameForm && !!dlg().querySelector("#wf-reserve-first") && !dlg().querySelector("#wf-reserve-msg"), "no profile: Santa style bubble asks \"What name should I put the table under?\" and the answer goes in a structured input, not the chat box");
const save = dlg().querySelector("[data-reserve-save-name]");
ok(!!save && save.checked && /Save for future bookings/.test(text()), "the \"Save for future bookings\" checkbox is there (consent for the save)");
ok(smallTargets().length === 0, "name step: tap targets are 44px or taller (small: " + smallTargets().join() + ")");
await setVal(dlg().querySelector("#wf-reserve-first"), "Gabriel");
await submit(nameForm);
const put = calls_("PUT", "/api/reserve/profile")[0];
ok(!!put && put.body.firstName === "Gabriel" && put.body.consent === true && !("consentAt" in put.body), "saving posts the first name to /api/reserve/profile with consent:true");
ok(!!dlg().querySelector("#wf-reserve-msg") && /Booking as Gabriel/.test(text()), "then the chat opens, labelled 'Booking as Gabriel'");
await setVal(dlg().querySelector("#wf-reserve-msg"), "four on saturday"); await click(dlg().querySelector('button[type="submit"]'));
const chatBodies = calls_("POST", "/api/reserve-chat").map((c) => JSON.stringify(c.body));
ok(chatBodies.length === 1 && !/Gabriel/.test(chatBodies[0]), "the name never goes to the chat model");
await closeAll();
// unchecked: nothing saved, the name rides the one booking request
reset({ "GET /api/reserve/profile": async () => [200, { ok: true, profile: null }] });
routes["POST /api/reserve/book"] = async () => [201, { ok: true, booking: booking() }];
await open();
await setVal(dlg().querySelector("#wf-reserve-first"), "Sam"); await setCheck(dlg().querySelector("[data-reserve-save-name]"), false);
await submit(dlg().querySelector("[data-reserve-name-form]"));
ok(calls_("PUT", "/api/reserve/profile").length === 0 && /Booking as Sam/.test(text()), "with Save unchecked nothing is posted to the profile");
await click(btn("Use a form instead")); await setVal(dlg().querySelector("#wf-reserve-date"), DAY); await settle(); await setVal(dlg().querySelector("#wf-reserve-time"), "19:30");
await click(btn("Review booking")); await click(btn("Book table"));
ok(calls_("POST", "/api/reserve/book")[0].body.guestName === "Sam", "…and the name travels only in that booking request");
await closeAll();

// ── 3. OpenTable handoff ─────────────────────────────────────────────────────
reset({ "GET /api/reserve/path": PATH("opentable") });
await open({ id: "ot-1", name: "Ulele" }, { prefill: { date: DAY, time: "19:30", partySize: 4 } });
const otText = text();
const go = dlg().querySelector("[data-reserve-go]");
ok(/I can take you directly to Ulele on OpenTable for /.test(otText) && /around 7:30 PM for 4\./.test(otText), "handoff copy: 'I can take you directly to Ulele on OpenTable for <day> around 7:30 PM for 4.'");
ok(!!go && go.textContent.trim() === "Open Ulele on OpenTable", "the button reads 'Open Ulele on OpenTable'");
const gu = go && new URL(go.getAttribute("href"), "https://gowayfind.com");
ok(!!gu && gu.pathname === "/api/reserve/go" && gu.searchParams.get("placeId") === "ot-1" && gu.searchParams.get("date") === DAY && gu.searchParams.get("time") === "19:30" && gu.searchParams.get("party") === "4" && go.getAttribute("target") === "_blank", "the button href is /api/reserve/go with placeId, date, time and party (new tab)");
ok(!/opentable\.com/i.test(dlg().innerHTML), "the client never builds an OpenTable address");
ok(!/booked|confirmed/i.test(otText) && !/Open at/.test(otText) && !dlg().querySelector("[data-reserve-alt]") && calls.filter((c) => c.url.startsWith("/api/reserve/slots")).length === 0, "handoff shows no times, no slots call and never says booked");
ok(/You'll pick the exact time and confirm on OpenTable\./.test(otText) && !!dlg().querySelector("[data-reserve-directions]") && !!btn("Add to itinerary") && !!dlg().querySelector("[data-reserve-picks]"), "note, Directions, Add to itinerary and similar picks are the backups");
ok([...dlg().querySelectorAll("#wf-reserve-ot-time option")].every((o) => /:(00|30) /.test(o.textContent)), "the around-time list only has :00 and :30 (OpenTable's own steps)");
ok(smallTargets().length === 0 && noSideways(), "handoff card: 44px tap targets, no sideways scroll (small: " + smallTargets().join() + ")");
go.addEventListener("click", (e) => e.preventDefault());
await click(go);
const hand = JSON.parse(localStorage.getItem("wf_reserve_handoffs") || "[]");
ok(hand.length === 1 && hand[0].placeId === "ot-1" && hand[0].time === "19:30" && hand[0].party === 4, "tapping the button records the handoff in wf_reserve_handoffs");
for (let i = 0; i < 25; i++) rc.addHandoff({ placeId: "p" + i, name: "P" + i, date: DAY, time: "19:00", party: 2 });
ok(rc.readHandoffs().length === 20 && rc.readHandoffs()[0].placeId === "p24", "handoffs are capped at 20, newest first");
await closeAll();

ok(rc.nearestHalfHour("19:15") === "19:30" && rc.nearestHalfHour("19:10") === "19:00" && rc.nearestHalfHour("23:50") === "23:30" && rc.nearestHalfHour("00:05") === "00:00", "around time rounds to the nearest :00 or :30 (19:15 to 19:30, 19:10 to 19:00, 23:50 to 23:30, never the next day)");

// ── 4. None state ────────────────────────────────────────────────────────────
reset({ "GET /api/reserve/path": PATH("none") });
await open({ id: "none-1", name: "Corner Cafe" });
const call = dlg().querySelector("[data-reserve-call]");
ok(!!call && call.getAttribute("href") === "tel:8135550142" && /Call \(813\) 555-0142/.test(call.textContent), "none: a Call link (tel:8135550142) with the restaurant's phone");
ok(!!dlg().querySelector("[data-reserve-directions]") && !!dlg().querySelector("[data-reserve-picks]") && !dlg().querySelector("[data-reserve-go]") && !btn("Book table") && !/booked/i.test(text()), "none: Directions and similar picks, no booking and no OpenTable button");
ok(smallTargets().length === 0, "none state: 44px tap targets (small: " + smallTargets().join() + ")");
await closeAll();

// ── 5. Similar picks reopen the sheet for that place ─────────────────────────
reset({ "GET /api/reserve/slots": async () => [200, { ok: true, slots: [], maxParty: 12 }] });
await open();
await click(btn("Use a form instead")); await setVal(dlg().querySelector("#wf-reserve-date"), DAY); await settle(200);
const pickBtns = [...dlg().querySelectorAll("[data-reserve-pick]")];
ok(/No open tables that day/.test(text()) && pickBtns.length === 3 && pickBtns[0].textContent.includes("Osteria Uno"), "a day with no times shows up to 3 similar picks");
const find = calls_("POST", "/api/reserve/find").pop();
ok(!!find && find.body.placeId === "partner-1" && find.body.date === DAY && find.body.party === 4, "the picks come from /api/reserve/find with placeId, date and party");
routes["GET /api/reserve/path"] = PATH("wayfind");
calls.length = 0;
await click(pickBtns[0]); await settle(200);
ok(calls.some((c) => c.url.startsWith("/api/reserve/path?placeId=pick-1")) && /Osteria Uno/.test(text()), "tapping a pick reopens the sheet for that place");
await closeAll();

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
  ok(calls.some((c) => c.url.startsWith("/api/reserve/path?placeId=pick-2")) && /Bella Due/.test(text()), "tapping a chip opens the Reserve sheet for that place");
  await act(async () => { root.unmount(); }); host.remove();
  await closeAll();
}
{
  const src = fs.readFileSync(path.join(ROOT, "app/components/BooCompanion.js"), "utf8");
  ok(/const ReservePicks = lazy\(\(\) => import\("\.\/ReservePicks\.js"\)\)/.test(src) && !/^import[^\n]*ReservePicks/m.test(src) && /<ReservePicks key=\{reserve\.k\}/.test(src) && /data\.reserve/.test(src), "BooCompanion loads ReservePicks lazily and shows it when the reply carries a table request");
  const acct = fs.readFileSync(path.join(ROOT, "app/components/sheets/Account.js"), "utf8");
  ok(/import\("\.\.\/ReserveHistory\.js"\)/.test(acct) && /import\("\.\.\/ReserveProfile\.js"\)/.test(acct) && !/^import[^\n]*Reserve/m.test(acct), "the account sheet reaches My reservations and Booking profile only by dynamic import");
  const copy = ["ReserveSheet", "ReserveHistory", "ReserveProfile", "ReservePicks", "reserveUi"].map((f) => fs.readFileSync(path.join(ROOT, "app/components/" + f + ".js"), "utf8")).join("\n");
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
