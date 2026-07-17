// scripts/test-monetize-router.mjs — locks the corrected single-owner invariants.
// Pure-logic + static checks; no network, no keys, no committed secrets.
import { readFileSync } from "fs";
import { resolveClick, coverageReport, LANES } from "../lib/monetizeRouter.js";

let pass = 0;
const fail = (m) => { console.error("test-monetize-router: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const AFF_HOSTS = ["viator.com", "tpx.lu", "tp.media", "stay22.com", "ubereats.com", "vrbo.com", "klook.com"];
const affHostCount = (u) => AFF_HOSTS.filter((h) => String(u).includes(h)).length;

// Configure lanes via SERVER-SIDE env (test-local, never committed).
process.env.STAY22_AID = "test-aid";
process.env.TRAVELPAYOUTS_MARKER = "test-marker";
process.env.KLOOK_TP_PROGRAM = "test-prog";
process.env.VIATOR_PARTNER_ID = "test-pid";
process.env.VIATOR_MCID = "test-mcid";
process.env.UBEREATS_TEMPLATE = "https://www.ubereats.com/track?ref=w&u={url}";
delete process.env.KLOOK_DEEPLINK_VERIFIED; // Klook stays DISABLED until verified

// ── Invariant 1: exactly one owner (or canonical) per click ─────────────────
const tour = resolveClick({ intent: "tour", canonical: "https://www.viator.com/tours/Tampa/x" });
ok(tour.owner === "viator" && affHostCount(tour.url) === 1, "tour on a viator.com URL -> single owner viator, one host");
const hotel = resolveClick({ intent: "hotel", canonical: "https://www.booking.com/x", lodgingCtx: { lat: 27.9, lng: -82.4, address: "Tampa, FL" } });
ok(hotel.owner === "stay22", "hotel with lodging context -> stay22");
const eats = resolveClick({ intent: "food_delivery", canonical: "https://www.ubereats.com/store/x" });
ok(eats.owner === "ubereats", "food delivery on ubereats.com -> ubereats");

// ── Invariant 2: CANONICAL-FIRST, no blanket routing ────────────────────────
const unclassified = resolveClick({ intent: "", canonical: "https://www.viator.com/tours/x" });
ok(unclassified.owner === "canonical" && unclassified.url === "https://www.viator.com/tours/x",
  "unclassified intent stays CANONICAL even on a viator.com URL — no forced attribution");
const wrongHost = resolveClick({ intent: "tour", canonical: "https://randomblog.com/a-tour" });
ok(wrongHost.owner === "canonical", "tour intent on a NON-viator host -> canonical (permitted-host check)");
const noProvider = resolveClick({ intent: "attraction_ticket", canonical: "https://sometickets.com/x" });
ok(noProvider.owner === "canonical", "a ticket on a non-Klook host is never bent toward Klook -> canonical");

// ── Invariant 3: unverified/unconfigured -> canonical (journey unbroken) ─────
const bad = resolveClick({ intent: "tour", canonical: "javascript:alert(1)" });
ok(bad.url === null && bad.owner === "canonical", "non-http canonical never becomes an affiliate link");
process.env.VIATOR_PARTNER_ID = "";
const darkTour = resolveClick({ intent: "tour", canonical: "https://www.viator.com/tours/x" });
ok(darkTour.owner === "canonical" && darkTour.url === "https://www.viator.com/tours/x", "unconfigured lane -> canonical");
process.env.VIATOR_PARTNER_ID = "test-pid";

// ── Invariant 4: Klook stays DISABLED until its deep-link process is verified ─
const klookUnverified = resolveClick({ intent: "attraction_ticket", canonical: "https://www.klook.com/activity/159925-x/" });
ok(klookUnverified.owner === "canonical", "Klook route is DISABLED (canonical) until KLOOK_DEEPLINK_VERIFIED=on — never ship an untracked affiliate link");
process.env.KLOOK_DEEPLINK_VERIFIED = "on";
const klookVerified = resolveClick({ intent: "attraction_ticket", canonical: "https://www.klook.com/activity/159925-x/" });
ok(klookVerified.owner === "klook", "once verified, a klook.com ticket routes to klook");
delete process.env.KLOOK_DEEPLINK_VERIFIED;

// ── Invariant 5: non-travel / food never routed through Stay22 ──────────────
ok(resolveClick({ intent: "food_delivery", canonical: "https://www.ubereats.com/store/y" }).owner !== "stay22", "food delivery never -> stay22");
ok(resolveClick({ intent: "hotel", canonical: "https://www.booking.com/x" }).owner === "canonical", "hotel WITHOUT lodging context -> canonical (stay22 needs a location, never blind-wraps)");

// ── Invariant 6: affiliate status NEVER touches Score / ranking / order ─────
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(!/monetizationBoost\s*\(|isSponsoredPlacement\s*\(|bestAffiliate\s*\(/.test(home), "home.js ranking path never CALLS a monetization boost");
let ranking = ""; try { ranking = readFileSync(new URL("../lib/ranking.js", import.meta.url), "utf8"); } catch (e) {}
ok(!/monetizationBoost\s*\(|from ["'][^"']*monetize|require\(["'][^"']*monetize/.test(ranking), "lib/ranking.js never calls/imports monetization");

// ── Invariant 7: no committed secrets — router reads env only ───────────────
const router = readFileSync(new URL("../lib/monetizeRouter.js", import.meta.url), "utf8");
ok(!/6a4ea301|550160|\bp=137\b|["']137["']/.test(router), "router source contains NO hardcoded provider ids/markers");
ok(/process\.env\[/.test(router), "router reads ids from process.env only");

const cov = coverageReport();
ok(typeof cov.tour === "boolean" && Array.isArray(LANES), "coverage report + lanes exported");

console.log(`test-monetize-router: OK — ${pass} assertions (canonical-first, no blanket routing, Klook gated until verified, no Stay22 on food, money never touches rank, no committed secrets)`);
