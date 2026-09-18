#!/usr/bin/env node
// scripts/festivals/validate.mjs [file ...] — check verified batch files against
// festivalRows.mjs. With no args, checks every scripts/festivals/verified/*.json.
// Also proves every lead in the matching queue batch was either published or held.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { batchProblems, normName, leadKey } from "./festivalRows.mjs";

const dir = "scripts/festivals/verified";
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (existsSync(dir) ? readdirSync(dir).filter((f) => /^batch-\d{3}\.json$/.test(f)).map((f) => `${dir}/${f}`) : []);
const today = new Date().toISOString().slice(0, 10);
let bad = 0, pub = 0, hold = 0;
for (const f of files) {
  let file;
  try { file = JSON.parse(readFileSync(f, "utf8")); } catch (e) { console.log(`FAIL ${f}: not JSON (${e.message})`); bad++; continue; }
  // Past events are allowed in the file (they simply are not published later);
  // only a structurally broken row fails here.
  const probs = batchProblems(file).filter((m) => !m.endsWith("event already over"));
  const q = f.replace("/verified/", "/queue/");
  if (existsSync(q)) {
    const leads = JSON.parse(readFileSync(q, "utf8")).leads || [];
    const accounted = new Set([...file.publish, ...file.hold].map(leadKey));
    for (const l of leads) if (!accounted.has(normName(l.event_name))) probs.push(`lead not accounted for (publish or hold it): ${l.event_name}`);
  }
  if (probs.length) { bad++; console.log(`FAIL ${f}`); probs.forEach((m) => console.log(`  - ${m}`)); }
  else console.log(`OK   ${f} (${file.publish.length} publish, ${file.hold.length} hold)`);
  pub += file.publish?.length || 0; hold += file.hold?.length || 0;
}
console.log(`validate: ${files.length} file(s), ${pub} publish, ${hold} hold, ${bad} failing (today ${today})`);
process.exit(bad ? 1 : 0);
