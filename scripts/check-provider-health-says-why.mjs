#!/usr/bin/env node
// scripts/check-provider-health-says-why.mjs — a failing provider must say WHY.
//
// WHAT THIS EXISTS FOR (production, 2026-09-03). /api/events aggregates nine
// providers. Two of them — Google (SerpAPI) and Google (OpenWebNinja) — had been
// answering `configured: true, ok: false, received: 0` in Sarasota, and the
// health block recorded nothing else. That single bit cannot distinguish a bad
// key from a spent quota from a moved endpoint from a quiet night, so the only
// way to diagnose it was to guess — and OpenWebNinja sat broken long enough
// that the fall shelves were being hand-curated around a firehose nobody knew
// was off.
//
// The rule this locks: every failure path carries a status and/or a reason, and
// processEvents passes them through. A healthy entry keeps its exact old shape,
// so this adds diagnosis without changing the success contract.
//
// ASSERTED BY CALL on real result shapes, not by reading the source.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { processEvents } from "../lib/eventsPipeline.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const ctx = { lat: 27.336, lng: -82.53, radius: 30, city: "Sarasota, FL" };

// ── 1. the shapes, executed ───────────────────────────────────────────────
const { health } = processEvents([
  { provider: "Healthy", configured: true, ok: true, ms: 12, events: [] },
  { provider: "HttpFail", configured: true, ok: false, status: 401, reason: "http 401", events: [] },
  { provider: "Threw", configured: true, ok: false, error: "getaddrinfo ENOTFOUND api.example", events: [] },
  { provider: "Unconfigured", configured: false, events: [] },
], ctx);
const byName = Object.fromEntries(health.map((h) => [h.provider, h]));

ok(byName.HttpFail?.status === 401 && byName.HttpFail?.reason === "http 401",
  "an HTTP failure carries its status code AND a reason into the health block");
ok(String(byName.Threw.reason || "").startsWith("getaddrinfo"),
  "a thrown provider carries its error message as the reason");
ok(byName.Threw?.status === undefined,
  "…and does not invent a status it never had");
ok(byName.Healthy?.ok === true && byName.Healthy?.reason === undefined && byName.Healthy?.status === undefined,
  "a HEALTHY provider's entry is unchanged — no reason, no status, same shape as before");
ok(Object.keys(byName.Healthy || {}).join(",") === "provider,configured,ok,timedOut,ms,received",
  "…exactly the original six keys, so nothing downstream sees a new field on success");
ok(byName.Unconfigured?.configured === false, "an unconfigured provider stays unconfigured (parked, not failing)");

// A reason is truncated, never unbounded: this is logged on every request.
const long = processEvents([{ provider: "Loud", configured: true, ok: false, reason: "x".repeat(5000), events: [] }], ctx);
ok(String(long.health[0].reason || "").length <= 200 && !!long.health[0].reason, "a runaway reason is truncated (this line is logged on every request)");

// ── 2. every provider failure path actually supplies one ──────────────────
// Comments stripped, strings kept: the file DOCUMENTS the old bare shape in
// prose, and blanking strings would hide the very literals under test.
const src = read("app/api/events/route.js")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ")
  .replace(/([^:"'`])\/\/.*$/gm, "$1 ");
ok(/async function fromTicketmaster/.test(src), "control: the stripper kept real code (the scan is not vacuous)");
const bare = src.match(/ok:\s*false,\s*events:\s*\[\]/g) || [];
ok(bare.length === 0, `no provider returns a bare ok:false with no status and no reason (found ${bare.length})`);
const withStatus = (src.match(/ok:\s*false,\s*status:\s*r\.status/g) || []).length;
const withReason = (src.match(/ok:\s*false,\s*reason:/g) || []).length;
ok(withStatus >= 6, `every !r.ok path reports the HTTP status (${withStatus})`);
ok(withReason >= 9, `every catch reports the thrown message (${withReason})`);
ok(!/catch\s*\{\s*return\s*\{\s*configured:\s*true,\s*ok:\s*false/.test(src),
  "no catch swallows its error without naming it");

console.log(fail ? `check-provider-health-says-why: FAIL — ${fail} failed, ${pass} passed` : `check-provider-health-says-why: OK — ${pass} assertions; a failing provider names its status and reason, a healthy one is untouched`);
process.exit(fail ? 1 : 0);
