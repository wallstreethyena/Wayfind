#!/usr/bin/env node
// Owner editorial rules (2026-09-29), hermetic: no network, no database, no env.
//   1. best_time / local_tip may be absent; hook, why_here, know_before may not.
//   2. A wf_editorial placeholder (never verified, every prose slot blank) may
//      be replaced through a guarded UPDATE with its prior state audited first;
//      any other existing row still refuses. An occupied wf_inventory.editorial
//      refuses unless the owner recorded that the owner row supersedes it.
//   3. local_press (three hosts) is descriptive-only: an operational datum must
//      be backed by an allowed non-press class.
// Owner path only; the atlas-build cron path (lib/atlasVerify.js) is untouched.
import { readFileSync } from "node:fs";
import {
  buildReplacementAudit,
  placeholderGuardQuery,
  preflightOwnedEditorial,
  writeOwnedEditorial,
} from "./lib/ownedEditorialPublisher.mjs";
import { auditPathFor } from "./publish-owned-editorial.mjs";
import {
  INVENTORY_EDITORIAL_SUPERSEDED,
  isReplaceablePlaceholder,
  operationalData,
  reviewOwnedEditorialPack,
} from "../lib/ownedEditorialReview.js";

let passed = 0;
function ok(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed++;
}
async function rejects(fn, pattern, message) {
  try { await fn(); } catch (error) { ok(pattern.test(error.message), `${message} (got: ${error.message})`); return; }
  throw new Error(`FAIL: ${message} (did not throw)`);
}

const base = JSON.parse(readFileSync(new URL("../docs/editorial/free-first-beach-pilot-2026-09-09/beach-editorial-pilot.json", import.meta.url), "utf8"));
const GOV = base.candidates[0].evidence[0].source;
const packOf = (mutate) => {
  const candidate = structuredClone(base.candidates[0]);
  mutate(candidate);
  return { ...structuredClone(base), candidates: [candidate] };
};
const checks = (pack) => reviewOwnedEditorialPack(pack).errors.map((error) => `${error.check}:${error.field}`);
const has = (pack, check) => reviewOwnedEditorialPack(pack).errors.some((error) => error.check === check);
ok(reviewOwnedEditorialPack(packOf(() => {})).ok, "control: the unmodified pilot candidate passes");

// 1. best_time / local_tip optional; the other three required.
const noOptional = packOf((c) => {
  c.editorial.best_time = null; c.editorial.local_tip = null;
  c.editorial.citations.best_time = []; c.editorial.citations.local_tip = [];
});
const noOptionalReview = reviewOwnedEditorialPack(noOptional);
ok(noOptionalReview.ok, `null best_time and local_tip are accepted: ${JSON.stringify(noOptionalReview.errors)}`);
ok(noOptionalReview.rows[0].best_time === null && noOptionalReview.rows[0].local_tip === null && noOptionalReview.rows[0].verified === true && noOptionalReview.rows[0].issues === null,
  "the row carries null best_time/local_tip and is still verified with no issues");
ok(reviewOwnedEditorialPack(packOf((c) => { delete c.editorial.best_time; delete c.editorial.local_tip; delete c.editorial.citations.best_time; delete c.editorial.citations.local_tip; })).ok, "absent (not just null) best_time/local_tip are accepted");
for (const field of ["hook", "why_here", "know_before"]) {
  ok(has(packOf((c) => { c.editorial[field] = null; }), "missing"), `${field} stays required`);
}
ok(has(packOf((c) => { c.editorial.best_time = "Sunrise is quietest."; c.editorial.citations.best_time = []; }), "missing-citation"), "a present best_time still needs a citation");
ok(has(packOf((c) => { c.editorial.local_tip = Array(40).fill("word").join(" "); }), "word-cap"), "a present local_tip still obeys its word cap");
ok(has(packOf((c) => { c.editorial.local_tip = "Park at the northern access."; c.editorial.citations.local_tip = ["https://example.com/x"]; }), "citation-not-in-evidence"), "a present local_tip still needs an in-evidence citation");

// 2a. Placeholder replacement, offline review.
const placeholderPrior = { hook: null, why_here: "", know_before: null, best_time: null, local_tip: null, verified: false, issues: ["thin-hook", "no-sourced-facts"], written_at: "2026-08-01T10:00:00Z", attempt_count: 3, standard_version: "atlas-590-v1" };
const replacePack = (prior) => packOf((c) => { c.inventory_snapshot.wf_editorial_present = true; if (prior !== undefined) c.inventory_snapshot.wf_editorial_prior = prior; });
ok(reviewOwnedEditorialPack(replacePack(placeholderPrior)).ok, "a never-verified all-blank placeholder snapshot may be replaced");
ok(reviewOwnedEditorialPack(replacePack(placeholderPrior)).reports[0].replaces_placeholder === true, "the report marks the candidate as a placeholder replacement");
ok(has(replacePack(undefined), "already-has-wf-editorial"), "an existing row with no recorded prior state still refuses");
for (const field of ["hook", "why_here", "know_before", "best_time", "local_tip"]) {
  ok(has(replacePack({ ...placeholderPrior, [field]: "Real prose already here." }), "already-has-wf-editorial"), `an existing row with ${field} prose refuses`);
}
ok(has(replacePack({ ...placeholderPrior, verified: true }), "already-has-wf-editorial"), "a previously verified row refuses even if every prose slot is blank");
ok(isReplaceablePlaceholder({ verified: null, hook: "  ", why_here: null }) && !isReplaceablePlaceholder({ verified: true }) && !isReplaceablePlaceholder(null), "isReplaceablePlaceholder: null verified is never-verified; verified=true and no row are not replaceable");

// 2b. Inventory summary.
const invPack = (disposition) => packOf((c) => { c.inventory_snapshot.inventory_editorial_present = true; if (disposition) c.inventory_snapshot.inventory_editorial_disposition = disposition; });
ok(has(invPack(null), "inventory-editorial-occupied"), "an occupied inventory summary still refuses by default");
ok(has(invPack("something-else"), "inventory-editorial-occupied"), "only the exact owner-supersedes disposition lifts the refusal");
ok(reviewOwnedEditorialPack(invPack(INVENTORY_EDITORIAL_SUPERSEDED)).ok, "an occupied inventory summary proceeds when the owner recorded that the owner row supersedes it");
ok(has(packOf((c) => { c.inventory_snapshot.inventory_editorial_card_present = true; c.inventory_snapshot.inventory_editorial_disposition = INVENTORY_EDITORIAL_SUPERSEDED; }), "inventory-editorial-card-occupied"), "an occupied inventory editorial CARD refuses regardless");

// 2c. Live preflight and guarded write, all against fixtures.
const cand = structuredClone(base.candidates[0]);
cand.inventory_snapshot.wf_editorial_present = true;
const invRow = { place_id: cand.place_id, name: cand.name, category: cand.category, metro: cand.metro, primary_type: cand.primary_type, status: "OPERATIONAL", needs_review: false, editorial: null, editorial_card: null };
const dbRow = { place_id: cand.place_id, hook: null, why_here: null, know_before: null, best_time: null, local_tip: null, facts: [], verified: false, issues: ["thin-hook"], written_at: "2026-08-01T10:00:00Z", attempt_count: 3, last_attempted_at: "2026-08-02T10:00:00Z", standard_version: "atlas-590-v1" };
const json = (value) => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
const env = (inventory, editorial) => ({ url: "https://fixture.supabase.co", key: "k", fetchImpl: async (url) => json(url.includes("/wf_inventory?") ? inventory : editorial) });
const pre = (candidate, inventory, editorial) => preflightOwnedEditorial([candidate], env(inventory, editorial));

const okPre = await pre(cand, [invRow], [dbRow]);
ok(okPre.ok && okPre.reports[0].replaces_placeholder, "live preflight allows replacing a never-verified all-blank placeholder");
const prior = okPre.reports[0].prior_row;
ok(prior.issues.join() === "thin-hook" && prior.written_at === dbRow.written_at && prior.attempt_count === 3 && prior.standard_version === "atlas-590-v1" && prior.verified === false,
  "the preflight report captures the prior row's issues, written_at, attempt_count and standard_version");
for (const [label, patch] of [["prose", { why_here: "Real copy." }], ["verified", { verified: true }], ["best_time prose", { best_time: "Sunrise." }]]) {
  const refused = await pre(cand, [invRow], [{ ...dbRow, ...patch }]);
  ok(!refused.ok && refused.errors.some((e) => e.check === "already-has-wf-editorial"), `live preflight refuses an existing row with ${label}`);
}
const drift = await pre({ ...cand, inventory_snapshot: { ...cand.inventory_snapshot, wf_editorial_present: false } }, [invRow], [dbRow]);
ok(!drift.ok && drift.errors.some((e) => e.check === "wf-editorial-snapshot-drift"), "a placeholder the pack did not record is snapshot drift, not a silent replace");
const occupiedPre = await pre(cand, [{ ...invRow, editorial: "A Google summary line." }], [dbRow]);
ok(!occupiedPre.ok && occupiedPre.errors.some((e) => e.check === "inventory-editorial-occupied"), "live preflight refuses an occupied inventory summary by default");
const supersededPre = await pre({ ...cand, inventory_snapshot: { ...cand.inventory_snapshot, inventory_editorial_present: true, inventory_editorial_disposition: INVENTORY_EDITORIAL_SUPERSEDED } }, [{ ...invRow, editorial: "A Google summary line." }], [dbRow]);
ok(supersededPre.ok && supersededPre.reports[0].inventory_editorial_disposition === INVENTORY_EDITORIAL_SUPERSEDED, "live preflight proceeds when the owner recorded that the owner row supersedes the summary");

// Audit history is captured before the write.
const audit = buildReplacementAudit(okPre.reports, { pack: "docs/editorial/x/pack.json", reviewedBy: "Gabe", researchedAt: "2026-09-29T00:00:00Z", now: "2026-09-29T01:00:00Z" });
ok(audit.replaced.length === 1 && audit.replaced[0].prior_row.attempt_count === 3 && audit.replaced[0].prior_row.issues[0] === "thin-hook" && audit.replaced[0].prior_row.written_at === dbRow.written_at && audit.replaced[0].prior_row.standard_version === "atlas-590-v1",
  "the audit record preserves the prior row's issues, written_at, attempt_count and standard_version");
ok(buildReplacementAudit([{ place_id: "x", replaces_placeholder: false }]).replaced.length === 0, "a plain insert candidate adds nothing to the audit");
ok(auditPathFor("/r/docs/editorial/b/pack.json") === "/r/docs/editorial/b/pack.audit.json", "the audit file sits next to the pack");

// Guarded UPDATE.
const guard = placeholderGuardQuery("ChIJ_abc-1");
ok(guard.includes("place_id=eq.ChIJ_abc-1") && guard.includes("verified=not.is.true") && ["hook", "why_here", "know_before", "best_time", "local_tip"].every((f) => guard.includes(`or(${f}.is.null,${f}.eq.)`)),
  "the UPDATE guard requires verified is not true AND every prose slot null or empty");
const reviewRow = reviewOwnedEditorialPack(noOptional).rows[0];
const calls = [];
const record = (responder) => async (url, init) => { calls.push({ url, method: init?.method, body: init?.body }); return json(responder(url, init)); };
const savedRows = await writeOwnedEditorial([reviewRow], { url: "https://fixture.supabase.co", key: "k", fetchImpl: record(() => [{ place_id: reviewRow.place_id, verified: true, issues: null }]) }, { replacements: new Set([reviewRow.place_id]) });
ok(savedRows.length === 1 && calls.length === 1 && calls[0].method === "PATCH" && calls[0].url.includes("verified=not.is.true") && !calls[0].url.includes("on_conflict"), "a replacement is a guarded PATCH, never an upsert");
const patchBody = JSON.parse(calls[0].body);
ok(!("place_id" in patchBody) && patchBody.best_time === null && patchBody.local_tip === null && patchBody.verified === true, "the PATCH body carries the new row (null optional fields, verified) without place_id");
await rejects(
  () => writeOwnedEditorial([reviewRow], { url: "https://fixture.supabase.co", key: "k", fetchImpl: record(() => []) }, { replacements: new Set([reviewRow.place_id]) }),
  /not overwritten/,
  "a race that gave the row content matches zero rows and fails loudly instead of overwriting",
);
calls.length = 0;
const insertOnly = await writeOwnedEditorial([reviewRow], { url: "https://fixture.supabase.co", key: "k", fetchImpl: record(() => [{ place_id: reviewRow.place_id, verified: true, issues: null }]) });
ok(insertOnly.length === 1 && calls[0].method === "POST" && calls[0].url.includes("on_conflict=place_id"), "without a replacement the existing ignore-duplicates insert path is unchanged");

// 3. local_press, descriptive only.
const PRESS = "https://www.sarasotamagazine.com/restaurants-and-food/cortez-beach";
const pressPack = ({ pressSupports, claim, extra = () => {}, host = PRESS, klass = "local_press", govSupports }) => packOf((c) => {
  c.evidence.push({ source: host, source_name: "Local press", source_class: klass, checked_at: "2026-09-29", supports: pressSupports });
  if (govSupports) c.evidence[0].supports.push(...govSupports);
  if (claim) c.editorial.facts.push({ claim, source: host });
  extra(c);
});
const descriptive = "The magazine describes the beach as a quiet stretch favored by locals.";
ok(reviewOwnedEditorialPack(pressPack({ pressSupports: [descriptive], claim: descriptive })).ok, "local press supports a descriptive fact");
for (const host of ["https://yourobserver.com/a", "https://www.heraldtribune.com/story/1"]) {
  ok(reviewOwnedEditorialPack(pressPack({ pressSupports: [descriptive], claim: descriptive, host })).ok, `${host} is an allowed local press host`);
}
ok(has(pressPack({ pressSupports: [descriptive], host: "https://example.com/a" }), "local-press-host"), "local_press on any other host is refused");
ok(has(pressPack({ pressSupports: [descriptive], host: "https://www.yelp.com/biz/x" }), "blocked-source-host"), "Yelp stays blocked even labelled local_press");
ok(has(pressPack({ pressSupports: [descriptive], host: "https://www.tripadvisor.com/x" }), "blocked-source-host"), "Tripadvisor stays blocked even labelled local_press");
ok(has(pressPack({ pressSupports: [descriptive], klass: "blog" }), "source-class"), "an unknown source class is still refused");
const operational = {
  hours: "The magazine says the beach is open 7 a.m. to 9 p.m. daily.",
  days: "The magazine says the pavilion closes Monday through Thursday.",
  phone: "The magazine lists the ranger station at (941) 555-0123.",
  price: "The magazine says parking costs $10 a day.",
  date: "The magazine says the beach reopened on June 14.",
  year: "The magazine says the pavilion opened in 1998.",
  address: "The magazine places the entrance at 123 Gulf Drive North.",
  zip: "The magazine gives the address as Bradenton Beach, FL 34217.",
};
for (const [kind, claim] of Object.entries(operational)) {
  ok(operationalData(claim).length > 0, `the datum detector sees the ${kind} claim`);
  ok(reviewOwnedEditorialPack(pressPack({ pressSupports: [claim], claim })).errors.some((e) => e.check === "press-operational-claim"), `press alone cannot support a ${kind} fact (press-operational-claim)`);
}
ok(operationalData(descriptive).length === 0, "a descriptive sentence carries no operational datum");
const hoursClaim = operational.hours;
ok(reviewOwnedEditorialPack(pressPack({ pressSupports: [hoursClaim], claim: hoursClaim, govSupports: [hoursClaim] })).ok, "the same operational claim is accepted once an allowed non-press source carries it");
const tipPack = (govSupports) => pressPack({
  pressSupports: ["Locals arrive by 8 AM to find parking."], govSupports,
  extra: (c) => { c.editorial.local_tip = "Arrive by 8 AM for parking."; c.editorial.citations.local_tip = govSupports ? [PRESS, GOV] : [PRESS]; },
});
ok(reviewOwnedEditorialPack(tipPack()).errors.some((e) => e.check === "press-operational-claim" && e.field === "editorial.local_tip"), "prose that cites press alone for a clock time is refused");
ok(!reviewOwnedEditorialPack(tipPack(["Public parking fills by 8 AM."])).errors.some((e) => e.check === "press-operational-claim"), "the same time is accepted when a non-press item cited by that field carries it");
const descriptiveTip = pressPack({
  pressSupports: ["Locals treat the north end as the quiet stretch."],
  extra: (c) => { c.editorial.local_tip = "Locals treat the north end as the quiet stretch."; c.editorial.citations.local_tip = [PRESS]; },
});
ok(!reviewOwnedEditorialPack(descriptiveTip).errors.some((e) => e.check === "press-operational-claim"), "descriptive prose may cite press alone");

console.log(`test-owned-editorial-rules: ${passed} assertions passed`);
