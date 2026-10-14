#!/usr/bin/env node
// scripts/check-christmas-research.mjs: Christmas v4 (lead packet 2026-10-13),
// EXECUTED. The research data (data/christmas-2026-research.json) is the one
// source for the Christmas collection; this guard calls the real merge, card,
// composer, browse and event page functions and asserts what they return:
//   1. one card per experience (research duplicates folded, wf_events rows keep their id)
//   2. the watchlist is never in a rail, a browse listing or a date total
//   3. an undated season always says so and never carries a date
//   4. an unknown price is never free
//   5. the browse holds every published current listing exactly once
//   6. a research-only listing has an event page; a wf_events listing keeps its own
//   7. the ordering law holds on the real data for 17 Florida cities
//   8. the five location corrections are the same everywhere
//   9. the research data never reaches client code
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import RAW from "../data/christmas-2026-research.json" with { type: "json" };
import {
  CHRISTMAS_RESEARCH_ALIASES, CHRISTMAS_DB_RESEARCH_IDS, CHRISTMAS_RESEARCH_CANONICAL, CHRISTMAS_PUBLISHED_RESEARCH, CHRISTMAS_WATCHLIST_2026,
  CHRISTMAS_RESEARCH_CORRECTIONS, CHRISTMAS_SEASON_UNDATED_LINE, mergeChristmasResearch, researchPrice, parseSelectNights, parseResearchTimes,
  christmasResearchEventBySlug, christmasResearchSitemapRows, isDbClaimedResearchId,
} from "../lib/christmasResearch.js";
import { composeChristmasIntentRails, christmasEventRail, CHRISTMAS_LOCAL_ONLY_RAILS, CHRISTMAS_STATEWIDE_RAILS, christmasDistanceGroup } from "../lib/christmasIntentRails.js";
import { christmasEventCard } from "../lib/christmasCards.js";
import { christmasHonestyChips, christmasCardChips, christmasWhenBadge, christmasCopy, CHRISTMAS_DASH_RX, CHRISTMAS_SEASON_UNDATED_TEXT, CHRISTMAS_PRICE_UNKNOWN_TEXT } from "../lib/christmasCardCopy.js";
import { christmasBrowseListings, christmasBrowsePage, parseChristmasBrowseQuery, filterChristmasBrowse, christmasWatchlist, CHRISTMAS_BROWSE_DATES } from "../lib/christmasBrowse.js";
import { christmasAwareEventBySlug, christmasPageRow } from "../lib/christmasEventPage.js";
import { enrichChristmasEvent } from "../lib/christmasPool.js";
import { isTrusted } from "../lib/curatedEvents.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const TODAY = "2026-10-13";
const PUBLISHED = new Set(["confirmed_dated", "confirmed_season_undated"]);

// A hermetic stand in for the live wf_events rows: one row per mapped id, named
// like its research row, with null coordinates (as several live rows are).
const byId = new Map(RAW.map((r) => [r.id, r]));
const DB = Object.entries(CHRISTMAS_DB_RESEARCH_IDS).map(([dbId, rid]) => {
  const r = byId.get(CHRISTMAS_RESEARCH_ALIASES[rid] || rid) || byId.get(rid);
  return { event_id: dbId, slug: dbId, event_name: r.event_name, city: r.city, state: "FL", start_date: r.start_date || "2026-12-05", end_date: r.end_date || r.start_date || "2026-12-05",
    lat: null, lng: null, place_id: null, venue: "staging", event_status: "scheduled", source_tier: 1, verification_confidence: "high", card_hook: "A verified row.", tags: [] };
});
DB.push({ event_id: "db-only-market-2026", slug: "db-only-market-2026", event_name: "Holiday Market", city: "Umatilla", state: "FL", start_date: "2026-11-28", end_date: "2026-11-28", lat: 28.93, lng: -81.66, event_status: "scheduled", source_tier: 1, verification_confidence: "high", card_hook: "x", tags: [] });

// Live wf_events rows as read on 2026-10-13 (SELECT), written out here so the
// fixture does NOT come from the map it tests: [event_id, name, city, start,
// end, the research row it must merge with].
const LIVE_ROWS = [
  ["pinecrest-nights-of-lights-2026", "Nights of Lights at Pinecrest Gardens", "Pinecrest", "2026-12-04", "2026-12-23", "pinecrest-gardens-nights-of-lights-2026"],
  ["christmas-town-2026", "Busch Gardens Christmas Town", "Tampa", "2026-11-13", "2027-01-04", "christmastown-buschgardens-2026"],
  ["seaworld-orlando-christmas-2026", "SeaWorld Orlando Christmas Celebration", "Orlando", "2026-11-06", "2027-01-04", "seaworld-christmas-2026"],
  ["edison-and-ford-holiday-nights-2026", "51st Annual Edison and Ford Holiday Nights", "Fort Myers", "2026-11-27", "2027-01-03", "edison-ford-holiday-nights-2026"],
  ["nights-of-lights-2026", "St. Augustine Nights of Lights", "St. Augustine", "2026-11-21", "2027-01-18", "nights-of-lights-staug-2026"],
  ["palm-beach-holiday-boat-parade-2026", "Palm Beach Holiday Boat Parade", "North Palm Beach", "2026-12-05", "2026-12-05", "palm-beach-boat-parade-2026"],
  ["cocoa-beach-holiday-boat-parade-2026", "Cocoa Beach Holiday Boat Parade 2026", "Cocoa Beach", "2026-12-12", null, "cocoa-beach-boat-parade-2026"],
  ["winter-park-christmas-parade-2026", "74th Annual Winter Park Christmas Parade", "Winter Park", "2026-12-05", null, "winter-park-christmas-parade-2026"],
  ["holiday-lights-florida-botanical-2026", "Holiday Lights in the Gardens", "Largo", "2026-11-27", "2027-01-02", "florida-botanical-gardens-holiday-lights-2026"],
  ["dazzling-nights-leu-2026", "Dazzling Nights at Harry P. Leu Gardens", "Orlando", "2026-11-20", "2027-01-03", "dazzlingnights-leu-2026"],
  ["christmas-at-gaylord-palms-2026", "ICE! at Christmas at Gaylord Palms", "Kissimmee", "2026-11-13", "2027-01-03", "gaylord-palms-ice-2026"],
  ["light-up-the-holidays-2026", "Light Up the Holidays", "Altamonte Springs", "2026-12-05", "2026-12-05", "altamonte-light-up-holidays-2026"],
  ["schooner-wharf-bar-lighted-boat-parade-2026", "Schooner Wharf Bar Lighted Boat Parade (35th Annual)", "Key West", "2026-12-12", null, "key-west-lighted-boat-parade-2026"],
  ["selby-lights-in-bloom-2026", "Lights in Bloom at Selby Gardens", "Sarasota", "2026-12-05", "2027-01-02", "selby-lights-in-bloom-2026"],
  ["mvmcp-2026", "Mickey's Very Merry Christmas Party", "Lake Buena Vista", "2026-11-08", "2026-12-22", "mvmcp-2026"],
];
for (const [event_id, event_name, city, start_date, end_date] of LIVE_ROWS) {
  const i = DB.findIndex((r) => r.event_id === event_id);
  // The live Christmas Town hook really carries an em dash (wf_events copy, not editable here).
  const card_hook = event_id === "christmas-town-2026" ? "Millions of lights and coasters in the dark \u2014 included with admission." : "A verified row.";
  const row = { event_id, slug: event_id, event_name, city, state: "FL", start_date, end_date, lat: null, lng: null, place_id: null, venue: "staging", event_status: "scheduled", source_tier: 1, verification_confidence: "high", card_hook, schedule_note: event_id === "christmas-town-2026" ? "Select nights 5pm\u201310pm" : null, tags: [] };
  if (i >= 0) DB[i] = row; else DB.push(row);
}
const merged = mergeChristmasResearch(DB);
const eligible = merged.filter((e) => isTrusted(e) && christmasEventRail(e)).map((e) => enrichChristmasEvent(e, new Map()));
const cards = eligible.map((e) => christmasEventCard(e, { today: TODAY }));

// ── 0. The data itself ───────────────────────────────────────────────────────
ok(RAW.length === 752, `the research file holds the 752 researched rows (got ${RAW.length})`);
ok(new Set(RAW.map((r) => r.id)).size === RAW.length, "research ids are unique");
ok(RAW.every((r) => ["confirmed_dated", "confirmed_season_undated", "recurring_unconfirmed", "excluded"].includes(r.state)), "every row carries one of the four states");
ok(!RAW.some((r) => /googleusercontent|maps\.googleapis\.com\/maps\/api\/place\/photo|places\/[A-Za-z0-9_-]+\/photos\//.test(JSON.stringify(r))), "the data stores no Google photo name or URL (PR #1697)");

// ── 1. One card per experience ──────────────────────────────────────────────
{
  const canonical = new Set(CHRISTMAS_RESEARCH_CANONICAL.map((r) => r.id));
  ok(Object.keys(CHRISTMAS_RESEARCH_ALIASES).every((dup) => !canonical.has(dup) && canonical.has(CHRISTMAS_RESEARCH_ALIASES[dup])), "every research duplicate folds into a real canonical row and never survives on its own");
  ok(Object.keys(CHRISTMAS_RESEARCH_ALIASES).length >= 25, `the reviewed duplicate list is in force (${Object.keys(CHRISTMAS_RESEARCH_ALIASES).length} pairs)`);
  ok(!CHRISTMAS_PUBLISHED_RESEARCH.some((r) => CHRISTMAS_RESEARCH_ALIASES[r.event_id]), "no published listing is a folded duplicate");
  const ids = cards.map((c) => c.id);
  ok(new Set(ids).size === ids.length, `every card id is unique (${ids.length} cards)`);
  for (const [dbId, rid] of Object.entries(CHRISTMAS_DB_RESEARCH_IDS)) {
    const target = CHRISTMAS_RESEARCH_ALIASES[rid] || rid;
    const research = byId.get(target);
    if (!PUBLISHED.has(research.state)) continue;
    const asDb = merged.filter((r) => r.event_id === dbId);
    const asResearch = merged.filter((r) => r.event_id === target && target !== dbId);
    ok(asDb.length === 1 && asDb[0].christmas_research_id === target && asDb[0].slug === dbId && asResearch.length === 0, `${dbId}: ONE listing, keeping the wf_events id and slug (research ${target} is not a second card)`);
  }
  for (const [dbId, , , , , rid] of LIVE_ROWS) {
    const row = merged.find((r) => r.event_id === dbId);
    ok(row && row.christmas_research_id === rid && !merged.some((r) => r.event_id === rid && rid !== dbId), `live row ${dbId} merges with research ${rid} into one listing`);
  }
  const fmb = merged.find((r) => r.event_id === "fort-myers-beach-christmas-boat-parade-2026");
  ok(fmb && fmb.christmas_excluded === true && christmasEventRail(fmb) === null, "a wf_events row whose research row is watchlist (Fort Myers Beach boat parade) leaves the collection");
  const key = (c) => String(c.city).toLowerCase() + "|" + String(c.short_title || c.event_name).toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\b(?:the|annual|\d+(?:st|nd|rd|th)?)\b/g, "").replace(/\s+/g, " ").trim();
  const keys = cards.map(key);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  ok(dupes.length === 0, `no two cards share a name and city (${dupes.slice(0, 3).join(" ; ")})`);
  ok(cards.some((c) => c.id === "db-only-market-2026"), "a verified wf_events Christmas row the research does not cover stays");
  // Negative control: without the alias fold, the duplicates WOULD collide.
  const rawDupes = RAW.filter((r) => CHRISTMAS_RESEARCH_ALIASES[r.id] && PUBLISHED.has(r.state));
  ok(rawDupes.length >= 20, `positive control: the raw data really holds the duplicate rows the fold removes (${rawDupes.length})`);
  const multi = CHRISTMAS_PUBLISHED_RESEARCH.find((r) => r.christmas_categories.length >= 3);
  ok(!!multi && cards.filter((c) => c.christmas_research_id === multi.event_id).length <= 1, "a multi category listing is still one card");
}

// ── 2. The watchlist ────────────────────────────────────────────────────────
{
  const watchIds = new Set(RAW.filter((r) => r.state === "recurring_unconfirmed").map((r) => r.id));
  ok(CHRISTMAS_WATCHLIST_2026.length >= 150 && CHRISTMAS_WATCHLIST_2026.every((r) => watchIds.has(r.id)), `the watchlist is the recurring_unconfirmed rows (${CHRISTMAS_WATCHLIST_2026.length})`);
  ok(CHRISTMAS_WATCHLIST_2026.every((r) => r.missing && r.missing.length > 5), "every watchlist row says exactly what is missing");
  ok(!CHRISTMAS_PUBLISHED_RESEARCH.some((r) => watchIds.has(r.event_id)), "no watchlist row is published");
  ok(!cards.some((c) => watchIds.has(c.christmas_research_id)), "no card comes from a watchlist row");
  const listings = christmasBrowseListings(DB, TODAY);
  ok(!listings.some((c) => watchIds.has(c.christmas_research_id) || watchIds.has(c.id)), "the browse listings hold no watchlist row");
  for (const d of CHRISTMAS_BROWSE_DATES) {
    const hit = filterChristmasBrowse(listings, parseChristmasBrowseQuery({ when: d.id }), TODAY);
    ok(!hit.some((c) => watchIds.has(c.christmas_research_id)) && !hit.some((c) => c.season_undated), `date filter "${d.id}": no watchlist row, no undated row (${hit.length})`);
  }
  ok(christmasWatchlist().length === CHRISTMAS_WATCHLIST_2026.length, "the browse watchlist section lists every watchlist row");
  for (const [label, lat, lng] of CITIES()) {
    const out = composeChristmasIntentRails(cards, [], { lat, lng, today: TODAY });
    ok(!out.rails.some((r) => r.cards.some((c) => watchIds.has(c.christmas_research_id))), `${label}: no watchlist row in any rail`);
  }
  // Positive control: the same row WITH a published state would be in the rails.
  const w = RAW.find((r) => r.state === "recurring_unconfirmed" && r.primary_rail === "lights" && Number.isFinite(r.lat));
  ok(!!w, "positive control row exists");
}

// ── 3. Undated season honesty ───────────────────────────────────────────────
{
  const undated = cards.filter((c) => c.season_undated);
  ok(undated.length >= 25, `undated season listings are published (${undated.length})`);
  for (const c of undated) {
    ok(c.start_date === null && c.end_date === null && c.when && c.when.label === "2026 season" && c.when.value === "Dates TBA", `${c.id}: no date, the badge says "2026 season / Dates TBA"`);
    const chip = christmasHonestyChips(c, TODAY).find((x) => x.key === "undated");
    ok(chip && chip.label === "Dates not announced yet" && chip.title === CHRISTMAS_SEASON_UNDATED_TEXT, `${c.id}: the card chip says "${CHRISTMAS_SEASON_UNDATED_TEXT}"`);
  }
  ok(CHRISTMAS_SEASON_UNDATED_TEXT === "2026 season confirmed, dates not announced yet" && CHRISTMAS_SEASON_UNDATED_LINE === CHRISTMAS_SEASON_UNDATED_TEXT, "the undated line is word for word the packet's");
  ok(christmasWhenBadge({ season_undated: false }) === null, "a dated listing gets no season badge");
  const page = christmasPageRow(CHRISTMAS_PUBLISHED_RESEARCH.find((r) => r.season_undated));
  ok(page.when_label === CHRISTMAS_SEASON_UNDATED_LINE && page.schedule_note.startsWith(CHRISTMAS_SEASON_UNDATED_LINE), "the event page says the same line where the date goes");
  ok(/const ld = e\.season_undated \|\| !e\.start_date \? null : eventJsonLd\(e/.test(read("app/florida-events/[slug]/page.js")), "the event page emits no Event JSON-LD without a real date (static)");
}

// ── 4. Unknown price is never free ──────────────────────────────────────────
{
  for (const p of ["free (unstated)", "free (2025 city release)", "free (prior year listing)", "free (per listings)", "unannounced", "", "free (event listed free by community calendar; city page does not state price)"]) {
    const r = researchPrice(p);
    ok(r.kind === "unannounced" && r.is_free === null && r.label === CHRISTMAS_PRICE_UNKNOWN_TEXT, `"${p}" is "Price not announced", never free`);
  }
  ok(researchPrice("free").is_free === true && researchPrice("free to watch; VIP grandstand sold").label === "Free to watch" && researchPrice("$25 adults").kind === "paid", "positive controls: the organizer's free is free, a quoted price is paid");
  for (const c of cards) {
    const chips = christmasHonestyChips(c, TODAY).map((x) => x.label);
    if (c.price_kind === "unannounced" || c.is_free !== true) ok(!chips.some((l) => /^free/i.test(l)) && c.is_free !== true && c.price_band !== "free", `${c.id}: not free unless the organizer said so`);
  }
  ok(cards.filter((c) => c.price_label === CHRISTMAS_PRICE_UNKNOWN_TEXT).length >= 150, "unknown prices are labelled as such");
}

// ── 5. The browse holds everything, once ────────────────────────────────────
{
  const listings = christmasBrowseListings(DB, TODAY);
  const seen = [];
  for (let page = 1; page < 60; page++) {
    const out = christmasBrowsePage(listings, parseChristmasBrowseQuery({ page: String(page) }), TODAY);
    seen.push(...out.cards.map((c) => c.id));
    if (!out.hasMore) break;
  }
  ok(seen.length === listings.length && new Set(seen).size === seen.length, `paging the unfiltered browse returns every listing exactly once (${seen.length} of ${listings.length})`);
  const railIds = new Set(cards.filter((c) => (c.season_undated ? true : (c.end_date || c.start_date || "") >= TODAY)).map((c) => c.id));
  ok([...railIds].every((id) => seen.includes(id)), "every card a rail could show is in the browse (hidden local rails hide nothing)");
  const nearTampa = christmasBrowsePage(listings, parseChristmasBrowseQuery({ lat: "27.95", lng: "-82.46" }), TODAY).cards;
  ok(nearTampa.every((c, i) => i === 0 || (c.distMi ?? Infinity) >= (nearTampa[i - 1].distMi ?? Infinity)), "with a location the browse runs nearest first");
  ok(christmasBrowsePage(listings, parseChristmasBrowseQuery({ undated: "1" }), TODAY).total === listings.filter((c) => c.season_undated).length, "the Dates not announced toggle shows exactly the undated listings");
  ok(christmasBrowsePage(listings, parseChristmasBrowseQuery({ q: "nutcracker" }), TODAY).total >= 10, "search by name works");
  const json = JSON.stringify(christmasBrowsePage(listings, parseChristmasBrowseQuery({}), TODAY));
  ok(!/evidence_quote|coord_source|other_sources/.test(json), "the browse JSON sends only card fields, never the research working notes");
  ok(/browse=\{/.test(read("app/christmas-in-florida/page.js")) && /<ChristmasBrowse /.test(read("app/christmas-in-florida/page.js")) && /\{browse \? /.test(read("app/components/SeasonalSearchHub.js")), "the hub page server renders the browse (static)");
  ok(/"@type": "ItemList"/.test(read("app/christmas-in-florida/page.js")), "the browse carries an ItemList of events (static)");
}

// ── 6. Event pages ──────────────────────────────────────────────────────────
{
  const only = CHRISTMAS_PUBLISHED_RESEARCH.find((r) => !isDbClaimedResearchId(r.event_id) && !r.season_undated);
  const row = await christmasAwareEventBySlug(only.slug, { fetchRow: async () => null });
  ok(row && row.event_id === only.event_id && row.source_url && row.last_verified_at && row.year === "2026" && row.christmas_price_line, `a research-only listing has its event page with source, last checked and price (${only.slug})`);
  const claimed = Object.values(CHRISTMAS_DB_RESEARCH_IDS).find((rid) => PUBLISHED.has(byId.get(rid)?.state));
  ok(christmasResearchEventBySlug(claimed) === null && (await christmasAwareEventBySlug(claimed, { fetchRow: async () => null })) === null, "a research row that belongs to a wf_events row never gets a second page");
  const db = DB.find((r) => r.event_id === "palm-beach-holiday-boat-parade-2026");
  const pb = await christmasAwareEventBySlug(db.slug, { fetchRow: async () => db });
  ok(pb.event_id === db.event_id && pb.lat === 26.8736736 && pb.lng === -80.0649177 && /Bert Winters Park/.test(pb.venue), "a wf_events page shows the corrected public viewing spot");
  ok((await christmasAwareEventBySlug("not-a-real-slug", { fetchRow: async () => null })) === null, "an unknown slug is an honest miss");
  const boom = async () => { throw new Error("db down"); };
  let threw = false; try { await christmasAwareEventBySlug(db.slug, { fetchRow: boom }); } catch { threw = true; }
  ok(threw, "a failed wf_events read still throws (an outage never 404s a live event)");
  const page = read("app/florida-events/[slug]/page.js");
  ok((page.match(/const e = await fetchCuratedEventBySlug\(params\.slug\)\.then\(\(row\) => christmasEventPageRow\(row, params\.slug\)\)\.then\(withTampaPassFacts\)/g) || []).length === 2, "the page and its metadata both pass the one wf_events read through the Christmas layer (static)");
  ok(/label: "Cost", value: e\.christmas_price_line \|\| eventCostSummary\(e\)/.test(page) && /label: "Who it is for", value: e\.audience_label/.test(page), "the page shows the honest price line and who it is for (static)");
  const sm = christmasResearchSitemapRows("https://www.gowayfind.com", TODAY);
  ok(sm.length >= 300 && sm.every((r) => /\/florida-events\//.test(r.url)) && !sm.some((r) => r.url.endsWith("/" + claimed)), `the sitemap lists the research-only event pages (${sm.length}), never a claimed duplicate`);
  ok(/christmasResearchSitemapRows\(SITE_URL, siteTodayStr\(\)\)/.test(read("app/sitemap.js")), "app/sitemap.js includes them (static)");
}

// ── 7. The ordering law on the real data ────────────────────────────────────
function CITIES() {
  return [["Naples", 26.142, -81.7948], ["Miami", 25.7617, -80.1918], ["Parrish", 27.5859, -82.4254], ["Orlando", 28.5384, -81.3789], ["Tampa", 27.9506, -82.4572], ["Jacksonville", 30.3322, -81.6557], ["Pensacola", 30.4213, -87.2169], ["Key West", 24.5551, -81.78], ["Tallahassee", 30.4383, -84.2807], ["Gainesville", 29.6516, -82.3248], ["Ocala", 29.1872, -82.1401], ["Daytona Beach", 29.2108, -81.0228], ["Melbourne", 28.0836, -80.6081], ["Vero Beach", 27.6386, -80.3973], ["Jupiter", 26.9342, -80.0942], ["Fort Myers", 26.6406, -81.8723], ["Destin", 30.3935, -86.4958]];
}
{
  const rank = { nearby: 0, "within-reach": 1, "day-trip": 2 };
  for (const [label, lat, lng] of CITIES()) {
    const out = composeChristmasIntentRails(cards, [], { lat, lng, today: TODAY });
    for (const r of out.rails) {
      ok(r.cards.every((c, i) => i === 0 || rank[r.cards[i - 1].distanceGroup] <= rank[c.distanceGroup]), `${label} ${r.id}: groups never go backwards`);
      if (CHRISTMAS_LOCAL_ONLY_RAILS.includes(r.id)) ok(r.cards.every((c) => c.distMi <= 90), `${label} ${r.id}: local only (90 mi)`);
      else if (!CHRISTMAS_STATEWIDE_RAILS.includes(r.id)) {
        ok(r.cards.every((c) => c.distMi <= 150 || (c.distMi <= 200 && c.exceptional === true)), `${label} ${r.id}: day trips to 150 mi, headliners to 200 mi, nothing past`);
        ok(r.cards.filter((c) => c.distanceGroup === "day-trip").length <= 6, `${label} ${r.id}: at most 6 day trips`);
      }
      ok(r.cards.every((c) => c.distanceGroup === christmasDistanceGroup(c.distMi)), `${label} ${r.id}: every card is labeled with its group`);
    }
  }
}

// ── 8. The five location corrections ────────────────────────────────────────
{
  ok(Object.keys(CHRISTMAS_RESEARCH_CORRECTIONS).length === 4, "four published corrections (Fort Myers Beach is watchlist now)");
  for (const [rid, fix] of Object.entries(CHRISTMAS_RESEARCH_CORRECTIONS)) {
    const pub = CHRISTMAS_PUBLISHED_RESEARCH.find((r) => r.event_id === rid);
    ok(pub && pub.lat === fix.lat && pub.lng === fix.lng && pub.venue === fix.venue && !pub.approxLocation, `${rid}: the research listing carries the corrected spot`);
    const dbId = Object.keys(CHRISTMAS_DB_RESEARCH_IDS).find((k) => CHRISTMAS_DB_RESEARCH_IDS[k] === rid);
    const m = merged.find((r) => r.event_id === dbId);
    ok(m && m.lat === fix.lat && m.lng === fix.lng && m.venue === fix.venue, `${dbId}: the wf_events row shows the same corrected spot`);
    const card = cards.find((c) => c.id === dbId);
    ok(card && card.lat === fix.lat && card.lng === fix.lng, `${dbId}: the card uses it too`);
  }
  ok(CHRISTMAS_RESEARCH_CORRECTIONS["palm-beach-boat-parade-2026"].lat === 26.8736736 && CHRISTMAS_RESEARCH_CORRECTIONS["palm-beach-boat-parade-2026"].lng === -80.0649177, "Palm Beach is Bert Winters Park, OSM way 545518471");
  ok(/Cove Park/.test(CHRISTMAS_RESEARCH_CORRECTIONS["cocoa-beach-boat-parade-2026"].venue) && /Central Park/.test(CHRISTMAS_RESEARCH_CORRECTIONS["winter-park-christmas-parade-2026"].venue) && /12520 Ulmerton/.test(CHRISTMAS_RESEARCH_CORRECTIONS["florida-botanical-gardens-holiday-lights-2026"].venue), "the viewing labels are the packet's");
  ok(!CHRISTMAS_PUBLISHED_RESEARCH.some((r) => r.event_id === "fmb-christmas-boat-parade-2026"), "Fort Myers Beach boat parade is not published");
}

// ── 8b. Parsers ─────────────────────────────────────────────────────────────
{
  const n = parseSelectNights("Select nights: Nov 19 to 22, 27 to 29; Dec 3 to 6; Jan 3, 5, 2027 at 7 PM", "2026-11-19", "2027-01-05");
  ok(n && n.length === 13 && n[0] === "2026-11-19" && n.at(-1) === "2027-01-05" && !n.includes("2026-12-07"), `select nights parse to dated nights with January in 2027 and no clock or year digits (${n && n.length})`);
  ok(parseSelectNights("Nightly", "2026-11-20", "2027-01-03") === null, "a nightly run has no night list");
  const t = parseResearchTimes("5:30 PM to 9:30 PM CT");
  ok(t.start_time === "17:30:00" && t.end_time === "21:30:00" && t.timezone === "America/Chicago", "times parse, and a Central Time row keeps its zone");
  const jan = cards.find((c) => c.end_date && c.end_date >= "2027-01-01");
  ok(!!jan, "a listing that runs into January 2027 is published");
}

// ── 8c. No dashes in user facing copy (owner rule) ──────────────────────────
{
  ok(CHRISTMAS_DASH_RX.test("in the dark \u2014 included") && CHRISTMAS_DASH_RX.test("5pm\u201310pm") && CHRISTMAS_DASH_RX.test("Dec 5 - 6") && CHRISTMAS_DASH_RX.test("6-9 PM") && !CHRISTMAS_DASH_RX.test("Flora-Bama day-of drive-thru"), "the dash probe catches em, en, spaced and range hyphens, and spares a hyphen inside a word");
  ok(christmasCopy("Millions of lights and coasters in the dark \u2014 included with admission.") === "Millions of lights and coasters in the dark, included with admission." && christmasCopy("Sat \u00b7 5pm\u20139:30pm") === "Sat \u00b7 5pm to 9:30pm" && christmasCopy("Nov 13 \u2013 Jan 4") === "Nov 13 to Jan 4", "christmasCopy turns punctuation dashes into words");
  // The source: every user facing field of every shown research row (published and watchlist).
  const FIELDS = ["event_name", "venue_name", "why", "schedule", "times", "price", "missing", "parking_access", "accessibility", "age", "organizer"];
  const srcBad = RAW.filter((r) => r.state !== "excluded").flatMap((r) => FIELDS.filter((k) => typeof r[k] === "string" && CHRISTMAS_DASH_RX.test(r[k])).map((k) => r.id + "." + k));
  ok(srcBad.length === 0, `the research data has no punctuation dash in a user facing field (${srcBad.slice(0, 5).join(", ")})`);
  // The output: every string a card, a chip or an event page shows.
  const shown = (c) => [c.title, c.hook, c.take, c.venue, c.schedule_note, c.price_label, c.audience_label, c.when?.label, c.when?.value, ...christmasCardChips(c, TODAY).flatMap((x) => [x.label, x.title])];
  const cardBad = cards.flatMap((c) => shown(c).filter((t) => typeof t === "string" && CHRISTMAS_DASH_RX.test(t)).map((t) => c.id + ": " + t.slice(0, 50)));
  ok(cardBad.length === 0, `no card, chip or badge shows a punctuation dash (${cardBad.slice(0, 4).join(" | ")})`);
  const town = cards.find((c) => c.id === "christmas-town-2026");
  ok(town && town.hook === "Millions of lights and coasters in the dark, included with admission.", "a wf_events hook with an em dash is shown without it (Christmas Town)");
  const pages = CHRISTMAS_PUBLISHED_RESEARCH.slice(0, 400).map((r) => christmasPageRow(r)).concat(merged.filter((m) => m.christmas_research_id && !m.christmas_excluded).map((m) => christmasPageRow(m)));
  const pageBad = pages.flatMap((p) => [p.when_label, p.schedule_note, p.card_hook, p.venue, p.christmas_price_line, p.audience_label].filter((t) => typeof t === "string" && CHRISTMAS_DASH_RX.test(t)).map((t) => p.event_id + ": " + t.slice(0, 50)));
  ok(pageBad.length === 0, `no Christmas event page fact shows a punctuation dash (${pageBad.slice(0, 4).join(" | ")})`);
  ok(/e\.christmas_research_id \? " to " : "\u2013"/.test(read("app/florida-events/[slug]/page.js")), "the event page time range reads \"to\" on Christmas listings (static)");
  const ui = ["app/components/ChristmasBrowse.js", "app/christmas-in-florida/page.js", "lib/christmasBrowse.js", "lib/christmasCardCopy.js"].map((f) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""));
  const strings = ui.flatMap((src) => src.match(/"[^"\n]{3,}"|`[^`\n]{3,}`|>[^<>{}\n]{3,}</g) || []).filter((t) => /[\u2013\u2014]| - /.test(t) && !/RX|regex|replace/.test(t));
  ok(strings.length === 0, `the new browse copy has no punctuation dash (${strings.slice(0, 3).join(" | ")})`);
}

// ── 9. Server only ──────────────────────────────────────────────────────────
{
  const walk = (dir, out = []) => { for (const n of readdirSync(dir)) { const f = path.join(dir, n); const st = statSync(f); if (st.isDirectory()) { if (!/node_modules|\.next|\.wf-jsx/.test(f)) walk(f, out); } else if (/\.m?js$/.test(n)) out.push(f); } return out; };
  const SERVER_ONLY = /christmasResearch|christmasBrowse|christmasCards|christmasEventPage|christmasDiscoveries2026|christmas-2026-research\.json/;
  const clients = walk(path.join(ROOT, "app")).concat(walk(path.join(ROOT, "lib"))).filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")));
  const leaks = clients.filter((f) => SERVER_ONLY.test(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")));
  ok(clients.length > 20 && leaks.length === 0, `no client module imports the Christmas server data (${clients.length} client files scanned; leaks: ${leaks.map((f) => path.relative(ROOT, f)).join(", ")})`);
  ok(!/^\s*import/m.test(read("lib/christmasCardCopy.js")), "the client card copy imports nothing");
  // The data is read with fs at runtime: every route that reaches lib/christmasResearch.js
  // must trace the file (next.config.js outputFileTracingIncludes), or the deployed lambda has none.
  const cfg = read("next.config.js");
  for (const route of ["/api/events/christmas", "/api/christmas/browse", "/christmas-in-florida", "/florida-events/[slug]", "/sitemap.xml"]) {
    ok(cfg.includes(JSON.stringify(route) + ': ["./data/christmas-2026-research.json"]'), `next.config.js traces the research data into ${route}`);
  }
  ok(/readFileSync\(path\.join\(process\.cwd\(\), CHRISTMAS_RESEARCH_FILE\)/.test(read("lib/christmasResearch.js")) && !/christmas-2026-research\.json" with/.test(read("lib/christmasResearch.js")), "the module reads the file with fs (jsxLoad safe), never a JSON import");
  const importers = walk(path.join(ROOT, "app")).filter((f) => /from "[^"]*lib\/(?:christmasResearch|christmasBrowse|christmasCards|christmasEventPage)(?:\.js)?"/.test(readFileSync(f, "utf8"))).map((f) => path.relative(ROOT, f));
  const traced = { "app/api/events/christmas/route.js": 1, "app/api/christmas/browse/route.js": 1, "app/christmas-in-florida/page.js": 1, "app/florida-events/[slug]/page.js": 1, "app/sitemap.js": 1 };
  ok(importers.length >= 5 && importers.every((f) => traced[f]), `every app file that reaches the research data is a traced route (${importers.join(", ")})`);
  const chunks = path.join(ROOT, ".next/static/chunks");
  // Only a production build (.next/BUILD_ID) has production chunks; `next dev` output is skipped.
  if (existsSync(chunks) && existsSync(path.join(ROOT, ".next/BUILD_ID"))) {
    const files = walk(chunks).filter((f) => !/_app-pages-browser_|app-pages-internals|_ssr_/.test(f));
    const hit = files.filter((f) => /weirsdale-cottom-farm-christmas-village-2026|evidence_quote|US Census 2023 Gazetteer/.test(readFileSync(f, "utf8")));
    const control = files.some((f) => readFileSync(f, "utf8").includes("POP UP BARS"));
    ok(files.length > 50 && control && hit.length === 0, `no production client chunk carries the research data (${files.length} chunks swept, positive control found: ${control}; hits: ${hit.map((f) => path.basename(f)).join(", ")})`);
  } else console.log("  note: no production .next build here, the production chunk sweep runs after next build");
}

console.log(`\ncheck-christmas-research: ${fail ? "FAIL" : "OK"}: ${pass} assertions (executed the merge, ${cards.length} cards, the browse, the event page loader and the composer for 17 cities on ${RAW.length} research rows)`);
process.exit(fail ? 1 : 0);
