// scripts/check-push-registration.mjs
//
// Launch hardening 2026-09-22: the native shell must never receive database
// write authority. Push registration goes through a Wayfind server route,
// which rate-limits untrusted callers, optionally verifies a signed-in Supabase
// session, and invokes a service-role-only database function.
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

// 1. APNs production capability stays intact.
const ent = read("ios/App/App/App.entitlements");
const aps = (ent.match(/<key>aps-environment<\/key>\s*<string>([^<]+)<\/string>/) || [])[1];
ok(!!aps, "aps-environment exists");
ok(aps === "production", `aps-environment must be production (got ${JSON.stringify(aps)})`);

// 2. The client registers, but only through Wayfind's server endpoint.
const client = stripJs(read("app/components/NativeShellInit.js"));
ok(/registerPushNotifications\s*\(/.test(client), "NativeShellInit still registers for push");
ok(/fetch\(\s*["']\/api\/push\/register["']/.test(client), "native push is sent to /api/push/register");
ok(!/supabase\.rpc\(\s*["']wf_register_push_token["']/.test(client), "client no longer calls the public SECURITY DEFINER RPC");
ok(!/\.from\(\s*["']device_push_tokens["']\s*\)/.test(client), "client never writes device_push_tokens directly");
ok(/supabase\.auth\.getSession\(\)/.test(client), "signed-in session is offered to the server for verification");
const fetchBlock = (client.match(/fetch\(\s*["']\/api\/push\/register["'][\s\S]*?\}\);/) || [""])[0];
ok(fetchBlock.length > 100, "push fetch block is present and non-trivial");
ok(!/user_?id\s*:|p_user_id\s*:/i.test(fetchBlock), "client never supplies its own user id");

// 3. The public route validates and rate-limits before any database write.
const route = stripJs(read("app/api/push/register/route.js"));
ok(/export\s+async\s+function\s+POST/.test(route), "push route exports POST");
ok(/SUPABASE_SERVICE_ROLE_KEY/.test(route), "push route requires server-only Supabase credentials");
ok(/MAX_PER_WINDOW\s*=\s*30/.test(route) && /WINDOW_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000/.test(route), "push route has a bounded warm-instance abuse cap");
ok(/token\.length\s*<\s*32/.test(route) && /token\.length\s*>\s*512/.test(route), "push token length is validated");
ok(/platform\s*!==\s*["']ios["']/.test(route) && /platform\s*!==\s*["']android["']/.test(route), "push platform is allow-listed");
ok(/\/auth\/v1\/user/.test(route), "a supplied session is verified server-side");
ok(/status:\s*401/.test(route) && /invalid_session/.test(route), "invalid supplied sessions fail closed");
ok(/wf_register_push_token_server/.test(route), "route uses the service-only registration function");
ok(/p_user_id:\s*identity\.userId/.test(route), "only the server-verified user id reaches storage");
ok(!/console\.(?:log|error|warn)\([^\n]*token/i.test(route), "route does not log a push token");

// 4. The database function is invoker-rights and service-role-only.
const sql = stripSql(read("supabase/migrations/20260922105624_launch_push_server_registration_rpc.sql"));
ok(/create\s+or\s+replace\s+function\s+public\.wf_register_push_token_server/i.test(sql), "service-only push function is recorded in a migration");
ok(/security\s+invoker/i.test(sql), "server push function does not elevate to its creator");
ok(/set\s+search_path\s*=\s*''/i.test(sql), "server push function uses an empty search_path");
ok(/revoke\s+all\s+on\s+function\s+public\.wf_register_push_token_server[\s\S]*?from\s+public,\s*anon,\s*authenticated/i.test(sql), "PUBLIC, anon and authenticated cannot call the server function");
ok(/grant\s+execute\s+on\s+function\s+public\.wf_register_push_token_server[\s\S]*?to\s+service_role/i.test(sql), "service_role alone is granted execution");
ok(/insert\s+into\s+public\.device_push_tokens/i.test(sql), "server function stores the token in the locked table");
ok(/coalesce\(excluded\.user_id,\s*t\.user_id\)/i.test(sql), "signed-out re-registration cannot erase an existing user association");
ok(/insert\s+into\s+public\.wf_job_pulse[\s\S]*?'push_register'/i.test(sql), "push registration remains observable through the job pulse");

console.log(`check-push-registration: OK — ${pass} assertions; native push now crosses a rate-limited Wayfind server boundary and only a service-role-only invoker function writes the locked table`);
