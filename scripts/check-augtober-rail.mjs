#!/usr/bin/env node
// scripts/check-augtober-rail.mjs — the AUGTOBER surface, executed and pinned.
//
// Owner, 2026-08-26: everything fall/Halloween in the rail-card chrome, and
// tapping it must NOT open another page — it expands the house place cards
// inline and scrolls to them. Two laws this guard executes for real
// (lib/fallPool.js), plus the wiring pinned in syntactic position:
//
//   • DATED LAW: an event with an end_date retires the moment it passes —
//     nothing expired can ride the rail.
//   • OPEN-RUN LAW: an end_date-null row (the HHN Tribute Store — Universal
//     has published NO closing date and we refuse to fabricate one) stays
//     visible for OPEN_RUN_DAYS from its start WITHOUT ever claiming an end;
//     its label says "Open now", never "Thru <date>".
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isFallTagged, fallEventLive, fallWhenLabel, fallSkinLive, FALL_PLACE_IDS, OPEN_RUN_DAYS } from "../lib/fallPool.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };

// ── 1. The pool laws, executed ─────────────────────────────────────────────
ok(isFallTagged(["halloween", "nightlife"]) && isFallTagged(["fall"]) && !isFallTagged(["food", "beer"]),
  "fall tagging admits halloween/fall and refuses untagged rows");

// dated: the real HHN35 shape
const hhn = { start_date: "2026-08-28", end_date: "2026-11-01" };
ok(fallEventLive(hhn, "2026-10-15") === true, "HHN35 is live mid-run");
ok(fallEventLive(hhn, "2026-11-01") === true, "HHN35 is live on its final night");
ok(fallEventLive(hhn, "2026-11-02") === false, "HHN35 RETIRES the day after Nov 1 — acceptance test #14, executed");

// open run: the real Tribute Store shape — end_date null, start Aug 26
const store = { start_date: "2026-08-26", end_date: null };
ok(fallEventLive(store, "2026-08-26") === true, "Tribute Store visible on opening day with NO end date");
ok(fallEventLive(store, "2026-09-25") === true, "…and a month in — the open-run allowance, not a fabricated end");
ok(fallEventLive(store, "2026-08-26".slice(0, 8) + "26") === true, "control repeats");
ok(fallEventLive(store, "2027-01-15") === false, `…but an open run cannot outlive OPEN_RUN_DAYS (${OPEN_RUN_DAYS}) unre-verified`);
const lbl = fallWhenLabel(store, "2026-09-01");
ok(lbl.label === "Open now" && !/thru/i.test(lbl.label), "open-run label says 'Open now' — it NEVER claims an end date");
ok(/Thru Nov 1/.test(fallWhenLabel(hhn, "2026-09-01").label) || /Select nights thru Nov 1/.test(fallWhenLabel({ ...hhn, select_nights: true }, "2026-09-01").label),
  "dated label states the real verified end");

// ── 2. The vetted place pool stays vetted ──────────────────────────────────
const ids = Object.keys(FALL_PLACE_IDS);
ok(ids.length >= 5, `positive control — the spooky-places pool exists (${ids.length})`);
ok(!ids.includes("ChIJdRuMvWg3DogRdLBmivDl1SQ"), "a Chicago haunted house can never enter the Florida pool");
ok(!ids.includes("ChIJ6SYy9bEWw4gRgJT7j78eTYc"), "'Screaming Buddha Yoga' is a yoga studio, not fall content");
ok(ids.every((i) => /^ChIJ[A-Za-z0-9_-]{10,}$/.test(i)), "every pool entry is a real canonical place id");
ok(Object.values(FALL_PLACE_IDS).every((v) => typeof v === "string" && v.length > 20), "every pool entry carries its one-line why");

// ── 3. The wiring, in syntactic position — v8.66: the AUGTOBER surface is a
// DAYPART TILE whose tap opens the standard pop-down drop (owner: "remove
// these from the menu i want them to pop down like we have for the amazon
// rail card in the main page"). The v8.65 mid-feed AugtoberRail is GONE. ────
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const home = strip(readFileSync(path.join(ROOT, "app/home.js"), "utf8"));
ok(home.indexOf("function AugtoberRail(") === -1 && home.indexOf("<AugtoberRail") === -1,
  "the mid-feed AugtoberRail is fully removed from home.js (the strip tile replaces it)");
const railsSrc = readFileSync(path.join(ROOT, "lib/rails.js"), "utf8");
const augRow = (railsSrc.match(/\{ id: "augtober",[\s\S]*?\},/) || [""])[0];
ok(/art: "augtober"/.test(augRow), "the augtober rail entry exists and wears the owner's poster art");
ok(!/href:/.test(augRow), "the augtober tile carries NO href — a tap opens the drop, never a page");
const daySrc = readFileSync(path.join(ROOT, "lib/dayparts.js"), "utf8");
ok((daySrc.match(/order: \[[^\]]*'augtober'[^\]]*\]/g) || []).length === 4, "the augtober tile rides all four daypart bands");
const rail = strip(readFileSync(path.join(ROOT, "app/components/DaypartRail.js"), "utf8"));
ok(/selected !== "augtober" \|\| fallPool\) return undefined;/.test(rail), "the drop fetches the owned fall pool only when opened, once");
ok(/fetch\("\/api\/events\/fall"\)/.test(rail), "…and it reads /api/events/fall, the one pool API");
const _ti = rail.indexOf('selRail.id === "augtober" && fallPool');
ok(_ti > -1, "positive control: the augtober drop block is locatable");
const evZone = rail.slice(_ti, _ti + 2600);
ok(/\(e\.when && e\.when\.label\) \|\| "Seasonal"/.test(evZone), "event tiles wear the WHEN badge — an event never gets a fabricated score");
ok(/target="_blank" rel="noreferrer"/.test(evZone), "an event tile links to the official page with noreferrer");
ok(/if \(selected === "augtober"\)/.test(rail) && /photo: p\.image \|\| null/.test(rail),
  "the drop's place cards come from the vetted fall pool, mapped onto the house card contract");
ok(/selRail\.id !== "augtober"/.test(rail), "the drop header does not double-claim 'near <city>' over the title's own 'Near You'");
// ── 3b. The seasonal skin: a DATE LAW, executed ────────────────────────────
ok(fallSkinLive("2026-10-31") === true, "the fall skin is live on Halloween");
ok(fallSkinLive("2026-11-01") === true, "…and through HHN's final night");
ok(fallSkinLive("2026-11-02") === false, "…and GONE the morning after — the transition to Christmas needs no one's memory");
ok(fallSkinLive(null) === false, "no site date, no skin — never a guess");
ok(/fallSkin \? " wf-fall" : ""/.test(rail) || /fallSkin \? "wf-fall" : undefined/.test(rail),
  "the skin class is gated by fallSkinLive, in syntactic position");
const css = readFileSync(path.join(ROOT, "app/components/css.js"), "utf8");
ok(/\.wf-fall \.wf-place-card\{background:linear-gradient\([^;!]*\)!important/.test(css), "the fall card skin exists, scopes ONLY under .wf-fall, and carries !important — the base .wf-place-card background is !important and silently wins otherwise (proven live 2026-08-26)");

// route file structural
const route = strip(readFileSync(path.join(ROOT, "app/api/events/fall/route.js"), "utf8"));
ok(/isFallTagged\(e\.tags\)/.test(route) && /fallEventLive\(e, today\)/.test(route), "the API applies BOTH pool laws");
ok(/FALL_PLACE_IDS/.test(route), "the API serves the vetted place pool, not an ad-hoc list");

console.log(`\ncheck-augtober-rail: ${fail ? "FAIL" : "OK"} — ${pass} assertions; dated events retire, the open run never claims an end, and a tile tap expands in place instead of navigating`);
process.exit(fail ? 1 : 0);
