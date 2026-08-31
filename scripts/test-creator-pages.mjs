#!/usr/bin/env node
/**
 * test-creator-pages — the indexable /creators layer is REAL, not a URL farm.
 *
 * v8.33 shipped one crawlable page per creator, each carrying a followed link
 * to that creator's own profile and posts. That is a genuine SEO asset and it
 * is also the exact shape of the two things that get a domain penalised, so
 * both are asserted here rather than trusted:
 *
 *   THIN PAGES. A page per handle would have produced seventeen URLs, four of
 *   them listing a single place. MIN_SPOTS is the line; this proves the line is
 *   real and that the sitemap and generateStaticParams see the SAME set (a
 *   sitemap advertising URLs that 404 under dynamicParams:false is worse than
 *   no sitemap entry).
 *
 *   FALSE ENDORSEMENT. These pages put a real person's photograph and handle on
 *   a commercial site. check-creator-rights.mjs already scans the SOURCE for
 *   the banned phrases; this checks the RENDERED page, which is where a claim
 *   assembled from three template pieces would actually appear, and asserts the
 *   independence disclosure and the removal route render on every one of them.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { renderToStaticMarkup } from "react-dom/server";
import { allCreators, CREATOR_PAGE_MIN_SPOTS, hasCreatorPage, FEATURED_CREATOR } from "../lib/creatorVideos.js";
import { claimsAffiliation, REMOVAL_CONTACT } from "../lib/creatorRights.js";

const REPO = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const pagesMod = await loadComponent(fileURLToPath(new URL("../lib/creatorPages.js", import.meta.url)), REPO);
const { creatorSlugs, creatorProfile, creatorMetadata, CreatorPage, CreatorsIndexPage, pagedCreators } = pagesMod;

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const slugs = creatorSlugs();
const { creators } = allCreators();

// ── the set of pages ────────────────────────────────────────────────────────
ok(slugs.length >= 5, `creators have pages (got ${slugs.length}) — an empty set makes everything below vacuous`);
ok(slugs.length < creators.length, "…and NOT every handle gets one, which is the whole point of the floor");
for (const h of slugs) {
  const row = creators.find((c) => c.handle === h);
  ok(row && row.count >= CREATOR_PAGE_MIN_SPOTS, `@${h} clears MIN_SPOTS (${row ? row.count : 0})`);
}
for (const c of creators) {
  if (c.count >= CREATOR_PAGE_MIN_SPOTS) continue;
  ok(!slugs.includes(c.handle), `@${c.handle} has only ${c.count} spot(s) and correctly gets NO page`);
  ok(hasCreatorPage(c.handle) === false, `…and hasCreatorPage() agrees, so no in-app link points at that 404`);
}
ok(new Set(slugs).size === slugs.length, "no duplicate slug — two pages on one URL is one page that loses");
ok(slugs.every((h) => /^[A-Za-z0-9._-]{1,40}$/.test(h)), "every slug is URL-safe without escaping");
ok(hasCreatorPage(FEATURED_CREATOR), "the featured creator has a page — the homepage rail's CTA points at it");
ok(hasCreatorPage("nobody-has-ever-posted-this") === false, "an unknown handle is never claimed to have a page");

// The sitemap must advertise exactly the prerendered set: dynamicParams=false
// makes anything else a 404 served from our own sitemap.
const sitemapSrc = await import("node:fs").then((fs) => fs.readFileSync(path.join(REPO, "app/sitemap.js"), "utf8"));
ok(sitemapSrc.includes("creatorSlugs()"), "the sitemap builds creator URLs from creatorSlugs(), not a second hand-kept list");

// ── the rendered page ───────────────────────────────────────────────────────
const featured = creatorProfile(FEATURED_CREATOR);
ok(!!featured, "the featured creator resolves a profile");
ok(featured.cities.length >= 2, `…across real cities (got ${featured.cities.length})`);
ok(featured.placeCount >= CREATOR_PAGE_MIN_SPOTS, "…with a real body of work on it");

// CreatorPage is ASYNC (v8.94) — it awaits the wf_inventory join behind its
// map. Rendering the un-awaited Promise would have produced an empty string and
// silently passed nothing: renderToStaticMarkup(Promise) is not an error.
//
// TWO RENDERS, because the map has two legitimate states and only one of them
// is reachable in a bare-node guard on its own. `html` is the page WITH rows
// injected through CreatorPage's documented seam (the shape lib/creatorPlaces.js
// returns, verified against real wf_inventory rows); `htmlNoMap` is the page
// with the join returning nothing, which is what a reader gets when Supabase is
// unreachable. The second is the negative control: it must still be a complete
// page, and it must not claim a map it does not have.
const MAP_ROWS = [
  { id: "ChIJIQGDwpgXw4gRxIJcGmjtyK4", name: "Spinning Coffee", lat: 27.4949284, lng: -82.5966988, primary_type: "coffee_shop", category: "food", rating: 4.9, reviews: 214, city: "Bradenton", videoUrl: "https://www.tiktok.com/@cindy.selects/video/7668348057171365133" },
  { id: "ChIJ1RqNFQB954gR3YpxvP7m-Gs", name: "Jabal Coffee House", lat: 28.44425, lng: -81.4268183, primary_type: "coffee_shop", category: "food", rating: 4.8, reviews: 640, city: "Orlando", videoUrl: null },
  { id: "ChIJzybHW0dj54gRu_MY96JT_zk", name: "NeuroPlay", lat: 28.4581435, lng: -81.2990885, primary_type: "indoor_playground", category: "attractions", rating: 5, reviews: 41, city: "Orlando", videoUrl: null },
];
const rendered = await CreatorPage({ handle: FEATURED_CREATOR, mapPlaces: MAP_ROWS });
const html = renderToStaticMarkup(rendered);
const htmlNoMap = renderToStaticMarkup(await CreatorPage({ handle: FEATURED_CREATOR, mapPlaces: [] }));
ok(htmlNoMap.length > 2000, `negative control: with no map rows the page still renders in full (${htmlNoMap.length} bytes)`);
ok(!htmlNoMap.includes("wfcm-grid"), "…and renders NO map frame rather than an empty panel");
ok(!/on the map/.test(htmlNoMap), "…and makes no claim about pins it does not have");
ok(htmlNoMap.includes("Share this page"), "…while the share control survives a database that is down");
ok(html.length > 2000, `positive control: the page rendered real markup (${html.length} bytes) — every assertion below is vacuous on an empty string`);
ok(html.includes("ProfilePage"), "emits ProfilePage JSON-LD");
ok(html.includes("BreadcrumbList") && html.includes("ItemList"), "…plus breadcrumbs and the place ItemList");
ok(!/"@type"\s*:\s*"VideoObject"/.test(html), "does NOT emit VideoObject — still gated by lib/videoObjectGate.js");
ok(!/property="og:video"/.test(html), "…and no og:video either");
ok(html.includes("tiktok.com/@" + FEATURED_CREATOR), "links to the creator's own profile — the backlink that makes this worth their while");
ok(!/rel="[^"]*nofollow/.test(html), "no nofollow on a creator link: a followed link is the deal, not a favour");
ok(!claimsAffiliation(html), "the RENDERED page makes no affiliation claim");
ok(/not affiliated with Wayfind/i.test(html), "…and states the independence disclosure outright");
ok(html.includes(REMOVAL_CONTACT), "…and offers the removal route before anyone has to ask");
ok(html.includes("/creators\"") || html.includes("href=\"/creators\""), "links back to the index — no orphan page");

// ── v8.94: the creator's own map, and the share control ─────────────────────
//
// Both are rendered here rather than grepped in the source, because both are
// composed from other components and a source grep cannot tell a mounted
// <CreatorMapPanel/> from a mention of the name.
//
// THE MAP PANEL IS ASSERTED THROUGH ITS SIDEBAR, NOT ITS <MapView>. MapView is
// a next/dynamic({ssr:false}) child: it renders NOTHING on the server, in this
// guard and in production alike. What must exist in the server HTML is the
// frame around it — the heading, the honest "she filmed it herself" claim and
// the category rail — because that is the part a crawler and a JS-less reader
// actually receive.
ok(/s map<\/h2>/.test(html), "the creator map panel's heading does not render — the owner's interactive map is missing from the page");
ok(html.includes("wfcm-grid") && html.includes("wfcm-side") && html.includes("wfcm-map"),
  "…the map panel's layout is not in the server HTML");
ok(/filmed herself/.test(html),
  "the map does not say whose places these are — 'every pin is a place she filmed herself' is the claim that separates this from a nearby-search");
ok(/All places<\/span><b>\d+<\/b>/.test(html),
  "the category rail has no counted 'All places' row — the counts are the control");
ok(/Share this page/.test(html),
  "the share button is gone — a creator page nobody can share is an SEO asset with no distribution");
ok(html.includes("<span>All places</span><b>3</b>"),
  "the 'All places' count does not match the rows handed to the panel — the sidebar must count what the map draws");
ok(html.includes("<span>Coffee &amp; cafés</span><b>2</b>"),
  "the two coffee_shop rows are not grouped as cafés — the sidebar and the pins must resolve family the same way");
ok(/on the map, across Bradenton and Orlando/.test(html),
  "the map's one-line intro does not name the cities the rows are actually in");

// ── v8.94: the map never approximates ───────────────────────────────────────
//
// CALLED, not read. The rule these enforce is that a spot without real
// coordinates produces NO PIN — never a city-centre dot standing in for a café.
// A regex over lib/creatorPlaces.js would pass on a version that fell back to a
// default lat/lng, because the fallback would be new code the regex never saw.
{
  const { placeIdsFor, invRowToMapRow } = await import("../lib/creatorPlaces.js");
  ok(placeIdsFor([{ placeId: "ChIJIQGDwpgXw4gRxIJcGmjtyK4" }, { placeId: "ChIJIQGDwpgXw4gRxIJcGmjtyK4" }]).length === 1,
    "a placeId curated twice is queried once");
  ok(placeIdsFor([{ placeId: "not,a,place,id" }, { placeId: "'; drop --" }, {}, null]).length === 0,
    "anything that is not a Google place id is DROPPED before it reaches the query string, never escaped into it");
  ok(placeIdsFor([]).length === 0 && placeIdsFor(null).length === 0, "…and no spots is not a crash");
  const noCoords = invRowToMapRow({ place_id: "x", name: "Nowhere", lat: null, lng: null }, { name: "Nowhere" });
  ok(noCoords === null, "a row with no coordinates yields NO pin — the map must never invent a location");
  ok(invRowToMapRow({ place_id: "x", name: "Nowhere", lat: "abc", lng: 1 }, {}) === null, "…and a non-numeric coordinate is not coerced into one either");
  ok(invRowToMapRow(null, {}) === null, "a placeId wf_inventory has never seen is simply absent");
  const row = invRowToMapRow(
    { place_id: "pid", name: "Dolce and Bake Cafe/Bakery", lat: 28.44, lng: -81.42, primary_type: "cafeteria", category: "food", signals: { rating: 4.7, reviews: 88 } },
    { name: "Dolce", city: "Orlando", video: { url: "https://example.com/v" } },
  );
  ok(row && row.name === "Dolce", "the pin carries the name the creator used, not the directory's legal name");
  ok(row && row.primary_type === "cafeteria" && row.category === "food",
    "the classification is carried through untouched — the pin colour is inventory's own answer, not a second opinion");
  ok(row && row.rating === 4.7 && row.reviews === 88, "rating and review count ride along for the tapped-pin card");
  ok(row && row.videoUrl === "https://example.com/v", "…and so does her own video, which is the whole point of the page");
}
{
  // The map must never claim more pins than it drew. mapIntro() is the one
  // place that number is written, so it is CALLED rather than pattern-matched.
  const { mapIntro } = pagesMod;
  ok(typeof mapIntro === "function", "mapIntro is exported so its arithmetic can be checked");
  ok(mapIntro({ placeCount: 11 }, []) === "", "no rows -> no claim at all");
  const two = mapIntro({ placeCount: 11 }, [{ city: "Orlando" }, { city: "Bradenton" }]);
  ok(two.startsWith("2 of them are on the map"), `the count is the ROW count, not the curated count (got: ${two})`);
  ok(two.includes("9 more spots are listed below but not yet mapped"),
     `…and the gap between them is disclosed rather than hidden (got: ${two})`);
  ok(mapIntro({ placeCount: 3 }, [{ city: "Orlando" }, { city: "Orlando" }, { city: "Tampa" }]).includes("across Orlando and Tampa"),
     "cities are de-duplicated and read as prose");
  ok(!mapIntro({ placeCount: 2 }, [{ city: "Orlando" }, { city: "Tampa" }]).includes("more spot"),
     "no phantom gap when every curated spot is mapped");
}

// Every spot on the page has somewhere real to go.
for (const g of featured.cities) {
  for (const s of g.spots) {
    ok(!!(s.placeId || s.name), `${s.name}: has a resolvable destination`);
    ok(!!s.video && typeof s.video.url === "string" && s.video.url.length > 0,
       `${s.name}: carries a renderable video (a staged url:"" entry must never reach a page)`);
  }
}

const index = renderToStaticMarkup(CreatorsIndexPage());
for (const h of slugs) ok(index.includes(`/creators/${h}`), `the index links @${h}`);
ok(!claimsAffiliation(index), "the index makes no affiliation claim either");

// Metadata: a canonical, and a title that names the creator.
const meta = creatorMetadata(FEATURED_CREATOR);
ok(meta.alternates && typeof meta.alternates.canonical === "string" && meta.alternates.canonical.includes("/creators/"),
   "the page self-canonicals");
ok(meta.title.includes(FEATURED_CREATOR), "the title names the creator");
ok(creatorMetadata("someone-with-no-page").robots.index === false, "a handle with no page is noindex, never a soft-404 200");

if (fail.length) {
  console.log("test-creator-pages: FAIL");
  for (const f of fail) console.log("  - " + f);
  process.exit(1);
}
console.log(`test-creator-pages: OK — ${pass} assertions; ${slugs.length} pages, ${pagedCreators().length} creators, rendered`);
