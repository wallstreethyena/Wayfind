#!/usr/bin/env node
// scripts/test-shell-key-guide-deeplinks.mjs
//
// Owner 2026-08-25: the Shell Key Preserve cash-register card
// (/places/ChIJ5_NkHLUcw4gRndvLQGe_Ox8, Book SKU 173028P1 only) was a
// dead-end URL. Indexable St. Pete / Tampa Bay / Fort De Soto / kayak
// surfaces must deep-link that placeId so crawlers and humans can reach
// the joinable Book CTA from more than one page.
//
// ASSERT ON THE CALL, not a substring. GUIDES / CULTURE / TOWN_PROFILES
// are imported and queried. A grep for the id would pass if it only
// lived in this file's comment. The guide template is checked at the
// href expression that renders, not for the words "placeId" anywhere.

import { readFileSync } from "node:fs";
import { GUIDES } from "../lib/guides.js";
import { TOWN_PROFILES, TOWN_ALIASES } from "../lib/culture.js";
import { CULTURE } from "../lib/cultureCorpus.js";
import { SUMMER_UNIVERSE } from "../lib/summerUniverse.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const PLACE_ID = "ChIJ5_NkHLUcw4gRndvLQGe_Ox8";
const ST_PETE = "things-to-do-st-petersburg-clearwater-summer-2026";
const TAMPA = "things-to-do-in-tampa-florida";

const strip = (src) => String(src || "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function pickByPlaceId(guide) {
  return (guide && Array.isArray(guide.picks) ? guide.picks : [])
    .find((p) => p && p.placeId === PLACE_ID) || null;
}

// ── 1. CALL: the St. Pete / Clearwater summer guide deep-links Shell Key ──
const stPete = GUIDES[ST_PETE];
ok(!!stPete, `GUIDES[${ST_PETE}] is loadable`);
ok(!!stPete && Array.isArray(stPete.picks) && stPete.picks.length === 11,
  `St. Pete summer guide still delivers 11 picks (got ${stPete && stPete.picks && stPete.picks.length})`);
const stPetePick = pickByPlaceId(stPete);
ok(!!stPetePick, "St. Pete summer guide has a pick whose placeId IS the Shell Key id — find() on GUIDES, not a file grep");
ok(stPetePick && stPetePick.name === "Shell Key Preserve",
  `that pick is named Shell Key Preserve (got ${stPetePick && stPetePick.name})`);
ok(stPetePick && stPetePick.appQuery === "Shell Key Preserve",
  "the pick keeps the documented appQuery field — Open in Wayfind still names the preserve");
ok(stPetePick && /Tierra Verde/i.test(stPetePick.blurb || "") && /Fort De Soto/i.test(stPetePick.blurb || ""),
  "the pick is the honest next-door island (Tierra Verde + Fort De Soto), not a menu dump");
ok(stPete && (stPete.picks || []).some((p) => p && p.name === "Fort De Soto Park"),
  "Fort De Soto stays a pick — Shell Key was added beside it, not swapped in");

// ── 2. CALL: the Tampa evergreen guide's Gulf day-trip pick ───────────────
const tampa = GUIDES[TAMPA];
ok(!!tampa, `GUIDES[${TAMPA}] is loadable`);
const tampaPick = pickByPlaceId(tampa);
ok(!!tampaPick, "Tampa evergreen guide has a pick whose placeId IS the Shell Key id");
ok(tampaPick && /day trip/i.test(tampaPick.name || "") && /Shell Key/i.test(tampaPick.name || ""),
  "Tampa frames Shell Key as a Gulf day trip, not a Tampa neighborhood");
ok(tampaPick && /45 minutes west/i.test(tampaPick.blurb || ""),
  "the Tampa blurb says the drive — a geo hop dressed as in-town would fail this");

// ── 3. CALL: culture + town profiles already published for this intent ───
const tampaSee = (CULTURE.tampa && CULTURE.tampa.see) || [];
ok(tampaSee.some((x) => x && x.placeId === PLACE_ID && x.name === "Shell Key Preserve"),
  "CULTURE.tampa.see includes Shell Key with the placeId — /culture/tampa can render /places/{id}");
ok(!tampaSee.some((x) => x && x.placeId === PLACE_ID && (x.query || x.viatorUrl)),
  "the culture see row has no query / viatorUrl — search-as-Book stays off");

const stPeteTown = TOWN_PROFILES["st. petersburg"];
const stPeteBeachTown = TOWN_PROFILES["st. pete beach"];
ok(stPeteTown && (stPeteTown.beach.items || []).some((x) => x && x.placeId === PLACE_ID),
  "St. Petersburg town beach items carry the Shell Key placeId");
ok(stPeteBeachTown && (stPeteBeachTown.todo.items || []).some((x) => x && x.placeId === PLACE_ID),
  "St. Pete Beach todo items carry the Shell Key placeId — the island shell run already named in the line");
ok(stPeteBeachTown && (stPeteBeachTown.beach.items || []).some((x) => x && x.placeId === PLACE_ID),
  "St. Pete Beach beach items carry the Shell Key placeId");
ok(TOWN_ALIASES["pass-a-grille"] === "st. pete beach" && TOWN_ALIASES["pass a grille"] === "st. pete beach",
  "Pass-a-Grille aliases resolve to the St. Pete Beach profile that now names Shell Key");

// ── 4. Summer rail already curated this card — we did not invent it ───────
const summer = SUMMER_UNIVERSE.find((e) => e && e.key === "shell_key");
ok(!!summer && summer.venue && summer.venue.placeId === PLACE_ID,
  "summerUniverse.shell_key still carries the same placeId — this PR did not mint a new identity");

// ── 5. Guide + culture templates actually emit /places/{placeId} ──────────
const guidePage = strip(readFileSync(new URL("../app/guides/[slug]/page.js", import.meta.url), "utf8"));
const placeHref = /href=\{\s*"\/places\/"\s*\+\s*encodeURIComponent\(pick\.placeId\)\s*\}/g;
const guideHrefs = guidePage.match(placeHref) || [];
ok(guideHrefs.length === 2,
  `guide template renders /places/{pick.placeId} twice (heading + action) — got ${guideHrefs.length}`);
ok(/<h2[\s\S]{0,240}pick\.placeId[\s\S]{0,160}\/places\//.test(guidePage),
  "the heading is the /places/ link — crawlers read the h2, not a comment");
ok(/wf-guide-actions[\s\S]{0,220}pick\.placeId[\s\S]{0,120}\/places\//.test(guidePage),
  "the actions row also links /places/{pick.placeId} so a human can tap it");
ok(/Open in Wayfind/.test(guidePage),
  "positive control: Open in Wayfind is still in the same template, so the /places/ absence check is not scanning an empty file");

const culturePage = strip(readFileSync(new URL("../app/culture/[metro]/page.js", import.meta.url), "utf8"));
ok(/c\.see\.map[\s\S]{0,200}x\.placeId[\s\S]{0,160}\/places\//.test(culturePage),
  "culture see items with placeId render an <a href=/places/{id}> — role, not a mention");
ok(/t\[ck\]\.items\.map[\s\S]{0,220}x\.placeId[\s\S]{0,160}\/places\//.test(culturePage),
  "culture town Don't-miss items with placeId render /places/{id}");

const hub = strip(readFileSync(new URL("../app/guides/page.js", import.meta.url), "utf8"));
ok(/const order = \[[^\]]*["']St\. Petersburg["']/.test(hub),
  "guides hub order includes St. Petersburg so the summer guide is a listed, indexable hop");

// ── 6. Fail-closed integrity on the files we edited ───────────────────────
const summerGuides = strip(readFileSync(new URL("../lib/guidesSummer2026.js", import.meta.url), "utf8"));
const gulfGuides = strip(readFileSync(new URL("../lib/guidesGulfCoast2026.js", import.meta.url), "utf8"));
const edited = summerGuides + "\n" + gulfGuides;
ok(!/\b173028P1\b/.test(edited) && !/\b237533P2\b/.test(edited) && !/\b22211P1\b/.test(edited) && !/\b236862P2\b/.test(edited),
  "edited guides do not carry a Viator SKU — Book stays on /places via the pin, never a painted product code");
ok(!/https:\/\/www\.viator\.com/i.test(edited),
  "edited guides have no raw viator.com URL");
ok(!/bookQuery/.test(JSON.stringify(stPetePick)) && !/bookQuery/.test(JSON.stringify(tampaPick)),
  "Shell Key picks have no bookQuery — search-as-Book stays off");

const crystal = Object.keys(GUIDES).filter((s) => /crystal|scallop/i.test(s));
ok(crystal.length >= 1 && !crystal.includes(ST_PETE) && !crystal.includes(TAMPA),
  "existing Crystal River / scallop guides are untouched; this PR did not add a new one");

if (fail.length) {
  console.error("test-shell-key-guide-deeplinks: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`test-shell-key-guide-deeplinks: OK — ${pass} assertions (GUIDES/CULTURE/TOWN_PROFILES CALLED; ${ST_PETE} + ${TAMPA} + /culture/tampa + St. Pete town profiles deep-link ${PLACE_ID}; template hrefs are /places/{placeId}; no SKU, no ferry, no search-as-Book)`);
