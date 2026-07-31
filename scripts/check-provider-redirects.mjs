#!/usr/bin/env node
// scripts/check-provider-redirects.mjs
//
// Verifies that every commerce redirect route emits provider_redirect_started
// or provider_redirect_failed server-side to PostHog. A redirect that does not
// leave a server-side event is invisible in the funnel — this guard catches that.
//
// v2 (2026-07-31): also verifies the click_id handoff. The client now mints
// click_id and stamps it onto /api/* redirect hrefs; the server must echo that
// exact id in provider_redirect_started/failed. A broken join makes the funnel
// untraceable even when events exist.
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

await testRoute("/api/ticketmaster/go", "../app/api/ticketmaster/go/route.js", () => ({
  url: "http://localhost:3000/api/ticketmaster/go?url=https://www.ticketmaster.com/event/123",
  headers: { get: () => null },
}));

// Sanity: commerce/go failure carries a reason.
const failed = captured.filter((b) => b.event === "provider_redirect_failed");
ok(failed.length >= 2, "at least two failure events captured (commerce + viator/eats missing params)");
for (const f of failed) {
  ok(f.properties?.failure_reason, `provider_redirect_failed has failure_reason: ${JSON.stringify(f.properties)}`);
}

// ── click_id handoff: client-minted ids must survive to the server event ─────
const CLIENT_CLICK_ID = "11111111-2222-3333-4444-555555555555";

async function testClickIdEcho(name, importPath, urlWithClickId) {
  const before = captured.length;
  const { GET } = await import(importPath);
  const res = await GET({ url: urlWithClickId, headers: { get: () => null } });
  ok(res.status >= 300 && res.status < 400, `${name} returns a redirect when click_id is supplied`);
  const events = captured.slice(before);
  const ev = events.find((b) => b.event === "provider_redirect_started" || b.event === "provider_redirect_failed");
  ok(ev, `${name} emitted a redirect event with click_id (got: ${events.map((b) => b.event).join(", ") || "none"})`);
  strictEqual(
    ev.properties?.click_id,
    CLIENT_CLICK_ID,
    `${name} echoes the client-supplied click_id in the server event (got: ${ev.properties?.click_id})`
  );
}

await testClickIdEcho(
  "/api/commerce/go",
  "../app/api/commerce/go/route.js",
  "http://localhost:3000/api/commerce/go?provider=unknown&offer=xyz&click_id=" + encodeURIComponent(CLIENT_CLICK_ID)
);

await testClickIdEcho(
  "/api/viator/go",
  "../app/api/viator/go/route.js",
  "http://localhost:3000/api/viator/go?click_id=" + encodeURIComponent(CLIENT_CLICK_ID)
);

await testClickIdEcho(
  "/api/eats/go",
  "../app/api/eats/go/route.js",
  "http://localhost:3000/api/eats/go?click_id=" + encodeURIComponent(CLIENT_CLICK_ID)
);

await testClickIdEcho(
  "/api/ticketmaster/go",
  "../app/api/ticketmaster/go/route.js",
  "http://localhost:3000/api/ticketmaster/go?url=https://www.ticketmaster.com/event/123&click_id=" + encodeURIComponent(CLIENT_CLICK_ID)
);

// When no click_id is supplied, the server must still mint one — never null.
const started = captured.filter((b) => b.event === "provider_redirect_started");
const failedWithClickId = captured.filter((b) => b.event === "provider_redirect_failed" && b.properties?.click_id);
ok(started.length + failedWithClickId.length > 0, "server events carry a click_id whether or not the client supplied one");
for (const ev of captured) {
  if (ev.event !== "provider_redirect_started" && ev.event !== "provider_redirect_failed") continue;
  ok(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(ev.properties?.click_id)),
    `${ev.event} carries a valid UUID click_id (got: ${ev.properties?.click_id})`
  );
}

console.log(`check-provider-redirects: OK — ${captured.length} server-side events captured across all redirect routes, click_id handoff verified`);
