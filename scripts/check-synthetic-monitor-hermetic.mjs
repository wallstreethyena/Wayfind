#!/usr/bin/env node
/**
 * check-synthetic-monitor-hermetic — proves the SYNTHETIC USER MONITOR's
 * scenario definitions and evidence/redaction logic are correct WITHOUT
 * touching the network.
 *
 * scripts/run-synthetic-monitor.mjs is a live-network SMOKE TEST (it opens
 * real Chromium pages against production) and is deliberately absent from
 * scripts/guards.txt — a flaky partner or CDN must never be able to block a
 * merge (see check-guard-hermeticity.mjs's own rationale for keeping that
 * split). What CAN and MUST run in the guard suite is everything the smoke
 * test is BUILT FROM: the scenario table's structure, and the redaction /
 * evidence-writing pipeline every failure evidence file passes through
 * before it touches disk. Those are pure functions of the repo, so they get
 * a hermetic guard like any other invariant.
 *
 * Three things this file red-proves rather than assumes:
 *
 *   1. scripts/lib/synthetic/scenarios.mjs already throws at import time if
 *      any SCENARIOS entry is structurally malformed — importing it here IS
 *      part of the test. This file adds assertions on top (unique ids, every
 *      REQUIRED_FLOWS entry covered, run is callable) so a regression that
 *      only weakens coverage — not shape — still gets caught.
 *   2. redactUrl/redactNetworkFailures are exercised against a FAKE
 *      credential/PID-shaped string with a positive control (the secret is
 *      removed) and a self-test proving the detector can tell redacted from
 *      not (mirrors check-guard-hermeticity.mjs's own ambientReads() shape).
 *   3. writeScenarioFailureEvidence is called for REAL against a real tmp
 *      directory (os.tmpdir(), never inside the repo), the written meta.json
 *      is READ BACK from disk, and the raw fake secret is asserted ABSENT
 *      while "[REDACTED]" is asserted PRESENT — the literal "red-prove",
 *      executed against the filesystem-writing function itself, not a
 *      re-implementation of it.
 *
 * It also asserts .github/workflows/synthetic-monitor.yml is installed at
 * its REAL path with a real cron schedule and actually invokes the runner —
 * see that file's own header comment for why (ops/canary.workflow.yml sat
 * unreachable at a non-workflow path and three real guards never ran once).
 *
 * Zero process.env reads decide any verdict here (see check-guard-hermeticity.mjs).
 */
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

import { SCENARIOS, REQUIRED_FLOWS, HOMEPAGE_CARD_BUDGET_MS } from "./lib/synthetic/scenarios.mjs";
// The product decision itself. Imported so the approved poster list can be
// checked against it rather than against a copy that drifts (see §0).
import { RAILS } from "../lib/rails.js";
import {
  EXPECTED_VISIBLE_POSTER_IDS,
  posterMenuDiff,
  railWindowFromCapturedPayload,
  rowsForRailWindow,
  mergeCapturedRailWindows,
  reconcileRenderedCardNames,
  reconcileRenderedCards,
  continuationUiSettled,
  exactRenderedIdSet,
} from "./lib/synthetic/menuPosterIntegrity.mjs";
import {
  redactUrl,
  redactUrlsInText,
  redactTextList,
  redactNetworkFailure,
  redactNetworkFailures,
  containsNoRawSecret,
  describeRedirectDestination,
} from "./lib/synthetic/redact.mjs";
import { writeScenarioFailureEvidence, stampFor, runEvidenceDir } from "./lib/synthetic/evidence.mjs";

let pass = 0;
const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };

// ── 1. scenario table structure ─────────────────────────────────────────────
// scenarios.mjs already self-validates at import time (throws if malformed) —
// reaching this line at all is itself a passing assertion. What follows adds
// checks that module CANNOT make about itself: coverage and cross-entry shape.

// ── 0. THE APPROVED POSTER LIST MUST MATCH THE RENDERER'S OWN PREDICATE ────
// 2026-09-09. #1196 was a Cindy creator-page PR. Buried in it was a product
// decision: "Lunch in My City" and "Worth the Drive" "should no longer be
// promoted". Both gained `posterHidden: true` in lib/rails.js, DaypartRail
// learned to honour the flag, and test-creator-pages gained assertions
// REQUIRING them to stay hidden. menuPosterIntegrity's approved list was not
// touched, so two guards asserted opposite things about the same two tiles.
//
// The synthetic monitor then failed on EVERY scheduled run from 2026-09-08
// 18:25Z — and because the scenario stopped at the first failure, it masked a
// real continuation bug sitting in the same scenario. A false failure does not
// merely waste attention; it conceals a true one.
//
// This is the parity check that makes that impossible. The approved list stays
// EXPLICIT (derived, it would happily expect 15 the day someone hides a tile
// by accident — the exact failure it exists to catch), and this asserts it
// equals DaypartRail's own visibility predicate over RAILS. Changing the
// product decision without changing the monitored contract now fails the
// build, in the same commit, instead of a day later in a monitor nobody reads.
{
  // Read the predicate out of the COMPONENT rather than restating it, so a
  // change to what "visible" means cannot leave this guard checking the old
  // rule while claiming parity with the new one.
  const railSrc = readFileSync(path.resolve("./app/components/DaypartRail.js"), "utf8");
  const PREDICATE_RX = /!r\.posterHidden\s*&&\s*!r\.artStale\s*&&\s*!r\.retiredInto/;
  ok(PREDICATE_RX.test(railSrc),
    "DaypartRail still filters the poster menu on !posterHidden && !artStale && !retiredInto — if this changed, the parity check below is comparing against a rule the app no longer uses");

  const visibleFromRails = RAILS
    .filter((r) => r && !r.posterHidden && !r.artStale && !r.retiredInto)
    .map((r) => r.id);

  const approved = [...EXPECTED_VISIBLE_POSTER_IDS].sort();
  const rendered = [...visibleFromRails].sort();
  const missingFromApproved = rendered.filter((id) => !approved.includes(id));
  const staleInApproved = approved.filter((id) => !rendered.includes(id));

  ok(missingFromApproved.length === 0 && staleInApproved.length === 0,
    `EXPECTED_VISIBLE_POSTER_IDS must equal DaypartRail's visible set over RAILS. ` +
    `Approved but no longer rendered: [${staleInApproved.join(", ") || "none"}] (a product decision landed without updating the monitored contract — this is the #1196 shape). ` +
    `Rendered but not approved: [${missingFromApproved.join(", ") || "none"}] (a tile reached the homepage with no monitored owner).`);

  // Self-tests: prove the comparison has teeth in BOTH directions, using
  // fabricated sets rather than the real ones.
  {
    const cmp = (a, b) => ({
      stale: a.filter((x) => !b.includes(x)),
      unowned: b.filter((x) => !a.includes(x)),
    });
    const dropped = cmp(["a", "b", "c"], ["a", "b"]);
    ok(dropped.stale.join(",") === "c" && dropped.unowned.length === 0,
      "self-test: a tile hidden in RAILS but still approved is reported as STALE (the #1196 direction)");
    const added = cmp(["a", "b"], ["a", "b", "d"]);
    ok(added.unowned.join(",") === "d" && added.stale.length === 0,
      "self-test: a tile rendered but not approved is reported as UNOWNED (a quietly-added tile)");
    ok(cmp(["a", "b"], ["b", "a"]).stale.length === 0 && cmp(["a", "b"], ["b", "a"]).unowned.length === 0,
      "self-test: ORDER is not a difference — the contract is a set, and the menu's order is DaypartRail's business");
  }

  // The four excluded records, named, so a future reader does not have to
  // re-derive why the record count and the tile count differ.
  const excluded = RAILS.filter((r) => r && (r.posterHidden || r.artStale || r.retiredInto)).map((r) => r.id).sort();
  ok(excluded.join(",") === "chef,drive,events,lunchcity",
    `exactly four RAILS records stay off the homepage menu — events (retiredInto Night Out), lunchcity and drive (posterHidden by #1196), and chef (posterHidden by the owner on 2026-09-10; the record and Ron's seven picks stay, only the tile comes off the track). Got: [${excluded.join(", ")}]. If this list changed, say so deliberately here and in menuPosterIntegrity's header.`);
}

ok(Array.isArray(SCENARIOS) && SCENARIOS.length > 0, "SCENARIOS is a non-empty array");
ok(Array.isArray(REQUIRED_FLOWS) && REQUIRED_FLOWS.length >= 11,
  `REQUIRED_FLOWS names at least 11 flows (the task's flow list) — got ${REQUIRED_FLOWS?.length}`);

const ids = SCENARIOS.map((s) => s.id);
ok(new Set(ids).size === ids.length, `every scenario id is unique — ${ids.length} scenarios, ${new Set(ids).size} distinct ids`);

const coveredFlows = new Set(SCENARIOS.map((s) => s.flow));
const uncoveredFlows = REQUIRED_FLOWS.filter((f) => !coveredFlows.has(f));
ok(uncoveredFlows.length === 0, `every REQUIRED_FLOWS entry is covered by >=1 scenario — uncovered: ${uncoveredFlows.join(", ") || "(none)"}`);

for (const s of SCENARIOS) {
  ok(typeof s.id === "string" && s.id.length > 0, `scenario has a non-empty string id (got ${JSON.stringify(s.id)})`);
  ok(typeof s.flow === "string" && REQUIRED_FLOWS.includes(s.flow), `${s.id}: flow "${s.flow}" is a member of REQUIRED_FLOWS`);
  ok(typeof s.name === "string" && s.name.length > 8, `${s.id}: name is a real sentence, not a placeholder`);
  ok(typeof s.description === "string" && s.description.length > 20, `${s.id}: description is a real sentence, not a placeholder`);
  ok(typeof s.run === "function", `${s.id}: run is a callable function`);
  ok(s.run.constructor.name === "AsyncFunction", `${s.id}: run is declared async (the runner awaits it)`);
}

// ── 1b. THE HOMEPAGE CARD CHECK IS A BUDGET, NOT A SLEEP ────────────────────
// 2026-09-06. The homepage scenario counted .wf-place-card after a flat sleep.
// The poster grid paints at ~0.9s and the card rails at 0.84-1.4s warm / ~2.7s
// on a cold rail cache cell, and the visibility wait ahead of the sleep is
// satisfied by the tile — so the count landed at tile + 1.2s, which is
// 2.4-2.9s: exactly where a cold-cell load puts the cards. Measured on
// production in one minute: 30 cards at a 2411ms checkpoint, 0 at 2497ms (they
// appeared 256ms later), 30 at 2861ms. The 17:15Z scheduled run failed and an
// unchanged re-run passed.
//
// A monitor that fails half the time on a healthy page trains its reader to
// ignore it, so this pins the shape of the fix: the homepage waits for the
// card SURFACE against a stated budget and never on a clock.
{
  // Function.prototype.toString() keeps comments, and the scenario's own
  // comment names the sleep it replaced — so read the CODE, not the prose.
  // "//" inside a URL (https://) is not a comment and must survive.
  const stripComments = (s) => String(s)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

  const homepage = SCENARIOS.find((s) => s.id === "homepage");
  ok(!!homepage, "the homepage scenario still exists (this law has something to bind to)");
  const raw = String(homepage?.run || "");
  const code = stripComments(raw);
  ok(!/waitForTimeout/.test(code),
    "homepage scenario never gates its card count on a fixed sleep — it waits on the card locator (2026-09-06 coin-flip regression)");
  ok(/HOMEPAGE_CARD_BUDGET_MS/.test(code),
    "homepage scenario measures its card wait against HOMEPAGE_CARD_BUDGET_MS rather than an inline number");
  ok(Number.isInteger(HOMEPAGE_CARD_BUDGET_MS),
    `HOMEPAGE_CARD_BUDGET_MS is a whole number of milliseconds — got ${JSON.stringify(HOMEPAGE_CARD_BUDGET_MS)}`);
  // Above every healthy value measured (0.84-1.4s warm, ~2.7s on a cold rail
  // cache cell, 4-6s for the /api/rails rebuild behind it) and below the
  // client's own give-up point (DaypartRail budgets 10s, /api/rails carries
  // maxDuration 12) — so a failure means the page did not deliver, never that
  // the app was still legitimately waiting.
  ok(HOMEPAGE_CARD_BUDGET_MS >= 6000 && HOMEPAGE_CARD_BUDGET_MS <= 10000,
    `HOMEPAGE_CARD_BUDGET_MS sits between the measured cold-cell cost and the client's own 10s budget — got ${HOMEPAGE_CARD_BUDGET_MS}`);

  // Self-tests: prove the detector has teeth, and that stripping comments
  // cannot HIDE a real sleep — the failure mode that would make this law
  // pass vacuously forever.
  const sleepingFixture = async (pageLike) => { await pageLike.waitForTimeout(1200); };
  ok(/waitForTimeout/.test(stripComments(String(sleepingFixture))),
    "self-test: a function that really sleeps is still detected after comments are stripped");
  ok(!/waitForTimeout/.test(stripComments("// this comment merely mentions waitForTimeout\nconst x = 1;")),
    "self-test: a comment that merely NAMES the sleep is correctly ignored");
  ok(/wf-place-card/.test(stripComments("const u = 'https://example.com/x'; el.querySelector('.wf-place-card');")),
    "self-test: stripping comments leaves a URL's // intact and does not eat the code after it");
}

// ── 1c. MENU + POSTER INTEGRITY: positive, negative, mutation controls ───
// The scheduled browser scenario is the runtime proof. These small fabricated
// payloads prove the exact decision functions it relies on are not a pleasant
// report that always says green.
{
  const healthyMenu = posterMenuDiff(EXPECTED_VISIBLE_POSTER_IDS);
  ok(healthyMenu.missingIds.length === 0 && healthyMenu.extraIds.length === 0 && healthyMenu.duplicateIds.length === 0,
    "menu-poster positive control: all 18 expected poster ids are accepted exactly");

  // Mutation red: remove the historical Breakfast tile from an otherwise
  // healthy menu. If this predicate stopped checking the exact set, this would
  // turn green while the homepage lost its morning entry point.
  const breakfastRemoved = posterMenuDiff(EXPECTED_VISIBLE_POSTER_IDS.filter((id) => id !== "breakfast"));
  ok(breakfastRemoved.missingIds.includes("breakfast"),
    "menu-poster MUTATION RED: removing breakfast is detected as a missing visible poster id");
  const duplicateMenu = posterMenuDiff([...EXPECTED_VISIBLE_POSTER_IDS, "eat"]);
  ok(duplicateMenu.duplicateIds.includes("eat"),
    "menu-poster negative control: a duplicated poster id is detected");
  const extraMenu = posterMenuDiff([...EXPECTED_VISIBLE_POSTER_IDS, "unowned-poster"]);
  ok(extraMenu.extraIds.includes("unowned-poster"),
    "menu-poster negative control: an unapproved visible poster id is detected");

  const completePayload = {
    covered: true,
    data: {
      places: { breakfast: ["p1", "p2"] },
      placeIndex: { p1: { id: "p1", name: "One" }, p2: { id: "p2", name: "Two" } },
      railTotals: { breakfast: 2 },
      railHasMore: { breakfast: false },
    },
  };
  const complete = railWindowFromCapturedPayload(completePayload, "breakfast");
  ok(complete.complete && !complete.truncated && !complete.trulyEmpty,
    "menu-poster positive control: a fully returned non-empty rail is complete, not truncated");
  const rows = rowsForRailWindow(complete);
  ok(rows.rows.length === 2 && rows.missingRowIds.length === 0,
    "menu-poster positive control: every returned id rehydrates from the same captured placeIndex");

  const truncatedPayload = {
    ...completePayload,
    data: { ...completePayload.data, railTotals: { breakfast: 3 }, railHasMore: { breakfast: true } },
  };
  const truncated = railWindowFromCapturedPayload(truncatedPayload, "breakfast");
  ok(truncated.truncated && !truncated.complete,
    "menu-poster MUTATION RED: total=3 with only two returned ids is a hard truncated result, never a complete rail");
  const finalPagePayload = {
    ...completePayload,
    data: {
      places: { breakfast: ["p3"] },
      placeIndex: { p3: { id: "p3", name: "Three" } },
      railTotals: { breakfast: 3 },
      railHasMore: { breakfast: false },
      railPage: { railId: "breakfast", offset: 2, limit: 24 },
    },
  };
  const mergedPages = mergeCapturedRailWindows([truncatedPayload, finalPagePayload], "breakfast");
  ok(mergedPages.complete && mergedPages.ids.join(",") === "p1,p2,p3" && mergedPages.pageCount === 2,
    "menu-poster positive control: initial compact page plus captured continuation merges to a complete ordered rail (card 13 class)");
  const repeatedContinuation = mergeCapturedRailWindows([truncatedPayload, { ...finalPagePayload, data: { ...finalPagePayload.data, places: { breakfast: ["p2"] } } }], "breakfast");
  ok(!repeatedContinuation.complete && repeatedContinuation.duplicateIds.includes("p2"),
    "menu-poster MUTATION RED: a continuation that repeats an already returned id cannot look complete");
  const missingIndex = rowsForRailWindow({ ...complete, ids: ["p1", "gone"] });
  ok(missingIndex.missingRowIds.includes("gone"),
    "menu-poster negative control: an id absent from placeIndex is detected rather than silently discarded");

  const reconcileGood = reconcileRenderedCardNames(rows.rows, ["One", "Two"]);
  ok(reconcileGood.missingIds.length === 0 && reconcileGood.extraIds.length === 0 && reconcileGood.unknownNames.length === 0,
    "menu-poster positive control: rendered card names reconcile to the exact captured ids");
  const reconcileBad = reconcileRenderedCardNames(rows.rows, ["One", "Not in response"]);
  ok(reconcileBad.missingIds.includes("p2") && reconcileBad.unknownNames.includes("Not in response"),
    "menu-poster negative control: a missing expected card and an extra rendered card both fail reconciliation");
  const ambiguous = reconcileRenderedCardNames([{ id: "a", name: "Same" }, { id: "b", name: "Same" }], ["Same"]);
  ok(ambiguous.ambiguousNames.includes("Same") && ambiguous.unknownNames.includes("Same"),
    "menu-poster negative control: duplicate source names are unverifiable and fail loudly, never guessed into an id");
  const exactDomIds = reconcileRenderedCards([{ id: "a", name: "Same Chain" }, { id: "b", name: "Same Chain" }], [{ id: "a", name: "Same Chain" }, { id: "b", name: "Same Chain" }]);
  ok(exactDomIds.missingDomIds.length === 0 && exactDomIds.missingIds.length === 0 && exactDomIds.extraIds.length === 0,
    "menu-poster positive control: exact DOM data-place-id reconciles duplicate business names without a false failure");
  const wrongDomId = reconcileRenderedCards([{ id: "a", name: "One" }], [{ id: "wrong", name: "One" }]);
  ok(wrongDomId.missingIds.includes("a") && wrongDomId.extraIds.includes("wrong"),
    "menu-poster MUTATION RED: changing a rendered data-place-id is detected even when its title stays the same");
  ok(!continuationUiSettled({ hasMore: true, buttonPresent: true, buttonDisabled: true, loadingLabel: true, visibleFailure: false }),
    "menu-poster delayed-render control: a disabled Loading more button is not settled and cannot start another page click");
  ok(continuationUiSettled({ hasMore: true, buttonPresent: true, buttonDisabled: false, loadingLabel: false, visibleFailure: false }),
    "menu-poster delayed-render positive control: an enabled Show more button is a settled continuation state");
  ok(exactRenderedIdSet(["p1", "p2", "p13"], ["p1", "p2", "p13"]),
    "menu-poster delayed-render positive control: the final exact DOM set includes a thirteenth card");
  ok(!exactRenderedIdSet(["p1", "p2", "p13"], ["p1", "p2"]),
    "menu-poster MUTATION RED: a final DOM snapshot missing card 13 fails exact-set readiness");
}

// Negative control: prove the structural checks above can actually fail, not
// just always pass on well-formed input. Run the same predicates against a
// deliberately broken fixture scenario shape.
{
  const brokenSet = [{ id: "dup", flow: "homepage", name: "ok name here", description: "a description long enough to pass the length check easily", run: async () => {} },
                     { id: "dup", flow: "homepage", name: "ok name here", description: "a description long enough to pass the length check easily", run: async () => {} }];
  const brokenIds = brokenSet.map((s) => s.id);
  ok(new Set(brokenIds).size !== brokenIds.length, "self-test: the duplicate-id fixture is actually duplicated (proves the uniqueness check has teeth)");
  const brokenFlow = { id: "x", flow: "not-a-real-flow", name: "ok name here", description: "a description long enough to pass the length check easily", run: async () => {} };
  ok(!REQUIRED_FLOWS.includes(brokenFlow.flow), "self-test: an invented flow name is correctly rejected by REQUIRED_FLOWS.includes()");
  const brokenRun = { id: "y", flow: REQUIRED_FLOWS[0], name: "ok name here", description: "a description long enough to pass the length check easily", run: "not a function" };
  ok(typeof brokenRun.run !== "function", "self-test: a non-function run is correctly rejected by typeof");
}

// ── 2. redaction: positive control + self-test ──────────────────────────────
// A fake credential/PID-shaped string. Never a real one — this is a fixture.
const FAKE_SECRET = "wf_live_sk_9f3ac2e7b8d1409caab001secretvalue";
const FAKE_PID = "P00998877";

{
  const withSecretQuery = `https://partner.example.com/go?apiKey=${FAKE_SECRET}&pid=${FAKE_PID}&dest=https%3A%2F%2Fexample.com`;
  const redacted = redactUrl(withSecretQuery);
  ok(!redacted.includes(FAKE_SECRET), "positive control: redactUrl() removes a fake API-key-shaped query value");
  ok(!redacted.includes(FAKE_PID), "positive control: redactUrl() removes a fake PID query value");
  ok(redacted.includes("[REDACTED]") || redacted.includes("%5BREDACTED%5D"), "redactUrl() output carries the [REDACTED] marker in place of the removed values");
  ok(redacted.startsWith("https://partner.example.com/go"), "redactUrl() preserves the host and path — only query VALUES are removed, so evidence stays diagnosable");

  // Self-test: prove the detector can tell "still has the secret" from "does
  // not" — a redactor that always returns the same string either way would
  // pass the positive control vacuously if we never checked the negative.
  ok(withSecretQuery.includes(FAKE_SECRET), "self-test: the un-redacted fixture DOES contain the fake secret (proves the positive control means something)");
  ok(containsNoRawSecret(redacted, [FAKE_SECRET, FAKE_PID]), "containsNoRawSecret() confirms the redacted URL against both fake secrets");
  ok(!containsNoRawSecret(withSecretQuery, [FAKE_SECRET, FAKE_PID]), "self-test: containsNoRawSecret() correctly reports FALSE on the un-redacted fixture — the detector can fail");
}

{
  // consoleErrors are free text, not an isolated URL — Chromium logs a failed
  // fetch as prose WITH the full URL embedded in it. redactUrlsInText() (not
  // redactUrl()) is what evidence.mjs actually runs consoleErrors through.
  const consoleLine = `Failed to load resource: the server responded with a status of 500 () https://partner.example.com/collect?token=${FAKE_SECRET}&pid=${FAKE_PID}`;
  ok(consoleLine.includes(FAKE_SECRET), "self-test: the un-redacted console-message fixture DOES contain the fake secret");
  const redactedLine = redactUrlsInText(consoleLine);
  ok(!redactedLine.includes(FAKE_SECRET) && !redactedLine.includes(FAKE_PID), "redactUrlsInText() removes a fake secret/PID embedded inside a free-text console message");
  ok(redactedLine.startsWith("Failed to load resource"), "redactUrlsInText() leaves the surrounding prose intact — only the embedded URL's query values are touched");
  ok(redactedLine.includes("[REDACTED]") || redactedLine.includes("%5BREDACTED%5D"), "redactUrlsInText() leaves the [REDACTED] marker (URL-encoded within the query string) in place of the removed values");

  const redactedList = redactTextList([consoleLine, "a plain console message with no URL at all"]);
  ok(redactedList.length === 2, "redactTextList() preserves list length");
  ok(!redactedList[0].includes(FAKE_SECRET), "redactTextList() redacts the URL-bearing entry");
  ok(redactedList[1] === "a plain console message with no URL at all", "redactTextList() leaves a URL-free entry unchanged");
}

{
  // A relative redirect path, as commerce redirects use internally.
  const relative = redactUrl(`/api/viator/go?pid=${FAKE_PID}&url=https%3A%2F%2Fwww.viator.com%2Ftours%2F123`);
  ok(!relative.includes(FAKE_PID), "redactUrl() removes a fake PID from a relative /api/*/go path too");
  ok(relative.startsWith("/api/viator/go"), "redactUrl() preserves a relative path's origin-free shape");
}

{
  const failure = { url: `https://ad.example.com/collect?auid=${FAKE_SECRET}`, method: "POST", status: null, resourceType: "fetch", failure: "net::ERR_ABORTED" };
  const redactedOne = redactNetworkFailure(failure);
  ok(!JSON.stringify(redactedOne).includes(FAKE_SECRET), "redactNetworkFailure() removes a fake secret from a single network-failure entry");
  const redactedMany = redactNetworkFailures([failure, failure]);
  ok(redactedMany.length === 2 && redactedMany.every((e) => !JSON.stringify(e).includes(FAKE_SECRET)), "redactNetworkFailures() removes the fake secret across a list");
  ok(containsNoRawSecret(JSON.stringify(redactedMany), [FAKE_SECRET]), "containsNoRawSecret() confirms the redacted list against the fake secret");
  ok(!containsNoRawSecret(JSON.stringify(failure), [FAKE_SECRET]), "self-test: containsNoRawSecret() correctly reports FALSE on the un-redacted single failure");
}

{
  // describeRedirectDestination must never leak the raw location string's
  // query params into its return value — only booleans/shape, per the task's
  // "shapes/booleans only, never print any credential or PID value" rule.
  const rawLocation = `https://www.viator.com/tours/Orlando/x/d${FAKE_PID}?mcid=${FAKE_SECRET}`;
  const isPartner = (hostname) => hostname === "www.viator.com";
  const isOwn = () => false;
  const desc = describeRedirectDestination(rawLocation, isPartner, isOwn);
  ok(desc && typeof desc === "object", "describeRedirectDestination() returns an object");
  ok(desc.isAttributedPartner === true, "describeRedirectDestination() correctly identifies an attributed partner host");
  ok(desc.isOwnFallback === false, "describeRedirectDestination() correctly identifies a non-fallback host");
  ok(typeof desc.hasQueryParams === "boolean", "describeRedirectDestination() reports hasQueryParams as a boolean, not the query string itself");
  const descJson = JSON.stringify(desc);
  ok(!descJson.includes(FAKE_SECRET) && !descJson.includes(FAKE_PID),
    "describeRedirectDestination()'s return value never carries the raw secret/PID — shapes and booleans only");
}

// ── 3. evidence writer: red-prove against the real filesystem ──────────────
// Written to a real OS tmp dir (never inside the repo, never committed).
{
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "wf-synthetic-guard-"));
  try {
    const runDir = runEvidenceDir(tmpRoot, new Date("2026-01-01T00:00:00.000Z"));
    ok(runDir.startsWith(tmpRoot), "runEvidenceDir() nests the run directory under the given base directory");
    ok(stampFor(new Date("2026-01-01T00:00:00.000Z")) === "2026-01-01T00-00-00-000Z", "stampFor() produces a filesystem-safe ISO timestamp");

    const { dir, files } = writeScenarioFailureEvidence({
      runDir,
      scenarioId: "guard-fixture-scenario",
      scenarioName: "Guard fixture scenario",
      baseUrl: "https://www.gowayfind.com",
      url: `https://www.gowayfind.com/api/viator/go?apiKey=${FAKE_SECRET}&pid=${FAKE_PID}`,
      viewport: { width: 390, height: 844 },
      assertions: [
        { name: "fixture assertion that fails", pass: false, expected: "something", actual: "something else" },
        { name: "fixture assertion that passes", pass: true, expected: 1, actual: 1 },
      ],
      notes: [`menu probe https://partner.example.com/collect?token=${FAKE_SECRET}&pid=${FAKE_PID}`],
      // Realistic shape: Chromium's own console emits the full failing
      // request URL verbatim ("Failed to load resource: the server
      // responded with a status of 500 () https://...?token=..."), which is
      // exactly how a credential leaks through consoleErrors in practice.
      consoleErrors: [`Failed to load resource: the server responded with a status of 500 () https://partner.example.com/collect?token=${FAKE_SECRET}&pid=${FAKE_PID}`],
      networkFailures: [
        { url: `https://partner.example.com/x?token=${FAKE_SECRET}&pid=${FAKE_PID}`, method: "GET", status: 500, resourceType: "fetch", failure: "net::ERR_FAILED" },
      ],
      screenshot: Buffer.from([0x89, 0x50, 0x4e, 0x47]), // fake PNG magic bytes, not a real image
      reproCommand: "node scripts/run-synthetic-monitor.mjs --scenario=guard-fixture-scenario --base-url=https://www.gowayfind.com",
    });

    ok(dir.startsWith(runDir), "writeScenarioFailureEvidence() writes under the run directory it was given");
    ok(files.length >= 2, `writeScenarioFailureEvidence() reports the files it wrote — got ${files.length}`);

    const metaPath = path.join(dir, "meta.json");
    ok(files.includes(metaPath), "meta.json is among the reported written files");

    // THE red-prove: read the actual bytes back off disk, not the in-memory
    // object the function was called with — this is what would catch a
    // regression where the writer starts serializing the raw url/assertions
    // instead of the already-redacted values.
    const metaRaw = readFileSync(metaPath, "utf8");
    assert.doesNotThrow(() => JSON.parse(metaRaw), "meta.json is valid JSON");

    ok(!metaRaw.includes(FAKE_SECRET), "RED-PROVE: the raw fake secret is ABSENT from the evidence file actually written to disk");
    ok(!metaRaw.includes(FAKE_PID), "RED-PROVE: the raw fake PID is ABSENT from the evidence file actually written to disk");
    ok(metaRaw.includes("REDACTED"), "RED-PROVE: the [REDACTED] marker IS present in the evidence file actually written to disk");

    // Self-test: prove this specific check has teeth — the un-redacted fixture
    // payload (what would be written if redaction were skipped) DOES contain
    // the secret, so "absent" above is a meaningful signal, not vacuous truth.
    const wouldBeUnredacted = JSON.stringify({ url: `https://partner.example.com/x?token=${FAKE_SECRET}` });
    ok(wouldBeUnredacted.includes(FAKE_SECRET), "self-test: an un-redacted fixture payload DOES contain the fake secret (proves the RED-PROVE above is not vacuous)");

    const meta = JSON.parse(metaRaw);
    ok(meta.scenarioId === "guard-fixture-scenario", "meta.json round-trips the scenario id");
    ok(meta.failingCount === 1, "meta.json correctly counts only the failing assertion, not the passing one");
    ok(Array.isArray(meta.networkFailures) && meta.networkFailures.length === 1, "meta.json carries the (redacted) network failure");
    ok(!JSON.stringify(meta.networkFailures).includes(FAKE_SECRET), "meta.json's networkFailures array specifically is free of the raw secret");
    ok(Array.isArray(meta.consoleErrors) && meta.consoleErrors.length === 1, "meta.json carries the (redacted) console error");
    ok(!JSON.stringify(meta.consoleErrors).includes(FAKE_SECRET) && !JSON.stringify(meta.consoleErrors).includes(FAKE_PID),
      "meta.json's consoleErrors array specifically is free of the raw secret/PID — the fetch-failure-logged-to-console leak path");
    ok(Array.isArray(meta.notes) && meta.notes.length === 1, "meta.json persists scenario notes alongside assertions so failed card reconciliation is diagnosable");
    ok(!JSON.stringify(meta.notes).includes(FAKE_SECRET) && !JSON.stringify(meta.notes).includes(FAKE_PID),
      "meta.json redacts URLs embedded in persisted scenario notes too");

    const reproPath = path.join(dir, "repro.sh");
    ok(files.includes(reproPath), "repro.sh is among the reported written files");
    const reproRaw = readFileSync(reproPath, "utf8");
    ok(reproRaw.includes("run-synthetic-monitor.mjs --scenario=guard-fixture-scenario"), "repro.sh contains a runnable, scenario-specific repro command");
    ok(!reproRaw.includes(FAKE_SECRET), "repro.sh does not leak the fake secret either");

    const screenshotPath = path.join(dir, "screenshot.png");
    ok(files.includes(screenshotPath), "a screenshot is written and reported when evidence includes one");
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}

// ── 4. workflow installed at its real path, with a real schedule ───────────
const WORKFLOW_PATH = path.resolve("./.github/workflows/synthetic-monitor.yml");
let workflowSrc = "";
try {
  workflowSrc = readFileSync(WORKFLOW_PATH, "utf8");
  ok(true, ".github/workflows/synthetic-monitor.yml exists at the REAL workflow path (not parked elsewhere — see ops/canary.workflow.yml's history)");
} catch {
  ok(false, `.github/workflows/synthetic-monitor.yml must exist at ${WORKFLOW_PATH} — a workflow authored anywhere else never runs (this is exactly how ops/canary.workflow.yml's three guards silently never ran once)`);
}

if (workflowSrc) {
  ok(/^\s*schedule:\s*$/m.test(workflowSrc), "the workflow declares an `on.schedule:` trigger");
  ok(/-\s*cron:\s*["'][^"']+["']/.test(workflowSrc), "the workflow's schedule carries a real cron expression");
  ok(/run-synthetic-monitor\.mjs/.test(workflowSrc), "the workflow actually invokes scripts/run-synthetic-monitor.mjs");
  ok(/--all/.test(workflowSrc), "the workflow's scheduled path runs --all, not a single scenario");
  ok(/upload-artifact/.test(workflowSrc), "the workflow uploads failure evidence as a build artifact so a scheduled failure leaves reviewable evidence");
}

// The runner itself must not be swept into the (network-touching-forbidden)
// guard suite — it deliberately does not match check-guard-manifest.mjs's
// check|test-*.mjs pattern (it's run-*.mjs) and is not a check-*/test-*.mjs
// file. Confirm that assumption rather than trusting it silently.
ok(!/^(check|test)-/.test(path.basename(path.resolve("./scripts/run-synthetic-monitor.mjs"))),
  "scripts/run-synthetic-monitor.mjs's filename does NOT match check-guard-manifest.mjs's check|test-*.mjs sweep pattern — it stays out of the guard suite by construction, not by omission");

// guards.txt is one shell command (or a "#" comment) per line, per its own
// convention. A comment EXPLAINING that run-synthetic-monitor.mjs stays out
// of this file (as the entry just above does) is not the same as a command
// LINE invoking it — strip comment lines before checking, the same "raw grep
// hits its own explanatory comment" trap CLAUDE.md documents.
let guardsTxt = "";
try { guardsTxt = readFileSync(path.resolve("./scripts/guards.txt"), "utf8"); } catch {}
const guardCommandLines = guardsTxt.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
ok(!guardCommandLines.some((l) => /run-synthetic-monitor\.mjs/.test(l)),
  "scripts/guards.txt has no COMMAND line invoking the network-touching runner directly — it stays a smoke test, not a guard-suite member (comments mentioning its name are fine)");
ok(guardCommandLines.some((l) => /check-synthetic-monitor-hermetic\.mjs/.test(l)),
  "scripts/guards.txt has a COMMAND line wiring in THIS hermetic guard");

// ── verdict ──────────────────────────────────────────────────────────────
if (fails.length) {
  console.error("check-synthetic-monitor-hermetic: FAIL\n  - " + fails.join("\n  - "));
  process.exit(1);
}
console.log(`check-synthetic-monitor-hermetic: OK — ${pass} assertions; ${SCENARIOS.length} scenarios covering ${coveredFlows.size}/${REQUIRED_FLOWS.length} required flows, redaction red-proved against a real fake secret+PID, evidence writer red-proved by reading real files back off disk, workflow installation asserted at its real path`);
