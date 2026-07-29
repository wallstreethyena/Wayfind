// scripts/check-quota-reservation.mjs
//
// Locks the fix for #444: a quota preflight must RESERVE the budget a sweep
// needs, not prove that one call succeeds.
//
// The defect: census-build's preflight made one searchText and one searchNearby
// call and reported "quota is available" on two 200s. Minutes later a 244-call
// sweep died on its FIRST call with 429 SearchNearbyRequest per day. One 200 is
// consistent with exactly one call of headroom — the check could not fail in the
// way that mattered.
//
// Two properties this suite exists to keep:
//   1. A refusal carries NUMBERS. "Quota exceeded" tells the next person nothing;
//      "needed 244, 180 remaining" tells them whether to wait an hour or a day.
//   2. Reservations are visible ACROSS sweeps. Two lanes sharing a daily cap is
//      how the original 429 happened — each saw "quota looks fine" because
//      neither could see the other's planned spend.
import { writeFileSync, existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const LEDGER = join(tmpdir(), "wf-quota-check-" + process.pid + ".json");
process.env.WF_QUOTA_LEDGER = LEDGER;
process.env.WF_CAP_SEARCH_NEARBY = "1000";
process.env.WF_CAP_SEARCH_TEXT = "2000";
if (existsSync(LEDGER)) rmSync(LEDGER);

const Q = await import("../lib/quotaLedger.js");

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("check-quota-reservation: FAIL — " + m); fails++; } };
const reset = () => { if (existsSync(LEDGER)) rmSync(LEDGER); };

// ── 1. caps read from env; a clean ledger has full headroom ────────────────
reset();
ok(Q.CAPS.searchNearby === 1000 && Q.CAPS.searchText === 2000, `caps read from env (got ${Q.CAPS.searchNearby}/${Q.CAPS.searchText})`);
ok(Q.remaining().searchNearby === 1000, "clean ledger: full nearby headroom");

// ── 2. a reservation REDUCES what the next sweep can have ─────────────────
// This is the property the old preflight lacked entirely.
reset();
const a = Q.reserve({ label: "laneA", calls: { searchNearby: 800, searchText: 100 } });
ok(a.ok === true, "laneA reservation granted");
ok(Q.remaining().searchNearby === 200, `after laneA reserves 800, only 200 nearby remain (got ${Q.remaining().searchNearby})`);

// ── 3. THE TWO-LANE CASE — the 429 that started this ─────────────────────
const b = Q.reserve({ label: "laneB", calls: { searchNearby: 500, searchText: 100 } });
ok(b.ok === false, "laneB is REFUSED — its 500 does not fit in the 200 laneA left");
ok(typeof b.needed === "object" && typeof b.available === "object", "refusal carries needed/available objects, not a bare boolean");
ok(b.needed.searchNearby === 500 && b.available.searchNearby === 200, `refusal states needed 500 / available 200 (got ${b.needed?.searchNearby}/${b.available?.searchNearby})`);
ok(Array.isArray(b.detail) && /needed 500/.test(b.detail.join(" ")) && /200 remaining/.test(b.detail.join(" ")),
  `refusal detail names both numbers (got: ${JSON.stringify(b.detail)})`);
ok(/laneA/.test(JSON.stringify(b.outstanding)), "refusal names the OTHER sweep holding the budget");
ok(b.ledger === LEDGER, "refusal states the ledger path — a split ledger silently disables all of this");

// ── 4. a fitting reservation still succeeds — the gate is not just 'no' ───
const c = Q.reserve({ label: "laneC", calls: { searchNearby: 200, searchText: 50 } });
ok(c.ok === true, "laneC's 200 DOES fit in the remaining 200 — the gate permits what fits");
ok(Q.remaining().searchNearby === 0, "nearby headroom now exactly 0");

// ── 5. settle records ACTUAL spend and frees the remainder ────────────────
reset();
const d = Q.reserve({ label: "laneD", calls: { searchNearby: 900, searchText: 0 } });
ok(Q.remaining().searchNearby === 100, "laneD holds 900");
const s = Q.settle(d.id, { searchNearby: 300, searchText: 0 });
ok(s.settled.searchNearby === 300, "settle records the 300 actually spent");
ok(Q.remaining().searchNearby === 700, `600 unused released: 1000 - 300 spent = 700 remaining (got ${Q.remaining().searchNearby})`);
ok(Q.read().spent.searchNearby === 300, "spend is persisted, not just released");

// ── 6. a sweep that dies partway still SPENT what it made ────────────────
// settle() is called on process exit precisely so a 429 mid-sweep is recorded.
reset();
const e = Q.reserve({ label: "laneE", calls: { searchNearby: 500, searchText: 0 } });
Q.settle(e.id, { searchNearby: 137, searchText: 0 }); // crashed after 137 calls
ok(Q.read().spent.searchNearby === 137, "a partial sweep's spend is recorded (137), not discarded");

// ── 7. release gives budget back unused ──────────────────────────────────
reset();
const f = Q.reserve({ label: "laneF", calls: { searchNearby: 900, searchText: 0 } });
ok(Q.remaining().searchNearby === 100, "laneF holds 900");
Q.release(f.id);
ok(Q.remaining().searchNearby === 1000, "release returns the full 900 — --preflight must not consume budget");
ok(Q.read().spent.searchNearby === 0, "release records NO spend");

// ── 8. an abandoned reservation must not hold budget to midnight ──────────
// Without expiry, one crashed sweep refuses every later sweep for the rest of
// the day for a run that is not happening.
reset();
const now = 1_800_000_000_000;
const g = Q.reserve({ label: "laneG", calls: { searchNearby: 900, searchText: 0 } }, now);
ok(g.ok === true, "laneG reserved at t0");
ok(Q.remaining(Q.read(now)).searchNearby === 100, "held at t0");
const later = now + Q.RESERVATION_TTL_MS + 1000;
ok(Q.remaining(Q.read(later)).searchNearby === 1000, `after TTL (${Q.RESERVATION_TTL_MS / 3600000}h) the abandoned reservation no longer holds budget`);

// ── 9. degenerate input is refused with a reason ─────────────────────────
reset();
const z = Q.reserve({ label: "zero", calls: {} });
ok(z.ok === false && /not a reservation/.test(z.reason), "a zero-call reservation is refused — it would be a liveness check again");

// ── 10. the ledger write is atomic ───────────────────────────────────────
// A crash mid-write must not leave a truncated file that parses as {} and
// silently resets the day's spend to zero.
reset();
Q.reserve({ label: "atomic", calls: { searchNearby: 10, searchText: 10 } });
ok(existsSync(LEDGER), "ledger written");
ok(!existsSync(LEDGER + ".tmp"), "no .tmp left behind — write-then-rename completed");
ok(JSON.parse(readFileSync(LEDGER, "utf8")) && true, "ledger parses as valid JSON");

// ── 11. ABSENT is not CORRUPT — and only one of them may refuse ──────────
// Conflating these is the trap. No file = legitimate first run = full headroom.
// A file that exists but cannot be trusted = we have LOST TRACK of spend, which
// is the one state where an unmetered sweep is most dangerous.
reset();
ok(Q.read().corrupt === false, "an ABSENT ledger is not corrupt — first run of the day must work");
ok(Q.remaining().searchNearby === 1000, "absent ledger gives full headroom");
ok(Q.reserve({ label: "first", calls: { searchNearby: 10, searchText: 10 } }).ok === true, "a reservation is GRANTED on an absent ledger");

// ── 11b. a corrupt ledger FAILS CLOSED ───────────────────────────────────
// A refused sweep costs a wait. A day we did not meter costs money.
reset();
writeFileSync(LEDGER, "{not json");
const bad = Q.read();
ok(bad.corrupt === true, "unparseable ledger is flagged corrupt");
ok(/unparseable/.test(bad.corruptReason || ""), `corruptReason names the cause (got ${bad.corruptReason})`);
const refusedC = Q.reserve({ label: "afterCorrupt", calls: { searchNearby: 1, searchText: 1 } });
ok(refusedC.ok === false, "a corrupt ledger REFUSES every reservation — fail CLOSED");
ok(refusedC.corrupt === true, "the refusal is flagged as corruption, not scarcity");

// The two failure modes need OPPOSITE operator responses — waiting helps one and
// is useless for the other — so the message must not read as "out of quota".
ok(/NOT a quota problem/i.test(refusedC.reason), `refusal says this is NOT a quota problem (got: ${refusedC.reason})`);
ok(/waiting.*will NOT fix|reset will NOT/i.test(refusedC.reason), "refusal says waiting for the reset will not help");
ok(/FIX:/.test((refusedC.detail || []).join(" ")), "refusal tells the operator what to actually do");
ok(!/remaining/.test(refusedC.reason), "refusal does NOT phrase itself as remaining-headroom");
ok(/CORRUPT/.test(Q.describe()), "describe() shows a loud CORRUPT banner rather than a plausible zero");

// ── 11c. tampering is detected, not just malformed JSON ──────────────────
// Valid JSON with a wrong checksum is the dangerous case: it parses fine and
// would otherwise be trusted.
reset();
writeFileSync(LEDGER, JSON.stringify({ [Q.dayKey()]: { spent: { searchNearby: 900, searchText: 0 }, reservations: {} }, __sum: "not-the-real-sum" }));
const tampered = Q.read();
ok(tampered.corrupt === true, "valid JSON with a WRONG checksum is corrupt — this is the case that would otherwise be trusted");
ok(/checksum MISMATCH/.test(tampered.corruptReason || ""), `corruptReason names the mismatch (got ${tampered.corruptReason})`);
reset();
writeFileSync(LEDGER, JSON.stringify({ [Q.dayKey()]: { spent: { searchNearby: 0, searchText: 0 }, reservations: {} } }));
ok(Q.read().corrupt === true, "a ledger with NO checksum is corrupt — hand-edited or written by an older version");

// ── 11d. the checksum must not reject the module's OWN writes ────────────
// A guard that fires on correct code gets disabled; so must an integrity check.
reset();
Q.reserve({ label: "roundtrip", calls: { searchNearby: 5, searchText: 5 } });
ok(Q.read().corrupt === false, "a ledger this module just wrote reads back as VALID — the checksum is not self-rejecting");
const rt = Q.read();
ok(rt.reservations && Object.keys(rt.reservations).length === 1, "and the reservation survives the round trip");

// ── 11e. CAP DRIFT — a 429 is evidence about the real cap (#461 interim) ──
// CAPS is a hardcoded record of a console value nobody has re-verified. A wrong
// cap makes the ledger confidently wrong: it grants against headroom that does
// not exist and the green preflight vouches for the 429 that follows.
reset();
ok(Q.effectiveCap("searchNearby") === 1000, "with no observed 429, effectiveCap == configured cap");
const noted = Q.noteQuotaExhausted("searchNearby", 400);
ok(noted.recorded === true, "a 429 observation is recorded");
ok(Q.effectiveCap("searchNearby") === 400, `effectiveCap CLAMPS to the observed 429 point (got ${Q.effectiveCap("searchNearby")})`);
ok(Q.remaining().searchNearby === 400, "remaining headroom follows the clamp, not the stale cap");
const w = Q.capWarnings();
ok(w.length === 1 && /CAP DRIFT/.test(w[0]), "a drift warning is raised");
ok(/at most 400/i.test(w[0]) && /600/.test(w[0]), `warning states the ceiling and the size of the error (got: ${w[0]})`);
ok(/another key on the project/i.test(w[0]), "warning names the likeliest cause — quota is per-project, not per-key");
ok(/CLAMPED/.test(Q.describe()), "describe() shows the clamp rather than the stale cap");

// The clamp must actually GATE, not just warn.
const afterClamp = Q.reserve({ label: "tooBig", calls: { searchNearby: 500, searchText: 0 } });
ok(afterClamp.ok === false, "a reservation above the CLAMPED cap is refused — the clamp gates, it does not merely warn");
ok(Q.reserve({ label: "fits", calls: { searchNearby: 300, searchText: 0 } }).ok === true, "…and one below it is still granted");

// Lowest observation wins — the tightest evidence about the ceiling.
reset();
Q.noteQuotaExhausted("searchNearby", 700);
Q.noteQuotaExhausted("searchNearby", 500);
ok(Q.effectiveCap("searchNearby") === 500, `the LOWEST observation is kept (got ${Q.effectiveCap("searchNearby")})`);
Q.noteQuotaExhausted("searchNearby", 900);
ok(Q.effectiveCap("searchNearby") === 500, "a HIGHER later observation does not loosen the clamp");

// Clamping the wrong SKU would hide a real drift and invent a fake one.
reset();
Q.noteQuotaExhausted("searchText", 100);
ok(Q.effectiveCap("searchText") === 100, "searchText clamps");
ok(Q.effectiveCap("searchNearby") === 1000, "searchNearby is UNAFFECTED — the clamp is per-SKU");
ok(Q.noteQuotaExhausted("nonsenseSku", 5).recorded === false, "an unknown SKU is refused, not silently recorded");

// A corrupt ledger must not accept drift evidence either.
reset();
writeFileSync(LEDGER, "{not json");
ok(Q.noteQuotaExhausted("searchNearby", 10).recorded === false, "a corrupt ledger refuses to record drift — nothing may be trusted from it");

// ── 12. census-build must RESERVE, not probe ─────────────────────────────
const src = readFileSync("scripts/census-build.mjs", "utf8");
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
ok(/reserve\(\{/.test(code), "census-build calls reserve()");
ok(/settle\(/.test(code) && /release\(/.test(code), "census-build settles and releases");
ok(!/preflight: both SKUs answering/.test(code), "the old liveness-preflight message is gone");
ok(/process\.on\("exit"/.test(code), "settle is wired to process exit — a crashed sweep must not hold budget");
ok(/noteQuotaExhausted\(/.test(code), "census-build records 429 evidence for cap-drift detection");
ok(/SearchNearbyRequest/.test(code) && /SearchTextRequest/.test(code), "census-build reads WHICH sku 429'd from Google's message — clamping the wrong one hides a real drift");

reset();
if (fails) { console.error(`check-quota-reservation: ${fails} failure(s)`); process.exit(1); }
console.log("check-quota-reservation: OK — reservations reduce cross-sweep headroom, the two-lane collision is refused with needed/available numbers and names the holding sweep, settle records partial spend, release returns budget, abandoned reservations expire, writes are atomic, and census-build reserves instead of probing");
