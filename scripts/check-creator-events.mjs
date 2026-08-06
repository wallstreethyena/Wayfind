// scripts/check-creator-events.mjs — a creator's event may not outlive its dates.
//
// The failure this guard exists to prevent is specific and it is the worst one
// the events surface can produce: telling a real person a festival is on when
// it finished five months ago, or that a market runs this Saturday when the
// season ended in April. Both are one careless "roll it forward" away.
//
// So the property asserted here is absolute: NOTHING emits past its
// `verified.through` date. Not with a caveat, not with last year's dates —
// nothing. Everything else in this file protects that one line.
import { CREATOR_EVENTS, creatorEventsFor, occurrences, needsVerification, isVerified } from "../lib/creatorEvents.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0;
const fail = (m) => { console.error("check-creator-events: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };
const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const D = (s) => new Date(s + "T12:00:00Z");

// ── 0. PROBE ─────────────────────────────────────────────────────────────────
ok(CREATOR_EVENTS.length >= 3, `events are registered (got ${CREATOR_EVENTS.length}) — an empty registry makes everything below vacuous`);

// ── 1. THE PROPERTY: nothing outlives its verification ───────────────────────
for (const ev of CREATOR_EVENTS) {
  const through = ev.verified && ev.verified.through;
  ok(typeof through === "string" && /^\d{4}-\d{2}-\d{2}$/.test(through),
     `"${ev.key}" carries a real verified.through date — an entry with no expiry is an entry that can never be wrong, which is the problem`);
  ok(typeof ev.verified.source === "string" && ev.verified.source.length > 40,
     `"${ev.key}" records WHERE its dates came from, so the next person can re-check them without re-reading the corpus`);
  // The day after expiry: silence. Tested at a full year out too, because the
  // tempting bug is an annual rule that quietly regenerates next year.
  const [y, m, d] = through.split("-").map(Number);
  const dayAfter = new Date(Date.UTC(y, m - 1, d + 1, 12));
  ok(occurrences(ev, dayAfter, 400).length === 0,
     `"${ev.key}" emits NOTHING the day after ${through}`);
  ok(occurrences(ev, new Date(Date.UTC(y + 1, m - 1, d, 12)), 400).length === 0,
     `"${ev.key}" still emits nothing a YEAR later — an annual event must never roll its own dates forward`);
  // And every occurrence it DOES emit is inside the window.
  const [sy, sm, sd] = through.split("-").map(Number);
  for (const date of occurrences(ev, new Date(Date.UTC(sy, sm - 1, sd - 200, 12)), 400)) {
    ok(date <= through, `"${ev.key}" occurrence ${date} is within its verified window`);
  }
}

// A MALFORMED entry — no verification block at all — emits nothing and does not
// throw. This is the distinct job of the guard clause at the top of
// occurrences(): the `stop` clamp below it cannot help here, because there is no
// `verified.through` to clamp to and reading one would throw. Added after the
// first RED pass showed that removing the guard clause still passed on every
// well-formed entry — the clamp was silently covering for it.
{
  let threw = false, got = null;
  try { got = occurrences({ key: "no-verification", schedule: { type: "nth-dow", dow: 6, nths: [1, 3] } }, D("2026-08-06"), 90); }
  catch (e) { threw = true; }
  ok(!threw, "an entry with no verified block does not throw — a curator's typo must not take down the events route");
  ok(Array.isArray(got) && got.length === 0, "…and emits nothing, because unverified means unpublishable");
}
{
  let threw = false, got = null;
  try { got = occurrences({ key: "empty-through", schedule: { type: "once", from: "2026-08-01", to: "2026-08-30" }, verified: {} }, D("2026-08-06"), 90); }
  catch (e) { threw = true; }
  ok(!threw && Array.isArray(got) && got.length === 0, "…same for a verified block with no `through` date");
}

// ── 2. THE RECURRENCE MATH ───────────────────────────────────────────────────
// 1st and 3rd Saturday, checked against a hand-computed calendar. Aug 2026:
// Saturdays fall on 1, 8, 15, 22, 29 — so 1st = Aug 1, 3rd = Aug 15.
{
  const market = CREATOR_EVENTS.find((e) => e.schedule && e.schedule.type === "nth-dow");
  ok(!!market, "an nth-dow event exists to test the month-walking math");
  const probe = { ...market, verified: { ...market.verified, through: "2026-12-31" } };
  const got = occurrences(probe, D("2026-08-06"), 90);
  ok(got[0] === "2026-08-15", `the next 3rd Saturday after Aug 6 2026 is Aug 15 (got ${got[0]})`);
  ok(got[1] === "2026-09-05", `then the 1st Saturday of September, Sep 5 (got ${got[1]})`);
  ok(got[2] === "2026-09-19", `then the 3rd, Sep 19 (got ${got[2]})`);
  ok(got.every((s) => new Date(s + "T12:00:00Z").getUTCDay() === market.schedule.dow),
     "every emitted date really is the right weekday — not an off-by-one from month-boundary arithmetic");
  ok(new Set(got).size === got.length, "no duplicate occurrences");
  ok(got.join(",") === [...got].sort().join(","), "occurrences come back in date order");
  // A month whose 1st falls on the target weekday is the classic off-by-one.
  const aug = occurrences(probe, D("2026-07-30"), 10);
  ok(aug.includes("2026-08-01"), "Aug 1 2026 IS the 1st Saturday and is emitted (the shift==0 edge case)");
}

// ── 3. A WINDOW THAT WRAPS THE NEW YEAR ──────────────────────────────────────
{
  const lights = CREATOR_EVENTS.find((e) => e.schedule && e.schedule.type === "window");
  ok(!!lights, "a seasonal window event exists to test year-wrapping");
  const probe = { ...lights, verified: { ...lights.verified, through: "2027-01-05" } };
  const got = occurrences(probe, D("2026-12-30"), 20);
  ok(got.includes("2026-12-30") && got.includes("2027-01-02"),
     "a Nov→Jan window spans the new year instead of ending on Dec 31");
  ok(!got.includes("2027-01-06"), "…and stops when the window closes");
  ok(occurrences(probe, D("2026-09-01"), 20).length === 0, "…and emits nothing in September, outside the window");
}

// ── 4. GEO, SHAPE AND CREDIT ─────────────────────────────────────────────────
{
  const near = creatorEventsFor(27.5942, -82.4257, D("2026-03-01"));
  const far = creatorEventsFor(61.2181, -149.9003, D("2026-03-01")); // Anchorage
  ok(far.events.length === 0, "an event 4,000 miles away is not 'near you'");
  ok(near.configured === true, "the source reports itself configured, like every other provider");
  for (const e of near.events) {
    ok(/^ce_[a-z0-9-]+_\d{4}-\d{2}-\d{2}$/.test(e.id), `event id "${e.id}" embeds its date, so a tap resolves to the right occurrence`);
    ok(/^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.name && e.venue && e.city, `"${e.name}" carries the fields lib/eventsPipeline.js validates on`);
    ok(typeof e.lat === "number" && typeof e.lng === "number", `"${e.name}" carries real coordinates for the geo guard`);
    ok(e.source === "Creator picks", `"${e.name}" declares its provider, so it can be attributed and dropped independently`);
    ok(!!e.creator && !!e.creatorVideo, `"${e.name}" credits the creator who surfaced it and links their post — the same deal places get`);
  }
  ok(near.events.length > 0, "…and at a date when something IS verified, events actually come out (otherwise the loop above proves nothing)");
}

// ── 5. THE WORK QUEUE IS REAL ────────────────────────────────────────────────
{
  const q = needsVerification(D("2026-08-06"), 30);
  ok(q.length >= 1, "expired events surface in needsVerification() rather than vanishing silently");
  ok(q.every((r) => r.through), "every queued row says what date it expired on");
  ok(q.every((r) => r.video || r.source), "…and how to go re-check it");
  ok(q.join === Array.prototype.join && q[0].through <= q[q.length - 1].through, "the queue is ordered by deadline, soonest first");
  const all = needsVerification(D("2020-01-01"), 0);
  ok(all.length < CREATOR_EVENTS.length || CREATOR_EVENTS.every((e) => e.verified.through <= "2020-01-01"),
     "the queue filters rather than returning everything unconditionally");
}

// ── 6. CATEGORY SEPARATION ───────────────────────────────────────────────────
// The reason this file exists: a dated thing must not live in the place list.
{
  const places = readFileSync(path.join(REPO, "lib/creatorVideos.js"), "utf8");
  for (const ev of CREATOR_EVENTS) {
    if (!ev.video) continue;
    ok(!places.includes(ev.video),
       `"${ev.key}"'s post is NOT curated as a place — an event in the place list is a recommendation that expires without anyone noticing`);
  }
}

// ── 7. THE ROUTE ACTUALLY CALLS IT ───────────────────────────────────────────
{
  const route = readFileSync(path.join(REPO, "app/api/events/route.js"), "utf8");
  ok(/import \{ creatorEventsFor \}/.test(route), "the events route imports the source");
  ok(/withDeadline\("Creator picks", Promise\.resolve\(creatorEventsFor\(lat, lng\)\)\)/.test(route),
     "…and merges it alongside the other providers, so it inherits the pipeline's dedup, geo guard and cap instead of a parallel path");
}

// ── 8. isVerified IS NOT TRIVIALLY TRUE ──────────────────────────────────────
ok(isVerified({ verified: { through: "2030-01-01" } }, "2026-08-06") === true, "isVerified is true inside the window");
ok(isVerified({ verified: { through: "2026-08-05" } }, "2026-08-06") === false, "…and false one day past it");
ok(isVerified({}, "2026-08-06") === false, "…and false when there is no verification at all — fails closed");

console.log(`check-creator-events: PASS (${pass} assertions)`);
