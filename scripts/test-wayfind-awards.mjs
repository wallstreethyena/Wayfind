#!/usr/bin/env node
// scripts/test-wayfind-awards.mjs — the Best Breakfast 2026 winners wear their
// earned award on every place card, and NOTHING else does.
//
// Owner (2026-10-03): "add the badge to the place card for the breakfast places
// that won the 2026 breakfast award and make sure there is an editorial for the
// winners". This RENDERS the shared house cards (IconicPlaceCard, RailCard) via
// jsxLoad and CALLS lib/wayfindAwards.js; it does not grep for strings.
//
// Locks:
//   1. every registered winner resolves to an award, and a non-winner (including
//      ANOTHER LOCATION of a winning chain) resolves to null
//   2. IconicPlaceCard + RailCard render the award band for a winner, ahead of
//      the live rank chip, and render the normal TOP … PICK chip for a non-winner
//   3. every winner holds an Atlas editorial card (data/atlas/editorial-cards.json)
//   4. home.js PlaceCard + Detail sheet both route through wayfindAwardFor
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AWARDS, wayfindAwardFor, wayfindAwardsFor, awardedPlaceIds } from "../lib/wayfindAwards.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = (m) => { console.error("test-wayfind-awards: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

// ── 1. The registry, CALLED ────────────────────────────────────────────────
const ids = awardedPlaceIds();
ok(ids.length === 6, "Best Breakfast 2026 has 6 winning locations (got " + ids.length + ")");
ok(new Set(ids).size === ids.length, "no place wins twice");
for (const award of AWARDS) {
  for (const w of award.winners) {
    ok(/^ChIJ[\w-]{10,}$/.test(w.placeId), w.name + " is keyed by a real Google place_id");
    for (const shape of [w.placeId, { id: w.placeId }, { place_id: w.placeId }, { placeId: w.placeId }]) {
      const a = wayfindAwardFor(shape);
      ok(a && a.wayfindAward && a.tone === "wayfind-award", w.name + " resolves from " + JSON.stringify(shape).slice(0, 40));
    }
    const a = wayfindAwardFor(w.placeId);
    ok(a.label.startsWith(award.title + " · "), w.name + " label names the dated award: " + a.label);
    ok(a.label.length <= 34, w.name + " label fits the 390px band (" + a.label.length + " chars)");
    ok(!/[–—]/.test(a.label + a.detail), w.name + " copy carries no dashes");
    ok(!/\bbest\b.+\bpick\b/i.test(a.label), "an earned award never reads as the banned BEST … PICK chip");
  }
}
// Negative controls: the La Croisette area answer must never say "in AMI".
ok(wayfindAwardFor("ChIJFfdjBlz9wogR6wSfGKbqL0k").detail === "#1 near Anna Maria Island",
  "La Croisette (St. Pete Beach) is #1 NEAR Anna Maria Island, never placed in it");
// Another Keke's location (University Pkwy) and another Bistro Café (downtown) did NOT win.
ok(wayfindAwardFor("ChIJfeY1tNk4w4gRNX1FjX6p6xo") === null, "a non-winning Keke's location wears no award");
ok(wayfindAwardFor({ id: "ChIJISrRpNC32YgRBTY3l4DVuCk" }) === null, "the downtown Bistro Café (not the winner) wears no award");
ok(wayfindAwardFor(null) === null && wayfindAwardFor({}) === null && wayfindAwardFor("") === null, "empty input is null");

// ── 2. RENDER the house cards ───────────────────────────────────────────────
const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
const { loadComponent } = await import("./lib/jsxLoad.mjs");
const Iconic = (await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT)).default;
const RailCard = (await loadComponent(path.join(ROOT, "app/components/RailCard.js"), ROOT)).default;
const WIN = { id: "ChIJFfdjBlz9wogR6wSfGKbqL0k", name: "La Croisette", rating: 4.8, reviews: 6598, types: ["breakfast_restaurant", "restaurant"], primaryType: "breakfast_restaurant", governed_score: 96 };
const LOSE = { id: "ChIJfeY1tNk4w4gRNX1FjX6p6xo", name: "Keke's Breakfast Cafe", rating: 4.5, reviews: 1793, types: ["breakfast_restaurant", "restaurant"], primaryType: "breakfast_restaurant", governed_score: 90 };

const iw = renderToStaticMarkup(React.createElement(Iconic, { place: WIN, rank: 2 }));
ok(iw.includes("wf-place-card-award is-wayfind-award"), "IconicPlaceCard renders the award band for a winner");
ok(iw.includes("2026 WINNER") && iw.includes("Best Breakfast") && iw.includes("#1 near Anna Maria Island"), "IconicPlaceCard shows the WINNER eyebrow, award name and detail");
ok(iw.includes("is-award-winner"), "IconicPlaceCard root carries is-award-winner");
ok(/class="wf-award-listrank"[^>]*>List #<!-- -->2</.test(iw) || iw.includes(">List #2<"), "IconicPlaceCard winner moves the live rank beside the category as List #2");
ok(!/Top \w+ pick/i.test(iw), "the earned award takes the one credential slot (no second TOP … PICK chip)");
const il = renderToStaticMarkup(React.createElement(Iconic, { place: LOSE, rank: 1 }));
ok(!il.includes("is-wayfind-award") && /Top \w+ pick/i.test(il), "a non-winner keeps the normal TOP … PICK chip (positive control)");
ok(!il.includes("wf-award-listrank"), "a non-winner keeps its rank on the photo (no List # chip)");

const rw = renderToStaticMarkup(React.createElement(RailCard, {
  place: WIN, title: WIN.name, rank: 3, score: 9.6,
  award: { icon: "3", label: "Top breakfast pick", tone: 3 },
}));
ok(rw.includes("wf-place-card-award is-wayfind-award") && rw.includes("2026 WINNER") && rw.includes("Best Breakfast"),
  "RailCard resolves the award from the place row and overrides the caller's rank band");
ok(!rw.includes("Top breakfast pick"), "RailCard shows one credential, not two");
const rl = renderToStaticMarkup(React.createElement(RailCard, {
  place: LOSE, title: LOSE.name, rank: 3, score: 9.0,
  award: { icon: "3", label: "Top breakfast pick", tone: 3 },
}));
ok(rl.includes("Top breakfast pick") && !rl.includes("is-wayfind-award"), "RailCard keeps the caller's band for a non-winner");

// ── 2b. The badge sticker + WINNER eyebrow, rendered by ALL three card renderers
const AwardsRail = (await loadComponent(path.join(ROOT, "app/components/AwardsRail.js"), ROOT)).default;
const { AwardSticker, AwardBand } = await loadComponent(path.join(ROOT, "app/components/AwardCardParts.js"), ROOT);
const hasBadge = (html) => /<svg[^>]*role="img"[^>]*>/.test(html) && />2026<\/text>/.test(html);
const rl2 = rl;
for (const [name, html] of [["IconicPlaceCard", iw], ["RailCard", rw]]) {
  ok(hasBadge(html), name + " renders the AwardBadge svg (role=img, year text 2026) for a winner");
  ok(/class="wf-award-sticker"/.test(html), name + " wraps the badge in .wf-award-sticker");
  ok(html.includes("2026 WINNER"), name + " renders the 2026 WINNER eyebrow for a winner");
}
for (const [name, html] of [["IconicPlaceCard", il], ["RailCard", rl2]]) {
  ok(!hasBadge(html) && !html.includes("WINNER") && !html.includes("wf-award-sticker") && !html.includes("is-award-winner"), name + " shows no badge, no WINNER eyebrow, no winner class for a non-winner");
}
// home.js PlaceCard is not importable standalone: render the shared parts it
// calls with the exact award object it passes (wayfindAwardFor(p)).
{
  if (!AwardSticker) fail("AwardCardParts must be importable (home.js PlaceCard renders it)");
  const award = wayfindAwardFor(WIN.id);
  const sticker = renderToStaticMarkup(React.createElement(AwardSticker, { award }));
  const band = renderToStaticMarkup(React.createElement(AwardBand, { award }));
  ok(hasBadge(sticker) && band.includes("2026 WINNER"), "AwardSticker + AwardBand (home PlaceCard parts) render the badge and eyebrow");
  ok(renderToStaticMarkup(React.createElement(AwardSticker, { award: null })) === "" && renderToStaticMarkup(React.createElement(AwardBand, { award: { rank: 1, label: "x" } })) === "",
    "the parts render nothing for a non-award or a rank chip");
}

// ── 2c. Detail "Awards & recognition" rail
{
  const railWin = renderToStaticMarkup(React.createElement(AwardsRail, { place: WIN }));
  ok(railWin.includes("Awards &amp; recognition") && railWin.includes("1 award") && !railWin.includes("2 awards"), "AwardsRail renders the header + '1 award' for a winner");
  ok((railWin.match(/role="listitem"/g) || []).length === 1, "AwardsRail renders exactly 1 tile");
  ok(hasBadge(railWin) && railWin.includes("2026 WINNER") && railWin.includes("Best Breakfast") && railWin.includes('tabindex="0"') && railWin.includes('aria-label="Awards"'), "AwardsRail tile has badge, eyebrow, name; the rail is focusable and labelled");
  ok(railWin.includes('aria-label="' + wayfindAwardFor(WIN.id).ariaLabel + '"'), "AwardsRail tile carries the award ariaLabel");
  ok(renderToStaticMarkup(React.createElement(AwardsRail, { place: LOSE })) === "", "AwardsRail renders NOTHING for a non-winner");
  // newest-first: the rail renders whatever order it is handed; the registry is sorted.
  const two = [{ ...wayfindAwardFor(WIN.id), id: "a-2027", year: 2027, name: "Best Brunch" }, wayfindAwardFor(WIN.id)];
  const html2 = renderToStaticMarkup(React.createElement(AwardsRail, { awards: two }));
  ok(html2.includes("2 awards") && html2.indexOf("2027 WINNER") < html2.indexOf("2026 WINNER"), "AwardsRail keeps newest first for 2 awards");
  const all = wayfindAwardsFor(WIN.id);
  ok(Array.isArray(all) && all.length === 1 && all[0].year === 2026 && wayfindAwardsFor("nope").length === 0, "wayfindAwardsFor returns the winner's awards and [] otherwise");
  ok(all.every((a, i) => i === 0 || all[i - 1].year >= a.year), "wayfindAwardsFor is sorted newest first (only one award is registered today, so the multi-award order is covered by the AwardsRail test above)");
}

// ── 3. Every winner has an editorial card ───────────────────────────────────
const cards = JSON.parse(readFileSync(path.join(ROOT, "data/atlas/editorial-cards.json"), "utf8"));
const byId = new Map(cards.map((c) => [c.placeId, c]));
for (const id of ids) {
  const c = byId.get(id);
  ok(c, "winner " + id + " (" + (wayfindAwardFor(id).label) + ") has an Atlas editorial card");
  for (const k of ["whyGo", "knownFor", "insiderMove", "vibeCheck", "bestFor"]) {
    ok(typeof c[k] === "string" && c[k].trim().length > 20, c.name + " editorial has " + k);
  }
  ok(Array.isArray(c.sourceUrls) && c.sourceUrls.length >= 2, c.name + " editorial cites its sources");
}

// ── 3b. No repetition (owner, 2026-10-04: "don't waste the reader's time by
//        saying the same thing over and over"). Every section renders as its
//        own card on the detail page, so a 4-word phrase that appears in two
//        sections of one winner card is the same point told twice.
{
  const FIELDS = ["whyGo", "knownFor", "insiderMove", "powerhouseProof", "currentUsefulDetail", "watchOut",
    "bestFor", "proMove", "foodMove", "drinkMove", "verifiedStory", "vibeCheck", "funFact"];
  const words = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
  const grams = (t) => { const w = words(t); const g = new Set(); for (let i = 0; i + 4 <= w.length; i++) g.add(w.slice(i, i + 4).join(" ")); return g; };
  // positive control: the probe finds a planted repeat
  const a = grams("Croissants baked every morning by the owner"), b = grams("the croissants baked every morning are best");
  ok([...a].some((g) => b.has(g)), "positive control: the repeat probe catches a shared 4-word phrase");
  for (const id of ids) {
    const c = byId.get(id);
    const owner = new Map();
    for (const f of FIELDS) {
      for (const g of grams(c[f])) {
        const prev = owner.get(g);
        ok(!prev || prev === f, c.name + ": \"" + g + "\" appears in both " + prev + " and " + f + " (say it once)");
        owner.set(g, f);
      }
    }
  }
  const detail = strip(readFileSync(path.join(ROOT, "app/components/sheets/Detail.js"), "utf8"));
  ok(/function WayfindTakeRail\(\{\s*editorial,\s*alreadyShown/.test(detail), "WayfindTakeRail takes the text already shown above it");
  ok(/<WayfindTakeRail\s+editorial=\{editorial\}\s+alreadyShown=\{/.test(detail), "Detail passes the Why Wayfind picked text into the rail so Why go is not printed twice");
  ok(/seen\.has\(n\)/.test(detail), "the rail drops a card whose text already appeared");
}

// ── 4. Other renderers route through the helper ─────────────────────────────
{
  const home = strip(readFileSync(path.join(ROOT, "app/home.js"), "utf8"));
  const start = home.indexOf("function PlaceCard(");
  ok(start >= 0, "positive control: home PlaceCard exists");
  const body = home.slice(start, start + 12000);
  ok(/const\s+cardAward\s*=\s*wayfindAwardFor\(p\)\s*\|\|/.test(body), "home PlaceCard composes its award from wayfindAwardFor(p) first");
  ok(/<AwardBand\s+award=\{cardAward\}/.test(body) && /<AwardSticker\s+award=\{cardAward\}/.test(body), "home PlaceCard renders AwardSticker + AwardBand from cardAward");
  const detail = strip(readFileSync(path.join(ROOT, "app/components/sheets/Detail.js"), "utf8"));
  ok(/<AwardsRail\s+place=\{detail\}/.test(detail) && !/wf-detail-award/.test(detail), "Detail sheet renders the AwardsRail (old inline award span is gone)");
  const css = readFileSync(path.join(ROOT, "app/components/css.js"), "utf8");
  ok(/\.wf-place-card-award\.is-wayfind-award\{/.test(css), "house CSS styles .is-wayfind-award");
}

console.log(`test-wayfind-awards: OK — ${pass} assertions (${ids.length} winners, rendered IconicPlaceCard + RailCard, ${cards.length} editorial cards scanned)`);
