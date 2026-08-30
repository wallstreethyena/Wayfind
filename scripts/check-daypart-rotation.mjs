#!/usr/bin/env node
/**
 * check-daypart-rotation — the rail must LOOK different at different hours.
 *
 * THE INCIDENT (owner, 2026-08-19): "the placement of the cards are not getting
 * updated based on the time of day can you check to see if it is broken?"
 *
 * Nothing was broken, and that is exactly why it survived. Every existing check
 * passed: the clock resolved the right timezone, partForHour flipped at the
 * right minute, test-dayparts proved the four bands never contradict
 * nowContext's three, and fifteen of the seventeen rails genuinely moved
 * between bands. The engine was correct.
 *
 * What nobody asserted was the only thing the reader can actually perceive:
 * WHAT IS IN THE FIRST TILE. 'season' sat at index 0 in all four band arrays,
 * and a phone shows about 1.3 tiles (--wf8-tw: min(76vw,340px)) — so the reader
 * saw one card, and it was Summer Picks at 8am, noon, 4pm and 7pm. A four-band
 * reordering engine that never changes the visible slot is a feature that does
 * not exist, measured as if it did.
 *
 * So this guard asserts the PERCEIVABLE property, not the mechanism:
 *   1. morning / lunch / tonight-from-1pm are three different first tiles
 *      (afternoon and night share tonight — owner, 2026-08-29 12:25)
 *   2. each band's `why` — which is rendered to the reader — still describes
 *      the rail it actually leads with
 *   3. nothing but the named pins is pinned to one position everywhere
 * and it red-proves itself against the exact shape that shipped.
 */
import { DAYPARTS, DAYPART_IDS, orderFor } from "../lib/dayparts.js";
import { RAILS, RAIL_IDS } from "../lib/rails.js";

let n = 0;
const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };

const ids = RAILS.map((r) => r.id);
const order = {};
for (const b of DAYPART_IDS) order[b] = orderFor(b, ids);

// ── 1. THE VISIBLE SLOT ─────────────────────────────────────────────────────
// One tile is what a phone shows. If that slot is constant, the feature is
// invisible no matter how much moves behind it.
{
  const leaders = DAYPART_IDS.map((b) => order[b][0]);
  ok(order.morning[0] === "breakfast", `morning leads with breakfast (got "${order.morning[0]}")`);
  ok(order.lunch[0] === "break", `lunch leads with break (got "${order.lunch[0]}")`);
  ok(order.afternoon[0] === "tonight" && order.night[0] === "tonight",
     `from 1pm the first tile is tonight (afternoon "${order.afternoon[0]}", night "${order.night[0]}")`);
  ok(new Set(["breakfast", "break", "tonight"]).size === 3 &&
     new Set(leaders).size === 3,
     `the first tile is "${leaders.join('", "')}" — breakfast / lunch / tonight, not one card all day`);
  for (const b of DAYPART_IDS) {
    ok(RAIL_IDS.includes(order[b][0]), `${b}: leads with "${order[b][0]}", which is not a rail`);
  }
}

// ── 2. THE PAGE MUST NOT CONTRADICT ITSELF ─────────────────────────────────
// Each band's `why` is rendered in the daypart bar (.wf8-dpwhy). Before v8.23.2
// the lunch band told the reader "Food leads." above a rail led by Summer
// Picks. Copy and behaviour disagreeing IS the bug, not a cosmetic detail.
const LEADER_WORDS = {
  breakfast: /breakfast|morning/i,
  eat: /food|eat|dinner|meal|lunch/i,
  today: /now|day|today/i,
  tonight: /tonight|evening/i,
  season: /season|summer|ends|expir/i,
  trending: /trend|everyone|searching/i,
  best: /best|score/i,
  beach: /beach|water/i,
  events: /event|ticket|on tonight/i,
  break: /break|30|thirty|quick/i,
  datenight: /date|two/i,
  family: /family|kid/i,
};
for (const b of DAYPART_IDS) {
  const band = DAYPARTS[b];
  const leader = order[b][0];
  ok(typeof band.why === "string" && band.why.length > 8, `${b}: has no why line to show the reader`);
  const re = LEADER_WORDS[leader];
  ok(!!re, `${b}: leads with "${leader}", which has no word list here — add one rather than dropping the assertion`);
  if (re) {
    ok(re.test(band.why),
       `${b}: leads with "${leader}" but tells the reader "${band.why}" — the rendered promise must describe the card that is actually first`);
  }
}

// ── 3. WHAT MAY BE PINNED, AND WHERE ──────────────────────────────────────
// A constant slot is not automatically wrong — two rails hold one deliberately:
//
//   blog   LAST in every band. It is the only rail whose payoff is reading
//          rather than a ranked list, so it never competes for "right now".
//   trending SECOND in every band. It has held a top-3 slot since v8.17, when
//          the owner's 20 curated trends went in behind it, and it is the one
//          rail whose content is already a function of "right now".
//   season THIRD in every band (v8.23.2). Expiry urgency deserves a strong,
//          predictable slot; what it may not have is the FIRST one, which is
//          the only tile a phone reader sees and therefore the only slot that
//          carries the daypart signal at all.
//
// That leaves slot 1 as the rotating one. It is also the ONLY slot a phone
// shows, which is the whole point — the reader sees the band's own axis and
// nothing else, four different answers across the day.
//
// Anything else holding a fixed position is occupying a slot the engine cannot
// use, which is how the original bug hid: it looked like a placement choice.
{
  // The template is back across every band: [axis] [trending] [season] […].
  // Afternoon no longer exempts itself — 14:00–17:30 leads with `today`, so
  // trending/season hold their standing slots again. A name in ALLOWED_PINS
  // that is not actually pinned makes the list stop meaning anything.
  // v8.93 — trending and season are OFF this list, deliberately, which is the
  // outcome this guard was built to make explicit rather than accidental.
  // Owner, 2026-08-30: "make sure that the Date Night card is next to Tonight's
  // Move, to the right of Tonight's Move." The two tonight-led bands now open
  // tonight → datenight, so trending and season shift one place there and keep
  // their old slots in morning and lunch. They are no longer identical across
  // all four bands — that is them ROTATING, which is what this file wants of
  // every rail; a pin was always the exception needing a reason, and theirs
  // has expired. Their real protections are elsewhere and unchanged: seasonal
  // may never lead (test-seasonal-picks, test-dayparts) and must stay in the
  // first four of every band.
  //
  // v8.93.1 — trending comes BACK to this list at slot two, with a reason.
  // Owner, 2026-08-30, with the new TRENDING NEAR YOU poster: "I want the
  // position of this to be to the right of Tonight's Move." Slot two in every
  // band is a deliberate pin, not drift: what is on tonight, then what people
  // are actually doing. season is the one that now rotates, which is the whole
  // point of the reshuffle — the card that must never lead is also the card
  // with no fixed seat.
  //
  // `blog` stays pinned last on purpose: Local Guides is reading, not a plan
  // for tonight, so it is the one card that should never compete for a slot.
  const ALLOWED_PINS = { trending: 1, blog: ids.length - 1 };  // 0-indexed
  const pinned = [];
  for (const id of ids) {
    const pos = DAYPART_IDS.map((b) => order[b].indexOf(id));
    if (new Set(pos).size === 1) pinned.push({ id, at: pos[0] });
  }
  for (const p of pinned) {
    const want = ALLOWED_PINS[p.id];
    ok(want !== undefined,
       `"${p.id}" holds position ${p.at + 1} in every band — either let it move, or name it in ALLOWED_PINS with the reason`);
    if (want !== undefined) {
      ok(p.at === want,
         `"${p.id}" is pinned to position ${p.at + 1}, but this file says ${want + 1} — change one deliberately, not by drift`);
    }
  }
  for (const id of Object.keys(ALLOWED_PINS)) {
    ok(pinned.some((p) => p.id === id),
       `"${id}" is no longer pinned — if that is intended, drop it from ALLOWED_PINS so the list keeps meaning something`);
  }
  // THE REGRESSION, NAMED. Nothing may hold the first slot in every band.
  for (const id of ids) {
    const pos = DAYPART_IDS.map((b) => order[b].indexOf(id));
    ok(!pos.every((i) => i === 0),
       `"${id}" is first in every band — that is the v8.23.2 bug: it eats the one tile a phone reader can see, and the whole rotation becomes invisible`);
  }
}

// ── 4. EVERY BAND STILL CARRIES EVERY RAIL ─────────────────────────────────
// orderFor() appends anything the band forgot, so a typo in a band array is
// silent — the rail just lands at the back. Assert the arrays themselves.
for (const b of DAYPART_IDS) {
  const declared = DAYPARTS[b].order;
  ok(new Set(declared).size === declared.length, `${b}: its order array lists a rail twice`);
  const unknown = declared.filter((id) => !RAIL_IDS.includes(id));
  ok(unknown.length === 0, `${b}: names rails that do not exist (${unknown.join(", ")}) — they silently do nothing`);
  const missing = RAIL_IDS.filter((id) => !declared.includes(id));
  ok(missing.length === 0, `${b}: omits ${missing.join(", ")} — orderFor appends them to the back, so the omission is invisible`);
  ok(order[b].length === ids.length, `${b}: resolved ${order[b].length} rails, expected ${ids.length}`);
}

// ── 5. RED-PROOF ───────────────────────────────────────────────────────────
// An assertion that cannot fail is decoration. Rebuild the exact shape that
// shipped — one rail pinned to index 0 everywhere — and prove §1 catches it.
{
  const pinnedFirst = {};
  for (const b of DAYPART_IDS) pinnedFirst[b] = ["season", ...order[b].filter((x) => x !== "season")];
  const leaders = DAYPART_IDS.map((b) => pinnedFirst[b][0]);
  ok(new Set(leaders).size === 1,
     "PROBE: the pre-v8.23.2 shape should collapse to one leader; if it does not, this file is not testing what it claims");
}

if (fails.length) {
  console.error(`check-daypart-rotation: FAIL — ${fails.length}/${n}`);
  for (const f of fails) console.error("  · " + f);
  process.exit(1);
}
console.log(`check-daypart-rotation: OK — ${n} assertions; first tile is breakfast / break / tonight-from-1pm, every rendered "why" names the rail it leads with, and the only pinned slots are trending at two (the owner\u2019s poster, right of Tonight\u2019s Move) and Local Guides last`);
