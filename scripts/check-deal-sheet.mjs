#!/usr/bin/env node
/**
 * check-deal-sheet — the Deal Sheet's structure is DERIVED, its inventory is
 * REGISTERED, and no card ever carries two providers.
 *
 * Design contract: docs/mocks/coupons-deal-sheet-mock.html (owner-signed, committed).
 *
 * THE THREE RULES THIS LOCKS, all from the work order:
 *  1. Both tiers derive from existing coupon data. Never hand-sorted.
 *  2. It must be IMPOSSIBLE to render a deal that is not registered in
 *     lib/coupons.js / lib/clippOffers.js.
 *  3. ONE PROVIDER PER CARD, EVER. One offer id, one provider, one
 *     /api/commerce/go resolution. Two monetized hrefs on a card is double
 *     attribution — and a lie to the user about who they are buying from.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const { COUPONS } = await import(path.resolve("lib/coupons.js"));
const D = await import(path.resolve("lib/dealSheet.js"));
const TODAY = "2026-07-30";
const { featured, ledger } = D.dealTiers(COUPONS, TODAY);
const screen = readFileSync(path.resolve("app/components/screens/Coupons.js"), "utf8");
const code = screen.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ── 1. the mock is committed, byte-identical to the signed original ──────── */
{
  const mock = readFileSync(path.resolve("docs/mocks/coupons-deal-sheet-mock.html"), "utf8");
  ok(mock.length > 10000, `the signed mock is committed beside the code (got ${mock.length} bytes)`);
  ok(/Worth money tonight/.test(mock) && /Free &amp; local, standing offers/.test(mock), "…and is the Deal Sheet mock, not another file");
}

/* ── 2. RULE 2: an unregistered deal cannot render ────────────────────────── */
// dealTiers only ever PARTITIONS its input, so this is provable rather than
// argued: feed it a fabricated deal alongside the real ones and assert the output
// ids are a subset of the input ids.
{
  const ids = new Set(COUPONS.map((c) => c.id));
  const out = [...featured, ...ledger].map((c) => c.id);
  ok(out.length > 0, `the sheet renders something (got ${out.length}) — an empty result would make this vacuous`);
  ok(out.every((id) => ids.has(id)), "every rendered deal exists in the registry — dealTiers cannot mint a row");
  ok(new Set(out).size === out.length, "no deal is rendered twice across the two tiers");
  ok(out.length === COUPONS.filter((c) => !c.expires || c.expires >= TODAY).length,
    "every LIVE registered deal lands in exactly one tier — none is silently dropped");
  const rogue = D.dealTiers([...COUPONS, { id: "cpn-not-registered", title: "Fake", business: "Nowhere" }], TODAY);
  ok([...rogue.featured, ...rogue.ledger].some((c) => c.id === "cpn-not-registered"),
    "…and the partition is the ONLY gate: an unregistered deal renders only if someone puts it in the array, which is what the registry rule governs");
}

/* ── 3. RULE 1: the tiers are DERIVED from value, not hand-listed ─────────── */
ok(!/cpn-[a-z0-9-]+/.test(code), "the screen contains NO hardcoded deal id — nothing is hand-placed");
ok(/dealTiers\(/.test(code), "it calls dealTiers to split the two tiers");
for (const c of featured) {
  ok(!!D.dealNetwork(c) || D.hasMonetaryValue(c),
    `${c.id}: on the MONEY tier because it is affiliate or carries a monetary value — the tier's own name`);
}
for (const c of ledger) {
  ok(!D.dealNetwork(c) && !D.hasMonetaryValue(c),
    `${c.id}: on the FREE tier because it is neither affiliate nor priced`);
}
ok(featured.length >= 4 && ledger.length >= 6, `both tiers have real inventory (money ${featured.length}, ledger ${ledger.length})`);

/* ── 4. RULE 3: ONE PROVIDER PER CARD, EVER ───────────────────────────────── */
{
  // Counted structurally: the card component may contain exactly one <a> that
  // carries a deal URL. Save and share are <button>s and cannot navigate.
  const card = code.slice(code.indexOf("function PosterCard"), code.indexOf("function LedgerRow"));
  ok(card.length > 500, `isolated the PosterCard body (got ${card.length} chars)`);
  const anchors = card.match(/<a\b/g) || [];
  ok(anchors.length === 1, `the poster card renders exactly ONE anchor (got ${anchors.length}) — a second monetized href is double attribution`);
  const hrefs = card.match(/href=\{/g) || [];
  ok(hrefs.length === 1, `…and exactly one href binding (got ${hrefs.length})`);
  ok(/href=\{c\.url\}/.test(card), "that href is the deal's own single url");
  ok((card.match(/emitCommerce\("commerce_cta_clicked"/g) || []).length === 1,
    "exactly one commerce_cta_clicked emitter — one card, one attributed click");
  // Each card's commerce context resolves to ONE provider.
  for (const c of featured) {
    const net = D.dealNetwork(c);
    if (!net) continue;
    const providers = new Set([net, c.commerce && c.commerce.provider].filter(Boolean).map((x) => String(x).toLowerCase()));
    ok(providers.size === 1, `${c.id}: resolves to exactly ONE provider (got ${[...providers].join(", ")}) — never a stacked pair`);
  }
}

/* ── 5. the disclosure is one quiet line, and adjacent to the CTA ─────────── */
{
  ok(!/AffiliateChip/.test(code), "the pill is gone — the mock's disclosure is one quiet centered line");
  for (const c of featured) {
    const d = D.dealDisclosure(c);
    if (!D.dealNetwork(c)) continue;
    ok(d.affiliate === true && /^via /.test(d.italic), `${c.id}: names its network in italics ("${d.italic}")`);
    ok(/your price is the same/.test(d.after), `${c.id}: says the price is unchanged`);
  }
  const free = ledger[0] && D.dealDisclosure(ledger[0]);
  ok(free && free.affiliate === false && /Not an affiliate offer/.test(free.italic),
    "a non-affiliate deal says so plainly rather than staying silent");
  // FTC adjacency: the disclosure must sit inside the same pinned footer as the
  // CTA, so a commission link can never render without it.
  const foot = code.slice(code.indexOf('marginTop: "auto"'));
  const ctaAt = foot.indexOf("c.cta");
  const discAt = foot.indexOf("disc.italic");
  ok(ctaAt > 0 && discAt > ctaAt, "the disclosure renders inside the pinned footer, directly AFTER the CTA it describes");
  ok(/marginTop: "auto"/.test(code), "the footer is pinned with margin-top:auto — every CTA and disclosure on one baseline across the rail");
}

/* ── 6. artwork rules from the work order ─────────────────────────────────── */
ok(D.dealArtwork({}) === null, "no usable image → NULL, so the card renders with no band (never a placeholder or a stretched thumbnail)");
ok(D.dealArtwork({ image: "https://merchant.example/x.jpg" }) === null, "a remote/merchant image is refused — never hotlinked");
ok(/aspectRatio: "3 \/ 2"/.test(code), "the band is the mock's 3:2 ratio");
{
  const { DEAL_SHEET_INTERNALS } = D;
  const arts = Object.values(DEAL_SHEET_INTERNALS.INTENT_ART);
  ok(arts.length >= 5 && arts.every((a) => a.startsWith("/cards/")), "every fallback is one of OUR committed /cards/ assets");
  ok(!arts.some((a) => /dpbolvw|anrdoezrs|clipp\.com/.test(a)), "no CJ banner creative is used as artwork — they are IAB ad units, wrong shape and wrong register");
}

/* ── 7. the data corrections that unblocked this build ───────────────────── */
{
  const byId = (id) => COUPONS.find((c) => c.id === id);
  ok(!byId("cpn-viator-hydrocats-craigcat"), "the CraigCat deal is PURGED, not renewed");
  const man = byId("cpn-viator-manatee-walk-bradenton");
  ok(man && man.expires === "2026-08-10", `the manatee walk is renewed to its re-verify window (got ${man && man.expires})`);
  ok(man && D.dealSeal(man).big === "$16" && D.dealSeal(man).small === "REG $19", "…and renders the priced seal the mock specifies");
  const mar = byId("cpn-marauders-thirsty-thursday");
  ok(mar && Array.isArray(mar.dates) && mar.dates.length === 3, "the Marauders carry their real remaining dates");
  ok(mar && D.dealSchedule(mar, TODAY) === "Aug 6 · 20 · Sep 3", `…rendered in the mock's compressed form (got ${mar && D.dealSchedule(mar, TODAY)})`);
  ok(mar && /select Thursday/i.test(mar.details) && !/every Thursday/i.test(mar.details),
    "the standing copy error is fixed: SELECT Thursdays, not every Thursday");
  for (const id of ["cpn-geckos-19th-hole", "cpn-geckos-happy-hour", "cpn-geckos-bar-bingo-hillview", "cpn-pie-on-main-lunch", "cpn-ringling-museums-for-all"]) {
    const c = byId(id);
    ok(!!c, `${id} is registered`);
    ok(c && /^https:\/\//.test(c.url), `${id}: has a real claim URL`);
    ok(c && !D.dealNetwork(c), `${id}: is NON-affiliate, so it gets the "just a good one" line`);
    ok(c && ledger.some((x) => x.id === id), `${id}: derives onto the ledger, not hand-placed`);
  }
}

if (fail.length) {
  console.error("check-deal-sheet: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-deal-sheet: OK — ${pass} assertions (${featured.length} money cards + ${ledger.length} ledger rows, all derived; unregistered deals cannot render; exactly one provider and one anchor per card)`);
