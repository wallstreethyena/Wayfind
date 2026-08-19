#!/usr/bin/env node
// scripts/test-birthday-nearby.mjs — Birthday Plans ranks NEARBY inventory,
// not a statewide shortlist.
//
// THE LIVE DEFECT (gowayfind.com, Parrish / Manatee-Sarasota, 2026-08-19):
// the rail's #1 was Bulla Gastrobar Tampa. The selector admitted only
// `_birthdaySourced` rows from lib/birthdayUniverse.js, and
// buildBirthdayPool hydrated that list out to 45 miles (120 for Orlando
// destination entries) via getPlaceDetails. Local Bradenton / Lakewood
// Ranch / Ellenton inventory never got a vote.
//
// THE RULE this locks, by CALL:
//   · at the Parrish landing point, Bulla Tampa is ~24 miles out — outside
//     BIRTHDAY_NEAR_MI (10);
//   · a closer birthday-appropriate inventory row MUST lead;
//   · the Tampa row MUST NOT appear when that closer inventory exists;
//   · empty stays empty (a market with no nearby occasion rooms does not
//     stretch to Tampa to fill MIN_CARDS);
//   · nothing is invented — fixtures are real shapes, not fabricated scores.
import { BIRTHDAY_UNIVERSE } from "../lib/birthdayUniverse.js";
import { isBirthdayPlace, isStrongBirthdayPlace, isBirthdaySeed, BIRTHDAY_NEAR_MI } from "../lib/birthdayPlace.js";
import { selectFor, fillRails, MIN_CARDS } from "../lib/railSelect.js";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const eq = (a, b, m) => ok(a === b, `${m}\n    got ${JSON.stringify(a)}\n    want ${JSON.stringify(b)}`);

const R = 3958.8;
const rad = (d) => (d * Math.PI) / 180;
const hav = (aLat, aLng, bLat, bLng) => 2 * R * Math.asin(Math.sqrt(
  Math.sin(rad(bLat - aLat) / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2));

// landing.js carries JSX — do not import it from a node guard. Read the
// Parrish point out of the source and assert the numbers, same way
// check-location-fail-open pins DEFAULT_CENTER.
const landingSrc = readFileSync(new URL("../lib/landing.js", import.meta.url), "utf8");
const parrishHit = landingSrc.match(/"parrish":\s*\{\s*name:\s*"Parrish",\s*state:\s*"FL",\s*lat:\s*([\d.]+),\s*lng:\s*([-\d.]+)\s*\}/);
ok(parrishHit, "landing.js still declares the Parrish point this lock measures from");
const PARRISH = { lat: Number(parrishHit && parrishHit[1]), lng: Number(parrishHit && parrishHit[2]) };
ok(Number.isFinite(PARRISH.lat) && Number.isFinite(PARRISH.lng),
  "Parrish is a real LANDING_CITIES point — the acceptance origin");

const BULLA = BIRTHDAY_UNIVERSE.find((e) => e.key === "bulla_tampa");
ok(BULLA && BULLA.venue && BULLA.venue.placeId,
  "Bulla Gastrobar Tampa is still a curated seed — the live #1 this lock is about");
const bullaMi = hav(PARRISH.lat, PARRISH.lng, BULLA.venue.lat, BULLA.venue.lng);
ok(bullaMi > BIRTHDAY_NEAR_MI,
  `Bulla Tampa is outside BIRTHDAY_NEAR_MI from Parrish (got ${bullaMi.toFixed(1)} mi, near=${BIRTHDAY_NEAR_MI})`);
ok(bullaMi > 20 && bullaMi < 30,
  `the live report was ~22 miles; the measured Parrish→Bulla distance is still that band (got ${bullaMi.toFixed(1)})`);

eq(BIRTHDAY_NEAR_MI, 10, "BIRTHDAY_NEAR_MI is 10 — the owner's acceptance radius");

/* ── identity, by CALL ──────────────────────────────────────────────────── */
ok(isBirthdayPlace({ name: "Oak & Ola", types: ["restaurant"], id: BULLA.venue.placeId })
  || isBirthdaySeed({ id: BULLA.venue.placeId }),
  "a curated seed placeId qualifies — seeds boost membership, they do not invent a row");
ok(isBirthdayPlace({ name: "Lakewood Ranch Steakhouse", types: ["steak_house"] }),
  "a nearby steakhouse qualifies on type evidence");
ok(isBirthdayPlace({ name: "River Bistro", types: ["restaurant"] }),
  "whole-word bistro in the name is birthday evidence");
ok(isBirthdayPlace({ name: "Garden Room Cafe", types: ["brunch_restaurant", "cafe"] }),
  "a brunch room that also carries cafe still qualifies — veto-first would drop the owner's garden-brunch shape");
ok(!isBirthdayPlace({ name: "McDonald's", types: ["fast_food_restaurant"] }),
  "a national burger counter is not a birthday plan");
ok(!isBirthdayPlace({ name: "Siesta Key Beach", types: ["beach", "natural_feature"] }),
  "a beach is not a birthday plan");
ok(!isStrongBirthdayPlace({
  name: "Publix Super Market", primaryType: "grocery_store",
  types: ["grocery_store", "banquet_hall"],
}), "strong form: a grocery wearing banquet_hall is still a grocery");

/* ── the Mayatee-Sarasota / Parrish rule, executed ──────────────────────── */
const mk = (id, o) => ({
  id, name: o.name, rating: o.rating ?? 4.6, reviews: o.reviews ?? 400,
  types: o.types || ["restaurant"], distMi: o.distMi, _s: o._s ?? 50,
  governed_score: o._s ?? 50, priceLevel: o.priceLevel || null,
});
const localSteak = mk("local-steak", {
  name: "Lakewood Ranch Steakhouse", types: ["steak_house"], distMi: 4.2, _s: 88,
});
const localWine = mk("local-wine", {
  name: "Harbor Wine Bar", types: ["wine_bar"], distMi: 5.1, _s: 80,
});
const localKaraoke = mk("local-karaoke", {
  name: "Widened Karaoke Lounge", types: ["night_club"], distMi: 6.4, _s: 74,
});
const tampaFlagship = Object.assign(mk(BULLA.venue.placeId, {
  name: BULLA.venue.name, types: ["spanish_restaurant"], distMi: bullaMi, _s: 99,
}), { _birthdaySourced: true, _birthdayWhy: BULLA.why });

const pools = {
  "things-to-do": [], beaches: [], restaurants: [], nightlife: [],
  creators: [], summer: [], breakfast: [], quickeats: [], family: [],
  events: [], drive: [],
  birthday: [tampaFlagship, localSteak, localWine, localKaraoke],
};

const picked = selectFor("birthday", pools, { cityLabel: "Parrish" });
eq(picked[0] && picked[0].name, "Lakewood Ranch Steakhouse",
  "at a Parrish point, Birthday #1 is the nearby steakhouse — not the 99-scored Tampa seed");
ok(!picked.some((p) => p.id === BULLA.venue.placeId || p.name === BULLA.venue.name),
  "Bulla Gastrobar Tampa does not ride the rail when closer inventory exists");
ok(picked.every((p) => (p.distMi || 0) <= BIRTHDAY_NEAR_MI),
  "every pick is inside ~10 miles");
ok(picked.length >= MIN_CARDS, "nearby inventory can fill the rail without stretching");

const filled = fillRails(pools, (p) => p, { nearMi: 17, widenMi: 25, cityLabel: "Parrish" });
ok(filled.places.birthday && filled.places.birthday.length >= MIN_CARDS,
  "fillRails still fills birthday from the nearby rooms");
ok(!filled.places.birthday.some((p) => p.id === BULLA.venue.placeId),
  "fillRails does not stretch 10 → 25 to admit the Tampa flagship");
ok(filled.places.birthday.every((p) => p.distMi <= BIRTHDAY_NEAR_MI),
  "filled birthday cards stay inside BIRTHDAY_NEAR_MI");

/* ── empty stays empty — do not stretch a market to fill ────────────────── */
{
  const thin = {
    ...pools,
    birthday: [tampaFlagship],
  };
  const { places, thin: thinIds } = fillRails(thin, (p) => p, { nearMi: 17, widenMi: 25, cityLabel: "Parrish" });
  ok(thinIds.includes("birthday"), "a market with only a 22-mile seed is reported thin");
  eq(places.birthday.length, 0, "thin birthday means EMPTY — Tampa is not borrowed to fill the slot");
}

/* ── never invent ───────────────────────────────────────────────────────── */
ok(isBirthdayPlace(null) === false && isBirthdayPlace({}) === false,
  "no place object → not a birthday place. Nothing is invented.");

console.log(fail === 0
  ? `test-birthday-nearby: OK — ${pass} assertions (Parrish #1 is local, Tampa 22-mile seed refused, empty stays empty)`
  : `test-birthday-nearby: FAIL — ${fail} of ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
