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
import { isFallTagged, fallEventLive, fallWhenLabel, fallSkinLive, eventFranchiseKey, FALL_PLACE_IDS, FALL_REJECTED_IDS, FALL_OFFERING_SOURCES, FALL_EVENT_TICKET_DEALS, OPEN_RUN_DAYS } from "../lib/fallPool.js";
import { FALL_CARD_IDS, fallCardClass } from "../lib/fallSkin.js";

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

// ── 2. The vetted place pool stays vetted — RE-VETTED per the owner's
// 2026-08-26 rejection: a spooky NAME is not a fall offering. ───────────────
const ids = Object.keys(FALL_PLACE_IDS);
ok(ids.length >= 8, `positive control — the researched fall pool exists (${ids.length})`);
ok(!ids.includes("ChIJdRuMvWg3DogRdLBmivDl1SQ"), "a Chicago haunted house can never enter the Florida pool");
ok(!ids.includes("ChIJ6SYy9bEWw4gRgJT7j78eTYc"), "'Screaming Buddha Yoga' is a yoga studio, not fall content");
for (const r of FALL_REJECTED_IDS) ok(!ids.includes(r), `owner-rejected id ${r.slice(0, 12)}… stays OUT (name-only spookiness / brand duplicate)`);
ok(FALL_REJECTED_IDS.includes("ChIJUXMXELw9w4gR4TGRAD8NghQ") && FALL_REJECTED_IDS.includes("ChIJJQbqwSD7wogRTm8XCaabaMA"),
  "both Vampire Penguins are pinned in the rejected list — 'vampire in the name' is not a fall theme (owner, verbatim)");
ok(ids.filter((i) => i === "ChIJB2B8mYzHwogRkZIDCDARWww").length === 1 && !ids.includes("ChIJUcws8z5p54gRUBjqVlhhFgY"),
  "one Ice Screamin location only — one tile per brand");
ok(ids.includes("ChIJ7QVjUK_FwogRaTLY8uxOico") && ids.includes("ChIJTzoiienhwogRbPa3GpuvBQU"),
  "the researched picks are IN (SpookEasy Lounge; Paradeco's fall menu) — real offerings, sourced");
ok(ids.every((i) => /^ChIJ[A-Za-z0-9_-]{10,}$/.test(i)), "every pool entry is a real canonical place id");
ok(Object.values(FALL_PLACE_IDS).every((v) => typeof v === "string" && v.length > 20), "every pool entry carries its seasonal WHY");
// 2a. THE OFFERING TEST (owner: places enter for what they OFFER, never the
// name — 'run another test on that to make sure'). Executed: the pool and the
// documented-offering registry must be the SAME set, every entry must name a
// concrete offering with a source, and the offering may never be just the
// place's own name wearing a costume.
const srcIds = Object.keys(FALL_OFFERING_SOURCES);
ok(srcIds.length === ids.length && ids.every((i) => FALL_OFFERING_SOURCES[i]),
  "every pool member has a DOCUMENTED offering + source — a name-only pick has nowhere to hide");
ok(srcIds.every((i) => /^https:\/\//.test(FALL_OFFERING_SOURCES[i].source) && FALL_OFFERING_SOURCES[i].offering.length > 15),
  "each registry entry carries a real https source and a concrete offering description");
ok(srcIds.every((i) => /menu|pumpkin|maple|squash|haunted|ghost|horror|spooky|potion|halloween|coffin|oddities|burial/i.test(FALL_OFFERING_SOURCES[i].offering)),
  "every offering names the FALL substance (menu item or theming), not a vibe");

// ── 2b. Franchise dedupe, EXECUTED (owner: "most of them are repetitive") ──
ok(eventFranchiseKey("Howl-O-Scream SeaWorld Orlando") === eventFranchiseKey("Howl-O-Scream Busch Gardens Tampa Bay"),
  "the two Howl-O-Screams share one franchise key — only the nearest gets a tile");
ok(eventFranchiseKey("Halloween Horror Nights Orlando") !== eventFranchiseKey("Sideshow Obscura — HHN35 Tribute Store"),
  "HHN and the Tribute Store are DIFFERENT offerings — dedupe must not swallow them");
ok(eventFranchiseKey("Vampire Penguin") !== eventFranchiseKey("Fantasy Fest"), "distinct franchises stay distinct");

// ── 2c. Ticket monetization: PRODUCT integrity, pinned ─────────────────────
ok(FALL_EVENT_TICKET_DEALS["mnsshp-2026"] === 8, "Not-So-Scary deep-links UT's ticket for THAT event (deal 8)");
ok(!("hhn-orlando-2026" in FALL_EVENT_TICKET_DEALS) && !Object.keys(FALL_EVENT_TICKET_DEALS).some((k) => /howl-o-scream/.test(k)),
  "separately-ticketed events (HHN, Howl-O-Scream) NEVER deep-link generic day tickets — wrong product is a trust bug wearing a commission");
ok(Object.values(FALL_EVENT_TICKET_DEALS).every((v) => Number.isInteger(v) && v > 0), "every mapping points at a real wf_deals id");

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
const evZone = rail.slice(_ti, _ti + 5200);
ok(/\(e\.when && e\.when\.label\) \|\| "Seasonal"/.test(evZone), "event tiles wear the WHEN badge — an event never gets a fabricated score");
ok(!/loading="lazy"/.test(evZone), "fall tile images are EAGER — the drop opens on a click (that IS the lazy gate), and lazy imgs mounted inside the freshly-expanded scroller never fired their intersection (proven live 2026-08-26: currentSrc stayed empty until the attribute was removed)");
ok(/target="_blank" rel="noreferrer"/.test(evZone), "an event tile links to the official page with noreferrer");
// monetized tiles: paid link first, disclosed, sponsored rel on the PAID link only
ok(/e\.ticket \? \(/.test(evZone) && /href=\{e\.ticket\.href\} target="_blank" rel="sponsored nofollow noopener"/.test(evZone),
  "a monetized tile links the health-checked UT deal FIRST, with rel sponsored");
ok(/Tickets · via " \+ e\.ticket\.via/.test(evZone), "the paid tile DISCLOSES its partner on the tile (FTC line)");
ok(/logEvent\("tickets_out", \{ kind: "augtober_rail"/.test(evZone), "a paid click emits tickets_out — revenue that cannot be measured cannot be protected");
ok(/e\.url \|\| e\.place_id/.test(rail), "an event with no link and no venue never renders — a dead tile is worse than one fewer tile");
ok(/eventFranchiseKey\(e\.name \|\| e\.title\)/.test(rail) && /dist\(a\) - dist\(b\)/.test(rail),
  "the drop dedupes by franchise and shows the NEAREST location first");
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
ok(/\.wf-fall \.wf-place-card,\.wf-place-card\.wf-fall-card\{background:#C96F1E url\(\/fall\/card-bg-760\.webp[^)]*\) left bottom\/cover no-repeat!important/.test(css),
  "the fall skin IS the owner's template art (v8.68.1: 'this is the FALL place card design') — served as the card background with !important, cover from left-bottom so the pumpkins stay pinned under the photo mask");
ok(/;mask-image:radial-gradient\(135% 110% at 100% 0%,#000 60%,transparent 92%\)\}/.test(css),
  "the photo fades at its left corners so the art's baked pumpkins and leaf show THROUGH it — the owner's overlap, no cropped overlays, no hard edges");
import { statSync } from "node:fs";
for (const f of ["public/fall/card-bg-380.webp", "public/fall/card-bg-760.webp", "public/fall/card-bg-1148.webp"]) {
  ok(statSync(path.join(ROOT, f)).size > 4000, `the processed owner art ships on disk (${f})`);
}

// ── 3c. THE FALL CARD FOLLOWS THE PLACE (owner, 2026-08-26: "all of the
// place cards that are featured for fall … only those places that are fall
// known and make it go away when fall is over"). One membership, four
// renderers, one death date — the #966 lesson says pin ALL FOUR, because
// placement/skin is (one CSS rule) x (every root that carries the class). ──
ok(FALL_CARD_IDS.size === Object.keys(FALL_PLACE_IDS).length && Object.keys(FALL_PLACE_IDS).every((i) => FALL_CARD_IDS.has(i)),
  "FALL_CARD_IDS (client) and FALL_PLACE_IDS (server) are the SAME set — membership has one source of truth");
ok(fallCardClass("ChIJTzoiienhwogRbPa3GpuvBQU", "2026-10-01") === " wf-fall-card", "a fall-known place wears the card in season (executed)");
ok(fallCardClass("ChIJTzoiienhwogRbPa3GpuvBQU", "2026-11-02") === "", "…and NOT after Halloween — the skin dies with the season");
ok(fallCardClass("ChIJdd8VlMN-54gRoaU0d_zYhfk", "2026-10-01") === "", "a non-member place NEVER wears it — fall-known only");
ok(fallCardClass(null, "2026-10-01") === "", "no id, no class");
const RENDERERS = [
  ["app/components/IconicPlaceCard.js", /className=\{`wf-place-card\$\{fallCardClass\(place\.id, siteTodayStr\(\)\)\}/],
  ["app/components/RailCard.js", /className=\{`wf-place-card wf-rail-card\$\{fallCardClass\(place && place\.id, siteTodayStr\(\)\)\}/],
  ["app/home.js", /className=\{`wf-place-card\$\{fallCardClass\(p && p\.id, siteTodayStr\(\)\)\}/],
  ["app/components/ThingsToDoList.js", /"wf-place-card wf-ttd-focus" \+ fallCardClass\(r\.place_id \|\| r\.id, siteTodayStr\(\)\)/],
];
for (const [f, rx] of RENDERERS) {
  ok(rx.test(strip(readFileSync(path.join(ROOT, f), "utf8"))), `${f} carries fallCardClass on its card ROOT — a renderer that drops it ships season-blind cards`);
}
ok(/\.wf-place-card\.wf-fall-card\{background:#C96F1E url\(/.test(css),
  "the card-level skin selector exists — the drop-scoped class alone cannot dress a card on the browse feed");

// route file structural
const route = strip(readFileSync(path.join(ROOT, "app/api/events/fall/route.js"), "utf8"));
ok(/isFallTagged\(e\.tags\)/.test(route) && /fallEventLive\(e, today\)/.test(route), "the API applies BOTH pool laws");
ok(/FALL_PLACE_IDS/.test(route), "the API serves the vetted place pool, not an ad-hoc list");

console.log(`\ncheck-augtober-rail: ${fail ? "FAIL" : "OK"} — ${pass} assertions; dated events retire, the open run never claims an end, and a tile tap expands in place instead of navigating`);
process.exit(fail ? 1 : 0);
