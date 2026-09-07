import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { probeUrl, validateOutboundUrl } from "../lib/linkProbe.js";

let assertions = 0;
function equal(actual, expected, message) {
  assertions++;
  assert.equal(actual, expected, message);
}
function ok(value, message) {
  assertions++;
  assert.ok(value, message);
}

const PUBLIC_V4 = "93.184.216.34";
const PUBLIC_V6 = "2606:2800:220:1:248:1893:25c8:1946";
const dns = (records) => async () => records.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));

// URL parsing rejects dangerous forms before DNS or fetch is reached.
for (const candidate of [
  "file:///etc/passwd",
  "ftp://example.com/file",
  "https://user:secret@example.com/",
  "http://localhost/admin",
  "http://service.localhost/admin",
  "http://127.0.0.1/",
  "http://2130706433/",       // alternate IPv4 syntax, normalized by URL
  "http://0x7f000001/",      // hexadecimal IPv4
  "http://[::1]/",
  "http://[::ffff:127.0.0.1]/",
]) {
  let lookedUp = false;
  const verdict = await validateOutboundUrl(candidate, {
    lookupImpl: async () => { lookedUp = true; return [{ address: PUBLIC_V4, family: 4 }]; },
  });
  equal(verdict.ok, false, `${candidate} is rejected`);
  equal(lookedUp, false, `${candidate} is rejected before DNS`);
}

// Every non-public IPv4 class named in the policy is covered, while a public
// address is a negative control proving the policy is not a deny-all.
for (const address of [
  "0.0.0.0", "10.1.2.3", "100.64.0.1", "127.0.0.1", "169.254.169.254",
  "172.16.0.1", "192.0.0.1", "192.0.2.1", "192.168.1.1", "198.18.0.1",
  "198.51.100.1", "203.0.113.1", "224.0.0.1", "240.0.0.1", "255.255.255.255",
]) {
  const verdict = await validateOutboundUrl("https://venue.example/", { lookupImpl: dns([address]) });
  equal(verdict.ok, false, `DNS answer ${address} is rejected`);
}
equal((await validateOutboundUrl("https://venue.example/", { lookupImpl: dns([PUBLIC_V4]) })).ok, true, "public IPv4 DNS answer is allowed");

// IPv6 loopback, unspecified, mapped, translation, unique-local, link-local,
// deprecated site-local, multicast, documentation, and reserved ranges.
for (const address of [
  "::", "::1", "::7f00:1", "::ffff:7f00:1", "64:ff9b::7f00:1", "100::1",
  "2001::1", "2001:db8::1", "2002::1", "3fff::1", "5f00::1",
  "4000::1", "fc00::1", "fd12:3456::1", "fe80::1", "fec0::1", "ff02::1",
]) {
  const verdict = await validateOutboundUrl("https://venue.example/", { lookupImpl: dns([address]) });
  equal(verdict.ok, false, `DNS answer ${address} is rejected`);
}
equal((await validateOutboundUrl("https://venue.example/", { lookupImpl: dns([PUBLIC_V6]) })).ok, true, "public IPv6 DNS answer is allowed");

// If any DNS answer is private, fetch could choose it, so mixed answers fail.
equal((await validateOutboundUrl("https://venue.example/", { lookupImpl: dns([PUBLIC_V4, "10.0.0.8"]) })).ok, false, "mixed public/private DNS is rejected");

// A normal public fetch still reads content. The injected dependencies make
// this fully hermetic: no production DNS, network, cache, or database writes.
const normalCalls = [];
const normal = await probeUrl("https://venue.example/start", {
  lookupImpl: dns([PUBLIC_V4]),
  fetchImpl: async (url, init) => {
    normalCalls.push({ url, init });
    return new Response("<html><title>Venue</title><body>Welcome</body></html>", { status: 200 });
  },
});
equal(normal.status, 200, "public fetch succeeds");
ok(normal.html.includes("Welcome"), "public fetch reads the body");
equal(normalCalls.length, 1, "public fetch executes once");
equal(normalCalls[0].init.redirect, "manual", "automatic redirects are disabled");

// A public URL that redirects to a private DNS target must stop before the
// second fetch. This reproduces the redirect-to-private SSRF shape.
const redirectCalls = [];
const redirectDns = async (hostname) => hostname === "venue.example"
  ? [{ address: PUBLIC_V4, family: 4 }]
  : [{ address: "169.254.169.254", family: 4 }];
const blockedRedirect = await probeUrl("https://venue.example/start", {
  lookupImpl: redirectDns,
  fetchImpl: async (url, init) => {
    redirectCalls.push({ url, init });
    return new Response(null, { status: 302, headers: { location: "http://metadata.internal/latest" } });
  },
});
equal(blockedRedirect.status, 0, "redirect-to-private is blocked");
ok(blockedRedirect.error?.startsWith("blocked-url:"), "blocked redirect has a policy error");
equal(redirectCalls.length, 1, "private redirect target is never fetched");

// A public-to-public relative redirect remains functional and validates both
// hops independently.
const safeRedirectCalls = [];
const safeRedirect = await probeUrl("https://venue.example/start", {
  lookupImpl: dns([PUBLIC_V4]),
  fetchImpl: async (url) => {
    safeRedirectCalls.push(url);
    if (safeRedirectCalls.length === 1) return new Response(null, { status: 301, headers: { location: "/home" } });
    return new Response("<html><body>Official venue page</body></html>", { status: 200 });
  },
});
equal(safeRedirect.status, 200, "public redirect succeeds");
equal(safeRedirect.finalUrl, "https://venue.example/home", "relative redirect is resolved safely");
equal(safeRedirectCalls.length, 2, "both safe redirect hops are fetched");

// A historical cached "alive" row must not bypass the new policy. Lock the
// route ordering without importing Next's runtime or touching the database.
const routeSource = readFileSync(new URL("../app/api/outbound/verdict/route.js", import.meta.url), "utf8");
const routeValidation = routeSource.indexOf("const safe = await validateOutboundUrl(url)");
const cacheRead = routeSource.indexOf("// 1. cache");
ok(routeValidation >= 0 && cacheRead > routeValidation, "the route validates DNS before consulting cached verdicts");

console.log(`outbound-ssrf: OK — ${assertions} assertions; URL, DNS, and redirect policies executed hermetically`);
