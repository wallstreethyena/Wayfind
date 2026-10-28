// Regression lock: public auth endpoints must never regain Admin API access.
// This test is hermetic: both handlers execute with fetch replaced by a thrower.
import { readFileSync } from "node:fs";
import { POST as signupPOST } from "../app/api/auth/signup/route.js";
import { POST as confirmPOST } from "../app/api/auth/confirm/route.js";

const ROOT = new URL("..", import.meta.url);
const routeUrls = [
  { url: new URL("app/api/auth/signup/route.js", ROOT), handler: signupPOST },
  { url: new URL("app/api/auth/confirm/route.js", ROOT), handler: confirmPOST },
];
const homeUrl = new URL("app/home.js", ROOT);
let failures = 0;
const ok = (condition, message) => {
  if (!condition) { console.error("test-auth-admin-tombstones: FAIL — " + message); failures += 1; }
};

function safeTombstone(source) {
  return /status:\s*410\b/.test(source)
    && !/\bprocess\.env\b/.test(source)
    && !/\bfetch\s*\(/.test(source)
    && !/auth\/v1\/admin|SUPABASE_SERVICE_ROLE_KEY|email_confirm/.test(source);
}

// Negative control: this is the retired endpoint's dangerous shape. The
// detector must reject it or the source assertions below would be meaningless.
const publicAdminRoute = 'const key = process.env.SUPABASE_SERVICE_ROLE_KEY; fetch("/auth/v1/admin/users", { body: "email_confirm" });';
ok(!safeTombstone(publicAdminRoute), "negative control: a public Admin route is rejected");

const savedFetch = globalThis.fetch;
let upstreamCalls = 0;
globalThis.fetch = async () => {
  upstreamCalls += 1;
  throw new Error("a tombstone must not call upstream");
};

try {
  for (const { url, handler } of routeUrls) {
    const source = readFileSync(url, "utf8");
    ok(safeTombstone(source), `${url.pathname} is a 410 tombstone with no Admin capability`);
    const response = await handler(new Request("https://wayfind.test" + url.pathname, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "victim@example.test", password: "attacker-password" }),
    }));
    const body = await response.json();
    ok(response.status === 410, `${url.pathname} returns 410`);
    ok(body && body.error === "retired", `${url.pathname} returns only the retired response`);
  }
  ok(upstreamCalls === 0, "tombstones made no upstream call");
} finally {
  globalThis.fetch = savedFetch;
}

const home = readFileSync(homeUrl, "utf8");
ok(!/fetch\(\s*["']\/api\/auth\/(?:signup|confirm)/.test(home), "client never calls retired Admin-auth routes");
ok(/supabase\.auth\.signUp\(\{\s*\.\.\.creds,\s*options:\s*\{\s*emailRedirectTo:\s*CANON_ORIGIN\s*}\s*}\)/s.test(home), "signup uses Supabase confirmation redirect");
ok(/supabase\.auth\.resend\(\{\s*type:\s*["']signup["']/.test(home), "unconfirmed sign-in uses Supabase resend");
const sessionBranch = home.indexOf("else if (res.data && res.data.session)");
const completion = home.indexOf('"signup_completed"');
// 2026-10-27: completion analytics moved to lib/authJourney.js, called from onAuthStateChange
// with a real SIGNED_IN session (scripts/test-auth-journey.mjs). home.js must not emit it
// itself, so the only remaining emission site is gated on a session by construction.
const journeySrc = readFileSync(new URL("../lib/authJourney.js", import.meta.url), "utf8");
ok(sessionBranch >= 0 && completion === -1 && /runAuthTransition\(/.test(home) && /event !== "SIGNED_IN"/.test(journeySrc) && /!user \|\| !user\.id/.test(journeySrc), "signup completion analytics occurs only after a real session");

if (failures) process.exit(1);
console.log("test-auth-admin-tombstones: OK — public Admin auth removed; Supabase confirmation flow retained");
