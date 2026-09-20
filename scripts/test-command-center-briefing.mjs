// Behavioral lock for the report shared by Command Center and the daily mail.
import {
  buildOwnerBriefing, gatherOwnerBriefing, briefingText, briefingHtml, sendOwnerBriefingEmail, PARTNER_PATH_REVIEW_TRIGGER_OPENS,
} from "../lib/commandCenter/briefing.js";
import { tpStats } from "../lib/commandCenter/sources/travelpayouts.js";

let failures = 0;
const ok = (value, message) => { if (!value) { console.error(`test-command-center-briefing: FAIL — ${message}`); failures++; } };
const source = (name, connected = true) => connected
  ? { name, connected: true, fetchedAt: "2026-09-09T12:00:00.000Z", confidence: "measured" }
  : { name, connected: false, reason: "error", note: "offline", confidence: "unavailable" };
const normalResults = () => ({
  kpis: { source: source("First party"), data: { active_devices: 120, sessions: 150, detail_opens: 42, saves: 8, shares: 5, directions: 4, out_clicks: 3 } },
  signups: { source: source("Signups"), data: [{ day: "2026-09-08", signups: 6 }] },
  health: { source: source("Automatic checks"), data: { checks: [{ key: "home", label: "Homepage", ok: true, status: 200, ms: 80 }] } },
  affiliate: { source: source("Travelpayouts"), data: { confirmed_bookings: 2, revenue_paid_usd: 14.5, revenue_pending_usd: 3, fields_used: ["action_id", "state", "paid_profit_usd", "profit_usd"] } },
});
const now = new Date("2026-09-09T16:00:00.000Z");
const healthyNow = new Date("2026-10-01T16:00:00.000Z");

const report = buildOwnerBriefing({ now: healthyNow, results: normalResults() });
ok(report.generatedAt === healthyNow.toISOString(), "report carries generatedAt");
ok(report.period.label === "Yesterday" && report.period.complete === true && report.dateKey === "2026-09-30", "business window is the complete previous ET day");
ok(report.title.startsWith("Yesterday") && /health checked now/.test(report.title), "title distinguishes yesterday results from current health");
ok(report.cards.length === 3 && new Set(report.cards.map((card) => card.id)).size === 3, "exactly three distinct actions");
ok(report.summary.status === "healthy" && report.cards.every((card) => card.status === "routine"), "positive repaired-era report stays healthy with evidence-specific cards");
ok(report.cards.map((card) => card.id).join(",") === "traffic-denominator-recorded,partner-path-measured,intent-actions-measured", "healthy cards state the evidence and threshold outcome instead of generic reviews");
ok(report.metrics.affiliate.confirmedBookings === 2 && report.metrics.affiliate.paidEarningsUsd === 14.5, "provider-confirmed bookings and paid earnings are reported");
ok(report.workingWell.some((line) => /browsers and devices/.test(line)) && report.workingWell.some((line) => /paid earnings/.test(line)), "positive measured results appear in Working well");

// The owner's observed 43/0/18 day is inside the proven historical incident.
// It remains measured, but is labeled repaired history rather than a current bug.
const visitGap = normalResults();
visitGap.kpis.data = { active_devices: 43, sessions: 0, detail_opens: 18, saves: 0, shares: 0, directions: 0, out_clicks: 0 };
const gapReport = buildOwnerBriefing({ now: new Date("2026-09-20T14:00:00.000Z"), results: visitGap });
ok(gapReport.dateKey === "2026-09-19" && gapReport.summary.status === "limited" && gapReport.cards[0].id === "historical-session-gap", "affected day is labeled as a repaired historical measurement gap, not a current failure");
ok(/repaired visit-tracking gap/.test(gapReport.summary.headline) && /historical context only/.test(gapReport.cards[0].nextStep), "historical report names the repair and limits how its counts may be used");
ok(gapReport.cards.some((card) => card.id === "partner-path-sample-small" && card.status === "routine" && card.nextStep.includes(`${PARTNER_PATH_REVIEW_TRIGGER_OPENS} measured opens`)), "18 opens and zero clicks stay an evidence-thin routine observation, not a conversion failure");
ok(gapReport.metrics.traffic.sessions === 0 && !gapReport.workingWell.some((line) => /0 visits/.test(line)), "do not invent visits or praise inconsistent traffic");
const partialVisitGap = normalResults();
partialVisitGap.kpis.data.sessions = 7;
const partialGapReport = buildOwnerBriefing({ now: new Date("2026-09-20T14:00:00.000Z"), results: partialVisitGap });
const partialGapCard = partialGapReport.cards.find((card) => card.id === "historical-session-gap");
ok(partialGapCard && /7 visit events were recorded/.test(partialGapCard.detail) && !/recorded zero/.test(partialGapCard.detail), "positive partial incident sessions are labeled incomplete without falsely calling them zero");

const zeroClicksAfterReviewTrigger = normalResults();
zeroClicksAfterReviewTrigger.kpis.data = { ...zeroClicksAfterReviewTrigger.kpis.data, detail_opens: 40, out_clicks: 0 };
const reviewTriggerReport = buildOwnerBriefing({ now: healthyNow, results: zeroClicksAfterReviewTrigger });
const reviewTriggerCard = reviewTriggerReport.cards.find((card) => card.id === "partner-path-review-trigger");
ok(reviewTriggerReport.summary.status === "healthy" && reviewTriggerCard?.status === "routine" && /without an eligible partner action/.test(reviewTriggerCard.detail) && /not a conversion failure/.test(reviewTriggerCard.detail), ">30 opens with zero clicks prompts exposure inspection but cannot establish a conversion issue");

const independentPartnerCounters = normalResults();
independentPartnerCounters.kpis.data = { ...independentPartnerCounters.kpis.data, detail_opens: 0, out_clicks: 2 };
const independentPartnerCard = buildOwnerBriefing({ now: healthyNow, results: independentPartnerCounters }).cards.find((card) => card.id === "partner-path-measured");
ok(independentPartnerCard && /0 place-page opens and 2 partner clicks were recorded/.test(independentPartnerCard.detail) && /independent counters/.test(independentPartnerCard.detail) && !/opens produced/.test(independentPartnerCard.detail), "independent open and click counters do not claim that an open caused a click");

const postRepairGap = buildOwnerBriefing({ now: new Date("2026-09-22T14:00:00.000Z"), results: visitGap });
ok(postRepairGap.dateKey === "2026-09-21" && postRepairGap.summary.status === "attention" && postRepairGap.cards[0].id === "traffic-session-gap", "same device/session contradiction on a complete post-repair day is a current failure");
const inverseVisitGap = normalResults();
inverseVisitGap.kpis.data = { ...inverseVisitGap.kpis.data, active_devices: 0, sessions: 7 };
const inverseGapReport = buildOwnerBriefing({ now: new Date("2026-09-22T14:00:00.000Z"), results: inverseVisitGap });
ok(inverseGapReport.summary.status === "attention" && inverseGapReport.cards[0].id === "traffic-device-gap" && !inverseGapReport.cards.some((card) => card.id === "traffic-denominator-recorded"), "visits without device identifiers are a current contradiction and are not eligible comparison evidence");
const emptyTraffic = normalResults();
emptyTraffic.kpis.data = { active_devices: 0, sessions: 0, detail_opens: 0, saves: 0, shares: 0, directions: 0, out_clicks: 0 };
ok(!buildOwnerBriefing({ now: healthyNow, results: emptyTraffic }).needsChanges.some((card) => card.id === "traffic-session-gap"), "a measured empty traffic window is not a visit tracking defect");

const nullResults = normalResults();
nullResults.kpis.data.active_devices = null;
nullResults.kpis.data.shares = null;
nullResults.signups.data[0].signups = null;
const nullReport = buildOwnerBriefing({ now, results: nullResults });
ok(nullReport.metrics.traffic.deviceCount === null && nullReport.metrics.signups.count === null, "null numeric values remain unknown instead of becoming zero");
ok(nullReport.needsChanges.some((card) => card.id === "missing-traffic" && card.status === "unknown"), "missing traffic is an unknown action");
ok(nullReport.needsChanges.some((card) => card.id === "missing-engagement"), "one missing engagement field makes the engagement summary unavailable");

const disconnected = normalResults();
disconnected.kpis.source = source("First party", false);
const disconnectedReport = buildOwnerBriefing({ now, results: disconnected });
ok(disconnectedReport.metrics.traffic.deviceCount === null, "data attached to a failed source is never trusted");

const unpaidField = normalResults();
unpaidField.affiliate.data.fields_used = ["action_id", "state"];
const unpaidReport = buildOwnerBriefing({ now, results: unpaidField });
const unpaidCard = unpaidReport.needsChanges.find((card) => card.id === "missing-affiliate");
ok(unpaidReport.metrics.affiliate.confirmedBookings === 2 && unpaidReport.metrics.affiliate.paidEarningsUsd === null && unpaidCard && unpaidCard.title === "Paid earnings are unknown" && /confirmed 2 bookings/.test(unpaidCard.detail), "known bookings survive when paid earnings are unavailable");
ok(unpaidReport.summary.headline === "Traffic is reporting. Earnings need attention.", "affiliate-only gaps get a precise owner headline");

const unconfigured = normalResults();
unconfigured.affiliate = { source: { name: "Travelpayouts", connected: false, reason: "not_configured", nextStep: "Add TRAVELPAYOUTS_TOKEN to Vercel.", confidence: "unavailable" }, data: null };
const unconfiguredCard = buildOwnerBriefing({ now, results: unconfigured }).needsChanges.find((card) => card.id === "missing-affiliate");
ok(unconfiguredCard && unconfiguredCard.title === "Travelpayouts reporting is not configured" && /TRAVELPAYOUTS_TOKEN/.test(unconfiguredCard.detail) && !/did not confirm/.test(unconfiguredCard.detail), "missing configuration reports its actual reason and remedy");

const providerError = normalResults();
providerError.affiliate = { source: { name: "Travelpayouts", connected: false, reason: "error", note: "travelpayouts request failed with HTTP 401", confidence: "unavailable" }, data: null };
const providerErrorCard = buildOwnerBriefing({ now, results: providerError }).needsChanges.find((card) => card.id === "missing-affiliate");
ok(providerErrorCard && providerErrorCard.title === "Travelpayouts reporting failed" && /HTTP 401/.test(providerErrorCard.detail) && !/did not confirm/.test(providerErrorCard.detail), "provider errors are distinct from unsupported commission fields");

const tpFields = ["action_id", "date", "state", "price_usd", "paid_profit_usd", "profit_usd", "campaign_id"];
const jsonResponse = (payload, status = 200) => new Response(typeof payload === "string" ? payload : JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
const tpDates = (date) => [new Date(`${date}T00:00:00.000Z`), new Date(`${date}T23:59:59.999Z`)];

const paidAndPending = await tpStats(...tpDates("2026-08-01"), { env: { TRAVELPAYOUTS_TOKEN: "test" }, fetchImpl: async (_url, init) => {
  const body = JSON.parse(init.body);
  ok(body.offset === 0 && body.limit === 10000 && body.filters.some((filter) => filter.field === "type" && filter.value === "action"), "statistics query requests action rows with explicit pagination");
  return jsonResponse({ results: [
    { action_id: "paid-1", date: "2026-08-01", state: "paid", price_usd: "100", paid_profit_usd: "10", profit_usd: "999", campaign_id: 1 },
    { action_id: "pending-1", date: "2026-08-01", state: "processing", price_usd: "50", paid_profit_usd: "777", profit_usd: "4.5", campaign_id: 1 },
  ], fields: tpFields, total_rows: 2, offset: 0, limit: 10000 });
} });
ok(paidAndPending.source.connected && paidAndPending.data.revenue_paid_usd === 10 && paidAndPending.data.revenue_pending_usd === 4.5, "paid rows use paid_profit_usd while processing rows use their unconfirmed profit field");

let partialCalls = 0;
const partial = await tpStats(...tpDates("2026-08-02"), { env: { TRAVELPAYOUTS_TOKEN: "test" }, fetchImpl: async (_url, init) => {
  partialCalls += 1;
  const body = JSON.parse(init.body);
  if (body.fields.includes("paid_profit_usd")) return jsonResponse("wrong field: paid_profit_usd", 400);
  return jsonResponse({ results: [
    { action_id: "known-paid", date: "2026-08-02", state: "paid", price_usd: "30", profit_usd: "2", campaign_id: 1 },
    { action_id: "known-processing", date: "2026-08-02", state: "processing", price_usd: "40", profit_usd: "3", campaign_id: 1 },
  ], fields: body.fields, total_rows: 2, offset: 0, limit: 10000 });
} });
ok(partialCalls === 2 && partial.source.connected && partial.source.reason === "commission_fields_unavailable" && partial.source.missingFields.includes("paid_profit_usd"), "a rejected paid field becomes an explicit partial source");
ok(partial.data.confirmed_bookings === 2 && partial.data.revenue_paid_usd === null && partial.data.revenue_pending_usd === 3, "a rejected paid field preserves known bookings and pending income without inventing paid revenue");

const malformed = await tpStats(...tpDates("2026-08-03"), { env: { TRAVELPAYOUTS_TOKEN: "test" }, fetchImpl: async () => jsonResponse({}) });
ok(!malformed.source.connected && malformed.source.reason === "error" && malformed.source.category === "invalid_response" && malformed.data === null, "malformed provider objects fail visibly instead of becoming measured zeroes");

const pageOffsets = [];
const paginated = await tpStats(...tpDates("2026-08-04"), { env: { TRAVELPAYOUTS_TOKEN: "test" }, pageLimit: 2, fetchImpl: async (_url, init) => {
  const body = JSON.parse(init.body);
  pageOffsets.push(body.offset);
  const results = body.offset === 0
    ? [{ action_id: "page-1", date: "2026-08-04", state: "paid", price_usd: "10", paid_profit_usd: "1", profit_usd: "1", campaign_id: 1 }, { action_id: "page-2", date: "2026-08-04", state: "paid", price_usd: "20", paid_profit_usd: "2", profit_usd: "2", campaign_id: 1 }]
    : [{ action_id: "page-3", date: "2026-08-04", state: "processing", price_usd: "30", paid_profit_usd: "99", profit_usd: "3", campaign_id: 1 }];
  return jsonResponse({ results, fields: tpFields, total_rows: 3, offset: body.offset, limit: 2 });
} });
ok(pageOffsets.join(",") === "0,2" && paginated.data.rows_seen === 3 && paginated.data.pages_fetched === 2 && paginated.data.confirmed_bookings === 3, "all pages are fetched when total_rows exceeds the page limit");

const failing = normalResults();
failing.health.data.checks = [{ key: "home", label: "Homepage", ok: false, status: 503, ms: 100 }];
const failingReport = buildOwnerBriefing({ now, results: failing });
ok(failingReport.summary.status === "attention" && failingReport.cards[0].id === "health-home" && failingReport.cards[0].status === "needs_change", "true health failure is the first action");

const calls = { kpis: 0, signups: 0, health: 0, affiliate: 0 };
let kpiWindow;
let affiliateWindow;
const gathered = await gatherOwnerBriefing(now, { timeoutMs: 100, collectors: {
  kpis: (from, to) => { calls.kpis++; kpiWindow = [from, to]; return normalResults().kpis; },
  signups: () => { calls.signups++; return normalResults().signups; },
  health: () => { calls.health++; return normalResults().health; },
  affiliate: (from, to) => { calls.affiliate++; affiliateWindow = [from, to]; return normalResults().affiliate; },
} });
ok(Object.values(calls).every((count) => count === 1), "shared collector calls each source exactly once");
ok(gathered.dateKey === "2026-09-08" && kpiWindow[0].toISOString() === "2026-09-08T04:00:00.000Z" && kpiWindow[1].toISOString() === "2026-09-09T04:00:00.000Z", "first-party sources receive exact ET boundaries");
ok(affiliateWindow[0].toISOString() === "2026-09-08T00:00:00.000Z" && affiliateWindow[1].toISOString() === "2026-09-08T23:59:59.999Z", "affiliate source receives one provider calendar date, excluding today");

const started = Date.now();
const timed = await gatherOwnerBriefing(now, { timeoutMs: 20, collectors: {
  kpis: () => new Promise(() => {}), signups: () => normalResults().signups,
  health: () => Promise.reject(new Error("check broke")), affiliate: () => normalResults().affiliate,
} });
ok(Date.now() - started < 250 && timed.sources.firstParty.reason === "error" && timed.sources.health.reason === "error", "collector bounds hung sources and labels rejected sources");

const escapedResults = normalResults();
escapedResults.health.data.checks = [{ key: "x", label: "<script>alert('x')</script>", ok: false, status: 500 }];
const escapedReport = buildOwnerBriefing({ now, results: escapedResults });
const plain = briefingText(escapedReport);
const html = briefingHtml(escapedReport);
ok(plain.includes("Working well") && plain.includes("Needs changes") && plain.includes("Three next actions") && plain.includes("Open Command Center") === false, "plain report contains all three report sections");
ok(html.includes("&lt;script&gt;") && !html.includes("<script>alert") && html.includes("https://www.gowayfind.com/command-center"), "HTML escapes source text and links to Command Center");
ok(html.includes("#0f0d0b") && html.includes("#ff8a3d") && html.includes("max-width:600px"), "HTML uses the dark orange 600px layout");

let sentBody;
const sent = await sendOwnerBriefingEmail({ briefing: report, apiKey: "test", from: "a@example.com", to: "b@example.com", fetchImpl: async (_url, init) => {
  sentBody = JSON.parse(init.body);
  return { ok: true, status: 200, json: async () => ({ id: "email_123" }) };
} });
ok(sent.ok && sent.id === "email_123" && sentBody.text.includes("$14.50") && sentBody.html.includes("$14.50"), "send requires and returns provider id; text and HTML carry the same earnings");
const noId = await sendOwnerBriefingEmail({ briefing: report, apiKey: "test", from: "a@example.com", to: "b@example.com", fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }) });
ok(!noId.ok && noId.status === 502 && noId.reason === "email_confirmation_missing", "HTTP 200 without provider id is a delivery failure");
const conflict = await sendOwnerBriefingEmail({ briefing: report, apiKey: "test", from: "a@example.com", to: "b@example.com", fetchImpl: async () => ({ ok: false, status: 409, json: async () => ({ message: "payload differs" }) }) });
ok(!conflict.ok && conflict.conflict && conflict.reason === "idempotency_conflict", "same-date changed-payload conflict is explicit and never success");

// This standalone guard owns its process; explicitly remove ambient auth.
delete process.env.CRON_SECRET;
const { GET: cronGet } = await import("../app/api/cron/route.js");
const unauthorized = await cronGet(new Request("https://example.test/api/cron"));
ok(unauthorized.status === 401, "daily cron fails closed before collection when auth is absent");

if (failures) process.exit(1);
console.log("test-command-center-briefing: OK — complete ET window, honest nulls/sources/earnings, bounded collection, exact actions, safe email and fail-closed cron");
