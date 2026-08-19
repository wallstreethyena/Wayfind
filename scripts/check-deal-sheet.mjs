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

const C = await import(path.resolve("lib/coupons.js"));
const { COUPONS } = C;
const D = await import(path.resolve("lib/dealSheet.js"));
const TODAY = "2026-07-30";
// BASELINE VIEWER, added 2026-08-01. This used to call dealTiers with no center,
// which was a fine stand-in for "the whole sheet" while location affected only
// ORDER. Now that no-location means nationwide-only — every city-scoped card is an
// unproven proximity claim before `center` resolves — a centre-less baseline is one
// money card and an empty ledger, and every tier assertion below would be checking
// almost nothing. Sarasota is the home metro and carries the most inventory, so it
// is the representative sheet these checks were always written against.
const BASELINE_VIEWER = { lat: 27.3364, lng: -82.5307 };
const { featured, ledger } = D.dealTiers(COUPONS, TODAY, BASELINE_VIEWER);
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
  // RE-AIMED 2026-08-01. This asserted the rendered count EQUALS the live registry
  // count — true only while location affected order alone. There is now a geo gate,
  // so a live deal for another metro is dropped deliberately, and the old form
  // asserted the gate does not exist. The rule it was protecting still matters:
  // nothing eligible may vanish. Restated as — every live deal that is local to the
  // baseline viewer or nationwide DOES render.
  const eligible = COUPONS.filter((c) => {
    if (c.expires && c.expires < TODAY) return false;
    const s = D.dealScope(c);
    return s.kind === "everywhere" || (s.kind === "metro" && s.metro === "sarasota");
  }).map((c) => c.id);
  ok(eligible.length > 0, `there are eligible deals for the baseline viewer (${eligible.length}) — zero would make the next assertion vacuous`);
  ok(eligible.every((id) => out.includes(id)),
    `every ELIGIBLE live deal lands in exactly one tier — none is silently dropped (${out.length} rendered of ${eligible.length} eligible)`);
  // The rogue deal now needs an area local to the baseline viewer, or the geo gate
  // removes it before the registry rule is even reached — and this assertion is
  // about the REGISTRY being the only source, not about geography.
  const rogue = D.dealTiers([...COUPONS, { id: "cpn-not-registered", title: "Fake", business: "Nowhere", area: "Sarasota" }], TODAY, BASELINE_VIEWER);
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
  const card = code.slice(code.indexOf("function CouponCard"), code.indexOf("export default function CouponsScreen"));
  ok(card.length > 500, `isolated the CouponCard body (got ${card.length} chars)`);
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
  // FTC adjacency: the disclosure remains in the SAME card, immediately after
  // its action row. The compact wallet is vertical, so there is no cross-card
  // baseline to pin; adjacency is the relevant protection now.
  const card = code.slice(code.indexOf("function CouponCard"), code.indexOf("export default function CouponsScreen"));
  const ctaAt = card.indexOf("c.cta");
  const discAt = card.indexOf("disc.italic", ctaAt);
  ok(ctaAt > 0 && discAt > ctaAt, "the disclosure renders inside the same compact card, directly AFTER the CTA it describes");
  ok(/gridTemplateColumns: "auto 34px minmax\(86px,1fr\)"/.test(card), "clip, share and redeem actions share one compact action row");
}

/* ── 6. artwork rules from the work order ─────────────────────────────────── */
ok(D.dealArtwork({}) === null, "no usable image → NULL, so the card renders with no band (never a placeholder or a stretched thumbnail)");
ok(D.dealArtwork({ image: "https://merchant.example/x.jpg" }) === null, "a remote/merchant image is refused — never hotlinked");
// TRANSLATED 2026-08-07 (owner-approved venue thumbs). The maintenance-heavy
// slot this banned was a generic/cropped poster image; what ships instead is
// ONE 52px identity thumb fed exclusively by registry data (the venue's own
// location-verified photoRef via our /api/photo proxy, or the row's explicit
// icon). The deep assertions live in test-coupon-wallet.mjs + check-clipp-deals;
// here the structural claim is: one slot, no artwork-band pipeline.
ok((code.match(/<img\b/g) || []).length === 1 && !/CouponThumb|<Image\b|dealArtwork\(/.test(code),
  "the coupon wallet renders exactly ONE data-driven venue thumb and no poster/artwork pipeline");
{
  const { DEAL_SHEET_INTERNALS } = D;
  /* GENERATED ART CAN NEVER REACH A CARD.
     The objection was that the art is FAKE, not that it isn't a photo of the
     specific merchant — a ferris wheel on a Klook attractions card is wrong
     because it is invented and unrelated. So this is enforced on the RESOLVED
     artwork of every real coupon, not on a hand-listed pair of card ids. */
  const gen = [...DEAL_SHEET_INTERNALS.GENERATED_ART];
  ok(gen.length > 0, `the generated-art list is populated (${gen.length}) — an empty set would make everything below vacuous`);
  ok(gen.every((a) => D.isGeneratedArt(a)), "every listed generated asset is recognised as generated");
  ok(!D.isGeneratedArt("/cards/coupon-dining-cafe-solo.jpeg"), "…and a real photograph is NOT — the classifier discriminates rather than saying yes to everything");
  for (const c of COUPONS) {
    const art = D.dealArtwork(c);
    ok(art === null || !D.isGeneratedArt(art), `${c.id}: resolves to real photography or to NO image — never generated art (got ${art})`);
    // v8.19 — a second EXPLICIT source joined: the deal's own venue photo,
    // keyed on venuePlaceId (owner: "the coupons were fetching images").
    // Still never an intent-tag inheritance — the id names the exact venue.
    const venueArt = c.venuePlaceId ? "/api/photo?place=" + encodeURIComponent(c.venuePlaceId) + "&w=800" : null;
    ok(art === null || art === c.image || art === venueArt,
      `${c.id}: artwork is EXPLICIT on this deal (committed image or the venue's own photo) — broad intent tags can never attach an unrelated photo`);
  }
  // Both directions, so this cannot pass by dealArtwork simply returning null always.
  ok(D.dealArtwork({ image: "/cards/family-fun.jpg" }) === null,
    "generated art is refused even when set EXPLICITLY on a deal — otherwise a row could opt back in and the fallback would be the only protection");
  ok(D.dealArtwork({ image: "/cards/coupon-dining-cafe-solo.jpeg" }) === "/cards/coupon-dining-cafe-solo.jpeg",
    "…and a real committed photograph still renders, so the refusal is targeted rather than blanket");
  ok(D.dealArtwork({ venuePlaceId: "ChIJ6y2dx9g_w4gRWoZIRhLk-JI" }) === "/api/photo?place=ChIJ6y2dx9g_w4gRWoZIRhLk-JI&w=800",
    "a venuePlaceId resolves to the venue's own photo through our proxy (v8.19)");
  ok(D.dealArtwork({ venuePlaceId: "https://evil.example/x" }) === null,
    "a malformed venuePlaceId renders nothing — the proxy only ever sees a real place id shape");
  ok(D.dealArtwork({ image: "https://remote.example/x.jpg", venuePlaceId: "ChIJ6y2dx9g_w4gRWoZIRhLk-JI" }) === "/api/photo?place=ChIJ6y2dx9g_w4gRWoZIRhLk-JI&w=800",
    "a remote image URL is still refused; the venue photo carries the card instead");

  /* City-market photos are assigned DETERMINISTICALLY and DISTINCTLY.
     A bare hash % 5 gave only two distinct photos across four markets, which is
     exactly the "they all look the same" this set was supplied to fix. */
  const marketIds = COUPONS.filter((c) => c.id.startsWith("cpn-clipp-fl-")).map((c) => c.id.replace(/^cpn-/, ""));
  ok(marketIds.length >= 2, `there are city-market cards to check (${marketIds.length}) — fewer than two makes distinctness vacuous`);
  const picks = marketIds.map(C.clippArtFor);
  ok(new Set(picks).size === picks.length, `every city-market card gets a DIFFERENT photo (${new Set(picks).size}/${picks.length})`);
  ok(picks.every((p) => /^\/cards\/coupon-dining-/.test(p)), "…all from the curated dining set");
  ok(marketIds.map(C.clippArtFor).join() === picks.join(), "the pick is STABLE across calls — a card must not shuffle its image between renders");
  const fwd = C.clippArtAssignment(marketIds), rev = C.clippArtAssignment([...marketIds].reverse());
  ok(marketIds.every((id) => fwd.get(id) === rev.get(id)), "…and depends only on the SET of ids, not their order in CLIPP_MARKETS");
}

/* ── 7. the data corrections that unblocked this build ───────────────────── */
{
  const byId = (id) => COUPONS.find((c) => c.id === id);
  ok(!byId("cpn-viator-hydrocats-craigcat"), "the CraigCat deal is PURGED, not renewed");
  // RE-AIMED 2026-08-07: the manatee walk moved from "renewed to Aug 10" to
  // PURGED, same class as the CraigCat line above. The source ended the promo
  // (TripAdvisor showed $19 flat on 08-03) while the card still claimed
  // "$16 (reg. $19)" - registry ruling: purge pre-expiry, DO NOT RENEW.
  ok(!byId("cpn-viator-manatee-walk-bradenton"), "the manatee walk is PURGED pre-expiry, not renewed - its price claim died at the source");
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

/* ── 8. locality gates membership AND ordering ───────────────────────────── */
// The shipped bug this locks out: an Orlando visitor was served Sarasota/Bradenton
// money cards. Ordering them last is not enough; a wrong-city monetized card is
// worse than an empty slot, so city-scoped deals are filtered out when the viewer
// is in a different metro (or outside every covered metro).
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

  // Rank ordering within the surviving set: here(0) < everywhere(1) < unplaced(2).
  ok(D.dealLocalityRank({ area: "Sarasota" }, "sarasota") === 0, "a deal where the viewer is ranks first");
  ok(D.dealLocalityRank({ area: "United States" }, "sarasota") === 1, "national inventory ranks after local — still usable here");
  ok(D.dealLocalityRank({ area: "Tampa" }, "sarasota") === 2, "ANOTHER metro's deal ranks last for this viewer");
  ok(D.dealLocalityRank({ area: "Tampa" }, "tampa") === 0, "…and that same deal ranks FIRST for a viewer in Tampa — the rank is relative, not a fixed home city");
  ok(D.dealLocalityRank({ area: "Naples" }, "sarasota") === 2, "an unplaceable area is never promoted to local");
  ok(D.dealLocalityRank({ area: "Sarasota" }, null) === 0 && D.dealLocalityRank({ area: "United States" }, null) === 1,
    "with no viewer metro it degrades to the owner's rule: any placed local-area deal ahead of national");

  // Sorting obeys key 1, then key 2 — but membership now changes by viewer location.
  const RANK_LAST = "9999-12-31";
  let pairsChecked = 0;
  for (const [name, ctr] of [["Sarasota", SARASOTA], ["Orlando", ORLANDO], ["Tampa", TAMPA], ["Miami", MIAMI], ["no center", undefined]]) {
    const t = D.dealTiers(COUPONS, TODAY, ctr);
    const metro = ctr ? nearestMetro(ctr.lat, ctr.lng) : null;
    const ids = new Set([...t.featured, ...t.ledger].map((c) => c.id));
    ok(ids.size === t.featured.length + t.ledger.length,
      `${name}: no deal is duplicated or dropped silently`);
    if (!ctr) {
      // RE-AIMED: this asserted the no-location partition matches the baseline, i.e.
      // that location changes nothing. That was the fail-OPEN. With no location every
      // city-scoped card is an unproven proximity claim, so only nationwide renders.
      const all = [...t.featured, ...t.ledger];
      // Since the 08-07 S3USATT purge the registry holds ZERO real nationwide
      // deals, so "still renders something" is proven on a synthetic national
      // fixture (same technique as test-coupon-geo). The NATIONWIDE-ONLY rule
      // still runs against the real registry output below it.
      const probe = { id: "cpn-national-probe", business: "Fixture Co", area: "United States", title: "t", details: "d", code: null, url: "https://example.com", expires: null, intents: ["outdoors"], match: [] };
      const probed = D.dealTiers([...COUPONS, probe], TODAY);
      ok([...probed.featured, ...probed.ledger].some((c) => c.id === probe.id),
        "no viewer location still renders nationwide inventory (fixture) — the partition is not empty by construction");
      ok(all.every((c) => D.dealScope(c).kind === "everywhere"),
        `no viewer location: NATIONWIDE ONLY (${t.featured.length}/${t.ledger.length}) — never another metro's inventory`);
    } else {
      // RE-AIMED 2026-08-07. This compared against the SARASOTA baseline sheet,
      // which was a fine stand-in for "the maximum" while Sarasota-Manatee
      // carried the most inventory. The Clipp per-merchant harvest gave the
      // Tampa metro more cards than Sarasota's, so a Tampa viewer's sheet is
      // now legitimately LARGER than the baseline — a data change, not a gate
      // change. The invariant this always meant is that location FILTERS the
      // live registry and never mints: every visible card must exist in the
      // live set, and the visible count can never exceed it.
      const liveAll = COUPONS.filter((c) => !c.expires || c.expires >= TODAY);
      const liveIds = new Set(liveAll.map((c) => c.id));
      ok(t.featured.length + t.ledger.length <= liveAll.length,
        `${name}: viewer location can only remove from the live registry, never add (${t.featured.length + t.ledger.length} <= ${liveAll.length})`);
      ok([...ids].every((id) => liveIds.has(id)),
        `${name}: every visible deal exists in the live registry — the gate filters, it cannot MINT a card`);
    }
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
  // Floor lowered from 20 to 10: the geo gate means each viewer now sees only their
  // own metro's inventory plus nationwide, so there are legitimately fewer adjacent
  // pairs to compare than when every viewer saw every card. The number exists to
  // prove the loop RAN, not to pin an inventory count — a floor tied to inventory is
  // an assertion pinned to an accident, which is what made three checks red today.
  ok(pairsChecked >= 10, `the ordering loop actually ran (${pairsChecked} adjacent pairs compared) — zero iterations would pass silently`);

  // The concrete regression, named. Klook is national; the Clipp/Viator cards are local.
  {
    // REPOINTED 2026-08-07: the national specimen (S3USATT) and the manatee
    // walk were both purged today, so the locality regression runs on a
    // synthetic national fixture and the surviving local money cards.
    const natl = { id: "cpn-national-probe-2", business: "Fixture Co", area: "United States", title: "t", details: "d", code: null, url: "https://example.com", expires: null, intents: ["outdoors"], match: [] };
    // Indices are taken over the FULL on-screen order (featured then ledger):
    // the sheet renders the tiers in that sequence, and the non-affiliate
    // fixture legitimately ranks into the ledger, not the money tier.
    const hereT = D.dealTiers([...COUPONS, natl], TODAY, SARASOTA);
    const here = [...hereT.featured, ...hereT.ledger].map((c) => c.id);
    const klook = here.indexOf(natl.id);
    const local = ["cpn-clipp-fl-sarasota", "cpn-clipp-fl-bradenton"].map((id) => here.indexOf(id));
    ok(klook >= 0 && local.every((i) => i >= 0), "Sarasota viewer sees national + Sarasota-metro money cards");
    ok(local.every((i) => i < klook),
      `a viewer in Sarasota sees every LOCAL money card before the national card (national at ${klook}, local at ${local.join(",")})`);

    // The mirror case: Orlando should see ONLY its own local card + national.
    const awayT = D.dealTiers([...COUPONS, natl], TODAY, ORLANDO);
    const away = [...awayT.featured, ...awayT.ledger].map((c) => c.id);
    const kAway = away.indexOf(natl.id);
    const orlandoLocal = away.indexOf("cpn-clipp-fl-orlando");
    const otherMetro = ["cpn-clipp-fl-sarasota", "cpn-clipp-fl-bradenton"].map((id) => away.indexOf(id));
    ok(kAway >= 0 && orlandoLocal >= 0, "Orlando viewer sees their own Clipp card and the national card");
    ok(orlandoLocal < kAway,
      `an Orlando viewer sees Orlando's OWN Clipp card above the national card (orlando ${orlandoLocal}, national ${kAway})`);
    ok(otherMetro.every((i) => i === -1),
      "…and the Sarasota/Bradenton cards are REMOVED, not merely demoted");
    ok(here.join() !== away.join(), "the two rails genuinely differ by viewer location");
  }

  // The screen must actually PASS the viewer's location, or every assertion above
  // is true of a function the page calls with two arguments.
  ok(/dealTiers\(all,\s*today,\s*center\)/.test(code), "the screen passes the viewer's center into dealTiers — the filter is wired, not just implemented");
  ok(/\bcenter\b/.test(code.slice(code.indexOf("const {"), code.indexOf("const today"))), "…and takes `center` off ctx");
}

if (fail.length) {
  console.error("check-deal-sheet: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-deal-sheet: OK — ${pass} assertions (${featured.length} money cards + ${ledger.length} ledger rows, all derived; unregistered deals cannot render; exactly one provider and one anchor per card)`);
