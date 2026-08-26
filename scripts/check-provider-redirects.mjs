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

// run-guards sets WF_SUPPRESS_ANALYTICS=1 for every guard it spawns, because
// guards that invoke redirect handlers were firing their fixtures into the
// PRODUCTION PostHog project during Vercel builds. THIS guard is the exception:
// its entire assertion is that the route DOES capture, so suppression would turn
// it into decoration that passes while proving nothing.
//
// Opting out is safe here and only here, because the fetch stub above intercepts
// us.i.posthog.com/capture/ and returns a fake 200 — no request can leave this
// process regardless of the flag. That interception is a STRONGER protection
// than suppression: it also lets the payload be inspected.
// check-guards-emit-no-analytics accepts either protection and enforces that a
// route-invoking guard has at least one.
delete process.env.WF_SUPPRESS_ANALYTICS;

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

// /api/eats/go was deleted 2026-08-26 with Uber Eats (owner directive).
await testRoute("/api/ticketmaster/go", "../app/api/ticketmaster/go/route.js", () => ({
  url: "http://localhost:3000/api/ticketmaster/go?url=https://www.ticketmaster.com/event/123",
  headers: { get: () => null },
}));

// No UA on the request → capture must omit $raw_user_agent. Inventing a
// browser UA would make every bot-looking event look human; omitting is the
// correct empty. Existing fixtures above use `get: () => null`.
const noUaCaptured = captured.slice();
ok(noUaCaptured.length > 0, "PROBE BROKEN: expected captures from the no-UA fixtures before asserting absence");
for (const ev of noUaCaptured) {
  ok(
    !Object.prototype.hasOwnProperty.call(ev.properties || {}, "$raw_user_agent"),
    `${ev.event} with no request UA must omit $raw_user_agent (got: ${ev.properties?.$raw_user_agent})`
  );
  ok(
    !Object.prototype.hasOwnProperty.call(ev.properties || {}, "$virt_is_bot"),
    `${ev.event} must never set $virt_is_bot (PostHog computes it)`
  );
  strictEqual(ev.properties?.$lib, "wayfind-server", `${ev.event} keeps $lib=wayfind-server`);
}

// Sanity: commerce/go failure carries a reason.
const failed = captured.filter((b) => b.event === "provider_redirect_failed");
ok(failed.length >= 2, "at least two failure events captured (commerce + viator missing params)");
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

function headersFrom(map) {
  const norm = Object.fromEntries(
    Object.entries(map).map(([k, v]) => [String(k).toLowerCase(), v])
  );
  return {
    get(name) {
      if (name == null) return null;
      const v = norm[String(name).toLowerCase()];
      return v === undefined ? null : v;
    },
  };
}

// Visitor identity: a real Chrome UA must land on $raw_user_agent exactly,
// $lib stays wayfind-server, and we never invent $virt_is_bot. Asserted on
// the capture BODY (the call), not on source strings. Each route is invoked
// so a forgotten `headers: req.headers` cannot hide behind commerce/go.
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const UA_FIXTURES = [
  ["/api/commerce/go", "../app/api/commerce/go/route.js", "http://localhost:3000/api/commerce/go?provider=unknown&offer=xyz"],
  ["/api/viator/go", "../app/api/viator/go/route.js", "http://localhost:3000/api/viator/go"],
  ["/api/ticketmaster/go", "../app/api/ticketmaster/go/route.js", "http://localhost:3000/api/ticketmaster/go?url=https://www.ticketmaster.com/event/123"],
];

for (const [name, importPath, url] of UA_FIXTURES) {
  const before = captured.length;
  const { GET } = await import(importPath);
  const res = await GET({ url, headers: headersFrom({ "user-agent": CHROME_UA }) });
  ok(res.status >= 300 && res.status < 400, `${name} (chrome UA) returns a redirect`);
  const ev = captured.slice(before).find((b) =>
    b.event === "provider_redirect_started" || b.event === "provider_redirect_failed"
  );
  ok(ev, `${name} (chrome UA) emitted a redirect event`);
  strictEqual(
    ev.properties?.$raw_user_agent,
    CHROME_UA,
    `${name} forwards the visitor User-Agent as $raw_user_agent`
  );
  strictEqual(ev.properties?.$lib, "wayfind-server", `${name} keeps $lib=wayfind-server`);
  ok(
    !Object.prototype.hasOwnProperty.call(ev.properties || {}, "$virt_is_bot"),
    `${name} must not set $virt_is_bot (PostHog computes it from $raw_user_agent)`
  );
}

{
  const before = captured.length;
  const { GET } = await import("../app/api/commerce/go/route.js");
  const res = await GET({
    url: "http://localhost:3000/api/commerce/go?provider=unknown&offer=xyz",
    headers: headersFrom({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }),
  });
  ok(res.status >= 300 && res.status < 400, "/api/commerce/go (xff) returns a redirect");
  const ev = captured.slice(before).find((b) =>
    b.event === "provider_redirect_started" || b.event === "provider_redirect_failed"
  );
  ok(ev, "/api/commerce/go (xff) emitted a redirect event");
  strictEqual(ev.properties?.$ip, "203.0.113.9", "$ip is the first x-forwarded-for hop only");
  ok(
    !Object.prototype.hasOwnProperty.call(ev.properties || {}, "$raw_user_agent"),
    "xff-only fixture must omit $raw_user_agent (no UA on the request)"
  );
}

console.log(`check-provider-redirects: OK — ${captured.length} server-side events captured across all redirect routes, click_id handoff + visitor UA/IP verified`);
