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
ok(/_bb\(b\) - _bb\(a\)/.test(home), 'beach slide ranks by the Bayesian score, proximity only as tiebreak');
ok(/window\.location\.assign\("\/best-beaches\/"/.test(home), 'beach slide opens the shareable ranking page');
ok(/\{bestBeach && \(/.test(home), 'no beach in range = no second slide, never a filler card');
ok(/width: bestBeach \? "93%" : "100%"/.test(home), 'peek affordance only when a second slide exists');
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

console.log(`test-todays-best: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
