#!/usr/bin/env node
// scripts/check-christmas-browse-credit.mjs: a licensed Christmas photo keeps
// its credit on every card that shows it.
//
// Live 2026-10-14: /christmas-in-florida showed the seven Wikimedia venue
// photos (#1780) with no credit, because christmasBrowseCardJson whitelisted
// card fields and dropped photoAttr / photoAttrHref. CC BY-SA requires the
// attribution. EXECUTED, not grepped:
//   1. build the real browse listings (christmasBrowseListings) and page them
//      through christmasBrowsePage, the same serializer the API and the server
//      rendered first page use; every card whose image is under
//      /events/christmas/ must carry the provenance credit and link
//   2. the rails card (christmasEventCard) carries the same pair
//   3. render the REAL ChristmasBrowseCard (jsxLoad + react-dom/server) from a
//      browse JSON card and assert the visible credit badge, its text and link
//   4. a wf_events row that keeps its own photo (shadowed) shows no Wikimedia
//      credit for a photo it does not show
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { christmasBrowseListings, christmasBrowsePage, parseChristmasBrowseQuery } from "../lib/christmasBrowse.js";
import { CHRISTMAS_LICENSED_PHOTOS } from "../lib/christmasPhotos.js";
import { CHRISTMAS_DB_RESEARCH_IDS, mergeChristmasResearch } from "../lib/christmasResearch.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const TODAY = "2026-10-14";
const prov = JSON.parse(readFileSync(path.join(ROOT, "data/christmas-photo-provenance.json"), "utf8")).photos;
const live = prov.filter((e) => e.shadowed_by_db_photo !== true);
const byFile = new Map(Object.entries(CHRISTMAS_LICENSED_PHOTOS).map(([id, p]) => ["/events/christmas/" + p.file, { id, ...p }]));

// 1. Every page of the unfiltered browse, through the real serializer.
const listings = christmasBrowseListings([], TODAY);
const cards = [];
for (let page = 1; page < 60; page++) {
  const out = christmasBrowsePage(listings, parseChristmasBrowseQuery({ page: String(page) }), TODAY);
  cards.push(...out.cards);
  if (!out.hasMore) break;
}
const licensed = cards.filter((c) => String(c.image || "").startsWith("/events/christmas/"));
ok(cards.length === listings.length && cards.length > 400, `paged every browse card through the serializer (${cards.length})`);
ok(licensed.length >= live.length, `positive control: the browse JSON holds the licensed photos (${licensed.length} cards, ${live.length} live provenance entries)`);
for (const c of licensed) {
  const p = byFile.get(c.image);
  ok(!!p && c.photoAttr === p.credit && c.photoAttrHref === p.href, `${c.id}: browse JSON carries "${p?.credit}" and its link (has "${c.photoAttr}", ${c.photoAttrHref})`);
}
for (const e of live) ok(licensed.some((c) => c.image === "/events/christmas/" + e.file), `${e.slug}: its licensed photo is on a browse card`);

// 2. The rails card carries the same pair (the browse card is built from it).
const railCard = listings.find((c) => String(c.image || "").startsWith("/events/christmas/"));
ok(!!railCard && railCard.photoAttr === byFile.get(railCard.image)?.credit && railCard.photoAttrHref === byFile.get(railCard.image)?.href, "the card the rails send carries the same credit and link");

// 3. The real browse card renders the credit badge.
const { ChristmasBrowseCard } = await loadComponent(path.join(ROOT, "app/components/ChristmasBrowse.js"), ROOT);
const nol = licensed.find((c) => /stetson/.test(c.image)) || licensed[0];
const html = renderToStaticMarkup(React.createElement(ChristmasBrowseCard, { card: nol, rank: 1, today: TODAY }));
const badge = /<a[^>]*class="wf-place-card-photo-attr"[^>]*>/.exec(html)?.[0] || "";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
ok(badge.includes('title="' + esc("Photo: " + nol.photoAttr) + '"') && badge.includes('href="' + esc(nol.photoAttrHref) + '"'), `the browse card shows the credit badge "${nol.photoAttr}" linked to its source (${badge.slice(0, 160)})`);
const bare = renderToStaticMarkup(React.createElement(ChristmasBrowseCard, { card: { ...nol, photoAttr: undefined, photoAttrHref: undefined }, rank: 1, today: TODAY }));
ok(!/wf-place-card-photo-attr/.test(bare), "negative control: without the fields the badge is gone, so the probe sees the difference");

// 4. A shadowed listing (wf_events keeps its own photo) shows no Wikimedia credit.
for (const e of prov.filter((x) => x.shadowed_by_db_photo === true)) {
  const dbId = Object.keys(CHRISTMAS_DB_RESEARCH_IDS).find((k) => CHRISTMAS_DB_RESEARCH_IDS[k] === e.slug);
  ok(!!dbId, `${e.slug}: a wf_events row maps to it`);
  if (!dbId) continue;
  const merged = mergeChristmasResearch([{ event_id: dbId, slug: dbId, event_name: "E", city: "X", state: "FL", start_date: "2026-12-05", end_date: "2026-12-06", lat: 29.9, lng: -81.3, hero_image: "/api/photo?place=ChIJShadowedPhoto001&w=800", event_status: "scheduled", source_tier: 1, verification_confidence: "high", card_hook: "x", tags: [] }]).find((r) => r.event_id === dbId);
  ok(merged && merged.hero_image.startsWith("/api/photo") && !merged.photoAttr, `${dbId}: keeps its own photo and carries no Wikimedia credit`);
}

console.log(`\ncheck-christmas-browse-credit: ${fail ? "FAIL" : "OK"}: ${pass} assertions (${cards.length} browse cards serialized, ${licensed.length} with a licensed photo, ${prov.length - live.length} shadowed)`);
process.exit(fail ? 1 : 0);
