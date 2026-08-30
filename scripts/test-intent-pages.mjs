// scripts/test-intent-pages.mjs — locks the intent-page rules (owner):
// the family distance decay (-0.2 per started 5mi block past 17, THIS list
// only), photo-from-the-list heroes, floors, and honest why-lines.
import { readFileSync } from "fs";
import { INTENT_PAGES, distanceDeduction, rankRows, toRow } from "../lib/intentPages.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };

const cfg = INTENT_PAGES.family.distancePenalty;
ok(cfg && cfg.freeMi === 17 && cfg.per === 5 && cfg.deduct === 0.2, "family decay is the owner's exact rule (17mi free, -0.2/5mi)");
const dcfg = INTENT_PAGES["date-night"].distancePenalty;
ok(dcfg && dcfg.freeMi === 27 && dcfg.per === 5 && dcfg.deduct === 0.2, "date-night free band matches the hard 27-mile radius");
ok(INTENT_PAGES["date-night"].maxMi === 27, "date-night caps membership at 27.0 miles — a 28-mile restaurant is out");
ok(distanceDeduction(17, cfg) === 0, "17 mi exactly: no deduction");
ok(Math.abs(distanceDeduction(18, cfg) - 0.2) < 1e-9, "18 mi: first block bites (-0.2)");
ok(Math.abs(distanceDeduction(22.1, cfg) - 0.4) < 1e-9, "22.1 mi: second block (-0.4)");
ok(Math.abs(distanceDeduction(47, cfg) - 1.2) < 1e-9, "47 mi: -1.2 — far places sink hard");
ok(distanceDeduction(5, cfg) === 0 && distanceDeduction(NaN, cfg) === 0, "close or unknown distance: untouched");

// ── DISTANCE, AFTER THE GOVERNING LAW (v6.63) ───────────────────────────────
//
// SUPERSEDED, DELIBERATELY. This block used to assert the opposite: that the
// banded decay above (−0.2 per started 5-mile block past 17) REORDERS the list,
// so a 4.8 at thirty miles ranked below a 4.6 at one mile.
//
// lib/wayfindScore.js's governing law (owner, 2026-08-07) replaced every
// per-mile model in the app with ONE flat, VISIBLE −0.2 past 17 miles, and made
// the displayed number the sort key: "no hidden term may ever reorder against
// the visible number again." The banded decay is a hidden term — it costs a
// 30-mile place 0.6 while its chip only ever admits 0.2 — and on this exact
// fixture it is the defect the owner photographed on 2026-08-08: the far place
// renders a chip reading 9.4, the near one 9.2, and the old rule put the 9.2
// on top. A guard asserting that a 9.2 outranks a 9.4 is a guard pinning the
// bug in place.
//
// distanceDeduction() itself is UNCHANGED and still fully locked by the
// arithmetic assertions above — it stays exported, and rankRows still stamps
// `deduction` on each row — but it no longer feeds the rank key. What is
// asserted here now is the law: distance moves a row only by moving the number
// the reader can see.
const origin = { lat: 27.5, lng: -82.5 };
const near = { id: "a", name: "Near", rating: 4.6, reviews: 3000, lat: 27.5, lng: -82.52 };  // ~1mi
const far = { id: "b", name: "Far", rating: 4.8, reviews: 5000, lat: 27.5, lng: -83.05 };    // ~30mi
const ranked = rankRows([near, far], { rating: 4.5, reviews: 500 }, { origin, penalty: cfg });
ok(ranked[0].id === "b",
  "a 4.8 at thirty miles (base 96, −2 for the drive → chip 9.4) outranks a 4.6 at one mile (chip 9.2) — the ONLY distance term is the one printed on the card");
ok(ranked.every((r, i) => i === 0 || (ranked[i - 1].governed_score ?? -Infinity) >= (r.governed_score ?? -Infinity)),
  "rankRows output is non-increasing in the governed score it stamps — shown == sorted on the intent pages");
const unranked = rankRows([near, far], { rating: 4.5, reviews: 500 }, { origin, penalty: null });
ok(unranked[0].id === "b", "with no penalty config, pure quality order holds (the rule is opt-in per list)");
ok(ranked.find((r) => r.id === "b").deduction >= 0.4, "the deduction is still carried on the row for the why-line");

// Dedicated landing pages use the same owned artwork as their homepage cards.
ok(INTENT_PAGES["date-night"].art === "/cards/date-night-owner.png", "date-night landing page matches the owner Date Night poster");
ok(INTENT_PAGES["date-night"].card.art === "/cards/date-night-owner.png", "date-night share card uses the same owner poster");
ok(INTENT_PAGES.family.art === "/cards/family-adobestock-794890098.jpeg", "family landing page matches its homepage hero card");
const ic = readFileSync(new URL("../app/components/IntentPageClient.js", import.meta.url), "utf8");
ok(ic.includes("ranked lower for the drive"), "penalized rows explain themselves");
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
// v8 (2026-08-15): the homepage half of this continuity rule moved. The family
// card is a RAIL now (lib/rails.js), not a hero slide rendered twice in
// app/home.js, so the old "appears exactly twice in home.js" count would only
// ever be 0. The rule itself is unchanged — the landing page and the homepage
// card must show the same owned artwork — and the rail additionally carries
// REGIONAL variants the hero slide never had (Orlando / rest of Florida /
// everywhere else, lib/dayparts.js regionFor). check-rail-routes.mjs proves
// every one of those files exists on disk in all three regions and all three
// formats, which is a stronger claim than counting a string.
{
  const rails = readFileSync(new URL("../lib/rails.js", import.meta.url), "utf8");
  ok(/id: "family"/.test(rails), "the family card still exists on the homepage, as a rail");
  ok(/art: "family"/.test(rails), "…with its own owned artwork");
  ok(/regional: \{ orlando: "family-orlando", fl: "family-fl" \}/.test(rails),
    "…and the regional variants the owner asked for (castle in Orlando, Florida elsewhere)");
  ok(!/family-adobestock-794890098\.jpeg/.test(home),
    "the old family hero slide is back in app/home.js — that is the family card on the page twice");
}
ok(!home.includes("setFamilyHeroImg"), "the owned family artwork no longer triggers an unused live-photo fetch");

// Shared references remain validated for metadata, while the visible landing
// hero stays locked to the owned card artwork.
ok(ic.includes("visible landing-page hero stays locked"), "the owned-art continuity rule is stated where the hero is built");
ok(ic.includes('sp.get("img")'), "landing page accepts the clicked card's own photoRef (?img=)");
ok(ic.includes("PHOTO_REF.test(v)"), "the passed ref is validated against the strict places-photo pattern");
ok(ic.includes("heroImg={def.art}"), "the visible landing hero stays locked to the matching card artwork");
ok(!ic.includes("def.heroFromList"), "landing heroes no longer repaint from live list photos");
ok(!ic.includes("w=1200"), "intent heroes respect the w=800 LCP cap");
ok(!home.includes('(familyHeroImg ? "&img=" + encodeURIComponent(familyHeroImg) : "")'), "the family card no longer overrides the owned landing-page artwork");
const bb = readFileSync(new URL("../app/best-beaches/[metro]/page.js", import.meta.url), "utf8");
ok(bb.includes('const heroImg = "/cards/beach-adobestock-216195684.jpeg"'), "beach landing page matches its homepage hero card");

// v6.56 (owner): brand dedupe + Wayfind-editorial-only rows + the hidden
// verification span.
{
  const a = { id: "m1", name: "Melt N Dip", rating: 4.9, reviews: 5200, lat: 27.5, lng: -82.52 };
  const b = { id: "m2", name: "Melt N Dip", rating: 4.9, reviews: 2000, lat: 27.5, lng: -82.53 };
  const c = { id: "x1", name: "Big Cat Habitat", rating: 4.6, reviews: 4400, lat: 27.5, lng: -82.54 };
  const out = rankRows([a, b, c], { rating: 4.5, reviews: 500 }, { origin: { lat: 27.5, lng: -82.5 }, penalty: null });
  ok(out.filter((r) => r.name === "Melt N Dip").length === 1, "one card per brand — duplicate branches collapse");
  ok(out.some((r) => r.id === "m1"), "the best-ranked branch is the one kept");
  const icSrc = readFileSync(new URL("../app/components/IntentPageClient.js", import.meta.url), "utf8");
  ok(icSrc.includes('.eq("verified", true).in("place_id"'), "intent rows fetch VERIFIED Wayfind hooks in one call");
  ok(icSrc.includes('"/api/known-for"'), "intent rows also read Atlas via /api/known-for so a researched whyGo is not blank");
  ok(!/!r\.editorial_hook\)\.slice\(0,\s*8\)/.test(icSrc),
    "cacheOnly CARD_SUMMARY is not rationed to the first 8 rows");
  // The real guarantee is provenance, not just render shape: r.editorial (Google's
  // editorialSummary.text, set in lib/intentPages.js toRow) must never (a) be sent
  // into the /api/blurbs payload — the model would launder it into ai_line — and
  // (b) be rendered directly. ai_line itself IS allowed in the render: it arrives
  // from /api/blurbs, whose prompt (app/api/blurbs/route.js) grounds lines ONLY on
  // curated_fact (Wayfind's hand-checked facts) and review_signals (reviewer praise
  // restated in the model's own words) — both Wayfind-authored derivations, never
  // Google's summary text, which is no longer an input at all.
  ok(!icSrc.includes("editorial: r.editorial"), "the /api/blurbs payload never sends r.editorial (Google's summary) into the model");
  ok(!icSrc.includes("editorial={r.editorial}"), "rows never render r.editorial (Google's raw summary) directly");
  // v6.87 (owner): the two props split so IconicPlaceCard can validate ai_line
  // as a { card_line_1, card_line_2 } CARD_SUMMARY instead of a bare string —
  // same provenance guarantee (verified hook wins outright; ai_line only gets
  // a chance when the hook is absent; the tail is null, never a fabricated line).
  // v7.06 — both props now read the hook through toHookLine (lib/editorialHook.js),
  // the one compressor every place surface shares. The PROVENANCE guarantee this
  // pair exists to protect is untouched: a verified hook wins outright, ai_line
  // only gets a chance when the hook is absent, and the tail is null rather than
  // a fabricated line. Both sides must test the COMPRESSED value — gating
  // aiSummary on the raw hook while rendering the compressed one would render
  // both at once whenever the compressor rejected a pending-research placeholder,
  // which is the exact "never both at once" failure named below.
  ok(icSrc.includes("editorial={toHookLine(r.editorial_hook, r.name) || null}"), "rows render verified Wayfind editorial when present, compressed through the shared toHookLine");
  ok(icSrc.includes("aiSummary={toHookLine(r.editorial_hook, r.name) ? null : r.ai_line || null}"), "else rows fall to the Wayfind-grounded ai_line, else null — never both at once");
  const lay = readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");
  ok(/Impact-Site-Verification[\s\S]{0,40}/.test(lay) ? lay.includes('style={{ display: "none" }}>Impact-Site-Verification') : true, "the Impact text span must be display:none — it was leaking as visible page text");
}

console.log(`test-intent-pages: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
