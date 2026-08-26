#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { INTENT_PAGES, intentHeader } from "../lib/intentPages.js";
import { buildCollectionHeader, editorialIntentHeader, experienceHeader } from "../lib/collectionHeader.js";
import { nowContext } from "../lib/nowContext.js";
import { areaSeasonalContext } from "../lib/areaSeasonalContext.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
const fails = [];
const ok = (value, message) => { n++; if (!value) fails.push(message); };
const count = (text, word) => (String(text).match(new RegExp(word, "gi")) || []).length;
const ctx = nowContext({ hour: 20, weather: null });
const local = areaSeasonalContext("Orlando", "summer");

// The city is assembled once, by the header helper, never by the component.
const best = intentHeader(INTENT_PAGES["best-of"], ctx, "Orlando", 0, local.area_known_for);
const passed = intentHeader(INTENT_PAGES.nearby, ctx, "Orlando", 1, local.area_known_for);
const gems = intentHeader(INTENT_PAGES["hidden-gems"], ctx, "Orlando", 0, local.area_known_for);
ok(best.title === "The highest-scoring places in Orlando", "best-of title is complete and exact");
ok(passed.title === "You have driven past most of these", "nearby title does not acquire a stray city suffix");
ok(gems.title === "Hidden gems in Orlando", "hidden-gems title includes the city exactly once");
for (const h of [best, passed, gems]) ok(count(h.title, "Orlando") <= 1, `city appears at most once in '${h.title}'`);
ok(!/in Orlando Orlando/i.test(best.title), "never renders 'in Orlando Orlando'");
ok(!/most of these Orlando/i.test(passed.title), "never renders 'most of these Orlando'");
ok(gems.deck.includes("theme parks") && gems.deck.includes("quietly excellent"), "the deck explains the sheet and adds vetted Orlando culture");
ok((gems.deck.match(/[.!?]/g) || []).length === 1, "the primary deck stays one sentence");

const duplicate = buildCollectionHeader({ eyebrow: "Hidden gems in Orlando", title: "Hidden gems in Orlando", deck: "One sentence.", city: "Orlando" });
ok(duplicate.eyebrow === "", "an eyebrow that merely repeats the headline is suppressed");

// Every hero destination gets an authored experience x place contract rather
// than one metro paragraph with a different heading pasted above it.
const intents = ["nearby", "best-of", "hidden-gems", "date-night", "family", "tonight", "worth-the-drive", "budget", "seasonal"];
const editorial = intents.map((intent) => editorialIntentHeader(intent, "Orlando", local));
ok(new Set(editorial.map((h) => h.title)).size === intents.length, "all intent headlines are distinct for the same city");
ok(new Set(editorial.map((h) => h.deck)).size === intents.length, "all intent decks are distinct for the same city");
for (const h of editorial) {
  ok(count(h.title, "Orlando") === 1, `editorial title carries Orlando exactly once: '${h.title}'`);
  ok(h.imageKicker && h.imageTitle && h.dekLead, `editorial header carries its own image and deck language: '${h.title}'`);
  ok(!/\b(?:you must|you should|go to|do this)\b/i.test(h.deck), `editorial deck informs without ordering the visitor: '${h.deck}'`);
}
const tonight = editorialIntentHeader("tonight", "Orlando", local);
ok(tonight.title === "Orlando after dark, without the guesswork", "tonight names the location and after-dark decision clearly");
ok(/open and nearby/i.test(tonight.deck), "tonight explains that live fit outranks daytime reputation");
ok(/afternoon storms/i.test(tonight.deck) && !/day off/i.test(tonight.deck), "tonight uses the seasonal Orlando rhythm without pasting the generic metro line");

const parrishLocal = areaSeasonalContext("Parrish", "summer");
const parrishBest = editorialIntentHeader("best-of", "Parrish", parrishLocal);
ok(/tiny old rail town/i.test(parrishBest.deck) && /climb aboard/i.test(parrishBest.deck), "Parrish best-of explains the verified rail-town experience instead of generic city filler");
ok(!/local counterpoint|obvious edited down/i.test(parrishBest.deck + " " + parrishBest.dekLead), "the best-of header avoids internal editorial jargon");
const unknownBest = editorialIntentHeader("best-of", "Boise", null);
ok(!/rail|theme park|beach|local counterpoint/i.test(unknownBest.deck), "an unseeded city gets an honest promise without borrowed local trivia");

// Eight main category sheets all receive a complete, compact, city-aware
// header. This exercises the same helper screens/Experience.js calls.
const categories = ["outdoors", "hiddengems", "bucketlist", "familyfun", "friends", "datenight", "nightout", "eatnow"];
for (const key of categories) {
  const exp = { title: key === "hiddengems" ? "Hidden Gems" : key.replace(/([a-z])([A-Z])/g, "$1 $2"), label: key };
  const h = experienceHeader(key, exp, "Orlando", local.area_known_for);
  ok(h.title && h.deck && count(h.title, "Orlando") === 1, `${key} has one complete Orlando-aware title and deck`);
  ok(h.eyebrow !== h.title, `${key} does not repeat identical eyebrow/headline copy`);
}

const Blocks = await loadComponent(path.join(ROOT, "app/components/ExperienceBlocks.js"), ROOT);
const Card = (await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT)).default;
const alwaysOpen = { periods: [{ open: { day: 0, hour: 0 }, close: { day: 0, hour: 0 } }] };
const places = [
  { id: "inside", name: "The Gallery", rating: 4.8, reviews: 650, distMi: 2.4, types: ["museum"], oh: alwaysOpen, utcOffset: 0 },
  { id: "near", name: "Night Owl", rating: 4.7, reviews: 720, distMi: 4.1, types: ["bar"], oh: alwaysOpen, utcOffset: 0 },
];
const wet = { outdoorOK: false, weather: { known: true, isWet: true } };
const rows = Blocks.rightNowRows([{ id: "inside", why: "4.8 stars" }], places, [places[1], places[0]], wet, Date.UTC(2026, 6, 26, 18));
ok(rows.length === 1, "a genuinely current pick renders");
ok(rows[0].why === "Good indoor option during storms", "weather reason is current and specific");
ok(!/rating|review|score|star|★/i.test(rows[0].why), "Right now never uses generic ranking evidence as its reason");
ok(Blocks.rightNowRows([{ id: "inside" }, { id: "near" }], places, places, null, Date.UTC(2026, 6, 26, 18)).length === 0, "a Right now list identical to the durable ranking is suppressed");
ok(Blocks.rightNowRows([{ id: "inside" }], [{ ...places[0], distMi: 18 }], [places[1]], wet, Date.UTC(2026, 6, 26, 18)).length === 0, "a far result is not called nearby");
const rankedNow = Blocks.rightNowRows(
  [{ id: "inside" }, { id: "near" }],
  [{ ...places[0], wfScore: 87 }, { ...places[1], wfScore: 98 }],
  [{ id: "durable-other" }, { id: "inside" }],
  null,
  Date.UTC(2026, 6, 26, 18),
);
ok(rankedNow.map((x) => x.id).join(",") === "near,inside", "Right now always shows the highest visible Wayfind Score first");
ok(renderToStaticMarkup(createElement(Blocks.PerfectRightNow, {
  picks: [{ id: "near" }],
  places,
  durablePlaces: [places[0]],
  context: wet,
  nowMs: Date.UTC(2026, 6, 26, 18),
})) === "", "a one-item Right now result is suppressed rather than presented as a shortlist");

const card = renderToStaticMarkup(createElement(Card, {
  place: { ...places[0], photoRef: "places/abc/photos/def", priceLevel: 2 },
  rank: 1, href: "/p/inside", editorial: "A museum locals use when the afternoon sky opens up.",
}));
for (const needle of ["Rank 1", "The Gallery", "WAYFIND", "650 reviews", "Moderate", "Top Activities pick", "Save", "Like The Gallery", "Not for me", "Share"]) {
  ok(card.includes(needle), `iconic card renders '${needle}'`);
}
// v6.88 (owner): the card used to stamp the page's own eyebrow ("Best of",
// "Hidden gems", "Trending now", ...) onto every single row as an inert,
// non-interactive span — not about the place, not clickable, just the list's
// own name repeated on each card for no reason. Locked out for good: the
// prop is gone from the component signature, not just unused at this callsite.
ok(!Object.prototype.hasOwnProperty.call(Card, "intentLabel"), "IconicPlaceCard's own export carries no intentLabel trace");
// Match real code usage (prop destructure or JSX render), not prose — this
// comment block itself says "intentLabel" in explanation, which a bare
// substring match would trip on. Same trap check-no-llm-in-render-path.mjs
// already warns about: a policy comment matching its own regex.
ok(!/intentLabel\s*[,}=]/.test(readFileSync(path.join(ROOT, "app/components/IconicPlaceCard.js"), "utf8")), "IconicPlaceCard never re-adds the dead per-card eyebrow chip");
for (const f of ["app/components/IntentPageClient.js", "app/components/TrendingNowClient.js"]) {
  ok(!/intentLabel=/.test(readFileSync(path.join(ROOT, f), "utf8")), `${f} does not pass intentLabel into IconicPlaceCard`);
}
for (const klass of ["wf-place-card", "wf-place-card-layout", "wf-place-card-score", "wf-place-card-actions", "wf-place-card-save", "wf-place-card-like", "wf-place-card-dislike", "wf-place-card-share"]) {
  ok(new RegExp(`class="[^"]*\\b${klass}\\b`).test(card), `iconic card uses canonical home class '${klass}'`);
}
const iconicSource = readFileSync(path.join(ROOT, "app/components/IconicPlaceCard.js"), "utf8");
ok(card.includes("wf-sheet-card-actions"), "standalone sheet cards use the premium single-row action layout");
// v8.29 — THE RULE, not the expression. This asserted the literal
// `aria-pressed={!!saved}`. When the card began resolving its saved state
// through its own fallback store (lib/cardActions.js) the expression became
// `aria-pressed={isSavedNow}` and this failed — a check about STATEFULNESS
// broken by a rename that kept the control stateful. Seventh time this suite
// has pinned punctuation instead of behaviour; see v8.27's note on
// test-first-screen.mjs. Now: the save control is a button that announces a
// pressed state, whatever the card computes that state from.
const saveControl = iconicSource.slice(iconicSource.indexOf('"wf-place-card-save"'), iconicSource.indexOf('"wf-place-card-save"') + 600);
ok(iconicSource.includes("onSave") && /aria-pressed=\{[^}]+\}/.test(saveControl), "sheet cards expose a stateful save control");
ok(card.includes("data-card-opens-detail"), "the iconic card body opens the full place detail");
ok(iconicSource.includes('target.closest("a,button,input,select,textarea,[role=\'button\']")'), "card opening excludes its buttons, links, chips, and controls");
ok(!card.includes("View place") && !card.includes("minHeight:228"), "iconic card does not reintroduce the tall imitation footer");

const intentSource = readFileSync(path.join(ROOT, "app/components/IntentPageClient.js"), "utf8");
ok(!intentSource.includes("titleBottom={loc.city}"), "the client never appends city unconditionally");
ok(intentSource.includes("<CollectionFilter") && intentSource.includes('from "./CollectionFilter"'), "the ranking keeps the shared functional filter");
const filterSource = readFileSync(path.join(ROOT, "app/components/CollectionFilter.js"), "utf8");
ok(filterSource.includes('type="range"') && filterSource.includes("wf-collection-radius"), "the shared collection filter uses the premium distance slider");
ok(!filterSource.includes("[17, 30, 60].map"), "the old three-button distance selector cannot return");
ok(intentSource.includes("<IconicPlaceCard"), "intent rankings use the iconic card instead of thin rows");
ok(intentSource.includes("persistSave") && intentSource.includes("recordTasteSignal(\"save\"") && intentSource.includes("recordTasteSignal(\"share\""), "intent save and share actions feed the shared persistence and taste loop");
ok(!intentSource.includes('?action=like"; return') && !intentSource.includes('?action=dislike"; return'), "signed-out intent reactions stay in place and learn on-device");
const trendingSource = readFileSync(path.join(ROOT, "app/components/TrendingNowClient.js"), "utf8");
ok(trendingSource.includes("persistSave") && trendingSource.includes("recordTasteSignal(\"share\""), "trending sheet actions feed the same shared persistence and taste loop");
ok(intentSource.indexOf("areaCtx.headline_context") > intentSource.indexOf("<details"), "metro prose lives only in collapsed About city content below the list");
ok(intentSource.includes("footerSlot={<ScoreDisclosure />}") && !intentSource.includes("<Methodology />"), "intent sheets render one glass-box disclosure instead of a duplicate methodology line");

const disclosure = renderToStaticMarkup(createElement(Blocks.ScoreDisclosure));
ok(disclosure.includes("The glass-box score") && disclosure.includes("published editorial opinion"), "the disclosure states the glass-box policy and editorial-opinion framing");
ok(disclosure.includes('href="/how-wayfind-ranks"'), "the disclosure links to the published ranking method");

const experienceSource = readFileSync(path.join(ROOT, "app/components/screens/Experience.js"), "utf8");
ok((experienceSource.match(/<ScoreDisclosure\s*\/>/g) || []).length === 1 && !experienceSource.includes("<Methodology />"), "category sheets also render exactly one glass-box disclosure");

const rankedSource = readFileSync(path.join(ROOT, "app/components/RankedExperiencePage.js"), "utf8");
ok(rankedSource.includes("WF_PLACE_CARD_CSS"), "ranked sheets load the exact shared home place-card CSS");
ok(rankedSource.includes('prefix="wf-intent-editorial"'), "intent sheets use a separate editorial prefix from the untouched beach sheet");

const intentPagesSource = readFileSync(path.join(ROOT, "lib/intentPages.js"), "utf8");
ok((intentPagesSource.match(/tonight-alfonso-scarpa-unsplash\.jpg/g) || []).length === 2, "tonight page and share card use the supplied Alfonso Scarpa image");

if (fails.length) {
  console.error(`test-intent-header-clarity: FAIL — ${fails.length}/${n}`);
  for (const failure of fails) console.error("  · " + failure);
  process.exit(1);
}
console.log(`test-intent-header-clarity: OK — ${n} assertions (3 regression titles, 8 category headers, current reasons, one glass-box disclosure, iconic cards, filter, 390px contract)`);
