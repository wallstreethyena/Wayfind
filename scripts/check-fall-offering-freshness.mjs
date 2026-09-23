#!/usr/bin/env node
// scripts/check-fall-offering-freshness.mjs — a SEASONAL fall claim must be
// re-verified inside the season it claims.
//
// The gap this closes (audited 2026-09-23 against current main): of the 17
// entries in lib/fallPool.FALL_OFFERING_SOURCES, only 5 carried a `verified`
// date, and NOTHING read that field. A card saying "fall menu: pumpkin spice
// latte" could therefore ride the Augtober rail for a second season after the
// venue dropped the menu, and no check would notice.
//
// FAIL CLOSED AT THE BUILD, NOT AT RUNTIME. Hiding an unverified card at
// request time would silently thin the rails and could empty one, which the
// owner's empty-rail rule forbids and which would have dropped real inventory
// (Pinto's Farm among it). So this guard fails CI and a human re-verifies;
// nothing is ever removed from a live rail by this file.
//
// A YEAR-ROUND claim ("year-round haunted house") makes no seasonal promise, so
// it needs no seasonal date. Only claims that name a season are gated.
import assert from "node:assert/strict";
process.env.WF_SUPPRESS_ANALYTICS = "1";
import { FALL_OFFERING_SOURCES } from "../lib/fallPool.js";
import { FALL_SEASON_START_MD } from "../lib/fallSkin.js";

let n = 0;
const ok = (c, m) => { assert.equal(!!c, true, m); n++; };

// A claim is SEASONAL when its own words name a season or a dated run.
export const SEASONAL_RX = /\bfall\b|autumn|harvest|halloween|pumpkin|thanksgiving|holiday|seasonal|christmas/i;
// A claim that also says year-round is making a standing, not seasonal, promise.
export const YEAR_ROUND_RX = /year[- ]round|all year|every (?:day|night)|permanent/i;

export function isSeasonalClaim(offering) {
  const s = String(offering || "");
  if (YEAR_ROUND_RX.test(s)) return false;
  return SEASONAL_RX.test(s);
}

/** Start of the fall season that `todayStr` falls in (or the most recent one). */
export function seasonStart(todayStr) {
  const y = Number(todayStr.slice(0, 4));
  const thisYear = `${y}-${FALL_SEASON_START_MD}`;
  return todayStr >= thisYear ? thisYear : `${y - 1}-${FALL_SEASON_START_MD}`;
}

// ── BASELINE ──────────────────────────────────────────────────────────────
// Seasonal claims that predate this guard. Each one is DEBT, listed so it is
// visible and shrinkable — not an exemption to hide behind. Re-verify the
// claim, add `verified: "YYYY-MM-DD"` to its row in lib/fallPool.js, and
// delete it from here. A baselined row that HAS a current date fails below,
// so the list can only shrink.
export const BASELINE = Object.freeze({
  "ChIJVQB8l1PEwogRfNZtGI6suIc": "Ghost of Gasparilla pop-up: dated run not re-read since the rail was built",
  "ChIJTzoiienhwogRbPa3GpuvBQU": "Paradeco fall menu: menu not re-read for the 2026 season",
  "ChIJ11hsiYXEwogRjDBv39F04J8": "Oxford Exchange autumn menu: menu not re-read for the 2026 season",
  "ChIJ5crCip3EwogRQnhkbw_Ir6U": "On Swann fall menu: menu not re-read for the 2026 season",
  "ChIJwZ_GK-d-54gRm5Ahg7PZYeY": "Dead Coconut Club Harvest takeover: dated run not re-read at source",
});

const today = new Date().toISOString().slice(0, 10);
const start = seasonStart(today);
const rows = Object.entries(FALL_OFFERING_SOURCES);

ok(rows.length > 0, "FALL_OFFERING_SOURCES is populated — an empty registry makes every check below vacuous");

const seasonal = rows.filter(([, v]) => isSeasonalClaim(v && v.offering));
ok(seasonal.length > 0, `at least one offering reads as seasonal (got ${seasonal.length}) — otherwise the classifier matches nothing and this guard proves nothing`);

const stale = [];
for (const [id, v] of seasonal) {
  const verified = typeof v.verified === "string" ? v.verified : null;
  if (verified && verified >= start) continue;      // re-verified this season
  if (Object.prototype.hasOwnProperty.call(BASELINE, id)) continue;  // known debt
  stale.push(`${id} (${verified ? `verified ${verified}, before season start ${start}` : "no verified date"}): ${String(v.offering).slice(0, 60)}`);
}
ok(stale.length === 0, `every seasonal fall claim is re-verified inside the season it claims, or baselined:\n    - ${stale.join("\n    - ")}`);

// The baseline may only shrink: once a row carries a current date, it must leave.
const graduated = Object.keys(BASELINE).filter((id) => {
  const v = FALL_OFFERING_SOURCES[id];
  return v && typeof v.verified === "string" && v.verified >= start;
});
ok(graduated.length === 0, `a baselined row now carries a current verified date and must be removed from BASELINE: ${graduated.join(", ")}`);

// Every baselined id must still exist, so the list cannot rot into fiction.
const ghosts = Object.keys(BASELINE).filter((id) => !FALL_OFFERING_SOURCES[id]);
ok(ghosts.length === 0, `BASELINE names ids that are no longer in FALL_OFFERING_SOURCES: ${ghosts.join(", ")}`);

// RED-PROVE: the rule must reject a stale seasonal claim and accept a dated one.
ok(isSeasonalClaim("fall menu: pumpkin spice latte") === true, "red-prove: a fall menu reads as seasonal");
ok(isSeasonalClaim("year-round walk-through haunted house") === false, "red-prove: a year-round claim is not seasonal");
ok(seasonStart("2026-09-23") === "2026-08-26", "red-prove: September falls in the season that opened 2026-08-26");
ok(seasonStart("2026-03-01") === "2025-08-26", "red-prove: March belongs to the previous fall season, not a future one");

const verifiedNow = seasonal.filter(([, v]) => typeof v.verified === "string" && v.verified >= start).length;
console.log(`check-fall-offering-freshness: OK — ${n} assertions; ${rows.length} offerings, ${seasonal.length} seasonal (${verifiedNow} re-verified since ${start}, ${Object.keys(BASELINE).length} baselined), ${rows.length - seasonal.length} year-round need no seasonal date`);
