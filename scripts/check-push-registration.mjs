// scripts/check-push-registration.mjs
//
// Push has THREE independent silent failures, and this repo has already shipped
// one of them for the entire life of the native shell.
//
//   1. aps-environment: a TestFlight or App Store build with `development`
//      registers against the sandbox APNs. Tokens come back, nothing errors,
//      and no notification is ever delivered.
//   2. the write target: the client upserted into device_push_tokens, a table
//      that DOES NOT EXIST (verified against the live database, count 0). The
//      call sits inside a try/catch that swallows, so every registration since
//      launch failed in silence.
//   3. the argument names: PostgREST resolves an RPC by NAME AND ARGUMENT NAMES.
//      p_device vs p_device_id is "function does not exist" at runtime and
//      compiles perfectly.
//
// Number 3 is why this guard cross-reads the SQL. The client and the migration
// are two files nobody diffs against each other, and nothing else in the repo
// would notice them drifting apart.
//
// ── WHAT THIS GUARD CANNOT DO ────────────────────────────────────────────
// It cannot execute the SQL or reach the database. The RPC is proven to be
// CALLED WITH THE RIGHT SHAPE, not proven to work. Stated here so the weaker
// check reads as weaker (CLAUDE.md) — the real confirmation is the verification
// block at the bottom of supabase/push-token-register.sql, run by the owner
// after applying it.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0;
const fail = (m) => { console.error("check-push-registration: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(path.join(REPO, p), "utf8");
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const stripSql = (s) => s.replace(/^\s*--.*$/gm, "");

// ── 1. APNs ENVIRONMENT ──────────────────────────────────────────────────
const ent = read("ios/App/App/App.entitlements");
const aps = (ent.match(/<key>aps-environment<\/key>\s*<string>([^<]+)<\/string>/) || [])[1];
ok(!!aps, "control: aps-environment is present in App.entitlements — its absence means no push capability at all, which would make the next assertion vacuous");
ok(aps === "production",
   `aps-environment is "production" (got "${aps}"). A TestFlight or App Store build with "development" registers against the SANDBOX APNs: tokens come back, nothing errors, and no notification is ever delivered.`);

// ── 2. THE CLIENT CALLS THE RPC, AND NOT THE TABLE ───────────────────────
const client = stripJs(read("app/components/NativeShellInit.js"));
ok(/registerPushNotifications\s*\(/.test(client), "control: NativeShellInit still registers for push at all");
const rpc = client.match(/supabase\.rpc\(\s*"([a-z0-9_]+)"\s*,\s*\{([\s\S]*?)\}\s*\)/);
ok(!!rpc, "the token is stored through supabase.rpc(...) — a SECURITY DEFINER function, so the table stays unwritable by anon");
ok(rpc[1] === "wf_register_push_token", `it calls wf_register_push_token (got ${rpc && rpc[1]})`);

// The old path must be gone, not merely supplemented. Two write paths is the
// parallel-path problem: the table one fails silently and hides the good one.
ok(!/\.from\(\s*["']device_push_tokens["']\s*\)/.test(client),
   "NativeShellInit no longer writes device_push_tokens directly — a second write path would fail silently and mask the working one");

// A client that supplies its own user id is a client that can supply someone
// else's. The function reads auth.uid() server-side.
ok(!/p_user_id|user_id\s*:/.test(rpc[2]),
   `no user id is passed from the client (args: ${rpc[2].replace(/\s+/g, " ").trim()}) — the definer function reads auth.uid() itself`);

const clientArgs = [...rpc[2].matchAll(/(\bp_[a-z_]+)\s*:/g)].map((m) => m[1]).sort();
ok(clientArgs.length >= 3, `the call passes its arguments by name (got ${JSON.stringify(clientArgs)})`);

// ── 3. THE MIGRATION EXISTS AND MATCHES THE CALL ─────────────────────────
const sql = stripSql(read("supabase/push-token-register.sql"));
const sig = sql.match(/create\s+or\s+replace\s+function\s+public\.wf_register_push_token\s*\(([\s\S]*?)\)\s*returns/i);
ok(!!sig, "supabase/push-token-register.sql defines public.wf_register_push_token");
const sqlArgs = [...sig[1].matchAll(/(\bp_[a-z_]+)\s+[a-z]/g)].map((m) => m[1]).sort();
ok(sqlArgs.length === clientArgs.length,
   `the function takes the same NUMBER of arguments the client passes (SQL ${JSON.stringify(sqlArgs)} vs client ${JSON.stringify(clientArgs)})`);
ok(JSON.stringify(sqlArgs) === JSON.stringify(clientArgs),
   `the argument NAMES match exactly (SQL ${JSON.stringify(sqlArgs)} vs client ${JSON.stringify(clientArgs)}). PostgREST resolves an RPC by name AND argument names — p_device vs p_device_id is "function does not exist" at runtime and compiles perfectly.`);

// ── 4. THE SECURITY PROPERTIES THE DESIGN DEPENDS ON ─────────────────────
ok(/security\s+definer/i.test(sql), "the function is SECURITY DEFINER — otherwise it runs as the caller and the locked-down table blocks it");
ok(/set\s+search_path\s*=/i.test(sql),
   "search_path is pinned — an unpinned SECURITY DEFINER function is exploitable by a caller who can create objects in a schema that resolves earlier");
ok(/alter\s+table\s+public\.device_push_tokens\s+enable\s+row\s+level\s+security/i.test(sql),
   "RLS is enabled on device_push_tokens");
ok(/revoke\s+all\s+on\s+public\.device_push_tokens\s+from\s+anon,\s*authenticated/i.test(sql),
   "anon and authenticated are revoked on the TABLE — the RPC is the only door");
ok(/grant\s+execute\s+on\s+function\s+public\.wf_register_push_token[\s\S]{0,80}to\s+anon,\s*authenticated/i.test(sql),
   "…but both may EXECUTE the function: signed-out devices are most of the value, since tokens are collected pre-signup");
ok(/auth\.uid\(\)/.test(sql), "the function derives user_id from auth.uid() rather than trusting a parameter");
ok(/coalesce\(\s*excluded\.user_id\s*,\s*t\.user_id\s*\)/i.test(sql),
   "on conflict, user_id COALESCEs instead of overwriting — a token re-registering while signed out would otherwise downgrade a targeted token to a broadcast one on every launch before sign-in completes");

// ── 5. THE HEARTBEAT ─────────────────────────────────────────────────────
// Without it, "zero push tokens" cannot be told apart from "nobody granted
// permission", "the client never called" and "the function errored".
ok(/insert\s+into\s+public\.wf_job_pulse[\s\S]{0,200}'push_register'/i.test(sql),
   "the function records a wf_job_pulse heartbeat — lib/jobPulse.recordPulse uses the SERVICE ROLE key and a client component cannot, so the pulse belongs inside the definer function");
const pulseBlock = (sql.match(/begin\s*\n\s*insert\s+into\s+public\.wf_job_pulse[\s\S]*?end;/i) || [""])[0];
ok(/exception\s+when\s+others/i.test(pulseBlock),
   "the pulse insert is wrapped in its own exception handler — a heartbeat that cannot be written must never fail the registration it is describing");

// ── 6. IT IS FILED, NOT SILENTLY APPLIED ─────────────────────────────────
// The repo must not imply this ran. Nothing here executes it.
const raw = read("supabase/push-token-register.sql");
ok(/NOT APPLIED BY THIS PR/i.test(raw),
   "the SQL states plainly that it is filed for review rather than applied — the client change is inert until the owner runs it, and a file that reads as 'done' is how that gets forgotten");

console.log(`check-push-registration: OK — ${pass} assertions (aps-environment=production; the client calls wf_register_push_token via RPC with no client-supplied user id and no direct table write; ${clientArgs.length} argument names cross-checked against the SQL signature [${sqlArgs.join(", ")}]; definer + pinned search_path + RLS + table revoked + function granted; fail-soft heartbeat present. NOT proven: that the SQL runs — it is unapplied, and the verification block at the end of the .sql is the real check.)`);
