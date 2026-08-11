#!/usr/bin/env node
// scripts/check-top40-rail.mjs — the ranked rail inside "The Best Around You".
//
// Owner, 2026-08-10: the browse shelf is now ten strong decisions, not forty
// cards. Its original ranking, card, disclosure and verified-CTA laws remain.
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
let assertions = 0;
const ok = (c, m) => { assertions++; if (!c) failures.push(m); };
// Strip comments before any presence check — this file's own prose explains
// every rule below, and a guard that matches its own explanation proves
// nothing (five separate occurrences of exactly that bug on 2026-07-30).
const code = bn.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

// ── 1. ONE RANKING, and it is the site's ────────────────────────────────────
ok(/const ranked = byVisibleScore\(pool\)/.test(code) && /uniqueRecommendations\(top40, explodingClaimed, TOP40_MAX\)/.test(code),
  "the rail sorts through byVisibleScore — the same governed score every other ranked surface uses");
ok(/const TOP40_MAX = 10/.test(code),
  "The Best Around You is capped at ten decisions, not an endless forty-card search result");
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
  // Shopping put a beauty salon at #1 "Top pick near you" on the live rail
  // (2026-08-09). wf_best_picks' shopping category includes services, which are
  // not answers to "what should I do near me right now". Removed from the pool
  // rather than sorted around — the score was right, the input was not.
  ok(!/"shopping"/.test(m ? m[1] : ""), "the rail does not pull the shopping category — it returns salons and spas, which are services rather than things to do");
}
ok(/Promise\.all\(/.test(code) && /TOP40_CATEGORIES\.map\(/.test(code), "the categories are fetched in parallel, not in series");
ok(/\.catch\(\(\) => \[\]\)/.test(code), "a failed category degrades to fewer cards, never to a thrown render");
// Errands are filtered OUT of the pool, never sorted around. Detwiler's Farm
// Market (a grocery store) ranked #5 at 9.6 on the live rail — correctly by
// score, and still not an answer to "what should I do near me".
ok(/const TOP40_TYPE_EXCLUDE = \//.test(code) && /grocery_store/.test(code) && /beauty_salon/.test(code),
  "retail and personal-services types are excluded from the pool by their own Google primary_type");
ok(/!top40Allowed\(r\)/.test(code), "…and the filter is applied while the pool is built, before any ranking");
ok(/if \(!t\) return true/.test(code), "…failing OPEN on a missing type — an absent primary_type is not evidence of an errand");
ok(!/governed_score[\s\S]{0,80}top40Allowed/.test(code), "the filter never consults the score — a place is dropped for being an errand, never for ranking badly");
// The card carries the same facts the food cards do.
ok(/priceLabel\(p\.price_level/.test(code) && /const top40Status = /.test(code),
  "the card shows price and open/closed through the app's single sources, like the food cards");
// OPEN-NESS. Drop known-closed, never keep-only-known-open: Google returns no
// hours for a large share of these rows, so requiring known-open would empty
// the rail in most markets and call that correctness.
ok(/return st\.open !== false/.test(code),
  "the rail drops places KNOWN to be closed, and keeps ones with no hours data rather than emptying itself");
ok(!/st\.open === true\)? return/.test(code) && !/if \(!st\.open\) return/.test(code),
  "…and never filters on keep-only-known-open, which would hide every place Google has no hours for");
ok(/!top40OpenNow\(r, top40Status\)/.test(code), "the open-now filter runs while the pool is built");
ok((code.match(/const top40Status = /g) || []).length === 1 && /const st = top40Status\(p\)/.test(code),
  "the filter and the card's facts row read ONE status helper — two calls could show 'Open' on a card the filter judged closed");
// Time of day is upstream, deliberately not re-implemented on this surface.
ok(/p_local_hour|localHour/.test(readFileSync("lib/todaysBest.js", "utf8")),
  "daypart fit stays in wf_best_picks' own p_local_hour ranking");
ok(/gateOutdoor\(ranked, nowCtx\(\)\)/.test(code),
  "…and gateOutdoor still drops outdoor answers the hour and weather make wrong");
ok(/seen\.has\(id\)/.test(code) && /seen\.add\(id\)/.test(code),
  "the pool is deduped by place id — wf_best_picks can return one venue under two categories and a repeated card reads as broken");

// ── 3. DISCLOSURE ───────────────────────────────────────────────────────────
ok(/p\.trending && p\.trend_reason \? "🔥 " \+ p\.trend_reason : null/.test(code),
  "the trend bump is disclosed on the card wherever it was applied");
ok(/affiliate links; Wayfind may earn a commission/.test(bn),
  "the rail carries the affiliate disclosure, proximate to the ticket CTA it can render");
ok(/p\.creator_video \?/.test(code),
  "the creator-video badge is driven by the flag byVisibleScore stamps when it applied the bonus, so label and score cannot disagree");
// The card must carry REAL tags, not just the two rare ones. Measured live on
// 2026-08-09: with only the creator-video and coupon chips, 3 of the first 4
// cards rendered zero chips and the card had a visible hole in it.
ok(/experienceTags\(tagged, 4\)/.test(code),
  "the card's tags come from experienceTags — the same evidence-bound engine the reference /best-of card uses");
ok(/types: Array\.isArray\(p\.types\)/.test(code),
  "…adapted from wf_best_picks' single primary_type rather than fabricating a types array");
ok(/\.wf-rail-top40 \.wf-place-card-highlights\{flex-wrap:wrap/.test(readFileSync("app/components/css.js", "utf8")),
  "…and the tag row is allowed to wrap, so a full tag set is shown rather than clipped to one line");

// ── 4. VERIFIED OFFERS ONLY ─────────────────────────────────────────────────
ok(/const partner = placePartnerPick\(p\)/.test(code), "the ticket CTA is gated on a resolved partner pick");
ok(/cta=\{partner \?/.test(code), "…and renders nothing when there is no verified offer for that venue");
ok(/commerceHref\(\{ provider: partner\.provider/.test(code), "the CTA href is built by commerceHref — our own tracked path, never a partner domain");
ok(/emitCommerce\("commerce_cta_clicked"/.test(code), "the CTA is instrumented, so it cannot become an uninstrumented money surface");
ok(/mintClickId\(\)/.test(code), "…with a click id minted per tap for attribution");

// ── 5. ONE CARD SHAPE, AND THE ANSWER BELOW IT SURVIVES ─────────────────────
// ── THE EDITORIAL LAW (owner, 2026-08-09, app-wide) ─────────────────────────
// "the editorial needs to answer one question: why should I choose this place...
// this is the rule for every editorial." The Top 40 shipped with no line at all
// while the eat rows beside it had one.
ok(/take=\{toHookLine\(hooks\[p\.place_id\], p\.name\)\}/.test(code),
  "every Top 40 card carries the editorial line, resolved through the same toHookLine the eat rows use");
// v7.06 — the resolver MOVED to app/components/useEditorialHooks.js so nine
// place surfaces could share one implementation instead of copying it. Asserting
// the endpoints against BestNearby.js alone would now go GREEN the moment they
// left the file — which is the dangerous half of a path-bound assertion, not the
// noisy half. So this follows the code and asserts the UNION: the rail is wired
// to the shared resolver, and the shared resolver still holds the precedence.
const uh = readFileSync("app/components/useEditorialHooks.js", "utf8");
ok(/useEditorialHooks\(/.test(code),
  "the rail resolves its line through the shared useEditorialHooks, not a local copy");
ok(/"\/api\/known-for"/.test(uh) && /cacheOnly: true/.test(uh),
  "…from the researched wf_editorial hook first, then a VALIDATED cached blurb — never generated on the render path");
// Precedence is the whole contract, so assert the ORDER and the fill rule, not
// merely that both endpoint strings are present somewhere in the file.
ok(uh.indexOf('"/api/known-for"') < uh.indexOf('"/api/blurbs"'),
  "the researched hook is consulted BEFORE the cached blurb — position, not just presence");
ok(/if \(!next\[id\] && d\.blurbs\[id\]\)/.test(uh),
  "the cached blurb only fills ids the researched hook did not already answer — it can never overwrite verified copy");
{
  // No fallback, no template. A place with no verified hook renders no line.
  const takeIdx = code.indexOf("take={toHookLine(");
  const line = code.slice(takeIdx, code.indexOf("\n", takeIdx));
  ok(!/\|\|/.test(line), "the editorial line has NO fallback — an empty slot is honest, a generic line is filler, a generated one is fabrication");
  const rail = readFileSync("app/components/RailCard.js", "utf8");
  ok(/take \? <div className="wf-place-card-take">\{take\}<\/div> : null/.test(rail),
    "RailCard renders the line only when one exists, in the place card's own take slot");
}
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

// ── 6. THE WHY-LINE. The shelf says WHAT PRODUCED IT ────────────────────────
// (owner, 2026-08-12): location + hour + weather shaped this list, stated in
// the same voice the intent pages use. Structural half: the call sits under
// the rail's RailNav. Executed half: the line is proven to render a real
// sentence (with the city, and a context reason) by CALLING the pair of
// modules the component calls — and to be null-safe when context is absent.
ok(/<RailNav railId="top40"[\s\S]{0,700}?nowSubline\(\{\}, nowCtx\(\), city\)/.test(code),
  "the why-line renders directly under the Top-40 RailNav via nowSubline({}, nowCtx(), city)");
{
  const { nowContext } = await import("../lib/nowContext.js");
  const { nowSubline } = await import("../lib/intentPages.js");
  const ctx = nowContext({ lat: 27.95, lng: -82.46, weather: { temp: 88, label: "Clear" } });
  const line = nowSubline({}, ctx, "Tampa");
  ok(typeof line === "string" && line.includes("Tampa") && line.includes(ctx.reason),
    "nowSubline EXECUTED: names the city and carries the context reason (hour/weather) that shaped the list");
  ok(nowSubline({}, null, "Tampa") === null, "nowSubline EXECUTED: null context renders nothing, never a broken sentence");
}

if (failures.length) {
  console.error("check-top40-rail: FAIL");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-top40-rail: OK — ${assertions} assertions (ten-card cap, one governed ranking, ${(code.match(/const TOP40_CATEGORIES = \[([^\]]*)\]/) || [0, ""])[1].split(",").filter((x) => x.trim()).length} categories deduped by place id, trend + affiliate disclosure present, ticket CTA gated on a verified partner pick and tracked through commerceHref)`);
