#!/usr/bin/env node
// Fixture lock for scripts/guard-affiliate-tags.mjs.
// A broken Viator URL (no pid) must fail. A stamped one must pass. A bare
// Tiqets URL must fail. An explicit official annotation must pass.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRules, scanText, scanFile, auditViatorText, judgeUrl } from "./lib/affiliateTagScan.mjs";

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

if (failures.length) {
  console.error("test-affiliate-tags: FAIL");
  for (const m of failures) console.error("  - " + m);
  process.exit(1);
}
console.log(`test-affiliate-tags: OK — ${n} assertions (broken Viator fails, stamped Viator passes, bare Tiqets fails, official annotation is explicit)`);
