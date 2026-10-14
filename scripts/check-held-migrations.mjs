#!/usr/bin/env node
// scripts/check-held-migrations.mjs — A HELD MIGRATION IS A DECISION, NOT A DRAFT.
//
// supabase/held-migrations/ is outside supabase/migrations/, so neither the
// receipt guard nor the production canary looks at it (that is the point: held
// SQL is deliberately not expected in production). That also means nothing
// noticed if a held file was edited, silently replaced, or quietly copied back
// into supabase/migrations/. The README pins each held file by sha256 and byte
// count; this guard enforces it, repo-only (runs in prebuild):
//   - every held *.sql has a README entry whose sha256 AND bytes match the file;
//   - every README entry names a file that exists;
//   - a held file name never also exists in supabase/migrations/ (un-hold =
//     move + pending entry or receipt, never copy).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function parseReadme(text) {
  const entries = new Map();
  const re = /^- (\d{8,14}_[A-Za-z0-9_]+\.sql)\s*\n\s+sha256 ([a-f0-9]{64}) \((\d+) bytes\)/gm;
  let m;
  while ((m = re.exec(text))) entries.set(m[1], { sha256: m[2], bytes: Number(m[3]) });
  return entries;
}

// held: Map(name -> Buffer); migrations: Set(names)
export function evaluate({ readme, held, migrations }) {
  const errors = [];
  const entries = parseReadme(readme);
  for (const [name, buf] of held) {
    const e = entries.get(name);
    if (!e) { errors.push(`held file ${name} has no sha256 entry in supabase/held-migrations/README.md`); continue; }
    const sha = crypto.createHash("sha256").update(buf).digest("hex");
    if (sha !== e.sha256) errors.push(`held file ${name} changed: sha256 ${sha.slice(0, 12)}… but README pins ${e.sha256.slice(0, 12)}… — a held file is a reviewed decision; re-review and update the README`);
    else if (buf.length !== e.bytes) errors.push(`held file ${name}: README says ${e.bytes} bytes, file is ${buf.length}`);
  }
  for (const name of entries.keys()) if (!held.has(name)) errors.push(`README pins ${name} but the file is not in supabase/held-migrations/`);
  for (const name of held.keys()) if (migrations.has(name)) errors.push(`${name} is held AND present in supabase/migrations/ — un-hold by moving it, never copy`);
  return errors;
}

// Controls: the rule must be able to fail and to pass.
{
  const good = Buffer.from("select 1;\n");
  const h = crypto.createHash("sha256").update(good).digest("hex");
  const readme = `- 20260101_a.sql\n  sha256 ${h} (${good.length} bytes).\n`;
  const held = new Map([["20260101_a.sql", good]]);
  const cases = [
    ["exact match passes", { readme, held, migrations: new Set() }, false],
    ["edited file fails", { readme, held: new Map([["20260101_a.sql", Buffer.from("select 2;\n")]]), migrations: new Set() }, true],
    ["unpinned held file fails", { readme: "", held, migrations: new Set() }, true],
    ["README entry without a file fails", { readme, held: new Map(), migrations: new Set() }, true],
    ["also present in supabase/migrations fails", { readme, held, migrations: new Set(["20260101_a.sql"]) }, true],
  ];
  let bad = 0;
  for (const [name, input, wantFail] of cases) {
    if ((evaluate(input).length > 0) !== wantFail) { bad++; console.error(`check-held-migrations: SELF-TEST FAIL — ${name}`); }
  }
  if (bad) { console.error("check-held-migrations: FAIL — self-tests failed; verdict cannot be trusted"); process.exit(1); }
}

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HELD = path.join(ROOT, "supabase", "held-migrations");
const MIG = path.join(ROOT, "supabase", "migrations");
const held = new Map(readdirSync(HELD).filter((f) => f.endsWith(".sql")).map((f) => [f, readFileSync(path.join(HELD, f))]));
const migrations = new Set(readdirSync(MIG).filter((f) => f.endsWith(".sql")));
const readme = readFileSync(path.join(HELD, "README.md"), "utf8");
if (!existsSync(path.join(HELD, "README.md")) || held.size === 0) { console.error("check-held-migrations: FAIL — no held files found; positive control lost"); process.exit(1); }
const errors = evaluate({ readme, held, migrations });
for (const e of errors) console.error(`check-held-migrations: FAIL — ${e}`);
if (errors.length) process.exit(1);
console.log(`check-held-migrations: OK — ${held.size} held migration(s) match their README sha256 and byte count and none also sit in supabase/migrations; 5 self-tests passed.`);
