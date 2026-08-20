#!/usr/bin/env node
/**
 * test-place-card-hook — place-card editorial is the place's sourced why-go.
 *
 * THE BUG (owner, 2026-08-20, live gowayfind.com birthday / THE LOCAL EDIT):
 * AMC Bradenton 20's card repeated the article's popcorn deal sentence.
 * Occasion surfaces had been passing pick.blurb / birthdayWhy / summerWhy
 * into IconicPlaceCard's editorial slot.
 *
 * THE LAW: the card hook is Atlas knownFor/whyGo / wf_editorial / curated
 * only. Deal copy stays in the article. No sourced why → empty slot.
 * Never invent. Never fill with deal copy, "local favorite", or stars.
 *
 * ASSERTED ON THE CALL (AGENTS.md / CLAUDE.md): placeCardHook is imported
 * and executed against the AMC deal string and a real Atlas whyGo. A regex
 * over the helper body would pass while still forwarding birthdayWhy.
 */
import { readFileSync } from "fs";
import { GUIDES } from "../lib/guides.js";
import { toHookLine, isUsableCardHook } from "../lib/editorialHook.js";
import { placeCardHook, sourcedRankingWhy, sourcedWhyText } from "../lib/rankingWhy.js";

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

// Nothing Bundt — same empty-slot law, no invented dessert copy.
const bundtPick = (birthday.picks || []).find((p) => /Nothing Bundt/i.test(p.name || ""));
ok(bundtPick && /Bundtlet/i.test(bundtPick.blurb || ""),
  "control: Nothing Bundt deal copy still lives in the article");
ok(placeCardHook({
  id: bundtPick.placeId, name: "Nothing Bundt Cakes", blurb: bundtPick.blurb, birthdayWhy: bundtPick.blurb,
}) === "",
  "Nothing Bundt with only the Bundtlet promo → empty card hook (do not invent a why)");

// ── Atlas junk knownFor is not a hook (Tonight's Move / Oar & Iron) ────────
const OAR_ID = "ChIJZW-6RgAjw4gRDVp3TtAFsaM";
const oarCard = atlasCards.find((c) => c && c.placeId === OAR_ID);
ok(oarCard && /Unit 120/.test(oarCard.knownFor || "") && /official hours/i.test(oarCard.knownFor || ""),
  "control: Oar & Iron Atlas knownFor is still the address/hours line — we blank the hook, we do not rewrite Atlas");
ok(isUsableCardHook(oarCard.knownFor, oarCard.name) === false,
  "Oar & Iron knownFor fails the usable-hook test");
ok(toHookLine(oarCard.knownFor, oarCard.name) === "",
  "toHookLine blanks Oar & Iron knownFor — empty-slot, no invented replacement");
ok(toHookLine(oarCard.whyGo, oarCard.name) === "",
  "toHookLine blanks Oar & Iron whyGo too (same address/hours research)");
ok(placeCardHook({ id: OAR_ID, name: "Oar & Iron" }) === "",
  "placeCardHook(Oar & Iron) is empty — Atlas junk does not become the card hook");
ok(isUsableCardHook(AMC_DEAL, "AMC Bradenton 20") === false,
  "the birthday popcorn offer sentence is not a usable card hook");
ok(toHookLine(AMC_DEAL, "AMC Bradenton 20") === "",
  "toHookLine blanks the host-page offer sentence");
ok(isUsableCardHook(siestaClean, "Siesta Beach") === true,
  "Siesta's compressed Atlas why stays usable — the gate must not fire on correct copy");

// ── call sites: article keeps the promo, card does not ─────────────────────
const guidePage = read("app/guides/[slug]/page.js");
const guideCode = code("app/guides/[slug]/page.js");
ok(/import\s*\{[^}]*\bplaceCardHook\b[^}]*\}\s*from\s*["'][^"']*rankingWhy/.test(guideCode),
  "guide page imports placeCardHook from rankingWhy");
ok(/editorial=\{placeCardHook\(resolved\)\s*\|\|\s*null\}/.test(guideCode),
  "guide page CALLS placeCardHook(resolved) as the card editorial");
ok(!/editorial=\{pick\.blurb/.test(guideCode),
  "guide page does not pass pick.blurb as the card editorial");
ok(/<p style=\{S\.p\}>\{pick\.blurb\}<\/p>/.test(guideCode),
  "occasion/deal copy stays in the article body ({pick.blurb})");

const railCode = code("app/components/DaypartRail.js");
ok(/editorial=\{toHookLine\(hooks\[p\.id\], p\.name\)\s*\|\|\s*null\}/.test(railCode),
  "DaypartRail card editorial is the sourced hook or nothing");
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

if (failn) {
  console.error(`test-place-card-hook: FAIL — ${failn}/${n} assertions`);
  process.exit(1);
}
console.log(`test-place-card-hook: OK — ${n} assertions (placeCardHook CALLED on AMC deal + stuffed Siesta why; guide/rail call sites locked; article keeps the promo)`);
