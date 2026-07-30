// lib/deals.js — pure link-health logic for the wf_deals coupon/deal feed
// (Undercover Tourist via CJ, PID 101643573). No I/O here: the cron route
// (app/api/cron/deals-health) does the fetches + DB writes and delegates every
// decision to these functions so scripts/test-deals.mjs can lock the behavior.
//
// THE HARD-WON LINK FACTS (verified empirically 2026-07-22):
//   • CJ deep link with the destination as a ?url=<ENCODED> query param returns
//     HTTP 200 serving a 1×1 GIF pixel — it does NOT forward the user. DEAD.
//   • The SAME link with the destination as a RAW PATH SEGMENT 302-forwards
//     through cj.dotomi.com → emjcd.com → the UT page carrying
//     ?AID=…&PID=101643573&cjevent=… — i.e. real attribution. WORKS, no token.
//   • undercovertourist.com sits behind Cloudflare and returns 403 ("Just a
//     moment…") to bots. A 403 from UT means the page EXISTS (real users pass
//     the challenge) — it must NOT be treated as dead. Only 404/410/5xx are dead.
export const CJ_PID = "101643573";
const CJ_REDIRECT_HOSTS = /(?:^|\.)(?:anrdoezrs\.net|dpbolvw\.net|tkqlhce\.com|jdoqocy\.com|kqzyfj\.com|emjcd\.com|dotomi\.com|qksrv\.net)$/i;

// Every affiliate link we ever store/render must carry our PID or it earns
// nothing. The cron drops a repair that would not be attributed; the guard test
// asserts it build-time.
export function hasCjPid(url) {
  return typeof url === "string" && url.includes(CJ_PID);
}

// Build the WORKING CJ deep link: destination as a raw path segment (never
// ?url=). sid is the per-link CJ subId (kept for reporting). Returns null unless
// the destination is a real https Undercover Tourist URL.
export function rawPathDeepLink(destUrl, sid = "deal") {
  if (!destUrl || !/^https:\/\//i.test(destUrl)) return null;
  try { if (!/^(?:www\.)?undercovertourist\.com$/i.test(new URL(destUrl).hostname)) return null; }
  catch { return null; }
  const s = String(sid || "deal").replace(/[^\w.:-]/g, "").slice(0, 40) || "deal";
  return `https://www.anrdoezrs.net/links/${CJ_PID}/type/dlg/sid/${s}/${destUrl}`;
}

// Is this affiliate_url the DEAD ?url=<encoded> pixel form?
//
// SCOPED DELIBERATELY TO THE /type/dlg/ LINK TYPE. "?url=" is not dead in
// general — it is dead for THAT link type. The Clipp link below is a different CJ
// link type (/click-<pid>-<linkid>) whose CJ-generated form REQUIRES ?url=, and
// it forwards correctly. Widening this regex to any "?url=" would flag every
// Clipp link as a dead pixel and the health cron would "repair" working links
// into a raw-path form Clipp's link type does not accept.
export function isDeadPixelForm(url) {
  return typeof url === "string" && /\/type\/dlg\/(?:sid\/[^/]+\/)?\?url=/.test(url);
}

// ── Clipp.com (Clipper Magazine / LocalFlavor) via CJ ───────────────────────
// Local restaurant/dining certificates and coupons — 12% sale commission. This
// is the DINING monetization the site lacked: real users open cafes, bakeries and
// kid spots, and none of those are Viator/ticket inventory.
//
// Advertiser 3557279, our property PID 101643573 (CJ_PID above), deep-link id
// 12174096.
//
// THE LINK FACTS FOR THIS ADVERTISER (verified empirically 2026-07-29):
//   • This is a DIFFERENT CJ LINK TYPE from the Undercover Tourist links above.
//     UT uses /links/<pid>/type/dlg/sid/<sid>/<RAW PATH DEST>; Clipp uses
//     /click-<pid>-<linkid>?url=<ENCODED DEST>. The forms are not
//     interchangeable — which is why rawPathDeepLink() still refuses every host
//     but undercovertourist.com instead of being widened to clipp.com.
//   • VERIFIED FORWARDING: the ?url= form returns 302 → cj.dotomi.com (i.e. the
//     same real-attribution first hop affiliateForwards() already checks for).
//     It does NOT serve the 1×1 pixel that killed the UT ?url= form.
//   • clipp.com sits behind Akamai and returns 403 to every non-browser fetcher —
//     pages, /robots.txt and /sitemap.xml alike. So a 403 from clipp.com is NOT
//     evidence about whether a page exists, in either direction. destIsAlive()
//     already treats 403 as alive, which is the correct fail-soft direction here;
//     real existence has to be confirmed in a browser (see lib/clippOffers.js).
//   • THE DESTINATION PATH SHAPE IS /states/<st>/cities/<city>. The
//     /local-coupons/<st>/<city> shape renders Clipp's own "Sorry, something went
//     wrong!" error page. Both were confirmed in a real browser on 2026-07-29.
export const CJ_CLIPP_LINK_ID = "12174096";
export const CJ_CLIPP_ADVERTISER_ID = "3557279";
const CJ_CLIPP_HOST = "www.dpbolvw.net";

// A Clipp destination we are willing to wrap: https, on clipp.com, and on the
// market-page path shape that actually renders. Anything else returns false so
// the caller can refuse rather than send a user to an error page carrying our
// affiliate tracking.
export function isClippDest(destUrl) {
  if (!destUrl || !/^https:\/\//i.test(destUrl)) return false;
  try {
    const u = new URL(destUrl);
    if (!/^(?:www\.)?clipp\.com$/i.test(u.hostname)) return false;
    return /^\/states\/[a-z]{2}\/cities\/[a-z0-9-]+\/?$/i.test(u.pathname);
  } catch { return false; }
}

// Build the CJ-generated Clipp deep link, EXACTLY as CJ emits it. clickId is the
// optional CJ sub-ID: per the commerce event schema only the opaque click_id may
// ride here — never a place id, a user id, a city name or free text.
// Returns null (never an untracked clipp.com URL) when the destination is not a
// wrappable Clipp market page, so a caller cannot accidentally ship a link that
// earns nothing.
export function clippDeepLink(destUrl, clickId) {
  if (!isClippDest(destUrl)) return null;
  const q = new URLSearchParams({ url: destUrl });
  const s = String(clickId || "").replace(/[^\w-]/g, "").slice(0, 40);
  if (s) q.set("sid", s);
  return `https://${CJ_CLIPP_HOST}/click-${CJ_PID}-${CJ_CLIPP_LINK_ID}?` + q.toString();
}

// Pull the SID out of an existing affiliate_url (either form), for repair.
export function sidOf(url) {
  const m = /\/type\/dlg\/sid\/([^/?]+)/.exec(String(url || ""));
  return m ? m[1] : "deal";
}

// Repair a stored affiliate_url to the working raw-path form when it is the dead
// pixel form. Returns { url, repaired }. Non-pixel links pass through untouched.
export function repairAffiliateUrl(affiliateUrl, destUrl) {
  if (isDeadPixelForm(affiliateUrl)) {
    const fixed = rawPathDeepLink(destUrl, sidOf(affiliateUrl));
    if (fixed) return { url: fixed, repaired: true };
  }
  return { url: affiliateUrl, repaired: false };
}

// A destination status counts as ALIVE if it loaded (2xx/3xx) or was challenged
// by Cloudflare (403). Only a true not-found / server error is dead.
export function destIsAlive(status) {
  if (status === 403) return true;          // Cloudflare challenge — page exists
  if (status >= 200 && status < 400) return true;
  return false;                             // 404/410/5xx → dead
}

// Does the affiliate redirect truly forward the user? PASS only on a 3xx whose
// Location points at a CJ redirect host (cj.dotomi.com etc.). A 200 straight
// from anrdoezrs.net is the tracking pixel → FAIL.
export function affiliateForwards(firstHopStatus, location) {
  if (!(firstHopStatus >= 300 && firstHopStatus < 400) || !location) return false;
  try { return CJ_REDIRECT_HOSTS.test(new URL(location).hostname); } catch { return false; }
}

// The full verdict for one deal, given the two probes. link_ok requires BOTH the
// affiliate link to forward AND the destination to be alive. fail streak logic
// lives in the cron (needs the prior fail_count), this is the per-run pass/fail.
export function judgeLink({ affFirstHop, affLocation, destStatus }) {
  const forwards = affiliateForwards(affFirstHop, affLocation);
  const alive = destIsAlive(destStatus);
  return { pass: forwards && alive, forwards, alive, http_status: affFirstHop || 0 };
}
