// scripts/check-provider-redirects.mjs
//
// Verifies that every commerce redirect route emits provider_redirect_started
// or provider_redirect_failed server-side to PostHog. A redirect that does not
// leave a server-side event is invisible in the funnel — this guard catches that.
//
// Runs against the actual route modules (assert on the call, not the string).

import { ok, strictEqual } from "node:assert";

const captured = [];
const originalFetch = globalThis.fetch;

// Intercept PostHog capture calls. Let everything else through.
globalThis.fetch = async (url, init) => {
  if (String(url).includes("us.i.posthog.com/capture/")) {
    try {
      const body = JSON.parse(init?.body || "{}");
      captured.push(body);
    } catch {}
    return { ok: true, status: 200 };
  }
  return originalFetch(url, init);
};

// Force a public PostHog key so serverEvents.js does not early-return.
process.env.NEXT_PUBLIC_POSTHOG_KEY = "test-key-not-real";

async function testRoute(name, importPath, makeRequest) {
  const before = captured.length;
  const { GET } = await import(importPath);
  const res = await GET(makeRequest());
  ok(res.status >= 300 && res.status < 400, `${name} returns a redirect`);
  const events = captured.slice(before).map((b) => b.event);
  ok(
    events.includes("provider_redirect_started") || events.includes("provider_redirect_failed"),
    `${name} emits provider_redirect_started or provider_redirect_failed (got: ${events.join(", ") || "none"})`
  );
}

await testRoute("/api/commerce/go", "../app/api/commerce/go/route.js", () => ({
  url: "http://localhost:3000/api/commerce/go?provider=unknown&offer=xyz",
  headers: { get: () => null },
}));

await testRoute("/api/viator/go", "../app/api/viator/go/route.js", () => ({
  url: "http://localhost:3000/api/viator/go",
  headers: { get: () => null },
}));

await testRoute("/api/eats/go", "../app/api/eats/go/route.js", () => ({
  url: "http://localhost:3000/api/eats/go",
  headers: { get: () => null },
}));

// Sanity: commerce/go failure carries a reason.
const failed = captured.filter((b) => b.event === "provider_redirect_failed");
ok(failed.length >= 2, "at least two failure events captured (commerce + viator/eats missing params)");
for (const f of failed) {
  ok(f.properties?.failure_reason, `provider_redirect_failed has failure_reason: ${JSON.stringify(f.properties)}`);
}

console.log(`check-provider-redirects: OK — ${captured.length} server-side events captured across all redirect routes`);
