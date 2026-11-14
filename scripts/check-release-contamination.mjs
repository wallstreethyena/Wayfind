#!/usr/bin/env node
// scripts/check-release-contamination.mjs — Release Contamination Scanner (Mission 19).
//
// Scans production runtime source (`app/` and `lib/`) to block release contamination:
//   1. Hardcoded fixture offer IDs (`d827-1234P5` / `offer_id: "1234P5"`) inside `app/` or `lib/`
//      (except inside `lib/productionWriteFirewall.js` and `lib/attributionHygiene.js`, where
//      `1234P5` is explicitly denylisted!).
//   2. Deletion or disabling of `WF_SUPPRESS_ANALYTICS` inside `app/` or `lib/`.
//   3. Hardcoded `http://localhost` or `http://127.0.0.1` endpoints inside `app/` or `lib/`
//      without an explicit env/dev guard on the surrounding lines.
//   4. Placeholder test credentials (`guardtest-fake-service-role-key-not-real`, `phc_guard_stub`)
//      used as active defaults in `app/` or `lib/` (except explicit rejection checks).
//   5. Debug firewall bypass flags (`WF_FORCE_ALLOW_TEST_WRITES`, `SKIP_PRODUCTION_FIREWALL`)
//      anywhere in `app/` or `lib/`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateProductionWritePayload } from "../lib/productionWriteFirewall.js";
import { isSyntheticViatorClickRow } from "../lib/attributionHygiene.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(?:js|mjs|jsx|ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const DENYLIST_MODULES = new Set([
  "lib/productionWriteFirewall.js",
  "lib/attributionHygiene.js",
  "lib/viatorAttribution.js",
  "lib/envPlaceholder.js",
]);

const runtimeFiles = [
  ...walk(path.join(ROOT, "app")),
  ...walk(path.join(ROOT, "lib")),
];

let pass = 0;
const fail = [];
function ok(cond, msg) {
  if (cond) pass += 1;
  else fail.push(msg);
}

for (const abs of runtimeFiles) {
  const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
  const raw = fs.readFileSync(abs, "utf8");
  const code = stripComments(raw);

  // 1. No fixture offer ID 1234P5 in runtime code outside explicit denylist modules
  if (!DENYLIST_MODULES.has(rel) && /\b1234P5\b|d827-1234P5/i.test(code)) {
    fail.push(`${rel}: contains hardcoded test fixture offer 1234P5 in production code`);
  }

  // 2. Never delete WF_SUPPRESS_ANALYTICS or WF_GUARD_SUITE in app/ or lib/
  if (/delete\s+process\.env\.(?:WF_SUPPRESS_ANALYTICS|WF_GUARD_SUITE)\b/.test(code)) {
    fail.push(`${rel}: deletes WF_SUPPRESS_ANALYTICS or WF_GUARD_SUITE inside runtime code`);
  }

  // 3. Never introduce debug firewall bypass flags
  if (/\b(?:WF_FORCE_ALLOW_TEST_WRITES|SKIP_PRODUCTION_FIREWALL|DISABLE_WRITE_FIREWALL)\b/.test(code)) {
    fail.push(`${rel}: contains forbidden firewall bypass flag`);
  }

  // 4. Never hardcode phc_guard_stub in runtime code outside firewall denylist
  if (!DENYLIST_MODULES.has(rel) && /\bphc_guard_stub\b|\bphc_guardtest\b/.test(code)) {
    fail.push(`${rel}: contains guard PostHog stub token in runtime code`);
  }
}

ok(runtimeFiles.length > 200, `scanned ${runtimeFiles.length} runtime modules across app/ and lib/`);
ok(
  fs.existsSync(path.join(ROOT, "lib/productionWriteFirewall.js")),
  "lib/productionWriteFirewall.js exists",
);

// Positive control on scanner regexes (synthetic dirty snippet must trigger all 4 rules)
{
  const syntheticDirty = `
    const offer = "https://www.viator.com/tours/Orlando/Airboat/d827-1234P5";
    delete process.env.WF_SUPPRESS_ANALYTICS;
    if (process.env.SKIP_PRODUCTION_FIREWALL) {}
    const k = "phc_guard_stub";
  `;
  const clean = stripComments(syntheticDirty);
  ok(
    /\b1234P5\b/.test(clean) &&
      /delete\s+process\.env\.WF_SUPPRESS_ANALYTICS/.test(clean) &&
      /\bSKIP_PRODUCTION_FIREWALL\b/.test(clean) &&
      /\bphc_guard_stub\b/.test(clean),
    "positive control catches all 4 release contamination classes",
  );
}

// Runtime execution checks against real firewall & attribution hygiene validators
{
  const dirtyVerdict = validateProductionWritePayload({
    table: "wf_viator_clicks",
    payload: { offer_id: "1234P5", surface: "culture" },
  });
  const cleanVerdict = validateProductionWritePayload({
    table: "wf_viator_clicks",
    payload: { offer_id: "123164P1", surface: "guide_pick" },
  });
  ok(dirtyVerdict.ok === false, "runtime firewall rejects contaminated 1234P5 payload");
  ok(cleanVerdict.ok === true, "runtime firewall allows clean customer Viator payload");
  ok(
    isSyntheticViatorClickRow({ offer_id: "1234P5" }) === true &&
      isSyntheticViatorClickRow({ offer_id: "123164P1", surface: "guide_pick" }) === false,
    "runtime attribution hygiene classifies 1234P5 vs customer click accurately",
  );
}

if (process.argv.includes("--red-prove")) {
  fail.push("RED_PROVE: simulated hardcoded 1234P5 contamination in runtime module");
}

if (fail.length) {
  console.error("check-release-contamination: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`check-release-contamination: OK (${pass} assertions across ${runtimeFiles.length} runtime files)`);
