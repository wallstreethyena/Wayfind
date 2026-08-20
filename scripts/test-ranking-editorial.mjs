// scripts/test-ranking-editorial.mjs — ranking rows consume sourced editorial.
// Star count is not the reason sentence (docs/editorial-standard.md).
import { readFileSync } from "fs";
import { GOOGLE_NUMBER_PROSE } from "../lib/editorialRule.js";
import { toHookLine } from "../lib/editorialHook.js";
import { rankingWhyLine, sourcedRankingWhy } from "../lib/rankingWhy.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const s = readFileSync(new URL("../lib/landing.js", import.meta.url), "utf8");
const code = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
ok(s.includes("async function landingEditorials"), "the verified-editorial join exists");
ok(s.includes("verified=is.true&select=place_id,hook,why_here,local_tip"), "it reads the verified Wayfind cards");
ok(/eds\[p\.id\] && eds\[p\.id\]\.why_here \? eds\[p\.id\]\.why_here : whyLine/.test(s), "why_here REPLACES the fallback where an editorial exists");
ok(/eds\[p\.id\] && eds\[p\.id\]\.hook \?/.test(s), "the hook renders as the row subtitle");
ok(/eds\[p\.id\] && eds\[p\.id\]\.local_tip/.test(s), "local_tip renders as the insider line");

// whyLine must not assemble a reason from rating/reviews. Assert the
// declaration body, then EXECUTE the function — a regex that only looks
// for the old template would go green if the sentence moved next door.
const wlDecl = code.match(/export function whyLine\s*\([\s\S]*?\n\}/);
ok(wlDecl && wlDecl[0].length > 40, "whyLine declaration is findable after comment-strip");
ok(wlDecl && !/\$\{p\.rating\}★ across/.test(wlDecl[0]), "whyLine does not template a star-count sentence");
ok(wlDecl && !/\$\{p\.rating\}★ from/.test(wlDecl[0]), "whyLine does not template the thinner star-count sentence");
ok(wlDecl && !/proven local favorite/.test(wlDecl[0]), "whyLine does not fall back to 'proven local favorite'");
ok(wlDecl && !/a true local/.test(wlDecl[0]), "whyLine does not invent 'a true local {kind}'");
ok(/rankingWhyLine\(p\)/.test(code), "whyLine delegates to rankingWhyLine — one renderer, callable without JSX");

const home = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
ok(/whyLine\(\{\s*\.\.\.place,\s*distMi:\s*null\s*\},\s*"spot"\)/.test(home),
  "the homepage ranked-line renderer still goes through whyLine");
ok(!/\$\{[^}]*rating[^}]*\}★ across/.test(home),
  "the homepage ranked-line renderer does not assemble a star-count sentence");

// EXECUTE — the compressor and the ranking renderer, on real product copy.
// Empty-slot law is proven on a name we verify is ABSENT from Atlas — never
// on a live venue. Pinning "Oar & Iron" (etc.) as permanently blank breaks
// the moment Editorial ships a real card (#850).
const atlasCards = JSON.parse(readFileSync(new URL("../data/atlas/editorial-cards.json", import.meta.url), "utf8"));
ok(Array.isArray(atlasCards) && atlasCards.length > 0,
  "Atlas cards are readable — consume-whyGo and the empty control both need the file");
const nn = (s) => String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const atlasByNormName = new Map();
for (const c of atlasCards) {
  const k = nn(c.name);
  if (k && !atlasByNormName.has(k)) atlasByNormName.set(k, c);
}
ok(!atlasByNormName.has(nn("A nameless dock")),
  "control: 'A nameless dock' is absent from Atlas — the empty assertion is about absence, not a live venue");
ok(sourcedRankingWhy({ rating: 4.8, reviews: 6058, name: "A nameless dock" }) === "",
  "stats-only place: no sourced why → nothing (never a star sentence)");

// If Atlas has whyGo, sourcedRankingWhy MUST return that compressed line.
// Do not invent a fixture sentence — compress the card that is already there.
let atlasConsumed = 0;
for (const card of atlasCards) {
  const expect = toHookLine(card.whyGo, card.name);
  if (!expect) continue;
  const got = sourcedRankingWhy({
    id: card.placeId, name: card.name, rating: 4.8, reviews: 400,
  });
  ok(got === expect,
    (card.name || card.placeId) + ": Atlas whyGo is consumed (compressed), not blanked or invented");
  atlasConsumed++;
  // Name-only is the shape #850's new cards hit first (no id on the call).
  if (atlasByNormName.get(nn(card.name)) === card) {
    ok(sourcedRankingWhy({ name: card.name, rating: 4.8, reviews: 400 }) === expect,
      (card.name || card.placeId) + ": name-only lookup consumes Atlas whyGo");
  }
}
ok(atlasConsumed > 0,
  "at least one Atlas whyGo was consumed — 0 means the loop never saw a usable card");

// Homepage Tonight's Move hid every sourced hook by omitting `take`.
const intentRail = readFileSync(new URL("../app/components/IntentRail.js", import.meta.url), "utf8");
const intentRailCode = intentRail.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
ok(/useEditorialHooks\(list\)/.test(intentRailCode),
  "IntentRail resolves hooks through the shared useEditorialHooks");
ok(/take=\{toHookLine\(hooks\[r\.id\], r\.name\)\}/.test(intentRailCode),
  "IntentRail passes the sourced take on every card, not first-card-only");
ok(!/(?:why|take)=\{[^}]*toHookLine\([^}]*\|\|/.test(intentRailCode),
  "IntentRail does not fall back from the sourced take to filler");
ok(!/take=\{[^}]*r\.editorial/.test(intentRailCode),
  "IntentRail does not render Google editorialSummary as the take");

// Cafés PlaceCard: cacheOnly CARD_SUMMARY used to ration to the top 3.
const homeApp = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(/!seeded\[p\.id\] && !blurbsInFlight\.current\.has\(p\.id\)\)\.slice\(0,\s*40\)/.test(homeApp),
  "loadBlurbs cacheOnly asks about the same 40 as known-for, not the top 3");
ok(!/!seeded\[p\.id\] && !blurbsInFlight\.current\.has\(p\.id\)\)\.slice\(0,\s*3\)/.test(homeApp),
  "loadBlurbs no longer hides cached CARD_SUMMARY behind a top-3 cap");

const siesta = sourcedRankingWhy({
  id: "ChIJjfu2YPBBw4gRo41o9hwHfmg", name: "Siesta Beach", rating: 4.8, reviews: 6058,
});
ok(siesta.length >= 20, "Siesta Beach uses Atlas whyGo (compressed)");
ok(/quartz|sand|cool/i.test(siesta), "Siesta why names the sand, not the star count");
ok(!GOOGLE_NUMBER_PROSE.test(siesta) && !/proven local favorite/i.test(siesta),
  "Siesta why is not a Google-number sentence");

const selby = sourcedRankingWhy({
  id: "ChIJPTvxtmpAw4gReToYD5mTNwE", name: "Marie Selby Botanical Gardens", rating: 4.7, reviews: 6452,
});
ok(selby.length >= 20, "Selby uses Atlas whyGo (compressed)");
ok(/epiphyte|orchid|bromeliad|air plant/i.test(selby), "Selby why names the plants, not the star count");

const cadzan = sourcedRankingWhy({
  id: "ChIJpXGK53VC24gRWMneFVtK6hY", name: "Ca' d'Zan", rating: 4.8, reviews: 3261,
});
ok(cadzan.length >= 20, "Ca' d'Zan uses Atlas whyGo (compressed)");
ok(/56 rooms|winter house|Ringling/i.test(cadzan), "Ca' d'Zan why names the house, not the star count");

const bayfront = sourcedRankingWhy({ name: "Bayfront Park", rating: 4.8, reviews: 6047 });
ok(bayfront.length >= 20, "Bayfront Park uses the curated hook already in the product");
ok(/waterfront|walking|marina|art/i.test(bayfront), "Bayfront why names the park, not the star count");

ok(sourcedRankingWhy({
  name: "Siesta Beach", why_here: "The quartz sand stays cool underfoot in August.", rating: 4.8, reviews: 900,
}) === "The quartz sand stays cool underfoot in August",
  "explicit why_here wins over Atlas and is compressed through toHookLine");

// rankingWhyLine EXECUTED — this is the function whyLine exports.
{
  const stars = rankingWhyLine({ rating: 4.8, reviews: 6058, distMi: 2.1 });
  ok(stars === "", "whyLine on a stats-only row returns empty — not a star sentence");
  ok(!GOOGLE_NUMBER_PROSE.test(stars) && !/proven local favorite/i.test(stars),
    "whyLine output never matches the banned Google-number prose");
  const sourced = rankingWhyLine({
    id: "ChIJjfu2YPBBw4gRo41o9hwHfmg", name: "Siesta Beach", rating: 4.8, reviews: 6058, distMi: null,
  });
  ok(/quartz|sand|cool/i.test(sourced), "whyLine on Siesta emits the Atlas why, not stars");
  ok(!GOOGLE_NUMBER_PROSE.test(sourced), "whyLine on Siesta is not a Google-number sentence");
  const hot = rankingWhyLine({ rating: 4.8, reviews: 900, distMi: 3.2, trending: true, trend_reason: "Popular with locals" });
  ok(hot.startsWith("🔥 Popular with locals"), "trending disclosure still leads the line");
  ok(!GOOGLE_NUMBER_PROSE.test(hot), "a trending row still does not sell stars as the reason");
}

// --- The visible page must state the METHOD, not only the promise ------------
const wl = s;
const hero = (wl.match(/<PremiumIntentHero[\s\S]*?\/>/) || [""])[0];
ok(hero.length > 0, "the landing hero block is findable — every assertion below reads it");
ok(/review volume/i.test(hero) && /proximity|distance/i.test(hero),
  "the hero states the METHOD: rating weighted by review volume, then proximity");
ok(/no ads/i.test(hero) && /paid placement/i.test(hero),
  "the hero states the merit claim: no ads, no paid placement — matching what landingMetadata already tells search engines");
ok(/title=\{`The best \$\{cat\.label\.toLowerCase\(\)\} in \$\{city\.name\}, \$\{city\.state\}/.test(wl),
  "the H1 carries city.state, matching landingMetadata's <title> and the canonical");
ok(/`Best \$\{cat\.label\} in \$\{city\.name\}, \$\{city\.state\}/.test(wl),
  "…and landingMetadata's <title> still carries it too, so the two cannot drift apart");
console.log(`test-ranking-editorial: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
