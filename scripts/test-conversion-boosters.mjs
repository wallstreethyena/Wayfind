#!/usr/bin/env node
// scripts/test-conversion-boosters.mjs — locks the 2026-11-25 conversion pass
// (owner: "price and date up front", "urgency where it's true", a Top rated line
// beside the ticket button, and NO sticky ticket button).
//
//   1. lib/honestUrgency.js speaks only from a confirmed last date: never for an
//      unannounced close, an undated season, a single date event, a run not yet
//      open, an ended run, or a sold out / cancelled row. Never a scarcity word.
//   2. lib/ticketDecisionLine.js prints a price only when one is stated (a $0
//      tier, a resale or estimate note and an unknown price print nothing) and
//      the next real date.
//   3. lib/topRatedLine.js uses the badge's own merit bar, prints no number.
//   4. The surfaces render the line exactly where intended (comments stripped):
//      the two event detail pages, the Christmas ticket card and top picks, and
//      the place page booking row; and none of them adds a sticky / fixed
//      ticket control.
import { readFileSync } from "node:fs";
import { honestUrgency, confirmedRun, shortDayLabel } from "../lib/honestUrgency.js";
import { ticketPriceShort, ticketDateShort, ticketDecisionLine } from "../lib/ticketDecisionLine.js";
import { topRatedLine, TOP_RATED_LINE } from "../lib/topRatedLine.js";

let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.error("FAIL " + msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const DASH = /[–—]/;

// Positive controls: every absence probe below is first shown to FIND what it
// looks for, so a "not found" result means absent, not a blind probe.
const SCARCITY = /sell|sold|almost|few left|hurry|limited/i;
const STICKY_STYLE = /position:\s*["'](?:fixed|sticky)["']/;
ok(SCARCITY.test("Selling fast"), "positive control: the scarcity probe finds a scarcity claim");
ok(DASH.test("Dec 12 \u2013 Jan 4"), "positive control: the dash probe finds an en dash");
ok(/\d/.test("9.4"), "positive control: the digit probe finds a number");
ok(STICKY_STYLE.test('style={{ position: "fixed", bottom: 0 }}'), "positive control: the sticky probe finds a fixed style");

// ── 1. honest urgency ────────────────────────────────────────────────────────
// 2026-12-22 is a Tuesday; 2026-12-27 a Sunday; 2026-12-26 a Saturday.
eq(shortDayLabel("2026-12-27"), "Sun, Dec 27", "short day label");
const run = (start, end, extra = {}) => ({ start_date: start, end_date: end, ...extra });
eq(honestUrgency(run("2026-11-20", "2026-12-22"), "2026-12-22")?.label, "Last day", "last day");
eq(honestUrgency(run("2026-11-20", "2026-12-27"), "2026-12-22")?.label, "Final weekend", "Tue before a Sunday close");
eq(honestUrgency(run("2026-11-20", "2026-12-26"), "2026-12-25")?.label, "Final weekend", "Fri before a Saturday close");
eq(honestUrgency(run("2026-11-20", "2026-12-30"), "2026-12-26")?.label, "Ends Wed, Dec 30", "ends within six days, next week");
eq(honestUrgency(run("2026-11-20", "2026-12-31"), "2026-12-22"), null, "nine days out says nothing");
eq(honestUrgency(run("2026-11-20", "2026-12-27", { closing_unannounced: true }), "2026-12-22"), null, "unannounced close");
eq(honestUrgency(run("2026-11-20", "2026-12-27", { season_undated: true }), "2026-12-22"), null, "undated season");
eq(honestUrgency(run("2026-12-22", "2026-12-22"), "2026-12-22"), null, "single date event is not a last day");
eq(honestUrgency({ start_date: "2026-12-22" }, "2026-12-22"), null, "no end date");
eq(honestUrgency(run("2026-12-24", "2026-12-27"), "2026-12-22"), null, "not open yet");
eq(honestUrgency(run("2026-11-20", "2026-12-21"), "2026-12-22"), null, "already ended");
eq(honestUrgency(run("2026-11-20", "2026-12-22", { ticket_status: "sold_out" }), "2026-12-22"), null, "sold out");
eq(honestUrgency(run("2026-11-20", "2026-12-22", { event_status: "cancelled" }), "2026-12-22"), null, "cancelled");
eq(honestUrgency({ occurrence_dates: ["2026-12-05", "2026-12-12", "2026-12-19"] }, "2026-12-19")?.label, "Last day", "occurrence list last night");
eq(honestUrgency({ occurrence_dates: ["2026-12-19"] }, "2026-12-19"), null, "one occurrence is a single date");
eq(honestUrgency(run("2026-11-20", "2026-12-22"), "bad"), null, "bad today");
eq(confirmedRun({ startDate: "2026-11-01", endDate: "2026-12-01" })?.last, "2026-12-01", "camelCase dates read");
// No scarcity words, no dashes, across a sweep of days.
for (let d = 1; d <= 31; d++) {
  const today = `2026-12-${String(d).padStart(2, "0")}`;
  const u = honestUrgency(run("2026-11-01", "2026-12-28"), today);
  if (!u) continue;
  ok(!SCARCITY.test(u.label), `no scarcity claim on ${today}: ${u.label}`);
  ok(!DASH.test(u.label), `dash free on ${today}: ${u.label}`);
  ok(u.last === "2026-12-28", `label rests on the confirmed last date on ${today}`);
}

// ── 2. price and date ────────────────────────────────────────────────────────
eq(ticketPriceShort({ price: "$25 to $120" }), "From $25", "Ticketmaster range");
eq(ticketPriceShort({ price: "$40" }), "$40", "Ticketmaster single price");
eq(ticketPriceShort({ price: "Free" }), "Free admission", "bare free");
eq(ticketPriceShort({ price: "$0 to $50" }), null, "a $0 floor is not a price");
eq(ticketPriceShort({ price: "Resale from $80" }), null, "resale note is not a price");
eq(ticketPriceShort({ price: "Last year $30" }), null, "last year's price is not a price");
eq(ticketPriceShort({}), null, "unknown price prints nothing");
eq(ticketPriceShort({ ticketed: true }), null, "ticketed without a price prints nothing");
eq(ticketPriceShort({ price_min: 0, price_max: 40 }), null, "$0 price_min prints nothing");
eq(ticketPriceShort({ price_min: 19.5, price_max: 40 }), "From $19.50", "curated range");
eq(ticketPriceShort({ visit_cost: { entry: 34, from: true } }), "From $34", "visit cost from");
eq(ticketPriceShort({ visit_cost: { free: true } }), "Free admission", "visit cost free");
eq(ticketPriceShort({ admission_offer: "free_tier_conditions", is_free: true }), null, "conditional free keeps its full wording elsewhere");
eq(ticketDateShort({ date: "2026-12-12" }, "2026-12-01"), "Sat, Dec 12", "future single date");
eq(ticketDateShort({ date: "2026-12-12" }, "2026-12-12"), "Today", "today");
eq(ticketDateShort({ date: "2026-12-12" }, "2026-12-13"), null, "past date");
eq(ticketDateShort(run("2026-11-20", "2027-01-04"), "2026-12-01"), "Through Mon, Jan 4", "running through");
eq(ticketDateShort(run("2026-11-20", "2027-01-04", { closing_unannounced: true }), "2026-12-01"), null, "running, close unannounced");
eq(ticketDateShort({ occurrence_dates: ["2026-12-05", "2026-12-12"] }, "2026-12-06"), "Next Sat, Dec 12", "next occurrence");
eq(ticketDecisionLine({ price: "$25 to $120", date: "2026-12-12" }, "2026-12-01"), "From $25 · Sat, Dec 12", "the owner's example shape");
eq(ticketDecisionLine({}, "2026-12-01"), null, "nothing true, no line");
eq(ticketDecisionLine(run("2026-11-20", "2026-12-27", { price_min: 30 }), "2026-12-22"), "$30 · Final weekend", "urgency replaces the through date");
eq(ticketDecisionLine(run("2026-11-20", "2026-12-22", { is_free: true }), "2026-12-22"), "Free admission · Last day", "last day");
eq(ticketDecisionLine({ price: "$25", date: "2026-12-12" }, "2026-12-01", { price: null }), "Sat, Dec 12", "caller suppresses the price");
eq(ticketDecisionLine({ date: "2026-12-12" }, "2026-12-01", { price: "From $34.99 per person" }), "From $34.99 per person · Sat, Dec 12", "caller supplies the card's price");

// ── 3. top rated ─────────────────────────────────────────────────────────────
eq(topRatedLine({ rating: 4.9, reviews: 12000 }), TOP_RATED_LINE, "strong place");
eq(topRatedLine({ rating: 5, reviews: 3 }), null, "five stars from three reviews is not top rated");
eq(topRatedLine({ rating: 4.2, reviews: 9000 }), null, "below the bar");
eq(topRatedLine({ rating: null, reviews: 100 }), null, "unrated");
ok(!/\d/.test(TOP_RATED_LINE), "the line prints no number");

// ── 4. surfaces ──────────────────────────────────────────────────────────────
const code = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const count = (s, rx) => (s.match(rx) || []).length;
const evPage = code("app/events/[city]/[slug]/page.js");
eq(count(evPage, /lead=\{ticketDecisionLine\(e, siteTodayStr\(\)\)\}/g), 1, "event detail passes the decision line to TicketButton once");
const tb = code("app/events/[city]/[slug]/TicketButton.js");
ok(/data-ticket-decision=""/.test(tb) && /if \(!lead\) return button;/.test(tb), "TicketButton renders the line only when there is one");
const fe = code("app/florida-events/[slug]/page.js");
eq(count(fe, /\{decisionLine \? <p style=\{S\.decision\} data-ticket-decision="">\{decisionLine\}<\/p> : null\}/g), 1, "florida event page renders the line once, inside the ticket block");
ok(/ticketsUnavailable\(e\)\) return null;/.test(fe), "no decision line on a sold out page");
const card = code("app/components/ChristmasTicketCard.js");
ok(/row\.urgency && row\.urgency\.label \? <span className="xm-temporal" data-urgency=\{row\.urgency\.kind\}>/.test(card), "Christmas card shows urgency in the badge slot");
const browse = code("app/components/ChristmasBrowse.js");
ok(/urgency: card\.kind === "tour" \|\| \(price && price\.soldOut\) \? null : honestUrgency\(card, today\)/.test(browse), "browse rows compute urgency from the card's own dates");
ok(/row=\{browseRowFor\(card, today\)\}/.test(browse), "browse card passes today");
const tix = code("lib/christmasTickets.js");
ok(/urgency: price\.soldOut \? null : honestUrgency\(card, today\)/.test(tix), "top pick rows carry urgency");
const picks = code("app/components/ChristmasTickets.js");
eq(count(picks, /className="xm-pick-urgent"/g), 1, "top pick card renders urgency once");
const place = code("lib/placePage.js");
ok(/\{bookable && topRatedLine\(p\) \? \(/.test(place), "place page Top rated line sits with the booking button only");
// The owner said no sticky ticket button. None of the touched surfaces may add one.
for (const [name, src] of [["TicketButton", tb], ["event page", evPage], ["florida event page", fe], ["ChristmasTicketCard", card], ["ChristmasTickets", picks], ["placePage", place]]) {
  ok(!/data-ticket-decision[^>]*position:\s*["']?(?:fixed|sticky)/.test(src), `${name}: decision line is not sticky`);
}
ok(!STICKY_STYLE.test(tb), "TicketButton is not sticky");

if (fails) { console.error(`test-conversion-boosters: ${fails} failed, ${passes} passed`); process.exit(1); }
console.log(`test-conversion-boosters: OK (${passes} checks: urgency, price/date line, top rated line, 6 surfaces, no sticky ticket button)`);
