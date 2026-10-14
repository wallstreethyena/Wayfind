#!/usr/bin/env node
// scripts/test-anchor-apply.mjs — proves scripts/anchor-events/apply.mjs refuses
// unsafe fixes BEFORE any request and that a dry run never PATCHes.
// CALL-LEVEL with a stubbed fetch. Cannot prove the live PATCH; that happens
// only under --apply against production.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sbEnv } from "../lib/serverCache.js";
import { applyFixes, validateEntry, ALLOWED_FIELDS } from "./anchor-events/apply.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };
const SB = { url: "https://sb.test", key: "k" };
const good = { event_id: "ev1", set: { lat: 27.3, lng: -82.5, venue: "New Venue" }, source_url: "https://organizer.example/page", note: "n" };

function stub({ row = { event_id: "ev1", lat: null, lng: null, venue: "Old" }, patchBody } = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    const method = init.method || "GET"; calls.push({ method, url: String(url), body: init.body, prefer: init.headers && init.headers.Prefer });
    if (method === "PATCH") return { ok: true, status: 200, json: async () => patchBody ? patchBody : [{ ...row, ...JSON.parse(init.body) }] };
    return { ok: true, status: 200, json: async () => [row] };
  };
  return { f, calls };
}
const run = async (entries, o = {}) => { const s = stub(o.stub); const r = await applyFixes(entries, { fetchImpl: s.f, sb: SB, apply: !!o.apply }); return { ...r, calls: s.calls }; };

// negatives: refused with zero requests
for (const [label, entry, re] of [
  ["no source_url", { ...good, source_url: undefined }, /source_url/],
  ["http (not https) source_url", { ...good, source_url: "http://organizer.example/" }, /source_url/],
  ["non-allowlisted field", { ...good, set: { slug: "x" } }, /not allowed: slug/],
  ["out-of-Florida coords", { ...good, set: { lat: 41.9, lng: -87.6 } }, /outside Florida/],
  ["lng without lat", { ...good, set: { lng: -82.5 } }, /together/],
  ["status outside vocabulary", { ...good, set: { event_status: "deleted" } }, /event_status/],
  ["empty set", { ...good, set: {} }, /set is empty/],
]) {
  const r = await run([entry], { apply: true });
  ok(r.failed === 1 && r.calls.length === 0 && r.results[0].refused && re.test(r.results[0].refused.join(";")), `NEGATIVE ${label}: refused with no request (calls=${r.calls.length})`);
}
// positives
ok(validateEntry(good).length === 0, "POSITIVE: a valid entry passes validation");
ok(validateEntry({ ...good, set: { event_status: "cancelled" } }).length === 0, "POSITIVE: existing status vocabulary accepted");
ok(ALLOWED_FIELDS.length === 17 && !ALLOWED_FIELDS.includes("slug") && !ALLOWED_FIELDS.includes("event_id"), "allowlist is the agreed 17 fields");

const dry = await run([good]);
ok(dry.failed === 0 && dry.calls.length === 1 && dry.calls[0].method === "GET" && !dry.calls.some((c) => c.method === "PATCH"), "dry run: one GET, no PATCH");
ok(dry.results[0].diff.some((d) => d.field === "venue" && d.before === "Old" && d.after === "New Venue"), "dry run reports before/after");

const app = await run([good], { apply: true });
const patch = app.calls.find((c) => c.method === "PATCH");
ok(app.failed === 0 && patch && patch.prefer === "return=representation" && patch.url.includes("event_id=eq.ev1") && app.results[0].applied, "apply: PATCH with return=representation, verified");
ok(app.calls.every((c) => ["GET", "PATCH"].includes(c.method)), "apply: only GET and PATCH are used");

// returned body not holding new value => failure
const lying = await run([good], { apply: true, stub: { patchBody: [{ event_id: "ev1", lat: 1, lng: 2, venue: "Old" }] } });
ok(lying.failed === 1 && /does not hold new value/.test(lying.results[0].error), "apply: a returned row that lacks the new values fails");
// missing row => failure
const none = await applyFixes([good], { fetchImpl: async () => ({ ok: true, status: 200, json: async () => [] }), sb: SB, apply: true });
ok(none.failed === 1, "apply: unknown event_id fails");

// the credential path apply.mjs uses: no env => null (CLI exits 2), env => url+key
{ const sv = { u: process.env.SUPABASE_URL, n: process.env.NEXT_PUBLIC_SUPABASE_URL, k: process.env.SUPABASE_SERVICE_ROLE_KEY };
  delete process.env.SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  ok(sbEnv() === null, "sbEnv() is null without credentials");
  process.env.SUPABASE_URL = "https://x.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  ok(sbEnv() && sbEnv().url === "https://x.supabase.co", "sbEnv() reads the service credentials");
  for (const [k, v] of [["SUPABASE_URL", sv.u], ["NEXT_PUBLIC_SUPABASE_URL", sv.n], ["SUPABASE_SERVICE_ROLE_KEY", sv.k]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }

const ex = JSON.parse(readFileSync(path.join(ROOT, "scripts/anchor-events/fixes/example.json"), "utf8"));
ok(Array.isArray(ex) && ex.length === 0, "example fixes file is an empty list");

if (fails.length) { console.error(`test-anchor-apply: ${pass} passed, ${fails.length} FAILED`); for (const f of fails) console.error("  x " + f); process.exit(1); }
console.log(`test-anchor-apply: OK - ${pass} assertions (refusals make no request; dry run never PATCHes)`);
