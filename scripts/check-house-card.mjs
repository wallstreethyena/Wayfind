#!/usr/bin/env node
// scripts/check-house-card.mjs — ONE place-card chrome, locked.
//
// Owner (2026-08-25), two live screenshots from gowayfind.com (Parrish):
//   REJECT — compact row: 96×96 thumb, yellow rank circle next to the title,
//            gold "BEST FOOD PICK" trophy chip.
//   REQUIRE — Tonight's Move / DaypartRail house card: tall media column,
//            rank ON the photo, orange category eyebrow, dark
//            "TOP {CATEGORY} PICK" chip with the rank number in a circle.
//
// Owner (2026-08-26), live Parrish / Family → Rainy day: the green WAYFIND
// score chip in the title row crowded the name and the TOP {CATEGORY} PICK
// chip and overlapped the photo/heading edge. REQUIRE — score overlay is a
// CHILD of .wf-place-card-media (on the photo, with the rank). A title-row
// score fails the build. No compact home-row exception.
//
// This is not documentation. It CALLS the award helper and RENDERS
// IconicPlaceCard (jsxLoad), then scans every place-card renderer for the
// rejected chrome. A second card system, a BEST … PICK label, a yellow
// rank-next-to-title compact row, or a title-row score fails the build.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { topPickAward, isForbiddenBestPick } from "../lib/topPickAward.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = (m) => { console.error("check-house-card: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (rel) => {
  try { return readFileSync(path.join(ROOT, rel), "utf8"); }
  catch (e) { fail(rel + " is missing — this lock is anchored to a file that no longer exists"); return ""; }
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

// ── 1. CALL the helper. A regex over the source is not the award. ──────────
const food1 = topPickAward({ category: "Food", rank: 1 });
ok(food1 && food1.label === "Top Food pick" && food1.icon === "1",
  "rank 1 is TOP FOOD PICK with a rank number, never BEST / trophy (got " + JSON.stringify(food1) + ")");
ok(!isForbiddenBestPick(food1.label), "the helper itself must not emit BEST … PICK");
const act2 = topPickAward({ category: "Activities", rank: 2 });
ok(act2 && act2.label === "Top Activities pick" && act2.icon === "2",
  "rank 2 is TOP ACTIVITIES PICK + 2");
const night3 = topPickAward({ category: "Nightlife", rank: 3 });
ok(night3 && night3.label === "Top Nightlife pick" && night3.icon === "3",
  "rank 3 is TOP NIGHTLIFE PICK + 3");
ok(topPickAward({ category: "Food", rank: 4 }) === null, "rank 4+ carries no pick chip");
ok(topPickAward({ category: "Local pick", rank: 1 }).label === "Top Local pick",
  "a category that already ends in pick does not become 'top local pick pick'");
const curator = topPickAward({ category: "Food", rank: 1, curator: true });
ok(curator && curator.label === "Wayfind curator's pick" && curator.icon === "✦",
  "an owner pick still uses the single curator credential, not BEST FOOD PICK");

// ── 2. RENDER the house card. Rank 1 must say TOP, never BEST, never 🏆. ───
const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
const { loadComponent } = await import("./lib/jsxLoad.mjs");
const Iconic = (await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT)).default;
const html = renderToStaticMarkup(React.createElement(Iconic, {
  place: {
    id: "house-card-fixture",
    name: "Society Wine Bar",
    rating: 4.7, reviews: 412, priceLevel: "PRICE_LEVEL_MODERATE",
    types: ["wine_bar", "restaurant"],
    primaryType: "wine_bar",
    distMi: 4.2,
    governed_score: 94,
  },
  rank: 1,
  href: "/p/house-card-fixture",
}));
ok(html.includes("wf-place-card"), "positive control: IconicPlaceCard rendered the house class");
ok(/top food pick/i.test(html) || /top nightlife pick/i.test(html),
  "rank-1 house card emits TOP {CATEGORY} PICK (got excerpt: " + html.replace(/\s+/g, " ").slice(html.toLowerCase().indexOf("pick") - 40, html.toLowerCase().indexOf("pick") + 20) + ")");
ok(!/best\s+\w+\s+pick/i.test(html), "rank-1 house card must not emit BEST … PICK");
ok(!html.includes("🏆"), "rank-1 house card must not emit a trophy glyph");
ok(html.includes("wf-place-card-rank") && html.includes(">1<"),
  "rank lives in wf-place-card-rank (on the photo), not a yellow circle next to the title");
ok(html.includes("wf-place-card-media"),
  "positive control: house card wraps the photo in wf-place-card-media");
ok(html.includes("wf-place-card-score") && html.includes("wayfind-score-badge"),
  "positive control: house card rendered the Wayfind score overlay");
{
  // Nearest preceding host class. Score/rank AFTER the title-row marker means
  // they leaked into the content column — the Parrish screenshot. Score/rank
  // AFTER media and BEFORE title-row means they are children of the photo.
  const hostOf = (needle) => {
    const i = html.indexOf(needle);
    if (i < 0) return "absent";
    const before = html.slice(0, i);
    const media = before.lastIndexOf("wf-place-card-media");
    const title = before.lastIndexOf("wf-place-card-title-row");
    if (media < 0 && title < 0) return "none";
    return media > title ? "media" : "title-row";
  };
  ok(hostOf("wf-place-card-score") === "media",
    "score overlay is a child of the media, not the title row (got host=" + hostOf("wf-place-card-score") + ")");
  ok(hostOf("wf-place-card-rank") === "media",
    "rank overlay is a child of the media, not the title row (got host=" + hostOf("wf-place-card-rank") + ")");
  const titleOpen = html.indexOf("wf-place-card-title-row");
  ok(titleOpen >= 0, "positive control: title-row still exists so the absence check is not vacuous");
  const titleSlice = html.slice(titleOpen, html.indexOf("wf-place-card-meta", titleOpen));
  ok(titleSlice.length > 40, "positive control: title-row slice is real content");
  ok(!titleSlice.includes("wf-place-card-score") && !titleSlice.includes("wayfind-score-badge"),
    "title-row must not contain the score badge — that is the crowded-name bug");
  ok(!titleSlice.includes("wf-place-card-rank"),
    "title-row must not contain the rank — rank is on the photo");
}

// ── 3. Every place-card renderer uses the helper — no local BEST composer. ─
const AWARD_SITES = [
  "app/home.js",
  "app/components/IconicPlaceCard.js",
  "app/components/BestNearby.js",
  "app/components/IntentRail.js",
  "app/components/ExplodingNearby.js",
  "app/components/ThingsToDoList.js",
];
for (const f of AWARD_SITES) {
  const raw = strip(read(f));
  // home.js also holds the ?exp= Best-of tile (a collection, not a card chip).
  // Scan the PlaceCard body there so a collection icon cannot launder a fail.
  const src = f === "app/home.js"
    ? raw.slice(raw.indexOf("function PlaceCard("), raw.indexOf("function PlaceCard(") + 9000)
    : raw;
  ok(src.includes("topPickAward"), f + " must compose the pick chip through lib/topPickAward.js");
  ok(!/\bBest \s*\+|\"Best \"|'Best '/.test(src), f + " must not compose a Best … pick label");
  ok(!/icon:\s*i\s*===\s*0\s*\?\s*[\"']🏆/.test(src) && !/award=\{[^}]*🏆/.test(src) && !/icon:\s*[\"']🏆[\"']/.test(src),
    f + " must not pass a trophy as the pick-chip icon");
}

// ── 4. Home browse / TTD must not re-grow Image-1 compact chrome. ──────────
{
  const home = strip(read("app/home.js"));
  const start = home.indexOf("function PlaceCard(");
  ok(start >= 0, "positive control: PlaceCard is still declared in app/home.js");
  const body = home.slice(start, start + 9000);
  ok(body.length > 2000, "PlaceCard body parsed (slice would be vacuous otherwise)");
  ok(!/width:\s*96,\s*height:\s*[\"']auto[\"'],\s*minHeight:\s*96/.test(body),
    "home PlaceCard must not force a 96×96 compact thumb — that is Image-1");
  ok(!/function medal\(/.test(home),
    "home.js medal() (yellow/gold rank circle next to the title) stays deleted");
  ok(/className=\"wf-place-card-media\"/.test(body) || /className=\{[\"']wf-place-card-media[\"']\}/.test(body),
    "home PlaceCard media uses wf-place-card-media so house CSS sizes the tall column");
  ok(/topPickAward\(\{\s*category:\s*pcat,\s*rank:\s*cardRank\s*\}\)/.test(body),
    "home PlaceCard award is TOP {section} PICK, not cuisine-BEST");
}

// ── 4b. Every house-card renderer: score is in the media, never the title. ─
{
  const HOUSE = [
    "app/components/IconicPlaceCard.js",
    "app/components/RailCard.js",
    "app/components/ThingsToDoList.js",
    "app/home.js",
  ];
  for (const f of HOUSE) {
    const raw = strip(read(f));
    const src = f === "app/home.js"
      ? raw.slice(raw.indexOf("function PlaceCard("), raw.indexOf("function PlaceCard(") + 9000)
      : raw;
    ok(src.length > 400, "positive control: " + f + " body parsed");
    const rows = [...src.matchAll(/className=["']wf-place-card-title-row["'][\s\S]{0,700}/g)];
    ok(rows.length >= 1, "positive control: " + f + " still has a title-row (got " + rows.length + ")");
    for (const m of rows) {
      ok(!/wf-place-card-score/.test(m[0]), f + " title-row must not hold wf-place-card-score");
      ok(!/WayfindScoreBadge/.test(m[0]), f + " title-row must not render WayfindScoreBadge");
      ok(!/wf-place-card-rank/.test(m[0]), f + " title-row must not hold the rank overlay");
    }
    ok(/wf-place-card-media[\s\S]{0,900}wf-place-card-score/.test(src),
      f + " score overlay must be a child of wf-place-card-media");
    ok(/wf-place-card-media[\s\S]{0,900}wf-place-card-rank/.test(src),
      f + " rank overlay must be a child of wf-place-card-media");
  }
}
{
  const ttd = strip(read("app/components/ThingsToDoList.js"));
  ok(/<IconicPlaceCard[\s/>]/.test(ttd), "ThingsToDoList place rows render IconicPlaceCard — not a second compact row");
  ok(!/medalColor/.test(ttd), "ThingsToDoList must not restore the yellow medal rank ring");
  ok(!/width:\s*96,\s*alignSelf:\s*[\"']stretch[\"'],\s*minHeight:\s*96/.test(ttd),
    "ThingsToDoList must not restore the 96×96 compact photo column");
}

// ── 5. CSS: the pick chip is dark gray. Gold trophy rank-1 is the reject. ──
{
  const css = read("app/components/css.js");
  const award = (css.match(/\.wf-place-card-award\{[^}]*\}/) || [""])[0];
  ok(award.length > 40, "positive control: .wf-place-card-award rule exists");
  ok(/#E2E8F0|#334155|rgba\(51,\s*65,\s*85/.test(award),
    "the pick chip default is dark gray, not gold");
  ok(!/#F4D477|#FFE39A|#D9A52E/.test(award),
    "the pick chip default must not be the gold BEST FOOD PICK treatment");
  const rank1 = (css.match(/\.wf-place-card-award\.is-rank-1[^{]*\{[^}]*\}/) || [""])[0];
  ok(rank1.length > 10, "positive control: .is-rank-1 still exists (unified dark, not deleted)");
  ok(!/#FFE39A|#F4D477|#D79A18/.test(rank1),
    ".is-rank-1 must not restore the gold trophy chip");
  ok(!/\.wf-place-card-award-icon:after\{/.test(css),
    "the trophy-ribbon :after on the pick icon stays deleted");
  ok(/\.wf-place-card-layout>\.wf-place-card-media/.test(css),
    "house CSS sizes FallbackImg via .wf-place-card-media (the home-browse wrap)");
  const scoreRule = (css.match(/\.wf-place-card-score\{[^}]*\}/) || [""])[0];
  ok(scoreRule.length > 20, "positive control: .wf-place-card-score rule exists");
  ok(/position:\s*absolute/.test(scoreRule),
    "the score chip is absolutely positioned on the media, not in-flow in the title row");
  ok(!/calc\(10px\s*-\s*var\(--wf-place-card-media\)\)/.test(css),
    "rank no longer uses the title-row left-offset hack — it is a media child");
}

// ── 6. RENDER ThingsToDoList. #952 left FOCUS unbound; source greps missed it. ─
{
  const TTD = (await loadComponent(path.join(ROOT, "app/components/ThingsToDoList.js"), ROOT)).default;
  let html = "";
  let err = null;
  try {
    html = renderToStaticMarkup(React.createElement(TTD, {
      center: { lat: 27.597, lng: -82.345 },
      city: "Parrish",
    }));
  } catch (e) { err = e; }
  ok(!err, "ThingsToDoList renders without throwing — " + (err ? err.constructor.name + ": " + err.message : "ok"));
  ok(!(err && err instanceof ReferenceError),
    "ThingsToDoList must not throw ReferenceError (FOCUS / C unbound is the 2026-08-25 live crash)");
  ok(html.includes("wf-sk") || html.includes("wf-place-card") || html.includes("right now"),
    "positive control: ThingsToDoList produced markup (got " + html.slice(0, 80) + ")");
}

// ── 7. Two photoless house cards must not share an <img>. Own photo or monogram. ─
{
  const kids = renderToStaticMarkup(React.createElement(Iconic, {
    place: { id: "kids-empire", name: "Kids Empire Bradenton", types: ["playground"], city: "Parrish" },
    rank: 1,
    href: "/p/kids-empire",
  }));
  const escape = renderToStaticMarkup(React.createElement(Iconic, {
    place: { id: "intense-escape", name: "Intense Escape", types: ["tourist_attraction"], city: "Parrish" },
    rank: 2,
    href: "/p/intense-escape",
  }));
  ok(kids.includes("wf-place-card-monogram") && escape.includes("wf-place-card-monogram"),
    "photoless house cards use the branded monogram, not a shared stock scene");
  ok(!/<img\b/i.test(kids) && !/<img\b/i.test(escape),
    "photoless house cards must not paint an <img> (that is how one beach sunset reused across Kids Empire + Intense Escape)");
  const ownA = renderToStaticMarkup(React.createElement(Iconic, {
    place: { id: "a", name: "Place A", photoRef: "places/AAA/photos/BBB", types: ["museum"] },
    rank: 1,
    href: "/p/a",
  }));
  const ownB = renderToStaticMarkup(React.createElement(Iconic, {
    place: { id: "b", name: "Place B", photoRef: "places/CCC/photos/DDD", types: ["museum"] },
    rank: 2,
    href: "/p/b",
  }));
  ok(ownA.includes("places%2FAAA") && ownB.includes("places%2FCCC"),
    "each house card with a photoRef uses that place's own /api/photo URL");
  ok(!ownA.includes("places%2FCCC") && !ownB.includes("places%2FAAA"),
    "one place's photoRef must not appear on the other card");
  ok((ownA.match(/src="[^"]+"/g) || [])[0] !== (ownB.match(/src="[^"]+"/g) || [])[0],
    "two adjacent house cards with different placeIds must not emit the same photo URL");
  const iconic = strip(read("app/components/IconicPlaceCard.js"));
  const homePc = (() => {
    const raw = strip(read("app/home.js"));
    const start = raw.indexOf("function PlaceCard(");
    return start >= 0 ? raw.slice(start, start + 12000) : "";
  })();
  ok(!/useMarketPhotoFallback|marketPhotoQuery/.test(iconic),
    "IconicPlaceCard must not fetch a shared category+city stock photo");
  ok(!/cardMarketFallback|useMarketPhotoFallback|marketPhotoQuery/.test(homePc),
    "home PlaceCard must not fetch a shared category+city stock photo");
}

console.log(`check-house-card: OK — ${pass} assertions (TOP {CATEGORY} PICK only; score+rank on the photo; no Image-1 compact row; no gold BEST chip; no unbound FOCUS; no shared stock photo)`);
