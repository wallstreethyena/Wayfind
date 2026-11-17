// scripts/test-reserve-phone.mjs - phone request prototype. Fake Twilio and a fake voice transcript only.
// No network, no Supabase, no live call. Covers every outcome, the flag, the allowlist, business hours,
// one call per Confirm, a bad status signature, a payment request, and the disclosure sentence.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createReserveHandlers } from "../lib/reserveApi.js";
import { createProviderRegistry } from "../lib/reserveProviders/index.js";
import { DISCLOSURE, buildCallScript } from "../lib/reservePhone/script.js";
import { createConversationRelayVoice, interpretUtterance, runConversation } from "../lib/reservePhone/voice.js";
import { PHONE_CONFIRMED_LINE, phoneGuestLine } from "../lib/reservePhone/copy.js";
import { planPhoneText } from "../lib/reservePhone/notify.js";
import { applyPhoneStatusCallback, applyVoiceOutcome, startPhoneRequest } from "../lib/reservePhone/orchestrator.js";
import { buildConversationRelayTwiml, createTwilioVoiceAdapter, twilioSignature } from "../lib/reservePhone/twilioVoice.js";
import { HOLD_LIMIT_SECONDS, localMinutes, withinBusinessHours } from "../lib/reservePhone/policy.js";

let failed = 0, count = 0;
const ok = (cond, msg) => { count++; if (!cond) { failed++; console.error("test-reserve-phone: FAIL - " + msg); } };

const NOW = Date.parse("2026-11-11T15:00:00Z"); // Wednesday 10:00 Eastern
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const PLACE = "ChIJphonetestplace01";
const OTHER_PLACE = "ChIJsomeotherplace001";
const ORIGIN = "https://www.gowayfind.com";
const SID = "CA" + "a".repeat(32);
const ACCOUNT = "AC" + "b".repeat(32);
const TOKEN = "t".repeat(32);
const FROM = "+15555550100";
const RESTAURANT_PHONE = "+19415550199";
const OPEN = { wed: [["09:00", "22:00"]] };
const CLOSED_NOW = { wed: [["12:00", "22:00"]] };
const BASE = {
  VERCEL_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "svc",
  RESERVE_PHONE_ENABLED: "1",
  RESERVE_PHONE_ALLOWLIST: PLACE,
  RESERVE_PHONE_MAX_PER_HOUR: "3",
  RESERVE_PHONE_FROM_NUMBER: FROM,
  TWILIO_ACCOUNT_SID: ACCOUNT,
  TWILIO_AUTH_TOKEN: TOKEN,
  RESERVE_PHONE_RELAY_URL: "wss://relay.test/wayfind",
  RESERVE_PHONE_CALLBACK_BASE: ORIGIN,
};

const placeRow = (hours = OPEN) => ({ place_id: PLACE, name: "Harbor Grill", phone: RESTAURANT_PHONE, timezone: "America/New_York", hours, verified_at: "2026-11-01T00:00:00Z" });

function memoryRepo(hours = OPEN) {
  const requests = [];
  const calls = [];
  const audits = [];
  const places = { [PLACE]: placeRow(hours) };
  const findReq = (userId, key) => requests.find((r) => r.user_id === userId && r.idempotency_key === key) || null;
  return {
    requests, calls, audits,
    async getPartner() { return null; },
    async getPlatformLink() { return null; },
    async getInventoryPlace(id) { return { place_id: id, name: "Harbor Grill" }; },
    async readBookingProfile() { return { first_name: "Gabriel", last_name: "Pereira", consent_at: "2026-11-01T00:00:00Z" }; },
    async getPhonePlace(id) { return places[id] || null; },
    async findPhoneRequestByKey(userId, key) {
      const request = findReq(userId, key);
      if (!request) return null;
      return { request, call: calls.find((c) => c.request_id === request.id) || null };
    },
    async getPhoneRequestById(id) {
      const request = requests.find((r) => r.id === id) || null;
      if (!request) return null;
      return { request, call: calls.find((c) => c.request_id === id) || null };
    },
    async getPhoneRequestForUser(userId, id) {
      return requests.find((r) => r.id === id && r.user_id === userId) || null;
    },
    async insertPhoneRequest(row) {
      const hit = findReq(row.user_id, row.idempotency_key);
      if (hit) return { request: hit, created: false };
      const request = { id: randomUUID(), outcome: null, summary: null, alternative_time: null, accepted_within_window: false, confirmation_detail: null, created_at: new Date(NOW).toISOString(), ...row };
      requests.push(request);
      return { request, created: true };
    },
    async insertPhoneCall(requestId, placeId) {
      const hit = calls.find((c) => c.request_id === requestId);
      if (hit) return { call: hit, created: false };
      const call = { id: randomUUID(), request_id: requestId, place_id: placeId, provider: "twilio", provider_call_id: null, status: "claimed", outcome: null, summary: null, created_at: new Date(NOW).toISOString() };
      calls.push(call);
      return { call, created: true };
    },
    async updatePhoneRequest(id, patch) {
      const request = requests.find((r) => r.id === id);
      Object.assign(request, patch);
      return request;
    },
    async updatePhoneCall(id, patch) {
      const call = calls.find((c) => c.id === id);
      Object.assign(call, patch);
      return call;
    },
    async countPhoneCallsSince(sinceIso) {
      return calls.filter((c) => c.created_at >= sinceIso).length;
    },
    async phoneCallBySid(sid) { return calls.find((c) => c.provider_call_id === sid) || null; },
    async appendPhoneAudit(entry) {
      const copy = { ...entry };
      audits.push(copy);
      return true;
    },
  };
}

function fakeTelephony(sid = SID) {
  const placed = [];
  return {
    placed,
    async placeCall(input) { placed.push(input); return { ok: true, callId: sid }; },
  };
}

const ask = (over = {}) => ({
  userId: USER, placeId: PLACE, idempotencyKey: randomUUID(), guestName: "Gabriel Pereira",
  restaurantName: "Harbor Grill", date: "2026-11-12", time: "19:00", partySize: 2, windowMinutes: 90,
  phonePlace: placeRow(), ...over,
});

const storedBlob = (repo) => JSON.stringify({ requests: repo.requests, audits: repo.audits, calls: repo.calls });

// ---- script and disclosure -----------------------------------------------------------------------
{
  const script = buildCallScript({ restaurantName: "Harbor Grill", date: "2026-11-12", time: "19:00", partySize: 2, guestLabel: "Gabriel Pereira", windowMinutes: 90 });
  ok(script.spoken[0] === DISCLOSURE && script.text.startsWith(DISCLOSURE), "the first sentence is the Wayfind disclosure");
  ok(script.text.includes("Gabriel P.") && !script.text.includes("Pereira"), "the script speaks a first name and last initial only");
  ok(/cannot give a card number/.test(script.text) && /deposit or a fee/.test(script.text) && /automated assistant/.test(script.text), "the script refuses cards, deposits, and pretending to be a person");
  ok(createConversationRelayVoice().opening(script) === DISCLOSURE, "ConversationRelay speaks the disclosure first");
  const twiml = buildConversationRelayTwiml(script, "wss://relay.test/wayfind");
  ok(twiml.includes(`welcomeGreeting="${DISCLOSURE}`) && !/<Record/i.test(twiml) && !/record=/i.test(twiml), "TwiML starts with the disclosure and has no recording");
}

// ---- hours ---------------------------------------------------------------------------------------
{
  const clock = localMinutes(NOW, "America/New_York");
  ok(clock && clock.day === "wed" && clock.minutes === 10 * 60, "10:00 Eastern on this Wednesday: " + JSON.stringify(clock));
  ok(withinBusinessHours(OPEN, "America/New_York", NOW) && !withinBusinessHours(CLOSED_NOW, "America/New_York", NOW), "open at 10:00 inside 09:00, closed before 12:00");
  ok(withinBusinessHours(OPEN, "America/New_York", Date.parse("2026-11-11T14:00:00Z")) && !withinBusinessHours(OPEN, "America/New_York", Date.parse("2026-11-12T03:00:00Z")), "09:00 is open and 22:00 is closed");
}

// ---- every outcome, through the real interpreter and a fake phone --------------------------------
{
  const cases = [
    ["confirmed", ["Yes, that works. Confirmation AB12."], (r) => r.outcome === "confirmed" && r.confirmationDetail === "AB12"],
    ["declined", ["Sorry, we are fully booked that night."], (r) => r.outcome === "declined"],
    ["alternative in window", ["We can do 7:30 PM."], (r) => r.outcome === "alternative_offered" && r.alternativeTime === "19:30" && r.acceptedWithinWindow === true],
    ["alternative outside window", ["The only opening is 4:00 PM."], (r) => r.outcome === "alternative_offered" && r.alternativeTime === "16:00" && r.acceptedWithinWindow === false],
    ["needs_guest voicemail", ["Please leave a message after the tone."], (r) => r.outcome === "needs_guest" && r.reason === "VOICEMAIL"],
    ["needs_guest ivr", ["Press 1 for reservations."], (r) => r.outcome === "needs_guest" && r.reason === "IVR"],
    ["needs_guest payment", ["I need a credit card 4111111111111111 to hold the table."], (r) => r.outcome === "needs_guest" && r.reason === "PAYMENT" && !String(r.summary).includes("4111")],
  ];
  const script = buildCallScript({ restaurantName: "Harbor Grill", date: "2026-11-12", time: "19:00", partySize: 2, guestLabel: "Gabriel Pereira", windowMinutes: 90 });
  for (const [name, events, pred] of cases) {
    const result = runConversation(script, events, { holdLimit: HOLD_LIMIT_SECONDS });
    ok(pred(result) && !("transcript" in result), name + " -> " + JSON.stringify(result));
  }
  const holdOk = interpretUtterance({ script, reasked: false, askedDetail: false }, { heldSeconds: HOLD_LIMIT_SECONDS, utterance: "please hold" }, { holdLimit: HOLD_LIMIT_SECONDS });
  const holdLong = interpretUtterance({ script, reasked: false, askedDetail: false }, { heldSeconds: HOLD_LIMIT_SECONDS + 1, utterance: "please hold" }, { holdLimit: HOLD_LIMIT_SECONDS });
  ok(!holdOk.outcome && holdLong.outcome === "needs_guest" && holdLong.reason === "HOLD", "a hold at N seconds continues, a longer hold is needs_guest");
  const human = interpretUtterance({ script, humanAnswers: 0 }, "Are you a real person?");
  ok(human.say === DISCLOSURE && !human.outcome && !/I am a person|I'm a person/i.test(human.say), "asked if it is human, it repeats the disclosure and does not pretend");
  const edgeIn = runConversation(script, ["We have 5:30 PM."]);
  const edgeOut = runConversation(script, ["We have 5:00 PM."]);
  ok(edgeIn.acceptedWithinWindow === true && edgeOut.acceptedWithinWindow === false, "5:30 PM is inside the 90 minute window and 5:00 PM is not");
  let asked = { script, askedDetail: false, reasked: false };
  const firstYes = interpretUtterance(asked, "Yes, that works.");
  const second = interpretUtterance(asked, "Confirmation AB12.");
  ok(!firstYes.outcome && /cannot take a card/.test(firstYes.say) && second.outcome === "confirmed", "yes without a detail asks once, then a confirmation detail confirms");
}

// ---- orchestrator gates --------------------------------------------------------------------------
{
  const tel = fakeTelephony();
  const off = await startPhoneRequest({ repository: memoryRepo(), env: { RESERVE_PHONE_ENABLED: "0" }, request: ask(), nowMs: NOW, telephony: tel });
  ok(off.ok === false && off.code === "DISABLED" && tel.placed.length === 0, "flag off places no call");
  const killed = await startPhoneRequest({ repository: memoryRepo(), env: { ...BASE, RESERVE_PHONE_KILL: "1" }, request: ask(), nowMs: NOW, telephony: tel });
  ok(killed.code === "KILLED" && tel.placed.length === 0, "kill switch places no call");
  const bare = await startPhoneRequest({ repository: memoryRepo(), env: { RESERVE_PHONE_ENABLED: "1" }, request: ask(), nowMs: NOW, telephony: tel });
  ok(bare.code === "NOT_CONFIGURED" && tel.placed.length === 0, "flag on without the hourly cap is not ready");
  const other = await startPhoneRequest({ repository: memoryRepo(), env: BASE, request: ask({ placeId: OTHER_PLACE }), nowMs: NOW, telephony: tel });
  ok(other.code === "NOT_ALLOWLISTED" && tel.placed.length === 0, "a restaurant that is not on the allowlist is not called");
  const empty = memoryRepo();
  empty.getPhonePlace = async () => null;
  const missing = await startPhoneRequest({ repository: empty, env: BASE, request: ask({ phonePlace: null }), nowMs: NOW, telephony: tel });
  ok(missing.code === "NO_PHONE" && tel.placed.length === 0, "allowlisted without a verified phone row is not called");
  const closedTel = fakeTelephony();
  const closed = await startPhoneRequest({ repository: memoryRepo(CLOSED_NOW), env: BASE, request: ask({ phonePlace: placeRow(CLOSED_NOW) }), nowMs: NOW, telephony: closedTel });
  ok(closed.code === "OUTSIDE_HOURS" && closedTel.placed.length === 0, "outside business hours places no call");
}

// ---- outcomes stored, one call, no transcript, no card number ------------------------------------
{
  async function run(events, sid) {
    const repo = memoryRepo();
    const tel = fakeTelephony(sid);
    const out = await startPhoneRequest({ repository: repo, env: { ...BASE, RESERVE_SMS_ENABLED: "0" }, request: ask(), nowMs: NOW, telephony: tel, events });
    return { repo, tel, out };
  }
  const confirmed = await run(["Yes. Confirmation AB12 under Gabriel."], SID);
  ok(confirmed.out.ok && confirmed.out.phone.outcome === "confirmed" && confirmed.out.phone.line === PHONE_CONFIRMED_LINE, "confirmed line is the phone sentence");
  ok(!/booked/i.test(confirmed.out.phone.line), "confirmed phone copy does not say Booked");
  ok(confirmed.tel.placed.length === 1 && confirmed.tel.placed[0].script.spoken[0] === DISCLOSURE, "the placed call carries the disclosure as its first sentence");
  ok(confirmed.tel.placed[0].to === RESTAURANT_PHONE, "the dialed number is the restaurant phone");
  const kept = JSON.stringify({ guest_label: confirmed.repo.requests[0].guest_label, summary: confirmed.repo.requests[0].summary, detail: confirmed.repo.requests[0].confirmation_detail, audits: confirmed.repo.audits });
  ok(!kept.includes("Pereira") && !kept.includes(RESTAURANT_PHONE) && !kept.includes("4111"), "stored summary and label keep no surname, no restaurant phone, and no card number");
  ok(!storedBlob(confirmed.repo).includes("transcript") && confirmed.repo.requests[0].guest_label === "Gabriel P.", "no transcript is stored, and the label is first name plus initial");
  ok(confirmed.out.text.sent === false && confirmed.out.text.reason === "sms_disabled" && confirmed.out.text.kind === "request_accepted", "texts stay off when RESERVE_SMS_ENABLED is not 1");

  const pay = await run(["Please read me a credit card 4111111111111111."], "CA" + "c".repeat(32));
  const payKept = JSON.stringify({ summary: pay.repo.requests[0].summary, detail: pay.repo.requests[0].confirmation_detail, audits: pay.repo.audits });
  ok(pay.out.phone.outcome === "needs_guest" && pay.out.phone.line === "The restaurant needs you to call them. Nothing was confirmed." && !payKept.includes("4111"), "a payment request becomes needs_guest and the card number is not stored");

  for (const [events, outcome] of [
    [["Sorry, we are fully booked."], "declined"],
    [["We can do 7:30 PM."], "alternative_offered"],
    [["Please leave a message after the tone."], "needs_guest"],
  ]) {
    const one = await run(events, "CA" + randomUUID().replace(/-/g, "").slice(0, 32));
    ok(one.out.phone.outcome === outcome && !/booked/i.test(one.out.phone.line), outcome + " guest line: " + one.out.phone.line);
  }
  const lines = ["confirmed", "declined", "alternative_offered", "needs_guest", "failed", null].map((outcome) => phoneGuestLine({ outcome, alternative_time: "19:30", accepted_within_window: outcome === "alternative_offered" }));
  ok(lines[0] === PHONE_CONFIRMED_LINE && lines.every((l) => !/booked/i.test(l)), "no outcome line says Booked");

  const smsOn = await startPhoneRequest({
    repository: memoryRepo(), env: { ...BASE, RESERVE_SMS_ENABLED: "1" }, request: ask(), nowMs: NOW,
    telephony: fakeTelephony("CA" + "d".repeat(32)), events: ["Yes. Confirmation AB12."],
  });
  ok(smsOn.text.sent === false && smsOn.text.reason === "text_not_sent" && smsOn.text.kind === "request_accepted", "SMS enabled still does not send in this prototype, and the kind is request_accepted");
  ok(planPhoneText({ env: {}, phase: "placed" }).kind === "request_received" && planPhoneText({ env: {}, phase: "declined" }).kind === "request_declined", "the hook names request_received and request_declined");
}

// ---- duplicate Confirm and the rate cap ----------------------------------------------------------
{
  const repo = memoryRepo();
  const tel = fakeTelephony();
  const key = randomUUID();
  const first = await startPhoneRequest({ repository: repo, env: BASE, request: ask({ idempotencyKey: key }), nowMs: NOW, telephony: tel });
  const second = await startPhoneRequest({ repository: repo, env: BASE, request: ask({ idempotencyKey: key }), nowMs: NOW, telephony: tel });
  ok(first.ok && second.replayed === true && tel.placed.length === 1 && repo.calls.length === 1, "a second Confirm with the same key does not call again");
  const capRepo = memoryRepo();
  const capTel = fakeTelephony();
  const env = { ...BASE, RESERVE_PHONE_MAX_PER_HOUR: "1" };
  const a = await startPhoneRequest({ repository: capRepo, env, request: ask(), nowMs: NOW, telephony: capTel });
  const b = await startPhoneRequest({ repository: capRepo, env, request: ask(), nowMs: NOW, telephony: capTel });
  ok(a.ok && b.code === "RATE_CAPPED" && capTel.placed.length === 1, "the hourly cap blocks a second restaurant call");
}

// ---- provider failure is failed, and is still one call ------------------------------------------
{
  const repo = memoryRepo();
  const tel = { placed: [], async placeCall() { this.placed.push(1); return { ok: false, code: "PROVIDER" }; } };
  const out = await startPhoneRequest({ repository: repo, env: BASE, request: ask(), nowMs: NOW, telephony: tel });
  const again = await startPhoneRequest({ repository: repo, env: BASE, request: ask({ idempotencyKey: repo.requests[0].idempotency_key }), nowMs: NOW, telephony: tel });
  ok(out.phone.outcome === "failed" && !/booked/i.test(out.phone.line) && tel.placed.length === 1 && again.replayed === true, "a provider failure is failed, and the retry does not dial again");
}

// ---- status callback signature -------------------------------------------------------------------
{
  const repo = memoryRepo();
  const tel = fakeTelephony(SID);
  const started = await startPhoneRequest({ repository: repo, env: BASE, request: ask(), nowMs: NOW, telephony: tel });
  const url = ORIGIN + "/api/reserve/phone-status";
  const params = { CallSid: SID, CallStatus: "busy", AccountSid: ACCOUNT };
  const bad = await applyPhoneStatusCallback({ repository: repo, env: BASE, params, signature: "not-a-signature", url });
  ok(bad.code === "BAD_SIGNATURE" && !repo.requests[0].outcome, "a bad signature writes nothing");
  const goodSig = twilioSignature(TOKEN, url, params);
  const good = await applyPhoneStatusCallback({ repository: repo, env: BASE, params, signature: goodSig, url });
  ok(good.ok && good.outcome === "failed" && repo.requests[0].outcome === "failed", "a valid busy callback records failed");
  const confirmedRepo = memoryRepo();
  await startPhoneRequest({ repository: confirmedRepo, env: BASE, request: ask(), nowMs: NOW, telephony: fakeTelephony(SID), events: ["Yes. Confirmation AB12."] });
  const doneParams = { CallSid: SID, CallStatus: "completed", AccountSid: ACCOUNT };
  const after = await applyPhoneStatusCallback({ repository: confirmedRepo, env: BASE, params: doneParams, signature: twilioSignature(TOKEN, url, doneParams), url });
  ok(after.unchanged === true && confirmedRepo.requests[0].outcome === "confirmed" && confirmedRepo.requests[0].summary.indexOf("AB12") === -1, "a later completed callback does not undo a confirmation, and the summary keeps no detail token");
  ok(started.phone.outcome === null && started.phone.line.startsWith("Calling the restaurant now"), "before a result, the guest is told the call is in progress");
}

// ---- Twilio adapter, fake fetch, no recording ----------------------------------------------------
{
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), body: init.body, auth: init.headers.authorization });
    return { ok: true, json: async () => ({ sid: SID, status: "queued" }) };
  };
  const cfg = { accountSid: ACCOUNT, authToken: TOKEN, from: FROM, relayUrl: "wss://relay.test/wayfind", callbackUrl: ORIGIN + "/api/reserve/phone-status" };
  const script = buildCallScript({ restaurantName: "Harbor Grill", date: "2026-11-12", time: "19:00", partySize: 2, guestLabel: "Gabriel Pereira", windowMinutes: 90 });
  const out = await createTwilioVoiceAdapter({ config: cfg, fetchImpl }).placeCall({ to: RESTAURANT_PHONE, script });
  const form = new URLSearchParams(seen[0].body);
  ok(out.ok && out.callId === SID && String(seen[0].url).endsWith("/Calls.json"), "the adapter posts one call to Twilio Calls.json");
  ok(form.get("Record") === "false" && !form.has("RecordingStatusCallback") && form.get("Twiml").includes(DISCLOSURE) && !form.get("Twiml").includes("<Record"), "Record is false and the TwiML has the disclosure and no Record noun");
  ok(!seen[0].body.includes(TOKEN) && seen[0].auth.startsWith("Basic "), "the auth token is not in the body");
}

// ---- guest HTTP: flag, duplicate, forged transcript, own row only --------------------------------
{
  const post = (body, env, repo, tel, extra = {}) => {
    const handlers = createReserveHandlers({
      env, now: () => NOW, repository: repo, fetchImpl: () => { throw new Error("network is not allowed"); },
      verifyUser: async () => ({ id: USER }), phoneTelephony: tel, ...extra,
    });
    return handlers.phonePost(new Request(ORIGIN + "/api/reserve/phone", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json", authorization: "Bearer " + "x".repeat(20) },
      body: JSON.stringify(body),
    }));
  };
  const body = { placeId: PLACE, date: "2026-11-12", time: "19:00", partySize: 2, idempotencyKey: randomUUID(), events: ["Yes. Confirmation AB12."] };
  const offRepo = memoryRepo();
  const offTel = fakeTelephony();
  const offRes = await post(body, { ...BASE, RESERVE_PHONE_ENABLED: "0" }, offRepo, offTel);
  const offJson = await offRes.json();
  ok(offRes.status === 409 && offJson.error === "DISABLED" && offTel.placed.length === 0, "HTTP flag off is DISABLED and does not dial");

  const repo = memoryRepo();
  const tel = fakeTelephony();
  const first = await (await post(body, BASE, repo, tel)).json();
  const second = await (await post(body, BASE, repo, tel)).json();
  ok(first.ok && first.phone.outcome === null && !/booked/i.test(first.phone.line) && second.phone.replayed === true && tel.placed.length === 1, "HTTP Confirm does not trust a forged transcript, and a duplicate Confirm dials once");

  const handlers = createReserveHandlers({
    env: BASE, now: () => NOW, repository: repo, verifyUser: async () => ({ id: OTHER }),
  });
  const foreign = await handlers.phoneGet(new Request(ORIGIN + "/api/reserve/phone?id=" + first.phone.id, { headers: { authorization: "Bearer " + "x".repeat(20) } }));
  ok(foreign.status === 404, "another guest cannot read the request");
  const mine = await createReserveHandlers({ env: BASE, now: () => NOW, repository: repo, verifyUser: async () => ({ id: USER }) })
    .phoneGet(new Request(ORIGIN + "/api/reserve/phone?id=" + first.phone.id, { headers: { authorization: "Bearer " + "x".repeat(20) } }));
  const mineJson = await mine.json();
  ok(mine.status === 200 && mineJson.phone.line.startsWith("Calling the restaurant now") && !("guest_label" in mineJson.phone), "the owner can read the calling line, without the stored label");

  const applied = await applyVoiceOutcome({ repository: repo, env: BASE, requestId: first.phone.id, events: ["Yes. Confirmation AB12."] });
  ok(applied.phone.outcome === "confirmed" && applied.phone.line === PHONE_CONFIRMED_LINE, "the voice result comes back as the confirmed sentence");
  const again = await applyVoiceOutcome({ repository: repo, env: BASE, requestId: first.phone.id, events: ["Sorry, we are fully booked."] });
  ok(again.replayed === true && again.phone.outcome === "confirmed", "a second voice result does not replace a confirmation");
}

// ---- concierge offers the card and does not dial -------------------------------------------------
{
  const say = async (env, hours, text = "tomorrow at 7 for two") => {
    const repo = memoryRepo(hours);
    let inserts = 0;
    const orig = repo.insertPhoneRequest;
    repo.insertPhoneRequest = async (...a) => { inserts += 1; return orig(...a); };
    const handlers = createReserveHandlers({
      env, now: () => NOW, repository: repo, fetchImpl: () => { throw new Error("network"); },
      verifyUser: async () => ({ id: USER }),
      aiKey: () => "", paidAnthropicRequest: async () => { throw new Error("no ai"); }, model: "m", breakerOpen: async () => false,
    });
    const res = await handlers.concierge(new Request(ORIGIN + "/api/reserve/concierge", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json", authorization: "Bearer " + "x".repeat(20) },
      body: JSON.stringify({ messages: [{ role: "user", content: text }], context: { placeId: PLACE } }),
    }));
    return { status: res.status, body: await res.json(), inserts };
  };
  const open = await say(BASE, OPEN);
  ok(open.body.card && open.body.card.type === "phone_request" && open.body.state.lane === "phone_request" && open.inserts === 0 && !/booked/i.test(open.body.say), "an open allowlisted restaurant gets a Confirm card and no call: " + open.body.say);
  const shut = await say(BASE, CLOSED_NOW);
  ok(!shut.body.card && /will not call/.test(shut.body.say) && shut.inserts === 0, "closed right now: no card and no call");
  const off = await say({ ...BASE, RESERVE_PHONE_ENABLED: "0" }, OPEN);
  ok(off.body.state.lane === "none" && !(off.body.card && off.body.card.type === "phone_request"), "flag off keeps the restaurant on the none lane");
  const listed = await say({ ...BASE, RESERVE_PHONE_ALLOWLIST: OTHER_PLACE }, OPEN);
  ok(listed.body.state.lane === "none", "a place that is not allowlisted is not offered a phone request");
}

// ---- registry does not select phone unless the flag and the row agree ---------------------------
{
  const repo = memoryRepo();
  const off = await createProviderRegistry({ repository: repo, env: {} }).forPlace(PLACE);
  ok(off.id === "none", "default env does not select phone_request");
  const on = await createProviderRegistry({ repository: repo, env: BASE }).forPlace(PLACE);
  ok(on.id === "phone_request" && on.kind === "phone_request", "a ready allowlisted place selects phone_request");
  const avail = await on.searchAvailability({ placeId: PLACE, date: "2026-11-12", partySize: 2 });
  ok(avail.verified === false && avail.times === null, "phone search never claims a time");
}

// ---- migration shape, not applied ----------------------------------------------------------------
{
  const sql = readFileSync(new URL("../supabase/migrations/20261117120000_wf_reserve_phone.sql", import.meta.url), "utf8");
  const stripped = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
  for (const table of ["wf_reserve_phone_places", "wf_reserve_phone_requests", "wf_reserve_phone_calls", "wf_reserve_phone_audit"]) {
    ok(new RegExp(`alter table public\\.${table} enable row level security`, "i").test(stripped), table + " enables RLS");
  }
  ok(/revoke all on table public\.wf_reserve_phone_places, public\.wf_reserve_phone_requests, public\.wf_reserve_phone_calls, public\.wf_reserve_phone_audit from public, anon, authenticated/i.test(stripped), "client roles are revoked");
  ok(!/\b(bytea|audio|transcript|recording)\b/i.test(stripped), "the migration has no audio, transcript, or recording column");
  ok(!/guest_phone|guest_name/i.test(stripped), "the phone tables do not store the guest phone or full name");
  const pending = JSON.parse(readFileSync(new URL("../scripts/migration-pending-apply.json", import.meta.url), "utf8"));
  const entry = pending.find((p) => p.file === "supabase/migrations/20261117120000_wf_reserve_phone.sql");
  ok(entry && /NOT APPLIED/.test(entry.reason), "the migration is declared NOT APPLIED");
}

// ---- routes and middleware -----------------------------------------------------------------------
{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  const phone = strip(readFileSync(new URL("../app/api/reserve/phone/route.js", import.meta.url), "utf8"));
  const status = strip(readFileSync(new URL("../app/api/reserve/phone-status/route.js", import.meta.url), "utf8"));
  ok(/export async function POST/.test(phone) && /export async function GET/.test(phone) && /phonePost/.test(phone) && /phoneGet/.test(phone), "the guest route is GET and POST");
  ok(/export async function POST/.test(status) && /phoneStatus/.test(status) && !/export async function GET/.test(status), "the status route is POST only");
  const mw = readFileSync(new URL("../middleware.js", import.meta.url), "utf8");
  const matcher = mw.slice(mw.indexOf("matcher:"), mw.indexOf("]", mw.indexOf("matcher:")));
  ok(matcher.includes('"/api/reserve/phone"') && !matcher.includes("phone-status"), "Confirm is rate limited and the Twilio callback is not same origin blocked");
  ok(/RATE_LIMIT_ONLY_ROUTES[\s\S]*\/api\/reserve\/phone"/.test(mw), "the guest phone route is rate limit only");
  const voiceSrc = readFileSync(new URL("../lib/reservePhone/voice.js", import.meta.url), "utf8");
  ok(/ConversationRelay/.test(voiceSrc) && /ElevenLabs/.test(voiceSrc), "the voice file records why ConversationRelay was chosen");
}

// ---- the Confirm tap, rendered -------------------------------------------------------------------
{
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: ORIGIN + "/", pretendToBeVisual: true });
  const w = dom.window;
  const defineGlobal = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  for (const k of ["window", "document", "HTMLElement", "Node", "Event", "CustomEvent", "MouseEvent"]) defineGlobal(k, w[k]);
  defineGlobal("navigator", w.navigator);
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  process.env.NODE_ENV = "test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://e2eplaceholder.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "e2e-placeholder-anon-key-not-real";
  const posts = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const body = init && init.body ? JSON.parse(init.body) : null;
    posts.push({ u, body });
    if (u.includes("/api/reserve/concierge")) {
      return { ok: true, status: 200, json: async () => ({ ok: true, say: "I can call Harbor Grill and ask for a table tomorrow at 7:00 PM for 2. Nothing is confirmed until they say yes.", state: { placeId: PLACE, restaurantName: "Harbor Grill", lane: "phone_request", date: "2026-11-18", time: "19:00", partySize: 2 }, missing: [], card: { type: "phone_request", date: "2026-11-18", time: "19:00", partySize: 2, windowMinutes: 90 }, profile: { hasName: true, hasPhone: false, display: "Gabriel P." } }) };
    }
    if (u.includes("/api/reserve/phone") && (!init || init.method === "POST")) {
      return { ok: true, status: 201, json: async () => ({ ok: true, phone: { id: "33333333-3333-4333-8333-333333333333", outcome: null, line: "Calling the restaurant now. I will bring their answer back here.", restaurantName: "Harbor Grill", date: "2026-11-18", time: "19:00", partySize: 2 } }) };
    }
    return { ok: false, status: 404, json: async () => ({ ok: false }) };
  };
  const React = (await import("react")).default;
  const { createRoot } = await import("react-dom/client");
  const { loadComponent } = await import("./lib/jsxLoad.mjs");
  const Concierge = (await loadComponent(new URL("../app/components/ReserveConcierge.js", import.meta.url).pathname, new URL("..", import.meta.url).pathname)).default;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await React.act(async () => { root.render(React.createElement(Concierge, { initialPlace: { id: PLACE, name: "Harbor Grill" }, initialMessage: "tomorrow at 7 for two" })); });
  await React.act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  const card = document.querySelector("[data-reserve-card='phone_request']");
  const button = document.querySelector("[data-reserve-phone-confirm]");
  ok(!!card && button && button.textContent === "Confirm" && !/Booked/i.test(document.body.textContent), "the thread shows Confirm and does not say Booked");
  await React.act(async () => { button.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); });
  await React.act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  const outcome = document.querySelector("[data-reserve-card='phone_outcome']");
  const phonePost = posts.find((p) => p.u.includes("/api/reserve/phone"));
  ok(outcome && outcome.getAttribute("data-reserve-status") === "calling" && outcome.getAttribute("data-reserve-booked") === "0" && /The restaurant confirmed by phone|Calling the restaurant now/.test(outcome.textContent) && /Calling the restaurant now/.test(outcome.textContent) && !/Booked/i.test(document.body.textContent), "Confirm shows the calling line, not Booked");
  ok(phonePost && phonePost.body && phonePost.body.placeId === PLACE && !("events" in phonePost.body), "Confirm posts the request and does not send a transcript");
  await React.act(async () => { root.unmount(); });
  w.close();
}

if (failed) { console.error(`test-reserve-phone: ${failed} of ${count} assertions failed`); process.exit(1); }
console.log(`test-reserve-phone: OK - ${count} assertions`);
process.exit(0);
