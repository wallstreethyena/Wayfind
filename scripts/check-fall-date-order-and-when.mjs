// scripts/check-fall-date-order-and-when.mjs — owner, 2026-09-30, three Fall rail
// screenshots:
//   1. "make sure the locations are displayed by date and if multiple dates make
//      sure that the one that shows first is based by distance"
//   2. the date pill truncated ("thru Nov…", "Saturda…"); "the abbreviation looks
//      so much better, make that a global rule"
//   3. "the images are taking a real long time to load"
//
// Behaviour is asserted by CALLING the real code (chronologicalCards, fallSortKey,
// fallWhenLabel, compactWhen). A short structural half proves the render
// boundary (RailWhenBadge) and the Fall rail actually use them.
import { readFileSync } from "node:fs";
import { chronologicalCards } from "../lib/fallIntentRails.js";
import { fallWhenLabel } from "../lib/fallPool.js";
import { compactWhen, abbreviateDates } from "../lib/whenCompact.js";

let pass = 0;
const fail = (m) => { console.error("check-fall-date-order-and-when: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ── 1. Order: date ASC, then distance ASC ───────────────────────────────────
const today = "2026-09-30";
const ctx = { today, now: new Date("2026-09-30T16:00:00Z") };
const ev = (id, start, end, distMi, extra = {}) => ({ id, name: id, kind: "event", start_date: start, end_date: end, distMi, ...extra });
const order = (cards) => cards.slice().sort((a, b) => chronologicalCards(a, b, ctx)).map((c) => c.id);

// Same date → nearest first, whatever the score (the live Oct 17 / Oct 3 / Oct 1 defects).
ok(order([ev("venice-19mi", "2026-10-17", "2026-10-17", 19, { editorial_score: 10 }), ev("boo-1.2mi", "2026-10-17", "2026-10-17", 1.2, { editorial_score: 1 })]).join() === "boo-1.2mi,venice-19mi",
  "same date: the 1.2 mi card leads the 19 mi card even when the far one is editorially stronger");
ok(order([ev("keel-55mi", "2026-10-03", "2026-10-31", 55.6), ev("fruitville-6mi", "2026-10-03", "2026-11-01", 6.6)]).join() === "fruitville-6mi,keel-55mi",
  "same next date, different end: still nearest first");
// Dated places sharing a date: distance beats a much higher score (positive control on the score).
const { railScoreOf } = await import("../lib/railRank.js");
const nearLow = { id: "near-low", name: "near-low", kind: "place", distMi: 0.8, wfScore: 60, seasonalStart: "2026-10-05", seasonalThrough: "2026-10-31" };
const farHigh = { id: "far-high", name: "far-high", kind: "place", distMi: 32, wfScore: 97, seasonalStart: "2026-10-05", seasonalThrough: "2026-10-31" };
ok(railScoreOf(farHigh) > railScoreOf(nearLow), "positive control: the far place really scores higher");
ok(order([farHigh, nearLow]).join() === "near-low,far-high", "shared date: 0.8 mi leads 32 mi even though 32 mi scores higher");
// Date stays primary.
ok(order([ev("near-later", "2026-10-20", "2026-10-20", 0.5), ev("far-sooner", "2026-10-02", "2026-10-02", 40)]).join() === "far-sooner,near-later",
  "date is the primary key: a sooner far card leads a later near one");
// #1520 honesty law kept: no confirmed date → after every dated card, never "today".
const undatedNear = { id: "undated-near", name: "undated-near", kind: "place", distMi: 0.3, wfScore: 99 };
ok(order([undatedNear, ev("dated-far", "2026-11-13", "2026-11-16", 80)]).join() === "dated-far,undated-near", "undated cards still sort after dated ones");
// …and among undated cards the rail RANKING LAW (score first) is unchanged.
const undatedLow = { id: "undated-low-near", name: "undated-low-near", kind: "place", distMi: 0.2, wfScore: 55 };
const undatedHigh = { id: "undated-high-far", name: "undated-high-far", kind: "place", distMi: 25, wfScore: 95 };
ok(order([undatedLow, undatedHigh]).join() === "undated-high-far,undated-low-near", "undated ties keep score-first (lib/railRank.js law)");
// Composition really uses this comparator.
const railsSrc = strip(readFileSync("lib/fallIntentRails.js", "utf8"));
ok(/\.sort\(\(a, b\) => chronologicalCards\(a, b, ctx\)\)/.test(railsSrc), "uniqueCards sorts with chronologicalCards");
ok((railsSrc.match(/function chronologicalCards\(/g) || []).length === 1, "exactly one chronologicalCards definition");

// ── 2. The when pill: one compact grammar everywhere ────────────────────────
const FULL = /\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|January|February|March|April|June|July|August|September|October|November|December)\b/i;
const LABEL_MAX = 14, VALUE_MAX = 11;
const fits = (w, tag) => {
  ok(w && !FULL.test(String(w.label || "")) && !FULL.test(String(w.value || "")), `${tag}: no full weekday/month names (${JSON.stringify(w)})`);
  ok(String(w.label || "").length <= LABEL_MAX, `${tag}: kicker ≤ ${LABEL_MAX} chars (${JSON.stringify(w.label)})`);
  ok(String(w.value || "").length <= VALUE_MAX, `${tag}: value ≤ ${VALUE_MAX} chars (${JSON.stringify(w.value)})`);
};
// Every fallWhenLabel state, with and without a clock, through the render-boundary formatter.
const states = {
  "today one-day": { start_date: today, end_date: today },
  "upcoming one-day": { start_date: "2026-10-17", end_date: "2026-10-17" },
  "upcoming one-day wed 12:30": { start_date: "2026-10-21", end_date: "2026-10-21" },
  "upcoming multi": { start_date: "2026-11-13", end_date: "2026-11-16" },
  "running with end": { start_date: "2026-08-26", end_date: "2026-11-01" },
  "select nights": { start_date: "2026-09-11", end_date: "2026-10-31", select_nights: true },
  "select nights sep": { start_date: "2026-09-11", end_date: "2026-09-30", select_nights: true },
  "open run": { start_date: "2026-09-01" },
};
for (const [name, e] of Object.entries(states)) {
  for (const start_time of [null, "12:30:00", "19:00:00"]) fits(compactWhen(fallWhenLabel({ ...e, start_time }, today)), `${name}${start_time ? " @" + start_time : ""}`);
}
// The owner's reference shape is preserved exactly.
const ref = compactWhen(fallWhenLabel({ start_date: "2026-10-01", end_date: "2026-10-31" }, "2026-09-30"));
ok(ref.label === "Opens Oct 1" && ref.value === "thru Oct 31", `reference pill unchanged: ${JSON.stringify(ref)}`);
const sat = compactWhen(fallWhenLabel({ start_date: "2026-10-17", end_date: "2026-10-17", start_time: "17:00:00" }, today));
ok(sat.label === "Oct 17" && sat.value === "Sat 5pm", `one-day: "Oct 17 / Sat 5pm" (got ${JSON.stringify(sat)})`);
const sel = compactWhen(fallWhenLabel({ start_date: "2026-09-11", end_date: "2026-10-31", select_nights: true, start_time: "19:00:00" }, today));
ok(sel.label === "Select nights" && sel.value === "thru Oct 31", `select nights split as kicker + "thru" (got ${JSON.stringify(sel)})`);
const thru = compactWhen({ label: "Thru Nov 1", tone: "now" });
ok(thru.label === "Now on" && thru.value === "thru Nov 1", `bare "Thru X" becomes "Now on / thru X" (got ${JSON.stringify(thru)})`);
// Browser-measured budget (Inter, 104px badge, all 1,114 fall pill strings Sep–Dec
// fit with ≥3px): a weekday + clock too long for the value moves its weekday up.
const longClock = compactWhen(fallWhenLabel({ start_date: "2026-10-21", end_date: "2026-10-21", start_time: "12:30:00" }, today));
ok(longClock.label === "Wed Oct 21" && longClock.value === "12:30pm", `long weekday+clock splits to kicker (got ${JSON.stringify(longClock)})`);
const tba = compactWhen(fallWhenLabel({ start_date: "2026-09-01" }, today));
ok(tba.label === "Open now" && tba.value === "Ends TBA", `open run reads "Open now / Ends TBA" (got ${JSON.stringify(tba)})`);
// Other producers (event rails, Events screen, poster cards) pass through the same boundary.
fits(compactWhen({ label: "SATURDAY", value: "October 17" }), "uppercase producer");
ok(compactWhen({ label: "SATURDAY", value: "October 17" }).label === "SAT", "case is preserved when abbreviating");
fits(compactWhen({ label: "TONIGHT", value: "7:30 PM" }), "relative producer");
ok(abbreviateDates("Mayfair on Monday in May") === "Mayfair on Mon in May", "abbreviation is whole-word only");
const once = compactWhen({ label: "Select nights thru Nov 1", value: "7pm" });
ok(JSON.stringify(compactWhen(once)) === JSON.stringify(once), "compactWhen is idempotent");
// The render boundary uses it — every RailWhenBadge caller is covered.
const cardSrc = strip(readFileSync("app/components/RailCard.js", "utf8"));
ok(/import \{ compactWhen \} from "\.\.\/\.\.\/lib\/whenCompact\.js";/.test(cardSrc), "RailCard imports compactWhen");
ok(/export function RailWhenBadge\(props\) \{\s*const \{ label, value, tone = "later" \} = compactWhen\(props\) \|\| \{\};/.test(cardSrc),
  "RailWhenBadge renders only compactWhen's output");

// ── 3. Images: the first cards a reader sees load at once ───────────────────
const fallSrc = strip(readFileSync("app/components/FallIntentRails.js", "utf8"));
ok(/<RailCard[\s\S]{0,400}eagerMedia=\{index < 3\}/.test(fallSrc), "Fall rail cards 1-3 load eagerly (they peek on a 390px screen)");
const layoutSrc = strip(readFileSync("app/layout.js", "utf8"));
ok(/const PHOTO_VAULT_ORIGIN = /.test(layoutSrc) && /<link rel="preconnect" href=\{PHOTO_VAULT_ORIGIN\} \/>/.test(layoutSrc), "layout preconnects the photo vault origin");
ok(/<link rel="preconnect" href="https:\/\/lh3\.googleusercontent\.com" \/>/.test(layoutSrc), "layout still preconnects Google's photo host");

console.log(`check-fall-date-order-and-when: OK — ${pass} assertions (real comparator over 5 order scenarios, ${Object.keys(states).length} pill states x 3 clocks through the real formatters, render-boundary + eager-media structure)`);
