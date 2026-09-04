// scripts/lib/synthetic/evidence.mjs — what gets left behind when a scenario
// fails, so a developer can reproduce it without re-running the whole suite
// and without the owner ever seeing "something failed" with nothing under it.
//
// Every path here is pure filesystem + string handling — no network, no
// process.env read for a verdict — so scripts/check-synthetic-monitor-hermetic.mjs
// can drive it against fixtures and prove the redaction actually lands in the
// files that get written, not just in the module that claims to do it.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { redactUrl, redactNetworkFailures, redactTextList, containsNoRawSecret } from "./redact.mjs";

/** Filesystem-safe timestamp: 2026-09-04T18-05-33-123Z, no colons. */
export function stampFor(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

/** The root directory one run's evidence lives under. Does not create it. */
export function runEvidenceDir(baseDir, date = new Date()) {
  return path.join(baseDir, stampFor(date));
}

/**
 * Write one scenario's failure evidence to <runDir>/<scenario.id>/.
 * @param {object} args
 * @param {string} args.runDir - directory for this whole run (created if absent)
 * @param {string} args.scenarioId
 * @param {string} args.scenarioName
 * @param {string} args.baseUrl
 * @param {string} args.url - the exact URL the scenario was checking (redacted before writing)
 * @param {{width:number,height:number}|null} args.viewport
 * @param {Array<{name:string, pass:boolean, expected?:any, actual?:any}>} args.assertions
 * @param {string[]} args.consoleErrors
 * @param {Array<object>} args.networkFailures - raw (unredacted) rows; redacted here
 * @param {Buffer|null} args.screenshot
 * @param {string} args.reproCommand
 * @returns {{dir:string, files:string[]}}
 */
export function writeScenarioFailureEvidence(args) {
  const {
    runDir, scenarioId, scenarioName, baseUrl, url, viewport,
    assertions, consoleErrors, networkFailures, screenshot, reproCommand,
  } = args;
  if (!runDir) throw new Error("writeScenarioFailureEvidence: runDir is required");
  if (!scenarioId) throw new Error("writeScenarioFailureEvidence: scenarioId is required");

  const dir = path.join(runDir, scenarioId);
  mkdirSync(dir, { recursive: true });

  const failing = (assertions || []).filter((a) => !a.pass);
  const redactedNetworkFailures = redactNetworkFailures(networkFailures || []);
  const meta = {
    scenarioId,
    scenarioName,
    baseUrl,
    url: url ? redactUrl(url) : null,
    viewport: viewport || null,
    timestamp: new Date().toISOString(),
    assertions: (assertions || []).map((a) => ({
      name: a.name,
      pass: !!a.pass,
      expected: a.expected === undefined ? undefined : a.expected,
      actual: a.actual === undefined ? undefined : a.actual,
    })),
    failingCount: failing.length,
    // consoleErrors are free text straight from Chromium's console — a fetch
    // failure logs its own full request URL, credentials and all. Scrub any
    // URL embedded in the text before it ever reaches disk (see
    // redactUrlsInText's header comment in redact.mjs).
    consoleErrors: redactTextList((consoleErrors || []).slice(0, 50)),
    networkFailures: redactedNetworkFailures.slice(0, 50),
    reproCommand,
  };

  const files = [];
  const metaPath = path.join(dir, "meta.json");
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf8");
  files.push(metaPath);

  if (screenshot && screenshot.length) {
    const shotPath = path.join(dir, "screenshot.png");
    writeFileSync(shotPath, screenshot);
    files.push(shotPath);
  }

  const reproPath = path.join(dir, "repro.sh");
  writeFileSync(
    reproPath,
    `#!/bin/sh\n# Reproduce this failure. Generated ${meta.timestamp}.\nset -e\n${reproCommand}\n`,
    "utf8"
  );
  files.push(reproPath);

  return { dir, files };
}

/** Does `dir` (or anything under it, recursively as JSON text) exist and is readable back? Test helper. */
export function evidenceDirExists(dir) {
  return existsSync(dir);
}

/**
 * Self-check used by the guard: given a piece of evidence text (e.g. the
 * meta.json this module just wrote) and the RAW secret values that went in,
 * assert none of them survived. Exported so the guard exercises the exact
 * function real evidence-writing relies on, not a re-implementation of it.
 */
export function evidenceIsFreeOfSecrets(text, secrets) {
  return containsNoRawSecret(text, secrets);
}
