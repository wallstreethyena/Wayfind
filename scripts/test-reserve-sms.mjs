#!/usr/bin/env node
// The guest's booking confirmation text (lib/reserveSms.js), exercised with the flag ON (CLAUDE.md revenue rule 1:
// an env-gated branch needs a run with the flag on). Fake provider and fake repository; no network, no real text.
// Locks: confirmed only; opt-in only; live partner only; one durable row per booking before any send; a retry,
// double tap or parallel call never texts twice; an ambiguous send is reconciled before any resend; delivery
// callbacks need a valid signature from our account and only move forward; the text names the exact date and time;
// nothing echoes the full number. Also: the concierge never hands the model a digit of the phone.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const m = await import("../lib/reserveSms.js");
let n = 0;
const fails = [];
const ok = (c, msg) => { n += 1; if (!c) fails.push(msg); };

const SID = "AC" + "a".repeat(32);
const TOKEN = "s3cr3t-token-" + "x".repeat(20);
const ENV = { RESERVE_SMS_ENABLED: "1", TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: TOKEN, TWILIO_MESSAGING_SERVICE_SID: "MG" + "b".repeat(32) };
const CB = "https://www.gowayfind.com/api/reserve/sms-status";
const NOW = Date.parse("2026-11-16T15:00:00Z");
const PARTNER = { place_id: "ChIJlive", name: "Ulele", stage: "live", timezone: "America/New_York" };
const BOOKING = { id: "33333333-3333-4333-8333-000000000001", confirmation_code: "WF7K2Q", status: "confirmed", reserve_date: "2026-11-20", reserve_time: "19:00:00", party_size: 2 };
const CONSENT = { sms: true, phone: "(508) 555-0123" };

function repo() {
  const rows = [];
  const calls = [];
  let seq = 0;
  return {
    rows, calls,
    async claimNotification(a) {
      calls.push(["claim", a]);
      await new Promise((r) => setTimeout(r, 1)); // let parallel callers interleave
      const hit = rows.find((r) => r.booking_id === a.bookingId && r.kind === a.kind);
      if (hit) return { claimed: false, ...hit };
      const status = a.status === "recorded" ? "recorded" : "queued";
      const row = { id: "44444444-4444-4444-8444-" + String(++seq).padStart(12, "0"), booking_id: a.bookingId, kind: a.kind, recipient: a.recipient, status, channel: status === "recorded" ? "none" : "sms", provider: null, provider_message_id: null, attempts: 0, created_at: new Date(NOW).toISOString(), consent_text: a.consentText };
      rows.push(row);
      return { claimed: true, ...row };
    },
    async notificationFor(bookingId, kind) {
      calls.push(["read", kind]);
      return rows.find((r) => r.booking_id === bookingId && r.kind === kind) || null;
    },
    async markNotification(id, patch) { calls.push(["mark", patch]); const r = rows.find((x) => x.id === id); const { note, ...f } = patch; Object.assign(r, f); return true; },
    async notificationByProviderId(p, sid) { return rows.find((r) => r.provider === p && r.provider_message_id === sid) || null; },
  };
}
function provider({ mode = "ok", listed = [] } = {}) {
  const posts = [];
  const lists = [];
  const fetchImpl = async (url, init = {}) => {
    if (init.method === "POST") {
      posts.push({ url, form: Object.fromEntries(new URLSearchParams(init.body)), auth: init.headers.authorization });
      if (mode === "throw") throw Object.assign(new Error("socket hang up"), { name: "TypeError" });
      if (mode === "500") return new Response("{}", { status: 500 });
      if (mode === "400") return new Response(JSON.stringify({ code: 21211, message: "The 'To' number +15085550123 is not valid" }), { status: 400 });
      return new Response(JSON.stringify({ sid: "SM" + String(posts.length).padStart(32, "0"), status: "accepted" }), { status: 201 });
    }
    lists.push(url);
    return new Response(JSON.stringify({ messages: listed }), { status: 200 });
  };
  return { posts, lists, fetchImpl };
}
const send = (r, p, extra = {}) => m.sendBookingConfirmationSms({ repository: r, booking: BOOKING, partner: PARTNER, consent: CONSENT, env: ENV, fetchImpl: p.fetchImpl, now: () => NOW, ...extra });

// ---- configuration ------------------------------------------------------------------------------------------
ok(ENV.RESERVE_SMS_ENABLED === "1" && m.smsConfig(ENV) !== null, "this file runs with texting switched on");
ok(m.smsConfig({}) === null && m.smsConfig({ ...ENV, RESERVE_SMS_ENABLED: "0" }) === null && m.smsConfig({ ...ENV, TWILIO_AUTH_TOKEN: "" }) === null, "off unless enabled and fully configured");
ok(m.smsConfig({ ...ENV, TWILIO_MESSAGING_SERVICE_SID: "", TWILIO_FROM_NUMBER: "+19415550100" }).from === "+19415550100", "a plain sender number works without a messaging service");
ok(m.smsConfig(ENV).callbackUrl === CB, "the callback is our own fixed URL");

// ---- the text --------------------------------------------------------------------------------------------------
const body = m.confirmationText({ restaurantName: "Ulele", date: "2026-11-20", time: "19:00:00", partySize: 2, code: "WF7K2Q", cityLabel: "Eastern" });
ok(body === "Wayfind: Your table at Ulele is confirmed for Friday, November 20 at 7:00 PM Eastern time for 2. Confirmation WF7K2Q. Reply STOP to opt out.", "exact calendar date, local time, party, code, STOP: " + body);
ok(!/\b(tomorrow|tonight|today|next)\b/i.test(body) && body.length <= 160, "no relative words, one SMS segment: " + body.length);

// ---- happy path, once -------------------------------------------------------------------------------------------
{
  const r = repo(), p = provider();
  const out = await send(r, p);
  ok(out.sent && p.posts.length === 1 && r.rows.length === 1, "one confirmed booking, one row, one send");
  ok(p.posts[0].form.To === "+15085550123" && p.posts[0].form.StatusCallback === CB && p.posts[0].form.MessagingServiceSid === ENV.TWILIO_MESSAGING_SERVICE_SID && p.posts[0].form.Body.includes("Friday, November 20 at 7:00 PM"), "E.164 recipient, our callback, the exact date in the body");
  const claimAt = r.calls.findIndex((c) => c[0] === "claim");
  ok(claimAt >= 0 && r.calls.findIndex((c) => c[0] === "mark") > claimAt && r.calls.slice(0, claimAt).every((c) => c[0] === "read"), "the durable row is claimed BEFORE the provider is called (a consent read may come first)");
  ok(r.rows[0].status === "accepted" && /^SM\d{32}$/.test(r.rows[0].provider_message_id) && r.rows[0].provider === "twilio" && r.rows[0].attempts === 1, "accepted, with the provider message id on the row");
  ok(r.rows[0].consent_text === m.SMS_CONSENT_TEXT, "the row stores the consent words");
  const again = await send(r, p);
  ok(!again.sent && again.reason === "already" && p.posts.length === 1, "a second call (retry, double tap) never texts again");
}
// ---- parallel callers: exactly one send ---------------------------------------------------------------------------
{
  const r = repo(), p = provider();
  await Promise.all([send(r, p), send(r, p), send(r, p)]);
  ok(p.posts.length === 1 && r.rows.length === 1, "three parallel calls, one text: " + p.posts.length);
}
// ---- gates -------------------------------------------------------------------------------------------------------------
for (const [label, extra] of [
  ["disabled", { env: {} }], ["requested", { booking: { ...BOOKING, status: "requested" } }], ["cancelled", { booking: { ...BOOKING, status: "cancelled" } }],
  ["demo partner", { partner: { ...PARTNER, stage: "demo" } }], ["no tick", { consent: { sms: false, phone: CONSENT.phone } }], ["bad phone", { consent: { sms: true, phone: "12" } }],
]) {
  const r = repo(), p = provider();
  const out = await send(r, p, extra);
  ok(!out.sent && p.posts.length === 0 && r.rows.length === 0, label + ": no row, no text (" + out.reason + ")");
}
// ---- rejected: failed, never retried --------------------------------------------------------------------------------------
{
  const r = repo(), p = provider({ mode: "400" });
  await send(r, p);
  ok(r.rows[0].status === "failed" && !/5085550123/.test(r.rows[0].last_error) && /\[number\]/.test(r.rows[0].last_error), "a rejected send is failed, and the stored error hides the number: " + r.rows[0].last_error);
  await send(r, p);
  ok(p.posts.length === 1, "a failed text is not retried automatically");
}
// ---- ambiguous: reconciled before any resend ----------------------------------------------------------------------------------
{
  const r = repo(), p = provider({ mode: "throw" });
  const a = await send(r, p);
  ok(!a.sent && r.rows[0].status === "unknown" && r.rows[0].attempts === 1, "a network error is unknown, not failed and not sent");
  const found = provider({ listed: [{ sid: "SM" + "9".repeat(32), status: "delivered", body: "Wayfind: ... Confirmation WF7K2Q. Reply STOP to opt out." }] });
  const b = await send(r, found);
  ok(b.reason === "reconciled" && found.posts.length === 0 && found.lists.length === 1 && r.rows[0].provider_message_id === "SM" + "9".repeat(32) && r.rows[0].status === "delivered", "the next attempt finds the message at the provider and does NOT resend");
}
{
  const r = repo(), p = provider({ mode: "500" });
  await send(r, p);
  const empty = provider({ listed: [] });
  const b = await send(r, empty);
  ok(b.sent && empty.lists.length === 1 && empty.posts.length === 1 && r.rows[0].attempts === 2, "the provider confirms it has nothing, so one resend happens");
  const third = provider({ mode: "throw" });
  r.rows[0].status = "unknown";
  const c = await send(r, provider({ listed: [] }));
  ok(!c.sent && c.reason === "attempts", "never more than two attempts: " + c.reason);
  void third;
}
{
  const r = repo(), p = provider({ mode: "throw" });
  await send(r, p);
  const down = { posts: [], fetchImpl: async () => { throw new Error("down"); } };
  const b = await send(r, down);
  ok(!b.sent && b.reason === "still_unknown", "if the provider can not be asked, nothing is resent");
}

// ---- delivery callbacks ---------------------------------------------------------------------------------------------------
{
  const r = repo(), p = provider();
  await send(r, p);
  const msid = r.rows[0].provider_message_id;
  const params = (status, extra = {}) => ({ AccountSid: SID, MessageSid: msid, MessageStatus: status, ...extra });
  const sign = (pr) => m.twilioSignature(TOKEN, CB, pr);
  const cb = (pr, sig = sign(pr)) => m.applySmsStatusCallback({ repository: r, params: pr, env: ENV, signature: sig, url: CB });
  ok((await cb(params("delivered"), "bad")).code === "BAD_SIGNATURE" && r.rows[0].status === "accepted", "a bad signature writes nothing");
  const forged = { ...params("delivered"), AccountSid: "AC" + "f".repeat(32) };
  ok((await cb(forged)).code === "WRONG_ACCOUNT", "another account's callback is refused");
  ok((await cb(params("sent"))).status === "sent" && r.rows[0].status === "sent", "sent moves forward");
  ok((await cb(params("delivered"))).status === "delivered" && r.rows[0].status === "delivered", "delivered moves forward");
  const late = await cb(params("sent"));
  ok(late.unchanged === true && r.rows[0].status === "delivered", "a late 'sent' never moves delivered backward");
  ok((await cb({ AccountSid: SID, MessageSid: "SM" + "7".repeat(32), MessageStatus: "delivered" })).code === "UNKNOWN_MESSAGE", "a message id that is not ours is acknowledged and ignored");
  // the signature is the documented algorithm: a known vector
  // Twilio's published worked example (docs "Validating requests", token 12345) must reproduce exactly.
  const vec = m.twilioSignature("12345", "https://mycompany.com/myapp.php?foo=1&bar=2", { CallSid: "CA1234567890ABCDE", Caller: "+14158675310", Digits: "1234", From: "+14158675310", To: "+18005551212" });
  ok(vec === "GvWf1cFY/Q7PnoempGyD5oXAezc=", "Twilio's published example signature reproduces: " + vec);
  ok(m.validTwilioSignature("12345", "https://mycompany.com/myapp.php?foo=1&bar=2", { CallSid: "CA1234567890ABCDE", Caller: "+14158675310", Digits: "1234", From: "+14158675310", To: "+18005551212" }, "GvWf1cFY/Q7PnoempGyD5oXAezc=") && !m.validTwilioSignature("12345", "https://mycompany.com/myapp.php?foo=1&bar=2", { CallSid: "CA1234567890ABCDE", Caller: "+14158675310", Digits: "1235", From: "+14158675310", To: "+18005551212" }, "GvWf1cFY/Q7PnoempGyD5oXAezc="), "validation accepts the vector and rejects one changed digit");
}

// ---- privacy: the model sees booleans only; the client sees two digits ---------------------------------------------------
{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const conc = strip(readFileSync(path.join(REPO, "lib/reserveConcierge.js"), "utf8"));
  ok(/const modelProfile = \{ hasName: profile\.hasName, hasPhone: profile\.hasPhone \};/.test(conc) && /conciergePrompt\(\{[^)]*profile: modelProfile \}\)/.test(conc), "the model prompt receives only the two booleans");
  ok((conc.match(/conciergePrompt\(/g) || []).length === 2, "one prompt builder, one call (declaration + call)");
  ok(m.phoneTail("(508) 555-0123") === "23" && m.phoneTail("nope") === null, "the confirm card shows two digits only");
  const ui = strip(readFileSync(path.join(REPO, "app/components/ReserveConcierge.js"), "utf8"));
  ok((ui.match(/const \[textMe, setTextMe\] = useState\(false\);/g) || []).length === 2, "the confirmation and the request text options both start unticked");
  ok(!/useState\(true\)/.test(ui.slice(ui.indexOf("function ConfirmCard"), ui.indexOf("function HandoffCard"))), "neither text option is pre-ticked");
  ok(/if \(a\.textMe === true\) req\.smsConsent = true;/.test(ui), "only the tick sends smsConsent");
  ok(ui.includes(m.REQUEST_CONSENT_TEXT) && /data-reserve-text-request="1"/.test(ui), "the request card shows the same consent words the server stores");
}

// ---- other kinds: who is texted, who is only recorded -------------------------------------------------------
const DASH = /[-\u2010\u2011\u2012\u2013\u2014\u2212]/;
const details = { restaurantName: "Ulele", date: "2026-11-20", time: "19:00:00", partySize: 2, code: "WF7K2Q", cityLabel: "Eastern" };
const receivedBody = m.messageText("request_received_sms", details);
const acceptedBody = m.messageText("request_accepted_sms", details);
const declinedBody = m.messageText("request_declined_sms", details);
const cancelBody = m.messageText("cancellation_sms", details);
ok(receivedBody === "Wayfind: We have your request at Ulele for Friday, November 20 at 7:00 PM Eastern time for 2. Not confirmed yet. Request WF7K2Q. Reply STOP to opt out.", "request received names the date and says it is not confirmed: " + receivedBody);
ok(acceptedBody === "Wayfind: Ulele accepted your table for Friday, November 20 at 7:00 PM Eastern time for 2. Accepted WF7K2Q. Reply STOP to opt out.", "request accepted: " + acceptedBody);
ok(declinedBody === "Wayfind: Ulele declined your request for Friday, November 20 at 7:00 PM Eastern time for 2. Declined WF7K2Q. Reply STOP to opt out.", "request declined: " + declinedBody);
ok(cancelBody === "Wayfind: Your table at Ulele for Friday, November 20 at 7:00 PM Eastern time for 2 is cancelled. Cancelled WF7K2Q. Reply STOP to opt out.", "cancellation: " + cancelBody);
for (const text of [body, receivedBody, acceptedBody, declinedBody, cancelBody, m.SMS_CONSENT_TEXT, m.REQUEST_CONSENT_TEXT, m.OPENTABLE_RECORD_TEXT, m.FAILURE_RECORD_TEXT, m.CANCELLATION_RECORD_TEXT]) {
  ok(text && !DASH.test(text) && text.length <= 300, "copy has no dash and fits the consent column: " + text);
}
ok([receivedBody, acceptedBody, declinedBody, cancelBody].every((t) => t.length <= 160), "each example text is one SMS segment");
ok(!DASH.test(m.messageText("confirmation_sms", { ...details, restaurantName: "Foo-Bar" })) && m.messageText("confirmation_sms", { ...details, restaurantName: "Foo-Bar" }).includes("Foo Bar"), "a dash in the restaurant name is removed before the text is sent");
const notify = (r, p, extra) => m.sendReserveNotification({ repository: r, partner: PARTNER, env: ENV, fetchImpl: p.fetchImpl, now: () => NOW, ...extra });
{
  const r = repo(), p = provider();
  const out = await notify(r, p, { kind: "request_received_sms", booking: { ...BOOKING, status: "requested" }, consent: CONSENT });
  ok(out.sent && p.posts.length === 1 && p.posts[0].form.Body === receivedBody && r.rows[0].consent_text === m.REQUEST_CONSENT_TEXT && r.rows[0].kind === "request_received_sms", "a ticked request sends one received text and stores that consent");
  const again = await notify(r, p, { kind: "request_received_sms", booking: { ...BOOKING, status: "requested" }, consent: CONSENT });
  ok(!again.sent && again.reason === "already" && p.posts.length === 1, "the received text is not sent twice");
  const confirm = await m.sendBookingConfirmationSms({ repository: r, booking: BOOKING, partner: PARTNER, consent: CONSENT, env: ENV, fetchImpl: p.fetchImpl, now: () => NOW });
  ok(!confirm.sent && confirm.reason === "request_booking" && p.posts.length === 1, "a request booking does not also get the confirmation text");
  const accepted = await notify(r, p, { kind: "request_accepted_sms", booking: BOOKING, consent: { sms: true, phone: "+19995550199" } });
  ok(accepted.sent && p.posts.length === 2 && p.posts[1].form.To === "+15085550123" && p.posts[1].form.Body === acceptedBody, "accept texts the stored number, not a number the restaurant passes");
  const declined = await notify(r, p, { kind: "request_declined_sms", booking: { ...BOOKING, status: "declined" } });
  ok(!declined.sent && declined.reason === "other_answer" && p.posts.length === 2, "an accept and a decline are not both texted");
}
{
  const r = repo(), p = provider();
  await notify(r, p, { kind: "request_received_sms", booking: { ...BOOKING, status: "requested" }, consent: CONSENT });
  await notify(r, p, { kind: "request_accepted_sms", booking: BOOKING });
  const guest = await notify(r, p, { kind: "cancellation_sms", booking: { ...BOOKING, status: "cancelled" }, actor: "guest" });
  ok(!guest.sent && guest.recorded && guest.reason === "recorded" && p.posts.length === 2 && r.rows.some((row) => row.kind === "cancellation_sms" && row.status === "recorded" && row.channel === "none"), "the guest cancelling is recorded and not texted");
}
{
  const r = repo(), p = provider();
  await notify(r, p, { kind: "request_received_sms", booking: { ...BOOKING, status: "requested" }, consent: CONSENT });
  await notify(r, p, { kind: "request_accepted_sms", booking: BOOKING });
  const restaurant = await notify(r, p, { kind: "cancellation_sms", booking: { ...BOOKING, status: "cancelled" }, actor: "restaurant" });
  ok(restaurant.sent && p.posts.length === 3 && p.posts[2].form.Body === cancelBody && p.posts[2].form.To === "+15085550123", "the restaurant cancelling a confirmed request texts the guest who agreed to that");
  const again = await notify(r, p, { kind: "cancellation_sms", booking: { ...BOOKING, status: "cancelled" }, actor: "restaurant" });
  ok(!again.sent && again.reason === "already" && p.posts.length === 3, "the cancellation text is not sent twice");
}
{
  const r = repo(), p = provider();
  await send(r, p);
  const restaurant = await notify(r, p, { kind: "cancellation_sms", booking: { ...BOOKING, status: "cancelled" }, actor: "restaurant" });
  ok(!restaurant.sent && restaurant.recorded && p.posts.length === 1, "an instant confirmation promised one message, so a later cancel is recorded and not texted");
}
{
  const r = repo(), p = provider();
  const note = await notify(r, p, { kind: "opentable_handoff", booking: null, linkVerified: true });
  ok(!note.sent && !note.recorded && note.reason === "handoff_note" && note.note === m.OPENTABLE_RECORD_TEXT && p.posts.length === 0 && r.rows.length === 0, "an OpenTable handoff with no Wayfind booking writes nothing and texts nothing");
  const row = await notify(r, p, { kind: "opentable_handoff", booking: BOOKING });
  ok(!row.sent && row.recorded && row.reason === "recorded" && p.posts.length === 0 && r.rows[0].status === "recorded" && r.rows[0].channel === "none" && r.rows[0].provider == null, "a handoff record does not call Twilio");
  const off = await m.sendReserveNotification({ repository: repo(), kind: "opentable_handoff", booking: BOOKING, partner: PARTNER, env: {}, fetchImpl: p.fetchImpl, now: () => NOW });
  ok(!off.sent && !off.recorded && off.reason === "disabled", "a handoff record is dark until texting is switched on");
}
{
  const r = repo(), p = provider();
  const none = await notify(r, p, { kind: "failure_sms", booking: null, failureCode: "SLOT_FULL" });
  ok(!none.sent && !none.recorded && none.reason === "no_booking" && r.rows.length === 0 && p.posts.length === 0, "a failure before a saved booking is not a row and not a text");
  const bad = await notify(r, p, { kind: "failure_sms", booking: BOOKING, failureCode: "NOPE" });
  ok(!bad.sent && bad.reason === "bad_failure" && r.rows.length === 0, "an unknown failure code is refused");
  const row = await notify(r, p, { kind: "failure_sms", booking: BOOKING, failureCode: "STORAGE", consent: CONSENT });
  ok(!row.sent && row.recorded && p.posts.length === 0 && r.rows[0].recipient == null && r.rows[0].channel === "none" && r.rows[0].status === "recorded", "a failure on a saved booking is recorded with no phone and no text");
}
{
  const r = repo(), p = provider();
  await notify(r, p, { kind: "request_received_sms", booking: { ...BOOKING, status: "requested" }, consent: CONSENT });
  r.rows[0].status = "unknown";
  const found = provider({ listed: [{ sid: "SM" + "8".repeat(32), status: "sent", body: receivedBody }] });
  const b = await notify(r, found, { kind: "request_received_sms", booking: { ...BOOKING, status: "requested" }, consent: CONSENT });
  ok(b.reason === "reconciled" && found.posts.length === 0 && r.rows[0].provider_message_id === "SM" + "8".repeat(32), "a request text is reconciled on its own marker before any resend");
  void p;
}
{
  const r = repo(), p = provider();
  await send(r, p);
  const msid = r.rows[0].provider_message_id;
  r.rows.push({ id: "44444444-4444-4444-8444-000000000099", booking_id: BOOKING.id, kind: "opentable_handoff", status: "recorded", channel: "none", provider: "twilio", provider_message_id: "SM" + "5".repeat(32), consent_text: m.OPENTABLE_RECORD_TEXT });
  const params = { AccountSid: SID, MessageSid: "SM" + "5".repeat(32), MessageStatus: "delivered" };
  const held = await m.applySmsStatusCallback({ repository: r, params, env: ENV, signature: m.twilioSignature(TOKEN, CB, params), url: CB });
  ok(held.unchanged === true && r.rows[1].status === "recorded", "a callback cannot turn a recorded handoff into a delivered text");
  ok(r.rows[0].provider_message_id === msid && r.rows[0].status === "accepted", "the confirmation row is left alone");
}

if (fails.length) { for (const f of fails) console.error("test-reserve-sms: FAIL - " + f); process.exit(1); }
console.log(`test-reserve-sms: OK - ${n} assertions (flag ON, fake provider and repository, no network, no real text)`);
