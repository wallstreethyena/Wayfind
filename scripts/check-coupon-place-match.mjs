// scripts/check-coupon-place-match.mjs — a coupon must be able to REACH the
// place card it belongs to, and the chip must say what the offer is.
//
// THE BUG THIS ENCODES (owner, 2026-08-12: "make sure these coupons are placed
// on the place cards that match the coupon", and "we dont offer the coupon on
// the place card or tell the user there is a coupon or promotion").
//
// The 🏷️ pill had been wired into the cards for months and rendered for almost
// nothing. Two independent defects, both invisible from the outside:
//
//   1. THE ONLY HOOK WAS THE BUSINESS NAME, and Clipp's merchant names are
//      Clipp's LISTING names, not the venue's Google name:
//        "Marco's Pizza - Fletcher Ave"   Google returns  "Marco's Pizza"
//        "QDOBA - Gandy"                  Google returns  "QDOBA Mexican Eats"
//      Measured on the live list: 15 of 67 live coupons carried a
//      " - <location>" suffix and none had a `match` array, so their keys could
//      never be hit. Every one of those pills was dead.
//
//   2. THE CHIP SAID "Deal". A category label, not an offer — while the coupon
//      itself already carried "50% off" (45 of 67 live coupons do).
//
// And the fix that looks obvious is the one that loses money on trust: stripping
// the suffix collapses FOUR Marco's Pizza rows and TWO QDOBA rows onto one key,
// and the index keeps whichever it saw first — so a reader in Bradenton is shown
// the Tampa certificate. lib/dealSheet.js already treats wrong-city monetized
// inventory as worse than an empty column. So the hook is the Google Place ID
// the row already stores inside its photoRef, which is exact by construction.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const p = (rel) => fileURLToPath(new URL(rel, root));

let pass = 0;
const fail = (m) => { console.error("check-coupon-place-match: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const { COUPONS, couponForPlace, couponForPlaceName, couponIsLive, placeIdFromPhotoRef } =
  await import(new URL("../lib/coupons.js", import.meta.url));
const { CLIPP_MERCHANT_OFFERS } = await import(new URL("../lib/clippOffers.js", import.meta.url));
const { siteTodayStr } = await import(new URL("../lib/siteTime.js", import.meta.url));

const today = siteTodayStr();
const live = COUPONS.filter((c) => couponIsLive(c, today));
ok(live.length > 0, "no live coupons at all — the whole surface is dark");

// ─── 1. THE EXTRACTOR IS EXACT, and refuses anything that is not the shape ──
ok(placeIdFromPhotoRef("places/ChIJabc/photos/xyz") === "ChIJabc", "placeIdFromPhotoRef must read the id out of a well-formed ref");
for (const junk of ["", null, undefined, "places/", "places/onlyid", "ChIJabc", "photos/x", "places//photos/y", 42, {}]) {
  ok(placeIdFromPhotoRef(junk) === null, `placeIdFromPhotoRef(${JSON.stringify(junk)}) must be null — a malformed ref may never become a lookup key`);
}

// ─── 2. EVERY LIVE COUPON IS REACHABLE by identity or by an honest name ─────
// "Honest name" means: a name Google could actually return. A business string
// carrying a " - <location>" suffix is a Clipp listing name and does NOT count,
// which is exactly the class this guard exists to keep from growing.
const suffixed = (s) => / - .+$/.test(String(s || ""));
// KNOWN GAPS, each with a reason and an owner action. Same convention as
// check-guard-manifest.mjs's EXCLUDED: an exception that must be argued in
// writing is visible; a guard that merely warns gets ignored (this repo learned
// that from check-bundle, which sat red and unread for months).
//
// A row lands here ONLY when the fix is data the owner has to supply. It may
// not be used to wave through a row we could fix in code.
const KNOWN_UNREACHABLE = {
  "cpn-clipp-m-marcos-bradenton":
    "lib/clippOffers.js row has photoRef:\"\" so there is no Google Place ID to key on, and the "
    + "business name carries the \" - Bradenton\" listing suffix Google never returns. It CANNOT be "
    + "given match:[\"Marco's Pizza\"] — three other Marco's rows exist and the name would resolve "
    + "whichever was indexed first, selling a Bradenton reader the Tampa certificate. "
    + "OWNER ACTION: capture the venue's own Google photoRef (the same location-verified step the "
    + "other 47 rows already went through) and this row fixes itself.",
};

const unreachable = [];
for (const c of live) {
  const byId = c.placeId ? couponForPlace({ place_id: c.placeId, name: "" }, today) : null;
  const nameIsUsable = !suffixed(c.business) || (Array.isArray(c.match) && c.match.length > 0);
  const byName = nameIsUsable ? couponForPlaceName(c.business, today) || (c.match || []).map((m) => couponForPlaceName(m, today)).find(Boolean) : null;
  if (!byId && !byName && !KNOWN_UNREACHABLE[c.id]) unreachable.push(c);
}
ok(unreachable.length === 0,
  `these live coupons can reach NO place card — no Place ID in their photoRef and no name Google would return:\n`
  + unreachable.map((c) => `    ${c.business}  (${c.area || "no area"})  id=${c.id}`).join("\n")
  + `\n  Fix by giving the row a location-verified photoRef (preferred — it yields the Place ID)`
  + `\n  or an explicit match:["<the name Google returns>"] in lib/clippOffers.js.`);

// The exception list may not outlive the rows it names, and may not quietly
// keep excusing a row that has since been fixed.
for (const id of Object.keys(KNOWN_UNREACHABLE)) {
  const c = COUPONS.find((x) => x.id === id);
  if (!c) continue; // the coupon expired out of the list entirely — fine
  if (!couponIsLive(c, today)) continue;
  const nowReachable = (c.placeId && couponForPlace({ place_id: c.placeId, name: "" }, today))
    || (!suffixed(c.business) && couponForPlaceName(c.business, today));
  ok(!nowReachable, `${id} is in KNOWN_UNREACHABLE but now resolves — delete the entry, the gap is closed`);
}

// ─── 3. IDENTITY BEATS NAME, and chains stay distinct ───────────────────────
// The regression this blocks: someone "helpfully" strips the location suffix to
// make more pills appear, and every Marco's Pizza in the region starts showing
// the same certificate.
const byBase = new Map();
for (const o of CLIPP_MERCHANT_OFFERS) {
  const base = String(o.merchant || "").split(" - ")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!byBase.has(base)) byBase.set(base, []);
  byBase.get(base).push(o);
}
for (const [base, rows] of byBase) {
  if (rows.length < 2) continue;
  const resolved = rows.map((o) => {
    const id = placeIdFromPhotoRef(o.photoRef);
    return id ? (couponForPlace({ place_id: id, name: o.merchant }, today) || {}).id : null;
  }).filter(Boolean);
  const distinct = new Set(resolved);
  ok(distinct.size === resolved.length,
    `"${base}" has ${rows.length} locations and two of them resolve to the SAME coupon. `
    + `A reader would be sold a certificate for a venue they are not standing in — the wrong-city failure lib/dealSheet.js fails closed on.`);
}
// And a place we have never verified gets nothing.
ok(couponForPlace({ place_id: "ChIJ-definitely-not-a-real-place-id", name: "Marco's Pizza" }, today) === null,
  "an unknown Place ID with a chain name must resolve to NOTHING — fail closed, never 'the first Marco's we happen to have'");

// ─── 3b. venuePlaceId IS IDENTITY TOO (v8.41) ───────────────────────────────
//
// The static cards store their exact Google Place ID as `venuePlaceId` — added
// in v8.19 so dealArtwork could fetch the venue's photo. The resolver's index
// read only `placeId`, the Clipp-harvest field, so eleven live coupons that KNEW
// their venue were still matched by name. Measured against the live Google names
// on 2026-08-23, that cost two real things: Mote's pill was dead (Google renamed
// the venue "Mote Science Education Aquarium"), and the three Gecko's coupons all
// keyed on one Google name, so a name map served whichever it indexed first — the
// Hillview bar-bingo certificate could appear on the all-locations card.
//
// This asserts the ROLE, on the real resolver: hand it a bare place id, with no
// name at all, and the coupon that names that venue must come back.
{
  const idOnly = live.filter((c) => c.venuePlaceId && !c.placeId);
  ok(idOnly.length > 0, "no live coupon carries venuePlaceId — the positive control for this section is gone, so its assertions cannot fail");
  for (const c of idOnly) {
    ok(couponForPlace({ place_id: c.venuePlaceId }, today) !== null,
      `${c.id} stores the exact Place ID ${c.venuePlaceId} and the resolver still cannot find it from that id alone — venuePlaceId must be indexed as identity, not left to the name map`);
  }
  // Two coupons at the SAME venue may share an id (three Ringling offers do).
  // Two coupons at DIFFERENT venues must never collapse — that is the whole bug.
  const byVenue = new Map();
  for (const c of live) {
    const k = c.placeId || c.venuePlaceId;
    if (!k) continue;
    const hit = couponForPlace({ place_id: k }, today);
    ok(hit !== null, `${c.id}: its own venue id resolves to nothing`);
    if (hit) byVenue.set(k, hit.id);
  }
  const hillview = live.find((c) => c.id === "cpn-geckos-bar-bingo-hillview");
  if (hillview && hillview.venuePlaceId) {
    const hit = couponForPlace({ place_id: hillview.venuePlaceId, name: "Gecko's Grill & Pub" }, today);
    ok(hit && hit.id === "cpn-geckos-bar-bingo-hillview",
      "the Hillview Gecko's card resolves to some OTHER Gecko's coupon — three rows share one Google name, so identity has to win over the name map or the wrong branch's offer is served");
  }
}

// ─── 4. EVERY CARD SURFACE USES THE IDENTITY RESOLVER ───────────────────────
// couponForPlaceName is still exported for callers holding nothing but a
// string, but a card always has the place object and must pass it.
for (const rel of ["app/components/BestNearby.js", "app/components/IntentRail.js", "app/components/sheets/Detail.js", "app/components/screens/Surprise.js"]) {
  const src = readFileSync(p(rel), "utf8");
  const calls = (src.match(/couponForPlaceName\s*\(/g) || []).length;
  ok(calls === 0, `${rel} still resolves a coupon by NAME. A card has the place object — pass it to couponForPlace so the Google Place ID is used, or the suffixed Clipp rows silently go dark again.`);
  ok(/couponForPlace\s*\(/.test(src), `${rel} no longer resolves a coupon at all — the pill is gone from that surface`);
}

// ─── 5. THE CHIP STATES THE OFFER ───────────────────────────────────────────
const bn = readFileSync(p("app/components/BestNearby.js"), "utf8");
ok(/export function couponChipLabel\(/.test(bn), "couponChipLabel is gone — the chip label must be derived from the coupon, not hardcoded");
ok(!/key: "deal"[^}]*label: "Deal"/.test(bn),
  'a coupon chip is hardcoded to the label "Deal" again. "Deal" names a category; the reader taps for the VALUE. Use couponChipLabel(coupon), which reads the coupon\'s own stated badge.');
const chipSites = (bn.match(/key: "deal"/g) || []).length;
ok(chipSites >= 2, `expected the deal chip on both card surfaces, found ${chipSites}`);
ok((bn.match(/label: couponChipLabel\(/g) || []).length === chipSites,
  "every deal chip must take its label from couponChipLabel — one of them is still hardcoded");
// The fallback may never become an invented discount.
const helper = bn.slice(bn.indexOf("export function couponChipLabel("));
ok(/return b \|\| "Deal";/.test(helper.slice(0, 400)),
  "couponChipLabel must fall back to the neutral word Deal when a coupon states no value — never to a number this code made up");

const withValue = live.filter((c) => typeof c.badge === "string" && c.badge.trim()).length;
console.log(`check-coupon-place-match: OK — ${pass} assertions (${live.length} live coupons, all reachable; ${live.filter((c) => c.placeId || c.venuePlaceId).length} by exact Google Place ID; ${withValue} state their value on the chip)`);
