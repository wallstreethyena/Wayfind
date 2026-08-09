#!/usr/bin/env node
// scripts/check-top40-rail.mjs — the Top 40 rail inside "The best near you".
//
// Owner, 2026-08-08: "i want the same cards inside this... place 40 cards
// there and give the best options, allow the user scroll right and left...
// i want the things that are most trending, preferably the instagram videos",
// and "make sure it is housed under this structure".
//
// WHAT THIS GUARD EXISTS TO STOP, in order of how much it would cost:
//
//  1. A SECOND RANKING. The bias the rail is asked for already lives in the
//     governed score (+0.6 trending, +0.7 creator video). The temptation is to
//     "make it lean harder" with a local sort on this surface — which is
//     precisely what check-creator-video-boost.mjs and check-score-law.mjs
//     forbid by name elsewhere, because it breaks "shown == sorted": the badge
//     on the card would stop being the number that put it in that position.
//     So the rail must sort through byVisibleScore and nothing else.
//  2. A GUESSED TICKET LINK. The CTA may only appear where placePartnerPick
//     resolves — an exact normalized-name match against a curated table — and
//     must route through commerceHref (our own path, tracked) rather than a
//     partner domain built at runtime.
//  3. A SILENT TREND BUMP. Wherever the +0.6 is applied it is disclosed.
//  4. A SECOND CARD SHAPE. The rail renders the shared RailCard, like every
//     other rail on the page.
import { readFileSync } from "node:fs";

const bn = readFileSync("app/components/BestNearby.js", "utf8");
const failures = [];
const ok = (c, m) => { if (!c) failures.push(m); };
// Strip comments before any presence check — this file's own prose explains
// every rule below, and a guard that matches its own explanation proves
// nothing (five separate occurrences of exactly that bug on 2026-07-30).
const code = bn.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

// ── 1. ONE RANKING, and it is the site's ────────────────────────────────────
ok(/const ranked = byVisibleScore\(pool\)\.slice\(0, TOP40_MAX\)/.test(code),
  "the rail sorts through byVisibleScore — the same governed score every other ranked surface uses");
ok(/byVisibleScore/.test(code) && !/\bpool\.sort\(/.test(code) && !/ranked\.sort\(/.test(code),
  "no local re-sort of the pool — a second comparator here would break 'shown == sorted' on the card's own badge");
ok(!/capCreatorHead\(/.test(code),
  "no creator head-shuffle on this surface — the same rule check-creator-video-boost pins on the answer list");
ok(/score=\{toDisplayScore\(p\.governed_score\)\}/.test(code),
  "the badge shows the governed score that ranked the row, not a re-derived one");

// ── 2. FOUR CATEGORIES, DEDUPED ─────────────────────────────────────────────
{
  const m = code.match(/const TOP40_CATEGORIES = \[([^\]]*)\]/);
  ok(!!m, "TOP40_CATEGORIES is a named constant");
  const n = m ? m[1].split(",").filter((x) => x.trim()).length : 0;
  ok(n >= 3, `the rail spans at least 3 categories (got ${n}) — one category returns 40 restaurants, which is not "the best of each category"`);
}
ok(/Promise\.all\(/.test(code) && /TOP40_CATEGORIES\.map\(/.test(code), "the categories are fetched in parallel, not in series");
ok(/\.catch\(\(\) => \[\]\)/.test(code), "a failed category degrades to fewer cards, never to a thrown render");
ok(/seen\.has\(id\)/.test(code) && /seen\.add\(id\)/.test(code),
  "the pool is deduped by place id — wf_best_picks can return one venue under two categories and a repeated card reads as broken");

// ── 3. DISCLOSURE ───────────────────────────────────────────────────────────
ok(/p\.trending && p\.trend_reason \? "🔥 " \+ p\.trend_reason : null/.test(code),
  "the trend bump is disclosed on the card wherever it was applied");
ok(/affiliate links; Wayfind may earn a commission/.test(bn),
  "the rail carries the affiliate disclosure, proximate to the ticket CTA it can render");
ok(/p\.creator_video \?/.test(code),
  "the creator-video badge is driven by the flag byVisibleScore stamps when it applied the bonus, so label and score cannot disagree");

// ── 4. VERIFIED OFFERS ONLY ─────────────────────────────────────────────────
ok(/const partner = placePartnerPick\(p\)/.test(code), "the ticket CTA is gated on a resolved partner pick");
ok(/cta=\{partner \?/.test(code), "…and renders nothing when there is no verified offer for that venue");
ok(/commerceHref\(\{ provider: partner\.provider/.test(code), "the CTA href is built by commerceHref — our own tracked path, never a partner domain");
ok(/emitCommerce\("commerce_cta_clicked"/.test(code), "the CTA is instrumented, so it cannot become an uninstrumented money surface");
ok(/mintClickId\(\)/.test(code), "…with a click id minted per tap for attribution");

// ── 5. ONE CARD SHAPE, AND THE ANSWER BELOW IT SURVIVES ─────────────────────
ok(/<RailCard\b/.test(code), "the rail renders the shared RailCard, not a fourth bespoke card");
ok(/data-rail="top40"/.test(code) && /<RailNav railId="top40"/.test(code),
  "the rail carries the explicit 'there is more' affordance, like the events rail");
ok(/className="wf-rail wf-rail-top40"/.test(code), "…on the shared .wf-rail scroller");
// The rail was added ABOVE the ranked accordion, not in place of it. The
// accordion is the ANSWER and its head-of-three, see-all and why-line are all
// measured decisions (check-home-answer-first pins them). If a later change
// deletes them, that guard fires — this assertion just states the intent so
// the two are not silently traded for each other.
ok(code.indexOf('data-rail="top40"') < code.indexOf("{SECTIONS.map("),
  "the rail sits above the ranked accordion — it is a browse surface added to the answer, not a replacement for it");
ok(/list\.length < 3\) return null/.test(code),
  "under three picks the rail renders nothing — a thin shelf teaches the reader the ranking is bad (RANKING_AND_FEATURING_SPEC §4)");

if (failures.length) {
  console.error("check-top40-rail: FAIL");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-top40-rail: OK — ${21 - failures.length} assertions (one governed ranking, ${(code.match(/const TOP40_CATEGORIES = \[([^\]]*)\]/) || [0, ""])[1].split(",").filter((x) => x.trim()).length} categories deduped by place id, trend + affiliate disclosure present, ticket CTA gated on a verified partner pick and tracked through commerceHref)`);
