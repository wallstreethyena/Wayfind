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

// 5. lib/native.js's push contract (2026-09-23 launch hardening): listeners
// added before register() is ever called (the original race), a tap handler
// exists, and the boot path never itself triggers the OS permission prompt.
const nativeLib = stripJs(read("lib/native.js"));
ok(/pushNotificationActionPerformed/.test(nativeLib), "lib/native.js handles a notification tap (pushNotificationActionPerformed)");
{
  // Structural, not just presence: every addListener("registration"/
  // "pushNotificationActionPerformed", ...) call must appear TEXTUALLY BEFORE
  // every PushNotifications.register() call site, so the original defect
  // (register() resolving before anything was listening) cannot come back
  // without this guard going red.
  const listenerIdx = [...nativeLib.matchAll(/addListener\(\s*["'](registration|pushNotificationActionPerformed)["']/g)].map((m) => m.index);
  const registerIdx = [...nativeLib.matchAll(/PushNotifications\.register\(\)/g)].map((m) => m.index);
  ok(listenerIdx.length >= 2, "lib/native.js registers both the token and the tap listener");
  ok(registerIdx.length >= 1, "lib/native.js still calls PushNotifications.register() somewhere");
  ok(
    registerIdx.every((r) => listenerIdx.every((l) => l < r)),
    "every PushNotifications.register() call must come after every addListener() call — this is the exact race the 2026-09-22 defect shipped"
  );
}
ok(/export\s+async\s+function\s+getPushPermission/.test(nativeLib), "lib/native.js exports a permission READ that never prompts");
ok(/export\s+async\s+function\s+requestPushPermission/.test(nativeLib), "lib/native.js exports the ONE function allowed to trigger the OS prompt");
{
  // registerPushNotifications (the boot-path function) must gate its own
  // register() call on an already-granted permission, and must never itself
  // call requestPermissions — that keeps "boot never prompts" true even if
  // someone edits requestPushPermission's implementation later.
  const registerFn = (nativeLib.match(/export\s+async\s+function\s+registerPushNotifications[\s\S]*?\n\}/) || [""])[0];
  ok(registerFn.length > 100, "registerPushNotifications body was found");
  ok(!/requestPermissions\(/.test(registerFn), "registerPushNotifications (the boot path) never calls requestPermissions — that would prompt at boot");
  ok(/checkPermissions\(\)/.test(registerFn) && /receive\s*===\s*["']granted["']/.test(registerFn), "registerPushNotifications only registers when permission reads as already granted");
}

// 6. The tap path filter actually rejects the two shapes a crafted push
// payload would use to send the app off-origin, exercised as a CALL against
// the real export — not pattern-matched from source (AGENTS.md: assert on
// the call, not the string).
{
  const { safeNativeTapPath } = await import(path.join(REPO, "lib/native.js"));
  ok(typeof safeNativeTapPath === "function", "lib/native.js exports safeNativeTapPath so the tap filter can be called directly, not just grepped");
  ok(safeNativeTapPath("/p/abc123") === "/p/abc123", "a real same-origin path must survive the filter");
  ok(safeNativeTapPath("//evil.com") === null, "a protocol-relative path (//evil.com) must be rejected");
  ok(safeNativeTapPath("https://evil.com") === null, "a full off-origin URL (https://evil.com) must be rejected");
  ok(safeNativeTapPath("evil.com") === null, "a path with no leading slash must be rejected");
}

// 7. NativeShellInit's boot path (the useEffect that runs unconditionally on
// every native launch) never itself asks for permission — the prompt is
// contextual (PushPrompt), never at boot.
ok(!/requestPermissions\(|requestPushPermission\(/.test(client), "NativeShellInit's boot path never calls requestPermissions/requestPushPermission — permission is asked for in context, not at cold boot");

// 8. A token registered while signed out gets re-linked once a session
// exists — the token-never-re-linked-after-sign-in defect.
ok(/onAuthStateChange/.test(client), "NativeShellInit listens for auth state changes");
{
  const authBlock = (client.match(/onAuthStateChange\(([\s\S]*?)\n\s*\}\)\s*;/) || [""])[0];
  ok(authBlock.length > 40, "onAuthStateChange handler body was found");
  ok(/SIGNED_IN/.test(authBlock), "the re-link only fires on SIGNED_IN, not every auth event");
  ok(/\/api\/push\/register/.test(client) && /postPushRegister\(/.test(authBlock), "SIGNED_IN re-POSTs the known push token to /api/push/register with the fresh session");
}

console.log(`check-push-registration: OK — ${pass} assertions; native push now crosses a rate-limited Wayfind server boundary, only a service-role-only invoker function writes the locked table, listeners are added before register() is ever called, taps route through a same-origin path filter, and a sign-in re-links an already-registered token`);
