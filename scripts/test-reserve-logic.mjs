// scripts/test-reserve-logic.mjs - locks the pure rules of "Reserve a table"
// (lib/reserve.js). It IMPORTS the module and CALLS it; no source greps.
// Every rule has a positive and a negative control. Nothing here touches a network.
import {
  validateReserveInput, newRespondToken, hashRespondToken, isRespondTokenShape, nextReserveStatus,
  isExpired, effectiveStatus, partnerVisible, reserveEmailReady, normalizeDraft, isDraftComplete,
  parseChatOutput, cleanReply, computeExpiresAt, easternToUtcMs, addDays, hasContactDetails,
} from "../lib/reserve.js";

let failed = 0, count = 0;
const ok = (cond, msg) => { count++; if (!cond) { failed++; console.error("test-reserve-logic: FAIL - " + msg); } };
const TODAY = "2026-11-11";
const base = { partySize: 4, date: "2026-11-14", time: "19:30", guestName: "Gabe", note: "Window seat please" };
const run = (over = {}, ctx = {}) => validateReserveInput({ ...base, ...over }, { today: TODAY, maxParty: 12, ...ctx });
const errOf = (r) => (r.ok ? null : r.error);

// positive control: the base request is valid and normalized
const good = run();
ok(good.ok && good.value.partySize === 4 && good.value.date === "2026-11-14" && good.value.time === "19:30" && good.value.guestName === "Gabe" && good.value.note === "Window seat please", "a valid request normalizes");
ok(run({ note: undefined }).value.note === null && run({ note: "   " }).value.note === null, "an empty note becomes null");

// date window: yesterday no, today yes, +60 yes, +61 no
ok(errOf(run({ date: addDays(TODAY, -1) })) === "DATE_PAST", "yesterday is rejected");
ok(run({ date: TODAY }).ok, "today is accepted");
ok(run({ date: addDays(TODAY, 60) }).ok, "today+60 is accepted");
ok(errOf(run({ date: addDays(TODAY, 61) })) === "DATE_TOO_FAR", "today+61 is rejected");
ok(errOf(run({ date: "2026-02-30" })) === "INVALID_DATE" && errOf(run({ date: "11/14/2026" })) === "INVALID_DATE" && errOf(run({ date: undefined })) === "INVALID_DATE", "non dates are rejected");
ok(errOf(run({ date: TODAY, time: "10:00" }, { now: easternToUtcMs(TODAY, "12:00") })) === "TIME_PAST", "a time already passed today is rejected when now is known");
ok(run({ date: TODAY, time: "13:00" }, { now: easternToUtcMs(TODAY, "12:00") }).ok, "a later time today is accepted");

// 15 minute steps
for (const t of ["00:00", "18:15", "18:30", "18:45", "23:45"]) ok(run({ time: t }).ok, `time ${t} accepted`);
for (const t of ["18:10", "18:01", "24:00", "7:30", "19:30:00", "", "noon"]) ok(errOf(run({ time: t })) === "INVALID_TIME", `time ${JSON.stringify(t)} rejected`);

// party size
ok(run({ partySize: 1 }).ok && run({ partySize: 12 }).ok, "party 1 and the partner max are accepted");
ok(errOf(run({ partySize: 0 })) === "INVALID_PARTY_SIZE" && errOf(run({ partySize: 2.5 })) === "INVALID_PARTY_SIZE" && errOf(run({ partySize: "x" })) === "INVALID_PARTY_SIZE" && errOf(run({ partySize: -3 })) === "INVALID_PARTY_SIZE", "bad party sizes are rejected");
ok(errOf(run({ partySize: 13 })) === "PARTY_TOO_LARGE", "party above the partner max is rejected");
ok(run({ partySize: 40 }, { maxParty: 40 }).ok && errOf(run({ partySize: 41 }, { maxParty: 99 })) === "PARTY_TOO_LARGE", "the hard ceiling is 40");

// guest name
ok(run({ guestName: "Mary-Jane O'Neil Jr." }).ok && run({ guestName: "Zoë Müller" }).ok, "letters, space, apostrophe, period, hyphen are allowed");
ok(run({ guestName: "  Gabe   P  " }).value.guestName === "Gabe P", "whitespace is collapsed");
for (const n of ["", "   ", "x".repeat(41), "Bob123", "a@b", "<b>x</b>", "-Gabe", 42, null]) ok(errOf(run({ guestName: n })) === "INVALID_NAME", `name ${JSON.stringify(n)} rejected`);
ok(run({ guestName: "x".repeat(40) }).ok, "a 40 character name is accepted");

// note: no links, emails, phone numbers; max 200
for (const n of ["see https://x.co/a", "visit www.example.com", "mysite.com/menu", "me@example.com", "call 941-555-0123", "call (941) 555 0123", "+1 941 555 0123", "9415550123"]) ok(errOf(run({ note: n })) === "NOTE_NOT_ALLOWED", `note ${JSON.stringify(n)} rejected`);
ok(run({ note: "Birthday for 2 kids, table by the window, 6 chairs" }).ok, "a normal note with small numbers is accepted");
ok(run({ note: "n".repeat(200) }).ok && errOf(run({ note: "n".repeat(201) })) === "INVALID_NOTE" && errOf(run({ note: 5 })) === "INVALID_NOTE", "note length and type");
ok(hasContactDetails("a@b.co") && !hasContactDetails("quiet corner"), "hasContactDetails positive and negative control");

// tokens
const tok = newRespondToken(), tok2 = newRespondToken();
ok(isRespondTokenShape(tok) && tok.length === 43 && tok !== tok2, "token is 43 chars base64url and unique");
ok(/^[a-f0-9]{64}$/.test(hashRespondToken(tok)) && hashRespondToken(tok) === hashRespondToken(tok) && hashRespondToken(tok) !== hashRespondToken(tok2), "hash is sha256 hex, stable, and differs per token");
ok(hashRespondToken(tok) !== tok && !hashRespondToken(tok).includes(tok), "the stored hash never contains the token");
ok(!isRespondTokenShape("short") && !isRespondTokenShape(tok + "x") && !isRespondTokenShape(null), "bad token shapes are rejected");

// status machine
const c1 = nextReserveStatus("pending", "confirm");
ok(c1.ok && c1.status === "confirmed" && c1.changed === true, "pending -> confirmed changes once");
const c2 = nextReserveStatus("confirmed", "confirm");
ok(c2.ok && c2.status === "confirmed" && c2.changed === false, "a second confirm is a no-op");
const c3 = nextReserveStatus("confirmed", "decline");
ok(c3.ok && c3.status === "confirmed" && c3.changed === false, "confirmed can never become declined");
const d1 = nextReserveStatus("pending", "decline"), d2 = nextReserveStatus("declined", "confirm");
ok(d1.status === "declined" && d1.changed && d2.status === "declined" && !d2.changed, "pending -> declined once, then fixed");
for (const s of ["cancelled", "expired"]) ok(!nextReserveStatus(s, "confirm").changed && nextReserveStatus(s, "decline").status === s, `${s} cannot be answered`);
ok(nextReserveStatus("pending", "delete").ok === false && nextReserveStatus("bogus", "confirm").ok === false, "unknown action or status is an error");

// expiry
const NOW = Date.parse("2026-11-12T12:00:00Z");
ok(isExpired({ expires_at: "2026-11-12T11:59:59Z" }, NOW) && isExpired({ expires_at: "2026-11-12T12:00:00Z" }, NOW) && !isExpired({ expires_at: "2026-11-12T12:00:01Z" }, NOW), "isExpired at the boundary");
ok(!isExpired({}, NOW) && !isExpired({ expires_at: "nope" }, NOW), "a missing or bad expiry is not expired");
ok(effectiveStatus({ status: "pending", expires_at: "2026-11-12T11:00:00Z" }, NOW) === "expired" && effectiveStatus({ status: "confirmed", expires_at: "2026-11-12T11:00:00Z" }, NOW) === "confirmed" && effectiveStatus({ status: "pending", expires_at: "2026-11-12T13:00:00Z" }, NOW) === "pending", "a pending row past expiry reads expired, others keep their status");
const created = Date.parse("2026-11-11T15:00:00Z");
ok(computeExpiresAt("2026-11-20", "19:00", created) === "2026-11-12T15:00:00.000Z", "far reservation expires after 24 hours");
ok(computeExpiresAt("2026-11-11", "17:00", created) === "2026-11-11T22:00:00.000Z", "a reservation 2 hours away (Eastern, EST) expires at the reservation time");
ok(easternToUtcMs("2026-07-04", "12:00") === Date.parse("2026-07-04T16:00:00Z") && easternToUtcMs("2026-12-25", "12:00") === Date.parse("2026-12-25T17:00:00Z"), "Eastern conversion follows DST");

// rollout gates
const PROD_READY = { VERCEL_ENV: "production", WF_RESERVE_EMAIL_ENABLED: "1", RESEND_API_KEY: "k", WF_GROUP_PLAN_EMAIL_VERIFIED: "1", WF_ALERT_FROM: "Wayfind <a@gowayfind.com>" };
ok(reserveEmailReady(PROD_READY), "email ready with every condition (positive control)");
for (const k of Object.keys(PROD_READY)) {
  const e = { ...PROD_READY }; delete e[k];
  ok(!reserveEmailReady(e), `email not ready without ${k}`);
}
ok(!reserveEmailReady({ ...PROD_READY, VERCEL_ENV: "preview" }) && !reserveEmailReady({ ...PROD_READY, WF_RESERVE_EMAIL_ENABLED: "true" }) && !reserveEmailReady({ ...PROD_READY, WF_ALERT_FROM: "nope" }), "wrong env, flag value or sender is not ready");
const live = { active: true, stage: "live" }, demo = { active: true, stage: "demo" };
ok(partnerVisible(live, PROD_READY), "production + email ready shows a live partner");
ok(!partnerVisible(demo, PROD_READY), "production never shows a demo partner");
ok(!partnerVisible(live, { ...PROD_READY, WF_RESERVE_EMAIL_ENABLED: "0" }), "production with email not ready shows none");
ok(!partnerVisible({ active: false, stage: "live" }, PROD_READY) && !partnerVisible(null, PROD_READY), "inactive or missing partner is never visible");
ok(partnerVisible(demo, { VERCEL_ENV: "preview" }) && partnerVisible(live, { VERCEL_ENV: "preview" }) && partnerVisible(demo, {}), "preview and local show live and demo");
ok(!partnerVisible({ active: true, stage: "retired" }, { VERCEL_ENV: "preview" }), "an unknown stage is never visible");

// normalizeDraft: model output is never trusted, each field on its own
const ctx = { today: TODAY, maxParty: 12 };
const nd = normalizeDraft({ partySize: 4, date: "2026-11-14", time: "19:30", guestName: "Gabe", note: "quiet" }, ctx);
ok(isDraftComplete(nd) && nd.note === "quiet", "a good draft is complete");
const bad = normalizeDraft({ partySize: 99, date: "2025-01-01", time: "19:10", guestName: "Bob<script>", note: "call 941 555 0123" }, ctx);
ok(bad.partySize === null && bad.date === null && bad.time === null && bad.guestName === null && bad.note === null && !isDraftComplete(bad), "every invalid field becomes null");
const mixed = normalizeDraft({ partySize: "6", date: "2027-12-01", time: "18:00", guestName: "Ann", note: 7 }, ctx);
ok(mixed.partySize === 6 && mixed.date === null && mixed.time === "18:00" && mixed.guestName === "Ann" && mixed.note === null && !isDraftComplete(mixed), "fields are judged one by one");
ok(!isDraftComplete(normalizeDraft(null, ctx)) && !isDraftComplete(normalizeDraft("x", ctx)), "garbage model output gives an empty draft");
ok(normalizeDraft({ date: addDays(TODAY, 61) }, ctx).date === null && normalizeDraft({ date: addDays(TODAY, 60) }, ctx).date === addDays(TODAY, 60), "draft date uses the same 60 day window");

// model text parsing and reply cleaning
ok(parseChatOutput('```json\n{"reply":"Hi","draft":{"partySize":2}}\n```').draft.partySize === 2, "fenced JSON parses");
ok(parseChatOutput("sorry, no json") === null && parseChatOutput('{"reply":5}') === null && parseChatOutput("{bad") === null, "unusable output returns null");
const emptyDraft = normalizeDraft({}, ctx);
ok(cleanReply("Great, how many people?", emptyDraft) === "Great, how many people?", "a safe reply passes (positive control)");
for (const r of ["Your table is booked!", "Good news, 7 PM is available.", "You're all set", "Confirmed for Saturday", "Email me at a@b.co", "See https://x.com", ""]) ok(cleanReply(r, emptyDraft) === "How many people will be dining?", `unsafe reply replaced: ${JSON.stringify(r)}`);
ok(!/[–—]| - /.test(cleanReply("Sure — what day – works? Or - maybe Friday", emptyDraft)), "dashes are removed from replies");

if (failed) { console.error(`test-reserve-logic: ${failed} of ${count} assertions failed`); process.exit(1); }
console.log(`test-reserve-logic: OK - ${count} assertions on lib/reserve.js (called, not grepped)`);
