// scripts/check-sitemap.mjs — sitemap membership + factual lastmod.
//
// Audit: sitemap.xml had 714 URLs, no durable product hubs, and 678 shared
// request-time lastmod values. lastmod must be a content date, not "now".
// Personalized / empty variants stay out. Thin noindex hubs stay out until
// they render crawlable inventory (same contract as check-seo.mjs).
import { readFileSync } from "fs";
import { listPublishReadyAtlasIds, unionIndexedAndAtlasIds } from "../lib/atlasPlaceAllowlist.js";
import { listGuidePlaceIds } from "../lib/guidePlaceIndex.js";

let pass = 0;
const fail = (m) => { console.error("check-sitemap: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const sm = readFileSync(new URL("../app/sitemap.js", import.meta.url), "utf8");

ok(!/const now = new Date\(\)/.test(sm), "request-time `const now = new Date()` lastmod churn is gone");
ok(!/lastModified:\s*now\b/.test(sm), "no URL may use request-time `now` as lastmod");
ok(/GUIDES\[slug\]\.updated/.test(sm), "guide lastmod stays the factual GUIDES[slug].updated date");
ok(!/lastModified:\s*new Date\(\)/.test(sm), "lastmod is never `new Date()` (request time)");

// Durable routes that actually have unique content.
for (const t of ['"/about"', '"/editorial-policy"', '"/how-wayfind-ranks"', '"/guides"', "EVENT_WINDOWS", "TOWN_HUBS", "BEACH_METROS", "listIndexedIds"]) {
  ok(sm.includes(t), "sitemap still lists durable content: " + t);
}

// Empty / personalized / share-state / thin-noindex variants stay out.
ok(!sm.includes('"/p/"') && !sm.includes("${SITE_URL}/p/") && !sm.includes('"/p"'),
  "/p/ share URLs stay out (infinite query space, noindex)");
ok(!/best-of\?city/.test(sm) && !sm.includes('"/best-of"'),
  "/best-of and personalized ?city= variants stay out (dynamic + personal, noindex; another worker owns the canonical)");
ok(!sm.includes('"/events"'), "/events hub stays out while it is a thin noindex GoScreen page — event WINDOWS are the durable product routes");
ok(!sm.includes('"/map"'), "/map hub stays out while it is a thin noindex GoScreen page");
ok(!sm.includes('"/coupons"'), "/coupons hub stays out while it is a thin noindex GoScreen page (do not invent deals)");
ok(sm.includes("EVENT_WINDOWS") && sm.includes("/events/${c}/${w}"),
  "durable event window lists remain the events product in the sitemap");
ok(sm.includes("/places/"), "durable place pages stay in the sitemap (the real /p/ content)");

// Atlas publish-ready cards must be in the place-URL set (union, not a 12k dump).
const idx = readFileSync(new URL("../lib/placeIndex.js", import.meta.url), "utf8");
ok(/unionIndexedAndAtlasIds\(indexed,\s*listPublishReadyAtlasIds\(\)\)/.test(idx),
  "listIndexedIds must CALL unionIndexedAndAtlasIds(indexed, listPublishReadyAtlasIds()) — a mention is not the union");
// 2026-09-23 fix: every GUIDES-linked placeId (the guide-place allowlist) must
// also be unioned in, chained off the atlas-unioned result — so a guide pick
// enters the sitemap the moment it is added, before wf_place_ids ever sees it.
ok(/unionIndexedAndAtlasIds\([A-Za-z0-9_]+,\s*listGuidePlaceIds\(\)\)/.test(idx),
  "listIndexedIds must ALSO union in listGuidePlaceIds() — guide picks belong in the sitemap");
const atlasIds = listPublishReadyAtlasIds();
// 255 from #1021 + 8 sourced ChIJ cards from the 2026-08-29 owner batch (#1019)
// + 1 official North Redington Beach Frog Pond ChIJ from 2026-08-29e.
const PUBLISH_READY = 264;
ok(atlasIds.length === PUBLISH_READY, `publish-ready Atlas allowlist drifted (got ${atlasIds.length}, want ${PUBLISH_READY})`);
const united = unionIndexedAndAtlasIds(["wf-indexed-only"], atlasIds);
ok(united.includes("wf-indexed-only") && united.includes(atlasIds[0]) && united.length === PUBLISH_READY + 1,
  `union must keep indexed ids and the ${PUBLISH_READY} Atlas cards without dumping inventory`);

// Functional check (not just source-regex): every GUIDES-linked placeId
// actually survives listIndexedIds's chained union, so it lands in
// app/sitemap.js's `places` array on the day it's added, not the day a real
// search first happens to put it in wf_place_ids.
const guideIds = listGuidePlaceIds();
ok(guideIds.length >= 50, `guide place index must expose at least the 50 restaurant picks fixed 2026-09-23 (got ${guideIds.length})`);
const unitedWithGuides = unionIndexedAndAtlasIds(united, guideIds);
ok(guideIds.every((id) => unitedWithGuides.includes(id)),
  "every GUIDES-linked placeId must survive the atlas+guide union into the sitemap set");

console.log(`check-sitemap: OK — ${pass} assertions (factual lastmod; durable membership; empty/personalized/thin hubs excluded; Atlas ${PUBLISH_READY} unioned; ${guideIds.length} guide places unioned)`);
