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

import { SCENARIOS, REQUIRED_FLOWS } from "./lib/synthetic/scenarios.mjs";
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
