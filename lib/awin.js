// lib/awin.js — Awin affiliate deep-link engine.
//
// REBUILT 2026-08-12. An earlier session this same day authored this module,
// delivered it as a patch, and it was never pushed — `git log --all
// --diff-filter=A -- lib/awin.js` was empty, so 30 programme applications had no
// code behind them at all. The registry below is reconstructed from the
// application record in claude/wayfind-awin-registry-2026-08-12.md, where every
// MID and term was read live in the Awin dashboard on 2026-08-12.
//
// Publisher: Wayfind LLC, awinaffid 2983163.
//
// ── WHY SHIPS-DARK MATTERS MORE HERE THAN ON ANY OTHER NETWORK ─────────────
// awin1.com/cread.php REDIRECTS CORRECTLY WHETHER OR NOT WE ARE APPROVED. A
// link built for an unjoined programme 302s, lands the user on exactly the right
// page, converts — and pays nothing, while reading as a success in every
// dashboard we own. There is NO runtime symptom. Compare Travelpayouts, where a
// missing promo_id yields a link that is visibly wrong.
//
// So `status` is the whole safety mechanism: awinDeepLink() returns null unless
// the programme is explicitly "approved" WITH an approvedOn date, and
// scripts/check-awin-links.mjs is the only place a mistake can be caught.
//
// ── WHY THIS DOES NOT DUPLICATE OTHER NETWORKS ────────────────────────────
// Two networks claiming one conversion loses money rather than making it.
// AWIN_CONFLICTS records the brands we deliberately did NOT join on Awin
// because they already earn through a different path, so nobody re-adds them.

export const AWIN_AFFID = "2983163";
const AWIN_ENDPOINT = "https://www.awin1.com/cread.php";

/**
 * The applied-for programme set. `status` is one of:
 *   "pending"  — applied, not yet approved. Emits NOTHING.
 *   "approved" — live; MUST carry approvedOn (the guard fails the build otherwise).
 *   "declined" — kept so nobody re-applies blindly.
 *
 * Rates/cookies are APPLICATION-TIME DOCUMENTATION ONLY — advertisers change
 * them without notice. Re-read the terms before leaning on a number.
 */
export const AWIN_PROGRAMMES = Object.freeze({
  // ── On-water / outdoors — the Florida-native ones ────────────────────────
  samboat: { mid: "32679", brand: "SamBoat", host: "samboat.com", rate: "5–8%", cookie: "30d",
    status: "approved", approvedOn: "2026-08-12",
    note: "Boat rental. Approval email received 2026-08-12. Best product-market fit in the batch — Tampa Bay, Clearwater, Key West and Miami pages all carry real inventory." },
  gotosea: { mid: "57795", brand: "GoToSea", host: "gotosea.com", rate: "3%+", cookie: "45d", status: "pending",
    note: "Cruise OTA. Highest EPC in the US directory at application time. Port Canaveral / Port Tampa Bay." },
  campspot: { mid: "22326", brand: "Campspot", host: "campspot.com", rate: "3%", cookie: "30d", status: "pending" },
  roverpass: { mid: "32065", brand: "RoverPass", host: "roverpass.com", rate: "2%", cookie: "30d", status: "pending",
    note: "Thin — drop if Campspot approves." },
  shoott: { mid: "106343", brand: "Shoott", host: "shoott.com", rate: "n/p", cookie: "30d", status: "pending" },

  // ── Things to do / tours / attractions ──────────────────────────────────
  adrenaline: { mid: "47629", brand: "Adrenaline", host: "adrenaline365.com", rate: "4%", cookie: "15d", status: "pending" },
  experiencefirst: { mid: "98867", brand: "ExperienceFirst", host: "exp1.com", rate: "12%", cookie: "45d", status: "pending" },
  extranomical: { mid: "29767", brand: "Extranomical Tours", host: "extranomical.com", rate: "8–13%", cookie: "30d", status: "pending" },
  usghostadventures: { mid: "122270", brand: "US Ghost Adventures", host: "usghostadventures.com", rate: "4–10%", cookie: "30d", status: "pending",
    note: "Has St. Augustine, Key West and Tampa tours — genuinely in-market." },
  tourofnyc: { mid: "121256", brand: "Tour of NYC", host: "tourofnyc.com", rate: "5%", cookie: "30d", status: "pending" },
  tourofwashingtondc: { mid: "121258", brand: "Tour of Washington DC", host: "tourofwashingtondc.com", rate: "n/p", cookie: "30d", status: "pending" },
  architecturetourchicago: { mid: "121252", brand: "Architecture Tour Chicago", host: "architecturetourchicago.com", rate: "n/p", cookie: "30d", status: "pending" },
  gowithguide: { mid: "87121", brand: "GoWithGuide", host: "gowithguide.com", rate: "10% tours / 5% transfers", cookie: "30d", status: "pending" },
  thetourguy: { mid: "74246", brand: "The Tour Guy", host: "thetourguy.com", rate: "up to 6%", cookie: "30d", status: "pending" },
  giftory: { mid: "53277", brand: "Giftory", host: "giftory.com", rate: "up to 10%", cookie: "30d", status: "pending" },
  caesarsshows: { mid: "21867", brand: "Caesars Shows & Attractions", host: "caesars.com", rate: "10%", cookie: "30d", status: "pending",
    note: "Vegas shows — out of home market, national surfaces only." },

  // ── Events / nightlife ──────────────────────────────────────────────────
  superstartickets: { mid: "4037", brand: "SuperStar Tickets", host: "superstar.com", rate: "7%", cookie: "30d", status: "pending" },
  zeromarkup: { mid: "15885", brand: "ZeroMarkup", host: "scorebig.com", rate: "5%", cookie: "30d", status: "pending",
    note: "⚠ Domain in transition (zeromarkup.com → scorebig.com); deep paths 404. Re-verify the destination shape before wiring any offer." },
  standuptix: { mid: "11989", brand: "Stand Up Tix", host: "standuptix.com", rate: "3.5%", cookie: "30d", status: "pending",
    note: "⚠ White-label; the Awin profile points at a client club. Test one real link on approval." },
  tickeri: { mid: "13495", brand: "Tickeri", host: "tickeri.com", rate: "$0.60/order", cookie: "30d", status: "pending",
    note: "Latin events — dense in Tampa and Orlando." },
  events365: { mid: "113450", brand: "Events365", host: "events365.com", rate: "n/p", cookie: "30d", status: "pending" },
  gigsberg: { mid: "122390", brand: "Gigsberg", host: "gigsberg.com", rate: "n/p", cookie: "30d", status: "pending" },

  // ── Food & drink ────────────────────────────────────────────────────────
  eatwith: { mid: "15528", brand: "Eatwith", host: "eatwith.com", rate: "up to 10%", cookie: "30d", status: "pending",
    note: "Host-led dinners + cooking classes. Awin's US dining vertical is effectively empty; this and Travelzoo are the whole of it." },

  // ── Trip support around an outing ───────────────────────────────────────
  travelzoo: { mid: "6394", brand: "Travelzoo", host: "travelzoo.com", rate: "4%", cookie: "14d", status: "pending",
    note: "Local Deals — closest thing on Awin to the Clipp/Groupon shape. Shortest cookie in the batch." },
  tripcom: { mid: "5968", brand: "Trip.com", host: "trip.com", rate: "activities 4% / transfers 5%", cookie: "30d", status: "pending",
    note: "⚠ ACTIVITIES AND TRANSFERS ONLY — never hotels (Stay22 / TP Drive double-wrap)." },
  airportreservations: { mid: "55351", brand: "Airport Reservations", host: "airport-reservations.com", rate: "up to 10%", cookie: "30d", status: "pending",
    note: "Parking at TPA, MCO, SRQ." },
  stasher: { mid: "83743", brand: "Stasher", host: "stasher.com", rate: "10%", cookie: "30d", status: "pending" },
  luggagehero: { mid: "37952", brand: "LuggageHero", host: "luggagehero.com", rate: "10%", cookie: "180d/30d conflicting", status: "pending",
    note: "Redundant with Stasher — keep whichever approves first." },
  topvillas: { mid: "12048", brand: "Top Villas", host: "thetopvillas.com", rate: "3%", cookie: "30d", status: "pending",
    note: "⚠ Orlando-heavy villas; lodging-adjacent, same double-wrap caution as Trip.com." },
  rentcars: { mid: "18808", brand: "RentCars", host: "rentcars.com", rate: "4% dom / 7% intl", cookie: "30d", status: "pending" },
  getyourguide_awin: { mid: "18925", brand: "GetYourGuide", host: "getyourguide.com", rate: "n/p", cookie: "n/p", status: "pending",
    note: "⚠ Applied BEFORE the batch. We already have a DIRECT GetYourGuide PID — if this approves, pick ONE path per surface or the two claims fight." },
});

/**
 * Brands deliberately NOT joined on Awin because they already earn elsewhere.
 * Recorded so nobody re-adds them and splits a conversion across two networks.
 */
export const AWIN_CONFLICTS = Object.freeze({
  tiqets: { mid: "12428", why: "LIVE on Travelpayouts (promoId 2074 / campaignId 89). Owner decision 2026-08-12: leave it alone." },
  viator: { mid: "11018", why: "Direct PID P00308545." },
  undercovertourist: { mid: "96367", why: "Already an approved CJ relationship (advertiser 684659)." },
  gocity: { mid: null, why: "Travelpayouts." },
  klook: { mid: null, why: "Travelpayouts." },
  ticketnetwork: { mid: null, why: "Travelpayouts." },
});

/** A programme may emit links only when explicitly approved WITH a date. */
export function isAwinLive(key) {
  const p = AWIN_PROGRAMMES[key];
  return !!(p && p.status === "approved" && p.approvedOn && p.mid && AWIN_AFFID);
}

/** Every programme that may emit today. */
export function liveAwinKeys() {
  return Object.keys(AWIN_PROGRAMMES).filter(isAwinLive);
}

/**
 * Build a tracked Awin deep link, or null.
 *
 * The host check is not decoration. `ued` is an arbitrary URL that Awin will
 * redirect to, so a mis-tagged offer row could otherwise send a user to ANY
 * site while claiming a commission under this advertiser's MID. The destination
 * must live on the programme's own host.
 *
 * @param {string} key   programme key (e.g. "samboat")
 * @param {string} dest  an absolute URL on that advertiser's domain
 * @param {string} [subId] our attribution tag (place id / surface)
 */
export function awinDeepLink(key, dest, subId) {
  const p = AWIN_PROGRAMMES[key];
  if (!p || !isAwinLive(key) || !dest) return null;
  let u;
  try { u = new URL(String(dest)); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  const want = String(p.host).replace(/^www\./, "").toLowerCase();
  if (host !== want && !host.endsWith("." + want)) return null;
  const parts = [
    "awinmid=" + encodeURIComponent(p.mid),
    "awinaffid=" + encodeURIComponent(AWIN_AFFID),
  ];
  if (subId) parts.push("clickref=" + encodeURIComponent(String(subId).slice(0, 100)));
  parts.push("ued=" + encodeURIComponent(u.toString()));
  return AWIN_ENDPOINT + "?" + parts.join("&");
}

/** Convenience: the programme record for a key, or null. */
export function awinProgramme(key) {
  return AWIN_PROGRAMMES[key] || null;
}
