// Gate: Wayfind market → affiliate destination map (v6.28) + monetize engine.
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "wf-dest-"));
for (const f of ["destinations", "monetize"]) copyFileSync(`lib/${f}.js`, join(tmp, `${f}.mjs`));
const D = await import(join(tmp, "destinations.mjs"));
const Mz = await import(join(tmp, "monetize.mjs"));

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("test-destinations: FAIL — " + m); fails++; } };

// The three cities Gabe asked to connect + the home market are all present.
for (const k of ["orlando", "tampa", "stpete", "sarasota", "bradenton", "clearwater"]) {
  ok(!!D.MARKETS[k], `market present: ${k}`);
}
// Verified Viator ids.
ok(D.MARKETS.orlando.viator.id === "d663", "Viator Orlando d663");
ok(D.MARKETS.tampa.viator.id === "d666", "Viator Tampa d666");
ok(D.MARKETS.stpete.viator.id === "d5403", "Viator St Pete d5403");
ok(D.MARKETS.sarasota.viator.id === "d25738", "Viator Sarasota d25738");
// Verified Tiqets/Klook ids.
ok(D.MARKETS.tampa.tiqets.id === "c79946", "Tiqets Tampa c79946");
ok(D.MARKETS.orlando.tiqets.id === "c79889", "Tiqets Orlando c79889");
ok(D.MARKETS.tampa.klook.id === "c365387", "Klook Tampa c365387");
ok(D.MARKETS.orlando.klook.id === "c700841", "Klook Orlando c700841");

// Every market has a Viator destination URL (Viator covers all 3 cities natively).
for (const k of D.MARKET_KEYS) ok(/viator\.com/.test(D.destinationUrl("viator", k) || ""), `Viator url for ${k}`);
// Missing-id networks degrade to a search URL or null, never a broken link.
ok(D.destinationUrl("tiqets", "stpete").includes("tiqets.com/en/search"), "Tiqets St Pete falls back to search");
ok(D.hasNativeDestination("viator", "orlando") === true, "Viator Orlando native");
ok(D.hasNativeDestination("klook", "stpete") === false, "Klook St Pete not native (honest)");

// Location snapping.
ok(D.marketForLocation(28.54, -81.38).key === "orlando", "snaps Orlando coords → orlando");
ok(D.marketForLocation(27.95, -82.46).key === "tampa", "snaps Tampa coords → tampa");
ok(D.marketForLocation(27.34, -82.53).key === "sarasota", "snaps Sarasota coords → sarasota");
// (NYC is now a supported market — see expansion assertions below.)
ok(D.marketForLocation(null, null) === null, "null coords safe");

// Coverage snapshot.
ok(D.coverage("klook").length === 2, "Klook natively covers 2 markets (Tampa, Orlando)");

// ── National expansion (top tourism states/cities) ──────────────────────────
for (const k of ["miami", "nyc", "lasvegas", "neworleans", "oahu", "losangeles", "sanfrancisco", "sandiego", "chicago", "washingtondc", "nashville", "sanantonio"]) {
  ok(!!D.MARKETS[k], `expansion market present: ${k}`);
  ok(!!D.destinationUrl("viator", k), `viator link (native or search fallback) for ${k}`);
}
ok(D.MARKETS.nyc.viator.id === "d687", "Viator NYC d687 (verified)");
ok(D.MARKETS.lasvegas.viator.id === "d684", "Viator Vegas d684 (verified)");
ok(D.MARKETS.neworleans.viator.id === "d675", "Viator New Orleans d675 (verified)");
ok(D.MARKETS.oahu.viator.id === "d672", "Viator Oahu d672 (verified)");
ok(D.MARKETS.miami.viator.id === "d662", "Viator Miami d662 (verified)");
ok(D.hasNativeDestination("viator", "losangeles") === false, "LA honestly non-native until id verified");
ok(D.destinationUrl("viator", "losangeles").includes("searchResults"), "LA falls back to tracked search");
ok(D.marketForLocation(40.71, -74.0).key === "nyc", "NYC coords now snap to nyc market");
ok(D.marketForLocation(36.17, -115.14).key === "lasvegas", "Vegas coords snap");
ok(D.marketForLocation(64.2, -149.5) === null, "Alaska coords → still no market");

// ── wrapCard waterfall (guaranteed wrap for every monetizable card) ─────────
const zoo = { name: "ZooTampa at Lowry Park", types: ["zoo"] };
const w1 = Mz.wrapCard(zoo, { productUrl: "https://www.tiqets.com/en/p123", city: "Tampa" });
ok(w1 && w1.kind === "product" && w1.url === "https://www.tiqets.com/en/p123", "tier 1: exact product wins");
const w2 = Mz.wrapCard(zoo, { city: "Tampa" });
ok(w2 && w2.kind === "search" && w2.url.includes(encodeURIComponent("ZooTampa at Lowry Park Tampa")), "tier 2: search fallback fires with place+city");
ok(w2.label && /commission/i.test(w2.label.sub), "wrap carries the disclosure label");
ok(Mz.wrapCard({ name: "Owen's Fish Camp", types: ["restaurant"] }) === null, "tier 3: restaurant honestly unwrapped");
ok(Mz.wrapCard({ name: "", types: ["zoo"] }) === null, "empty name → no junk link");
const ev = Mz.wrapCard({ name: "Van Wezel Performing Arts Hall", types: ["performing_arts_theater"] }, { city: "Sarasota" });
ok(ev && ev.provider === "ticketnetwork", "events route to TicketNetwork (best EV), not Ticketmaster");

// monetize engine sanity (committed alongside).
ok(Mz.monetizableCategory({ name: "The Florida Aquarium", types: ["aquarium"] }) === "attractions", "aquarium → attractions");
ok(Mz.monetizableCategory({ name: "Owen's Fish Camp", types: ["restaurant"] }) === null, "restaurant → not monetizable");
ok(Mz.bestAffiliate({ name: "ZooTampa", types: ["zoo"] }, ["viator", "tiqets"]).provider === "viator", "best affiliate picked by EV");
ok(Mz.monetizationBoost({ name: "beach", types: ["natural_feature"] }) === 0, "free place → 0 boost");
ok(Mz.isSponsoredPlacement({ name: "ZooTampa", types: ["zoo"] }) === true, "bookable → sponsored flag (needs label)");

// ── Bounded-cap integrity: money breaks near-ties, never leapfrogs merit ─────
// The hard contract (monetize.js §3) is that the boost is [0, cap]. Assert the
// ceiling holds for the highest-value bookable place AND that a full boost can
// never lift a lower-merit place past a clearly-better one — the property that
// keeps "our ranking is our honest opinion" true. (Was documented, not tested.)
const CAP = 8;
const topEV = { name: "ZooTampa at Lowry Park", types: ["zoo"] }; // strong bookable attraction
ok(Mz.monetizationBoost(topEV) > 0, "the reference bookable place actually earns a boost");
ok(Mz.monetizationBoost(topEV) <= CAP, "boost never exceeds the default cap (8)");
ok(Mz.monetizationBoost(topEV, { cap: 3 }) <= 3, "a custom cap is honored as the ceiling");
ok(Mz.monetizationBoost(topEV, { cap: 0 }) === 0, "cap 0 disables the nudge entirely");
// Merit dominance: a bookable place worse by MORE than the cap stays below a
// better (unbookable, zero-boost) place even after receiving its full boost.
const meritBetter = 80;                       // e.g. a top-rated free beach — no boost
const meritWorseBookable = meritBetter - (CAP + 1); // worse by more than the cap
const boostedTotal = meritWorseBookable + Mz.monetizationBoost(topEV);
ok(boostedTotal < meritBetter, "capped boost cannot lift a lower-merit place past a clearly-better one");
// The nudge is a SORT input only — it must never be exposed as, or added to, a
// user-facing score. Guard the module surface: no export leaks it as a "score".
ok(typeof Mz.wayfindScore === "undefined" && typeof Mz.displayScore === "undefined",
  "monetize never exposes a user-facing score (merit stays merit-only)");

if (fails) { console.error(`test-destinations: ${fails} failure(s)`); process.exit(1); }
console.log("test-destinations: OK — Orlando/Tampa/St-Pete + home market mapped across Viator/Tiqets/Klook (verified ids), graceful fallbacks, location snapping, monetize engine sane");
