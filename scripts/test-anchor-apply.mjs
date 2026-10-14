#!/usr/bin/env node
// scripts/test-anchor-apply.mjs — proves scripts/anchor-events/apply.mjs, the
// reviewed fix path for wf_events, is safe BEFORE the owner lets it write:
//   - refuses unsafe / unevidenced / non-reversible entries with zero requests
//   - never overwrites a value someone else changed (conflict => whole entry
//     refused, no PATCH) and skips fields that already hold the new value
//   - makes the PATCH conditional on the expected values (PostgREST filters)
//     and fails when it matches no row (a race)
//   - writes an audit line per changed field and a rollback file that
//     validates, inverts, and restores the row when applied
//   - is idempotent: a second run of the same file writes nothing
// CALL-LEVEL with a stubbed fetch (scripts/lib/fakeRestTable.mjs honours the
// eq./is.null filters like PostgREST) plus child-process CLI runs with an
// explicit env and a preloaded fake fetch. It cannot prove the live service;
// that is what the dry run and the post-write re-read do against production.
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { applyFixes, validateEntry, ALLOWED_FIELDS, eqFilter, rollbackEntry } from "./anchor-events/apply.mjs";
import { makeFakeFetch } from "./lib/fakeRestTable.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };
const SB = { url: "https://sb.test", key: "k" };
const good = { event_id: "ev1", set: { lat: 27.3, lng: -82.5, venue: "New Venue" }, expect: { lat: null, lng: null, venue: "Old" }, source_url: "https://organizer.example/page", note: "n" };
const row0 = () => ({ event_id: "ev1", lat: null, lng: null, venue: "Old", event_status: "scheduled" });

async function run(entries, { apply = false, rows = [row0()], beforePatch = null, wrap = null } = {}) {
  const log = [];
  let f = makeFakeFetch({ rows, log, beforePatch });
  if (wrap) f = wrap(f);
  const changes = [];
  const r = await applyFixes(entries, { fetchImpl: f, sb: SB, apply, runId: "run-1", onChange: (c) => changes.push(c) });
  return { ...r, calls: log, rows, changes };
}
const patches = (r) => r.calls.filter((c) => c.method === "PATCH");

// ---- refusals: zero requests of any kind
for (const [label, entry, re] of [
  ["no source_url", { ...good, source_url: undefined }, /source_url/],
  ["http (not https) source_url", { ...good, source_url: "http://organizer.example/" }, /source_url/],
  ["non-allowlisted field", { ...good, set: { slug: "x" }, expect: { slug: "y" } }, /not allowed: slug/],
  ["out-of-Florida coords", { ...good, set: { lat: 41.9, lng: -87.6 }, expect: { lat: null, lng: null } }, /outside Florida/],
  ["lng without lat", { ...good, set: { lng: -82.5 }, expect: { lng: null } }, /together/],
  ["status outside vocabulary", { ...good, set: { event_status: "deleted" }, expect: { event_status: "scheduled" } }, /event_status/],
  ["empty set", { ...good, set: {}, expect: {} }, /set is empty/],
  ["missing expect", { ...good, expect: undefined }, /expect is required/],
  ["expect not covering every set field", { ...good, expect: { lat: null, lng: null } }, /expect missing for field: venue/],
  ["expect with a field not in set", { ...good, expect: { ...good.expect, address: "x" } }, /not in set: address/],
  ["expect equal to set (no-op)", { ...good, expect: { ...good.expect, venue: "New Venue" } }, /nothing to change/],
  ["previous status null cannot be rolled back", { ...good, set: { event_status: "cancelled" }, expect: { event_status: null } }, /cannot be rolled back/],
]) {
  const r = await run([entry], { apply: true });
  ok(r.failed === 1 && r.calls.length === 0 && r.results[0].status === "refused" && re.test(r.results[0].refused.join(";")), `NEGATIVE ${label}: refused with no request (calls=${r.calls.length})`);
}
ok(validateEntry(good).length === 0, "POSITIVE: a valid entry passes validation");
ok(validateEntry({ ...good, set: { event_status: "cancelled" }, expect: { event_status: "scheduled" } }).length === 0, "POSITIVE: existing status vocabulary accepted");
ok(validateEntry({ ...good, set: { hero_image_kind: "venue" }, expect: { hero_image_kind: null } }).length === 0, "POSITIVE: hero_image_kind venue accepted");
ok(validateEntry({ ...good, set: { hero_image_kind: "stock" }, expect: { hero_image_kind: null } }).some((w) => /hero_image_kind/.test(w)), "NEGATIVE: hero_image_kind outside event/venue refused");
ok(ALLOWED_FIELDS.length === 18 && ALLOWED_FIELDS.includes("hero_image_kind") && !ALLOWED_FIELDS.includes("slug") && !ALLOWED_FIELDS.includes("event_id"), "allowlist is the agreed 18 fields (hero_image_kind added for licensed venue photos)");

// ---- dry run: reads, plans, never writes
const dry = await run([good]);
ok(dry.failed === 0 && dry.calls.length === 1 && dry.calls[0].method === "GET", "dry run: one GET, no PATCH");
ok(dry.results[0].status === "apply" && dry.results[0].plan.every((d) => d.status === "apply"), "dry run: plan marks every field 'apply'");
ok(dry.results[0].plan.some((d) => d.field === "venue" && d.before === "Old" && d.after === "New Venue"), "dry run reports before/after");
ok(dry.rows[0].venue === "Old", "dry run leaves the row untouched");

// ---- apply: conditional PATCH, exact-one-row, verified
const app = await run([good], { apply: true });
const p1 = patches(app)[0];
ok(app.failed === 0 && app.results[0].status === "applied" && patches(app).length === 1, "apply: one PATCH, entry applied");
ok(p1 && p1.url.includes("event_id=eq.ev1") && p1.url.includes("venue=eq.Old") && p1.url.includes("lat=is.null") && p1.url.includes("lng=is.null"), `apply: PATCH carries the expect filters (${p1 && p1.url})`);
ok(app.rows[0].venue === "New Venue" && app.rows[0].lat === 27.3, "apply: the row now holds the new values");
ok(app.calls.map((c) => c.method).join() === "GET,PATCH,GET", `apply: read, conditional write, independent re-read (${app.calls.map((c) => c.method)})`);
ok(app.changes.length === 3 && app.changes.every((c) => c.event_id === "ev1" && c.source_url === good.source_url), "apply: one change record per field");
ok(eqFilter("venue", "A&B=C d,(x)") === "venue=eq.A%26B%3DC%20d%2C(x)" && eqFilter("lat", null) === "lat=is.null", "filter values are URL-encoded; null becomes is.null");
{ const e = { ...good, set: { venue: "N" }, expect: { venue: "A&B=C d" } };
  const r = await run([e], { apply: true, rows: [{ ...row0(), venue: "A&B=C d" }] });
  ok(patches(r)[0] && patches(r)[0].url.includes("venue=eq.A%26B%3DC%20d") && r.results[0].status === "applied", "apply: a value with & = and space round-trips through the encoded filter"); }

// ---- conflict: someone else's correction is never overwritten
for (const [label, rows] of [
  ["a field holds a third value", [{ ...row0(), venue: "Someone Elses Fix" }]],
  ["one field conflicts while others would apply", [{ ...row0(), venue: "Someone Elses Fix", lat: null }]],
]) {
  const r = await run([good], { apply: true, rows });
  ok(r.failed === 1 && r.results[0].status === "conflict" && patches(r).length === 0, `CONFLICT (${label}): whole entry refused, no PATCH`);
  ok((r.results[0].plan || []).some((d) => d.field === "venue" && d.status === "conflict") && r.rows[0].venue === "Someone Elses Fix" && r.rows[0].lat === null, `CONFLICT (${label}): reported and the row is untouched`);
}
{ const r = await run([good], { apply: true, rows: [{ ...row0(), lat: 28.0, lng: -82.0 }] });
  ok(r.results[0].status === "conflict" && patches(r).length === 0, "CONFLICT: a different non-null coordinate is a conflict"); }
{ const r = await run([good], { apply: true, rows: [{ ...row0(), lat: 27.3, lng: null, venue: "Old" }] });
  ok(r.results[0].status === "conflict" && patches(r).length === 0, "CONFLICT: a half-applied lat/lng pair is never patched"); }

// ---- already-applied: skipped, never overwritten
{ const r = await run([good], { apply: true, rows: [{ ...row0(), lat: 27.3, lng: -82.5, venue: "New Venue" }] });
  ok(r.failed === 0 && r.results[0].status === "already-applied" && patches(r).length === 0 && r.changes.length === 0, "ALREADY-APPLIED: skipped, no PATCH, no audit change"); }
{ const r = await run([good], { apply: true, rows: [{ ...row0(), venue: "New Venue" }] });
  const p = patches(r)[0];
  ok(r.failed === 0 && p && JSON.parse(p.body).venue === undefined && !p.url.includes("venue=") && p.url.includes("lat=is.null"), "ALREADY-APPLIED (partial): only the remaining fields are written and filtered");
  ok(r.results[0].plan.find((d) => d.field === "venue").status === "already-applied" && r.changes.length === 2, "ALREADY-APPLIED (partial): the skipped field is reported, not logged as a change"); }

// ---- races and lying services
{ const r = await run([good], { apply: true, beforePatch: (load) => { load()[0].venue = "Raced In"; } });
  ok(r.failed === 1 && /matched 0 rows/.test(r.results[0].error || "") && r.rows[0].venue === "Raced In" && r.rows[0].lat === null && r.changes.length === 0,
    `RACE: a row changed between read and write matches no row; nothing is written (${r.results[0].error})`); }
{ const r = await run([good], { apply: true, wrap: (f) => async (u, i = {}) => (i.method === "PATCH" ? { ok: true, status: 200, json: async () => [] } : f(u, i)) });
  ok(r.failed === 1 && /matched 0 rows/.test(r.results[0].error), "a PATCH returning 0 rows fails"); }
{ const r = await run([good], { apply: true, wrap: (f) => async (u, i = {}) => (i.method === "PATCH" ? { ok: true, status: 200, json: async () => [{}, {}] } : f(u, i)) });
  ok(r.failed === 1 && /matched 2 rows/.test(r.results[0].error), "a PATCH returning 2 rows fails"); }
{ const r = await run([good], { apply: true, wrap: (f) => async (u, i = {}) => (i.method === "PATCH" ? { ok: true, status: 200, json: async () => [{ event_id: "ev1", lat: 1, lng: 2, venue: "Old" }] } : f(u, i)) });
  ok(r.failed === 1 && /does not hold new value/.test(r.results[0].error), "a returned row that lacks the new values fails"); }
{ const r = await run([good], { apply: true, wrap: (f) => { let gets = 0; return async (u, i = {}) => { const x = await f(u, i); if ((i.method || "GET") !== "GET" || ++gets < 2) return x; return { ok: true, status: 200, json: async () => [{ event_id: "ev1", lat: null, lng: null, venue: "Old" }] }; }; } });
  ok(r.failed === 1 && r.results[0].applied === true && /post-write read/.test(r.results[0].error), "a post-write re-read that does not hold the values fails, and the change is still recorded for audit/rollback"); }
{ const r = await run([good], { apply: true, rows: [] });
  ok(r.failed === 1 && /exactly 1 row/.test(r.results[0].error) && patches(r).length === 0, "unknown event_id fails, no PATCH"); }
{ const r = await run([good], { apply: true, rows: [row0(), row0()] });
  ok(r.failed === 1 && /exactly 1 row/.test(r.results[0].error) && patches(r).length === 0, "two rows for one event_id fails, no PATCH"); }

// ---- rollback entries are real fixes that validate and invert
{ const r = await run([good], { apply: true });
  const rb = rollbackEntry(good, Object.fromEntries(r.changes.map((c) => [c.field, c])), "run-1");
  ok(validateEntry(rb).length === 0 && rb.set.venue === "Old" && rb.set.lat === null && rb.expect.venue === "New Venue" && rb.expect.lat === 27.3 && rb.note === "rollback of run-1" && rb.source_url === good.source_url, "rollbackEntry: validates, set=before, expect=after, same source_url, note names the run"); }

// ---- CLI in child processes: explicit env, preloaded fake fetch, state in a temp dir
const tmp = mkdtempSync(path.join(tmpdir(), "anchor-apply-"));
const state = path.join(tmp, "state.json"), reqlog = path.join(tmp, "req.log");
const fixes = path.join(tmp, "fixes.json"), audit = path.join(tmp, "audit.jsonl"), rollback = path.join(tmp, "rollback.json");
writeFileSync(state, JSON.stringify([row0()]));
writeFileSync(fixes, JSON.stringify([good]));
const preload = "data:text/javascript," + encodeURIComponent(`import { installFake } from ${JSON.stringify(pathToFileURL(path.join(ROOT, "scripts/lib/fakeRestTable.mjs")).href)}; installFake(${JSON.stringify(state)}, ${JSON.stringify(reqlog)});`);
const cli = (args, extra = {}) => spawnSync(process.execPath, ["--import", preload, path.join(ROOT, "scripts/anchor-events/apply.mjs"), ...args],
  { env: { PATH: "/usr/bin:/bin", SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", GITHUB_RUN_ID: "run-42", ...extra }, encoding: "utf8" });
const reqs = () => (existsSync(reqlog) ? readFileSync(reqlog, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const stateRow = () => JSON.parse(readFileSync(state, "utf8"))[0];

{ const r = cli([fixes]);
  ok(r.status === 0 && /dry run, nothing written/.test(r.stdout) && !reqs().some((q) => q.method === "PATCH") && stateRow().venue === "Old", "CLI default is a dry run: exit 0, no PATCH, row untouched");
  ok(/venue: apply: "Old" -> "New Venue"/.test(r.stdout), "CLI dry run prints the plan per field"); }
ok(cli(["--apply", fixes]).status === 2 && stateRow().venue === "Old", "CLI: --apply without --audit/--rollback is refused (exit 2), nothing written");
ok(cli(["--apply", "--audit", audit, "--rollback", rollback]).status === 2, "CLI: --apply with no fixes file named is refused (exit 2)");
ok(cli(["--dry", "--apply", fixes]).status === 2, "CLI: --dry and --apply together is refused");

const first = cli(["--apply", "--audit", audit, "--rollback", rollback, fixes]);
ok(first.status === 0 && stateRow().venue === "New Venue" && stateRow().lat === 27.3, `CLI --apply writes the row (exit ${first.status}) ${first.stderr}`);
const auditLines = existsSync(audit) ? readFileSync(audit, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
ok(auditLines.length === 3 && auditLines.every((l) => l.event_id === "ev1" && l.source_url === good.source_url && l.note === "n" && l.run_id === "run-42" && !Number.isNaN(Date.parse(l.ts))), "audit: one line per changed field with event_id, source_url, note, ts, run id (GITHUB_RUN_ID)");
const av = auditLines.find((l) => l.field === "venue");
ok(av && av.before === "Old" && av.after === "New Venue" && auditLines.find((l) => l.field === "lat").before === null && auditLines.find((l) => l.field === "lat").after === 27.3, "audit: before/after values are right");
const rbk = existsSync(rollback) ? JSON.parse(readFileSync(rollback, "utf8")) : [];
ok(rbk.length === 1 && rbk.every((e) => validateEntry(e).length === 0), "rollback file validates under the same rules");
ok(rbk[0] && rbk[0].set.venue === "Old" && rbk[0].set.lat === null && rbk[0].expect.venue === "New Venue" && rbk[0].expect.lat === 27.3 && rbk[0].note === "rollback of run-42" && rbk[0].source_url === good.source_url, "rollback file inverts: set=before, expect=after, same source_url, note 'rollback of <run>'");

// idempotent: the same file again writes nothing
{ const before = reqs().length;
  const again = cli(["--apply", "--audit", audit, "--rollback", rollback, fixes]);
  const newReqs = reqs().slice(before);
  ok(again.status === 0 && /already-applied/.test(again.stdout) && !newReqs.some((q) => q.method === "PATCH") && stateRow().venue === "New Venue", "second run of the same file: already-applied, no PATCH, exit 0");
  ok(readFileSync(audit, "utf8") === "" && readFileSync(rollback, "utf8").trim() === "[]", "second run: nothing to audit, empty rollback"); }

// the rollback file really restores the row, and itself is idempotent
{ const rbCopy = path.join(tmp, "rb-saved.json");
  writeFileSync(rbCopy, JSON.stringify(rbk));
  const undo = cli(["--apply", "--audit", path.join(tmp, "a2.jsonl"), "--rollback", path.join(tmp, "r2.json"), rbCopy]);
  ok(undo.status === 0 && stateRow().venue === "Old" && stateRow().lat === null && stateRow().lng === null, `applying the rollback file restores the original row (exit ${undo.status}) ${undo.stdout.slice(-200)}`); }

// CLI conflict: another session's correction -> exit 1, nothing written
{ writeFileSync(state, JSON.stringify([{ ...row0(), venue: "Other Session Fix" }]));
  const before = reqs().length;
  const c = cli(["--apply", "--audit", audit, "--rollback", rollback, fixes]);
  ok(c.status === 1 && /CONFLICT ev1/.test(c.stdout) && !reqs().slice(before).some((q) => q.method === "PATCH") && stateRow().venue === "Other Session Fix", "CLI conflict: exit 1, reported, no PATCH, their value preserved"); }

// the credential path apply.mjs uses, in child processes with an explicit env
// (hermetic: never reads this shell's credentials).
{ const probe = (env) => spawnSync(process.execPath, ["--input-type=module", "-e",
    `import { sbEnv } from ${JSON.stringify(pathToFileURL(path.join(ROOT, "lib/serverCache.js")).href)}; const s = sbEnv(); process.stdout.write(JSON.stringify(s && s.url));`],
    { env: { PATH: "/usr/bin:/bin", ...env }, encoding: "utf8" });
  const none = probe({});
  ok(none.status === 0 && none.stdout === "null", "sbEnv() is null without credentials");
  const some = probe({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" });
  ok(some.status === 0 && some.stdout === JSON.stringify("https://x.supabase.co"), "sbEnv() reads the service credentials"); }

const ex = JSON.parse(readFileSync(path.join(ROOT, "scripts/anchor-events/fixes/example.json"), "utf8"));
ok(Array.isArray(ex) && ex.length === 0, "example fixes file is an empty list");

if (fails.length) { console.error(`test-anchor-apply: ${pass} passed, ${fails.length} FAILED`); for (const f of fails) console.error("  x " + f); process.exit(1); }
console.log(`test-anchor-apply: OK - ${pass} assertions (refusals and conflicts make no request; PATCH is conditional; audit + rollback written; second run writes nothing)`);
