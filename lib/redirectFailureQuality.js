// lib/redirectFailureQuality.js — which provider_redirect_failed events are a
// real visitor's broken partner link, and which are automated noise.
//
// THE INCIDENT (2026-11-10). The "failed partner link" signal read every
// provider_redirect_failed row. PostHog that day (America/New_York): 290 rows,
// 288 of them failure_reason=crawler-refused with traffic_class=crawler —
// ElevenlabsCrawler (98 Ticketmaster event links from 12 US IPs), LinkupBot
// (54 from one German IP), MJ12bot, PetalBot, meta-externalads, OAI-SearchBot,
// Googlebot. Not one shared a click_id with an on-page commerce_cta_clicked.
// The remaining two were hand-made probes (surface "canary" / bare
// "Mozilla/5.0" UA) with no on-page click either. Every hit also carried a
// fresh click_id as its personless distinct_id, so "N failures from N
// visitors" was the shape of automation, not of N people.
//
// crawler-refused is the /go routes' guard WORKING (lib/crawler.js): the
// crawler is bounced to Wayfind before any partner URL is resolved. Counting it
// as a failure pages the owner every time a crawler walks the site.
//
// WHAT COUNTS (a "qualified" failure), all of:
//   1. failure_reason is not crawler-refused (a refusal is not a failure);
//   2. traffic_class is "human" (the route's own classification: not crawler,
//      not our verifier "automation");
//   3. evidence a person was behind it: the click_id matches an on-page
//      commerce_cta_clicked in the same window, OR the route saw first-party
//      proof (click_proof client_click_id / first_party_cookie /
//      first_party_referer / direct_link). click_proof "none" with no
//      on-page tap is a cold hit on the URL: the shape crawlers and probes have.
// PostHog's $virt_is_bot and the project's test/owner exclusions are applied
// by the caller's REAL_EVENTS scope on top of this.
//
// REPORT-ONLY. Nothing here refuses, delays or rewrites a redirect, and the
// raw count is always reported beside the qualified one, so a crawler wave or a
// misclassification stays visible — it just no longer reads as broken links.

export const UNQUALIFIED_FAILURE_REASONS = Object.freeze(["crawler-refused"]);
export const VISITOR_CLICK_PROOFS = Object.freeze(["client_click_id", "first_party_cookie", "first_party_referer", "direct_link"]);

const sqlList = (values) => `(${values.map((v) => `'${v}'`).join(", ")})`;

/**
 * HogQL predicate, true for a qualified provider_redirect_failed row.
 * `onPageClickIdsSql` is a SELECT returning on-page commerce_cta_clicked
 * click ids for the same window and scope (the caller owns the window).
 */
export function qualifiedRedirectFailureSql(onPageClickIdsSql) {
  if (!onPageClickIdsSql || !/^\s*SELECT\b/i.test(onPageClickIdsSql)) throw new Error("qualified_failure_needs_click_subquery");
  return `(coalesce(toString(properties.failure_reason), '') NOT IN ${sqlList(UNQUALIFIED_FAILURE_REASONS)}
  AND coalesce(toString(properties.traffic_class), 'human') = 'human'
  AND (coalesce(toString(properties.click_proof), '') IN ${sqlList(VISITOR_CLICK_PROOFS)}
    OR (coalesce(toString(properties.click_id), '') != '' AND toString(properties.click_id) IN (${onPageClickIdsSql}))))`;
}

/** Same rule in JS, for tests and any in-memory caller. */
export function isQualifiedRedirectFailure(props, onPageClickIds = new Set()) {
  const p = props || {};
  const reason = String(p.failure_reason == null ? "" : p.failure_reason);
  if (UNQUALIFIED_FAILURE_REASONS.includes(reason)) return false;
  const trafficClass = p.traffic_class == null || p.traffic_class === "" ? "human" : String(p.traffic_class);
  if (trafficClass !== "human") return false;
  if (VISITOR_CLICK_PROOFS.includes(String(p.click_proof || ""))) return true;
  const clickId = String(p.click_id || "");
  return !!clickId && onPageClickIds.has(clickId);
}
