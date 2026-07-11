// Gate: security headers present on the production build (July 2026 audit,
// Phase 2/9). Boots `next start` on a scratch port, fetches /, asserts the
// enforced header set + report-only CSP, and shuts down. Requires a prior
// `next build` (audit:regression runs it via test:e2e).
import { spawn } from "node:child_process";

const PORT = 3457;
const fail = (m) => { console.error("check-headers: FAIL — " + m); process.exit(1); };

const server = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: "ignore", detached: true });
const kill = () => { try { process.kill(-server.pid, "SIGTERM"); } catch {} };
process.on("exit", kill);

let res = null;
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 500));
  try { res = await fetch(`http://localhost:${PORT}/`, { redirect: "manual" }); break; } catch {}
}
if (!res) fail("server did not come up on :" + PORT);

const REQUIRED = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": /geolocation=\(self\)/,
  "strict-transport-security": /max-age=63072000; includeSubDomains/,
  "content-security-policy-report-only": /frame-ancestors 'self'.*report-uri \/api\/csp-report|report-uri \/api\/csp-report/,
};
for (const [name, want] of Object.entries(REQUIRED)) {
  const got = res.headers.get(name);
  if (!got) fail(`missing header: ${name}`);
  if (want instanceof RegExp ? !want.test(got) : got !== want) fail(`${name} = ${JSON.stringify(got)}, expected ${want}`);
}
if (res.headers.get("x-powered-by")) fail("x-powered-by must not be sent");

kill();
console.log("check-headers: OK — enforced set present, CSP report-only present, x-powered-by absent");
process.exit(0);
