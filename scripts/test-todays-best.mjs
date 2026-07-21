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
ok(/Best places to eat nearby/.test(home), "the best-places-to-eat card renders in its place");
ok(!/card\("Best things to do today"/.test(home), "the best-things-to-do-today CARD is gone (the curated sheet of the same name stays — engines kept)");
ok(!/Explore near you<\/div>/.test(home), "the old Explore-near-you list menu is gone");
ok(home.includes("openCurated") && home.includes("EXPLORE_TILES"), "curated engines kept, not deleted");

console.log(`test-todays-best: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
