#!/usr/bin/env node
// A scheduled discovery run must produce a current, complete report. A local
// run without credentials deliberately records SKIPPED; CI must not call that
// a successful discovery pass merely because a JSON file was written.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { siteTodayStr } from "../../lib/siteTime.js";

import { validateDiscoveryReport } from "../../lib/fallDiscoveryReport.js";

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const today = siteTodayStr();
  const report = JSON.parse(readFileSync(path.resolve("docs/audits/fall-discovery", `${today}.json`), "utf8"));
  console.log(`fall-discovery report verified: ${validateDiscoveryReport(report, today)} candidates for ${today}`);
}
