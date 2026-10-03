#!/usr/bin/env node
// scripts/local-calendars/validate.mjs — check verified batch files.
//   node scripts/local-calendars/validate.mjs [scripts/local-calendars/verified/batch-NNN.json ...]
// With no arguments, checks every verified batch. Each file must be a valid
// batch AND account for every series in its queue batch (published or held).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { batchProblems } from "./eventRows.mjs";
import { siteTodayStr } from "../../lib/siteTime.js";
import { accountProblems } from "./validate-lib.mjs";

const vdir = "scripts/local-calendars/verified";
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (existsSync(vdir) ? readdirSync(vdir).filter((f) => /^batch-\d{3}\.json$/.test(f)).map((f) => `${vdir}/${f}`) : []);

let bad = 0;
for (const f of files) {
  const file = JSON.parse(readFileSync(f, "utf8"));
  const probs = batchProblems(file, { today: siteTodayStr() });
  const q = f.replace("/verified/", "/queue/");
  if (existsSync(q)) probs.push(...accountProblems(file, JSON.parse(readFileSync(q, "utf8"))));
  if (probs.length) { bad++; console.log(`FAIL ${f}\n  ${probs.join("\n  ")}`); }
  else console.log(`OK   ${f} (${file.publish.length} publish, ${file.hold.length} hold)`);
}
process.exit(bad ? 1 : 0);
