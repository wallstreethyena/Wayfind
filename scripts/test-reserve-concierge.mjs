// scripts/test-reserve-concierge.mjs - locks the Reserve concierge (docs/reserve-concierge-contract.md) by CALLING the code:
// lib/reserveConcierge.js, lib/reserveProviders/*, the handlers in lib/reserveApi.js, and the real repository against a fake fetch.
// No network, no Supabase, NO AI KEY: the deterministic parser carries every acceptance test. A fake paidAnthropicRequest
// records what the model would be sent.
//   A instant restaurant: times card, tap to book, history, cancel     B returning guest: "book it again", no profile card
//   C OpenTable handoff: go URL, never "booked"/"available"           D no provider alternatives, request lane end to end
//   E what the model is sent (never name/phone/email/ids)             F signin, profile, choose cards; parser; wiring
import { readFileSync, readdirSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createReserveHandlers } from "../lib/reserveApi.js";
import { createReserveRepository } from "../lib/reserveRepository.js";
import { createProviderRegistry } from "../lib/reserveProviders/index.js";
import { fallbackParse, parseConciergeOutput, usableAsk, dayWords } from "../lib/reserveConcierge.js";
import { newManageToken, hashManageToken } from "../lib/reserve.js";

let failed = 0, count = 0;
const ok = (cond, msg) => { count++; if (!cond) { failed++; console.error("test-reserve-concierge: FAIL - " + msg); } };

const ORIGIN = "https://www.gowayfind.com";
const NOW = Date.parse("2026-11-11T15:00:00Z"); // Wednesday 10:00 Eastern; tomorrow is 2026-11-12
const TODAY = "2026-11-11";
const USER = "11111111-1111-4111-8111-111111111111";
const PROD = { VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "svc" };
const KITCHEN = "wf-test-kitchen", BISTRO = "wf-request-bistro", ULELE = "ChIJ3Vyq7WTEwogRA-WDC7Mze2E", GRILL = "ChIJplaingrill000001";
const TOKEN = newManageToken();
const bearer = { authorization: "Bearer " + "x".repeat(30) };
const mk = (method, path, body, headers) => new Request(ORIGIN + path, { method, headers: { origin: ORIGIN, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const post = (path, body) => mk("POST", path, body, bearer);
const postAnon = (path, body) => mk("POST", path, body, {});
const json = async (res) => { const t = await res.text(); return { status: res.status, body: JSON.parse(t) }; };

const partner = (id, name, over = {}) => ({ place_id: id, name, phone: "(941) 555-0100", stage: "live", active: true, max_party: 12, timezone: "America/New_York", lead_minutes: 60, window_days: 60, booking_mode: "instant", contact_email: "owner@example.com", ...over });
const PARTNERS = [partner(KITCHEN, "Wayfind Test Kitchen"), partner(BISTRO, "Request Bistro", { booking_mode: "request", manage_token_hash: hashManageToken(TOKEN) })];
const INVENTORY = [
  { place_id: KITCHEN, name: "Wayfind Test Kitchen", locality: "Tampa", cuisines: ["american"], status: "OPERATIONAL", signals: { rating: 4.6, reviews: 300 } },
  { place_id: GRILL, name: "Plain Grill", locality: "Tampa", cuisines: ["american"], status: "OPERATIONAL", signals: { rating: 4.2, reviews: 100 } },
  { place_id: ULELE, name: "Ulele", locality: "Tampa", cuisines: ["native"], status: "OPERATIONAL" },
  { place_id: "ChIJtacoloco00000001", name: "Taco Loco", locality: "Tampa", cuisines: ["mexican"], status: "OPERATIONAL" },
  { place_id: "ChIJtacoshack0000001", name: "Taco Shack", locality: "St. Pete", cuisines: ["mexican"], status: "OPERATIONAL" },
];
const LINKS = [{ place_id: ULELE, external_id: "139954", external_slug: "ulele", active: true }];
const SLOTS = ["17:30", "18:30", "18:45", "19:00", "19:15", "19:30", "20:00", "20:30", "21:30"];
// distinctive private values: the model must never see these
const PROFILE = { first_name: "Zebediah", last_name: "Quillfeather", mobile_phone: "+19415550177", preferred_email: "zeb.quill@example.com", consent_at: "2026-11-01T00:00:00Z", default_party_size: 2 };

function fakeRepo({ partners = PARTNERS, links = LINKS, inventory = INVENTORY, profile = PROFILE, slotsByPlace = { [KITCHEN]: SLOTS }, bookings = [] } = {}) {
  const calls = [];
  const log = (n, a) => calls.push({ n, a });
  const store = [...bookings];
  const find = (id) => store.find((b) => b.id === id);
  const decorate = (b) => ({ ...b, restaurant_name: partners.find((p) => p.place_id === b.place_id)?.name ?? null, restaurant_phone: "(941) 555-0100" });
  const save = (a, status) => { const row = { id: randomUUID(), confirmation_code: "K7M2QX", status, place_id: a.placeId, user_id: a.userId, guest_name: a.guestName, party_size: a.partySize, reserve_date: a.date, reserve_time: a.time + ":00", note: a.note ?? null, guest_phone: a.phone ?? null, phone_consent_at: null }; store.push(row); return { ok: true, booking: decorate(row) }; };
  return {
    calls, store,
    async getPartner(id) { log("getPartner", id); return partners.find((p) => p.place_id === id) || null; },
    async listVisiblePartners(stages) { log("listVisiblePartners", stages); return partners.filter((p) => p.active && stages.includes(p.stage)); },
    async getPlatformLink(id) { log("getPlatformLink", id); return links.find((l) => l.place_id === id && l.active) || null; },
    async listPlatformLinks(ids) { return links.filter((l) => l.active && ids.includes(l.place_id)); },
    async getInventoryPlace(id) { return inventory.find((r) => r.place_id === id) || null; },
    async searchRestaurants(a) {
      log("searchRestaurants", a);
      return inventory.filter((r) => r.status === "OPERATIONAL" && (!a.cuisine || (r.cuisines || []).includes(a.cuisine)) && (!a.nameLike || r.name.toLowerCase().includes(a.nameLike.toLowerCase())));
    },
    async slots(place, date, party) { log("slots", { place, date, party }); return slotsByPlace[place] || []; },
    async book(a) { log("book", a); const p = partners.find((x) => x.place_id === a.placeId); return p && p.booking_mode === "request" ? { ok: false, code: "REQUEST_ONLY" } : save(a, "confirmed"); },
    async request(a) { log("request", a); const p = partners.find((x) => x.place_id === a.placeId); return p && p.booking_mode === "request" ? save(a, "requested") : { ok: false, code: "INSTANT_ONLY" }; },
    async cancel(a) { log("cancel", a); const b = find(a.bookingId); if (!b) return { ok: false, code: "NOT_FOUND" }; b.status = "cancelled"; return { ok: true, booking: decorate(b) }; },
    async respondRequest(a) {
      log("respondRequest", a);
      const b = find(a.bookingId);
      if (!b || b.place_id !== a.placeId) return { ok: false, code: "NOT_FOUND" };
      if (b.status !== "requested") return { ok: false, code: "NOT_REQUESTED", booking: decorate(b) };
      b.status = a.accept ? "confirmed" : "declined"; return { ok: true, booking: decorate(b) };
    },
    async getUserBooking(u, id) { const b = find(id); return b && b.user_id === u ? decorate(b) : null; },
    async listAllUserBookings(u, since, limit) { log("listAllUserBookings", { u, since, limit }); return store.filter((b) => b.user_id === u).sort((a, b) => (a.reserve_date < b.reserve_date ? 1 : -1)).map((b) => ({ ...b, wf_reserve_partners: { name: partners.find((p) => p.place_id === b.place_id)?.name, phone: "(941) 555-0100" } })); },
    async listPartnerBookings(place) { return store.filter((b) => b.place_id === place && ["requested", "confirmed", "proposed"].includes(b.status)); },
    async getPartnerByManageHash(hash) { return partners.find((p) => p.manage_token_hash === hash) || null; },
    async readBookingProfile(u) { log("readBookingProfile", u); return profile; },
  };
}
function harness({ env = PROD, extra = {}, ...repoOpts } = {}) {
  const repository = fakeRepo(repoOpts);
  const handlers = createReserveHandlers({ env, now: () => NOW, repository, fetchImpl: () => { throw new Error("network is not allowed in this guard"); }, verifyUser: async () => ({ id: USER, hasVerifiedEmail: true }), afterResponse: () => {}, ...extra });
  return { handlers, repository };
}
const say = async (h, text, { anon = false, state, context } = {}) => json(await h.handlers.concierge((anon ? postAnon : post)("/api/reserve/concierge", { messages: [{ role: "user", content: text }], ...(state ? { state } : {}), ...(context ? { context } : {}) })));
const noAi = { aiKey: () => "", paidAnthropicRequest: async () => { throw new Error("AI must not be called without a key"); }, model: "m", breakerOpen: async () => false };
const bookBody = (o) => ({ placeId: KITCHEN, partySize: 4, date: "2026-11-12", time: "19:00", idempotencyKey: randomUUID(), ...o });

// ---- A. instant restaurant, no AI key ------------------------------------------------------------
{
  const h = harness({ extra: noAi });
  const r = await say(h, "Book Wayfind Test Kitchen tomorrow around 7 for four");
  ok(r.status === 200 && r.body.ok === true, "A: concierge answers ok:true with no AI key");
  ok(r.body.card && r.body.card.type === "times" && r.body.card.date === "2026-11-12" && r.body.card.partySize === 4, "A: a times card for tomorrow and 4: " + JSON.stringify(r.body.card));
  const opts = r.body.card?.options || [];
  ok(opts.length >= 1 && opts.length <= 3 && opts.every((o) => SLOTS.includes(o.time)), "A: at most 3 options and every one is a real slot");
  ok(JSON.stringify(opts.map((o) => o.time)) === JSON.stringify(["18:45", "19:00", "19:15"]), "A: the 3 nearest 7:00 PM in clock order: " + JSON.stringify(opts));
  ok(opts.every((o) => Math.abs((Number(o.time.slice(0, 2)) * 60 + Number(o.time.slice(3))) - 1140) <= 90), "A: every option is within 90 minutes of the asked time");
  ok(r.body.say === "I found 6:45 PM, 7:00 PM or 7:15 PM for 4 tomorrow at Wayfind Test Kitchen. Which one?", "A: server written sentence: " + r.body.say);
  ok(r.body.state.placeId === KITCHEN && r.body.state.lane === "instant" && r.body.state.date === "2026-11-12" && r.body.state.time === "19:00" && r.body.state.partySize === 4 && r.body.missing.length === 0, "A: state and missing: " + JSON.stringify(r.body.state));
  ok(r.body.profile.hasName === true && r.body.profile.hasPhone === true && r.body.profile.display === "Zebediah Q.", "A: profile booleans and display come back to the client");
  ok(!h.repository.calls.some((c) => c.n === "book" || c.n === "request"), "A: the concierge never books");
  // the guest taps a time: a structured POST, profile fills name server side
  const b = await json(await h.handlers.book(post("/api/reserve/book", bookBody({ time: opts[0].time }))));
  ok(b.status === 201 && b.body.booking.status === "confirmed" && b.body.booking.time === "18:45", "A: tapping a time books it: " + JSON.stringify(b.body));
  ok(h.repository.calls.find((c) => c.n === "book").a.guestName === "Zebediah Quillfeather", "A: the profile filled the name on the server");
  const hist = await json(await h.handlers.history(new Request(ORIGIN + "/api/reserve/history", { headers: bearer })));
  ok(hist.body.bookings.length === 1 && hist.body.bookings[0].id === b.body.booking.id && hist.body.bookings[0].restaurantName === "Wayfind Test Kitchen", "A: history lists the booking");
  const c = await json(await h.handlers.cancel(post("/api/reserve/cancel", { bookingId: b.body.booking.id })));
  ok(c.status === 200 && c.body.booking.status === "cancelled", "A: cancel works through the provider");
  const slots = await json(await h.handlers.slots(new Request(ORIGIN + `/api/reserve/slots?placeId=${KITCHEN}&date=2026-11-12&party=4`)));
  ok(slots.body.slots.length === SLOTS.length && slots.body.lane === "instant", "A: slots route still returns real openings through the registry");
}

// ---- B. returning guest ----------------------------------------------------------------------------
{
  const prior = { id: randomUUID(), confirmation_code: "ABCDEF", status: "confirmed", place_id: KITCHEN, user_id: USER, guest_name: "Zebediah Quillfeather", party_size: 4, reserve_date: "2026-11-05", reserve_time: "19:15:00" };
  const h = harness({ extra: noAi, bookings: [prior] });
  const r = await say(h, "Book it again next Friday");
  ok(r.body.state.placeId === KITCHEN && r.body.state.restaurantName === "Wayfind Test Kitchen", "B: resolves the last booking's restaurant: " + JSON.stringify(r.body.state));
  ok(r.body.state.partySize === 4 && r.body.state.time === "19:15" && r.body.state.date === "2026-11-20", "B: reuses the party and time, next Friday is 2026-11-20: " + JSON.stringify(r.body.state));
  ok(r.body.card && r.body.card.type === "times" && r.body.card.options.some((o) => o.time === "19:15"), "B: shows real times for it");
  ok(r.body.card.type !== "profile" && !/name|phone|email/i.test(r.body.say) && r.body.missing.length === 0, "B: never asks name, phone or email");
  ok(h.repository.calls.some((c) => c.n === "listAllUserBookings"), "B: looked the last booking up through listAllUserBookings");
  const anon = await say(harness({ extra: noAi, bookings: [prior] }), "Book it again next Friday", { anon: true });
  ok(anon.body.card && anon.body.card.type === "signin" && anon.body.state.placeId === null, "B: signed out, 'again' asks to sign in and reveals no restaurant");
  const none = await say(harness({ extra: noAi }), "book it again");
  ok(none.body.card === null && none.body.missing.includes("restaurant") && /past booking/.test(none.body.say), "B: nothing to repeat, asks which restaurant");
}

// ---- C. OpenTable handoff ---------------------------------------------------------------------------
{
  const h = harness({ extra: noAi });
  const r = await say(h, "Book Ulele Friday around 7:15 for 4", { anon: true });
  const card = r.body.card || {};
  ok(card.type === "handoff" && r.body.state.lane === "handoff", "C: handoff card (no sign in needed): " + JSON.stringify(r.body));
  ok(card.url === `/api/reserve/go?placeId=${ULELE}&date=2026-11-13&time=19%3A15&party=4` || card.url === `/api/reserve/go?placeId=${ULELE}&date=2026-11-13&time=19:15&party=4`, "C: go URL carries placeId, date, time and party: " + card.url);
  ok(card.label === "Open Ulele on OpenTable" && card.sentTime === "19:30", "C: label and the half hour actually sent");
  ok(r.body.say === "I can take you straight to Ulele's OpenTable booking for Friday around 7:30 PM for 4.", "C: handoff sentence: " + r.body.say);
  ok(!/booked|available|confirmed|open table/i.test(r.body.say), "C: the handoff sentence never says booked or available");
  ok(!h.repository.calls.some((c) => c.n === "slots" || c.n === "book" || c.n === "request"), "C: no openings read, nothing booked");
  const go = await h.handlers.go(new Request(ORIGIN + card.url, { headers: { "user-agent": "Mozilla/5.0 (iPhone)" } }));
  ok(go.status === 302 && go.headers.get("location") === "https://www.opentable.com/restref/client/?rid=139954&datetime=2026-11-13T19:30&covers=4", "C: the go URL redirects to OpenTable with the date, half hour and party: " + go.headers.get("location"));
  const direct = await createProviderRegistry({ repository: fakeRepo(), env: PROD }).forPlace(ULELE);
  const created = await direct.createReservation({ placeId: ULELE, date: "2026-11-13", time: "19:15", partySize: 4 });
  ok(direct.id === "opentable_handoff" && created.ok === false && created.code === "HANDOFF_ONLY" && created.handoffUrl.startsWith("/api/reserve/go?"), "C: the provider itself answers HANDOFF_ONLY and never a booking");
}

// ---- D. no provider, alternatives, request lane -------------------------------------------------------
{
  const h = harness({ extra: noAi });
  const r = await say(h, "Book Plain Grill tomorrow around 7 for four");
  ok(r.body.state.lane === "none" && r.body.card && r.body.card.type === "alternatives", "D: no provider gives an alternatives card: " + JSON.stringify(r.body.card));
  const pick = (r.body.card.picks || []).find((p) => p.placeId === KITCHEN);
  ok(pick && pick.path === "wayfind" && pick.times.length > 0 && pick.times.every((t) => SLOTS.includes(t)), "D: a pick carries only real times");
  ok(/can't book Plain Grill through Wayfind/.test(r.body.say) && !/booked|available/i.test(r.body.say), "D: honest sentence: " + r.body.say);
  const lone = await say(harness({ extra: noAi, inventory: [INVENTORY[1]] }), "Book Plain Grill tomorrow around 7 for four");
  ok(lone.body.card === null && /can't book Plain Grill/.test(lone.body.say), "D: no alternatives means no card and no invented ones");
  // a typed name without its apostrophe still finds the restaurant ("Berns" -> "Bern's")
  const berns = { place_id: "ChIJbernsSteakHouse00000", name: "Bern's Steak House", locality: "Tampa", status: "OPERATIONAL", cuisines: ["steakhouse"] };
  const typed = await say(harness({ extra: noAi, inventory: [berns] }), "Book Berns Steak House tomorrow at 7 for 2");
  ok(typed.body.state.placeId === berns.place_id && typed.body.state.restaurantName === "Bern's Steak House", "D: 'Berns' resolves to Bern's Steak House: " + JSON.stringify(typed.body.state));
  const full = await say(harness({ extra: noAi, slotsByPlace: { [KITCHEN]: ["21:30"] } }), "Book Wayfind Test Kitchen tomorrow around 7 for four");
  ok(/has no open tables near 7:00 PM for 4 tomorrow/.test(full.body.say) && full.body.card?.type !== "times", "D: a full restaurant says so and shows no times: " + full.body.say);

  // request lane end to end
  const sent = [];
  const emailEnv = { ...PROD, WF_RESERVE_EMAIL_ENABLED: "1", RESEND_API_KEY: "k", WF_GROUP_PLAN_EMAIL_VERIFIED: "1", WF_ALERT_FROM: "Wayfind <a@gowayfind.com>" };
  const pending = [];
  const g = harness({ env: emailEnv, extra: { ...noAi, afterResponse: (p) => pending.push(p), sendPartnerNotice: async (a) => { sent.push(["partner", a.booking.status]); }, sendGuestEmail: async (a) => { sent.push(["guest", a.kind, a.booking.status]); } } });
  const q = await say(g, "Book Request Bistro Friday around 7 for 4");
  ok(q.body.card && q.body.card.type === "request" && q.body.card.date === "2026-11-13" && q.body.card.time === "19:00" && q.body.card.partySize === 4 && q.body.state.lane === "request", "D: a request card: " + JSON.stringify(q.body));
  ok(q.body.say === "They don't offer instant booking through Wayfind yet. I can send the restaurant a request for Friday at 7:00 PM for 4.", "D: request sentence: " + q.body.say);
  ok(!g.repository.calls.some((c) => c.n === "slots"), "D: a request partner never has openings read or claimed");
  const sl = await json(await g.handlers.slots(new Request(ORIGIN + `/api/reserve/slots?placeId=${BISTRO}&date=2026-11-13&party=4`)));
  ok(sl.body.slots.length === 0 && sl.body.lane === "request", "D: slots for a request partner is empty and says lane request");
  const bk = await json(await g.handlers.book(post("/api/reserve/book", bookBody({ placeId: BISTRO, date: "2026-11-13", time: "19:00" }))));
  ok(bk.status === 201 && bk.body.booking.status === "requested", "D: book on a request partner saves a requested booking (201): " + JSON.stringify(bk.body));
  ok(g.repository.calls.some((c) => c.n === "request") && !g.repository.calls.some((c) => c.n === "book"), "D: it went through wf_reserve_request, never wf_reserve_book");
  await Promise.all(pending);
  ok(JSON.stringify(sent) === JSON.stringify([["partner", "requested"]]), "D: only the restaurant is emailed for a request (live + email ready), the guest gets no confirmation: " + JSON.stringify(sent));
  const demoSent = [];
  const dm = harness({ env: { ...emailEnv, VERCEL_ENV: "preview" }, partners: [partner(BISTRO, "Request Bistro", { stage: "demo", booking_mode: "request" })], extra: { ...noAi, sendPartnerNotice: async () => demoSent.push(1), sendGuestEmail: async () => demoSent.push(2), afterResponse: (p) => p } });
  await dm.handlers.book(post("/api/reserve/book", bookBody({ placeId: BISTRO, date: "2026-11-13", time: "19:00" })));
  ok(demoSent.length === 0, "D: a demo partner never gets an email");
  // restaurant answers
  const gb = await json(await g.handlers.manageGet(new Request(ORIGIN + `/api/reserve/manage?t=${TOKEN}`)));
  ok(gb.status === 200 && gb.body.bookings.length === 1 && gb.body.bookings[0].status === "requested", "D: manage lists the requested row");
  const id = bk.body.booking.id;
  const acc = await json(await g.handlers.managePost(post("/api/reserve/manage", { token: TOKEN, bookingId: id, action: "accept" })));
  ok(acc.status === 200 && acc.body.status === "confirmed", "D: accept makes it confirmed: " + JSON.stringify(acc.body));
  const again = await json(await g.handlers.managePost(post("/api/reserve/manage", { token: TOKEN, bookingId: id, action: "accept" })));
  ok(again.status === 409 && again.body.error === "NOT_REQUESTED", "D: answering twice is 409 NOT_REQUESTED");
  const bk2 = await json(await g.handlers.book(post("/api/reserve/book", bookBody({ placeId: BISTRO, date: "2026-11-14", time: "19:30" }))));
  const dec = await json(await g.handlers.managePost(post("/api/reserve/manage", { token: TOKEN, bookingId: bk2.body.booking.id, action: "decline", reason: "Closed for a private event" })));
  ok(dec.status === 200 && dec.body.status === "declined" && g.repository.calls.filter((c) => c.n === "respondRequest").pop().a.reason === "Closed for a private event", "D: decline with a reason makes it declined");
  const bad = await json(await g.handlers.managePost(post("/api/reserve/manage", { token: TOKEN, bookingId: bk2.body.booking.id, action: "decline", reason: "x" })));
  ok(bad.status === 400 && bad.body.error === "INVALID_REASON", "D: a too short decline reason is refused");
  const instantRefused = await json(await harness({ extra: noAi }).handlers.book(post("/api/reserve/book", bookBody({ placeId: ULELE }))));
  ok(instantRefused.status === 404, "D: an OpenTable only place is still refused by book");
}

// ---- E. what the model is sent ----------------------------------------------------------------------------
{
  const bodies = [];
  const ai = (text, status = 200) => ({ aiKey: () => "key", model: "m", breakerOpen: async () => false, tripBreaker: async () => {}, classifyProviderFailure: () => null, paidAnthropicRequest: async (init) => { bodies.push(init.body); return status === 200 ? { ok: true, status, json: async () => ({ content: [{ text }] }), text: async () => text } : { ok: false, status, text: async () => JSON.stringify({ error: "anthropic_request_blocked", reason: "cap_reached" }) }; } });
  const modelJson = JSON.stringify({ restaurant: "Wayfind Test Kitchen", again: false, date: "2026-11-12", time: "19:00", partySize: 4, note: null, ask: null });
  const h = harness({ extra: ai(modelJson) });
  const r = await say(h, "Table for four tomorrow around seven at the kitchen place", { context: { placeId: KITCHEN } });
  ok(bodies.length === 1 && r.body.card?.type === "times", "E: the model path works and still ends in real times");
  const sent = bodies.join("\n");
  for (const secret of ["Zebediah", "Quillfeather", "9415550177", "941", "zeb.quill", "example.com", USER, "ABCDEF"]) ok(!sent.includes(secret), `E: the model request never contains ${secret}`);
  ok(sent.includes(TODAY) && sent.includes("Wayfind Test Kitchen") && /name yes/.test(sent) && /phone yes/.test(sent), "E: it gets today, the context restaurant and profile booleans only");
  const mapped = JSON.parse(bodies[0]);
  ok(mapped.messages.every((m) => typeof m.content === "string") && !("tools" in mapped), "E: plain extraction request, no tools");
  // model text is used only to ask for missing info, and only when it is a plain question
  const asked = await say(harness({ extra: ai(JSON.stringify({ restaurant: "Wayfind Test Kitchen", again: false, date: null, time: null, partySize: 4, note: null, ask: "What day and time would you like?" })) }), "Book Wayfind Test Kitchen for four");
  ok(asked.body.say === "What day and time would you like?" && asked.body.missing.join() === "date,time" && asked.body.card === null, "E: the model's question is used for missing info: " + asked.body.say);
  const liar = await say(harness({ extra: ai(JSON.stringify({ restaurant: "Wayfind Test Kitchen", again: false, date: null, time: null, partySize: 4, note: null, ask: "Great news, your table is booked and confirmed?" })) }), "Book Wayfind Test Kitchen for four");
  ok(!/booked|confirmed/i.test(liar.body.say) && liar.body.missing.length === 2, "E: a model question that claims a booking is dropped for the server's own: " + liar.body.say);
  ok(usableAsk("Which day works?") === "Which day works?" && usableAsk("You are booked.") === null && usableAsk("Call 941 555 0100?") === null && usableAsk(null) === null, "E: usableAsk");
  // a model that tries to book changes nothing
  const pushy = harness({ extra: ai("Book it now! I booked table 7 for you.") });
  const pr = await say(pushy, "Book Wayfind Test Kitchen tomorrow around 7 for four");
  ok(pr.status === 200 && pr.body.card?.type === "times" && !pushy.repository.calls.some((c) => c.n === "book"), "E: unparseable model text falls back to the parser, nothing is booked");
  const blocked = await say(harness({ extra: ai("", 403) }), "Book Wayfind Test Kitchen tomorrow around 7 for four");
  ok(blocked.body.ok === true && blocked.body.card?.type === "times", "E: an AI cap or block still gives a full answer");
  const nokey = [];
  await say(harness({ extra: { ...noAi, paidAnthropicRequest: async () => { nokey.push(1); } } }), "Book Wayfind Test Kitchen tomorrow around 7 for four");
  ok(nokey.length === 0, "E: no key, no provider call");
  const before = bodies.length;
  const brk = await say(harness({ extra: { ...ai(modelJson), breakerOpen: async () => true } }), "Book Wayfind Test Kitchen tomorrow around 7 for four");
  ok(brk.body.card?.type === "times" && bodies.length === before, "E: an open breaker makes no provider call and still answers");
}

// ---- F. cards, parser, wiring ------------------------------------------------------------------------------
{
  const anon = await say(harness({ extra: noAi }), "Book Wayfind Test Kitchen tomorrow around 7 for four", { anon: true });
  ok(anon.body.card?.type === "signin" && /sign in/i.test(anon.body.say) && anon.body.profile.hasName === false, "F: signed out on a Wayfind lane gets a signin card");
  const noName = await say(harness({ extra: noAi, profile: null }), "Book Wayfind Test Kitchen tomorrow around 7 for four");
  ok(noName.body.card?.type === "profile" && JSON.stringify(noName.body.card.needs) === '["name"]' && noName.body.profile.hasName === false, "F: signed in without a name gets a profile card");
  const choose = await say(harness({ extra: noAi }), "Book Taco tomorrow around 7 for four");
  ok(choose.body.card?.type === "choose" && choose.body.card.restaurants.length === 2 && choose.body.card.restaurants.every((x) => x.placeId && x.name) && choose.body.state.placeId === null, "F: an ambiguous name gets a choose card");
  const chosen = await say(harness({ extra: noAi }), "around 7", { state: { placeId: KITCHEN, date: "2026-11-12", time: null, partySize: 4 } });
  ok(chosen.body.state.placeId === KITCHEN && chosen.body.card?.type === "times", "F: state carries the restaurant, date and party across turns");
  const missing = await say(harness({ extra: noAi }), "Book Wayfind Test Kitchen");
  ok(missing.body.missing.join() === "date,time,partySize" && missing.body.card === null && /Wayfind Test Kitchen/.test(missing.body.say), "F: missing pieces are listed and asked for: " + missing.body.say);
  const unknown = await say(harness({ extra: noAi }), "Book Zzyzx Palace tomorrow");
  ok(unknown.body.card === null && unknown.body.missing.includes("restaurant"), "F: an unknown restaurant is asked about, never guessed");
  const ctx = await say(harness({ extra: noAi }), "tomorrow around 7 for 2", { context: { placeId: KITCHEN } });
  ok(ctx.body.state.placeId === KITCHEN && ctx.body.card?.type === "times", "F: context.placeId picks the restaurant");
  const dashFree = [anon, noName, choose, chosen, missing, unknown].every((x) => !/[–—]/.test(x.body.say));
  ok(dashFree, "F: no dashes in say");
  // input errors
  const h = harness({ extra: noAi });
  ok((await json(await h.handlers.concierge(post("/api/reserve/concierge", { messages: [] })))).status === 400, "F: empty messages are 400");
  ok((await json(await h.handlers.concierge(post("/api/reserve/concierge", { messages: [{ role: "user", content: "hi" }], context: { placeId: "a b" } })))).status === 400, "F: a bad context place is 400");
  ok((await h.handlers.concierge(mk("POST", "/api/reserve/concierge", { messages: [{ role: "user", content: "hi" }] }, { origin: "https://evil.example" }))).status === 403, "F: cross origin is refused");

  // parser
  const p = (t) => fallbackParse(t, TODAY);
  ok(p("tomorrow").date === "2026-11-12" && p("today").date === TODAY && p("tonight at 8").time === "20:00", "F: parser today, tomorrow, tonight");
  ok(p("Friday").date === "2026-11-13" && p("this Friday").date === "2026-11-13" && p("next Friday").date === "2026-11-20" && p("next Monday").date === "2026-11-16" && p("on Saturday").date === "2026-11-14", "F: parser weekdays and next weekday");
  ok(p("Nov 20").date === "2026-11-20" && p("November 20th").date === "2026-11-20" && p("11/20").date === "2026-11-20" && p("Jan 5").date === "2027-01-05" && p("2026-12-01").date === "2026-12-01", "F: parser calendar dates, past dates roll to next year");
  ok(p("around 7").time === "19:00" && p("7:30pm").time === "19:30" && p("7pm").time === "19:00" && p("at 6:45").time === "18:45" && p("19:30").time === "19:30" && p("noon").time === "12:00" && p("brunch at 11").time === "11:00" && p("8 am").time === "08:00" && p("7:10pm").time === "19:15", "F: parser times");
  ok(p("for four").partySize === 4 && p("for 4").partySize === 4 && p("party of 2").partySize === 2 && p("6 people").partySize === 6 && p("two of us").partySize === 2 && p("for 7pm").partySize === null && p("for 7pm").time === "19:00", "F: parser party sizes (and 'for 7pm' is a time)");
  ok(p("Book Wayfind Test Kitchen tomorrow around 7 for four").restaurant === "Wayfind Test Kitchen" && p("Can you reserve a table at Ulele on Friday at 7:30 for 4 please").restaurant === "Ulele" && p("book it again next Friday").again === true && p("book it again").restaurant === null, "F: parser restaurant and 'again'");
  ok(p("yes").restaurant === null && p("around 7").restaurant === null && p("for 4").restaurant === null, "F: filler never becomes a restaurant");
  ok(parseConciergeOutput('noise {"restaurant":"A B","again":true,"date":"2026-11-12","time":"19:00","partySize":4,"ask":null} tail').again === true && parseConciergeOutput("nope") === null && parseConciergeOutput("[1]") === null, "F: model JSON parse");
  ok(dayWords("2026-11-12", TODAY) === "tomorrow" && dayWords("2026-11-13", TODAY) === "Friday" && dayWords("2026-11-20", TODAY) === "Friday, November 20" && dayWords(TODAY, TODAY) === "today", "F: day words");

  // registry
  const flagOn = { ...PROD, RESERVE_OPENTABLE_API: "on" };
  ok((await createProviderRegistry({ repository: fakeRepo(), env: flagOn }).forPlace(ULELE)).id === "opentable_handoff", "F: the API flag without credentials never selects the API provider");
  const api = await createProviderRegistry({ repository: fakeRepo(), env: { ...flagOn, RESERVE_OPENTABLE_CLIENT_ID: "a", RESERVE_OPENTABLE_CLIENT_SECRET: "b" } }).forPlace(ULELE);
  let code = null; try { await api.createReservation({}); } catch (e) { code = e.code; }
  let c2 = null; try { await api.searchAvailability({}); } catch (e) { c2 = e.code; }
  ok(api.id === "opentable_api" && code === "NOT_ENABLED" && c2 === "NOT_ENABLED", "F: even when selected, the API provider throws NOT_ENABLED");
  const reg = createProviderRegistry({ repository: fakeRepo(), env: PROD });
  ok((await reg.forPlace(KITCHEN)).id === "wayfind_direct" && (await reg.forPlace(BISTRO)).id === "wayfind_request" && (await reg.forPlace(GRILL)).id === "none" && (await reg.forPlace("")).id === "none", "F: registry picks by booking mode, link and nothing");
  const noneP = await reg.forPlace(GRILL);
  ok((await noneP.createReservation({})).code === "NO_PROVIDER" && (await (await reg.forPlace(KITCHEN)).modifyReservation({})).code === "NOT_SUPPORTED", "F: none refuses, modify is NOT_SUPPORTED");
  const path = await json(await harness({ extra: noAi }).handlers.path(new Request(ORIGIN + `/api/reserve/path?placeId=${BISTRO}`)));
  ok(path.body.path === "wayfind" && path.body.lane === "request", "F: path keeps path wayfind and adds lane request");

  // the real repository: RPC names, arguments, and that requested rows are listed
  const urls = [];
  const repo = createReserveRepository({ url: "https://x.supabase.co", key: "svc" }, async (url, init) => { urls.push([url, init && init.body]); return { ok: true, status: 200, json: async () => ({ ok: true, booking: {} }) }; });
  await repo.request({ placeId: "p1xxx", userId: USER, date: "2026-11-13", time: "19:00", partySize: 4, guestName: "Gabe", idempotencyKey: randomUUID() });
  await repo.respondRequest({ bookingId: randomUUID(), placeId: "p1xxx", accept: false, reason: "Full" });
  ok(urls[0][0].endsWith("/rpc/wf_reserve_request") && JSON.parse(urls[0][1]).p_party === 4 && urls[1][0].endsWith("/rpc/wf_reserve_respond_request") && JSON.parse(urls[1][1]).p_accept === false && JSON.parse(urls[1][1]).p_reason === "Full", "F: repository request and respondRequest call the right RPCs");
  const listRepo = createReserveRepository({ url: "https://x.supabase.co", key: "svc" }, async (url) => { urls.push([url]); return { ok: true, status: 200, json: async () => [] }; });
  await listRepo.listPartnerBookings("p1xxx", "2026-11-11"); await listRepo.getPartner("p1xxx");
  ok(decodeURIComponent(urls[urls.length - 2][0]).includes("status=in.(requested,confirmed,proposed)") && decodeURIComponent(urls[urls.length - 1][0]).includes("booking_mode"), "F: partner bookings include requested rows and partner columns include booking_mode");

  // wiring
  const src = (f) => readFileSync(f, "utf8");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
  const route = src("app/api/reserve/concierge/route.js");
  ok(/\bpaidAnthropicRequest\b[\s\S]*lib\/paidAi\.js/.test(route) && /\.concierge\(req\)/.test(route) && /runtime = "nodejs"/.test(route) && /dynamic = "force-dynamic"/.test(route) && /export async function POST/.test(route) && !/export async function GET/.test(route), "F: the route is a nodejs force-dynamic POST that wires paidAnthropicRequest");
  const mw = src("middleware.js"), matcher = mw.slice(mw.indexOf("matcher:"), mw.indexOf("]", mw.indexOf("matcher:")));
  const rl = /RATE_LIMIT_ONLY_ROUTES = new Set\(\[([^\]]*)\]/.exec(mw);
  ok(matcher.includes('"/api/reserve/concierge"') && rl && !rl[1].includes("concierge"), "F: middleware guards the concierge like reserve-chat (full same-origin guard, not rate limit only)");
  const concierge = strip(src("lib/reserveConcierge.js"));
  ok(!/repository\.(book|request)\s*\(|createReservation\s*\(/.test(concierge), "F: the concierge module has no call that books");
  ok(!/anthropic\.com|\bfetch\s*\(/.test(concierge + strip(src("lib/reserveProviders/index.js"))), "F: no direct network call in the concierge or the registry");
  const walk = (d) => readdirSync(d).flatMap((f) => { const q = d + "/" + f; return statSync(q).isDirectory() ? walk(q) : /\.(js|mjs)$/.test(q) ? [q] : []; });
  ok(walk("lib/reserveProviders").length === 7, "F: all provider files exist (index, shared, direct, request, handoff, api, none)");
}

if (failed) { console.error(`test-reserve-concierge: ${failed} of ${count} assertions failed`); process.exit(1); }
console.log(`test-reserve-concierge: OK - ${count} assertions (no AI key, injected fake repository and fake model, no network)`);
