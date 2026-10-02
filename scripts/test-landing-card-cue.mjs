#!/usr/bin/env node
// scripts/test-landing-card-cue.mjs — ranked landing cards: one line ON the
// card, a truthful "Why Wayfind picked it ›" cue, and a direct /p/{id} door.
//
// Owner, 2026-10-01 (/nightlife/parrish): the long "Why it fits" paragraph and
// loose "Insider" line under each card were not premium. The line now lives on
// the card; the full read lives in the place view (/p/{id} -> /api/editorial
// -> Detail's WayfindTakeRail). This guard RENDERS the real card and CALLS the
// real place-view mappers:
//   1. card + cue link to /p/{id} (via landingCardHref), never a name search
//   2. cue only under a real take; missing take renders cleanly (no cue, no slot)
//   3. no nested <a> (the cue is a sibling link, not inside the name link)
//   4. Save / Share stop propagation — they never also open the place
//   5. the cue is TRUTHFUL: it is gated on hasPlaceViewEditorial, which is
//      true for a verified fleet row or an Atlas card and FALSE for a curated
//      one-liner the place view does not serve
//   6. the fields that left the landing (why_here -> "Why go", local_tip ->
//      "Insider move") render in the place view's rail for representative
//      fleet + Atlas records
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { landingCardHref } from "../lib/placeCardRoute.js";
import { hasPlaceViewEditorial } from "../lib/rankingWhy.js";
import { mapWfEditorial } from "../lib/editorialRule.js";
import { cardToEditorial } from "../lib/atlasCards.js";
import { hasSourcedEditorialFields } from "../lib/editorialLookup.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = (m) => { console.error("test-landing-card-cue: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

const Card = (await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT)).default;
const CUE = "Why Wayfind picked it";
const render = (place, editorial, more) => renderToStaticMarkup(React.createElement(Card, {
  place, rank: 2, href: landingCardHref(place), editorial, editorialTier: "known",
  editorialMore: more, surface: "seo_landing",
}));
const DRAC = { id: "ChIJw8yuv53hwogRivnj0XblR-k", name: "Dracula's Legacy Wine Bar & Bistro", rating: 4.7, reviews: 954, distMi: 18, types: ["bar"] };
const SPC = { id: "ChIJkeB3AiDhwogRFErS2ugR_58", name: "St. Pete Comedy Club", rating: 4.8, reviews: 653, distMi: 19, types: ["night_club"] };
const TAKE = "A Romanian family's wine bar that themes itself on the real Vlad the Impaler";

// 1 + 2 — approved line renders, cue present, direct /p/{id} route.
{
  const html = render(DRAC, TAKE, CUE);
  ok(html.includes("Vlad the Impaler"), "approved short line renders on the card");
  ok(html.includes(CUE), "cue renders under a real take");
  ok(/class="wf-place-card-more" href="\/p\/ChIJw8yuv53hwogRivnj0XblR-k"/.test(html), "cue links to the canonical /p/{id}");
  ok(/class="wf-place-card-name" href="\/p\/ChIJw8yuv53hwogRivnj0XblR-k"/.test(html), "card name links to the canonical /p/{id}");
  ok(!html.includes("/?q="), "no place-name search fallback for a card with an id");
  ok(/class="wf-place-card[^"]*\bhas-more\b/.test(html), "has-more class gives the take its 2-line clamp");
  // 3 — no nested anchors anywhere in the card.
  let depth = 0, nested = false;
  for (const m of html.matchAll(/<a\b|<\/a>/g)) { if (m[0] === "</a>") depth--; else { if (depth > 0) nested = true; depth++; } }
  ok(!nested && depth === 0, "no <a> nested inside another <a>");
}
{
  const html = render(SPC, null, CUE);
  ok(!html.includes(CUE), "missing line: no cue promising an empty read");
  ok(!html.includes("wf-place-card-take"), "missing line: no empty take slot");
  ok(!/\bhas-more\b/.test(html), "missing line: no has-more class");
  ok(html.includes('href="/p/ChIJkeB3AiDhwogRFErS2ugR_58"'), "missing line: card still opens /p/{id}");
}
ok(!render(DRAC, TAKE, null).includes(CUE), "cue is opt-in (no editorialMore -> no cue)");
ok(landingCardHref({ name: "No Id Place" }) === "/?q=No%20Id%20Place", "only an id-less row falls back to search");

// 4 — Save / Share never also navigate (source: their handlers stop propagation).
{
  const src = strip(readFileSync(path.join(ROOT, "app/components/IconicPlaceCard.js"), "utf8"));
  const save = src.match(/className=\{"wf-place-card-save"[\s\S]{0,400}?onClick=\{\(e\) => \{([^}]*)\}/);
  ok(save && /e\.stopPropagation\(\)/.test(save[1]) && /e\.preventDefault\(\)/.test(save[1]), "Save handler stops propagation + default");
  const share = src.match(/aria-label=\{"Share " \+ place\.name\} onClick=\{\(e\) => \{([^}]*)\}/);
  ok(share && /e\.stopPropagation\(\)/.test(share[1]) && /e\.preventDefault\(\)/.test(share[1]), "Share handler stops propagation + default");
  const cue = src.match(/className="wf-place-card-more" href=\{cardHref\} onClick=\{([^\n]*)\}>/);
  ok(cue && /stopPropagation/.test(cue[1]), "cue link stops propagation (no double open via the card's own click)");
}

// 5 — the cue is truthful.
ok(hasPlaceViewEditorial({ name: "Perq Coffee Bar", id: "ChIJXyaPvkVAw4gRxzzecD3I0Po" }, null) === false,
  "curated one-liner only (Perq) -> no cue; /api/editorial serves nothing for it");
ok(hasPlaceViewEditorial({ name: "Mote Marine Laboratory", id: "ChIJrXZ3LLxqw4gRjYTBNBMgJnA" }, null) === false,
  "curated one-liner only (Mote) -> no cue");
ok(hasPlaceViewEditorial(DRAC, { hook: TAKE, why_here: "long read", local_tip: "tip" }) === true,
  "verified fleet row -> cue");
ok(hasPlaceViewEditorial({ name: "Ca' d’Zan", id: "ChIJpXGK53VC24gRWMneFVtK6hY" }, null) === true,
  "Atlas card (by id) -> cue");
{
  const land = strip(readFileSync(path.join(ROOT, "lib/landingPage.js"), "utf8"));
  ok(/editorialMore=\{take && hasPlaceViewEditorial\(p, eds\[p\.id\]\) \?/.test(land),
    "landing gates the cue on hasPlaceViewEditorial(p, eds[p.id])");
}

// 6 — what left the landing renders in the place view (same mappers the route uses).
{
  const why = "The gothic dressing could easily be a gimmick, but the Neamtu family built this to show off Romanian wine culture.";
  const tip = "Skip the familiar French and Italian bottles and ask the staff to walk you through the Romanian varietals.";
  const ed = mapWfEditorial({ verified: true, hook: TAKE, why_here: why, local_tip: tip });
  ok(ed && ed.why === why, "fleet why_here (old 'Why it fits') -> place view 'Why go'");
  ok(ed && ed.insiderMove === tip, "fleet local_tip (old 'Insider') -> place view 'Insider move'");
  ok(hasSourcedEditorialFields(ed), "the Detail sheet accepts that editorial (paints WayfindTakeRail)");
  const cards = JSON.parse(readFileSync(path.join(ROOT, "data/atlas/editorial-cards.json"), "utf8"));
  const zan = cards.find((c) => c.placeId === "ChIJpXGK53VC24gRWMneFVtK6hY");
  const zed = cardToEditorial(zan);
  ok(zed && zed.why && zed.insiderMove && hasSourcedEditorialFields(zed), "Atlas card (Ca' d'Zan) -> Why go + Insider move in the place view");
}
{
  const detail = strip(readFileSync(path.join(ROOT, "app/components/sheets/Detail.js"), "utf8"));
  ok(/\["why", "Why go"/.test(detail) && /\["insiderMove", "Insider move"/.test(detail) && /\["funFact", "Fun fact"/.test(detail),
    "Detail's WayfindTakeRail still renders Why go / Insider move / Fun fact");
  ok(/fetch\("\/api\/editorial\?" \+ q\)/.test(detail), "Detail still fetches /api/editorial for the opened place");
}

console.log(`test-landing-card-cue: OK — ${pass} assertions (real card rendered; /p/{id} door; truthful cue; Save/Share isolated; place view keeps Why go + Insider move)`);
