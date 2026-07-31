#!/usr/bin/env node
/**
 * test-card-analytics — the two event families stay separate, carry the fields we
 * decide UI with, and cannot double-fire.
 *
 * WHY TWO FAMILIES. A free local offer earns nothing. Folding it into
 * commerce_impression silently inflates the denominator of every revenue rate we
 * compute — CTR, conversion and revenue-per-impression would all fall as we add
 * free inventory, which is the opposite of what adding it does. card_* answers a
 * DESIGN question; commerce_* answers the MONEY question.
 *
 * WHY rank_bucket AND NOT RAW POSITION. lib/commerce.js: a precise rank beside a
 * commission figure is the evidence trail for pay-for-placement, which the whole
 * ranking method exists to be able to refute. Owner decision 2026-08-01: keep the
 * coarse buckets. This file asserts raw position never reaches a payload.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const read = (f) => readFileSync(path.resolve(f), "utf8");

const C = await import(path.resolve("lib/commerce.js"));

/* ── 1. the families are separate sets ───────────────────────────────────── */
ok(C.CARD_EVENTS.length === 2, `CARD_EVENTS has both events (got ${C.CARD_EVENTS.length})`);
ok(C.CARD_EVENTS.includes("card_impression") && C.CARD_EVENTS.includes("card_clicked"), "card_impression and card_clicked are defined");
ok(!C.CARD_EVENTS.some((e) => C.COMMERCE_EVENTS.includes(e)), "no event appears in BOTH families — a shared name is how a design metric ends up in a revenue rollup");
ok(C.COMMERCE_EVENTS.includes("commerce_impression") && C.COMMERCE_EVENTS.includes("commerce_cta_clicked"), "the commerce pair is untouched");

/* ── 2. a typo is still fatal, for both families ─────────────────────────── */
for (const bad of ["card_impresion", "card_view", "commerce_click"]) {
  let threw = false;
  try { C.commercePayload(bad, {}); } catch { threw = true; }
  ok(threw, `"${bad}" throws — a typo renders as zero on the dashboard, indistinguishable from nobody clicking`);
}

/* ── 3. the fields we make UI decisions with actually survive ────────────── */
{
  const full = { surface: "coupons", content_id: "cpn-x", category: "deal_money", city_id: "orlando",
    variant: "poster_art", experiment_id: "card_art_v1", rank_bucket: "top3", has_art: true, card_type: "poster" };
  const p = C.commercePayload("card_impression", full);
  for (const k of ["variant", "experiment_id", "city_id", "category", "rank_bucket", "has_art", "card_type"]) {
    ok(p[k] !== undefined, `card_impression carries ${k}`);
  }
  const q = C.commercePayload("commerce_impression", { ...full, provider: "clipp", offer_id: "o1" });
  for (const k of ["variant", "experiment_id", "city_id", "category", "rank_bucket", "provider"]) {
    ok(q[k] !== undefined, `commerce_impression carries ${k}`);
  }
  // Negative control: the design-only fields must NOT leak into a commerce payload,
  // or a money event starts describing a layout experiment.
  ok(q.has_art === undefined && q.card_type === undefined,
    "has_art / card_type are DROPPED from a commerce payload — the whitelist is doing real work");
}

/* ── 4. RAW POSITION NEVER REACHES A PAYLOAD ─────────────────────────────── */
{
  for (const ev of ["card_impression", "commerce_impression"]) {
    const p = C.commercePayload(ev, { position: 3, rank: 3, rank_bucket: "top3", index: 3 });
    ok(p.position === undefined && p.rank === undefined && p.index === undefined,
      `${ev}: raw position/rank/index is dropped — pay-for-placement evidence must not exist`);
    ok(p.rank_bucket === "top3", `${ev}: the coarse bucket is what survives`);
  }
  ok(C.rankBucket(1) === "top3" && C.rankBucket(7) === "4-10" && C.rankBucket(99) === "11+", "rankBucket buckets coarsely");
  ok(C.rankBucket(0) === null && C.rankBucket("x") === null, "…and refuses nonsense rather than inventing a bucket");
}

/* ── 5. NO DOUBLE FIRING — one observer, one shot ────────────────────────── */
{
  const hook = read("app/components/useCommerceImpression.js");
  ok((hook.match(/new IntersectionObserver/g) || []).length === 1,
    "exactly ONE IntersectionObserver — a second observer with its own threshold is how the two events drift apart and CTR stops matching its denominator");
  ok(/if \(firedRef\.current\) return;\s*\n\s*firedRef\.current = true;/.test(hook),
    "both events sit behind the SAME one-shot guard, so double-firing is structurally impossible");
  // NOT "both appear after the guard" — that stays true if a DUPLICATE is added
  // before it, which is exactly the double-fire this is meant to catch (proved by
  // RED-arm 3, which passed against the weaker form). Assert instead that NOTHING
  // is emitted before the guard: count emits on each side.
  const cbStart = hook.indexOf("new IntersectionObserver");
  const guardAt = hook.indexOf("firedRef.current = true;", cbStart);
  ok(cbStart >= 0 && guardAt > cbStart, "located the observer callback and its one-shot guard");
  const beforeGuard = hook.slice(cbStart, guardAt);
  const afterGuard = hook.slice(guardAt);
  ok((beforeGuard.match(/emitCommerce\(/g) || []).length === 0,
    "NOTHING is emitted before the one-shot guard — an emit above it fires on every intersection callback, not once");
  ok((afterGuard.match(/emitCommerce\(/g) || []).length === 2,
    "exactly TWO emits after the guard: one commerce, one card");
  ok(/commerce_impression/.test(afterGuard) && /card_impression/.test(afterGuard), "…and they are the two expected events");
  ok(/obs\.disconnect\(\)/.test(hook), "the observer disconnects once it counts — one impression per card per view");
}

/* ── 6. the screen populates them, and the click fires both ──────────────── */
{
  const screen = read("app/components/screens/Coupons.js");
  ok(/useCommerceImpression\(cctx, cardCtx\)/.test(screen), "the card passes BOTH contexts to the shared observer");
  ok(/const cardCtx = \{/.test(screen), "a non-commerce card context exists");
  ok(/emitCommerce\("card_clicked", cardCtx\)/.test(screen), "card_clicked fires on the CTA");
  // WHITESPACE-TOLERANT ON PURPOSE. The first version of this matched the exact
  // single-line form `if (cctx) { try { emitCommerce("commerce_cta_clicked"`, and it
  // broke the moment another lane reformatted the guard across three lines to add
  // click_id — behaviour identical, assertion red. That is an assertion pinned to
  // formatting rather than to the rule. What matters is that the commerce emit sits
  // INSIDE an `if (cctx)` guard and the card emit does NOT.
  ok(/if\s*\(cctx\)[\s\S]{0,160}?emitCommerce\("commerce_cta_clicked"/.test(screen),
    "commerce_cta_clicked stays guarded by cctx, so a free card never enters the revenue funnel");
  const clickIdx = screen.indexOf('emitCommerce("card_clicked"');
  const guardIdx = screen.lastIndexOf("if (cctx) {", clickIdx);
  const closeIdx = screen.indexOf("}", screen.indexOf('emitCommerce("commerce_cta_clicked"'));
  ok(clickIdx > 0 && clickIdx > closeIdx,
    "card_clicked is emitted OUTSIDE the cctx guard — a free card must still count toward card CTR");
  ok(/has_art: hasArt/.test(screen) && /card_type: "poster"/.test(screen), "has_art and card_type are populated");
  ok(/variant,/.test(screen) && /experiment_id: CARD_ART_EXPERIMENT/.test(screen), "variant and experiment_id are populated");
  ok(/city_id: cityId/.test(screen), "city_id is populated");
  ok(!/category: "deal"/.test(screen), 'the hardcoded category:"deal" is gone — it made every card indistinguishable on the dashboard');
  ok(/category = disc\.affiliate \? "deal_money" : "deal_free"/.test(screen), "…replaced by a derived category");
  // The cardCtx must NOT carry money identifiers.
  const cardBlock = screen.slice(screen.indexOf("const cardCtx = {"), screen.indexOf("const impRef"));
  ok(cardBlock.length > 50, `isolated the cardCtx block (${cardBlock.length} chars) — an empty slice would make the next checks vacuous`);
  ok(!/provider/.test(cardBlock) && !/offer_id/.test(cardBlock) && !/click_id/.test(cardBlock),
    "the card context carries NO provider / offer_id / click_id — nothing here is an attribution record, so nothing belongs in a payout dispute");
}

if (fail.length) {
  console.error("test-card-analytics: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`test-card-analytics: OK — ${pass} assertions (two separate families, design fields carried, raw position refused, one observer one shot)`);
