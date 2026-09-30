// scripts/check-sitemap.mjs — sitemap membership + factual lastmod.
//
// Audit: sitemap.xml had 714 URLs, no durable product hubs, and 678 shared
// request-time lastmod values. lastmod must be a content date, not "now".
// Personalized / empty variants stay out. Thin noindex hubs stay out until
// they render crawlable inventory (same contract as check-seo.mjs).
//
// 2026-09-23 SEO recovery: listIndexedIds() stopped unioning the raw
// recently-searched wf_place_ids set (it churned and most of it had no
// durable content — see lib/placeEligibility.js). The two assertions this
// file used to run against lib/placeIndex.js's SOURCE TEXT ("must CALL
// unionIndexedAndAtlasIds(indexed, listPublishReadyAtlasIds())") described
// that old shape exactly and would fail on the new one even though the new
// one is correct — CLAUDE.md: when a guard goes red because the code moved,
// follow the code. Replaced with functional checks that CALL listIndexedIds()
// itself (no live Supabase reachable — credentials deleted below — so this
// exercises exactly the Atlas+GUIDES path a real build takes) and delegate
// the full eligibility/parity proof to scripts/check-place-sitemap-parity.mjs.
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

import { readFileSync } from "fs";
import { register } from "node:module";
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

// Atlas publish-ready allowlist size — unrelated to eligibility filtering,
// this is the raw card count (data/atlas/editorial-cards.json).
const atlasIds = listPublishReadyAtlasIds();
// 255 from #1021 + 8 sourced ChIJ cards from the 2026-08-29 owner batch (#1019)
// + 1 official North Redington Beach Frog Pond ChIJ from 2026-08-29e.
// 2026-09-29: owner-approved Atlas-590 completion (wayfind-atlas-editorial #1/#2) → additive merge: 262 live kept + 197 new = 459 (was 264); 28 held for source vetting.
const PUBLISH_READY = 459;
ok(atlasIds.length === PUBLISH_READY, `publish-ready Atlas allowlist drifted (got ${atlasIds.length}, want ${PUBLISH_READY})`);
const united = unionIndexedAndAtlasIds(["wf-indexed-only"], atlasIds);
ok(united.includes("wf-indexed-only") && united.includes(atlasIds[0]) && united.length === PUBLISH_READY + 1,
  `union must keep indexed ids and the ${PUBLISH_READY} Atlas cards without dumping inventory`);

const guideIds = listGuidePlaceIds();
ok(guideIds.length >= 50, `guide place index must expose at least the 50 restaurant picks fixed 2026-09-23 (got ${guideIds.length})`);

// Functional check (not source-regex): listIndexedIds() — the actual
// sitemap/generateStaticParams input — is reachable, non-empty with no live
// Supabase, and every publish-ready Atlas id that is itself durably eligible
// (has an address — see check-place-sitemap-parity.mjs for the ones that
// don't) actually lands in it, so a real place enters the sitemap the day
// its card/guide-pick is added, not the day a search first hits wf_place_ids.
register("./lib/placeDataNodeHook.mjs", import.meta.url);
const { listIndexedIds } = await import("../lib/placeIndex.js");
const { mergePlacePage, atlasPlaceFor } = await import("../lib/atlasPlaceAllowlist.js");
const { isIndexable } = await import("../lib/placeData.js");

const indexedIds = await listIndexedIds(500);
ok(Array.isArray(indexedIds) && indexedIds.length > 0, "listIndexedIds() must return a non-empty set from Atlas+GUIDES content alone (no live Supabase in this run)");
let eligibleAtlasCount = 0;
for (const id of atlasIds) {
  const atlas = atlasPlaceFor(id);
  const merged = mergePlacePage(id, { skel: null, details: null, atlas, guide: null, editorial: null });
  if (merged && isIndexable(merged)) {
    eligibleAtlasCount++;
    ok(indexedIds.includes(id), `listIndexedIds() must include eligible publish-ready Atlas id ${id} — the sitemap would be missing a real place page`);
  }
}
ok(eligibleAtlasCount > 0, "POSITIVE CONTROL: at least one publish-ready Atlas id is itself durably eligible — otherwise the assertion above never actually ran");
console.log(`check-sitemap: listIndexedIds() carries all ${eligibleAtlasCount} eligible publish-ready Atlas ids (full eligibility/parity proof lives in check-place-sitemap-parity.mjs)`);

console.log(`check-sitemap: OK — ${pass} assertions (factual lastmod; durable membership; empty/personalized/thin hubs excluded; Atlas ${PUBLISH_READY} cards, ${guideIds.length} guide places, listIndexedIds() carries every eligible one)`);

// 2026-09-28 — the curated Florida events layer and the dedicated fall-festivals
// guide were indexable but missing from the sitemap (CLAUDE.md lesson 5).
{
  const smCode = sm.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(/export const revalidate\s*=\s*\d+/.test(smCode), "sitemap exports a numeric revalidate, so the curated events (a skipped read at build) are read at request time");
  ok(/floridaEventSitemapRows\(\s*await fetchCuratedEvents\(\)/.test(smCode), "sitemap CALLS floridaEventSitemapRows on the live curated read");
  ok(/try\s*\{[^}]*floridaEventSitemapRows[^}]*\}\s*catch/.test(smCode), "a failed events read is caught, so it drops the events and never the whole sitemap");
  ok(/\.\.\.floridaEvents\b/.test(smCode) && /\.\.\.dedicatedGuides\b/.test(smCode), "events + dedicated guides are spread into the returned sitemap array");
  ok(/`\$\{SITE_URL\}\/florida-events`/.test(smCode), "/florida-events hub is listed");
  ok(/"florida-fall-festivals-2026"/.test(smCode), "dedicated fall-festivals guide is listed");

  // Functional: CALL the row builder with fixtures, including negative controls.
  const { floridaEventSitemapRows } = await import("../lib/curatedEvents.js");
  const now = new Date("2026-09-28T16:00:00Z");
  const base = { event_status: "scheduled", source_tier: 1, verification_confidence: "high", card_hook: "x", city: "Sarasota", state: "FL", lat: 27.3, lng: -82.5 };
  const { isTrusted } = await import("../lib/curatedEvents.js");
  const good = { ...base, slug: "good-fest-2026", start_date: "2026-10-10", last_verified_at: "2026-09-20T00:00:00Z" };
  ok(isTrusted(good), "POSITIVE CONTROL: the fixture event passes isTrusted (otherwise every assertion below is vacuous)");
  const rows = floridaEventSitemapRows([
    good, { ...good }, // duplicate slug
    { ...base, slug: "past-fest", start_date: "2026-09-01" },
    { ...base, slug: "chicago-fest", start_date: "2026-10-10", state: "IL", lat: 41.9, lng: -87.6 },
    { ...base, slug: "cancelled-fest", start_date: "2026-10-10", event_status: "cancelled" },
    { ...base, slug: null, start_date: "2026-10-10" },
  ], "https://www.gowayfind.com", { now });
  ok(rows.length === 1 && rows[0].url === "https://www.gowayfind.com/florida-events/good-fest-2026", `only the upcoming trusted Florida event is listed, once (got ${JSON.stringify(rows.map((r) => r.url))})`);
  ok(rows[0].lastModified instanceof Date && rows[0].lastModified.toISOString().startsWith("2026-09-20"), "event lastmod is the row's own last_verified_at, never request time");
  ok(floridaEventSitemapRows(null).length === 0, "a null read yields zero event rows, not a throw");
  console.log("check-sitemap: florida-events sitemap layer OK");
}
