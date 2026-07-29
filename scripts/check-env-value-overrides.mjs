#!/usr/bin/env node
/**
 * check-env-value-overrides — an env var that SELECTS BEHAVIOUR must be audited.
 *
 * lib/envAudit.js classifies env vars on PRESENCE: the key is there, or the
 * feature is off. `ATLAS_MODEL` is a different shape and fell straight through
 * the gap. It was read as
 *
 *     process.env.ATLAS_MODEL || "claude-haiku-4-5"
 *
 * and appeared in no list anywhere. Absent is its correct state, so it could not
 * go in OPTIONAL without printing "integration OFF" for the healthy case — and
 * so it went nowhere. Set it to a retired or mistyped model and atlas-build
 * hands that string to Anthropic, takes a 404, and stores the row as
 * PENDING SOURCE, which in the data is indistinguishable from a place that could
 * not be sourced. A typo in an env var could masquerade as a content problem.
 *
 * That is the same silent-failure shape that let the cron write 525 rows and
 * publish zero for five days (#440), so it gets a guard rather than a fix.
 *
 * THE RULE: any `process.env.X || "<default>"` in a metered/cron route is a
 * value override and must be declared in VALUE_OVERRIDES, which is what makes it
 * loud when it is wrong.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { VALUE_OVERRIDES, resolveOverride, auditEnv } from "../lib/envAudit.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// ── the classifier behaves ────────────────────────────────────────────────
{
  const spec = VALUE_OVERRIDES.find((o) => o.key === "ATLAS_MODEL");
  // Report a missing declaration; do not dereference it and die. A guard that
  // crashes still exits non-zero, but it tells whoever broke it nothing.
  ok(!!spec, "ATLAS_MODEL is declared as a value override");
  if (spec) {
    ok(spec.fallback === "claude-haiku-4-5", `the declared fallback matches the route's default (got ${spec.fallback})`);
    ok(Array.isArray(spec.known) && spec.known.length >= 5, "a known-model list exists");
    ok(spec.known.includes("claude-haiku-4-5") && spec.known.includes("claude-sonnet-5"),
      "the known list covers the default and the documented upgrade (ATLAS_MODEL=claude-sonnet-5)");
  }
  // Every override must say what breaks, not just that something might.
  for (const o of VALUE_OVERRIDES) {
    ok(typeof o.consequence === "string" && o.consequence.length > 20,
      `${o.key} states its CONSEQUENCE — a warning that does not say what breaks gets ignored`);
    ok(typeof o.fallback === "string" && o.fallback.length > 0, `${o.key} declares the fallback it is overriding`);
    ok(o.shape instanceof RegExp, `${o.key} declares a shape to validate against`);
    ok(o.shape.test(o.fallback), `${o.key}'s own fallback passes its shape — a validator that rejects the default is wrong`);
  }
  ok(VALUE_OVERRIDES.length >= 3,
    `the sweep's findings are declared, not just ATLAS_MODEL (got ${VALUE_OVERRIDES.length})`);
}

// All four statuses, including the healthy quiet one. A classifier that only
// ever returns "bad" proves nothing about the case it is supposed to allow.
const saved = process.env.ATLAS_MODEL;
try {
  delete process.env.ATLAS_MODEL;
  ok(resolveOverride("ATLAS_MODEL").status === "default", "unset -> default (the healthy case stays quiet)");
  ok(resolveOverride("ATLAS_MODEL").value === "claude-haiku-4-5", "unset -> the fallback value is returned, not empty");

  process.env.ATLAS_MODEL = "claude-sonnet-5";
  ok(resolveOverride("ATLAS_MODEL").status === "known", "a recognised model -> known");
  ok(resolveOverride("ATLAS_MODEL").value === "claude-sonnet-5", "a recognised model is passed through, not overridden by the fallback");

  process.env.ATLAS_MODEL = "claude-haiku-9-9";
  ok(resolveOverride("ATLAS_MODEL").status === "unknown",
    "model-shaped but unrecognised -> unknown (could be a new model; warn, never block)");

  process.env.ATLAS_MODEL = "gpt-4o";
  ok(resolveOverride("ATLAS_MODEL").status === "malformed", "a non-Claude id -> malformed");
  process.env.ATLAS_MODEL = "claud-haiku-4-5 ";   // the realistic typo
  ok(resolveOverride("ATLAS_MODEL").status === "malformed", "a typo'd id -> malformed, not silently accepted");

  // ...and the audit surfaces it rather than swallowing it.
  process.env.ATLAS_MODEL = "gpt-4o";
  ok(auditEnv().badOverrides.length === 1, "auditEnv reports a bad override");
  delete process.env.ATLAS_MODEL;
  ok(auditEnv().badOverrides.length === 0, "auditEnv reports NO bad override when unset — both sides proven");
} finally {
  if (saved === undefined) delete process.env.ATLAS_MODEL; else process.env.ATLAS_MODEL = saved;
}

// ── it is LOUD, and loud on the right channel ─────────────────────────────
// A warning nobody sees is the defect, not the fix.
{
  const src = readFileSync(path.resolve("lib/envAudit.js"), "utf8");
  ok(/console\.error\(`\[env\] \$\{o\.key\}/.test(src), "a malformed override logs at console.ERROR");
  ok(/console\.warn\(`\[env\] \$\{o\.key\}/.test(src), "an unrecognised override logs at console.WARN");
  const routeRaw = readFileSync(path.resolve("app/api/cron/atlas-build/route.js"), "utf8");
  ok(/console\.error\(`\[atlas\] ATLAS_MODEL=/.test(routeRaw),
    "the route ALSO complains at the point of use — the boot-time audit fires on whichever request happened to warm the process, not necessarily this one");
  // Strip comments FIRST. The header deliberately quotes the old
  // `process.env.ATLAS_MODEL || "..."` form to explain what was wrong with it,
  // and a raw-text check fails on that prose rather than on any code. Same trap
  // check-editorial-publish.mjs documents, hit again here on first run.
  const route = routeRaw.replace(/\/\*[\s\S]*?\*\//g, " ").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  ok(route.length > routeRaw.length * 0.25, "stripping comments left the route's code intact");
  ok(!/process\.env\.ATLAS_MODEL \|\|/.test(route),
    "the route no longer reads ATLAS_MODEL with a bare `|| default` — that form is what escaped the audit");
}

// ── the general rule: no unaudited `process.env.X || "literal"` in a cron ──
// Scoped to metered/cron routes, where a silent wrong value costs money and
// writes rows. Presence-only reads (`process.env.X || ""`) are not overrides —
// an empty-string default IS the audit's presence question.
{
  const declared = new Set(VALUE_OVERRIDES.map((o) => o.key));
  const skip = new Set(["NODE_ENV", "VERCEL_ENV", "VERCEL_URL", "npm_package_version"]);
  const offenders = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith(".js")) continue;
      const src = readFileSync(p, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
      for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)\s*\|\|\s*"([^"]+)"/g)) {
        const [, key, dflt] = m;
        if (!dflt.trim() || skip.has(key) || declared.has(key)) continue;
        offenders.push(`${p}: process.env.${key} || "${dflt}"`);
      }
    }
  };
  walk(path.resolve("app/api/cron"));
  ok(offenders.length === 0,
    `every non-empty env DEFAULT in a cron route is a declared value override. Undeclared:\n      ` + offenders.join("\n      "));
  // The scanner must actually be looking at something.
  let files = 0;
  const count = (dir) => { if (!existsSync(dir)) return; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) count(p); else if (e.name.endsWith(".js")) files++; } };
  count(path.resolve("app/api/cron"));
  ok(files >= 8, `the scanner walked the cron routes (${files} files) — an empty walk would pass for the wrong reason`);
}

if (fail.length) {
  console.error("check-env-value-overrides: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`check-env-value-overrides: OK — ${pass} assertions (ATLAS_MODEL classified, all four statuses, loud at boot AND at use, no undeclared env default in a cron route)`);
