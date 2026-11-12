// scripts/test-reserve-logic.mjs - locks the pure rules of "Reserve a table"
// (lib/reserve.js). It IMPORTS the module and CALLS it; no source greps.
// Every rule has a positive and a negative control. Nothing here touches a network.
import {
  validateReserveInput, newRespondToken, hashRespondToken, isRespondTokenShape, nextReserveStatus,
  isExpired, effectiveStatus, partnerVisible, reserveEmailReady, normalizeDraft, isDraftComplete,
  parseChatOutput, cleanReply, computeExpiresAt, easternToUtcMs, addDays, hasContactDetails,
  snapTimeToStep, cleanGuestName, finishChatTurn, RESERVE_MIN_LEAD_MINUTES, cleanTime,
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
ok(errOf(run({ date: TODAY, time: "13:00" }, { now: easternToUtcMs(TODAY, "12:00") })) === "TOO_SOON", "one hour from now is TOO_SOON, not accepted");

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

// ---- NEW: snap to the quarter hour (loose model times only; cleanTime stays strict) ----
for (const [inp, want] of [["19:20", "19:15"], ["19:23", "19:30"], ["19:53", "20:00"], ["23:55", "23:45"], ["23:53", "23:45"], ["23:30", "23:30"], ["07:07", "07:00"], ["07:08", "07:15"], ["00:05", "00:00"], ["7:20", "07:15"], ["19:30", "19:30"]]) ok(snapTimeToStep(inp) === want, `snapTimeToStep(${inp}) is ${want}, got ${snapTimeToStep(inp)}`);
for (const g of ["garbage", "24:00", "12:60", "", null, undefined, 1930, "7pm"]) ok(snapTimeToStep(g) === null, `snapTimeToStep(${JSON.stringify(g)}) is null`);
ok(cleanTime("19:20") === null && cleanTime("19:15") === "19:15", "cleanTime stays strict (an off step is still rejected)");

// ---- NEW: lower case names get capitals, a name with any capital is left exactly as typed ----
for (const [inp, want] of [["gabe", "Gabe"], ["mary-anne o'brien", "Mary-Anne O'Brien"], ["mary \u2019jo", "Mary \u2019Jo"], ["zo\u00eb m\u00fcller", "Zo\u00eb M\u00fcller"], ["Gabe", "Gabe"], ["gabe P", "gabe P"], ["McDonald", "McDonald"], ["de la Cruz", "de la Cruz"], ["MARY", "MARY"]]) ok(cleanGuestName(inp) === want, `cleanGuestName(${JSON.stringify(inp)}) is ${JSON.stringify(want)}, got ${JSON.stringify(cleanGuestName(inp))}`);
ok(run({ guestName: "gabe" }).value.guestName === "Gabe", "validateReserveInput applies the capitalization (form, chat and email agree)");

// ---- NEW: TOO_SOON vs TIME_PAST vs ok around the 120 minute edge ----
ok(RESERVE_MIN_LEAD_MINUTES === 120, "lead time is 120 minutes");
{
  const T = "2026-11-12", now = easternToUtcMs(T, "12:00");
  const at = (time, n = now) => errOf(run({ date: T, time }, { now: n })) || "ok";
  ok(at("11:45") === "TIME_PAST" && at("12:00") === "TIME_PAST", "a time already passed keeps TIME_PAST");
  ok(at("12:15") === "TOO_SOON" && at("13:45") === "TOO_SOON", "inside the lead time is TOO_SOON");
  ok(at("14:00") === "ok" && at("14:15") === "ok", "exactly 120 minutes is accepted");
  ok(at("13:45", now + 59000) === "TOO_SOON" && at("14:00", now + 1000) === "TOO_SOON", "one second under the edge is TOO_SOON");
  ok(run({ date: T, time: "13:00" }, { now }).message === "That is too soon for a table request. Pick a time at least 2 hours from now, or call the restaurant.", "the TOO_SOON message is the agreed words");
  // late evening, next day just after midnight is under 2 hours too
  ok(errOf(run({ date: "2026-11-13", time: "00:30" }, { now: easternToUtcMs(T, "23:00") })) === "TOO_SOON", "just after midnight, from 11 PM, is TOO_SOON");
  // DST: spring forward 2027-03-14 (02:00 EST jumps to 03:00 EDT). Wall clock says 165 minutes, real time says 105.
  const D = "2027-03-14", dnow = easternToUtcMs(D, "00:30");
  ok(errOf(run({ date: D, time: "03:15" }, { now: dnow, today: D })) === "TOO_SOON", "DST spring forward: 00:30 to 03:15 is only 105 real minutes, TOO_SOON");
  ok(!errOf(run({ date: D, time: "03:30" }, { now: dnow, today: D })), "DST spring forward: 00:30 to 03:30 is exactly 120 real minutes, ok");
  // fall back 2026-11-01 (02:00 EDT returns to 01:00 EST): 00:30 EDT to 02:30 EST is 180 real minutes (wall clock says 120), ok.
  // The real gap is what counts: a wall clock subtraction would be wrong across the repeated hour.
  const F = "2026-11-01", fnow = easternToUtcMs(F, "00:30");
  ok(easternToUtcMs(F, "02:30") - fnow === 180 * 60000, "fall back day: the real gap from 00:30 to 02:30 is 180 minutes (the clock alone would say 120)");
  ok(!errOf(run({ date: F, time: "02:30" }, { now: fnow, today: F })) && errOf(run({ date: F, time: "02:15" }, { now: easternToUtcMs(F, "00:30") + 61 * 60000 + 1, today: F })) === "TOO_SOON", "DST fall back: real minutes decide");
}

// ---- NEW: finishChatTurn, the one function the chat handler calls ----
{
  const T = "2026-11-12", nowMs = easternToUtcMs(T, "10:00"), c = { today: T, nowMs, maxParty: 12, restaurantName: "Test Bistro" };
  const turn = (draft, reply = "Got it. Anything else?") => finishChatTurn({ parsed: { reply, draft }, ...c });
  const full = { partySize: 2, date: "2026-11-14", time: "19:15", guestName: "Gabe", note: null };
  const clean = turn(full, "Great, anything the restaurant should know?");
  ok(clean.reply === cleanReply("Great, anything the restaurant should know?", clean.draft) && clean.reply === "Great, anything the restaurant should know?" && clean.complete === true, "clean output passes the model reply through cleanReply unchanged and is complete");
  ok(turn({ ...full, guestName: null }, "What name?").complete === false && turn({ ...full, partySize: null }).complete === false && turn({ ...full, date: null }).complete === false && turn({ ...full, time: null }).complete === false, "complete is true only when all four fields are set");
  const snap = turn({ ...full, time: "19:20" }, "A table for 2 this Saturday, November 14 at 7:20 PM. What name?");
  ok(snap.draft.time === "19:15" && snap.reply === "Tables go on quarter hours, so I set 7:15 PM. Does that look right? The restaurant will answer you after you send it." && !snap.reply.includes("7:20") && snap.complete === true, "19:20 snaps to 19:15 and the reply is the quarter hours line");
  const snapNoName = turn({ ...full, time: "19:20", guestName: null }, "at 7:20 PM, what name?");
  ok(snapNoName.reply === "Tables go on quarter hours, so I set 7:15 PM. What name should the table be under?" && snapNoName.complete === false, "the adjusted line is followed by the next question");
  const past = turn({ ...full, date: "2026-11-10" }, "Tuesday it is!");
  ok(past.draft.date === null && past.reply === "Which day would you like? I can take today through January 11." && past.complete === false, "a past date gives the day line (last allowed date January 11) and null date");
  const party = turn({ ...full, partySize: 15 });
  ok(party.draft.partySize === null && party.reply === "How many people? The most Test Bistro takes here is 12." && party.complete === false, "party 15 with max 12 gives the party line");
  const soon = turn({ ...full, date: T, time: "10:30" }, "10:30 today, done!");
  ok(soon.draft.time === null && soon.reply === "That time is too soon for a request. Pick a time at least 2 hours from now, or call the restaurant." && soon.complete === false, "today plus a time 30 minutes away gives the too soon line and null time");
  ok(turn({ ...full, date: T, time: "12:00" }).draft.time === "12:00" && turn({ ...full, date: T, time: "11:45" }).draft.time === null, "today at exactly 2 hours is kept, a minute under is dropped");
  const badTime = turn({ ...full, time: "banana" });
  ok(badTime.draft.time === null && badTime.reply === "What time would you like? For example 7:00 PM or 7:15 PM.", "an unusable time gives the time line");
  const badName = turn({ ...full, guestName: "Bob123" });
  ok(badName.draft.guestName === null && badName.reply === "What name should the table be under? Letters only, please.", "an unusable name gives the name line");
  ok(turn({ ...full, partySize: 99, date: "2020-01-01" }).reply.startsWith("How many people?") && turn({ ...full, date: "2020-01-01", time: "19:20" }).reply.startsWith("Which day"), "precedence: party first, then day, before a time adjustment");
  ok(turn({ ...full, date: T, time: "10:20" }).reply.startsWith("That time is too soon") && !turn({ ...full, date: T, time: "10:20" }).reply.includes("quarter"), "too soon wins over adjusted");
  ok(turn({ ...full, guestName: "gabe" }).draft.guestName === "Gabe", "chat names are capitalized");
  const claim = turn(full, "Your table is booked for 7 PM!");
  ok(!/booked/i.test(claim.reply) && claim.reply === "Does that look right? The restaurant will answer you after you send it.", "a reply that claims booked is still replaced");
  ok(turn({ partySize: null, date: null, time: null, guestName: null, note: null }, "Hi! How many people?").reply === "Hi! How many people?", "nothing supplied: nothing rejected, the model reply stands");
  ok(finishChatTurn({ parsed: null, ...c }).complete === false && finishChatTurn({ parsed: { reply: 5, draft: "x" }, ...c }).complete === false, "garbage parsed input gives an empty, incomplete turn");
  for (const l of [snap.reply, past.reply, party.reply, soon.reply, badTime.reply, badName.reply]) ok(!/[\u2013\u2014]| - /.test(l) && !/\b(booked|confirmed|available|reserved)\b/i.test(l), "server line has no dashes and no booked or available claim: " + l);
}

if (failed) { console.error(`test-reserve-logic: ${failed} of ${count} assertions failed`); process.exit(1); }
console.log(`test-reserve-logic: OK - ${count} assertions on lib/reserve.js (called, not grepped)`);
