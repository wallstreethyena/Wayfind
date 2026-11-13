// scripts/test-reserve-logic.mjs - locks the pure rules of "Reserve a table"
// (lib/reserve.js and lib/reserveFormat.js): instant booking input rules, idempotency keys, phone only
// with consent, manage tokens, rollout gates, open time helpers and the chat turn.
// It IMPORTS the modules and CALLS them; no source greps. Every rule has a positive and a negative control.
// Nothing here touches a network. Passes under NODE_ENV=production too.
import {
  validateBookInput, newManageToken, hashManageToken, isManageTokenShape, safeEqualHex, partnerVisible, reserveEmailReady, reserveEmailAllowed,
  normalizeDraft, isDraftComplete, parseChatOutput, cleanReply, easternToUtcMs, zonedToUtcMs, zonedToday, addDays, hasContactDetails,
  snapTimeToStep, cleanGuestName, finishChatTurn, applyAvailability, nearestSlots, joinTimes, normSlot, cleanTime, cleanPhone,
  isIdempotencyKey, checkReason, leadWords, reserveErrorMessage,
} from "../lib/reserve.js";

let failed = 0, count = 0;
const ok = (cond, msg) => { count++; if (!cond) { failed++; console.error("test-reserve-logic: FAIL - " + msg); } };
const TODAY = "2026-11-11";
const KEY = "3f2b8c1e-5d4a-4b6c-9e7f-0a1b2c3d4e5f";
const base = { partySize: 4, date: "2026-11-14", time: "19:30", guestName: "Gabe", note: "Window seat please", idempotencyKey: KEY };
const run = (over = {}, ctx = {}) => validateBookInput({ ...base, ...over }, { today: TODAY, maxParty: 12, ...ctx });
const errOf = (r) => (r.ok ? null : r.error);

// positive control: the base booking is valid and normalized
const good = run();
ok(good.ok && good.value.partySize === 4 && good.value.date === "2026-11-14" && good.value.time === "19:30" && good.value.guestName === "Gabe" && good.value.note === "Window seat please" && good.value.phone === null && good.value.phoneConsent === false, "a valid booking normalizes");
ok(run({ note: undefined }).value.note === null && run({ note: "   " }).value.note === null, "an empty note becomes null");

// date window follows the partner's window_days
ok(errOf(run({ date: addDays(TODAY, -1) })) === "DATE_PAST", "yesterday is rejected");
ok(run({ date: TODAY }).ok && run({ date: addDays(TODAY, 60) }).ok, "today and today+60 are accepted");
ok(errOf(run({ date: addDays(TODAY, 61) })) === "DATE_TOO_FAR", "today+61 is rejected");
ok(run({ date: addDays(TODAY, 30) }, { windowDays: 30 }).ok && errOf(run({ date: addDays(TODAY, 31) }, { windowDays: 30 })) === "DATE_TOO_FAR", "a partner with a 30 day window refuses day 31");
ok(errOf(run({ date: "2026-02-30" })) === "INVALID_DATE" && errOf(run({ date: "11/14/2026" })) === "INVALID_DATE" && errOf(run({ date: undefined })) === "INVALID_DATE", "non dates are rejected");

// lead time: the partner's lead_minutes, in the partner's own time zone, real minutes (DST safe)
{
  const T = "2026-11-12", now = easternToUtcMs(T, "12:00");
  const at = (time, over = {}) => errOf(run({ date: T, time }, { now, today: T, ...over })) || "ok";
  ok(at("11:45") === "TIME_PAST" && at("12:00") === "TIME_PAST", "a time already passed is TIME_PAST");
  ok(at("12:15") === "TOO_SOON" && at("12:45") === "TOO_SOON" && at("13:00") === "ok", "default lead is 60 minutes");
  ok(at("13:45", { leadMinutes: 120 }) === "TOO_SOON" && at("14:00", { leadMinutes: 120 }) === "ok", "lead_minutes 120 moves the edge");
  ok(at("12:00", { leadMinutes: 0 }) === "TIME_PAST" && at("12:15", { leadMinutes: 0 }) === "ok", "lead_minutes 0 allows any future time");
  const D = "2027-03-14", dnow = easternToUtcMs(D, "00:30");
  ok(errOf(run({ date: D, time: "03:15" }, { now: dnow, today: D, leadMinutes: 120 })) === "TOO_SOON" && !errOf(run({ date: D, time: "03:30" }, { now: dnow, today: D, leadMinutes: 120 })), "DST spring forward: real minutes decide the edge");
  // a Central partner: 12:00 Central is 13:00 Eastern; the same instant gives different answers in each zone
  const tz = "America/Chicago", nowC = zonedToUtcMs(T, "12:00", tz);
  ok(nowC - easternToUtcMs(T, "12:00") === 3600000, "zonedToUtcMs: noon Central is one hour after noon Eastern");
  ok(errOf(run({ date: T, time: "12:30" }, { now: nowC, today: T, timeZone: tz })) === "TOO_SOON" && !errOf(run({ date: T, time: "13:00" }, { now: nowC, today: T, timeZone: tz })), "lead time is computed in the partner time zone");
  ok(zonedToday(Date.parse("2026-11-12T03:30:00Z"), "America/New_York") === "2026-11-11" && zonedToday(Date.parse("2026-11-12T03:30:00Z"), "America/Chicago") === "2026-11-11" && zonedToday(Date.parse("2026-11-12T05:30:00Z"), "America/New_York") === "2026-11-12" && zonedToday(Date.parse("2026-11-12T05:30:00Z"), "America/Chicago") === "2026-11-11", "zonedToday follows the partner zone");
  ok(leadWords(60) === "1 hour" && leadWords(120) === "2 hours" && leadWords(90) === "90 minutes", "leadWords reads naturally");
}

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

// idempotency key: one per summary, a real uuid
ok(isIdempotencyKey(KEY) && isIdempotencyKey(KEY.toUpperCase()), "a uuid is a valid idempotency key");
for (const k of [undefined, null, "", "abc", 5, KEY.slice(1), KEY + "0", "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz", "3f2b8c1e5d4a4b6c9e7f0a1b2c3d4e5f"]) ok(errOf(run({ idempotencyKey: k })) === "INVALID_IDEMPOTENCY_KEY", `idempotency key ${JSON.stringify(k)} rejected`);
ok(run({ idempotencyKey: KEY.toUpperCase() }).value.idempotencyKey === KEY, "the key is normalized to lower case");

// phone: accepted ONLY with consent, and never stored or sent without it
ok(errOf(run({ phone: "941-555-0199" })) === "PHONE_NEEDS_CONSENT", "a phone without phoneConsent is rejected");
ok(errOf(run({ phone: "941-555-0199", phoneConsent: false })) === "PHONE_NEEDS_CONSENT" && errOf(run({ phone: "941-555-0199", phoneConsent: "true" })) === "PHONE_NEEDS_CONSENT" && errOf(run({ phone: "941-555-0199", phoneConsent: 1 })) === "PHONE_NEEDS_CONSENT", "only the boolean true counts as consent");
const withPhone = run({ phone: "941-555-0199", phoneConsent: true });
ok(withPhone.ok && withPhone.value.phone === "(941) 555-0199" && withPhone.value.phoneConsent === true, "a phone with consent is accepted and formatted");
ok(run({ phone: "", phoneConsent: false }).ok && run({ phone: null }).value.phone === null && run({ phone: "   " }).ok, "an empty phone without consent is fine");
ok(errOf(run({ phoneConsent: true })) === "INVALID_PHONE" && errOf(run({ phone: "12345", phoneConsent: true })) === "INVALID_PHONE" && errOf(run({ phone: "abc", phoneConsent: true })) === "INVALID_PHONE", "consent with no usable number is INVALID_PHONE");
for (const [p, want] of [["(941) 555-0100", "(941) 555-0100"], ["+1 941 555 0100", "(941) 555-0100"], ["1-941-555-0100", "(941) 555-0100"], ["941.555.0100", "(941) 555-0100"], ["041 555 0100", null], ["941 055 0100", null], ["9415550100x", null]]) ok(cleanPhone(p) === want, `cleanPhone(${JSON.stringify(p)}) is ${JSON.stringify(want)}, got ${JSON.stringify(cleanPhone(p))}`);
ok(reserveErrorMessage("PHONE_NEEDS_CONSENT").includes("say yes") && !/[\u2013\u2014]/.test(reserveErrorMessage("PHONE_NEEDS_CONSENT")), "the consent message is plain words");

// reason for a restaurant cancel
ok(checkReason("Kitchen is closed").ok && checkReason("  Kitchen   closed ").value === "Kitchen closed" && !checkReason("").ok && !checkReason("x").ok && !checkReason("y".repeat(121)).ok && checkReason("y".repeat(120)).ok && !checkReason(5).ok, "cancel reason is 2 to 120 characters");

// manage tokens (restaurant dashboard)
const tok = newManageToken(), tok2 = newManageToken();
ok(isManageTokenShape(tok) && tok.length === 43 && tok !== tok2, "token is 43 chars base64url and unique");
ok(/^[a-f0-9]{64}$/.test(hashManageToken(tok)) && hashManageToken(tok) === hashManageToken(tok) && hashManageToken(tok) !== hashManageToken(tok2), "hash is sha256 hex, stable, and differs per token");
ok(hashManageToken(tok) !== tok && !hashManageToken(tok).includes(tok), "the stored hash never contains the token");
ok(!isManageTokenShape("short") && !isManageTokenShape(tok + "x") && !isManageTokenShape(null), "bad token shapes are rejected");
ok(safeEqualHex(hashManageToken(tok), hashManageToken(tok)) && !safeEqualHex(hashManageToken(tok), hashManageToken(tok2)) && !safeEqualHex("ab", "abc") && !safeEqualHex("", "") && !safeEqualHex(null, "ab") && !safeEqualHex("ab", undefined), "safeEqualHex: equal hashes match, everything else (different, length mismatch, empty, null) does not");

// rollout gates
const PROD_READY = { VERCEL_ENV: "production", WF_RESERVE_EMAIL_ENABLED: "1", RESEND_API_KEY: "k", WF_GROUP_PLAN_EMAIL_VERIFIED: "1", WF_ALERT_FROM: "Wayfind <a@gowayfind.com>" };
ok(reserveEmailReady(PROD_READY), "email ready with every condition (positive control)");
for (const k of Object.keys(PROD_READY)) {
  const e = { ...PROD_READY }; delete e[k];
  ok(!reserveEmailReady(e), `email not ready without ${k}`);
}
ok(!reserveEmailReady({ ...PROD_READY, VERCEL_ENV: "preview" }) && !reserveEmailReady({ ...PROD_READY, WF_RESERVE_EMAIL_ENABLED: "true" }) && !reserveEmailReady({ ...PROD_READY, WF_ALERT_FROM: "nope" }), "wrong env, flag value or sender is not ready");
const live = { active: true, stage: "live" }, demo = { active: true, stage: "demo" };
ok(partnerVisible(live, PROD_READY), "production shows a live active partner");
ok(partnerVisible(live, { VERCEL_ENV: "production" }), "production shows a live partner even when email is NOT ready (booking no longer needs email)");
ok(!partnerVisible(demo, PROD_READY) && !partnerVisible(demo, { VERCEL_ENV: "production" }), "production never shows a demo partner");
ok(!partnerVisible({ active: false, stage: "live" }, PROD_READY) && !partnerVisible(null, PROD_READY), "inactive or missing partner is never visible");
ok(partnerVisible(demo, { VERCEL_ENV: "preview" }) && partnerVisible(live, { VERCEL_ENV: "preview" }) && partnerVisible(demo, {}), "preview and local show live and demo");
ok(!partnerVisible({ active: true, stage: "retired" }, { VERCEL_ENV: "preview" }), "an unknown stage is never visible");
ok(reserveEmailAllowed(live, PROD_READY), "email allowed: live partner, production, email ready (positive control)");
ok(!reserveEmailAllowed(demo, PROD_READY), "email is NEVER allowed for a demo partner");
ok(!reserveEmailAllowed(live, { ...PROD_READY, VERCEL_ENV: "preview" }) && !reserveEmailAllowed(live, {}) && !reserveEmailAllowed(live, { ...PROD_READY, WF_RESERVE_EMAIL_ENABLED: "0" }) && !reserveEmailAllowed(null, PROD_READY), "email is not allowed outside production or when email is not ready");

// open time helpers
ok(normSlot("18:00:00") === "18:00" && normSlot("18:00") === "18:00" && normSlot("24:00") === null && normSlot("x") === null && normSlot(null) === null, "normSlot accepts database times");
const open = ["17:00", "17:15", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"];
ok(JSON.stringify(nearestSlots(open, "19:00", 3)) === JSON.stringify(["18:30", "19:00", "19:30"]), "nearest three around 19:00");
ok(JSON.stringify(nearestSlots(["18:30", "20:00"], "19:15", 3)) === JSON.stringify(["18:30", "20:00"]), "fewer than three open: all of them");
ok(JSON.stringify(nearestSlots(open, "19:15", 3)) === JSON.stringify(["19:00", "19:30", "18:30"].sort()), "a tie goes to the earlier time (19:00 and 19:30 first)");
ok(nearestSlots([], "19:00").length === 0 && nearestSlots(null, "19:00").length === 0, "no open times gives none");
ok(joinTimes(["18:30", "19:30", "20:00"]) === "6:30 PM, 7:30 PM or 8:00 PM" && joinTimes(["18:30", "19:30"]) === "6:30 PM or 7:30 PM" && joinTimes(["18:30"]) === "6:30 PM", "times read naturally");

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
for (const r of ["Your table is booked!", "Good news, 7 PM is available.", "7 PM is open for you", "We have a free table", "You're all set", "Confirmed for Saturday", "Email me at a@b.co", "See https://x.com", ""]) ok(cleanReply(r, emptyDraft) === "How many people will be dining?", `unsafe reply replaced: ${JSON.stringify(r)}`);
ok(!/[–—]| - /.test(cleanReply("Sure — what day – works? Or - maybe Friday", emptyDraft)), "dashes are removed from replies");

// ---- NEW: snap to the quarter hour (loose model times only; cleanTime stays strict) ----
for (const [inp, want] of [["19:20", "19:15"], ["19:23", "19:30"], ["19:53", "20:00"], ["23:55", "23:45"], ["23:53", "23:45"], ["23:30", "23:30"], ["07:07", "07:00"], ["07:08", "07:15"], ["00:05", "00:00"], ["7:20", "07:15"], ["19:30", "19:30"]]) ok(snapTimeToStep(inp) === want, `snapTimeToStep(${inp}) is ${want}, got ${snapTimeToStep(inp)}`);
for (const g of ["garbage", "24:00", "12:60", "", null, undefined, 1930, "7pm"]) ok(snapTimeToStep(g) === null, `snapTimeToStep(${JSON.stringify(g)}) is null`);
ok(cleanTime("19:20") === null && cleanTime("19:15") === "19:15", "cleanTime stays strict (an off step is still rejected)");

// ---- NEW: lower case names get capitals, a name with any capital is left exactly as typed ----
for (const [inp, want] of [["gabe", "Gabe"], ["mary-anne o'brien", "Mary-Anne O'Brien"], ["mary \u2019jo", "Mary \u2019Jo"], ["zo\u00eb m\u00fcller", "Zo\u00eb M\u00fcller"], ["Gabe", "Gabe"], ["gabe P", "gabe P"], ["McDonald", "McDonald"], ["de la Cruz", "de la Cruz"], ["MARY", "MARY"]]) ok(cleanGuestName(inp) === want, `cleanGuestName(${JSON.stringify(inp)}) is ${JSON.stringify(want)}, got ${JSON.stringify(cleanGuestName(inp))}`);
ok(run({ guestName: "gabe" }).value.guestName === "Gabe", "validateBookInput applies the capitalization (form, chat and email agree)");


// ---- finishChatTurn, the one function the chat handler calls ----
{
  const T = "2026-11-12", nowMs = easternToUtcMs(T, "10:00"), c = { today: T, nowMs, maxParty: 12, restaurantName: "Test Bistro", leadMinutes: 120 };
  const turn = (draft, reply = "Got it. Anything else?", over = {}) => finishChatTurn({ parsed: { reply, draft }, ...c, ...over });
  const full = { partySize: 2, date: "2026-11-14", time: "19:15", guestName: "Gabe", note: null };
  const clean = turn(full, "Great, anything the restaurant should know?");
  ok(clean.reply === "Great, anything the restaurant should know?" && clean.complete === true, "clean output passes the model reply through cleanReply unchanged and is complete");
  ok(turn({ ...full, partySize: null }).complete === false && turn({ ...full, date: null }).complete === false && turn({ ...full, time: null }).complete === false, "complete is true only when party, day and time are set (the name is not part of the chat draft)");
  const snap = turn({ ...full, time: "19:20" }, "A table for 2 this Saturday, November 14 at 7:20 PM. What name?");
  ok(snap.draft.time === "19:15" && snap.reply === "Tables go on quarter hours, so I set 7:15 PM. Does that look right? Tap Book table when you are ready." && !snap.reply.includes("7:20") && snap.complete === true, "19:20 snaps to 19:15 and the reply is the quarter hours line");
  const past = turn({ ...full, date: "2026-11-10" }, "Tuesday it is!");
  ok(past.draft.date === null && past.reply === "Which day would you like? I can take today through January 11." && past.complete === false, "a past date gives the day line and null date");
  const short = turn({ ...full, date: "2026-12-30" }, "ok", { windowDays: 30 });
  ok(short.draft.date === null && short.reply === "Which day would you like? I can take today through December 12.", "the day line follows the partner window_days");
  const party = turn({ ...full, partySize: 15 });
  ok(party.draft.partySize === null && party.reply === "How many people? The most Test Bistro takes here is 12." && party.complete === false, "party 15 with max 12 gives the party line");
  const soon = turn({ ...full, date: T, time: "10:30" }, "10:30 today, done!");
  ok(soon.draft.time === null && soon.reply === "That time is too soon. Pick a time at least 2 hours from now, or call the restaurant." && soon.complete === false, "a time inside the lead time gives the too soon line and null time");
  ok(turn({ ...full, date: T, time: "10:30" }, "x", { leadMinutes: 60 }).reply === "That time is too soon. Pick a time at least 1 hour from now, or call the restaurant." && turn({ ...full, date: T, time: "11:00" }, "x", { leadMinutes: 60 }).draft.time === "11:00", "the lead time words and the edge follow the partner lead_minutes");
  ok(turn({ ...full, date: T, time: "12:00" }).draft.time === "12:00" && turn({ ...full, date: T, time: "11:45" }).draft.time === null, "today at exactly the lead time is kept, a minute under is dropped");
  const badTime = turn({ ...full, time: "banana" });
  ok(badTime.draft.time === null && badTime.reply === "What time would you like? For example 7:00 PM or 7:15 PM.", "an unusable time gives the time line");
  const modelName = turn({ ...full, guestName: "Bob123" });
  ok(!("guestName" in modelName.draft) && modelName.complete === true && !/name/i.test(modelName.reply), "a name from the model is ignored: the chat draft never carries or asks for a name");
  ok(turn({ ...full, partySize: 99, date: "2020-01-01" }).reply.startsWith("How many people?") && turn({ ...full, date: "2020-01-01", time: "19:20" }).reply.startsWith("Which day"), "precedence: party first, then day, before a time adjustment");
  ok(!("guestName" in turn({ ...full, guestName: "gabe" }).draft), "the chat draft has no guestName key even when the model sends one");
  const claim = turn(full, "Your table is booked for 7 PM!");
  ok(!/booked/i.test(claim.reply) && claim.reply === "Does that look right? Tap Book table when you are ready.", "a reply that claims booked is still replaced");
  ok(finishChatTurn({ parsed: null, ...c }).complete === false && finishChatTurn({ parsed: { reply: 5, draft: "x" }, ...c }).complete === false, "garbage parsed input gives an empty, incomplete turn");

  // ---- applyAvailability: the model is never the source of availability ----
  const t = (draft) => turn(draft, "Sounds good.");
  const withTime = t(full);
  const openSlots = ["18:30", "19:00", "19:15", "19:30", "20:00"];
  const v = applyAvailability({ turn: withTime, slots: openSlots, restaurantName: "Test Bistro" });
  ok(v.verified === true && v.complete === true && v.draft.time === "19:15" && v.reply === "Sounds good.", "a time that is in the real open list is verified and complete");
  const taken = applyAvailability({ turn: t({ ...full, time: "19:00" }), slots: ["18:30", "19:15", "19:30", "20:00", "20:30"], restaurantName: "Test Bistro" });
  ok(taken.verified === false && taken.complete === false && taken.draft.time === null && taken.reply === "7:00 PM is taken. I can do 6:30 PM, 7:15 PM or 7:30 PM. Which works?", "a time that is not open is nulled and ONE server line offers the 3 nearest: " + taken.reply);
  ok(taken.draft.partySize === 2 && taken.draft.date === "2026-11-14" && !("guestName" in taken.draft), "...and the rest of the draft is kept");
  const none = applyAvailability({ turn: withTime, slots: [], restaurantName: "Test Bistro" });
  ok(none.verified === false && none.draft.date === null && none.draft.time === null && none.reply === "Test Bistro has no open tables on Saturday, November 14. Which other day works?", "no open times that day: the date is dropped and the line asks for another day: " + none.reply);
  const unknown = applyAvailability({ turn: t({ ...full, date: null }), slots: null, restaurantName: "Test Bistro" });
  ok(unknown.verified === false && unknown.complete === false && unknown.reply === "Sounds good.", "day not known yet: nothing to check, nothing verified");
  const noTime = applyAvailability({ turn: t({ ...full, time: null }), slots: openSlots, restaurantName: "Test Bistro" });
  ok(noTime.verified === false && noTime.complete === false, "a day with open times but no time chosen is not verified");
  ok(applyAvailability({ turn: withTime, slots: null, restaurantName: "x" }).verified === false, "no slot list at all can never verify");
  for (const l of [snap.reply, past.reply, party.reply, soon.reply, badTime.reply, modelName.reply, taken.reply, none.reply]) ok(!/[\u2013\u2014]| - /.test(l) && !/\b(booked|confirmed|available|reserved)\b/i.test(l), "server line has no dashes and no booked or available claim: " + l);
}

if (failed) { console.error(`test-reserve-logic: ${failed} of ${count} assertions failed`); process.exit(1); }
console.log(`test-reserve-logic: OK - ${count} assertions on lib/reserve.js (called, not grepped)`);
