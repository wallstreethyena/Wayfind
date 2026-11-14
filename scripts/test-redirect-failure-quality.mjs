#!/usr/bin/env node
// The "failed partner link" signal counts only QUALIFIED provider_redirect_failed
// rows (lib/redirectFailureQuality.js). Crawler refusals and cold hits with no
// on-page tap stay in the raw count but never read as broken links. Report-only:
// no redirect route is touched, and the revenue heartbeat incident is unchanged.
import { readFileSync } from "node:fs";
import { isQualifiedRedirectFailure, qualifiedRedirectFailureSql, UNQUALIFIED_FAILURE_REASONS } from "../lib/redirectFailureQuality.js";
import { buildVisitorReport, redirectFailureNote } from "../lib/commandCenter/visitorReport.js";
import { visitorStory, redirectFailureCounts } from "../lib/commandCenter/sources/posthog.js";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } };

// ── the rule, positive and negative cases ─────────────────────────────────
const tapped = new Set(["tap-1"]);
// 2026-11-10 shapes from PostHog: every one of these was automation.
ok(!isQualifiedRedirectFailure({ failure_reason: "crawler-refused", traffic_class: "crawler", click_proof: "none" }), "crawler refusal (ElevenlabsCrawler/LinkupBot shape) is not a failure");
ok(!isQualifiedRedirectFailure({ failure_reason: "crawler-refused", traffic_class: "crawler", click_proof: "first_party_referer" }), "crawler refusal stays unqualified even with a same-site referer (PetalBot shape)");
ok(!isQualifiedRedirectFailure({ failure_reason: "crawler-refused", traffic_class: "human", click_proof: "client_click_id", click_id: "tap-1" }), "a crawler-refused reason is never qualified, whatever else it carries");
ok(!isQualifiedRedirectFailure({ failure_reason: "invalid-product-url", traffic_class: "human", click_proof: "none", click_id: "x" }, tapped), "a cold probe (surface canary, no proof, no on-page tap) is not counted");
ok(!isQualifiedRedirectFailure({ failure_reason: "offer-not-found", traffic_class: "automation", click_proof: "client_click_id" }), "our own verifier traffic is not counted");
// Real visitors still count.
ok(isQualifiedRedirectFailure({ failure_reason: "offer-not-found", traffic_class: "human", click_proof: "none", click_id: "tap-1" }, tapped), "a failure matched to an on-page tap counts");
ok(isQualifiedRedirectFailure({ failure_reason: "offer-link-dead", traffic_class: "human", click_proof: "first_party_referer" }), "a failure from a Wayfind page (first-party referer) counts");
ok(isQualifiedRedirectFailure({ failure_reason: "offer-not-found", traffic_class: "human", click_proof: "client_click_id" }), "a failure carrying the page's click id counts");
ok(isQualifiedRedirectFailure({ failure_reason: "offer-not-found", traffic_class: "human", click_proof: "direct_link" }), "a failure from a shared direct link (email/Instagram) counts");
ok(isQualifiedRedirectFailure({ failure_reason: "offer-not-found", click_proof: "first_party_cookie" }), "a pre-traffic_class event defaults to human");
ok(UNQUALIFIED_FAILURE_REASONS.length === 1 && UNQUALIFIED_FAILURE_REASONS[0] === "crawler-refused", "only the crawler refusal reason is excluded outright");

const sql = qualifiedRedirectFailureSql("SELECT toString(properties.click_id) FROM events WHERE event = 'commerce_cta_clicked'");
ok(/NOT IN \('crawler-refused'\)/.test(sql) && /traffic_class\), 'human'\) = 'human'/.test(sql) && /commerce_cta_clicked/.test(sql) && /click_proof/.test(sql), "SQL predicate mirrors the JS rule");
let threw = false; try { qualifiedRedirectFailureSql(""); } catch { threw = true; }
ok(threw, "the SQL predicate refuses to build without an on-page click subquery");

// ── Command Center diagnostics: qualified count, raw kept ─────────────────
const crawlerWave = buildVisitorReport([], { diagnostics: [
  { event: "provider_redirect_failed", page_path: "Unknown page", occurrences: 0, visitors: 0, raw_occurrences: 131, raw_visitors: 131 },
] });
ok(!crawlerWave.findings.some((f) => /partner redirect failed/i.test(f.title)), "a crawler-only wave raises no 'partner redirect failed' issue");
ok(crawlerWave.coverage.notes.some((n) => /131 failure events raw, 0 qualified/.test(n)), "the raw count is still logged in the report notes");

const mixed = buildVisitorReport([], { diagnostics: [
  { event: "provider_redirect_failed", page_path: "Unknown page", occurrences: 2, visitors: 2, raw_occurrences: 50, raw_visitors: 50 },
] });
const issue = mixed.findings.find((f) => /partner redirect failed/i.test(f.title));
ok(issue && issue.kind === "issue" && issue.value === 2, "real failures still raise the issue, with the qualified count as its value");
ok(issue && /2 qualified provider_redirect_failed events/.test(issue.evidence) && /50 raw; 48 were crawler refusals/.test(issue.evidence), "the issue evidence shows qualified and raw");
ok(redirectFailureNote([{ event: "provider_redirect_failed", occurrences: 3, raw_occurrences: 3 }]) === null, "no note when nothing was excluded");
ok(redirectFailureNote([{ event: "app_error", occurrences: 0, raw_occurrences: 9 }]) === null, "other diagnostics are untouched by the failure note");
const appErr = buildVisitorReport([], { diagnostics: [{ event: "app_error", page_path: "/map", occurrences: 2, visitors: 1, raw_occurrences: 2, raw_visitors: 1 }] });
ok(appErr.findings.some((f) => /app error/.test(f.title) && f.value === 2), "app_error diagnostics still count every event");

// ── the PostHog queries carry the predicate ───────────────────────────────
const env = { POSTHOG_PERSONAL_API_KEY: "test-query-key", POSTHOG_PROJECT_ID: "507756", POSTHOG_API_HOST: "https://posthog.invalid" };
const queries = [];
const fetchImpl = async (_url, init = {}) => {
  queries.push(JSON.parse(init.body || "{}").query?.query || "");
  return { ok: true, status: 200, json: async () => ({ columns: ["failure_reason", "raw_failures", "qualified_failures"], results: [["crawler-refused", 288, 0]] }), text: async () => "" };
};
await visitorStory(new Date("2026-11-10T05:00:00Z"), new Date("2026-11-11T05:00:00Z"), { env, excludedUserIds: ["uuid-owner"], fetchImpl });
const diag = queries.find((q) => /places_none/.test(q)) || "";
ok(/countIf\(\(event != 'provider_redirect_failed' OR/.test(diag), "diagnostics count only qualified redirect failures");
ok(/count\(\) AS raw_occurrences/.test(diag) && /uniq\(person_id\) AS raw_visitors/.test(diag), "diagnostics keep raw counts");
ok(/crawler-refused/.test(diag) && /commerce_cta_clicked/.test(diag), "diagnostics exclude crawler refusals and join on-page taps");
ok(!/\{wayfind/.test(diag) && /uuid-owner/.test(diag), "the on-page click subquery is scoped to real visitors too");

queries.length = 0;
const counts = await redirectFailureCounts(new Date("2026-11-10T05:00:00Z"), new Date("2026-11-11T05:00:00Z"), { env, excludedUserIds: ["uuid-owner"], fetchImpl });
ok(queries.length === 1 && /AS raw_failures/.test(queries[0]) && /AS qualified_failures/.test(queries[0]) && /GROUP BY failure_reason/.test(queries[0]), "redirectFailureCounts reports raw and qualified by reason");
ok(counts.data && Number(counts.data[0].raw_failures) === 288 && Number(counts.data[0].qualified_failures) === 0, "redirectFailureCounts returns the rows");

// ── report-only: no redirect route and no incident input changed ──────────
const heartbeat = readFileSync("app/api/cron/revenue-heartbeat/route.js", "utf8");
ok(/redirectFailureCounts\(/.test(heartbeat) && /redirectFailures,/.test(heartbeat), "the heartbeat logs raw and qualified failures");
ok(/revenueSignal\(\{ trafficCount, affiliateCount, baselineRatio \}\)/.test(heartbeat), "the incident signal inputs are unchanged");
for (const route of ["app/api/commerce/go/route.js", "app/api/viator/go/route.js", "app/api/hotels/go/route.js", "app/api/ticketmaster/go/route.js"]) {
  ok(!/redirectFailureQuality/.test(readFileSync(route, "utf8")), `${route} does not consult the report rule (never blocks or slows a visitor)`);
}

if (fails) {
  console.error("test-redirect-failure-quality: " + fails + " failure(s)");
  process.exit(1);
}
console.log("test-redirect-failure-quality: OK");
