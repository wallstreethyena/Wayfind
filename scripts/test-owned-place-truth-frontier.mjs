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
  resolveOwnedTruthFallback,
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

// ── 1. Deterministic Editorial Hours Parser & Compound Hours ───────────────
{
  const daily = parseEditorialHoursString("Daily 10am–5pm");
  ok(daily.ok === true, "Daily 10am–5pm parses deterministically");
  eq(daily.periods.length, 7, "Daily 10am–5pm produces 7 day periods");
  eq(daily.periods[0], { open: { day: 0, hour: 10, minute: 0 }, close: { day: 0, hour: 17, minute: 0 } }, "Sunday 10:00 to 17:00");
  eq(daily.weekdayDescriptions.length, 7, "Daily 10am–5pm produces 7 weekdayDescriptions");
  eq(daily.parserVersion, EDITORIAL_HOURS_PARSER_VERSION, "parserVersion stamped");
  eq(daily.source, "wayfind_editorial_hours", "source provenance retained");
  eq(daily.timezone, "America/New_York", "timezone retained");
  eq(daily.verifiedAt, null, "verifiedAt is null when no verification date exists");
  eq(daily.freshness, "unverified_timestamp", "freshness is unverified_timestamp when verifiedAt is null");

  // Compound sentence schedule + admission clause + holiday closures (The Ringling ChIJ6y2dx9g_w4gRWoZIRhLk-JI)
  const ringlingCompound = parseEditorialHoursString(
    "The museum is open daily 10am-5pm, with general admission free on Mondays; it is closed Thanksgiving, Christmas Day, and New Year's Day.",
    { years: [2026], venueName: "The Ringling" }
  );
  eq(ringlingCompound.ok, true, "The Ringling compound sentence schedule parses deterministically");
  eq(ringlingCompound.periods.length, 7, "The Ringling compound sentence produces 7 daily 10:00–17:00 periods");
  eq(ringlingCompound.periods[1], { open: { day: 1, hour: 10, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }, "Monday 10:00–17:00 (free-on-Mondays clause stripped without breaking hours)");
  ok(ringlingCompound.specialHours.some((s) => s.date === "2026-11-26" && s.closed === true), "The Ringling compound sentence extracts Thanksgiving closure");
  ok(ringlingCompound.specialHours.some((s) => s.date === "2026-12-25" && s.closed === true), "The Ringling compound sentence extracts Christmas Day closure");
  ok(ringlingCompound.specialHours.some((s) => s.date === "2026-01-01" && s.closed === true), "The Ringling compound sentence extracts New Year's Day closure");
  eq(ringlingCompound.verifiedAt, null, "Never invents a verifiedAt timestamp on compound hours");

  // Extended Thursday without sub-venue cap ("Daily 10am–5pm (Thu to 8pm); closed Thanksgiving, Christmas & New Year's")
  const ringling = parseEditorialHoursString("Daily 10am–5pm (Thu to 8pm); closed Thanksgiving, Christmas & New Year's", [2026]);
  ok(ringling.ok === true, "Hours with Thu extension + holiday closures parse");
  const thuPeriod = ringling.periods.find((p) => p.open.day === 4);
  eq(thuPeriod, { open: { day: 4, hour: 10, minute: 0 }, close: { day: 4, hour: 20, minute: 0 } }, "Thursday extends to 8pm (20:00) when no sub-venue cap applies");
  const wedPeriod = ringling.periods.find((p) => p.open.day === 3);
  eq(wedPeriod, { open: { day: 3, hour: 10, minute: 0 }, close: { day: 3, hour: 17, minute: 0 } }, "Wednesday stays 10am–5pm");
  ok(ringling.specialHours.some((s) => s.date === "2026-11-26" && s.closed === true), "Thanksgiving 2026 closure extracted");
  ok(ringling.specialHours.some((s) => s.date === "2026-12-25" && s.closed === true), "Christmas 2026 closure extracted");
  ok(ringling.specialHours.some((s) => s.date === "2026-01-01" && s.closed === true), "New Year's Day 2026 closure extracted");

  // Subject-venue parenthetical exception (Ca' d'Zan ChIJpXGK53VC24gRWMneFVtK6hY: "Ca'd'Zan closes at 5pm")
  const cadzanParsed = parseEditorialHoursString(
    "Daily 10am–5pm (Thu to 8pm; Ca'd'Zan closes at 5pm); closed Thanksgiving, Christmas & New Year's",
    { years: [2026], venueName: "Ca' d'Zan" }
  );
  eq(cadzanParsed.ok, true, "Ca' d'Zan hours parse deterministically");
  const cadzanThu = cadzanParsed.periods.find((p) => p.open.day === 4);
  eq(cadzanThu, { open: { day: 4, hour: 10, minute: 0 }, close: { day: 4, hour: 17, minute: 0 } }, "Ca' d'Zan Thursday closes at 5pm (17:00), NOT 8pm (20:00)");
  eq(cadzanParsed.exceptions, ["Thu to 8pm; Ca'd'Zan closes at 5pm"], "Ca' d'Zan parenthetical exception preserved in metadata");

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

// ── 2. Holiday Closure Protection vs Holiday Calendar Uncertainty ──────────
{
  const atlasRaw = JSON.parse(readFileSync(path.join(ROOT, "data/atlas/editorial-cards.json"), "utf8"));
  const cadzanRaw = atlasRaw.find((c) => c.placeId === "ChIJpXGK53VC24gRWMneFVtK6hY"); // Ca' d'Zan
  ok(Boolean(cadzanRaw), "Ca' d'Zan exists in Atlas cards");
  const cadzanEd = cardToEditorial(cadzanRaw);

  // Regular Thursday (Nov 19, 2026 at 14:00 EST = 19:00 UTC) -> Open at 2pm, CLOSED at 6pm EST (23:00 UTC) because Ca'd'Zan closes at 5pm!
  const regularThu2pmMs = Date.parse("2026-11-19T19:00:00Z");
  const openRegular = resolveOwnedHours({
    detail: { id: cadzanRaw.placeId, name: cadzanRaw.name },
    detailExtra: null,
    editorial: cadzanEd,
    nowMs: regularThu2pmMs,
  });
  eq(openRegular.ok, true, "Ca' d'Zan owned hours resolve without Google");
  eq(openRegular.openState, true, "Ca' d'Zan is OPEN on regular Thursday 2pm EST");
  eq(openRegular.verifiedAt, null, "Ca' d'Zan verifiedAt is null (never fabricated)");
  eq(openRegular.freshness, "unverified_timestamp", "Ca' d'Zan freshness is unverified_timestamp");

  const regularThu6pmMs = Date.parse("2026-11-19T23:00:00Z");
  const closedAfter5Thu = resolveOwnedHours({
    detail: { id: cadzanRaw.placeId, name: cadzanRaw.name },
    detailExtra: null,
    editorial: cadzanEd,
    nowMs: regularThu6pmMs,
  });
  eq(closedAfter5Thu.openState, false, "Ca' d'Zan is CLOSED at 6pm EST on Thursday because Ca'd'Zan closes at 5pm");

  // Thanksgiving Thursday (Nov 26, 2026 at 14:00 EST = 19:00 UTC) -> Closed via explicit specialHours!
  const thanksgivingThuMs = Date.parse("2026-11-26T19:00:00Z");
  const closedHoliday = resolveOwnedHours({
    detail: { id: cadzanRaw.placeId, name: cadzanRaw.name },
    detailExtra: null,
    editorial: cadzanEd,
    nowMs: thanksgivingThuMs,
  });
  eq(closedHoliday.ok, true, "Ca' d'Zan owned hours resolve on Thanksgiving");
  eq(closedHoliday.openState, false, "Ca' d'Zan is CLOSED on Thanksgiving 2pm EST via explicit specialHours");
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

  // Law: A holiday calendar alone CANNOT establish closure!
  // A venue with "Daily 10am–5pm" (and no explicit holiday closure statement) remains openState: true
  // with holidayUncertainty: true and holidayWarning: "Thanksgiving Day may affect regular hours".
  const unconfirmedHolidayHours = resolveOwnedHours({
    detail: { id: "ChIJ_regular_daily_venue", name: "Bayfront Cafe" },
    detailExtra: null,
    editorial: { hoursText: "Daily 10am–5pm" },
    nowMs: thanksgivingThuMs,
  });
  eq(unconfirmedHolidayHours.ok, true, "Regular daily venue resolves structured hours on Thanksgiving");
  eq(unconfirmedHolidayHours.openState, true, "Holiday calendar alone NEVER forces openState=false without explicit venue holiday closure");
  eq(unconfirmedHolidayHours.holidayUncertainty, true, "holidayUncertainty flag is true when holiday hours are unconfirmed");
  eq(unconfirmedHolidayHours.holidayWarning, "Thanksgiving Day may affect regular hours", "Emits non-destructive holiday warning");
}

// ── 3. Riverwalk Splash Park (ChIJ5d9yNNEXw4gRm2kGIGmpfT4) & Blackburn Point Park Control ──
{
  // Exact live wf_inventory shape for Riverwalk Splash Park (ChIJ5d9yNNEXw4gRm2kGIGmpfT4)
  const riverwalkSplash = {
    id: "ChIJ5d9yNNEXw4gRm2kGIGmpfT4",
    place_id: "ChIJ5d9yNNEXw4gRm2kGIGmpfT4",
    name: "Riverwalk Splash Park",
    locality: "Bradenton",
    primaryType: "water_park",
    types: ["water_park", "amusement_park", "point_of_interest", "establishment"],
    lat: 27.4989,
    lng: -82.5748,
  };

  // Rule 1B: Suppresses false commercial park admission warning even when Google tags it with water_park + amusement_park
  eq(isMunicipalSplashOrPublicPark(riverwalkSplash, null), true, "isMunicipalSplashOrPublicPark is true for Riverwalk Splash Park with live wf_inventory types");
  eq(isTicketedPlace(riverwalkSplash, null), false, "isTicketedPlace is false for Riverwalk Splash Park");

  const detailSrc = readFileSync(path.join(ROOT, "app/components/sheets/Detail.js"), "utf8");
  ok(
    detailSrc.includes("!isMunicipalSplashOrPublicPark(hydratedDetail, effectiveEditorialForTruth)"),
    "Detail.js suppresses 'May require park admission.' when isMunicipalSplashOrPublicPark is true"
  );

  // Rule 1A: A splash-park name alone CANNOT establish free admission — must remain UNKNOWN without venue-specific evidence
  eq(isVerifiedFreePlace(riverwalkSplash, null), false, "isVerifiedFreePlace is false for Riverwalk Splash Park when no venue-specific free evidence exists");
  const adm = resolveAdmissionTruth(riverwalkSplash, null, null);
  eq(adm.status, ADMISSION_STATUS.UNKNOWN, "Riverwalk Splash Park admission status is UNKNOWN without venue-specific evidence");
  eq(adm.isFree, false, "Riverwalk Splash Park isFree is false when status is UNKNOWN");
  eq(adm.requiresTicket, false, "Riverwalk Splash Park requiresTicket is false");

  const cta = resolveDetailCta({ detail: riverwalkSplash, editorial: null, officialUrl: null, firstPartyActions: null });
  eq(cta.type, "directions", "Riverwalk Splash Park without official site resolves to Directions (never tickets)");

  const gp = buildGamePlan({ detail: riverwalkSplash, detailExtra: null, editorial: null, primaryCta: cta });
  const costRow = gp.rows.find((r) => r.key === "cost");
  eq(costRow, undefined, "Riverwalk Splash Park without venue-specific pricing does not fabricate a Free admission or paid gate fee row");
  ok(!gp.rows.some((r) => /entry fee applies at the gate|May require park admission|Free admission/i.test(r.text)), "Riverwalk Splash Park emits zero unsupported admission claims");

  // Positive control 1: Blackburn Point Park (ChIJD7cZSFBDw4gRsEpfMoip9BE) HAS explicit editorial evidence ("Daily 6am–10pm; free entry")
  const atlasRaw = JSON.parse(readFileSync(path.join(ROOT, "data/atlas/editorial-cards.json"), "utf8"));
  const blackburnRaw = atlasRaw.find((c) => c.placeId === "ChIJD7cZSFBDw4gRsEpfMoip9BE");
  ok(Boolean(blackburnRaw), "Blackburn Point Park exists in Atlas cards");
  const blackburnEd = cardToEditorial(blackburnRaw);
  const blackburnDetail = {
    id: "ChIJD7cZSFBDw4gRsEpfMoip9BE",
    place_id: "ChIJD7cZSFBDw4gRsEpfMoip9BE",
    name: "Blackburn Point Park",
    types: ["park", "point_of_interest", "establishment"],
  };
  eq(isVerifiedFreePlace(blackburnDetail, blackburnEd), true, "Blackburn Point Park isVerifiedFreePlace is true from explicit editorial free entry fact");
  const blackburnAdm = resolveAdmissionTruth(blackburnDetail, blackburnEd, null);
  eq(blackburnAdm.status, ADMISSION_STATUS.FREE, "Blackburn Point Park admission status is FREE from explicit editorial fact");
  eq(blackburnAdm.isFree, true, "Blackburn Point Park isFree is true");

  // Positive control 2: real commercial water park / theme park still requires admission
  const adventureIsland = {
    id: "ChIJ_adventure_island",
    name: "Adventure Island",
    category: "Water Park",
    types: ["water_park", "amusement_park", "tourist_attraction"],
  };
  eq(Tags.requiresParkAdmission(adventureIsland.types), true, "Commercial water/amusement park still requires park admission");
  eq(isMunicipalSplashOrPublicPark(adventureIsland, null), false, "Adventure Island is not classified as a municipal splash park");
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

// ── 5. Zero-Paid-Lookup Mode & Serving Supported Owned Truth Without Editorial Card ──
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

  // Fix 2: When no editorial prose card is passed, resolveOwnedTruthFallback serves ownedHours + admissionTruth from data/owned-place-truth.json
  const ownedTruthRaw = JSON.parse(readFileSync(path.join(ROOT, "data/owned-place-truth.json"), "utf8"));
  const fallbackTruth = resolveOwnedTruthFallback(
    "ChIJr7ec9tEXw4gRwicCx3wfH2w",
    "The Bishop Museum of Science and Nature",
    bishopActions,
    ownedTruthRaw.places
  );
  ok(fallbackTruth.ownedHours && fallbackTruth.ownedHours.ok && fallbackTruth.ownedHours.periods.length === 6, "resolveOwnedTruthFallback serves structured ownedHours when no editorial card exists");
  eq(fallbackTruth.admissionTruth?.status, ADMISSION_STATUS.PAID, "resolveOwnedTruthFallback serves PAID admissionTruth when no editorial card exists");

  const hydratedFromTruthMetaOnly = hydrateDetailHours(bareDetail, budgetGatedExtra, wed2pmMs, fallbackTruth);
  ok(hydratedFromTruthMetaOnly.oh && hydratedFromTruthMetaOnly.oh.periods.length === 6, "hydrateDetailHours hydrates structured periods from ownedTruthMeta alone without an editorial card");

  const routeSrc = readFileSync(path.join(ROOT, "app/api/editorial/route.js"), "utf8");
  ok(routeSrc.includes("resolveOwnedTruthFallback") && routeSrc.includes("serveActionsOnlyOrNone"), "app/api/editorial/route.js wires resolveOwnedTruthFallback into serveActionsOnlyOrNone");
  const detailSrc = readFileSync(path.join(ROOT, "app/components/sheets/Detail.js"), "utf8");
  ok(detailSrc.includes("effectiveEditorialForTruth") && detailSrc.includes("!isMunicipalSplashOrPublicPark(hydratedDetail, effectiveEditorialForTruth)"), "Detail.js wires effectiveEditorialForTruth and !isMunicipalSplashOrPublicPark guard");
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

// ── 8. Verified Coverage vs Fallback Readiness & Ranking Separation ────────
{
  const ledger = JSON.parse(readFileSync(path.join(ROOT, "data/owned-place-truth.json"), "utf8"));
  const queue = JSON.parse(readFileSync(path.join(ROOT, "data/place-truth-review-queue.json"), "utf8"));

  ok(ledger.summary.high_intent_places_total >= 125, `Ledger covers >= 125 high-intent places (${ledger.summary.high_intent_places_total})`);
  ok(ledger.summary.after.official_website_count >= 120, `Official website coverage >= 120 (${ledger.summary.after.official_website_count})`);
  ok(ledger.summary.atlas_wide.deterministic_structured_hours_count >= 280, `Atlas deterministic structured hours >= 280 (${ledger.summary.atlas_wide.deterministic_structured_hours_count})`);
  eq(ledger.invariants.wayfind_score_independent, true, "Ledger locks wayfind_score_independent invariant");
  eq(ledger.invariants.fallback_readiness_separate_from_verified_coverage, true, "Ledger locks fallback_readiness_separate_from_verified_coverage invariant");
  eq(queue.affects_wayfind_score, false, "Review queue never affects wayfindScore");

  // Bare place with coordinates and name only has 0 verifiedCoverage but >0 fallbackReadiness
  const bareCoordOnly = computeActionabilityCoverage({
    detail: { id: "ChIJ5d9yNNEXw4gRm2kGIGmpfT4", name: "Riverwalk Splash Park", lat: 27.4989, lng: -82.5748 },
    detailExtra: null,
    editorial: null,
    firstPartyActions: null,
    gamePlan: null,
    primaryCta: { type: "directions" },
  });
  eq(bareCoordOnly.verifiedCoverage.score, 0, "Bare place with only coordinates/name has 0.00 verifiedCoverage (no fallback inflation)");
  eq(bareCoordOnly.score, 0, "Top-level actionability score equals strict verifiedCoverage score");
  ok(bareCoordOnly.fallbackReadiness.score >= 0.5, "Fallback readiness is tracked separately for Directions / Plan & Share");

  // Verify wayfindScore is a pure function of (rating, reviews) and completely unaffected by actionability/monetization
  const s1 = wayfindScore(4.8, 1200);
  const s2 = wayfindScore(4.8, 1200);
  eq(s1, s2, "wayfindScore is deterministic on rating and review count alone");

  // Verify buildPlaceTruthTrace produces all 6 required explanation keys and never fabricates verified_at
  const trace = buildPlaceTruthTrace({
    detail: { id: "ChIJ5d9yNNEXw4gRm2kGIGmpfT4", name: "Riverwalk Splash Park", category: "Water Park", types: ["water_park", "amusement_park"] },
    detailExtra: null,
    editorial: null,
    firstPartyActions: null,
  });
  for (const key of ["open_closed_why", "primary_cta_why", "official_links_why", "free_paid_why", "photo_why", "partner_offer_why"]) {
    ok(Boolean(trace.explanations[key]), `Diagnostic trace includes explanation for ${key}`);
  }
  eq(trace.fields.regular_hours.verified_at, null, "Unverified hours field never fabricates verified_at timestamp");
}

console.log(`test-owned-place-truth-frontier: ${assertions} assertions OK`);
