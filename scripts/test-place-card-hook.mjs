#!/usr/bin/env node
/**
 * test-place-card-hook — place-card editorial is the place's sourced why-go.
 *
 * THE BUG (owner, 2026-08-20, live gowayfind.com birthday / THE LOCAL EDIT):
 * AMC Bradenton 20, Nothing Bundt Cakes, and Baskin-Robbins cards repeated
 * the article (popcorn / Bundtlet / birthday coupon). Occasion surfaces had
 * been passing pick.blurb / birthdayWhy / summerWhy into IconicPlaceCard's
 * editorial slot, and the card painted the raw prop.
 *
 * THE LAW: the card hook is Atlas knownFor/whyGo / wf_editorial / curated
 * only. Deal/theme copy stays in the article. No sourced why → empty slot.
 * Never invent. Never fill with the blog sentence. Global — every surface
 * that renders a place card, not an AMC denylist. IconicPlaceCard runs
 * toHookLine on `editorial` so a leaked host-page sentence cannot paint.
 *
 * ASSERTED ON THE CALL (AGENTS.md / CLAUDE.md): placeCardHook is imported
 * and executed against the AMC deal string and a real Atlas whyGo. A regex
 * over the helper body would pass while still forwarding birthdayWhy.
 */
import { readFileSync } from "fs";
import { GUIDES } from "../lib/guides.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toHookLine, isUsableCardHook, hostThemeOverlaps } from "../lib/editorialHook.js";
import { placeCardHook, sourcedRankingWhy, sourcedWhyText } from "../lib/rankingWhy.js";
import { loadComponent } from "./lib/jsxLoad.mjs";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

ok(/export function placeCardHook\s*\(/.test(read("lib/rankingWhy.js")),
  "lib/rankingWhy.js DECLARES placeCardHook (declaration position, not a mention)");

const birthday = GUIDES["birthday-freebies-bradenton-sarasota"];
ok(birthday && Array.isArray(birthday.picks) && birthday.picks.length > 0,
  "birthday-freebies guide is loadable — the article-vs-card assertions need the real picks");
const amcPick = (birthday.picks || []).find((p) => /AMC Bradenton 20/i.test(p.name || ""));
ok(amcPick && amcPick.placeId && /popcorn/i.test(amcPick.blurb || ""),
  "control: the birthday guide still has the AMC popcorn sentence IN THE ARTICLE");
const AMC_DEAL = String(amcPick && amcPick.blurb || "").trim();
ok(AMC_DEAL.length >= 40 && /Stubs Insider/i.test(AMC_DEAL),
  "the live AMC deal string is the one that shipped on the card");

const atlasCards = JSON.parse(readFileSync(new URL("../data/atlas/editorial-cards.json", import.meta.url), "utf8"));
ok(Array.isArray(atlasCards) && atlasCards.length > 0,
  "Atlas cards are readable — empty-slot and consume-whyGo both need the file");
const atlasIds = new Set(atlasCards.map((c) => c && c.placeId).filter(Boolean));
const atlasNames = new Set(atlasCards.map((c) => String((c && c.name) || "").toLowerCase()));
ok(!atlasIds.has(amcPick.placeId) && !atlasNames.has("amc bradenton 20"),
  "control: AMC Bradenton 20 is absent from Atlas — empty is about absence, not a live venue we blanked");

// WHEN THE ONLY TEXT IS THE OCCASION PROMO — promo must not become the hook.
const amcPlace = {
  id: amcPick.placeId,
  name: "AMC Bradenton 20",
  birthdayWhy: AMC_DEAL,
  summerWhy: AMC_DEAL,
  pickReason: AMC_DEAL,
  blurb: AMC_DEAL,
};
ok(placeCardHook(amcPlace) === "",
  "AMC with only the popcorn deal on occasion fields → empty card hook (promo is not the hook)");
ok(placeCardHook({ name: "AMC Bradenton 20", blurb: AMC_DEAL }) === "",
  "name-only AMC + deal blurb → empty — pick.blurb is not a sourced why");
ok(!/popcorn|Stubs|birthday/i.test(placeCardHook(amcPlace)),
  "AMC hook output does not contain the deal sentence");

// WHEN A PLACE WHY EXISTS — deal/occasion fields cannot win.
const SIESTA_ID = "ChIJjfu2YPBBw4gRo41o9hwHfmg";
const siestaClean = sourcedRankingWhy({ id: SIESTA_ID, name: "Siesta Beach" });
ok(siestaClean.length >= 20 && /quartz|sand|cool/i.test(siestaClean),
  "control: Siesta has a real Atlas whyGo — the stuffed-deal case needs a positive");
const siestaStuffed = placeCardHook({
  id: SIESTA_ID,
  name: "Siesta Beach",
  birthdayWhy: AMC_DEAL,
  summerWhy: AMC_DEAL,
  pickReason: AMC_DEAL,
  blurb: AMC_DEAL,
});
ok(siestaStuffed === siestaClean,
  "Siesta + stuffed deal/occasion fields → Atlas why, not the popcorn sentence");
ok(!/popcorn|Stubs Insider/i.test(siestaStuffed),
  "sourced why is not replaced by AMC-style deal text");
ok(siestaStuffed === toHookLine(sourcedWhyText({ id: SIESTA_ID, name: "Siesta Beach" }), "Siesta Beach"),
  "Siesta hook is the compressed Atlas whyGo — same compressor the card uses");

// Nothing Bundt + Baskin-Robbins — owner screenshots, 2026-08-20. Same
// empty-slot law as AMC. Do not special-case one bakery.
const bundtPick = (birthday.picks || []).find((p) => /Nothing Bundt/i.test(p.name || ""));
ok(bundtPick && /Bundtlet/i.test(bundtPick.blurb || "") && /on this page/i.test(bundtPick.blurb || ""),
  "control: Nothing Bundt deal copy still lives in the article");
ok(toHookLine(bundtPick.blurb, "Nothing Bundt Cakes") === "",
  "toHookLine blanks the Bundtlet article sentence — not a place why-go");
ok(placeCardHook({
  id: bundtPick.placeId, name: "Nothing Bundt Cakes", blurb: bundtPick.blurb, birthdayWhy: bundtPick.blurb,
}) === "",
  "Nothing Bundt with only the Bundtlet promo → empty card hook (do not invent a why)");
ok(placeCardHook({ id: bundtPick.placeId, name: "Nothing Bundt Cakes" }, bundtPick.blurb) === "",
  "Nothing Bundt sourced hook + host article → still empty (no Atlas why to inherit)");

const brPick = (birthday.picks || []).find((p) => /Baskin-Robbins/i.test(p.name || ""));
ok(brPick && /birthday coupon/i.test(brPick.blurb || ""),
  "control: Baskin-Robbins deal copy still lives in the article");
ok(toHookLine(brPick.blurb, "Baskin-Robbins") === "",
  "toHookLine blanks the BR birthday-coupon article sentence");
ok(placeCardHook({
  id: brPick.placeId, name: "Baskin-Robbins", blurb: brPick.blurb, birthdayWhy: brPick.blurb,
}) === "",
  "Baskin-Robbins with only the coupon sentence → empty card hook");
ok(hostThemeOverlaps(String(brPick.blurb).slice(0, 80), brPick.blurb) === true,
  "hostThemeOverlaps: a card hook that is a slice of the article is inherited theme");

// EVERY birthday pick — not an AMC/Bundt denylist. Article blurb is never
// the card hook. Stuffing it onto the place object cannot change the hook.
ok(birthday.picks.length >= 20, "birthday guide still has the full pick set — a short walk is not the claim");
let birthdayWalk = 0;
for (const pick of birthday.picks) {
  const name = String(pick.name || "").split(":")[0].trim();
  ok(toHookLine(pick.blurb, name) === "",
    `${name}: article blurb is not a usable card hook`);
  const sourced = placeCardHook({ id: pick.placeId, name });
  const stuffed = placeCardHook({
    id: pick.placeId, name, blurb: pick.blurb, birthdayWhy: pick.blurb, pickReason: pick.blurb, summerWhy: pick.blurb,
  }, [pick.blurb, pick.tip]);
  ok(stuffed === sourced,
    `${name}: stuffing article/occasion fields does not change the card hook`);
  ok(!hostThemeOverlaps(stuffed, pick.blurb),
    `${name}: card hook is not a slice of the article`);
  birthdayWalk++;
}
ok(birthdayWalk === birthday.picks.length,
  `birthday walk ran ${birthdayWalk} times against ${birthday.picks.length} picks — a loop that ran 0 is not a walk`);

// ── address/hours junk is not a hook (Tonight's Move / Oar & Iron) ────────
// #861 educated the LIVE Atlas row. Pin the PRE-#861 junk as a fixture so
// this guard stays red if the blanking rule dies, and stays green when
// Editorial ships a real plate hook. Do not rewrite Atlas in this PR.
const OAR_ID = "ChIJZW-6RgAjw4gRDVp3TtAFsaM";
const OAR_JUNK_KNOWN = "Parrish Raw Bar & Grill at 8710 US 301-N, Unit 120; official hours end 9 / Fri–Sat 10";
const OAR_JUNK_WHY = "Oar & Iron is the Parrish Raw Bar & Grill at 8710 US 301-N, Unit 120 — not the Naples or Fort Myers rooms. Official Parrish hours print Sunday–Thursday 11:30 a.m. to 9:00 p.m. and Friday–Saturday 11:30 a.m. to 10:00 p.m. The allowed Observer of 18 December 2025 is sponsored copy that already says the room is now open in Parrish too.";
ok(isUsableCardHook(OAR_JUNK_KNOWN, "Oar & Iron") === false,
  "the pre-#861 Oar & Iron knownFor fixture fails the usable-hook test");
ok(toHookLine(OAR_JUNK_KNOWN, "Oar & Iron") === "",
  "toHookLine blanks the pre-#861 knownFor fixture — empty-slot, no invented replacement");
ok(toHookLine(OAR_JUNK_WHY, "Oar & Iron") === "",
  "toHookLine blanks the pre-#861 whyGo fixture too (same address/hours research)");
ok(placeCardHook({ name: "Oar & Iron", whyGo: OAR_JUNK_WHY, hook: OAR_JUNK_KNOWN }) === "",
  "placeCardHook blanks the pre-#861 address/hours fixture — empty-slot, no invented replacement");
const oarCard = atlasCards.find((c) => c && c.placeId === OAR_ID);
ok(oarCard && /oysters with mignonette/i.test(oarCard.knownFor || ""),
  "live Atlas Oar & Iron knownFor is the #861 plate hook — do not treat the live row as junk");
ok(isUsableCardHook(oarCard.knownFor, oarCard.name) === true,
  "live #861 Oar & Iron knownFor is a usable card hook (it educates)");
const oarLive = placeCardHook({ id: OAR_ID, name: "Oar & Iron" });
ok(oarLive.length >= 20 && !/8710|Unit 120|official hours/i.test(oarLive),
  "placeCardHook(Oar & Iron) ships the sourced #861 hook, not the old address/hours line");
ok(isUsableCardHook(AMC_DEAL, "AMC Bradenton 20") === false,
  "the birthday popcorn offer sentence is not a usable card hook");
ok(toHookLine(AMC_DEAL, "AMC Bradenton 20") === "",
  "toHookLine blanks the host-page offer sentence");
ok(isUsableCardHook(siestaClean, "Siesta Beach") === true,
  "Siesta's compressed Atlas why stays usable — the gate must not fire on correct copy");

// ── house bar (owner lock, 2026-08-20) — The Cracked Pepper Cafe ──────────
// GLOBAL. Two-beat: one sourced distinction + one physical why-sit. The gold
// line is a live card take. Do not invent Cracked Pepper (or any) replacement
// copy. Do not rewrite Atlas. See docs/wayfind/PRODUCT_TRUTH.md.
const CRACKED_PEPPER_GOLD =
  "Winner of the 2023 Cuban Sandwich Festival's World's Best award, with a patio that overlooks a pond.";
const CRACKED_PEPPER_GOLD_LINE =
  "Winner of the 2023 Cuban Sandwich Festival's World's Best award, with a patio that overlooks a pond";
ok(/Cuban Sandwich Festival's World's Best/.test(read("docs/wayfind/PRODUCT_TRUTH.md")) &&
   /two-beat/i.test(read("docs/wayfind/PRODUCT_TRUTH.md")),
  "PRODUCT_TRUTH states the two-beat house bar and names the gold example");
ok(/Cuban Sandwich Festival's World's Best/.test(read("docs/editorial-standard.md")),
  "the editorial standard states the gold example where writers already look");
ok(/Cuban Sandwich Festival's World's Best/.test(read("lib/editorialHook.js")),
  "the usable-hook gate comment names the gold example (writers hit the gate)");
ok(isUsableCardHook(CRACKED_PEPPER_GOLD, "The Cracked Pepper Cafe") === true,
  "the Cracked Pepper gold line PASSES isUsableCardHook — it is the house bar and must still render");
ok(toHookLine(CRACKED_PEPPER_GOLD, "The Cracked Pepper Cafe") === CRACKED_PEPPER_GOLD_LINE,
  "toHookLine ships the gold line intact — do not blank or invent a replacement");
ok(placeCardHook({ name: "The Cracked Pepper Cafe", hook: CRACKED_PEPPER_GOLD }) === CRACKED_PEPPER_GOLD_LINE,
  "placeCardHook ships the gold line — ranking/source path unchanged");

// EDITORIAL LAW: a plate-list-only line WITHOUT a why-sit is NOT the house bar.
// Documented here and in PRODUCT_TRUTH. Do NOT make isUsableCardHook auto-blank
// comma-separated plate lists — that would empty #861–#874 overnight with no
// sourced replacement. Empty-slot for junk stays. Tightening is Editorial's job.
const PLATE_LIST_ONLY = "Center-cut filet, potato-crusted grouper, and oysters";
ok(/plate-list-only line without a why-sit is not the house bar/i.test(read("docs/wayfind/PRODUCT_TRUTH.md")),
  "PRODUCT_TRUTH names plate-list-only (no why-sit) as not the house bar");
ok(isUsableCardHook(PLATE_LIST_ONLY, "X") === true,
  "plate-list-only still PASSES isUsableCardHook — do not auto-blank comma plate lists");
ok(toHookLine(PLATE_LIST_ONLY, "X") === PLATE_LIST_ONLY,
  "toHookLine still ships a plate-list — tightening is Editorial's job, not a gate");

// ── call sites: article keeps the promo, card does not ─────────────────────
const guidePage = read("app/guides/[slug]/page.js");
const guideCode = code("app/guides/[slug]/page.js");
ok(/import\s*\{[^}]*\bplaceCardHook\b[^}]*\}\s*from\s*["'][^"']*rankingWhy/.test(guideCode),
  "guide page imports placeCardHook from rankingWhy");
ok(/editorial=\{placeCardHook\(resolved,\s*\[pick\.blurb,\s*pick\.tip\]\)\s*\|\|\s*null\}/.test(guideCode),
  "guide page CALLS placeCardHook(resolved, [pick.blurb, pick.tip]) — sourced why, blanked if it is the article");
ok(!/editorial=\{pick\.blurb/.test(guideCode),
  "guide page does not pass pick.blurb as the card editorial");
ok(/<p style=\{S\.p\}>\{pick\.blurb\}<\/p>/.test(guideCode),
  "occasion/deal copy stays in the article body ({pick.blurb})");

const railCode = code("app/components/DaypartRail.js");
// v8.66 — the chef and augtober drops carry their OWN sourced editorial
// (Ron's whyWorthTheTrip testimony; the owner-verified fall take), so the
// expression branches: those two drops read p.hook, every other drop keeps
// the sourced toHookLine or nothing. Occasion copy stays banned either way.
// v8.69 — the PAID rail card joins the same branch, and the assertion followed
// the code rather than being loosened. It belongs there on the identical
// grounds as chef/augtober: `p.hook` is a line WAYFIND wrote (the registry's
// `railTake`, which is wf_events.card_hook for that row), not the advertiser's
// ad copy. A paid slot buys position; it does not buy the take.
//
// That last claim is the one worth being nervous about, so it is not left to
// this regex: check-sponsored-places.mjs asserts BY VALUE that the rendered
// hook equals railTake and differs from the sponsor's own `headline`/`body`.
// This line proves the wiring; that one proves the content.
ok(/editorial=\{\(isPaid \|\| selected === "chef" \|\| selected === "augtober"\) \? \(p\.hook \|\| null\) : \(toHookLine\(hooks\[p\.id\], p\.name\) \|\| null\)\}/.test(railCode),
  "DaypartRail card editorial is the sourced hook (or the curated drops' / paid card's own sourced line) or nothing");
ok(!/\|\|\s*p\.summerWhy/.test(railCode) && !/\|\|\s*p\.birthdayWhy/.test(railCode),
  "DaypartRail does not fall back to summerWhy/birthdayWhy as the card hook");

// The homepage LocalEdit section is guide LINKS, not place cards — assert
// that so a future card slot cannot silently re-open this leak there.
ok(!/<(?:IconicPlaceCard|GuidePlaceCard)[\s/>]/.test(code("app/components/LocalEdit.js")),
  "homepage LocalEdit does not render a place card (it links to guides)");

ok(typeof placeCardHook(null) === "string" && placeCardHook(null) === "",
  "placeCardHook is total over null");
ok(placeCardHook({}) === "",
  "placeCardHook on an empty place is empty — never filler");

// ── IconicPlaceCard is the global lock (every surface that renders a card) ─
const iconicCode = code("app/components/IconicPlaceCard.js");
ok(/import\s*\{[^}]*\btoHookLine\b[^}]*\}\s*from\s*["'][^"']*editorialHook/.test(iconicCode),
  "IconicPlaceCard imports toHookLine from editorialHook");
ok(/toHookLine\(editorial, place\.name\)/.test(iconicCode),
  "IconicPlaceCard CALLS toHookLine(editorial, place.name) — a leaked pick.blurb cannot paint");
ok(/\{take \? \(/.test(iconicCode) || /take \? \(/.test(iconicCode),
  "IconicPlaceCard renders the filtered take, not the raw editorial prop");
ok(!/wf-place-card-take\}>\{editorial\}/.test(iconicCode) && !/wf-place-card-take">\{editorial\}/.test(iconicCode),
  "IconicPlaceCard does not render raw {editorial} into the take slot");

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
const cardMod = await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT);
const Card = cardMod.default;
const fixture = (name, id) => ({
  id, name, rating: 4.5, reviews: 200, types: ["bakery"],
  governed_score: 80, lat: 27.4, lng: -82.5,
});
const bundtHtml = renderToStaticMarkup(React.createElement(Card, {
  place: fixture("Nothing Bundt Cakes", bundtPick.placeId),
  rank: 4,
  href: "/p/x",
  editorial: bundtPick.blurb,
}));
ok(bundtHtml.includes("wf-place-card"),
  "positive: IconicPlaceCard rendered (a miss must not read as a blank take)");
ok(!/Bundtlet|Bundtastic|on this page/i.test(bundtHtml),
  "RENDER: Nothing Bundt card with editorial={article blurb} does not paint the Bundtlet sentence");
ok(!bundtHtml.includes("wf-place-card-take") || !/simplest offer/i.test(bundtHtml),
  "RENDER: Bundt take slot does not carry the host-page offer");

const brHtml = renderToStaticMarkup(React.createElement(Card, {
  place: fixture("Baskin-Robbins", brPick.placeId),
  rank: 5,
  href: "/p/y",
  editorial: brPick.blurb,
}));
ok(brHtml.includes("wf-place-card"),
  "positive: Baskin-Robbins IconicPlaceCard rendered");
ok(!/birthday coupon|BR app drops/i.test(brHtml),
  "RENDER: Baskin-Robbins card with editorial={article blurb} does not paint the coupon sentence");

const siestaHtml = renderToStaticMarkup(React.createElement(Card, {
  place: { ...fixture("Siesta Beach", SIESTA_ID), types: ["beach"] },
  rank: 1,
  href: "/p/z",
  editorial: siestaClean,
}));
ok(/quartz|sand|cool/i.test(siestaHtml) && siestaHtml.includes("wf-place-card-take"),
  "RENDER positive: a real why-go still paints on IconicPlaceCard — the lock must not blank correct copy");

const goldHtml = renderToStaticMarkup(React.createElement(Card, {
  place: fixture("The Cracked Pepper Cafe", "ChIJ-cracked-pepper-gold"),
  rank: 2,
  href: "/p/gold",
  editorial: CRACKED_PEPPER_GOLD,
}));
ok(goldHtml.includes("wf-place-card"),
  "positive: Cracked Pepper IconicPlaceCard rendered (a miss must not read as a blank take)");
ok(goldHtml.includes("wf-place-card-take") && /Cuban Sandwich Festival/.test(goldHtml) && /patio that overlooks a pond/.test(goldHtml),
  "RENDER: the Cracked Pepper gold line still paints — the house bar must not go empty");

if (failn) {
  console.error(`test-place-card-hook: FAIL — ${failn}/${n} assertions`);
  process.exit(1);
}
console.log(`test-place-card-hook: OK — ${n} assertions (placeCardHook CALLED on AMC/Bundt/BR + every birthday pick; IconicPlaceCard RENDERED against article blurbs; guide/rail call sites locked)`);
