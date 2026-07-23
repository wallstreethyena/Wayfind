// scripts/test-todays-best.mjs — lock test for the Today's Best accordion
// (lib/todaysBest.js + app/components/TodaysBest.js). Owner direction
// 2026-07-21: best-of-the-best per category via wf_best_picks; wf_trends is
// a SEAM ONLY (that RPC does not exist yet — nothing may pretend it does).
import { readFileSync } from "fs";
import { TB_SECTIONS, isRenderablePick, dedupeBrands, tbPhotoUrl } from "../lib/todaysBest.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };

// sections: engine-served categories only — 'family' returns zero rows from
// wf_best_picks (verified live 2026-07-21) and must not get a row
ok(TB_SECTIONS.length === 6, "six sections");
ok(!TB_SECTIONS.some((s) => s.id === "family"), "no always-empty family section");
ok(TB_SECTIONS[0].id === "food", "food leads");

const good = { name: "Coquina Beach", lat: 27.4, lng: -82.6, distance_mi: 4, place_id: "x" };
ok(isRenderablePick(good) && !isRenderablePick({ ...good, lat: NaN }) && !isRenderablePick(null), "renderability guard");
const dd = dedupeBrands([
  { ...good, name: "Detwiler's Farm Market" },
  { ...good, name: "Detwiler's Farm Market — Palmetto" },
  { ...good, name: "detwilers farm market" },
  { ...good, name: "Coquina Beach" },
]);
ok(dd.length === 2 && dd[1].name === "Coquina Beach", "same-brand branches collapse to the best-ranked one");

ok(tbPhotoUrl("places/ChIJa/photos/AWx1") === "/api/photo?ref=" + encodeURIComponent("places/ChIJa/photos/AWx1") + "&w=240", "valid ref -> proxied URL");
ok(tbPhotoUrl("https://evil.example/x.jpg") === null && tbPhotoUrl("") === null, "non-resource refs refused");

// source contract
const lib = readFileSync(new URL("../lib/todaysBest.js", import.meta.url), "utf8");
ok(lib.includes('supabase.rpc("wf_best_picks"'), "sections call the real engine");
ok(lib.includes("p_category: category"), "engine filters by category server-side");
ok(lib.includes("p_boost_ids: boostIds") && lib.includes("boostIds = null"), "wf_trends is a null seam, not a fake signal");
ok(!/wf_trends\s*\(/.test(lib), "no call to the nonexistent wf_trends RPC");

const ui = readFileSync(new URL("../app/components/TodaysBest.js", import.meta.url), "utf8");
ok(ui.includes("PlaceScoreChip"), "accordion rows show the Wayfind Score, not the raw Google star");
ok(!/rating\.toFixed/.test(ui) && !/reviews\.toLocaleString/.test(ui), "no google-star composition");
ok(ui.includes('aria-expanded'), "accordion rows are real disclosure buttons");
ok(ui.includes("Nothing strong in this category right now"), "empty sections say so honestly");
ok(ui.includes('data === "loading"') && ui.includes("wf-sk"), "reserved-geometry loading rows");

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
// Owner call (2026-07-21, later): the accordion is RETIRED from the page —
// "Best places to eat nearby" sits under the events card instead. The
// component, lib, and engines stay in the repo for when it returns.
ok(!/<TodaysBest /.test(home), "the accordion is unmounted (owner call)");
ok(/<BestNearby center=\{center\} weather=\{weather\}/.test(home), "the combined BestNearby card is mounted with live center + weather (v6.46)");

// v6.46: the combined card's own contract
const bn = readFileSync(new URL("../app/components/BestNearby.js", import.meta.url), "utf8");
ok(bn.includes("Best places to eat nearby") && bn.includes("Top things to do"), "both menus live in the ONE card");
ok(bn.includes('category: "food"') && bn.includes("fetchTodaysBest") && bn.includes("fetchThingsToDo"), "eat rides wf_best_picks(food); things-to-do rides wf_things_to_do — the day's engines, no client re-ranking");
ok(bn.includes('CARD_BG = "#0B0E15"'), "card is the owner's almost-black, one step lighter than the page");
ok(/r\.selling_out \? <SellingFast \/> : null/.test(bn), "Selling-fast badge renders ONLY on the engine's flag (Viator's own signal)");
ok(bn.includes("affiliate links; Wayfind may earn a commission"), "affiliate disclosure renders with the tours");
ok(bn.includes("PlaceScoreChip"), "numbers are the Wayfind Score chip");
ok(!/rating\.toFixed/.test(bn) && !/reviews\.toLocaleString/.test(bn), "no google-star composition");
ok(bn.includes('data === "loading"') && bn.includes("wf-sk"), "reserved-geometry loading rows");
ok(bn.includes("Nothing strong here right now"), "honest empty state");
const lib2 = readFileSync(new URL("../lib/todaysBest.js", import.meta.url), "utf8");
ok(lib2.includes('supabase.rpc("wf_things_to_do"'), "lib calls the real merge engine");
// Owner: menus read best-to-worst by the VISIBLE Wayfind Score
import("../lib/todaysBest.js").then((m2) => {
  const rows = [{ name: "A", rating: 4.6, reviews: 5000 }, { name: "B", rating: 4.9, reviews: 12 }, { name: "C", rating: 4.8, reviews: 2000 }];
  const o = m2.byVisibleScore(rows).map((r) => r.name).join("");
  if (o !== "CAB") { console.error("FAIL: byVisibleScore orders by review-weighted score (got " + o + ")"); process.exit(1); }
});
ok(lib2.includes("byVisibleScore(dedupeBrands(data))") && lib2.includes("byVisibleScore((Array.isArray(data)"), "both menus sort by the visible Score, best to worst");
ok(/kind === "experience"\) return !!r\.booking_url/.test(lib2), "a tour without a booking link never renders");

// ── v6.47 (owner batch 3) ────────────────────────────────────────────────────
// medals: top-3 trophies, champagne/silver/bronze — never past rank 3
ok(/MEDAL = \[CHAMPAGNE\.base, "#C7CCD6", "#B8804A"\]/.test(bn), "top-3 medals are the premium champagne/silver/bronze set");
ok(/if \(i > 2\) return/.test(bn), "medals stop at rank 3");
// rows open OUR detail sheet, never a Google tab
ok(bn.includes("onOpenPlace") && /onOpenPlace\(p\)/.test(bn), "rows hand the place to the app's own detail opener");
ok(/onOpenPlace=\{\(p\) => openDetail\(p, "bestnearby"\)\}/.test(home), "home wires BestNearby rows to openDetail (our card, not Google)");
// Local trends: real sources only
ok(bn.includes("SHOW_TRENDS = false") && bn.includes("Local trends"), "Local trends is flagged OFF (owner) with all machinery kept");
ok(/p_radius_mi: 20/.test(bn), "beach counts as near only within 20 miles (owner definition)");
ok(bn.includes('"/api/local/report"'), "the daily brief comes from the guarded report endpoint");
ok(/e\.date === today/.test(bn), "the today list is date-gated via siteTime, not a guess");
const reportSrc = readFileSync(new URL("../app/api/local/report/route.js", import.meta.url), "utf8");
ok(reportSrc.includes("USE ONLY the facts given"), "report prompt is grounded");
ok(/no crowd levels, no 'buzz', no trends/.test(reportSrc), "report prompt bans the unsourced-signal list");
ok(reportSrc.includes("Do not use the word 'trending'"), "report never claims to measure trending");
const mw = readFileSync(new URL("../middleware.js", import.meta.url), "utf8");
ok(mw.includes('"/api/local/report"'), "report endpoint is IN the middleware guard matcher (the /api/bestmove/why lesson)");
// v6.49: Local trends leads with creator videos — REAL linked social videos
// only (the curated creatorVideos set), ranked by the Score. No view-count
// or engagement claims anywhere; "trending" = a creator actually posted.
ok(bn.includes("Creators are posting about these"), "video block header present");
ok(bn.includes("videoPlaces") && /PLATFORM\[pl\]/.test(bn), "platform chips come from the curated video set");
ok(!/\bviews\b|view count|viral/i.test(bn), "no view-count or virality claims");
ok(/hasCreatorVideo\(pp\)/.test(home), "trend places are exactly the video-linked ones");
ok(/No creator videos linked near you yet/.test(bn), "honest empty state for the video block");
ok(home.includes("const EV_HERO_H = 208"), "hero height is the owner's taller call (v6.51)");
// v6.50 hero swiper: slide 2 is the best-rated REAL beach within 20 mi
ok(/wf-hero-swipe/.test(home) && /scrollSnapType: "x mandatory"/.test(home), 'hero is a native scroll-snap swiper');
ok(/wf_nearest_beaches", \{ p_lat: center.lat, p_lng: center.lng, p_radius_mi: 60/.test(home), 'beach slide: BEST beach regardless of distance (radius 60)');
ok(/setBestBeach\(rankBeaches\(rows\)\[0\]/.test(home), 'beach slide uses the ONE shared ranking (lib/beaches) — identical to the page');
ok(/window\.location\.assign\("\/best-beaches\/"/.test(home), 'beach slide opens the shareable ranking page');
ok(/\{bestBeach && \(/.test(home), 'no beach in range = no second slide, never a filler card');
ok(/width: "93%" \/\* date-night \+ family slides always follow \*\//.test(home), 'slide 1 always peeks — date-night and family slides always follow');
ok(/datenight_hero_open/.test(home) && /family_hero_open/.test(home), 'date-night + family hero slides exist');
ok(/window\.location\.assign\("\/date-night\?lat="/.test(home) && /window\.location\.assign\("\/family\?lat="/.test(home), 'both slides open their destination pages with the live location');
ok(/src: "search_sparkle"/.test(home) && !/wfDice3d/.test(home), 'the sparkle lives beside search; the dice is retired (owner)');
ok((home.match(/aria-label="Find my vibe"/g) || []).length === 1, 'exactly one Find-my-vibe button');
ok(/wf_return_to/.test(home) && /sessionStorage.getItem\("wf_return_to"\)/.test(home), 'closing a detail returns to the referring Wayfind page (global fix)');
const sr = readFileSync(new URL("../app/ShareRedirect.js", import.meta.url), "utf8");
ok(/u.origin === window.location.origin/.test(sr) && /wf_return_to/.test(sr), 'ShareRedirect records ONLY same-origin non-home referrers — back can never eject off-site');
// the restructured Things-to-do page
const ttd = readFileSync(new URL("../app/components/ThingsToDoList.js", import.meta.url), "utf8");
ok(ttd.includes("Wayfind Pick") && /first && !isTour/.test(ttd), "rank-1 place wears the Wayfind Pick badge");
ok(/r\.selling_out \?/.test(ttd), "tour badge rides only the engine flag");
ok(ttd.includes("affiliate links; it never changes our rankings"), "one disclosure line, list bottom");
ok(!/TABS\.map/.test(ttd), "the list has NO internal tab row — the menu sub-tabs are the one filter row");
ok(/browseCat === "attractions" && \(sub === "all" \|\| !sub\) && <ThingsToDoList/.test(home), "attractions 'All' view IS the ranked list; sub-picks return the classic feed");
ok(!/browseCat === "attractions" \|\| browseCat === "family"\) && <ViatorRail/.test(home), "the stacked Viator rail is gone from attractions");
ok(!/browseCat === "attractions" && <ExperienceCategoryRail/.test(home), "the Bookable Experiences chip section is gone from attractions");
ok(!/card\("Best things to do today"/.test(home), "the best-things-to-do-today CARD is gone (the curated sheet of the same name stays — engines kept)");
ok(!/Explore near you<\/div>/.test(home), "the old Explore-near-you list menu is gone");
ok(home.includes("openCurated") && home.includes("EXPLORE_TILES"), "curated engines kept, not deleted");

// v6.56 (owner, 2026-07-22 — supersedes the v6.46 no-rail rule): a PERMANENT
// bookable-experiences rail on Things to do — trending on All, themed per
// sub-menu — and the affiliate key on EVERY tour link.
ok(/const SUB_TO_EXP = \{ all: "all", outdoors: "adventure", beaches: "water", museums: "museums", family: "theme"/.test(home), "the sub-menu -> experience-catalog mapping drifted");
ok(/browseCat === "attractions" && center && sub && sub !== "all" && <BookableExpRail sub=\{sub\}/.test(home), "the bookable rail renders on a sub-filter only (the ALL view interleaves tours via ThingsToDoList — no duplicate cards; see check-ttd-dedup)");
ok(/Aff\.viatorDirectUrl\(t\.url\) \|\| t\.url/.test(home), "rail hrefs lost the affiliate wrapper");
ok(ttd.includes("viatorDirectUrl(r.booking_url) || r.booking_url"), "TTD tour cards lost the affiliate wrapper — unattributed bookings earn nothing");
ok(ttd.includes("r.editorial_hook"), "TTD cards lost the verified editorial hook line");
const tb = readFileSync(new URL("../lib/todaysBest.js", import.meta.url), "utf8");
ok(tb.includes('.eq("verified", true).in("place_id", ids)'), "fetchThingsToDo lost the one-call verified-hook join");
ok(!/editorial_hook = /.test(tb.replace('r.editorial_hook = h','')) , "hooks attach only from verified rows");

// THE EDITORIAL RULE (docs/editorial-standard.md): the mapper is the ONE
// shape; the route holds the precedence; ranking pages branch on it.
import("../lib/editorialRule.js").then((er) => {
  const m = er.mapWfEditorial({ verified: true, hook: "H", why_here: "W", local_tip: "T", know_before: "K", best_time: "B", facts: [{ claim: "C", source: "https://mote.org/x" }] });
  if (!(m && m.knownFor === "H" && m.why === "W" && m.insiderMove === "T" && m.watchOut === "K" && m.goodToKnow === "B" && m.proof === "C" && m.sources[0] === "mote.org")) { console.error("FAIL: wf_editorial field map"); process.exit(1); }
  if (er.mapWfEditorial({ verified: false, hook: "x" }) !== null) { console.error("FAIL: unverified rows must map to null"); process.exit(1); }
  if (!er.GOOGLE_NUMBER_PROSE.test("4.8★ across 6,058 reviews")) { console.error("FAIL: lint pattern"); process.exit(1); }
});
const edRoute = readFileSync(new URL("../app/api/editorial/route.js", import.meta.url), "utf8");
ok(edRoute.indexOf("CARD_BY_ID.has(id)") < edRoute.indexOf("await wfEditorialFor("), "precedence: Atlas card beats the fleet row (hand curation wins)");
ok(edRoute.includes("s-maxage=3600"), "fleet rows surface within the hour (not a day)");

console.log(`test-todays-best: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
