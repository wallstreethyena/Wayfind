#!/usr/bin/env node
/**
 * scripts/check-credential-discipline.mjs — a placeholder must never be spent
 * as if it were a credential.
 *
 * THE INCIDENT (live-verified 2026-07-31, documented in lib/envPlaceholder.js).
 * Six NEXT_PUBLIC_* vars are flagged "Sensitive" in Vercel, and `vercel env
 * pull` cannot read a sensitive value back — it writes the literal string
 * "[SENSITIVE]". Sourcing that file set NEXT_PUBLIC_VIATOR_PID="[SENSITIVE]"
 * and lib/affiliates.js stamped it onto every Viator URL:
 *
 *     https://www.viator.com/tours/x?pid=%5BSENSITIVE%5D&mcid=42383&medium=link
 *
 * A working, unattributed link that converts and pays nothing — while every
 * presence check reported green, because "[SENSITIVE]" is eleven characters
 * long. Unset fails CLOSED (no CTA). Junk fails OPEN. Open is worse.
 *
 * lib/envPlaceholder.js was written to end that, and credential() was applied
 * to lib/affiliates.js. It was NOT applied to the other six reads of the same
 * two variables, so the money paths in app/api/viator/go (searchFallback
 * stamps the PID straight into the URL) and lib/viatorServer (withViatorTracking
 * on a resolved product) could still emit pid=%5BSENSITIVE%5D. Found
 * 2026-08-22 while repairing a local .env.local that had exactly that value in
 * 24 of its vars.
 *
 * This guard makes the fix structural: every read of a money-path credential
 * must pass through credential(), so a placeholder degrades to unset on EVERY
 * path, not just the one someone remembered.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { credential, isPlaceholderCredential } from "../lib/envPlaceholder.js";
import { isValidConversionLabel } from "../lib/analytics.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (c, m) => { if (!c) { console.error("  FAIL: " + m); fails++; } };

// The vars that decide whether a click earns money. A junk value on any of
// these produces a link that works and pays nothing.
const MONEY_VARS = [
  "NEXT_PUBLIC_VIATOR_PID", "NEXT_PUBLIC_GYG_PID", "NEXT_PUBLIC_CJ_PID",
  "VIATOR_API_KEY", "CJ_API_TOKEN",
];
// lib/envPlaceholder.js IS the classifier; lib/envAudit.js only NAMES keys.
const EXEMPT = new Set(["lib/envPlaceholder.js", "lib/envAudit.js"]);

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}

const files = [...walk(join(ROOT, "lib")), ...walk(join(ROOT, "app"))];
ok(files.length > 50, `walked only ${files.length} files — the walker is broken, so this guard is inert`);

// A read is `process.env.X` or `process.env["X"]`. It is DISCIPLINED when
// credential() opens the expression it sits in.
let checked = 0;
for (const file of files) {
  const rel = relative(ROOT, file);
  if (EXEMPT.has(rel)) continue;
  const src = readFileSync(file, "utf8");
  const rx = new RegExp(String.raw`(credential\(\s*)?process\.env(?:\.(\w+)|\["(\w+)"\])`, "g");
  for (const m of src.matchAll(rx)) {
    const name = m[2] || m[3];
    if (!MONEY_VARS.includes(name)) continue;
    checked++;
    const line = src.slice(0, m.index).split("\n").length;
    ok(!!m[1],
      `${rel}:${line} — ${name} is read raw. A "[SENSITIVE]" value would be spent as a real credential and the link would convert unattributed. Wrap it: credential(process.env["${name}"]).`);
  }
}
ok(checked > 0, "found no money-path env read at all — the scanner is broken, so this guard is inert");

// ── behaviour, not just shape ───────────────────────────────────────────────
ok(credential("[SENSITIVE]") === "", 'credential("[SENSITIVE]") must be empty');
ok(credential("  [SENSITIVE]  ") === "", "…including with whitespace");
ok(credential("P00308545") === "P00308545", "self-test: a REAL pid must survive — rejecting one takes revenue to zero silently");
ok(isPlaceholderCredential("[SENSITIVE]") === true, "the classifier must know Vercel's placeholder");
ok(isValidConversionLabel("[SENSITIVE]") === false, "an Ads conversion label must reject the placeholder too");
ok(isValidConversionLabel("AbC-D_efGh12345678") === true, "self-test: a real conversion label must still validate");

// Prove the scanner can fail.
{
  const bad = 'const getPid = () => ((process.env["NEXT_PUBLIC_VIATOR_PID"] || "").trim());';
  const good = 'const getPid = () => credential(process.env["NEXT_PUBLIC_VIATOR_PID"]);';
  const rx = () => new RegExp(String.raw`(credential\(\s*)?process\.env(?:\.(\w+)|\["(\w+)"\])`, "g");
  ok(![...bad.matchAll(rx())][0][1], "self-test: a raw read must be detected");
  ok(!![...good.matchAll(rx())][0][1], "self-test: a credential()-wrapped read must pass");
}

if (fails) { console.error(`check-credential-discipline: ${fails} failure(s)`); process.exit(1); }
console.log(`check-credential-discipline: OK — ${checked} money-path credential read(s) across ${files.length} files, all fail closed on a placeholder`);
