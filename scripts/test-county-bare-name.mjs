#!/usr/bin/env node
// scripts/test-county-bare-name.mjs - counties are stored bare ("Pasco", not
// "Pasco County"). The canary (check-inventory-integrity) failed on two rows
// written by a writer outside this repo; the repo cannot police that writer, so
// the rule is (1) a pure helper (lib/placeIdentity.js normalizeCountyName), (2) a
// table trigger that applies the same rule on every write, (3) this guard.
//
// EXECUTES the helper and the canary predicate; the trigger SQL is checked
// structurally (no Postgres in prebuild) and its regex literal is compared to
// the helper's source. Say so: the trigger itself is not executed here.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCountyName, COUNTY_SUFFIX_RX, placeIdentityIssues } from "../lib/placeIdentity.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fails = []; let n = 0;
const ok = (c, m) => { n++; if (!c) fails.push(m); };

const cases = [["Pasco County", "Pasco"], ["Hillsborough County", "Hillsborough"], ["Pinellas", "Pinellas"], ["pasco county ", "pasco"], ["Miami-Dade County", "Miami-Dade"], ["", null], [null, null], [undefined, undefined]];
for (const [i, o] of cases) ok(normalizeCountyName(i) === o, `normalizeCountyName(${JSON.stringify(i)}) expected ${JSON.stringify(o)}, got ${JSON.stringify(normalizeCountyName(i))}`);
// Idempotent, and its output is never flagged by the production canary predicate.
for (const [i] of cases) {
  const once = normalizeCountyName(i);
  ok(normalizeCountyName(once) === once, `not idempotent for ${JSON.stringify(i)}`);
  ok(placeIdentityIssues([{ place_id: "x", county: once }], null).countyHasSuffix.length === 0, `canary flags normalized ${JSON.stringify(once)}`);
}
ok(placeIdentityIssues([{ place_id: "x", county: "Pasco County" }], null).countyHasSuffix.length === 1, "POSITIVE CONTROL: canary predicate flags 'Pasco County'");

// Trigger migration: present, structural, same regex as the helper.
const dir = path.join(ROOT, "supabase/migrations");
const file = readdirSync(dir).find((f) => /_wf_inventory_county_bare_name_trigger\.sql$/.test(f));
ok(!!file, "trigger migration wf_inventory_county_bare_name_trigger is missing");
if (file) {
  const sql = readFileSync(path.join(dir, file), "utf8").replace(/--[^\n]*/g, "");
  ok(/create trigger wf_inventory_county_bare_name\s+before insert or update of county on public\.wf_inventory\s+for each row execute function public\.wf_county_bare_name\(\)/i.test(sql), "trigger must be BEFORE INSERT OR UPDATE OF county ON public.wf_inventory FOR EACH ROW");
  const m = sql.match(/regexp_replace\(new\.county,\s*'([^']+)',\s*'',\s*'i'\)/);
  ok(!!m && m[1] === COUNTY_SUFFIX_RX.source.replace(/\\\//g, "/"), `trigger regex ${m && m[1]} must equal helper regex ${COUNTY_SUFFIX_RX.source}`);
  ok(!/\braise\b/i.test(sql), "the trigger must normalise, never raise (a raise would break unrelated writers)");
}
// The data fix must key on place_id + exact county, not on a display name Google can rename.
const fix = readFileSync(path.join(dir, "20261029223000_holmes_beach_one_card_and_county_suffix.sql"), "utf8").replace(/--[^\n]*/g, "");
for (const county of ["Pasco County", "Hillsborough County"]) {
  const blk = fix.split("update public.wf_inventory").find((b) => b.includes(`county = '${county}'`));
  ok(!!blk, `data fix has no update for '${county}'`);
  if (blk) ok(!/\bname\s*=/.test(blk.split("get diagnostics")[0]), `the '${county}' update must not be keyed on name (Google renamed Scream-A-Geddon)`);
}
if (fails.length) { console.error(`test-county-bare-name: FAIL (${fails.length}/${n})\n  ` + fails.join("\n  ")); process.exit(1); }
console.log(`test-county-bare-name: OK - ${n} assertions (helper executed; trigger SQL structural + regex parity; data fix not name-keyed)`);
