#!/usr/bin/env node
// Qualified clicks are redirects whose click_id also exists on a real
// on-page commerce_cta_clicked. The measure is report-only.
import { readFileSync } from "node:fs";
import { qualifiedClickCounts } from "../lib/commandCenter/sources/posthog.js";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } };

const queries = [];
const result = await qualifiedClickCounts(new Date("2026-10-03T00:00:00Z"), new Date("2026-10-04T00:00:00Z"), {
  env: { POSTHOG_PERSONAL_API_KEY: "test-query-key", POSTHOG_PROJECT_ID: "507756", POSTHOG_API_HOST: "https://posthog.invalid" },
  excludedUserIds: ["uuid-owner"],
  fetchImpl: async (_url, init = {}) => {
    queries.push(JSON.parse(init.body || "{}"));
    return { ok: true, status: 200, json: async () => ({ columns: ["qualified_clicks"], results: [[7]] }), text: async () => "" };
  },
});

const q = queries[0] && queries[0].query && queries[0].query.query || "";
ok(queries.length === 1, "one report query");
ok(/event = 'provider_redirect_started'/.test(q), "counts redirects");
ok(/event = 'commerce_cta_clicked'/.test(q), "requires an on-page click");
ok(/properties\.click_id/.test(q) && / IN \(/.test(q), "matches the redirect to the click by click_id");
ok(!/refuse|block traffic|status: 403/i.test(q), "the query does not describe a traffic block");
ok(result && result.data && result.data[0] && Number(result.data[0].qualified_clicks) === 7, "the report returns the matched count");

const route = readFileSync("app/api/cron/revenue-heartbeat/route.js", "utf8");
ok(/qualifiedClickCounts\(/.test(route), "the heartbeat reports the measure");
ok(/revenueSignal\(\{ trafficCount, affiliateCount, baselineRatio \}\)/.test(route), "the paging signal still uses raw affiliate activity, not the qualified count");
ok(!/revenueSignal\(\{[^}]*qualifiedClicks/.test(route), "qualified clicks are not an incident input");

if (fails) {
  console.error("test-qualified-click: " + fails + " failure(s)");
  process.exit(1);
}
console.log("test-qualified-click: OK");
