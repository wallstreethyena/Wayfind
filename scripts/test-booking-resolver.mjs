// Booking-CTA integrity, Phase 5 golden tests. These are the acceptance
// fixtures named in the original spec: a free/generic place-name match must
// never render a CTA, a genuine venue-specific product must, a delisted
// (no-longer-bookable) offer must suppress, and a generic high-fan-out
// product must never win over a specific one. Runs in prebuild.
import { resolveVerified, resolveVerifiedMany, scoreCandidate } from "../lib/bookingResolver.js";
import { buildVerifiedOffer, isLiveEligible, STATUS } from "../lib/verifiedOffers.js";

let failures = 0;
const fail = (m) => { console.error("test-booking-resolver: FAIL — " + m); failures++; };

// 1. Bradenton Riverwalk vs. a generic area-highlights tour that only
//    mentions the city -- the exact false positive from the diagnosis.
//    No distinctive-name evidence at all -> no offer, ever.
{
  const place = { name: "Bradenton Riverwalk" };
  const products = [{ title: "Bradenton Area Highlights Tour", productUrl: "https://www.viator.com/tours/x1", productCode: "X1" }];
  const offer = resolveVerified(place, products, { region: "Bradenton, Tampa Bay", kind: "waterfront" });
  if (offer) fail("generic area tour rendered a CTA for Bradenton Riverwalk: " + JSON.stringify(offer));
}

// 2. The same place against a product that actually names it -> a live
//    offer pointing at the correct product.
{
  const place = { name: "Bradenton Riverwalk" };
  const products = [
    { title: "Bradenton Area Highlights Tour", productUrl: "https://www.viator.com/tours/x1", productCode: "X1" },
    { title: "Historic Bradenton Riverwalk Walking Tour", productUrl: "https://www.viator.com/tours/x2", productCode: "X2" },
  ];
  const offer = resolveVerified(place, products, { region: "Bradenton, Tampa Bay", kind: "waterfront" });
  if (!offer) fail("genuine Riverwalk-specific product did not clear the bar");
  else if (offer.status !== STATUS.LIVE) fail("genuine Riverwalk-specific product not marked live: " + offer.status);
  else if (offer.productCode !== "X2") fail("wrong product won: " + offer.productCode);
}

// 3. Delisted: identical evidence to a passing offer, but no longer
//    bookable -> must suppress regardless of confidence.
{
  const good = buildVerifiedOffer({ placeId: "p1", productUrl: "https://www.viator.com/tours/x2", commissionable: true, bookableNow: true, confidence: 0.9, evidence: { entityMatch: 1 } });
  if (good.status !== STATUS.LIVE) fail("sanity: well-evidenced offer should be live before delisting");
  const delisted = buildVerifiedOffer({ ...good, bookableNow: false });
  if (delisted.status !== STATUS.SUPPRESSED) fail("delisted (bookableNow:false) offer was not suppressed");
  if (isLiveEligible(delisted)) fail("isLiveEligible true for a delisted offer");
}

// 4. Generic high-fan-out product must never win as a primary CTA, even
//    with a full entity-name match, once it's been seen matching many
//    distinct places -- specificity must be able to flip eligibility on
//    its own, not just nudge the score.
{
  const place = { name: "Cortez Fishing Village" };
  const product = { title: "Cortez Fishing Village Food & Culture Walking Tour", productUrl: "https://www.viator.com/tours/y1", productCode: "Y1" };
  const specific = scoreCandidate(place, product, { region: "Bradenton, Tampa Bay", kind: "museum", fanoutCount: 1 });
  const genericBundle = scoreCandidate(place, product, { region: "Bradenton, Tampa Bay", kind: "museum", fanoutCount: 60 });
  if (specific.evidence.entityMatch !== genericBundle.evidence.entityMatch) fail("fan-out changed entity match, it should only change specificity");
  if (!(specific.confidence >= 0.72)) fail("low fan-out case should clear the threshold on its own: " + specific.confidence);
  if (!(genericBundle.confidence < 0.72)) fail("high fan-out case should NOT clear the threshold: " + genericBundle.confidence);
  const liveOffer = resolveVerified(place, [product], { region: "Bradenton, Tampa Bay", kind: "museum", fanoutCount: 1 });
  const suppressedOffer = resolveVerified(place, [product], { region: "Bradenton, Tampa Bay", kind: "museum", fanoutCount: 60 });
  if (!liveOffer) fail("specific (low fan-out) product should have resolved to a live offer");
  if (suppressedOffer) fail("high fan-out product resolved to a live offer, should have been suppressed: " + JSON.stringify(suppressedOffer));
}

// 5. Ties break toward no button: an empty candidate list, or a place with
//    no distinctive name tokens at all, must never fabricate an offer.
{
  const offerEmpty = resolveVerified({ name: "Riverwalk" }, [], { region: "Bradenton, Tampa Bay" });
  if (offerEmpty) fail("empty candidate list produced an offer");
  const offerIndistinct = resolveVerified({ name: "Bradenton" }, [{ title: "Bradenton Highlights Tour", productUrl: "https://www.viator.com/tours/z1" }], { region: "Bradenton, Tampa Bay" });
  if (offerIndistinct) fail("a place name with zero distinctive tokens (just the city) produced an offer");
}

// 6. Multi-candidate list surfaces (resolveVerifiedMany, the "Book tours &
//    experiences" card list): each candidate's fan-out must be scored
//    against ITS OWN history, never borrowed from a neighboring candidate.
{
  const place = { name: "Cortez Fishing Village" };
  const specificProduct = { title: "Cortez Fishing Village Food & Culture Walking Tour", productUrl: "https://www.viator.com/tours/y1", productCode: "Y1" };
  const bundleProduct = { title: "Bradenton Area Highlights Tour", productUrl: "https://www.viator.com/tours/x1", productCode: "X1" };
  const offers = resolveVerifiedMany(place, [bundleProduct, specificProduct], {
    region: "Bradenton, Tampa Bay",
    kind: "museum",
    fanoutByCode: { X1: 200, Y1: 1 },
  });
  if (offers.length !== 1) fail("expected exactly one surviving candidate, got " + offers.length + ": " + JSON.stringify(offers.map((o) => o.productCode)));
  else if (offers[0].productCode !== "Y1") fail("wrong candidate survived resolveVerifiedMany: " + offers[0].productCode);
}

if (failures) process.exit(1);
console.log("test-booking-resolver: OK — default-deny resolver behaves on all golden fixtures");
