import { buildEditorialCoverage, fetchComplete } from "./report-editorial-coverage.mjs";
import { atlasAsRow } from "../lib/atlasCards.js";
import { knownForLine } from "../lib/knownFor.js";

let assertions = 0;
const ok = (value, message) => { assertions++; if (!value) throw new Error(message); };
const inv = (place_id, extra = {}) => ({ place_id, name: place_id, category: "food", metro: "orlando", status: "OPERATIONAL", needs_review: false, excluded: false, editorial: null, editorial_card: null, ...extra });
const wf = (place_id, extra = {}) => ({ place_id, hook: `A specific checked reason to visit ${place_id}.`, why_here: "Useful checked detail.", local_tip: null, verified: true, issues: null, ...extra });
const card = (placeId, name = placeId) => ({ placeId, name, knownFor: `A specific Atlas reason to visit ${name}.`, whyGo: "Checked Atlas detail.", sourceUrls: ["https://official.example/place"] });

const inventory = [
  inv("wf-good"),
  inv("wf-bad"),
  inv("flagged", { needs_review: true }),
  inv("atlas-alias", { name: "Atlas Place" }),
  inv("atlas-canon", { name: "Atlas Place" }),
  inv("legacy", { name: "Legacy Place" }),
  inv("summary", { editorial: "A provider description long enough to appear as the known-for fallback." }),
  inv("overlap", { name: "Overlap Place", editorial_card: card("overlap", "Overlap Place") }),
  inv("tibbals", { name: "Tibbals Fixture", editorial_card: card("tibbals", "Tibbals Fixture") }),
  inv("unknown-card", { editorial_card: "unparsed" }),
  inv("none"),
  inv("closed", { status: "CLOSED_PERMANENTLY" }),
];
const cards = [card("atlas-canon", "Atlas Place"), card("overlap", "Overlap Place")];
const failedWf = wf("wf-bad", { verified: false, issues: ["FAILED VERIFICATION"] });
const report = buildEditorialCoverage({
  inventory,
  identityInventory: inventory,
  cards,
  resolveCanonical: (id) => id === "atlas-alias" ? "atlas-canon" : id,
  legacyLookup: (name) => name === "Legacy Place" ? { name, why: "A hand-reviewed legacy reason." } : null,
  ledgerRows: [wf("wf-good"), failedWf, wf("overlap")],
  servableRows: [wf("wf-good"), wf("overlap")],
});

ok(report.totals.listed === 11, `aliases must dedupe to eleven canonical places, got ${report.totals.listed}`);
ok(report.totals.editorial_available === 4, "wf, Atlas, legacy, and the overlapping place have generic editorial");
ok(report.primarySources.atlas === 2 && report.primarySources.wf_editorial === 1 && report.primarySources.legacy === 1, "source precedence is disjoint and Atlas wins overlaps");
ok(report.overlaps === 1 && report.storedCardOverlaps === 1, "generic-source and stored-card overlaps are disclosed separately");
ok(report.totals.stored_card_only === 1, "a Tibbals-style source-backed stored card does not inflate visible editorial coverage");
ok(report.totals.summary_only === 1, "provider prose is summary-only");
ok(report.totals.review_needed === 1, "an otherwise servable flagged row is review-needed, not missing");
ok(report.totals.no_known_content === 1, "only the measured blank, unflagged place is no-content");
ok(report.totals.unknown === 2, "unparsed held cards and failed ledger rows are unknown, never invented as content gaps");
ok(report.totals.suppressed === 1, "closed places are suppressed");
ok(report.ledger.raw_rows === 3 && report.ledger.verified_rows === 2 && report.ledger.unverified_or_issued_rows === 1, "raw verified/unverified ledger rows stay separate from coverage");
ok(report.ledger.read_gated_view_rows === 2 && report.ledger.review_servable_rows === 2, "the actual serving view and review gate are reported separately");
ok(!!knownForLine(atlasAsRow(cards[0])) && report.primarySources.atlas === 2, "coverage agrees with the real Atlas-to-known-for serving path for usable cards");
ok(knownForLine(failedWf) === null && report.totals.unknown === 2, "coverage agrees with the real known-for rejection of failed verification and does not call it missing");

function response(rows, range, okValue = true, status = 200) {
  return { ok: okValue, status, headers: { get: (name) => name.toLowerCase() === "content-range" ? range : null }, json: async () => rows };
}
const pages = [response([{ id: 1 }, { id: 2 }], "0-1/3", true, 206), response([{ id: 3 }], "2-2/3", true, 206)];
const complete = await fetchComplete("fixture", { url: "https://fixture.supabase.co", key: "fixture", pageSize: 2, fetchImpl: async () => pages.shift() });
ok(complete.length === 3, "pagination reads every page and proves the exact total");
await fetchComplete("fixture", { url: "https://fixture.supabase.co", key: "fixture", fetchImpl: async () => response([], "*/4") })
  .then(() => { throw new Error("short source should fail"); }, (error) => ok(/ended at 0\/4/.test(error.message), "a short source fails instead of inventing missing coverage"));
await fetchComplete("fixture", { url: "https://fixture.supabase.co", key: "fixture", fetchImpl: async () => response({ error: true }, "*/0") })
  .then(() => { throw new Error("malformed source should fail"); }, (error) => ok(/non-array/.test(error.message), "a malformed source fails instead of becoming zero coverage"));
await fetchComplete("fixture", { url: "https://fixture.supabase.co", key: "fixture", fetchImpl: async () => response([], "", false, 503) })
  .then(() => { throw new Error("failed source should fail"); }, (error) => ok(/source failed/.test(error.message), "a failed source never becomes a missing-page claim"));

console.log(`test-report-editorial-coverage: OK — ${assertions} assertions`);
