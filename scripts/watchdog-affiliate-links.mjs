#!/usr/bin/env node
/**
 * scripts/watchdog-affiliate-links.mjs — WEEKLY PRODUCTION EARNINGS WATCHDOG.
 *
 * WHY THIS EXISTS. Wayfind earns only when an outbound click carries the
 * partner tracking that attributes the booking to us. That attribution can
 * break WITHOUT any code change on our side: a partner rotates a campaign, a
 * redirector changes its gate, an env value drifts. Every guard in
 * scripts/guards.txt reads the REPO, so none of them can see that. This
 * script reads the LIVE site instead: it follows the real production
 * redirect chains on https://www.gowayfind.com and asserts the tracking
 * that pays us is still on them.
 *
 * WHAT IT CHECKS
 *   1. Ticketmaster — GET /api/ticketmaster/go with a real ticketmaster.com
 *      event URL; the redirect chain must contain the Impact path
 *      ticketmaster.evyy.net/c/7475855/264167/4272.
 *   2. Viator — take a real /api/commerce/go?provider=viator link off the
 *      live home page and follow it; the chain must contain
 *      pid=<WAYFIND_VIATOR_PID>, read from lib/viatorPid.js (never a second
 *      hardcoded copy of the pid in this file).
 *   3. Stay22 — GET /api/hotels/go for a hotel the repo's own verification
 *      data marks allowed (lib/hotelBookingVerification.json joined to
 *      lib/ownedHotels.json, the same shape lib/affiliates.js hotelGoUrl
 *      builds); the chain must name stay22 and carry the Stay22 aid.
 *   4. TicketNetwork + Wave 2 (welcomepickups, kiwitaxi, radicalstorage) —
 *      LIB-LEVEL ONLY: import the real lib/travelpayouts.js and assert
 *      tpDeepLink() still produces a tp.media/r URL carrying each program's
 *      campaign_id/promo_id from TP_PROGRAMS. No live card sampling for
 *      these: their cards are sparse on the live site, so a sampled page
 *      proves nothing either way. If the lib stops building tracked links,
 *      that IS the breakage this check can see, and it fails below.
 *
 * THE USER-AGENT IS LOAD-BEARING — AND IT IS OURS, NOT A PHONE'S
 * (2026-10-28). Every probe identifies as our own synthetic monitor
 * (lib/crawler.js isSyntheticMonitor: "WayfindSyntheticMonitor/…"). That
 * identity is never refused as a crawler, so the /go routes still return
 * the REAL attributed partner Location this watchdog asserts on — but
 * lib/serverEvents.js captureServer() drops every event for it, so a
 * watchdog run is never a human provider_redirect_started. Before this it
 * sent a real iPhone UA and showed up in the money funnel as a person
 * (surfaces "affiliate-watchdog"/"watchdog", 5 events 2026-10-23..27).
 *
 * NO PARTNER CONTACT. The chain stops at the FIRST Location that leaves our
 * own origin: it is recorded, never fetched. Every tracking value checked
 * here (Impact evyy.net path, Viator pid, Stay22 aid) is already in that
 * first Wayfind-issued Location, so following it into ticketmaster.evyy.net /
 * viator.com / stay22.com only minted a real partner click per run.
 *
 * READ-ONLY. GETs only against our own origin, no writes to the site. The
 * only write this watchdog ever causes is the GitHub issue the workflow
 * opens on failure.
 *
 * NOT A GUARD. Deliberately absent from scripts/guards.txt and not
 * check-/test- shaped: it hits live production, so wiring it into the
 * hermetic prebuild suite would let a flaky partner or CDN block a merge
 * (the same reasoning as scripts/run-synthetic-monitor.mjs and
 * scripts/photo-monitor.mjs). It runs weekly from
 * .github/workflows/affiliate-watchdog.yml instead.
 *
 * USAGE
 *   node scripts/watchdog-affiliate-links.mjs [--base-url=https://www.gowayfind.com]
 *
 * EXIT CODE. 0 when every check passes. 1 when any check fails, with one
 * FAIL line per broken check naming what was expected and what was seen.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { WAYFIND_VIATOR_PID } from "../lib/viatorPid.js";
import { TP_PROGRAMS, isTpProgramLive, tpDeepLink } from "../lib/travelpayouts.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_BASE_URL = "https://www.gowayfind.com";
const MAX_HOPS = 10;
const FETCH_TIMEOUT_MS = 20_000;

// Our own internal-probe identity — see "THE USER-AGENT IS LOAD-BEARING"
// above. Must satisfy lib/crawler.js isSyntheticMonitor() and never match
// isCrawler(); scripts/check-redirect-suspect-gate.mjs runs this script end to end.
export const WATCHDOG_UA = "WayfindSyntheticMonitor/1.0 (affiliate-watchdog; +https://www.gowayfind.com)";

// ── Expectations ─────────────────────────────────────────────────────────
// Ticketmaster/Impact: lib/affiliates.js TM_IMPACT_SID /
// TM_IMPACT_CAMPAIGN / TM_IMPACT_AD default to 7475855 / 264167 / 4272
// (env-overridable, not exported). This is the ONE place the watchdog
// names the expected live path; if the owner rotates the Impact IDs,
// update it here alongside lib/affiliates.js.
const EXPECTED_TM_IMPACT_PATH = "ticketmaster.evyy.net/c/7475855/264167/4272";
// Stay22: lib/hotelRedirect.js STAY22_AID = "wayfindllc" (not exported).
// Same rule: one named place, kept in step with that constant.
const EXPECTED_STAY22_AID = "wayfindllc";
// A real Ticketmaster event URL (the shape /api/ticketmaster/go accepts;
// isTicketmasterFamily-gated server-side). Pinned to an event the repo's
// own guide tests already use, so it stays a plausible TM destination
// even after the event itself has happened — the redirector wraps any
// ticketmaster.com URL, it does not check the event is upcoming.
const TM_EVENT_URL = "https://www.ticketmaster.com/event/0D0065159FC782E6";
// Travelpayouts programs asserted at lib level (check 4). ticketnetwork is
// Wave 1 events; the other three are the Wave 2 visitor-utility programs.
const TP_LIB_CHECKS = ["ticketnetwork", "welcomepickups", "kiwitaxi", "radicalstorage"];

// ── CLI ──────────────────────────────────────────────────────────────────
function parseBaseUrl(argv) {
  for (const arg of argv) {
    if (arg.startsWith("--base-url=")) return arg.slice("--base-url=".length).replace(/\/+$/, "");
  }
  return DEFAULT_BASE_URL;
}
const BASE_URL = parseBaseUrl(process.argv.slice(2));

// ── Chain following ──────────────────────────────────────────────────────
/**
 * GET `url` with redirect:"manual", following Location hops by hand so the
 * WHOLE chain is observable. Returns { hops, chainText } where hops is a
 * list of "STATUS url" lines and chainText is every URL seen (start +
 * each Location) joined for substring assertions. A transport error ends
 * the chain and is recorded as a hop — checks then fail on what is missing
 * rather than the watchdog crashing and reporting nothing.
 */
async function followChain(url) {
  const hops = [];
  const seen = [url];
  let current = url;
  const ownOrigin = new URL(url).origin;
  for (let i = 0; i < MAX_HOPS; i++) {
    let res;
    try {
      res = await fetch(current, {
        redirect: "manual",
        headers: { "User-Agent": WATCHDOG_UA, Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      hops.push(`ERROR ${current} (${err && err.message ? err.message : err})`);
      break;
    }
    const location = res.headers.get("location");
    hops.push(`${res.status} ${current}${location ? ` -> ${location}` : ""}`);
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current).toString();
      seen.push(current);
      // Off our origin = a partner. Record the Location, never fetch it.
      if (new URL(current).origin !== ownOrigin) {
        hops.push(`STOP ${current} (partner hop recorded, not followed)`);
        break;
      }
      continue;
    }
    break;
  }
  return { hops, chainText: seen.join("\n") };
}

async function fetchText(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": WATCHDOG_UA, Accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  return { status: res.status, text: await res.text() };
}

// ── Check plumbing ───────────────────────────────────────────────────────
const results = [];
function report(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${detail}`);
}
const short = (u) => (u.length > 220 ? u.slice(0, 220) + "…" : u);

// ── 1. Ticketmaster ──────────────────────────────────────────────────────
async function checkTicketmaster() {
  const start = `${BASE_URL}/api/ticketmaster/go?url=${encodeURIComponent(TM_EVENT_URL)}&surface=affiliate-watchdog`;
  const { hops, chainText } = await followChain(start);
  const ok = chainText.includes(EXPECTED_TM_IMPACT_PATH);
  report(
    "ticketmaster",
    ok,
    ok
      ? `chain carries ${EXPECTED_TM_IMPACT_PATH} (${hops.length} hops)`
      : `expected chain to contain ${EXPECTED_TM_IMPACT_PATH}; saw: ${hops.map(short).join(" | ") || "no response"}`
  );
}

// ── 2. Viator (a real commerce link off the live home page) ─────────────
async function checkViator() {
  const expected = `pid=${WAYFIND_VIATOR_PID}`;
  let home;
  try {
    home = await fetchText(BASE_URL + "/");
  } catch (err) {
    report("viator", false, `home page fetch failed (${err && err.message ? err.message : err}); expected a /api/commerce/go?provider=viator link carrying ${expected}`);
    return;
  }
  if (home.status !== 200) {
    report("viator", false, `home page returned ${home.status}; expected 200 with a /api/commerce/go?provider=viator link carrying ${expected}`);
    return;
  }
  // Home CTAs ship inside the RSC payload with & JSON-escaped as &.
  const decoded = home.text.replace(/\\u0026/g, "&").replace(/&amp;/g, "&");
  const hrefs = [...decoded.matchAll(/\/api\/commerce\/go\?[^"'\s<\\]+/g)].map((m) => m[0]);
  const viatorHrefs = hrefs.filter((h) => h.includes("provider=viator"));
  if (!viatorHrefs.length) {
    report("viator", false, `no /api/commerce/go?provider=viator link on the home page (saw ${hrefs.length} commerce/go links, 0 viator); expected at least one carrying ${expected}`);
    return;
  }
  const start = new URL(viatorHrefs[0], BASE_URL).toString();
  const { hops, chainText } = await followChain(start);
  const ok = chainText.includes(expected);
  report(
    "viator",
    ok,
    ok
      ? `${short(start)} -> chain carries ${expected} (${hops.length} hops)`
      : `followed ${short(start)}; expected chain to contain ${expected}; saw: ${hops.map(short).join(" | ") || "no response"}`
  );
}

// ── 3. Stay22 (a verified hotel through /api/hotels/go) ──────────────────
function verifiedHotelSample() {
  // The live site only builds /api/hotels/go links for hotels with a
  // verification record (lib/affiliates.js hotelGoUrl fail-closes
  // otherwise, and the route re-checks). Mirror that: pick the first
  // allowed record and join its place id to the owned-hotel row carrying
  // the name/address the route needs.
  try {
    const records = JSON.parse(readFileSync(path.join(ROOT, "lib/hotelBookingVerification.json"), "utf8"));
    const owned = JSON.parse(readFileSync(path.join(ROOT, "lib/ownedHotels.json"), "utf8"));
    const ownedRows = Array.isArray(owned) ? owned : [];
    for (const rec of Array.isArray(records) ? records : []) {
      if (!rec || rec.allowed !== true || !rec.key || !rec.placeId) continue;
      const hotel = ownedRows.find((h) => h && h.gpid === rec.placeId && h.name && h.address);
      if (!hotel) continue;
      return {
        name: hotel.name,
        address: [hotel.address, hotel.city].filter(Boolean).join(", "),
        content: rec.key,
        lat: hotel.lat,
        lng: hotel.lng,
      };
    }
  } catch (err) {
    console.error(`stay22 sample: could not read repo hotel data (${err && err.message ? err.message : err})`);
  }
  return null;
}

async function checkStay22() {
  const sample = verifiedHotelSample();
  if (!sample) {
    report("stay22", false, "no allowed hotel in lib/hotelBookingVerification.json joins to a named/addressed row in lib/ownedHotels.json; expected at least one verified hotel to sample /api/hotels/go with");
    return;
  }
  const q = new URLSearchParams({
    name: sample.name,
    address: sample.address,
    surface: "hotel_booking",
    content: sample.content,
  });
  if (Number.isFinite(Number(sample.lat)) && Number.isFinite(Number(sample.lng))) {
    q.set("lat", String(sample.lat));
    q.set("lng", String(sample.lng));
  }
  const start = `${BASE_URL}/api/hotels/go?${q.toString()}`;
  const { hops, chainText } = await followChain(start);
  const namesStay22 = /stay22\.com/i.test(chainText);
  const carriesAid = chainText.includes(`aid=${EXPECTED_STAY22_AID}`);
  const ok = namesStay22 && carriesAid;
  report(
    "stay22",
    ok,
    ok
      ? `${sample.name} -> chain names stay22 with aid=${EXPECTED_STAY22_AID} (${hops.length} hops)`
      : `followed ${short(start)}; expected chain to name stay22.com and contain aid=${EXPECTED_STAY22_AID} (stay22=${namesStay22}, aid=${carriesAid}); saw: ${hops.map(short).join(" | ") || "no response"}`
  );
}

// ── 4. TicketNetwork + Wave 2 (lib-level, no live sampling) ─────────────
function checkTravelpayoutsLib() {
  const failures = [];
  for (const key of TP_LIB_CHECKS) {
    const program = TP_PROGRAMS[key];
    if (!program) {
      failures.push(`${key}: not present in TP_PROGRAMS`);
      continue;
    }
    if (!isTpProgramLive(key)) {
      failures.push(`${key}: isTpProgramLive() is false (promoId=${program.promoId}, campaignId=${program.campaignId}) — program went dark`);
      continue;
    }
    const link = tpDeepLink(key, program.home);
    if (!link) {
      failures.push(`${key}: tpDeepLink() returned null for ${program.home}`);
      continue;
    }
    let u;
    try {
      u = new URL(link);
    } catch {
      failures.push(`${key}: tpDeepLink() returned an unparseable URL: ${link}`);
      continue;
    }
    const problems = [];
    if (`${u.origin}${u.pathname}` !== "https://tp.media/r") problems.push(`endpoint is ${u.origin}${u.pathname}, expected https://tp.media/r`);
    if (u.searchParams.get("campaign_id") !== String(program.campaignId)) problems.push(`campaign_id=${u.searchParams.get("campaign_id")}, expected ${program.campaignId}`);
    if (u.searchParams.get("p") !== String(program.promoId)) problems.push(`p=${u.searchParams.get("p")}, expected promo_id ${program.promoId}`);
    if (!u.searchParams.get("marker")) problems.push("marker param missing");
    if (u.searchParams.get("u") !== new URL(program.home).toString()) problems.push(`u=${u.searchParams.get("u")}, expected destination ${program.home}`);
    if (problems.length) failures.push(`${key}: ${problems.join("; ")}`);
  }
  report(
    "travelpayouts-lib",
    failures.length === 0,
    failures.length === 0
      ? `${TP_LIB_CHECKS.join(", ")} each build a tp.media/r link with their TP_PROGRAMS campaign_id/promo_id`
      : failures.join(" | ")
  );
}

// ── Run ──────────────────────────────────────────────────────────────────
console.log(`affiliate-watchdog: probing ${BASE_URL} (internal-probe UA, GETs only, partner hops recorded not followed)`);
await checkTicketmaster();
await checkViator();
await checkStay22();
checkTravelpayoutsLib();

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error(`affiliate-watchdog: FAIL — ${failed.length} of ${results.length} checks failed: ${failed.map((r) => r.name).join(", ")}`);
  process.exit(1);
}
console.log(`affiliate-watchdog: PASS — all ${results.length} checks passed`);
