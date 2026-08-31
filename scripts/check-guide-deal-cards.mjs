#!/usr/bin/env node
// Lock for the guide deal-card block (#18 and any guide that opts in).
//
// WHAT THIS IS DEFENDING. A deal card is a money surface that renders a
// merchant's offer to a user. The failure modes are all silent: an id that no
// longer exists renders nothing, an expired offer renders a promise we cannot
// keep, a missing image renders a broken box, and an untracked href earns
// nothing while looking identical to one that earns. None of those throw.
//
// ASSERTS ON BEHAVIOUR, NOT TEXT. The registry rows are resolved and the render
// path is executed, so "the string is in the file" cannot satisfy any of it.
// Images are checked against the filesystem, not against a naming convention.
import { readFileSync, existsSync } from "node:fs";
import { GUIDES } from "../lib/guides.js";
import { COUPONS, couponIsLive } from "../lib/coupons.js";
import { guidePrimaryCta } from "../lib/guideCta.js";
import { siteTodayStr } from "../lib/siteTime.js";
import { GUIDE_DEAL_MAX, areasForRegion, guideDealIds } from "../lib/guideDeals.js";

let n = 0, bad = 0;
const ok = (cond, msg) => { n++; if (!cond) { bad++; console.error("  - " + msg); } };

const today = siteTodayStr();
const src = readFileSync(new URL("../app/guides/[slug]/GuideDealCards.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/guides/[slug]/page.js", import.meta.url), "utf8");
// Strip comments before matching, so this guard cannot pass on its own prose.
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const cardCode = code(src), pageCode = code(page);

const optedIn = Object.entries(GUIDES).filter(([, g]) => Array.isArray(g.dealCards) && g.dealCards.length);
ok(optedIn.length >= 1, `at least one guide declares dealCards (found ${optedIn.length}) — if this is 0 the rest of this guard proves nothing`);

for (const [slug, g] of optedIn) {
  const ids = g.dealCards;
  ok(new Set(ids).size === ids.length, `${slug}: dealCards has duplicate ids — the same offer would render twice and double-count its impression`);

  let live = 0;
  for (const id of ids) {
    const c = COUPONS.find((x) => x && x.id === id);
    ok(!!c, `${slug}: dealCards id "${id}" is not in the registry — it would render as nothing`);
    if (!c) continue;
    // Every field the card actually paints.
    ok(!!c.title, `${slug}/${id}: no title`);
    ok(!!c.business, `${slug}/${id}: no merchant`);
    ok(!!c.area, `${slug}/${id}: no location`);
    ok(!!c.details, `${slug}/${id}: no offer text — the card would show a title and nothing verifiable`);
    ok(!!c.url, `${slug}/${id}: no url — a dead link`);
    ok(Array.isArray(c.intents) && c.intents.length > 0, `${slug}/${id}: no intents, so the card cannot derive a category`);
    // Expiry: a card must never render an offer already past its date.
    if (couponIsLive(c, today)) live++;
    // A registry row that declares commerce must keep the tracked redirect. This
    // is the "no CTA bypasses tracking" rule, asserted on the href rather than on
    // the presence of the word "commerce" anywhere in the file.
    if (c.commerce) {
      ok(String(c.url).startsWith("/api/commerce/go"), `${slug}/${id}: declares commerce but its url is not the tracked redirect — the click would earn nothing`);
    }
  }
  ok(live >= 1, `${slug}: every declared deal is expired — the block would render empty`);

  // The guide's ONE primary CTA must itself be monetized and tracked.
  const cta = guidePrimaryCta(g, today);
  ok(cta && cta.monetized === true, `${slug}: primary CTA is not monetized (kind=${cta && cta.kind})`);
  ok(cta && typeof cta.href === "string" && cta.href.startsWith("/api/commerce/go"),
    `${slug}: primary CTA does not go through the tracked commerce redirect (href=${cta && String(cta.href).slice(0, 60)})`);
  ok(cta && cta.deal && cta.deal.ends !== undefined, `${slug}: primary CTA carries no expiry field — deadlines must come from the registry, never hardcoded`);
}

// Images: resolve what the component would actually choose, against real files.
const { cardImage } = await import("../lib/dealCardImage.js").catch(() => ({}));
if (typeof cardImage === "function") {
  ok(/from "\.\.\/\.\.\/\.\.\/lib\/dealCardImage"/.test(cardCode), "GuideDealCards does not use the shared image resolver — the tested branch would not be the rendered one");
  const seen = new Set();
  for (const [, g] of optedIn) {
    for (const id of g.dealCards) {
      const c = COUPONS.find((x) => x && x.id === id);
      if (!c) continue;
      for (const cat of ["dining", "drinks", "games", "certificates", undefined]) {
        const p = cardImage({ image: c.image || null, category: cat });
        if (seen.has(p)) continue;
        seen.add(p);
        ok(p.startsWith("/"), `card image "${p}" is not a local path — a remote image can break or leak a referrer`);
        ok(existsSync(new URL("../public" + p, import.meta.url)), `card image "${p}" does not exist in /public — the card would render a broken box`);
      }
    }
  }
  ok(seen.size >= 2, `image resolution exercised more than one path (saw ${seen.size})`);
} else {
  ok(false, "lib/dealCardImage does not export cardImage — image resolution is untestable");
}

// Tracking. Four events, each fired at most once, and the click/outbound pair kept separate.
for (const ev of ["guide_impression", "deal_card_impression", "deal_card_clicked", "deal_card_outbound"]) {
  ok(new RegExp(`track\\(\\s*"${ev}"`).test(cardCode), `event "${ev}" is not emitted`);
}
// The once-flags must be READ as a guard, not merely assigned. Asserting on the
// assignment alone passes with the early-return deleted, which is the exact
// mutation that reintroduces double-counting — proven by break-check.
ok(/if\s*\(\s*!?seenBlock\.current\s*\)|!seenBlock\.current\s*\)/.test(cardCode),
  "the guide_impression once-flag is never read as a guard — the event could fire on every intersection");
ok(/if\s*\([^)]*seenCards\.current\[[^\]]+\]\s*\)|\|\|\s*seenCards\.current\[/.test(cardCode),
  "the per-card impression once-flag is never read as a guard — scrolling back up would double-count");
ok(/if\s*\(\s*clicked\.current\[[^\]]+\]\s*\)\s*return/.test(cardCode),
  "the click once-flag is never read as an early return — a double-tap would emit two clicks");
ok(/IntersectionObserver/.test(cardCode), "impressions are not observed, so they would fire whether or not the card was seen");
ok(/io\.unobserve\(|io\.disconnect\(/.test(cardCode), "the observer is never detached — repeated intersections would re-fire");

// The page must live-gate before rendering, and must not invent a href.
ok(/couponIsLive\(/.test(pageCode), "page.js does not live-gate deal cards — an expired offer could render");
ok(!/https?:\/\//.test(cardCode.replace(/rel=|noopener|nofollow|sponsored/g, "")), "GuideDealCards contains a literal URL — hrefs must come from the registry only");
ok(/url:\s*c\.url/.test(pageCode), "page.js does not pass the registry url through untouched");

// Rain check on the social-proof fix: inventory is tried before the live API.
ok(/inventorySocial\(/.test(pageCode), "social proof no longer consults our own inventory");
ok(pageCode.includes("inventorySocial(primaryCta.place)"),
  "social proof consults owned inventory directly");
ok(!pageCode.includes("rankedFor(\"things-to-do\""),
  "guides never enter rankedFor's no-store path — static ISR cannot switch dynamic at runtime");
ok(/inventoryPlacesForRegion[\s\S]{0,1800}next:\s*\{\s*revalidate:\s*3600\s*\}/.test(pageCode),
  "live guide modules use one explicitly cacheable inventory read");

// ── v8.23: THE SET NOBODY TYPED IN ─────────────────────────────────────────
// Until v8.23 this guard only ever looked at guides with a hand-declared
// dealCards array — two of thirty-nine — so the other thirty-seven were not
// "passing", they were unexamined, and the reason they rendered no offers was
// invisible to every check in the suite. lib/guideDeals.js now resolves them
// from the registry, which means the resolver is a money surface and gets the
// same treatment as the hand-written lists: resolved, executed, asserted.
{
  let autoGuides = 0, autoCards = 0;
  for (const [slug, g] of Object.entries(GUIDES)) {
    const ids = guideDealIds(g, today);
    if (!Array.isArray(g.dealCards) || !g.dealCards.length) { if (ids.length) autoGuides++; autoCards += ids.length; }
    // The cap governs the RESOLVER, not an editor. sarasota-half-price-dining
    // declares five by hand and is entitled to: a guide whose whole subject is
    // half-price dining is not "a choice wall" for listing five of them, and a
    // guard that overruled that would be this file legislating editorial.
    const auto = !(Array.isArray(g.dealCards) && g.dealCards.length);
    ok(!auto || ids.length <= GUIDE_DEAL_MAX, `${slug}: the resolver returned ${ids.length} cards, over its ${GUIDE_DEAL_MAX} budget — this block sits above the one monetized CTA and must not become a choice wall`);
    ok(new Set(ids).size === ids.length, `${slug}: the resolver returned a duplicate id`);
    // AN EDITOR IS NEVER OVERRULED, in content or in order.
    if (Array.isArray(g.dealCards) && g.dealCards.length) {
      ok(ids.join("|") === g.dealCards.join("|"), `${slug}: hand-declared dealCards were reordered or replaced by the resolver`);
    }
    const areas = areasForRegion(g.region);
    const rows = ids.map((id) => COUPONS.find((c) => c && c.id === id));
    rows.forEach((c, i) => {
      ok(!!c, `${slug}: resolved "${ids[i]}", which is not in the registry — it would render as nothing`);
      if (!c) return;
      ok(couponIsLive(c, today), `${slug}: resolved ${c.id}, which has expired — a promise we cannot keep`);
      ok(areas.includes(String(c.area || "")), `${slug} (${g.region}): resolved ${c.id} from ${c.area}, outside its own market — "near you" has to stay true`);
      ok(!!c.title && !!c.business && !!c.details && !!c.url, `${slug}/${c.id}: resolved a row missing a field the card paints`);
      if (c.commerce) ok(String(c.url).startsWith("/api/commerce/go"), `${slug}/${c.id}: declares commerce but is not tracked — the click would earn nothing`);
    });
    const merchants = rows.filter(Boolean).map((c) => String(c.business || "").toLowerCase());
    ok(new Set(merchants).size === merchants.length, `${slug}: two cards for the same merchant — that reads as an advert, not a shortlist`);
    // DETERMINISM. Two calls in one build must agree, or a cached page and a
    // regenerated one would show different offers for no explicable reason.
    ok(guideDealIds(g, today).join("|") === ids.join("|"), `${slug}: the resolver is not deterministic`);
  }
  // GEOGRAPHY IS NOT STRETCHED. An unmapped market resolves NOTHING — showing a
  // Key West reader a Tampa certificate is the failure this is guarding.
  ok(guideDealIds({ region: "Key West" }, today).length === 0,
     "an unmapped market must resolve no offers rather than the nearest city's");
  ok(guideDealIds({ region: "" }, today).length === 0, "a guide with no region resolves nothing");
  ok(guideDealIds(null, today).length === 0, "a null guide must not throw inside a page render");
  // And the wiring is worth having: if this ever drops back to ~0 the resolver
  // has been disconnected and every guide is silently back to no offers.
  ok(autoGuides >= 15, `only ${autoGuides} guides resolve offers automatically — the resolver looks disconnected (it was 27 when it shipped)`);
  console.log(`  · ${autoGuides} guides resolve ${autoCards} cards from the registry with no hand-typed ids`);
}

if (bad) { console.error(`\ncheck-guide-deal-cards: FAIL — ${bad}/${n} assertions`); process.exit(1); }
console.log(`check-guide-deal-cards: OK — ${n} assertions (${optedIn.length} guide(s) opted in; every card registry-backed, live-gated, imaged from a real file, and tracked)`);
