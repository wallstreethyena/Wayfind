#!/usr/bin/env node
/**
 * check-promo-location-honesty — a promo may not promise a town it has nothing in.
 *
 * THE BUG THIS PINS (owner session, 2026-09-04, reproduced live on production
 * 5bc262b3): with the homepage centre on Hoffman, NJ — zero Wayfind inventory —
 * every rail correctly rendered its honest empty state and the holiday card
 * rendered "The best of Labor Day weekend in Hoffman, NJ / Top picks for the
 * holiday, near you / See the picks ›" over nothing at all.
 *
 * The law is general on purpose. Labor Day is not mentioned below, because a
 * Labor-Day-shaped guard would have to be rewritten for Columbus Day.
 *
 * lib/promoLocation.js is EXECUTED here against a positive control (a location
 * with inventory) and a negative control (a location with zero), because a
 * guard that only greps for `locationPromoAllowed(` passes on a call whose
 * result is thrown away.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const p = (rel) => path.join(REPO, rel);
const read = (rel) => readFileSync(p(rel), "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

let pass = 0;
const fail = (m) => { console.error("check-promo-location-honesty: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

const { locationPromoAllowed, qualifyingCount, PROMO_OK_COVERAGE } =
  await import(new URL("../lib/promoLocation.js", import.meta.url));

/* ── 1. THE TWO CONTROLS, EXECUTED ───────────────────────────────────────── */
// NEGATIVE — Hoffman, NJ: the rails came back uncovered, nothing qualifies.
ok(locationPromoAllowed({ coverage: "uncovered", pool: [] }) === false,
  "an UNCOVERED location must never carry location-specific promo copy — this is the Hoffman, NJ case verbatim");
ok(locationPromoAllowed({ coverage: "uncovered", pool: [{ name: "Somewhere" }] }) === false,
  "…and it stays false even if some pool is non-empty: an uncovered point has no ranked inventory to promise");

// POSITIVE — a covered location with real qualifying places.
ok(locationPromoAllowed({ coverage: "covered", pool: [{ name: "Anna Maria Beach" }, { name: "Rod & Reel Pier" }] }) === true,
  "a COVERED location with qualifying places must still render its promo — this guard must not make the card unreachable everywhere");
ok(locationPromoAllowed({ coverage: "covered" }) === true,
  "…and coverage alone is a real signal when no pool is in hand: the rails found ranked inventory at this point");

/* ── 2. FAIL CLOSED, NOT OPEN ────────────────────────────────────────────── */
ok(locationPromoAllowed({ coverage: null, pool: [{ name: "x" }] }) === false,
  "UNKNOWN coverage must not pass. A promise made while we are still finding out is on screen longest on exactly the slow connections where it is least likely to be true.");
ok(locationPromoAllowed({ coverage: "slow" }) === false && locationPromoAllowed({ coverage: "error" }) === false,
  "a slow or errored coverage check is not a licence to promise a town");
ok(locationPromoAllowed({}) === false && locationPromoAllowed() === false,
  "no argument at all must fail closed — a promo that renders when the gate is not wired is the bug this file exists for");

/* ── 3. THE PROMO'S OWN FILTER DECIDES WHAT COUNTS ───────────────────────── */
// A covered town whose only candidates are disqualified by the promo itself
// (the World Cup card's "a bar with no screens is not a watch party" rule) has
// nothing to promise either.
const noScreens = [{ name: "Churrascaria", screens: false }, { name: "Bakery", screens: false }];
ok(locationPromoAllowed({ coverage: "covered", pool: noScreens, exclude: (x) => !x.screens }) === false,
  "a covered town where the promo's OWN exclude disqualifies every candidate must not render — the count has to answer the question the copy asks");
ok(locationPromoAllowed({ coverage: "covered", pool: [...noScreens, { name: "Sports Bar", screens: true }], exclude: (x) => !x.screens }) === true,
  "…and one real qualifying venue is enough to make the same copy true");
ok(qualifyingCount(null) === 0 && qualifyingCount(undefined) === 0 && qualifyingCount([]) === 0,
  "qualifyingCount must read a missing pool as zero, never as unknown-so-allow");
ok(qualifyingCount([{ a: 1 }], () => { throw new Error("bad filter"); }) === 0,
  "a throwing exclude must disqualify, not admit — a filter that crashes cannot be evidence that a place qualifies");
ok(PROMO_OK_COVERAGE === "covered",
  "the one passing coverage value must stay the string DaypartRail actually emits (app/components/DaypartRail.js onCoverage)");

/* ── 4. EVERY LOCATION-PROMO SURFACE IS ACTUALLY WIRED TO THE GATE ───────── */
// A law nothing calls is decoration. These are the surfaces that interpolate a
// location into promotional copy; a new one joins this list.
const HOME = strip(read("app/home.js"));
ok(/locationPromoAllowed/.test(HOME),
  "app/home.js does not import or call locationPromoAllowed — the law exists and nothing enforces it");
ok(/import \{[^}]*locationPromoAllowed[^}]*\} from "\.\.\/lib\/promoLocation/.test(HOME)
  || /from "\.\.\/lib\/promoLocation\.js"/.test(HOME),
  "app/home.js must import the gate from lib/promoLocation.js — one definition, not a re-implementation per card");

// The holiday card: its render must not begin and end on date math.
const holBlock = HOME.slice(HOME.indexOf("Hol.activeHoliday(new Date())"));
ok(holBlock.length > 0, "the holiday card block was not found — this guard has lost its subject and must be re-pointed");
ok(/locationPromoAllowed\(/.test(holBlock.slice(0, 900)),
  "the holiday card still renders on Hol.activeHoliday() alone. That is pure date math — true for every visitor on earth for 28 days before every federal holiday — and it is what put 'The best of Labor Day weekend in Hoffman, NJ' over zero picks.");

// The World Cup card: same law, same module, no second definition.
const wcIdx = HOME.indexOf("renderWorldCupCard");
ok(wcIdx > 0, "renderWorldCupCard was not found — re-point this guard");
ok(/locationPromoAllowed\(/.test(HOME.slice(wcIdx, wcIdx + 1400)),
  "renderWorldCupCard does not route through the gate — 'Where to watch near {loc}' is the same promise the holiday card makes and needs the same evidence");

console.log(`check-promo-location-honesty: OK — ${pass} assertions (gate EXECUTED against a covered positive control and an uncovered negative control; fails closed on unknown/slow/error; the promo's own exclude decides what counts; both location-promo surfaces are wired)`);
