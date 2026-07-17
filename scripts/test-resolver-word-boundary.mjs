// scripts/test-resolver-word-boundary.mjs — lock for the word-boundary entity
// fix. entityMatch() used to count a hit via substring (hay.includes(token)),
// so a place whose ONLY distinctive token is a substring of its own region name
// let a generic "{City} City Sightseeing Tour" earn a full entity match and go
// live. Cowork's full-inventory simulation found exactly two such places in all
// 2,474 (Braden River Park: braden⊂bradenton; The Land: land⊂orlando). The fix
// counts a hit only on exact TOKEN equality. This test locks both the kill and
// the recall (an exact-token match must be unaffected).
import { resolveVerified, scoreCandidate } from "../lib/bookingResolver.js";
import { STATUS } from "../lib/verifiedOffers.js";

let pass = 0;
const fail = (m) => { console.error("test-resolver-word-boundary: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// ── 1. The substring false positives earn ZERO entity credit and never go live ──
const braden = scoreCandidate(
  { name: "Braden River Park" },
  { title: "Bradenton City Sightseeing Tour", productUrl: "https://www.viator.com/tours/Bradenton/x1" },
  { region: "Bradenton", kind: "nature" });
ok(braden.evidence.entityMatch === 0, "'braden' ⊂ 'bradenton' now earns ZERO entity match (was a full false-positive 1.0)");
ok(resolveVerified(
  { name: "Braden River Park" },
  [{ title: "Bradenton City Sightseeing Tour", productUrl: "https://www.viator.com/tours/Bradenton/x1", productCode: "BR1" }],
  { region: "Bradenton", kind: "nature" }) === null,
  "a generic Bradenton city tour is NEVER live for Braden River Park");

const land = scoreCandidate(
  { name: "The Land" },
  { title: "Orlando City Sightseeing Tour", productUrl: "https://www.viator.com/tours/Orlando/x2" },
  { region: "Orlando", kind: "landmark" });
ok(land.evidence.entityMatch === 0, "'land' ⊂ 'orlando' now earns ZERO entity match");
ok(resolveVerified(
  { name: "The Land" },
  [{ title: "Orlando City Sightseeing Tour", productUrl: "https://www.viator.com/tours/Orlando/x2", productCode: "OR1" }],
  { region: "Orlando", kind: "landmark" }) === null,
  "a generic Orlando city tour is NEVER live for The Land");

// ── 2. Recall preserved: an EXACT distinctive-token match is untouched ──
const mote = scoreCandidate(
  { name: "Mote Marine Laboratory & Aquarium" },
  { title: "Mote Aquarium", productUrl: "https://www.viator.com/tours/Sarasota/m1" },
  { region: "Sarasota", kind: "wildlife" });
ok(mote.evidence.entityMatch > 0, "exact-token 'mote' still matches for 'Mote Aquarium' (recall preserved at the entity level)");

const moteLive = resolveVerified(
  { name: "Mote Marine Laboratory & Aquarium" },
  [{ title: "Mote Marine Aquarium Admission in Sarasota", productUrl: "https://www.viator.com/tours/Sarasota/m2", productCode: "M2" }],
  { region: "Sarasota", kind: "wildlife" });
ok(moteLive && moteLive.status === STATUS.LIVE, "a genuine Mote Marine product still resolves LIVE (recall not regressed)");

console.log(`test-resolver-word-boundary: OK — ${pass} assertions (substring false-positives killed; exact-token recall preserved)`);
