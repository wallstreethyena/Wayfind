// scripts/db/test-atlas-ledger-pg.mjs — proves supabase/proposals/2026-10-atlas-ai-budget.sql in a REAL, throwaway
// local PostgreSQL (own initdb cluster in a temp dir, loopback only, trust auth, deleted on exit) with REAL concurrent
// connections (pool of 60 released together by an advisory-lock barrier). No Supabase, no provider, no network.
//
// NOT part of scripts/guards.txt / `npm run prebuild`: CI has no Postgres. Run by hand:
//     node scripts/db/test-atlas-ledger-pg.mjs
// Needs PostgreSQL server binaries (initdb, pg_ctl, postgres) on PATH or in a standard install dir, and the `pg` npm
// client (not a repo dependency): `npm i --no-save pg`, or set WF_PG_MODULE_DIR=<dir containing node_modules/pg>.
// Exit codes: 0 all PASS; 1 any FAIL / setup error (missing `pg` is an ERROR, never a skip);
//             0 + loud SKIPPED message ONLY when no postgres server binary exists at all.
// ATLAS_LEDGER_SQL=<file> tests another copy of the SQL (used for red-proving mutations).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SQL_FILE = process.env.ATLAS_LEDGER_SQL || path.join(HERE, "../../supabase/proposals/2026-10-atlas-ai-budget.sql");

// ── find postgres server binaries ───────────────────────────────────────────
function findBin() {
  const dirs = [];
  const add = (d) => { if (d && fs.existsSync(path.join(d, "initdb")) && fs.existsSync(path.join(d, "pg_ctl")) && fs.existsSync(path.join(d, "postgres"))) dirs.push(d); };
  for (const d of (process.env.PATH || "").split(path.delimiter)) add(d);
  const globs = [["/usr/lib/postgresql", "bin"], ["/usr/local/opt", "bin"], ["/opt/homebrew/opt", "bin"], ["/usr", "bin"]];
  for (const [root, sub] of globs) {
    try { for (const e of fs.readdirSync(root).sort().reverse()) if (/postgres|^\d+$/.test(e)) add(path.join(root, e, sub)); } catch { /* absent */ }
  }
  try { for (const e of fs.readdirSync("/Applications/Postgres.app/Contents/Versions")) add(`/Applications/Postgres.app/Contents/Versions/${e}/bin`); } catch { /* absent */ }
  try { for (const e of fs.readdirSync("/usr").filter((x) => x.startsWith("pgsql-"))) add(`/usr/${e}/bin`); } catch { /* absent */ }
  return dirs[0] || null;
}
const BIN = findBin();
if (!BIN) {
  console.log("test-atlas-ledger-pg: SKIPPED — no PostgreSQL server binaries (initdb/pg_ctl/postgres) found on PATH or in standard install dirs. NOTHING WAS TESTED.");
  process.exit(0);
}

// ── find the pg client ──────────────────────────────────────────────────────
let pg;
for (const base of [path.join(HERE, "../../"), process.env.WF_PG_MODULE_DIR, "/var/tmp/wf-pg-client"].filter(Boolean)) {
  try { pg = (await import(pathToFileURL(createRequire(path.join(base, "x.js")).resolve("pg")).href)).default; break; } catch { /* next */ }
}
if (!pg) { console.error("test-atlas-ledger-pg: ERROR — postgres found but the `pg` npm client is not installed (npm i --no-save pg, or WF_PG_MODULE_DIR). NOT a pass."); process.exit(1); }

// ── throwaway cluster ───────────────────────────────────────────────────────
const root = process.getuid && process.getuid() === 0;
let pgUid = null;
if (root) { const r = spawnSync("id", ["-u", "postgres"], { encoding: "utf8" }); pgUid = Number(r.stdout.trim()); if (!pgUid) { console.error("running as root but no 'postgres' OS user to run the server as"); process.exit(1); } }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wf-ledger-pg-"));
if (root) fs.chownSync(tmp, pgUid, 0);
fs.chmodSync(tmp, 0o700); if (root) fs.chmodSync(tmp, 0o755);
const run = (cmd, args) => spawnSync(...(root ? ["runuser", ["-u", "postgres", "--", path.join(BIN, cmd), ...args]] : [path.join(BIN, cmd), args]), { encoding: "utf8" });
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const data = path.join(tmp, "data"), port = await freePort();
let started = false;
function cleanup() { try { if (started) run("pg_ctl", ["-D", data, "-m", "immediate", "stop"]); } catch { /* best effort */ } try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } }
process.on("exit", cleanup);
let r = run("initdb", ["-D", data, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--no-sync"]);
if (r.status !== 0) { console.error("initdb failed:", r.stderr || r.stdout); process.exit(1); }
r = run("pg_ctl", ["-D", data, "-w", "-l", path.join(tmp, "pg.log"), "-o", `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=${tmp} -c fsync=off -c max_connections=150`, "start"]);
if (r.status !== 0) { console.error("pg_ctl start failed:", r.stderr || r.stdout); process.exit(1); }
started = true;

const cfg = { host: "127.0.0.1", port, user: "postgres" };
const results = [];
const rec = (id, ok, msg) => { results.push([id, ok ? "PASS" : "FAIL", msg]); console.log(`${ok ? "PASS" : "FAIL"} ${id}: ${msg}`); };
const sql = fs.readFileSync(SQL_FILE, "utf8");

async function mkdb(name) {
  const a = new pg.Client({ ...cfg, database: "postgres" }); await a.connect();
  await a.query(`drop database if exists ${name}`); await a.query(`create database ${name}`); await a.end();
}
const aclPublicExec = "exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')";

// ═════ 0. service_role missing: the file must still fail closed (REVOKE from PUBLIC) and say so ═════
{
  await mkdb("wft_norole");
  const c = new pg.Client({ ...cfg, database: "wft_norole" }); await c.connect();
  const notices = []; c.on("notice", (n) => notices.push(n.message));
  await c.query(sql);
  const fns = (await c.query(`select p.proname, ${aclPublicExec} pub from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'wf\\_ai%'`)).rows;
  const tabs = (await c.query(`select c.relname, has_table_privilege('public', c.oid, 'select') s from pg_class c where c.relname in ('wf_ai_budget','wf_ai_spend')`)).rows;
  rec("S0", fns.length >= 15 && fns.every((f) => !f.pub) && tabs.every((t) => !t.s) && notices.some((m) => /service_role does not exist/.test(m)),
    `no service_role in cluster: ${fns.length} functions, PUBLIC EXECUTE on ${fns.filter((f) => f.pub).length}; PUBLIC select on tables ${tabs.filter((t) => t.s).length}; warning raised=${notices.some((m) => /service_role does not exist/.test(m))}`);
  await c.end();
}

// ═════ main database with Supabase-like roles ═════
await mkdb("wft");
{ const a = new pg.Client({ ...cfg, database: "wft" }); await a.connect();
  for (const role of ["anon", "authenticated", "service_role"]) await a.query(`create role ${role} nologin`);
  // Supabase default privileges grant EXECUTE on new public functions to these roles; mimic that so the revokes are proven necessary.
  await a.query("alter default privileges in schema public grant execute on functions to anon, authenticated, service_role");
  const notices = []; a.on("notice", (n) => notices.push(n.message));
  await a.query(sql);
  rec("S0b", !notices.some((m) => /service_role does not exist/.test(m)), "with roles present: no fail-closed warning");
  await a.end(); }

const pool = new pg.Pool({ ...cfg, database: "wft", max: 60 });
pool.on("error", () => {});
const q = (s, a) => pool.query(s, a).then((x) => x.rows);
const one = async (s, a) => (await q(s, a))[0];
const err = async (s, a) => { try { await pool.query(s, a); return null; } catch (e) { return { code: e.code, message: e.message }; } };
const V = "anthropic-std-2026-10-08";
const bud = (s, p, c) => q("select wf_ai_set_budget($1,$2,$3)", [s, p, c]);
const R = (k, sc, pe, pl, b, m = "m", v = V) => one("select wf_ai_reserve($1,$2,$3,$4,$5,$6,$7) r", [k, sc, pe, pl, m, v, b]).then((x) => x.r);
const disp = (k) => q("select wf_ai_dispatch($1)", [k]);
const settle = (k, n) => one("select wf_ai_settle($1,$2,'{\"u\":1}'::jsonb,'req') r", [k, n]).then((x) => x.r);
const recon = (k, n, why = "op") => one("select wf_ai_reconcile($1,$2,$3) r", [k, n, why]).then((x) => x.r);
const row = (k) => one("select state, reserved_micro_usd::bigint rsv, settled_micro_usd::bigint st, reason, period from wf_ai_spend where attempt_key=$1", [k]);
const snap = async (sc) => one(`select count(*)::int n,
  coalesce(sum(case when state='settled' then settled_micro_usd end),0)::bigint settled,
  coalesce(sum(case when state in ('reserved','dispatched','unresolved') then reserved_micro_usd end),0)::bigint open,
  (select bool_or(halted) from wf_ai_budget where scope=$1) halted from wf_ai_spend where scope=$1`, [sc]);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tally = (xs, f) => xs.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});

async function overlap(n, fn) { // N pooled connections all blocked on a shared advisory lock, released together
  const hold = await pool.connect(); await hold.query("select pg_advisory_lock(4242)");
  const ps = Array.from({ length: n }, (_, i) => (async () => {
    const c = await pool.connect();
    try { await c.query("select pg_advisory_lock_shared(4242)"); await c.query("select pg_advisory_unlock_shared(4242)"); return await fn(c, i); }
    catch (e) { return { error: e.message, code: e.code }; } finally { c.release(); }
  })());
  for (let t = 0; t < 400; t++) { const w = await hold.query("select count(*)::int c from pg_locks where locktype='advisory' and not granted"); if (w.rows[0].c >= n) break; await new Promise((r) => setTimeout(r, 25)); }
  await hold.query("select pg_advisory_unlock(4242)"); hold.release();
  return Promise.all(ps);
}

// ═════ concurrency ═════
await bud("c1", "p1", 100000000);
{
  const res = await overlap(40, (c, i) => c.query("select wf_ai_reserve($1,'c1','p1',$2,'m',$3,7000000) r", ["c1k" + i, "pl" + i, V]).then((x) => x.rows[0].r));
  const ok = res.filter((x) => x.ok).length, s = await snap("c1");
  rec("T1 concurrency", ok === 14 && Number(s.open) === 98000000 && s.n === 14 && res.filter((x) => !x.ok).every((x) => x.reason === "over_ceiling"),
    `40 concurrent reserves of 7M vs 100M ceiling: admitted=${ok} (floor=14) rows=${s.n} open=${s.open} rejections=${JSON.stringify(tally(res.filter((x) => !x.ok), (x) => x.reason || x.error))}`);
}
// ═════ insufficient balance ═════
await bud("c2", "p1", 10000000);
{
  const a = await R("c2a", "c2", "p1", "pl", 10000001), s = await snap("c2"), b = await R("c2b", "c2", "p1", "pl", 10000000);
  rec("T2 insufficient", a.reason === "over_ceiling" && s.n === 0 && b.ok === true, `ceiling+1 -> ${JSON.stringify(a)} rows=${s.n}; exact fit -> ${JSON.stringify(b)}`);
}
// ═════ duplicate keys ═════
await bud("c3", "p1", 100000000);
{
  const a = await R("dup", "c3", "p1", "pa", 1000000), b = await R("dup", "c3", "p1", "pb", 1000000);
  rec("T3a dup sequential", a.ok && !a.already && b.reason === "duplicate_attempt_key", `${JSON.stringify(a)} then different place same key ${JSON.stringify(b)}`);
  const res = await overlap(10, (c, i) => c.query("select wf_ai_reserve('dupc','c3','p1',$1,'m',$2,1000000) r", ["pc" + i, V]).then((x) => x.rows[0].r));
  const n = (await one("select count(*)::int n from wf_ai_spend where attempt_key='dupc'")).n, t = tally(res, (x) => (x.ok ? "ok" : x.reason || x.error));
  rec("T3b dup 10-way, differing params", n === 1 && t.ok === 1 && t.duplicate_attempt_key === 9, `rows=${n} outcomes=${JSON.stringify(t)}`);
  const res2 = await overlap(10, (c) => c.query("select wf_ai_reserve('dupd','c3','p1','same-place','m',$1,1000000) r", [V]).then((x) => x.rows[0].r));
  const n2 = (await one("select count(*)::int n from wf_ai_spend where attempt_key='dupd'")).n;
  const fresh = res2.filter((x) => x.ok && !x.already).length, already = res2.filter((x) => x.ok && x.already).length;
  rec("T3c dup 10-way, identical params", n2 === 1 && fresh === 1 && already === 9, `rows=${n2} created=${fresh} already=${already} (never 2 rows, never an error)`);
}
// ═════ retries: reserve ═════
await bud("r1", "p1", 100000000);
{
  const k = "rr", a = await R(k, "r1", "p1", "pl", 5000);
  const b = await R(k, "r1", "p1", "pl", 5000);
  const before = await snap("r1");
  const c = await R(k, "r1", "p1", "pl", 5001), d = await R(k, "r1", "p1", "other", 5000), e = await R(k, "r1", "p1", "pl", 5000, "m2");
  await disp(k);
  const f = await R(k, "r1", "p1", "pl", 5000);
  await settle(k, 4000); const g = await R(k, "r1", "p1", "pl", 5000);
  await R("rr2", "r1", "p1", "pl2", 5000); await q("select wf_ai_release('rr2')"); const h = await R("rr2", "r1", "p1", "pl2", 5000);
  await R("rr3", "r1", "p1", "pl3", 5000); await disp("rr3"); await q("select wf_ai_unresolve('rr3','x')"); const i2 = await R("rr3", "r1", "p1", "pl3", 5000);
  rec("T4 retry reserve", a.ok && b.ok && b.already && before.n === 1 && [c, d, e, g, h, i2].every((x) => x.reason === "duplicate_attempt_key") && f.ok && f.already,
    `same params while reserved -> ${JSON.stringify(b)}; changed bound/place/model -> ${[c, d, e].map((x) => x.reason)}; while dispatched -> ${JSON.stringify(f)}; after settled/released/unresolved -> ${[g, h, i2].map((x) => x.reason)}`);
}
// ═════ retries: settle / repeated settlement ═════
await bud("r2", "p1", 100000000);
{
  await R("s1", "r2", "p1", "x1", 5000000); await disp("s1");
  const s1 = await settle("s1", 3000000), t1 = await snap("r2");
  const s2 = await settle("s1", 3000000), t2 = await snap("r2");
  const e = await err("select wf_ai_settle('s1',3000001,'{}','r')"), t3 = await snap("r2");
  rec("T5 retry settle", s1.ok && !s1.already && s2.ok && s2.already && same(t1, t2) && e && /already settled/.test(e.message) && same(t1, t3) && Number(t3.settled) === 3000000,
    `first ${JSON.stringify(s1)}; same-amount retry ${JSON.stringify(s2)} totals unchanged=${same(t1, t2)}; different amount raised="${e && e.message}" totals unchanged=${same(t1, t3)}`);
  await R("s2", "r2", "p1", "x2", 1000); await disp("s2"); await settle("s2", 9000); const tb = await snap("r2");
  const o = await settle("s2", 9000), tc = await snap("r2");
  rec("T5b retry settle (overrun)", o.already && o.overrun === true && same(tb, tc), `overrun retry ${JSON.stringify(o)} totals unchanged=${same(tb, tc)}`);
  await q("select wf_ai_clear_halt('r2')");
  await R("s3", "r2", "p1", "x3", 100000); await disp("s3");
  const res = await overlap(10, (c, i) => c.query("select wf_ai_settle('s3',$1,'{}','r') r", [1000 + i]).then((x) => x.rows[0].r));
  const okc = res.filter((x) => x.ok).length, raised = res.filter((x) => x.error && /already settled/.test(x.error)).length, fin = await row("s3");
  rec("T5c repeated settlement 10-way", okc === 1 && raised === 9 && fin.state === "settled" && Number(fin.st) >= 1000 && Number(fin.st) <= 1009,
    `10 concurrent settles with 10 different amounts: succeeded=${okc} raised=${raised} final settled=${fin.st}`);
  const res2 = await overlap(10, async (c) => c.query("select wf_ai_settle('s1',3000000,'{}','r') r").then((x) => x.rows[0].r));
  rec("T5d settle retry 10-way same", res2.every((x) => x.ok && x.already) && same(await snap("r2"), await snap("r2")), `10 concurrent identical retries all already:true`);
}
// ═════ retries: release ═════
await bud("r3", "p1", 100000);
{
  await R("l1", "r3", "p1", "x1", 5000); const a = await one("select wf_ai_release('l1') r"), b = await one("select wf_ai_release('l1') r"), s = await snap("r3");
  await R("l2", "r3", "p1", "x2", 5000); await disp("l2"); const e = await err("select wf_ai_release('l2')");
  const e2 = await err("select wf_ai_release('nope')");
  rec("T6 retry release", a.r.ok && !a.r.already && b.r.ok && b.r.already && s.open == 0 && e && /illegal transition/.test(e.message) && (await row("l2")).state === "dispatched" && e2 && e2.code === "P0002",
    `release ${JSON.stringify(a.r)} then retry ${JSON.stringify(b.r)}; open after=${s.open}; release after dispatch raised="${e && e.message}"; unknown key code=${e2 && e2.code}`);
}
// ═════ retries: reconcile ═════
await bud("r4", "p1", 100000000);
{
  await R("q1", "r4", "p1", "x1", 5000000); await disp("q1"); await q("select wf_ai_unresolve('q1','missing usage')");
  const a = await recon("q1", 4200000), t1 = await snap("r4"), b = await recon("q1", 4200000), t2 = await snap("r4");
  const e = await err("select wf_ai_reconcile('q1',4200001,'op')"), t3 = await snap("r4");
  rec("T7 retry reconcile", a.ok && !a.already && b.ok && b.already && same(t1, t2) && e && /already settled/.test(e.message) && same(t1, t3) && Number(t3.settled) === 4200000,
    `first ${JSON.stringify(a)}; same retry ${JSON.stringify(b)} totals unchanged=${same(t1, t2)}; different raised="${e && e.message}"`);
  await R("q2", "r4", "p1", "x2", 1000); await disp("q2"); await q("select wf_ai_unresolve('q2','a')"); const u2 = await one("select wf_ai_unresolve('q2','b') r");
  rec("T7b retry unresolve", u2.r.ok && u2.r.already && (await row("q2")).reason === "a", `unresolve retry ${JSON.stringify(u2.r)} keeps first reason`);
}
// ═════ crash: backend killed mid-transaction while holding the scope lock ═════
await bud("k1", "p1", 100000000);
{
  const c = await pool.connect(); c.on("error", () => {});
  await c.query("begin"); const held = (await c.query(`select wf_ai_reserve('kk1','k1','p1','plk','m','${V}',1000000) r`)).rows[0].r;
  const pid = (await c.query("select pg_backend_pid() p")).rows[0].p;
  const blocked = q(`select wf_ai_reserve('kk2','k1','p1','plk2','m','${V}',1000000) r`);
  await new Promise((r) => setTimeout(r, 400));
  const state = await Promise.race([blocked.then(() => "done"), new Promise((r) => setTimeout(() => r("blocked"), 200))]);
  const inFlight = (await one("select count(*)::int n from wf_ai_spend where attempt_key='kk1'")).n;
  await q("select pg_terminate_backend($1)", [pid]); await c.query("select 1").catch(() => {}); c.release(true);
  const t0 = Date.now(), r2 = await blocked, ghost = (await one("select count(*)::int n from wf_ai_spend where attempt_key='kk1'")).n;
  rec("T8 crash", held.ok && state === "blocked" && inFlight === 0 && ghost === 0 && r2[0].r.ok,
    `holder reserved inside open tx (invisible to others: ${inFlight} rows); 2nd reserve ${state}; after pg_terminate_backend lock freed in ${Date.now() - t0}ms, 2nd ok=${r2[0].r.ok}, ghost rows=${ghost}`);
  // crash between dispatch and settle: committed dispatched row survives and keeps counting
  await R("kk3", "k1", "p1", "plk3", 2000000); await disp("kk3");
  const c2 = await pool.connect(); c2.on("error", () => {});
  await c2.query("begin"); await c2.query("select wf_ai_settle('kk3',1500000,'{}','r')"); const p2 = (await c2.query("select pg_backend_pid() p")).rows[0].p;
  await q("select pg_terminate_backend($1)", [p2]); await c2.query("select 1").catch(() => {}); c2.release(true);
  const after = await row("kk3");
  rec("T8b crash mid-settle", after.state === "dispatched" && after.st === null, `settle killed before commit: state=${after.state} settled=${after.st} (still dispatched, full bound ${after.rsv} still counted)`);
}
// ═════ timeout: statement_timeout while waiting for the scope lock ═════
await bud("t1", "p1", 100000000);
{
  const holder = await pool.connect(); await holder.query("begin"); await holder.query("select 1 from wf_ai_budget where scope='t1' for update");
  const c = await pool.connect(); await c.query("set statement_timeout = 300");
  const t0 = Date.now(); let e = null; try { await c.query(`select wf_ai_reserve('tk1','t1','p1','plt','m','${V}',1000000)`); } catch (x) { e = x; }
  await c.query("reset statement_timeout"); c.release();
  await holder.query("rollback"); holder.release();
  const n = (await one("select count(*)::int n from wf_ai_spend where attempt_key='tk1'")).n;
  const again = await R("tk1", "t1", "p1", "plt", 1000000);
  rec("T9 timeout", e && e.code === "57014" && n === 0 && again.ok, `reserve blocked behind lock timed out after ${Date.now() - t0}ms code=${e && e.code}; rows=${n}; lock freed, retry -> ${JSON.stringify(again)}`);
}
// ═════ missing/invalid usage: unresolve keeps liability; bad amounts never erase a charge ═════
await bud("u1", "p1", 20000000);
{
  await R("u1a", "u1", "p1", "x1", 6000000); await disp("u1a"); await q("select wf_ai_unresolve('u1a','missing usage')");
  const st = await row("u1a"), over = await R("u1b", "u1", "p1", "x2", 15000000), fit = await R("u1c", "u1", "p1", "x3", 14000000);
  const e = await err("select wf_ai_settle('u1a',100,'{}','r')");
  rec("T10 missing usage", st.state === "unresolved" && over.reason === "over_ceiling" && over.committed == 6000000 && fit.ok && e && /illegal transition/.test(e.message),
    `unresolved still counts 6M: 15M -> ${over.reason}(committed=${over.committed}), 14M fits=${fit.ok}; plain settle on unresolved raised (use reconcile)`);
  await bud("u2", "p1", 20000000); await R("u2a", "u2", "p1", "y1", 100000); await disp("u2a");
  const before = await snap("u2"), bad = {};
  for (const [lbl, v] of [["null", null], ["negative", -5], ["fractional", 1.5], ["NaN", "NaN"], ["text", "abc"]]) bad[lbl] = await err("select wf_ai_settle('u2a',$1,'{}','r')", [v]);
  const after = await snap("u2"), r2 = await row("u2a");
  rec("T10b invalid settle fails closed", Object.values(bad).every((x) => x && (x.code === "P0001" || x.code === "22P02")) && r2.state === "dispatched" && same(before, after),
    `settle NULL/-5/1.5/NaN/'abc' all raised (${Object.values(bad).map((x) => x && x.code)}); row still ${r2.state}, counted at ${r2.rsv}; totals unchanged=${same(before, after)}`);
}
// ═════ month boundary ═════
await bud("m1", "2026-10", 100); await bud("m1", "2026-11", 100);
{
  await R("mA", "m1", "2026-10", "p-a", 40); await disp("mA");
  const big = await R("mB0", "m1", "2026-11", "p-b0", 70);
  const b = await R("mB", "m1", "2026-11", "p-b", 60);
  await settle("mA", 30);               // settled after November started: must be charged to October
  const sA = await row("mA"), halted = (await snap("m1")).halted;
  const n40 = await R("mN1", "m1", "2026-11", "p-n1", 40), n41 = await R("mN2", "m1", "2026-11", "p-n2", 1);
  const o = await R("mO", "m1", "2026-10", "p-o", 10), o2 = await R("mO2", "m1", "2026-10", "p-o2", 1);
  const inOct = Number((await one("select coalesce(sum(settled_micro_usd),0)::int s from wf_ai_spend where scope='m1' and period='2026-10' and state='settled'")).s);
  const inNov = Number((await one("select coalesce(sum(settled_micro_usd),0)::int s from wf_ai_spend where scope='m1' and period='2026-11' and state='settled'")).s);
  rec("T11 month boundary", big.reason === "over_ceiling" && b.ok && sA.period === "2026-10" && sA.st == 30 && halted === false && n40.ok && n41.reason === "over_ceiling" && o.reason === "over_ceiling" && o2.reason === "over_ceiling" && inOct === 30 && inNov === 0,
    `Oct 40 in-flight blocks Nov 70 (${big.reason}) but Nov 60 fits; Oct settled 30 after Nov began: charged to ${sA.period}, Oct settled=${inOct} Nov settled=${inNov}, no spurious halt (${halted}); Nov in-flight 60+40=100 -> Nov +1 ${n41.reason}; Oct settled 30 + Nov in-flight 100 = 130 already over the Oct ceiling, so even Oct +1 -> ${o2.reason} (in-flight from ANY period counts)`);
  // release in Nov frees exactly that reservation; October figures untouched
  const octBefore = await one("select coalesce(sum(settled_micro_usd),0)::int s from wf_ai_spend where period='2026-10' and scope='m1'");
  await q("select wf_ai_release('mB')"); const after = await snap("m1");
  const octAfter = await one("select coalesce(sum(settled_micro_usd),0)::int s from wf_ai_spend where period='2026-10' and scope='m1'");
  const octFit = await R("mP", "m1", "2026-10", "p-p", 30), octOver = await R("mP2", "m1", "2026-10", "p-p2", 1);
  rec("T11b refund keeps period", Number(after.open) === 40 && octBefore.s === octAfter.s && (await row("mB")).period === "2026-11" && octFit.ok && octOver.reason === "over_ceiling",
    `release of the 60 Nov reservation: open ${after.open} (only the 40 Nov reservation left), Oct settled ${octBefore.s}->${octAfter.s}`);
  // unresolved from the old period still blocks the new one
  await bud("m2", "2026-10", 100); await bud("m2", "2026-11", 100);
  await R("mU", "m2", "2026-10", "p-u", 80); await disp("mU"); await q("select wf_ai_unresolve('mU','crash')");
  const nov = await R("mV", "m2", "2026-11", "p-v", 30);
  rec("T11c old unresolved blocks new period", nov.reason === "over_ceiling", `Oct unresolved 80 vs Nov bound 30 -> ${nov.reason}`);
}
// ═════ refunds ═════
await bud("f1", "p1", 100);
{
  await R("fa", "f1", "p1", "p1", 60); const full = await R("fb", "f1", "p1", "p2", 60);
  await q("select wf_ai_release('fa')"); const fits = await R("fb", "f1", "p1", "p2", 60), s = await snap("f1");
  await disp("fb"); const e = await err("select wf_ai_release('fb')");
  await settle("fb", 50); const e2 = await err("select wf_ai_release('fb')");
  rec("T12 refunds", full.reason === "over_ceiling" && fits.ok && Number(s.open) === 60 && e && /illegal transition/.test(e.message) && e2 && /illegal transition/.test(e2.message) && (await snap("f1")).settled == 50,
    `release frees exactly its 60; release after dispatch raised; release after settle raised; settled stays 50`);
}
// ═════ manual reconciliation ═════
await bud("x1", "p1", 100000000);
{
  await R("xa", "x1", "p1", "x1", 5000000); await disp("xa"); await q("select wf_ai_unresolve('xa','timeout')");
  const before = await snap("x1"), bad = {};
  for (const [lbl, v] of [["null", null], ["negative", -1], ["fractional", 2.5], ["NaN", "NaN"]]) bad[lbl] = await err("select wf_ai_reconcile('xa',$1,'op')", [v]);
  const after = await snap("x1"), r = await row("xa"), blocked = await R("xfill", "x1", "p1", "xf", 95000001);
  rec("T13 reconcile rejects bad amounts", Object.values(bad).every((x) => x && x.code === "P0001") && r.state === "unresolved" && same(before, after) && Number(after.open) === 5000000 && blocked.reason === "over_ceiling",
    `NULL/-1/2.5/NaN raised; row ${r.state}, still counted at full bound ${after.open}; ceiling headroom unchanged (95,000,001 still ${blocked.reason})`);
  const ok = await recon("xa", 3000000), r2 = await row("xa");
  rec("T13b reconcile within bound", ok.overrun === false && r2.state === "settled" && r2.st == 3000000 && (await snap("x1")).halted === false, `settled ${r2.st} <= bound ${r2.rsv}: ${JSON.stringify(ok)}`);
  // overrun
  await R("xb", "x1", "p1", "x2", 5000000); await disp("xb"); await q("select wf_ai_unresolve('xb','timeout')");
  const o = await recon("xb", 9000000), rb = await row("xb"), next = await R("xc", "x1", "p1", "x3", 1);
  rec("T14 reconcile overrun halts", o.overrun === true && o.halted === true && rb.st == 9000000 && /^overrun/.test(rb.reason) && next.reason === "halted",
    `reconcile 9M > bound 5M: ${JSON.stringify(o)}; recorded in full=${rb.st}; reason="${rb.reason}"; next reserve -> ${next.reason}`);
  const again = await recon("xb", 9000000);
  rec("T14b overrun retry idempotent", again.already && again.overrun === true && (await row("xb")).st == 9000000, `${JSON.stringify(again)}`);
  // ceiling exceeded without an overrun of the bound: ceiling lowered after the reservation
  await bud("x2", "p1", 10); await R("xd", "x2", "p1", "x1", 8); await disp("xd"); await q("select wf_ai_unresolve('xd','t')");
  await bud("x2", "p1", 5);
  const c = await recon("xd", 6);
  rec("T14c reconcile over ceiling halts", c.overrun === false && c.halted === true && (await snap("x2")).halted === true, `settled 6 <= bound 8 but period total 6 > lowered ceiling 5: ${JSON.stringify(c)}`);
  await bud("x3", "p1", 10); await R("xe", "x3", "p1", "x1", 8); await disp("xe"); await bud("x3", "p1", 5);
  const sc = await settle("xe", 6);
  rec("T14d settle over ceiling halts", sc.halted === true, `settle ${JSON.stringify(sc)}`);
  // can_spend
  const cs = await one("select wf_ai_can_spend('x1') a, wf_ai_can_spend('x3') b, wf_ai_can_spend('c3') c, wf_ai_can_spend('no-such-scope') d");
  await q("select wf_ai_clear_halt('x1')"); const cs2 = await one("select wf_ai_can_spend('x1') a");
  rec("T15 can_spend", cs.a === false && cs.b === false && cs.c === true && cs.d === false && cs2.a === true, `halted scope=${cs.a}, other halted=${cs.b}, healthy=${cs.c}, unknown scope=${cs.d}, after clear_halt=${cs2.a}`);
}
// ═════ mixed stress: no deadlocks ═════
await bud("st", "p1", 1000000000); await bud("st", "p2", 1000000000);
{
  const res = await overlap(50, async (c, i) => {
    try {
      const k = "st" + i; const r = (await c.query("select wf_ai_reserve($1,'st',$2,$3,'m',$4,1000000) r", [k, i % 2 ? "p1" : "p2", "spl" + i, V])).rows[0].r;
      if (i % 5 === 0) await c.query("select wf_ai_clear_halt('st')");
      if (i % 7 === 0) await c.query("select wf_ai_set_budget('st','p1',1000000000)");
      if (r.ok) { await c.query("select wf_ai_dispatch($1)", [k]); if (i % 3 === 0) { await c.query("select wf_ai_unresolve($1,'x')", [k]); await c.query("select wf_ai_reconcile($1,400000,'op')", [k]); } else await c.query("select wf_ai_settle($1,500000,'{}','r')", [k]); }
      return "ok";
    } catch (e) { return e.code + ":" + e.message; }
  });
  const bad = res.filter((x) => x !== "ok");
  rec("T16 mixed stress", bad.length === 0, `50 concurrent reserve/dispatch/settle/unresolve/reconcile/clear_halt/set_budget flows: failures=${bad.length} ${bad.slice(0, 2).join(" | ")}`);
}
// ═════ server authority ═════
{
  const fns = await q(`select p.proname, p.prosecdef sdef, p.proconfig cfg, has_function_privilege('anon',p.oid,'execute') anon, has_function_privilege('authenticated',p.oid,'execute') auth,
      has_function_privilege('service_role',p.oid,'execute') svc, ${aclPublicExec} pub
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'wf\\_ai%' order by 1`);
  const helpers = fns.filter((f) => f.proname.startsWith("wf_ai__")), api = fns.filter((f) => !f.proname.startsWith("wf_ai__"));
  rec("T17a definer+search_path", fns.length >= 15 && fns.every((f) => f.sdef && (f.cfg || []).some((c) => /^search_path=public, pg_temp$/.test(c))), `${fns.length} functions all SECURITY DEFINER with fixed search_path`);
  rec("T17b anon/authenticated/PUBLIC denied", fns.every((f) => !f.anon && !f.auth && !f.pub), `anon exec=${fns.filter((f) => f.anon).length} authenticated exec=${fns.filter((f) => f.auth).length} PUBLIC exec=${fns.filter((f) => f.pub).length} (of ${fns.length})`);
  rec("T17c service_role API only", api.length >= 9 && api.every((f) => f.svc) && helpers.length >= 6 && helpers.every((f) => !f.svc), `service_role may execute ${api.filter((f) => f.svc).length}/${api.length} API functions and ${helpers.filter((f) => f.svc).length}/${helpers.length} helpers`);
  const c = await pool.connect();
  const tryAs = async (role, stmt) => { await c.query(`set role ${role}`); try { await c.query(stmt); return null; } catch (e) { return e.code; } finally { await c.query("reset role"); } };
  const calls = ["select wf_ai_reserve('z','c1','p1','z','m','" + V + "',1)", "select wf_ai_dispatch('kk3')", "select wf_ai_release('kk3')", "select wf_ai_settle('kk3',1,'{}','r')", "select wf_ai_reconcile('kk3',1,'x')",
    "select wf_ai_unresolve('kk3','x')", "select wf_ai_set_budget('c1','p1',1,true)", "select wf_ai_clear_halt('c1')", "select wf_ai_can_spend('c1')", "select wf_ai__lock_scope('c1')", "select wf_ai__lock_attempt('kk3')"];
  const denied = {};
  for (const role of ["anon", "authenticated"]) denied[role] = await Promise.all(calls.map((s) => tryAs(role, s)));
  const tbl = await Promise.all(["anon", "authenticated"].map((r) => tryAs(r, "select * from wf_ai_spend")));
  const svcOk = await tryAs("service_role", "select wf_ai_can_spend('c1')"), svcHelper = await tryAs("service_role", "select wf_ai__lock_scope('c1')");
  c.release();
  rec("T17d role switch", Object.values(denied).every((a) => a.every((x) => x === "42501")) && tbl.every((x) => x === "42501") && svcOk === null && svcHelper === "42501",
    `SET ROLE anon/authenticated: ${calls.length} calls each -> all 42501; direct table select 42501; service_role can_spend=${svcOk === null ? "ok" : svcOk}, service_role helper=${svcHelper}`);
  const rls = await q("select relname, relrowsecurity from pg_class where relname in ('wf_ai_budget','wf_ai_spend')");
  const pol = await one("select count(*)::int n from pg_policies where tablename in ('wf_ai_budget','wf_ai_spend')");
  rec("T17e RLS", rls.length === 2 && rls.every((x) => x.relrowsecurity) && pol.n === 0, "RLS on both tables, zero policies");
}

await pool.end();
console.log("\nSUMMARY");
const w = Math.max(...results.map((x) => x[0].length));
for (const [id, st] of results) console.log(`  ${st}  ${id.padEnd(w)}`);
const fails = results.filter((x) => x[1] === "FAIL");
console.log(`\ntest-atlas-ledger-pg: ${fails.length ? "FAILED" : "OK"} — ${results.length - fails.length}/${results.length} PASS on ${(await (async () => { const r2 = run("postgres", ["--version"]); return r2.stdout.trim(); })())} (real server, ${SQL_FILE === path.join(HERE, "../../supabase/proposals/2026-10-atlas-ai-budget.sql") ? "proposal file" : "OVERRIDE " + SQL_FILE})`);
process.exit(results.length === 0 || fails.length ? 1 : 0);
