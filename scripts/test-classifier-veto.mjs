// scripts/test-classifier-veto.mjs — locks the placeAllowed veto order (item7).
// The classifier admitted on a positive allow-token BEFORE running the service /
// category-exclude vetoes, so a place could sneak in on a SUBSTRING match. The
// vetoes now run first, but IDENTITY-PROTECTED: a real destination that merely
// carries a service type (a zoo with veterinary_care, a marina with storage) has a
// real primaryCategory + a real allow token and must still pass.
import { placeAllowed } from "../lib/placeFilter.js";
import { primaryCategory } from "../lib/placeCategory.js";

let pass = 0;
const fail = (m) => { console.error("test-classifier-veto: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const mk = (name, types) => ({ name, types });

// ── B16: bare "parking" (no destination identity) must not leak into Beach / attractions ──
ok(placeAllowed("beach", null, mk("Gulf Coast Lot", ["parking"])) === false, "B16: a bare-parking place is not a Beach result");
ok(placeAllowed("attractions", null, mk("Center City Parking", ["parking"])) === false, "B16: bare parking is not a Things-to-do result");
ok(placeAllowed("beach", null, mk("Marina Deck", ["parking_lot"])) === false, "parking_lot stays excluded");

// ── SF1: an adult venue that ALSO carries a family-ish type must not lead Family ──
ok(placeAllowed("family", "all", mk("Neon Strike", ["amusement_center", "night_club"])) === false, "SF1: amusement_center + night_club is not a Family result");
ok(placeAllowed("family", "all", mk("Lucky Lanes", ["bowling_alley", "casino"])) === false, "SF1: bowling_alley + casino excluded from Family");
ok(placeAllowed("family", "kids", mk("Arcadia", ["video_arcade", "night_club"])) === false, "SF1: arcade + night_club excluded from Family (kids)");

// ── PROTECTED: real destinations carrying an incidental service type stay allowed ──
ok(placeAllowed("attractions", null, mk("City Zoo", ["zoo", "veterinary_care"])) === true, "PROTECTED: a zoo carrying veterinary_care is still an attraction");
ok(placeAllowed("beach", null, mk("Bayfront Marina", ["marina", "storage"])) === true, "PROTECTED: a marina carrying storage is still a Beach result");
ok(placeAllowed("family", "all", mk("City Zoo", ["zoo"])) === true, "a clean family-appropriate venue (zoo) is allowed");
ok(placeAllowed("attractions", null, mk("Museum of Art", ["museum"])) === true, "a clean museum is still an attraction (no over-veto)");

// ── the mechanism: protected cases have a real primaryCategory; the leaks don't ──
ok(primaryCategory(mk("City Zoo", ["zoo", "veterinary_care"])) != null, "zoo has a real primaryCategory -> identity-protected");
ok(primaryCategory(mk("Bayfront Marina", ["marina", "storage"])) != null, "marina has a real primaryCategory -> identity-protected");
ok(primaryCategory(mk("Gulf Coast Lot", ["parking"])) == null, "a bare-parking place has NO primaryCategory -> vetoed");

// ── SF2: health/tobacco services must not lead Shopping via the broad "store" token ──
ok(placeAllowed("shopping", "all", mk("Corner Rx", ["drugstore", "store"])) === false, "SF2: a drugstore does not lead Shopping");
ok(placeAllowed("shopping", "all", mk("Smoke Spot", ["tobacco_store"])) === false, "SF2: a tobacco store does not lead Shopping");
ok(placeAllowed("shopping", "all", mk("Macy S", ["department_store"])) === true, "a real department store is still Shopping (no over-veto)");
ok(placeAllowed("shopping", "all", mk("Book Nook", ["book_store"])) === true, "a bookstore is still Shopping");

console.log(`test-classifier-veto: OK — ${pass} assertions (vetoes before allow; parking/adult-in-family/drugstore closed; zoo/marina/dept-store protected)`);
