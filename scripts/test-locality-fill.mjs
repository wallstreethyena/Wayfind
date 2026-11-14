#!/usr/bin/env node
// scripts/test-locality-fill.mjs — the daily city/county fill (lib/localityFill.js,
// app/api/cron/locality-fill) writes only what the Census says, only into empty
// fields, only for Florida, and never for held places.
//
// CALLS the real lib functions on Census-shaped answers (shapes copied from
// real geocoder responses used in the 2026-11-11 backfill), then checks the
// route is wired to them and scheduled. Hermetic: no env, no network.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseCensusGeographies, planLocalityWrite, candidatesQuery, writeQuery, writeBody, censusUrl,
  DAILY_LIMIT, FLORIDA_STATE_FIPS,
} from "../lib/localityFill.js";

let n = 0;
const ok = (c, msg) => { assert.ok(c, msg); n++; };
const answer = ({ inc = [], cdp = [], counties = [["Broward", "12"]] } = {}) => ({
  result: { geographies: {
    "Incorporated Places": inc.map((b) => ({ BASENAME: b, NAME: `${b} city` })),
    "Census Designated Places": cdp.map((b) => ({ BASENAME: b, NAME: `${b} CDP` })),
    Counties: counties.map(([b, st]) => ({ BASENAME: b, NAME: `${b} County`, STATE: st })),
  } },
});
const empty = { place_id: "p1", locality: null, county: null, locked: false };

// A. Parsing the Census answer.
const g1 = parseCensusGeographies(answer({ inc: ["Pompano Beach"] }));
ok(g1 && g1.inc[0] === "Pompano Beach" && g1.county[0] === "Broward" && g1.state[0] === "12", "A1 parses city, county (BASENAME, no 'County' suffix) and state");
ok(parseCensusGeographies({ result: {} }) === null && parseCensusGeographies(null) === null, "A2 no geographies → null");

// B. What gets written.
let p = planLocalityWrite(empty, g1);
ok(p.action === "write" && p.locality === "Pompano Beach" && p.county === "Broward", "B1 an incorporated city is written with its county");
p = planLocalityWrite(empty, parseCensusGeographies(answer({ cdp: ["Town 'n' Country"], counties: [["Hillsborough", "12"]] })));
ok(p.action === "write" && p.locality === "Town 'n' Country", "B2 a Census-designated place is used when no city contains the point");
p = planLocalityWrite(empty, parseCensusGeographies(answer({ counties: [["Orange", "12"]] })));
ok(p.action === "write" && p.locality === null && p.county === "Orange", "B3 an unincorporated point gets the county only");
ok(JSON.stringify(writeBody(p)) === JSON.stringify({ county: "Orange" }), "B4 a county-only write never sends locality");
ok(JSON.stringify(writeBody({ locality: "Miami", county: "Miami-Dade" })) === JSON.stringify({ locality: "Miami", county: "Miami-Dade" }), "B5 a city write sends both fields");

// C. What is held.
const why = (row, a) => planLocalityWrite(row, a === null ? null : parseCensusGeographies(a)).why || "";
ok(/held place Bay Lake/.test(why(empty, answer({ inc: ["Bay Lake"], counties: [["Orange", "12"]] }))), "C1 Bay Lake (Disney) is held for the owner");
ok(/not florida \(13\)/.test(why(empty, answer({ inc: ["Valdosta"], counties: [["Lowndes", "13"]] }))), "C2 a Georgia point is held");
ok(/county count 2/.test(why(empty, answer({ counties: [["A", "12"], ["B", "12"]] }))), "C3 a point on a county line is held");
ok(/no census answer/.test(why(empty, null)), "C4 a failed lookup writes nothing");
ok(/locked/.test(why({ ...empty, locked: true }, answer({ inc: ["Miami"] }))), "C5 a locked row is never written");
ok(/already has a value/.test(why({ ...empty, county: "Broward" }, answer({ inc: ["Miami"] }))), "C6 a row with a county is never overwritten");
ok(/already has a value/.test(why({ ...empty, locality: "Hollywood" }, answer({ inc: ["Miami"] }))), "C7 a row with a city is never overwritten");
p = planLocalityWrite(empty, parseCensusGeographies(answer({ inc: ["A", "B"] })));
ok(p.action === "write" && p.locality === null, "C8 two cities for one point → no city guessed (county only)");

// D. The queries: add-only, newest first, bounded.
const cq = candidatesQuery(DAILY_LIMIT);
ok(cq.includes("locality=is.null") && cq.includes("county=is.null") && cq.includes("locked=not.is.true"), "D1 reads only empty, unlocked rows");
ok(/order=seen_at\.desc/.test(cq) && new RegExp(`limit=${DAILY_LIMIT}$`).test(cq) && DAILY_LIMIT <= 60, "D2 newest first, bounded");
ok(/limit=200$/.test(candidatesQuery(10_000)), "D3 the limit is capped");
const wq = writeQuery("ChIJ x&y");
ok(wq.includes("place_id=eq.ChIJ%20x%26y") && wq.includes("&locality=is.null&county=is.null"), "D4 the write is compare-and-set on both fields, id encoded");
ok(/^https:\/\/geocoding\.geo\.census\.gov\//.test(censusUrl(26.2, -80.1)) && censusUrl(26.2, -80.1).includes("x=-80.1&y=26.2"), "D5 the lookup is the Census geocoder, x=lng y=lat");
ok(FLORIDA_STATE_FIPS === "12", "D6 Florida's state code");

// E. Wiring: the route uses these functions, writes with PATCH, reports a pulse; it is scheduled daily.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const route = strip(readFileSync(new URL("../app/api/cron/locality-fill/route.js", import.meta.url), "utf8"));
for (const fn of ["candidatesQuery", "censusUrl", "parseCensusGeographies", "planLocalityWrite", "writeQuery", "writeBody"]) {
  ok(new RegExp(`\\b${fn}\\(`).test(route), `E1 the route calls ${fn}()`);
}
ok(/method:\s*"PATCH"/.test(route) && !/method:\s*"(POST|DELETE|PUT)"/.test(route), "E2 the route only PATCHes (no insert, no delete)");
ok((route.match(/recordPulse\("locality-fill"/g) || []).length >= 2, "E3 the route reports a pulse on success and on a failed read");
const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const crons = (vercel.crons || []).filter((c) => c.path === "/api/cron/locality-fill");
ok(crons.length === 1 && /^\d+ \d+ \* \* \*$/.test(crons[0].schedule), "E4 scheduled exactly once, daily");

console.log(`test-locality-fill: OK — ${n} assertions (Census answer parsed; city / CDP / county-only written; Bay Lake, non-Florida, county-line, failed lookup, locked and filled rows held; add-only compare-and-set queries; route wired and scheduled daily)`);
