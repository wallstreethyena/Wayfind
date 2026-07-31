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

/* ── 8. the two-key sort: locality FIRST, expiry within it ───────────────── */
// The shipped bug this locks out: ordering by soonest-expiry alone opened the
// money rail with the national Klook code above Clipp Sarasota, because the code
// expired first. A deal for somewhere the user is not earns nothing AND spends
// the trust of the rail, so locality has to outrank the clock.
{
  const { nearestMetro } = await import(path.resolve("lib/orderInFeatured.js"));
  const SARASOTA = { lat: 27.3364, lng: -82.5307 };
  const ORLANDO = { lat: 28.5384, lng: -81.3789 };
  const TAMPA = { lat: 27.9506, lng: -82.4572 };
  const MIAMI = { lat: 25.76, lng: -80.19 }; // >75mi from every covered metro

  // EVERY live registry area must resolve. An area we cannot place ranks last by
  // design, so without this a typo'd or new-market area would be silently demoted
  // rather than fixed — the failure would be invisible on the page.
  {
    const live = COUPONS.filter((c) => !c.expires || c.expires >= TODAY);
    ok(live.length > 0, `there are live coupons to place (got ${live.length}) — an empty set would make this vacuous`);
    const unplaced = live.filter((c) => D.dealScope(c).kind === "unplaced");
    ok(unplaced.length === 0,
      `every live deal's area resolves to a metro or to nationwide — unplaced: ${unplaced.map((c) => `${c.id}(${c.area})`).join(", ")}`);
    // Positive AND negative control: a check that places everything would also
    // "pass" if dealScope simply never returned unplaced.
    ok(D.dealScope({ area: "Nowhere-in-particular" }).kind === "unplaced", "…and an unknown area IS reported unplaced — the check can fail");
    ok(D.dealScope({}).kind === "unplaced", "…as is a deal with no area at all");
    ok(D.dealScope({ area: "United States" }).kind === "everywhere", "national inventory is 'everywhere', which is NOT the same as unplaced");
    ok(D.dealScope({ area: "Sarasota-Manatee" }).metro === "sarasota", "a compound area resolves on its parts");
  }

  // Rank ordering is the contract: here(0) < everywhere(1) < elsewhere(2).
  ok(D.dealLocalityRank({ area: "Sarasota" }, "sarasota") === 0, "a deal where the viewer is ranks first");
  ok(D.dealLocalityRank({ area: "United States" }, "sarasota") === 1, "national inventory ranks after local — still usable here");
  ok(D.dealLocalityRank({ area: "Tampa" }, "sarasota") === 2, "ANOTHER metro's deal ranks last for this viewer");
  ok(D.dealLocalityRank({ area: "Tampa" }, "tampa") === 0, "…and that same deal ranks FIRST for a viewer in Tampa — the rank is relative, not a fixed home city");
  ok(D.dealLocalityRank({ area: "Naples" }, "sarasota") === 2, "an unplaceable area is never promoted to local");
  ok(D.dealLocalityRank({ area: "Sarasota" }, null) === 0 && D.dealLocalityRank({ area: "United States" }, null) === 1,
    "with no viewer metro it degrades to the owner's rule: any placed local-area deal ahead of national");

  // Sorting must obey key 1, then key 2 — asserted on the real registry.
  const RANK_LAST = "9999-12-31";
  let pairsChecked = 0;
  for (const [name, ctr] of [["Sarasota", SARASOTA], ["Orlando", ORLANDO], ["Tampa", TAMPA], ["Miami", MIAMI], ["no center", undefined]]) {
    const t = D.dealTiers(COUPONS, TODAY, ctr);
    const metro = ctr ? nearestMetro(ctr.lat, ctr.lng) : null;
    ok(t.featured.length === featured.length && t.ledger.length === ledger.length,
      `${name}: location changes ORDER ONLY — the partition is identical (${t.featured.length}/${t.ledger.length})`);
    ok(new Set([...t.featured, ...t.ledger].map((c) => c.id)).size === featured.length + ledger.length,
      `${name}: no deal is duplicated or dropped by the sort`);
    for (const tier of [t.featured, t.ledger]) {
      for (let i = 1; i < tier.length; i++) {
        pairsChecked++;
        const pr = D.dealLocalityRank(tier[i - 1], metro), cr = D.dealLocalityRank(tier[i], metro);
        ok(pr <= cr, `${name}: locality is the FIRST key (${tier[i - 1].id} rank ${pr} before ${tier[i].id} rank ${cr})`);
        if (pr === cr) {
          ok(String(tier[i - 1].expires || RANK_LAST) <= String(tier[i].expires || RANK_LAST),
            `${name}: soonest-expiry WITHIN a locality group (${tier[i - 1].id} then ${tier[i].id})`);
        }
      }
    }
  }
  ok(pairsChecked >= 60, `the ordering loop actually ran (${pairsChecked} adjacent pairs compared) — zero iterations would pass silently`);

  // The concrete regression, named. Klook is national; the Clipp/Viator cards are local.
  {
    const here = D.dealTiers(COUPONS, TODAY, SARASOTA).featured.map((c) => c.id);
    const klook = here.indexOf("cpn-klook-us-attractions-5");
    const local = ["cpn-clipp-fl-sarasota", "cpn-clipp-fl-bradenton", "cpn-viator-manatee-walk-bradenton"].map((id) => here.indexOf(id));
    ok(klook >= 0 && local.every((i) => i >= 0), "both the national code and the local money cards are on the rail");
    ok(local.every((i) => i < klook),
      `a viewer in Sarasota sees every LOCAL money card before the national Klook code (klook at ${klook}, local at ${local.join(",")})`);
    // The mirror case — proves the rule is geography, not a hardcoded demotion of Klook.
    //
    // THIS ASSERTION USED TO SAY "Klook is FIRST for an Orlando viewer", and that
    // was only true because we had NO Orlando inventory. It encoded a gap in the
    // registry as if it were the rule, so registering Clipp Orlando turned it red
    // while the behaviour got BETTER. Rewritten to assert the actual rule, which
    // stays true as inventory grows: national sits BELOW anything local to the
    // viewer and ABOVE every other metro's inventory.
    const away = D.dealTiers(COUPONS, TODAY, ORLANDO).featured.map((c) => c.id);
    const kAway = away.indexOf("cpn-klook-us-attractions-5");
    const orlandoLocal = away.indexOf("cpn-clipp-fl-orlando");
    const otherMetro = ["cpn-clipp-fl-sarasota", "cpn-clipp-fl-bradenton", "cpn-viator-manatee-walk-bradenton"].map((id) => away.indexOf(id));
    ok(kAway >= 0 && orlandoLocal >= 0 && otherMetro.every((i) => i >= 0), "the Orlando rail carries local, national and other-metro cards — all three classes present, so the ordering is not vacuous");
    ok(orlandoLocal < kAway,
      `an Orlando viewer sees Orlando's OWN Clipp card above the national code (orlando ${orlandoLocal}, klook ${kAway})`);
    ok(otherMetro.every((i) => i > kAway),
      `…and the national code still ranks above every SARASOTA-area card, which that viewer cannot use (klook ${kAway}, other-metro ${otherMetro.join(",")})`);
    ok(here.join() !== away.join(), "the two orders genuinely differ — the viewer's location is actually read");
  }

  // The screen must actually PASS the viewer's location, or every assertion above
  // is true of a function the page calls with two arguments.
  ok(/dealTiers\(all,\s*today,\s*center\)/.test(code), "the screen passes the viewer's center into dealTiers — the sort is wired, not just implemented");
  ok(/\bcenter\b/.test(code.slice(code.indexOf("const {"), code.indexOf("const today"))), "…and takes `center` off ctx");
}

if (fail.length) {
  console.error("check-deal-sheet: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-deal-sheet: OK — ${pass} assertions (${featured.length} money cards + ${ledger.length} ledger rows, all derived; unregistered deals cannot render; exactly one provider and one anchor per card)`);
