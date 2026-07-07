// v4.12 gate: VERSION file and footer BUILD_ID must agree, always.
// Exits nonzero on mismatch so prebuild (and packaging) fail loudly instead
// of shipping a build whose label and contents disagree.
import { readFileSync } from "node:fs";
const version = readFileSync("VERSION", "utf8").trim();
const page = readFileSync("app/page.js", "utf8");
const m = page.match(/const BUILD_ID = "v([\d.]+)"/);
if (!m) { console.error("check-version: BUILD_ID not found in app/page.js"); process.exit(1); }
if (m[1] !== version) {
  console.error(`check-version: MISMATCH — VERSION file says ${version}, footer BUILD_ID says ${m[1]}`);
  process.exit(1);
}
console.log(`check-version: OK — v${version} everywhere`);
