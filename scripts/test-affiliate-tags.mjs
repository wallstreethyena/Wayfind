#!/usr/bin/env node
// Fixture lock for scripts/guard-affiliate-tags.mjs.
// A broken Viator URL (no pid) must fail. A stamped one must pass. A bare
// Tiqets URL must fail. An explicit official annotation must pass.
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, symlinkSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRules, scanText, scanFile, auditViatorText, judgeUrl, contentFiles } from "./lib/affiliateTagScan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIX = path.join(ROOT, "scripts/fixtures/affiliate-tags");
const rules = loadRules(ROOT);
let n = 0;
const failures = [];
const ok = (c, m) => { n++; if (!c) failures.push(m); };

function scanned(name) {
  return scanFile(path.join(FIX, name), rules, ROOT);
}

const broken = scanned("viator-broken.js");
ok(broken.violations.length === 1, "broken Viator fixture (no pid) must fail, got " + broken.violations.length);
ok(broken.violations[0] && broken.violations[0].partner === "viator", "broken Viator fixture is attributed to viator");
ok(broken.violations[0] && /pid=P00320881/.test(broken.violations[0].detail), "broken Viator detail names the pinned pid");

const good = scanned("viator-ok.js");
ok(good.violations.length === 0, "stamped Viator fixture must pass, violations: " + JSON.stringify(good.violations));
ok(good.inputs.length === 0 && good.domainFlags.length === 0, "stamped Viator fixture is a clean outbound URL");

const tiqets = scanned("tiqets-broken.js");
ok(tiqets.violations.length === 1 && tiqets.violations[0].partner === "tp-tiqets",
  "bare Tiqets fixture must fail as tp-tiqets, got " + JSON.stringify(tiqets.violations));

const official = scanned("official-ok.js");
ok(official.violations.length === 0, "official annotation must not fail");
ok(official.official.length === 1, "official annotation must be recorded, not silently dropped");

const input = scanned("viator-input-ok.js");
ok(input.violations.length === 0 && input.inputs.length === 1 && input.inputs[0].via === "viator-input",
  "viatorUrl product identity is an input, not a bare hop");

const wrongPid = scanText(
  'export const href = "https://www.viator.com/tours/x/d1-1?pid=P00000000&mcid=42383&medium=link";\n',
  "inline-wrong-pid.js",
  rules,
);
ok(wrongPid.violations.length === 1, "a foreign Viator pid must fail");

const apiMedium = scanText(
  'export const href = "https://www.viator.com/tours/x/d1-1?pid=P00320881&mcid=42383&medium=api";\n',
  "inline-api.js",
  rules,
);
ok(apiMedium.violations.length === 0, "medium=api is the preserved Partner API value and must pass");

const commented = scanText(
  '// https://www.viator.com/tours/x/d1-1\nexport const note = "no link";\n',
  "inline-comment.js",
  rules,
);
ok(commented.violations.length === 0, "a URL that exists only in a comment is not an outbound link");

const silent = scanText(
  'export const href = "https://www.viator.com/help"; // viator official page\n',
  "inline-silent.js",
  rules,
);
ok(silent.violations.length === 1, "calling a link official in prose, without wf-affiliate-allow: official, must still fail");

const apiHost = scanText(
  'const res = await fetch("https://api.viator.com/partner/search/freetext", { method: "POST" });\n',
  "inline-api-host.js",
  rules,
);
ok(apiHost.violations.length === 0, "api.viator.com is the Partner API, not a click URL");
ok(judgeUrl("https://api.viator.com/partner/search/freetext", rules) === null, "judgeUrl ignores the api.viator.com host");

const splitOk = auditViatorText(
  'const href = (exact && p.viatorUrl)\n  ? (viatorProductGoUrl(p.viatorUrl, region, "guide", "guide") || t.tk)\n  : t.tk;\n',
  "inline-split-ok.js",
);
ok(splitOk.length === 0, "a viatorUrl href whose builder call is the next line of the same statement must pass");

const splitBad = auditViatorText(
  "const href = (exact && p.viatorUrl)\n  ? p.viatorUrl\n  : t.tk;\n",
  "inline-split-bad.js",
);
ok(splitBad.length >= 1 && splitBad[0].partner === "viator", "a split href that never calls the builder must fail");

function runGuard(extra) {
  return spawnSync(process.execPath, [path.join(ROOT, "scripts/guard-affiliate-tags.mjs"), ...extra], {
    cwd: ROOT,
    encoding: "utf8",
  });
}
const cliFail = runGuard(["--scan", path.join(FIX, "viator-broken.js"), "--no-builders"]);
ok(cliFail.status === 1, "CLI must exit 1 on the broken Viator fixture, status " + cliFail.status + "\n" + cliFail.stdout + cliFail.stderr);
const cliPass = runGuard(["--scan", path.join(FIX, "viator-ok.js"), "--no-builders"]);
ok(cliPass.status === 0, "CLI must exit 0 on the stamped Viator fixture\n" + cliPass.stdout + cliPass.stderr);
const cliTiqets = runGuard(["--scan", path.join(FIX, "tiqets-broken.js"), "--no-builders"]);
ok(cliTiqets.status === 1, "CLI must exit 1 on the bare Tiqets fixture, status " + cliTiqets.status);

ok(rules.pid === "P00320881", "rules pid is the pinned Wayfind pid");
ok(readFileSync(path.join(FIX, "viator-ok.js"), "utf8").includes("pid=" + rules.pid),
  "the passing fixture carries the same pid the rules require");

// Only exact research fields for the Ticketmaster family are source/adapter
// inputs. Same-looking data elsewhere and other fields remain outbounds.
const tm = "https://www.livenation.com/event/verified-event";
const researchFile = "data/christmas-2026-research.json";
const sourceField = scanText(`  "official_url": "${tm}",`, researchFile, rules);
ok(sourceField.official.length === 1 && sourceField.violations.length === 0, "exact research official_url is recorded as source evidence");
const ticketField = scanText(`  "ticket_url": "${tm}",`, researchFile, rules);
ok(ticketField.inputs.length === 1 && ticketField.inputs[0].via === "christmas-ticket-input", "exact research ticket_url is a runtime-probed adapter input");
ok(scanText(`  "ticket_url": "${tm}",`, "data/other-research.json", rules).violations.length === 1, "other files cannot inherit the research adapter context");
ok(scanText(`  "booking_url": "${tm}",`, researchFile, rules).violations.length === 1, "other fields retain bare-link violations");
ok(scanText('  "ticket_url": "https://www.viator.com/tours/x/d1-1",', researchFile, rules).violations.length === 1, "other merchants cannot inherit the Ticketmaster adapter context");
const mixedFields = scanText(`"official_url": "${tm}", "booking_url": "${tm}", "ticket_url": "${tm}"`, researchFile, rules);
ok(mixedFields.official.length === 1 && mixedFields.inputs.length === 1 && mixedFields.violations.length === 1, "same-line repeated URL keeps each field's separate obligation");

// The same checkout must cover the same data whether its parent path happens
// to contain "event" or not. Both aliases point at this exact source tree.
const pathProbe = mkdtempSync(path.join(os.tmpdir(), "wf-affiliate-paths-"));
try {
  const roots = [path.join(pathProbe, "plain-checkout"), path.join(pathProbe, "event-checkout")];
  const censuses = roots.map((root) => {
    symlinkSync(ROOT, root, "dir");
    return contentFiles(root).map((file) => path.relative(root, file)).sort();
  });
  ok(JSON.stringify(censuses[0]) === JSON.stringify(censuses[1]), "checkout names cannot change the scanned content census");
  ok(censuses.every((files) => files.includes("data/christmas-2026-research.json")), "both pathnames scan the Christmas ticket inputs");
  ok(censuses.every((files) => files.includes("data/fall-discovery/official-sources.json")), "both pathnames retain all supported source-data coverage");
} finally { rmSync(pathProbe, { recursive: true, force: true }); }

if (failures.length) {
  console.error("test-affiliate-tags: FAIL");
  for (const m of failures) console.error("  - " + m);
  process.exit(1);
}
console.log(`test-affiliate-tags: OK — ${n} assertions (broken Viator fails, stamped Viator passes, bare Tiqets fails, official annotation is explicit)`);
