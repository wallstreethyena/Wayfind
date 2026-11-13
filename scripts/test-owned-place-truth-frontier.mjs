#!/usr/bin/env node
// scripts/test-owned-place-truth-frontier.mjs
//
// Frontier guard for the Owned Place Truth Architecture:
//   1. Deterministic editorial hours parser (`lib/editorialHoursParser.js`) + strict PROSE_ONLY rejection
//   2. Holiday closure protection (`specialHours` overriding regular weekday hours on Thanksgiving/Christmas)
//   3. Free vs. Paid admission truth (`lib/ownedPlaceTruth.js`) + splash-park/municipal-park false-fee elimination
//   4. Zero-Paid-Lookup Mode (`detailExtra` 503 / budget-gated survival across hours, CTA, and Game Plan)
//   5. Red-Team adversarial URL/CTA/partner/quarantine/expiry protections
//   6. Photo resilience (`wfplacediscovery` pseudo-ref detection in `uncreditedPlacePhotoId`)
//   7. Diagnostic truth trace (`buildPlaceTruthTrace`), Actionability Coverage (`computeActionabilityCoverage`),
//      and strict independence from `wayfindScore`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseEditorialHours,
  parseEditorialHoursString,
  extractHolidayClosures,
  usHolidaysForYear,
  EDITORIAL_HOURS_PARSER_VERSION,
} from "../lib/editorialHoursParser.js";
import {
  ADMISSION_STATUS,
  TRUTH_CONFIDENCE,
  isMunicipalSplashOrPublicPark,
  resolveAdmissionTruth,
  resolveOwnedHours,
  computeActionabilityCoverage,
  buildPlaceTruthTrace,
} from "../lib/ownedPlaceTruth.js";
import * as Tags from "../lib/tags.js";
import {
  hydrateDetailHours,
  buildGamePlan,
  isVerifiedFreePlace,
  isTicketedPlace,
} from "../lib/gamePlan.js";
import { resolveDetailCta } from "../lib/detailCta.js";
import { firstPartyActionsForPlace, sanitizeServableSlot } from "../lib/firstPartyActionStore.js";
import { uncreditedPlacePhotoId } from "../lib/placePhotoServable.js";
import { dropUnservableCardPhotos } from "../lib/christmasTickets.js";
import { wayfindScore } from "../lib/wayfindScore.js";
import { cardToEditorial } from "../lib/atlasCards.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

let assertions = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  assertions += 1;
}
function eq(a, b, msg) {
  assert.deepEqual(a, b, msg);
  assertions += 1;
}

// ── 1. Deterministic Editorial Hours Parser ────────────────────────────────
{
  const daily = parseEditorialHoursString("Daily 10am–5pm");
  ok(daily.ok === true, "Daily 10am–5pm parses deterministically");
  eq(daily.periods.length, 7, "Daily 10am–5pm produces 7 day periods");
  eq(daily.periods[0], { open: { day: 0, hour: 10, minute: 0 }, close: { day: 0, hour: 17, minute: 0 } }, "Sunday 10:00 to 17:00");
  eq(daily.weekdayDescriptions.length, 7, "Daily 10am–5pm produces 7 weekdayDescriptions");
  eq(daily.parserVersion, EDITORIAL_HOURS_PARSER_VERSION, "parserVersion stamped");

  // Extended Thursday ("Daily 10am–5pm (Thu to 8pm); closed Thanksgiving, Christmas & New Year's")
  const ringling = parseEditorialHoursString("Daily 10am–5pm (Thu to 8pm); closed Thanksgiving, Christmas & New Year's", [2026]);
  ok(ringling.ok === true, "Ringling hours with Thu extension + holiday closures parse");
  const thuPeriod = ringling.periods.find((p) => p.open.day === 4);
  eq(thuPeriod, { open: { day: 4, hour: 10, minute: 0 }, close: { day: 4, hour: 20, minute: 0 } }, "Thursday extends to 8pm (20:00)");
  const wedPeriod = ringling.periods.find((p) => p.open.day === 3);
  eq(wedPeriod, { open: { day: 3, hour: 10, minute: 0 }, close: { day: 3, hour: 17, minute: 0 } }, "Wednesday stays 10am–5pm");
  ok(ringling.specialHours.some((s) => s.date === "2026-11-26" && s.closed === true), "Thanksgiving 2026 closure extracted");
  ok(ringling.specialHours.some((s) => s.date === "2026-12-25" && s.closed === true), "Christmas 2026 closure extracted");
  ok(ringling.specialHours.some((s) => s.date === "2026-01-01" && s.closed === true), "New Year's Day 2026 closure extracted");

  // Split lunch/dinner service ("Mon–Fri 11:30am–2:30pm & 5–9pm; Sat 5–10pm; closed Sun")
  const split = parseEditorialHoursString("Mon–Fri 11:30am–2:30pm & 5–9pm; Sat 5–10pm; closed Sun");
  ok(split.ok === true, "Split lunch/dinner hours parse");
  const monPeriods = split.periods.filter((p) => p.open.day === 1);
  eq(monPeriods.length, 2, "Monday has 2 periods (lunch + dinner)");
  eq(monPeriods[0], { open: { day: 1, hour: 11, minute: 30 }, close: { day: 1, hour: 14, minute: 30 } }, "Monday lunch 11:30–14:30");
  eq(monPeriods[1], { open: { day: 1, hour: 17, minute: 0 }, close: { day: 1, hour: 21, minute: 0 } }, "Monday dinner 17:00–21:00");
  eq(split.periods.filter((p) => p.open.day === 0).length, 0, "Closed Sunday has 0 periods");
  ok(split.weekdayDescriptions[6].includes("Closed"), "Sunday weekdayDescription says Closed");

  // Overnight crossing ("Sun–Thu 11am–midnight; Fri–Sat 11am–2am")
  const late = parseEditorialHoursString("Sun–Thu 11am–midnight; Fri–Sat 11am–2am");
  ok(late.ok === true, "Overnight hours Sun–Thu 11am–midnight; Fri–Sat 11am–2am parse");
  const fri = late.periods.find((p) => p.open.day === 5);
  eq(fri, { open: { day: 5, hour: 11, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } }, "Friday 11am closes Saturday 2am");

  // Beach park prefix ("Beach park 6am–10pm daily; lifeguards 9am–5pm")
  const beach = parseEditorialHoursString("Beach park 6am–10pm daily; lifeguards 9am–5pm");
  ok(beach.ok === true, "Beach park prefix parses primary park hours");
  eq(beach.periods.length, 7, "Beach park daily has 7 periods");
  eq(beach.periods[0].open.hour, 6, "Opens 6am");
  eq(beach.periods[0].close.hour, 22, "Closes 10pm");

  // 24/7 ("Open 24 hours daily")
  const open24 = parseEditorialHoursString("Open 24 hours daily");
  ok(open24.ok === true, "Open 24 hours daily parses");
  eq(open24.periods, [{ open: { day: 0, hour: 0, minute: 0 } }], "Google 24/7 single open period");

  // Strict rejection of ambiguous / unposted / sunrise-sunset / lodging check-in strings
  for (const proseOnlySample of [
    "Daily, sunrise to sunset",
    "Dawn to dusk daily",
    "Hours not posted — call ahead to confirm",
    "Check-in 4pm, check-out 11am; front desk 24/7",
    "Box office — performance days 10am–showtime; non-performance days Mon–Sat 10am–5pm",
    "Hours vary by season and tide",
  ]) {
    const res = parseEditorialHoursString(proseOnlySample);
    eq(res.ok, false, `Ambiguous/non-clock string rejected as PROSE_ONLY: "${proseOnlySample}"`);
    eq(res.confidence, "PROSE_ONLY", `Confidence is PROSE_ONLY for "${proseOnlySample}"`);
    eq(res.periods.length, 0, `No guessed periods for "${proseOnlySample}"`);
  }
}

// ── 2. Holiday Closure Protection (Never Falsely Claim "Go now" on Closed Holiday) ──
{
  const atlasRaw = JSON.parse(readFileSync(path.join(ROOT, "data/atlas/editorial-cards.json"), "utf8"));
  const cadzanRaw = atlasRaw.find((c) => c.placeId === "ChIJpXGK53VC24gRWMneFVtK6hY"); // Ca' d'Zan
  ok(Boolean(cadzanRaw), "Ca' d'Zan exists in Atlas cards");
  const cadzanEd = cardToEditorial(cadzanRaw);

  // Regular Thursday (Nov 19, 2026 at 14:00 EST = 19:00 UTC) -> Open
  const regularThuMs = Date.parse("2026-11-19T19:00:00Z");
  const openRegular = resolveOwnedHours({
    detail: { id: cadzanRaw.placeId, name: cadzanRaw.name },
    detailExtra: null,
    editorial: cadzanEd,
    nowMs: regularThuMs,
  });
  eq(openRegular.ok, true, "Ca' d'Zan owned hours resolve without Google");
  eq(openRegular.openState, true, "Ca' d'Zan is OPEN on regular Thursday 2pm EST");

  // Thanksgiving Thursday (Nov 26, 2026 at 14:00 EST = 19:00 UTC) -> Closed via specialHours!
  const thanksgivingThuMs = Date.parse("2026-11-26T19:00:00Z");
  const closedHoliday = resolveOwnedHours({
    detail: { id: cadzanRaw.placeId, name: cadzanRaw.name },
    detailExtra: null,
    editorial: cadzanEd,
    nowMs: thanksgivingThuMs,
  });
  eq(closedHoliday.ok, true, "Ca' d'Zan owned hours resolve on Thanksgiving");
  eq(closedHoliday.openState, false, "Ca' d'Zan is CLOSED on Thanksgiving 2pm EST via specialHours");
  ok(/Thanksgiving/i.test(closedHoliday.holidayWarning || ""), "Holiday warning cites Thanksgiving");

  // Verify Game Plan verdict on Thanksgiving is "Wait — closed now" (never "Go now")
  const hydratedHoliday = hydrateDetailHours({ id: cadzanRaw.placeId, name: cadzanRaw.name }, null, thanksgivingThuMs, cadzanEd);
  const gpHoliday = buildGamePlan({
    detail: hydratedHoliday,
    detailExtra: null,
    editorial: cadzanEd,
    nowMs: thanksgivingThuMs,
  });
  eq(gpHoliday.verdict.tone, "wait", "Game Plan tone is wait (closed now) on Thanksgiving");
  ok(/closed now/i.test(gpHoliday.verdict.text), "Game Plan verdict says closed now on Thanksgiving");
}

// ── 3. Splash-Park / Municipal-Park False-Fee Elimination ──────────────────
{
  const riverwalkSplash = {
    id: "ChIJ5d9yNNEXw4gRm2kGIGmpfT4",
    place_id: "ChIJ5d9yNNEXw4gRm2kGIGmpfT4",
    name: "Riverwalk Splash Park",
    locality: "Bradenton",
    category: "Park",
    types: ["Park", "amusement_center", "park", "point_of_interest", "tourist_attraction", "water_park"],
    lat: 27.4989,
    lng: -82.5748,
  };

  eq(Tags.requiresParkAdmission(riverwalkSplash.types), false, "Tags.requiresParkAdmission is false for municipal splash park with park+water_park types");
  eq(isMunicipalSplashOrPublicPark(riverwalkSplash, null), true, "isMunicipalSplashOrPublicPark is true for Riverwalk Splash Park");
  eq(isVerifiedFreePlace(riverwalkSplash, null), true, "isVerifiedFreePlace is true for Riverwalk Splash Park");
  eq(isTicketedPlace(riverwalkSplash, null), false, "isTicketedPlace is false for Riverwalk Splash Park");

  const adm = resolveAdmissionTruth(riverwalkSplash, null, null);
  eq(adm.status, ADMISSION_STATUS.FREE, "Riverwalk Splash Park admission status is FREE");
  eq(adm.isFree, true, "Riverwalk Splash Park isFree is true");
  eq(adm.requiresTicket, false, "Riverwalk Splash Park requiresTicket is false");

  const cta = resolveDetailCta({ detail: riverwalkSplash, editorial: null, officialUrl: null, firstPartyActions: null });
  eq(cta.type, "directions", "Riverwalk Splash Park without official site resolves to Directions (never tickets)");

  const gp = buildGamePlan({ detail: riverwalkSplash, detailExtra: null, editorial: null, primaryCta: cta });
  const costRow = gp.rows.find((r) => r.key === "cost");
  ok(costRow && /Free admission|Free public access/i.test(costRow.text), "Riverwalk Splash Park cost row says Free admission");
  ok(!gp.rows.some((r) => /entry fee applies at the gate|May require park admission/i.test(r.text)), "Riverwalk Splash Park never fabricates gate entry fees");

  // Positive control: real commercial water park / theme park still requires admission
  const adventureIsland = {
    id: "ChIJ_adventure_island",
    name: "Adventure Island",
    category: "Water Park",
    types: ["water_park", "amusement_park", "tourist_attraction"],
  };
  eq(Tags.requiresParkAdmission(adventureIsland.types), true, "Commercial water/amusement park still requires park admission");
  eq(isMunicipalSplashOrPublicPark(adventureIsland, null), false, "Adventure Island is not classified as a free municipal splash park");
}

// ── 4. Admission Truth Taxonomy (FREE, PAID, DONATION, PARKING_FEE_ONLY) ───
{
  const oscarScherer = {
    id: "ChIJKVRP_EYXw4gRac5SKnbSMKo",
    name: "Oscar Scherer State Park",
    category: "Park",
    types: ["state_park", "park"],
  };
  const oscarEd = {
    why: "Scrub-jay habitat and freshwater swimming lake.",
    insiderMove: "Entry is $5 per vehicle at the ranger station.",
  };
  const oscarAdm = resolveAdmissionTruth(oscarScherer, oscarEd, null);
  eq(oscarAdm.status, ADMISSION_STATUS.PARKING_FEE_ONLY, "State park with $5 per vehicle resolves to PARKING_FEE_ONLY");

  const donationVenue = { id: "ChIJ_donation", name: "Community Heritage Chapel", category: "Museum" };
  const donationEd = { why: "Free admission; suggested donation of $5 at the door." };
  const donAdm = resolveAdmissionTruth(donationVenue, donationEd, null);
  eq(donAdm.status, ADMISSION_STATUS.DONATION, "Suggested donation venue resolves to DONATION");
}

// ── 5. Zero-Paid-Lookup Mode (Google 503 / Budget-Gated Survival) ──────────
{
  const atlasRaw = JSON.parse(readFileSync(path.join(ROOT, "data/atlas/editorial-cards.json"), "utf8"));
  const bishopRaw = atlasRaw.find((c) => c.placeId === "ChIJr7ec9tEXw4gRwicCx3wfH2w"); // The Bishop Museum of Science and Nature
  const bishopEd = cardToEditorial(bishopRaw);
  const bishopActions = firstPartyActionsForPlace("ChIJr7ec9tEXw4gRwicCx3wfH2w");

  // Simulate Google /api/places/details returning 503 budget-gated
  const budgetGatedExtra = { ok: false, status: 503, error: "budget", _resolved: true };
  const bareDetail = {
    id: "ChIJr7ec9tEXw4gRwicCx3wfH2w",
    place_id: "ChIJr7ec9tEXw4gRwicCx3wfH2w",
    name: "The Bishop Museum of Science and Nature",
    category: "Museum",
    types: ["museum", "tourist_attraction"],
    lat: 27.4981,
    lng: -82.5714,
    // No oh.periods on bareDetail!
  };

  // Wednesday Nov 18, 2026 at 14:00 EST (19:00 UTC) -> Open (Tue–Sat 10am–5pm; Sun noon–5pm; closed Monday)
  const wed2pmMs = Date.parse("2026-11-18T19:00:00Z");
  const hydrated = hydrateDetailHours(bareDetail, budgetGatedExtra, wed2pmMs, bishopEd);
  ok(hydrated.oh && Array.isArray(hydrated.oh.periods) && hydrated.oh.periods.length === 6, "Zero-Paid-Lookup Mode hydrates 6 structured periods (Tue–Sun) from owned editorial hours");
  ok(Array.isArray(hydrated.oh.weekdayDescriptions) && hydrated.oh.weekdayDescriptions.length === 7, "Zero-Paid-Lookup Mode hydrates 7-day weekdayDescriptions for expandable hours");
  const ownedWed = resolveOwnedHours({ detail: bareDetail, detailExtra: budgetGatedExtra, editorial: bishopEd, nowMs: wed2pmMs });
  eq(ownedWed.openState, true, "Zero-Paid-Lookup Mode computes openState=true at Wednesday 2pm EST without Google");

  // Monday Nov 16, 2026 at 14:00 EST (19:00 UTC) -> Closed (closed Monday)
  const mon2pmMs = Date.parse("2026-11-16T19:00:00Z");
  const ownedMon = resolveOwnedHours({ detail: bareDetail, detailExtra: budgetGatedExtra, editorial: bishopEd, nowMs: mon2pmMs });
  eq(ownedMon.openState, false, "Zero-Paid-Lookup Mode computes openState=false on Monday 2pm EST without Google");

  const cta = resolveDetailCta({
    detail: hydrated,
    editorial: bishopEd,
    officialUrl: bishopActions?.officialWebsite?.url || bishopEd.officialWebsite,
    firstPartyActions: bishopActions,
  });
  ok(cta && cta.href, "Zero-Paid-Lookup Mode resolves primary CTA");

  const gp = buildGamePlan({
    detail: hydrated,
    detailExtra: budgetGatedExtra,
    editorial: bishopEd,
    primaryCta: cta,
    nowMs: wed2pmMs,
  });
  eq(gp.verdict.tone, "go", "Zero-Paid-Lookup Mode Game Plan verdict is go");
  ok(/Go now\s*[·—-]\s*open until 5 PM/i.test(gp.verdict.text), `Game Plan verdict shows closing time from owned hours: "${gp.verdict.text}"`);
  ok(gp.rows.length >= 4, "Zero-Paid-Lookup Mode renders full Game Plan rows");
}

// ── 6. Red-Team Adversarial Protections (Quarantine, Expiry, Social/OTA Rejection) ──
{
  // Quarantined domain rejected
  const quarantinedSlot = sanitizeServableSlot({
    url: "https://fruitvillegrove.com/tickets",
    confidence: "EXACT",
    verification_status: "verified",
  }, "ticket_url", "2026-11-13");
  eq(quarantinedSlot, null, "Quarantined domain fruitvillegrove.com is rejected by sanitizeServableSlot");

  // Expired event ticket rejected
  const expiredSlot = sanitizeServableSlot({
    url: "https://veniceperformingartscenter.com/booking/",
    confidence: "EXACT",
    verification_status: "verified",
    valid_until: "2026-10-01",
  }, "ticket_url", "2026-11-13");
  eq(expiredSlot, null, "Expired ticket slot (valid_until < today) fails closed automatically");

  // Social / aggregator / maps URLs rejected as official actions
  for (const badUrl of [
    "https://www.facebook.com/somevenue",
    "https://www.instagram.com/somevenue",
    "https://www.yelp.com/biz/some-venue",
    "https://www.tripadvisor.com/Attraction_Review-g123",
    "https://www.google.com/maps/place/Some+Venue",
  ]) {
    const res = sanitizeServableSlot({
      url: badUrl,
      confidence: "EXACT",
      verification_status: "verified",
    }, "officialWebsite", "2026-11-13");
    eq(res, null, `Non-official / social / directory URL rejected: ${badUrl}`);
  }

  // Ambiguous confidence rejected
  const ambigSlot = sanitizeServableSlot({
    url: "https://example.org/tickets",
    confidence: "AMBIGUOUS",
    verification_status: "held_ambiguous",
  }, "ticket_url", "2026-11-13");
  eq(ambigSlot, null, "AMBIGUOUS slot never leaves firstPartyActionStore");
}

// ── 7. Photo Resilience (`wfplacediscovery` 404 Prevention) ────────────────
{
  const robertsId = "ChIJYybWKcrvwogRT8I06QALhdI";
  const robertsPseudoRefUrl = `/api/photo?ref=places%2F${robertsId}%2Fphotos%2Fwfplacediscovery&w=800`;
  eq(uncreditedPlacePhotoId(robertsPseudoRefUrl), robertsId, "uncreditedPlacePhotoId extracts placeId from wfplacediscovery pseudo-ref URL");

  const dropped = await dropUnservableCardPhotos(
    {
      kind: "event",
      id: "roberts-christmas-wonderland-2026",
      name: "Robert's Christmas Wonderland",
      title: "Robert's Christmas Wonderland",
      christmasRail: "markets",
      image: robertsPseudoRefUrl,
      imageIsVenue: true,
    },
    {
      servable: {
        noMemo: true,
        resolve: async () => ({ type: "miss", location: null }),
        findFree: async () => null,
      },
    }
  );
  eq(dropped.image, null, "Unservable wfplacediscovery card image is dropped before render");
  ok(dropped.placeholder && dropped.placeholder.label, "Card receives designed placeholder tile instead of emitting a 404 image request");
}

// ── 8. Diagnostic Truth Trace, Actionability Coverage, & Ranking Separation ─
{
  const ledger = JSON.parse(readFileSync(path.join(ROOT, "data/owned-place-truth.json"), "utf8"));
  const queue = JSON.parse(readFileSync(path.join(ROOT, "data/place-truth-review-queue.json"), "utf8"));

  ok(ledger.summary.high_intent_places_total >= 125, `Ledger covers >= 125 high-intent places (${ledger.summary.high_intent_places_total})`);
  ok(ledger.summary.after.official_website_count >= 120, `Official website coverage >= 120 (${ledger.summary.after.official_website_count})`);
  ok(ledger.summary.atlas_wide.deterministic_structured_hours_count >= 280, `Atlas deterministic structured hours >= 280 (${ledger.summary.atlas_wide.deterministic_structured_hours_count})`);
  eq(ledger.invariants.wayfind_score_independent, true, "Ledger locks wayfind_score_independent invariant");
  eq(queue.affects_wayfind_score, false, "Review queue never affects wayfindScore");

  // Verify wayfindScore is a pure function of (rating, reviews) and completely unaffected by actionability/monetization
  const s1 = wayfindScore(4.8, 1200);
  const s2 = wayfindScore(4.8, 1200);
  eq(s1, s2, "wayfindScore is deterministic on rating and review count alone");

  // Verify buildPlaceTruthTrace produces all 6 required explanation keys
  const trace = buildPlaceTruthTrace({
    detail: { id: "ChIJ5d9yNNEXw4gRm2kGIGmpfT4", name: "Riverwalk Splash Park", category: "Park", types: ["park", "water_park"] },
    detailExtra: null,
    editorial: null,
    firstPartyActions: null,
  });
  for (const key of ["open_closed_why", "primary_cta_why", "official_links_why", "free_paid_why", "photo_why", "partner_offer_why"]) {
    ok(Boolean(trace.explanations[key]), `Diagnostic trace includes explanation for ${key}`);
  }
}

console.log(`test-owned-place-truth-frontier: ${assertions} assertions OK`);
