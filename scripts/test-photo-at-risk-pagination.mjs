#!/usr/bin/env node
// Regression guard for the at-risk photo drain's decided-prefix starvation.
// Hermetic: every REST call is intercepted and every candidate resolver is a
// local double, so this test makes zero Wikimedia, Google, or database calls.
import { runBackfill, describeAtRisk } from "../lib/placePhotoBackfill.js";

let failures = 0;
const ok = (condition, message) => {
  if (condition) return;
  failures++;
  console.error("test-photo-at-risk-pagination: FAIL — " + message);
};
const eq = (actual, expected, message) =>
  ok(actual === expected, `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);

const SB = { url: "https://at-risk-pagination.test.invalid", key: "test-key" };
const expiry = "2026-09-25T00:00:00.000Z";
const row = (n, timestamp = expiry) => ({
  place_id: `place-${String(n).padStart(6, "0")}`,
  name: `Place ${n}`,
  category: "attractions",
  earliest_expiry: timestamp,
});
const rejected = (place_id) => ({
  place_id,
  status: "rejected",
  source_ref: "rejected:identity_mismatch",
  verified_at: "2026-09-10T00:00:00.000Z",
});

function installDb({ atRisk, existingRows, failViewPage = null, throwViewPage = null, malformedJsonPage = null }) {
  const savedFetch = globalThis.fetch;
  const sorted = atRisk.slice().sort((a, b) =>
    String(a.earliest_expiry).localeCompare(String(b.earliest_expiry)) ||
    String(a.place_id).localeCompare(String(b.place_id))
  );
  const existing = new Map(existingRows.map((r) => [r.place_id, r]));
  const viewUrls = [];
  let photoReads = 0;

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method || "GET";
    if (url.pathname.endsWith("/wf_photo_at_risk")) {
      viewUrls.push(url);
      if (throwViewPage === viewUrls.length) throw new TypeError("simulated network failure");
      if (failViewPage === viewUrls.length) return { ok: false, status: 503, json: async () => ({}) };
      if (malformedJsonPage === viewUrls.length) {
        return { ok: true, status: 200, json: async () => { throw new SyntaxError("simulated malformed JSON"); } };
      }
      eq(url.searchParams.get("order"), "earliest_expiry.asc,place_id.asc", "the view uses the complete stable order");
      const logical = url.searchParams.get("or") || "";
      const match = logical.match(/earliest_expiry\.eq\.([^,]+),place_id\.gt\.([^\)]+)/);
      const cursorExpiry = match ? match[1] : null;
      const cursorId = match ? match[2] : null;
      const eligible = cursorId == null
        ? sorted
        : sorted.filter((r) => r.earliest_expiry > cursorExpiry || (r.earliest_expiry === cursorExpiry && r.place_id > cursorId));
      const limit = Number(url.searchParams.get("limit"));
      return { ok: true, status: 200, json: async () => eligible.slice(0, limit) };
    }
    if (url.pathname.endsWith("/wf_place_photo") && method === "GET") {
      photoReads++;
      const filter = url.searchParams.get("place_id") || "";
      const inside = filter.startsWith("in.(") ? filter.slice(4, -1) : "";
      const ids = inside ? JSON.parse(`[${inside}]`) : [];
      return { ok: true, json: async () => ids.map((id) => existing.get(id)).filter(Boolean) };
    }
    throw new Error(`unexpected network call: ${method} ${url}`);
  };

  return {
    get viewCalls() { return viewUrls.length; },
    get photoReads() { return photoReads; },
    get viewUrls() { return viewUrls; },
    restore() { globalThis.fetch = savedFetch; },
  };
}

async function runScenario({ atRisk, existingRows, failViewPage = null, throwViewPage = null, malformedJsonPage = null, deadlineAt = null }) {
  const db = installDb({ atRisk, existingRows, failViewPage, throwViewPage, malformedJsonPage });
  const resolved = [];
  try {
    const result = await runBackfill({
      source: "at-risk",
      limit: 1,
      dryRun: true,
      deadlineAt,
      sbEnv: SB,
      storePhoto: null,
      wikimedia: { canRequest: () => true },
      resolvePhoto: async (place) => {
        resolved.push(place.place_id);
        return null;
      },
    });
    return { result, resolved, db };
  } finally {
    db.restore();
  }
}

function assertLaterPageFailure(result, { status, label }) {
  eq(result.atRiskUnavailable, true, `${label} is classified unavailable`);
  eq(result.atRiskPartial, true, `${label} is classified partial`);
  eq(result.atRiskStatus, status, `${label} retains the available HTTP status`);
  eq(result.atRiskScanned, 1000, `${label} retains the confirmed prefix count`);
  eq(result.alreadyCovered, 1000, `${label} retains the decided-prefix count`);
  ok(String(result.note).startsWith("unavailable:"), `${label} remains deterministically page-worthy`);
}

// The production failure shape: the first 1,200 rows are already decided,
// while the first fresh place is row 1,201. It must be reached in this run.
{
  const atRisk = Array.from({ length: 1201 }, (_, i) => row(i + 1, new Date(Date.parse(expiry) + i * 1000).toISOString()));
  const existingRows = atRisk.slice(0, 1200).map((r) => rejected(r.place_id));
  const { result, resolved, db } = await runScenario({ atRisk, existingRows });
  eq(db.viewCalls, 2, "1,201-row case reads the second PostgREST page");
  eq(resolved[0], atRisk[1200].place_id, "the fresh candidate at position 1,201 is selected");
  eq(result.atRiskScanned, 1201, "the result reports every inspected at-risk row");
  eq(result.alreadyCovered, 1200, "the result reports the decided prefix");
  eq(result.atRiskTaken, 1, "the fresh candidate consumes the at-risk budget");
}

// A page boundary inside one expiry timestamp must advance by place_id, not
// skip the rest of that timestamp cohort.
{
  const atRisk = Array.from({ length: 1001 }, (_, i) => row(i + 1));
  const existingRows = atRisk.slice(0, 1000).map((r) => rejected(r.place_id));
  const { resolved, db } = await runScenario({ atRisk, existingRows });
  eq(resolved[0], atRisk[1000].place_id, "a tied timestamp candidate after the page boundary is selected");
  const secondCursor = db.viewUrls[1] && db.viewUrls[1].searchParams.get("or");
  ok(secondCursor && secondCursor.includes(`earliest_expiry.eq.${expiry}`), "the second page preserves the tied expiry");
  ok(secondCursor && secondCursor.includes(`place_id.gt.${atRisk[999].place_id}`), "the second page advances by the tie-break place_id");
}

// Healthy small worklists stay one-page operations.
{
  const atRisk = [row(1), row(2)];
  const { result, resolved, db } = await runScenario({ atRisk, existingRows: [rejected(atRisk[0].place_id)] });
  eq(db.viewCalls, 1, "a normal short worklist takes one view read");
  eq(resolved[0], atRisk[1].place_id, "the normal one-page candidate is selected");
  eq(result.atRiskPartial, false, "a short terminal page is classified complete");
}

// No fixed prefix may become tomorrow's starvation ceiling.
{
  const atRisk = Array.from({ length: 6001 }, (_, i) => row(i + 1));
  const existingRows = atRisk.slice(0, 6000).map((r) => rejected(r.place_id));
  const { resolved, db } = await runScenario({ atRisk, existingRows });
  eq(db.viewCalls, 7, "pagination continues beyond 6,000 rows without a fixed ceiling");
  eq(resolved[0], atRisk[6000].place_id, "the first fresh candidate after 6,000 decided rows is selected");
}

// A later-page failure is unavailable and partial, never an empty/exhausted
// worklist, and it starts no provider work from an explicit at-risk run.
{
  const atRisk = Array.from({ length: 1001 }, (_, i) => row(i + 1));
  const existingRows = atRisk.slice(0, 1000).map((r) => rejected(r.place_id));
  const { result, resolved } = await runScenario({ atRisk, existingRows, failViewPage: 2 });
  assertLaterPageFailure(result, { status: 503, label: "a later-page HTTP failure" });
  ok(describeAtRisk({ ...result, source: "at-risk" }).includes("after 1000 scanned"), "partial failure reporting retains the confirmed prefix count");
  eq(resolved.length, 0, "an unavailable explicit at-risk read starts zero provider candidates");
}

// Fetch rejection and malformed response JSON used to escape the page helper,
// causing runBackfill's outer catch to discard the first page's known counts.
{
  const atRisk = Array.from({ length: 1001 }, (_, i) => row(i + 1));
  const existingRows = atRisk.slice(0, 1000).map((r) => rejected(r.place_id));

  const thrown = await runScenario({ atRisk, existingRows, throwViewPage: 2 });
  assertLaterPageFailure(thrown.result, { status: null, label: "a later-page network throw" });
  eq(thrown.resolved.length, 0, "a later-page network throw starts zero provider candidates");

  const malformed = await runScenario({ atRisk, existingRows, malformedJsonPage: 2 });
  assertLaterPageFailure(malformed.result, { status: 200, label: "later-page malformed JSON" });
  eq(malformed.resolved.length, 0, "later-page malformed JSON starts zero provider candidates");
}

// The existing worker deadline bounds pagination. Hitting it is partial, not
// unavailable and not an exhausted-worklist claim.
{
  const atRisk = Array.from({ length: 1001 }, (_, i) => row(i + 1));
  const existingRows = atRisk.slice(0, 1000).map((r) => rejected(r.place_id));
  const { result, db } = await runScenario({ atRisk, existingRows, deadlineAt: Date.now() - 1 });
  eq(db.viewCalls, 1, "an elapsed worker deadline prevents a continuation page read");
  eq(result.atRiskUnavailable, false, "deadline truncation is not a database outage");
  eq(result.atRiskPartial, true, "deadline truncation is classified partial");
  ok(describeAtRisk({ ...result, source: "at-risk" }).includes("PARTIAL"), "deadline truncation cannot render as an empty completed scan");
}

if (failures) {
  console.error(`test-photo-at-risk-pagination: ${failures} failure(s)`);
  process.exit(1);
}
console.log("test-photo-at-risk-pagination: OK — stable unbounded keyset pages cross decided prefixes and timestamp ties, stop after enough fresh work, and classify deadline/failure truncation honestly");
