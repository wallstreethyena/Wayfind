// scripts/test-account-delete.mjs — regression lock for in-app account
// deletion (Apple guideline 5.1.1(v)): app/api/account/delete/route.js,
// lib/appleAuth.js, and the client wiring in Account.js / home.js /
// privacy/page.js / AppleSignInPlugin.swift. Hermetic: no real network, no
// real Supabase or Apple project. globalThis.fetch is stubbed for the whole
// run and every call is recorded so ordering and "never called" claims are
// checked against actual calls, not the source text. Owner: Gabe, 2026-09-23.
import { readFileSync } from "node:fs";
import { generateKeyPairSync, createPublicKey, verify as cryptoVerify } from "node:crypto";

const ROOT = new URL("..", import.meta.url);
let failures = 0;
let assertions = 0;
const ok = (condition, message) => {
  assertions += 1;
  if (!condition) { console.error("test-account-delete: FAIL — " + message); failures += 1; }
};

// ---------------------------------------------------------------------------
// Fixed test environment. A UUID that satisfies the route's own UUID regex
// (version nibble "4", variant nibble in [89ab]) so identity verification
// gets past its own shape check.
// ---------------------------------------------------------------------------
const FAKE_SUPABASE_URL = "https://fake-project.supabase.test";
const SERVICE_KEY = "service_role_test_key";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const USER_EMAIL = "victim@example.test";

process.env.SUPABASE_URL = FAKE_SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.APPLE_TEAM_ID;
delete process.env.APPLE_SIWA_KEY_ID;
delete process.env.APPLE_SIWA_PRIVATE_KEY;
delete process.env.APPLE_SIWA_CLIENT_ID;

const { POST } = await import(new URL("app/api/account/delete/route.js", ROOT));
const appleAuth = await import(new URL("lib/appleAuth.js", ROOT));

// ---------------------------------------------------------------------------
// Mock fetch. One dispatcher covering every URL the route or lib/appleAuth.js
// can call, driven by a mutable `scenario` object each test sets before
// calling POST. Every call is pushed to `calls` (url, method) so tests can
// assert both order and "this was never called".
// ---------------------------------------------------------------------------
let calls = [];
let scenario = {};
function resetCalls() { calls = []; }
function resetScenario() {
  scenario = {
    authUserStatus: 200,
    authUserBody: { id: USER_ID, email: USER_EMAIL, identities: [], app_metadata: { providers: ["email"] } },
    userMediaRows: [],
    commentPhotoNames: [],
    restStatus: 200, // wf_feedback / wf_taste / wf_city_requests / email tables / push tokens
    storageDeleteStatus: 200,
    adminDeleteStatus: 200,
    appleTokenBehavior: "ok", // "ok" | "throw" | "fail"
    appleRevokeBehavior: "ok",
  };
}
resetScenario();

async function mockFetch(url, opts) {
  const method = (opts && opts.method) || "GET";
  calls.push({ url: String(url), method });
  const u = String(url);

  if (u.endsWith("/auth/v1/user")) {
    return jsonResponse(scenario.authUserStatus, scenario.authUserBody);
  }
  if (u.includes("/rest/v1/wf_user_media?select=")) {
    return jsonResponse(200, scenario.userMediaRows);
  }
  if (u.includes("/storage/v1/object/list/comment-photos")) {
    return jsonResponse(200, scenario.commentPhotoNames.map((name) => ({ name })));
  }
  if (u.endsWith("/storage/v1/object/user-media") || u.endsWith("/storage/v1/object/comment-photos")) {
    return jsonResponse(scenario.storageDeleteStatus, {});
  }
  if (u.includes("/rest/v1/wf_feedback") || u.includes("/rest/v1/wf_taste") || u.includes("/rest/v1/wf_city_requests")
    || u.includes("/rest/v1/wf_email_signups") || u.includes("/rest/v1/wf_waitlist") || u.includes("/rest/v1/wf_giveaway_entries")
    || u.includes("/rest/v1/device_push_tokens")) {
    return jsonResponse(scenario.restStatus, {});
  }
  if (u.includes("/auth/v1/admin/users/")) {
    return jsonResponse(scenario.adminDeleteStatus, {});
  }
  if (u.includes("/rest/v1/wf_job_pulse")) {
    return jsonResponse(200, {});
  }
  if (u === "https://appleid.apple.com/auth/token") {
    if (scenario.appleTokenBehavior === "throw") throw new Error("network down");
    if (scenario.appleTokenBehavior === "fail") return jsonResponse(400, { error: "invalid_grant" });
    return jsonResponse(200, { refresh_token: "rt_test_token", access_token: "at_test_token" });
  }
  if (u === "https://appleid.apple.com/auth/revoke") {
    if (scenario.appleRevokeBehavior === "throw") throw new Error("network down");
    if (scenario.appleRevokeBehavior === "fail") return jsonResponse(400, { error: "invalid_token" });
    return jsonResponse(200, {});
  }
  throw new Error("mockFetch: unexpected URL " + u + " " + method);
}
function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

const realFetch = globalThis.fetch;
globalThis.fetch = mockFetch;

function req({ ip, bearer = "usertoken", confirm = "delete", deviceId, appleAuthorizationCode, noAuthHeader = false, noConfirm = false }) {
  const headers = { "content-type": "application/json", "x-forwarded-for": ip };
  if (!noAuthHeader) headers.authorization = "Bearer " + bearer;
  const body = {};
  if (!noConfirm) body.confirm = confirm;
  if (deviceId) body.deviceId = deviceId;
  if (appleAuthorizationCode) body.appleAuthorizationCode = appleAuthorizationCode;
  return new Request("https://wayfind.test/api/account/delete", { method: "POST", headers, body: JSON.stringify(body) });
}

// ---------------------------------------------------------------------------
// Order-checking helper, unit-tested against itself first (red proof: it
// must reject a deliberately corrupted call order, not just accept whatever
// it is handed).
// ---------------------------------------------------------------------------
function firstIndex(list, pred) { return list.findIndex(pred); }
function cleanupBeforeAdmin(callList) {
  const admin = firstIndex(callList, (c) => c.url.includes("/auth/v1/admin/users/") && c.method === "DELETE");
  if (admin < 0) return false;
  const cleanupPreds = [
    (c) => c.url.includes("/rest/v1/wf_user_media?select="),
    (c) => c.url.includes("/rest/v1/wf_feedback") && c.method === "DELETE",
    (c) => c.url.includes("/rest/v1/wf_taste") && c.method === "DELETE",
    (c) => c.url.includes("/rest/v1/wf_city_requests") && c.method === "PATCH",
    (c) => c.url.includes("/rest/v1/wf_email_signups") && c.method === "DELETE",
    (c) => c.url.includes("/rest/v1/device_push_tokens") && c.method === "DELETE",
  ];
  return cleanupPreds.every((pred) => {
    const idx = firstIndex(callList, pred);
    return idx >= 0 && idx < admin;
  });
}
// Red proof: a call list where the admin delete happens FIRST must be
// rejected, or this helper (and therefore every ordering assertion below
// that depends on it) is decoration.
const corruptedOrder = [
  { url: FAKE_SUPABASE_URL + "/auth/v1/admin/users/" + USER_ID, method: "DELETE" },
  { url: FAKE_SUPABASE_URL + "/rest/v1/wf_feedback?user_id=eq." + USER_ID, method: "DELETE" },
];
ok(cleanupBeforeAdmin(corruptedOrder) === false, "red proof: cleanupBeforeAdmin rejects admin-delete-first ordering");

// ---------------------------------------------------------------------------
// 1. 503 when unconfigured
// ---------------------------------------------------------------------------
{
  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  resetCalls();
  const res = await POST(req({ ip: "10.0.0.1" }));
  ok(res.status === 503, "unconfigured env returns 503, got " + res.status);
  ok(calls.length === 0, "unconfigured env makes no upstream call");
  process.env.SUPABASE_URL = FAKE_SUPABASE_URL; // restore the fixture value this guard set itself (hermetic: never re-read from the shell)
}

// ---------------------------------------------------------------------------
// 2. 400 without confirm
// ---------------------------------------------------------------------------
{
  resetCalls();
  const res = await POST(req({ ip: "10.0.0.2", noConfirm: true }));
  const body = await res.json();
  ok(res.status === 400, "missing confirm returns 400, got " + res.status);
  ok(body.ok === false, "missing confirm body has ok:false");
  ok(calls.length === 0, "missing confirm makes no upstream call");

  resetCalls();
  const res2 = await POST(req({ ip: "10.0.0.2b", confirm: "yes please" }));
  ok(res2.status === 400, "wrong confirm value returns 400, got " + res2.status);
  ok(calls.length === 0, "wrong confirm value makes no upstream call");
}

// ---------------------------------------------------------------------------
// 3. 401 without bearer
// ---------------------------------------------------------------------------
{
  resetCalls();
  const res = await POST(req({ ip: "10.0.0.3", noAuthHeader: true }));
  ok(res.status === 401, "missing bearer returns 401, got " + res.status);
  ok(calls.length === 0, "missing bearer makes no upstream call");
}

// ---------------------------------------------------------------------------
// 4. 401 when /auth/v1/user returns 401, admin delete NEVER called
// ---------------------------------------------------------------------------
{
  resetScenario();
  scenario.authUserStatus = 401;
  scenario.authUserBody = { error: "invalid_token" };
  resetCalls();
  const res = await POST(req({ ip: "10.0.0.4", bearer: "garbage" }));
  ok(res.status === 401, "invalid session returns 401, got " + res.status);
  const adminCalled = calls.some((c) => c.url.includes("/auth/v1/admin/users/"));
  ok(adminCalled === false, "invalid session never reaches the Admin delete call");
  ok(calls.length === 1 && calls[0].url.endsWith("/auth/v1/user"), "invalid session makes exactly one upstream call (the identity check)");
}

// ---------------------------------------------------------------------------
// 5. Happy path: call order, cleaned map, response shape, no PII in body
// ---------------------------------------------------------------------------
{
  resetScenario();
  scenario.userMediaRows = [{ storage_path: "u1/a.jpg", thumbnail_path: "u1/a_thumb.jpg" }];
  scenario.commentPhotoNames = ["ChIJfood-1785600735564-ia8371.jpeg"];
  resetCalls();
  const res = await POST(req({ ip: "10.0.0.5", deviceId: "dev-abc123" }));
  const raw = await res.text();
  const body = JSON.parse(raw);

  ok(res.status === 200, "happy path returns 200, got " + res.status);
  ok(body.ok === true, "happy path body has ok:true");
  ok(body.revoked && body.revoked.apple === "skipped_not_apple", "non Apple account reports apple:skipped_not_apple, got " + (body.revoked && body.revoked.apple));
  ok(body.cleaned && body.cleaned.wf_feedback === "ok", "cleaned.wf_feedback === ok");
  ok(body.cleaned && body.cleaned.wf_taste === "ok", "cleaned.wf_taste === ok");
  ok(body.cleaned && body.cleaned.wf_city_requests === "ok", "cleaned.wf_city_requests === ok");
  ok(body.cleaned && String(body.cleaned.storage_user_media).startsWith("deleted:"), "cleaned.storage_user_media reports a deletion, got " + (body.cleaned && body.cleaned.storage_user_media));
  ok(body.cleaned && String(body.cleaned.storage_comment_photos).startsWith("deleted:"), "cleaned.storage_comment_photos reports a deletion, got " + (body.cleaned && body.cleaned.storage_comment_photos));
  ok(body.cleaned && body.cleaned.device_push_tokens === "ok", "cleaned.device_push_tokens === ok when a deviceId was supplied");

  ok(cleanupBeforeAdmin(calls), "every cleanup step's first call happens before the Admin user delete");
  const adminIdx = firstIndex(calls, (c) => c.url.includes("/auth/v1/admin/users/") && c.method === "DELETE");
  const lastCleanupIdx = Math.max(
    firstIndex(calls, (c) => c.url.includes("/rest/v1/device_push_tokens") && c.method === "DELETE"),
    firstIndex(calls, (c) => c.url.includes("/rest/v1/wf_giveaway_entries") && c.method === "DELETE")
  );
  ok(adminIdx > lastCleanupIdx, "Admin delete is strictly the last of the ordered cleanup steps");

  ok(!raw.includes(USER_EMAIL), "response body never contains the user's email");
  ok(!raw.includes("usertoken"), "response body never contains the bearer token");
}

// ---------------------------------------------------------------------------
// 5b. Email-keyed marketing table matching cannot be wildcarded. PostgREST's
// `ilike`/`like` operators treat `_`, `%` and (via PostgREST's own alias) `*`
// as wildcards — an email containing any of those (underscore is common)
// could match more rows than itself under the old ilike-based query. The
// fix is PostgREST `in.()` with each value double-quoted: every character is
// read as a LITERAL, never a pattern.
// ---------------------------------------------------------------------------
{
  resetScenario();
  const wildcardEmail = "vic%tim_star*@example.test";
  scenario.authUserBody = { id: USER_ID, email: wildcardEmail, identities: [], app_metadata: { providers: ["email"] } };
  resetCalls();
  const res = await POST(req({ ip: "10.0.0.5b" }));
  ok(res.status === 200, "an email containing %, _ and * still deletes successfully, got " + res.status);

  const emailCall = calls.find((c) => c.url.includes("/rest/v1/wf_email_signups") && c.method === "DELETE");
  ok(!!emailCall, "the email-keyed cleanup step is actually called");
  ok(!/ilike/i.test(emailCall.url), "the email-keyed cleanup query no longer uses ilike anywhere");
  ok(emailCall.url.includes("email=in.("), "the email-keyed cleanup query uses PostgREST's in.() literal-list operator");

  const inList = decodeURIComponent(emailCall.url.split("email=in.(")[1].split(")")[0]);
  ok(inList === `"${wildcardEmail}"`, `the in.() list carries the email as ONE double-quoted literal, byte for byte, got: ${inList}`);
  // RED PROOF: an unescaped double quote or backslash INSIDE the value could
  // break out of pgQuote's own quoting and split or extend the list — prove
  // that shape is rejected by round-tripping one.
  scenario.authUserBody = { id: USER_ID, email: 'break"out\\@example.test', identities: [], app_metadata: { providers: ["email"] } };
  resetCalls();
  const res2 = await POST(req({ ip: "10.0.0.5b2" }));
  ok(res2.status === 200, "an email containing a literal quote and backslash still deletes successfully, got " + res2.status);
  const emailCall2 = calls.find((c) => c.url.includes("/rest/v1/wf_email_signups") && c.method === "DELETE");
  const inList2 = decodeURIComponent(emailCall2.url.split("email=in.(")[1].split(")")[0]);
  ok(inList2 === '"break\\"out\\\\@example.test"', `RED PROOF: the quote and backslash inside the email are escaped, not left to break out of the literal, got: ${inList2}`);

  // Mixed case: BOTH the exact and the lower-cased form are matched, still as
  // two literals, never as a case-insensitive pattern.
  scenario.authUserBody = { id: USER_ID, email: "Mixed.Case@Example.Test", identities: [], app_metadata: { providers: ["email"] } };
  resetCalls();
  const res3 = await POST(req({ ip: "10.0.0.5b3" }));
  ok(res3.status === 200, "a mixed-case email still deletes successfully, got " + res3.status);
  const emailCall3 = calls.find((c) => c.url.includes("/rest/v1/wf_email_signups") && c.method === "DELETE");
  const inList3 = decodeURIComponent(emailCall3.url.split("email=in.(")[1].split(")")[0]);
  ok(inList3 === '"Mixed.Case@Example.Test","mixed.case@example.test"', `mixed case sends both the exact and lower-cased literal, got: ${inList3}`);
}

// ---------------------------------------------------------------------------
// 6. Deletion still completes (200) when a cleanup step returns 500
// ---------------------------------------------------------------------------
{
  resetScenario();
  scenario.restStatus = 500;
  resetCalls();
  const res = await POST(req({ ip: "10.0.0.6" }));
  const body = await res.json();
  ok(res.status === 200, "a failed cleanup step still results in 200, got " + res.status);
  ok(body.ok === true, "a failed cleanup step still results in ok:true");
  ok(body.cleaned && body.cleaned.wf_feedback === "failed", "the failed step is reported as failed in cleaned, got " + (body.cleaned && body.cleaned.wf_feedback));
  const adminCalled = calls.some((c) => c.url.includes("/auth/v1/admin/users/") && c.method === "DELETE");
  ok(adminCalled === true, "a failed cleanup step does not stop the Admin delete from being attempted");
}

// ---------------------------------------------------------------------------
// 7. Deletion still completes (200) when Apple revoke throws
// ---------------------------------------------------------------------------
const { privateKeyPem: TEST_PRIVATE_PEM, publicKeyPem: TEST_PUBLIC_PEM } = (() => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return { privateKeyPem: privateKey, publicKeyPem: publicKey };
})();
{
  process.env.APPLE_TEAM_ID = "TEAM123456";
  process.env.APPLE_SIWA_KEY_ID = "KEYID12345";
  // Simulate the common "PEM stored with literal \n escapes" env-var shape.
  process.env.APPLE_SIWA_PRIVATE_KEY = TEST_PRIVATE_PEM.split("\n").join("\\n");
  process.env.APPLE_SIWA_CLIENT_ID = "com.gowayfind.app";

  resetScenario();
  scenario.authUserBody = { id: USER_ID, email: USER_EMAIL, identities: [{ provider: "apple" }], app_metadata: { providers: ["apple"] } };
  scenario.appleTokenBehavior = "throw";
  resetCalls();
  const res = await POST(req({ ip: "10.0.0.7", appleAuthorizationCode: "one-time-code" }));
  const body = await res.json();
  ok(res.status === 200, "Apple revoke throwing still results in 200, got " + res.status);
  ok(body.ok === true, "Apple revoke throwing still results in ok:true");
  ok(body.revoked && body.revoked.apple === "failed", "Apple revoke throwing is reported as apple:failed, got " + (body.revoked && body.revoked.apple));
  const adminCalled = calls.some((c) => c.url.includes("/auth/v1/admin/users/") && c.method === "DELETE");
  ok(adminCalled === true, "Apple revoke throwing does not stop the Admin delete from being attempted");

  delete process.env.APPLE_TEAM_ID;
  delete process.env.APPLE_SIWA_KEY_ID;
  delete process.env.APPLE_SIWA_PRIVATE_KEY;
  delete process.env.APPLE_SIWA_CLIENT_ID;
}

// ---------------------------------------------------------------------------
// 8. appleAuth never called when APPLE_* env is unset -> apple:"skipped_unconfigured"
// ---------------------------------------------------------------------------
{
  delete process.env.APPLE_TEAM_ID;
  delete process.env.APPLE_SIWA_KEY_ID;
  delete process.env.APPLE_SIWA_PRIVATE_KEY;
  resetScenario();
  scenario.authUserBody = { id: USER_ID, email: USER_EMAIL, identities: [{ provider: "apple" }], app_metadata: { providers: ["apple"] } };
  resetCalls();
  const res = await POST(req({ ip: "10.0.0.8", appleAuthorizationCode: "one-time-code" }));
  const body = await res.json();
  ok(res.status === 200, "unconfigured Apple env still results in 200, got " + res.status);
  ok(body.revoked && body.revoked.apple === "skipped_unconfigured", "unconfigured Apple env reports apple:skipped_unconfigured, got " + (body.revoked && body.revoked.apple));
  const appleCalled = calls.some((c) => c.url.startsWith("https://appleid.apple.com/"));
  ok(appleCalled === false, "unconfigured Apple env never calls appleid.apple.com");
}

// ---------------------------------------------------------------------------
// 9. Admin delete failure -> 502 ok:false
// ---------------------------------------------------------------------------
{
  resetScenario();
  scenario.adminDeleteStatus = 500;
  resetCalls();
  const res = await POST(req({ ip: "10.0.0.9" }));
  const body = await res.json();
  ok(res.status === 502, "Admin delete failure returns 502, got " + res.status);
  ok(body.ok === false, "Admin delete failure body has ok:false");
  ok(body.error === "delete_failed", 'Admin delete failure body has error:"delete_failed", got ' + body.error);
}

// ---------------------------------------------------------------------------
// 10. Rate limit: 6th request from the same IP within the window is refused
// ---------------------------------------------------------------------------
{
  resetScenario();
  const ip = "10.0.0.10-shared";
  let lastStatus = 0;
  for (let i = 0; i < 6; i++) {
    const res = await POST(req({ ip, bearer: "rl" + i }));
    lastStatus = res.status;
  }
  ok(lastStatus === 429, "6th request in an hour from one IP is rate limited, got " + lastStatus);
}

globalThis.fetch = realFetch;

// ---------------------------------------------------------------------------
// lib/appleAuth.js — JWT shape + signature, using a key generated at runtime
// (never a literal PEM header string in this file).
// ---------------------------------------------------------------------------
{
  process.env.APPLE_TEAM_ID = "TEAM999999";
  process.env.APPLE_SIWA_KEY_ID = "KEY9988776";
  process.env.APPLE_SIWA_PRIVATE_KEY = TEST_PRIVATE_PEM.split("\n").join("\\n");
  process.env.APPLE_SIWA_CLIENT_ID = "com.gowayfind.app";

  ok(appleAuth.appleConfigured() === true, "appleConfigured() is true once all three env vars parse");

  const secret = appleAuth.appleClientSecret();
  const parts = secret.split(".");
  ok(parts.length === 3, "client secret is a 3 part JWT, got " + parts.length + " parts");
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  ok(header.alg === "ES256", "JWT header alg is ES256, got " + header.alg);
  ok(header.kid === "KEY9988776", "JWT header kid matches APPLE_SIWA_KEY_ID, got " + header.kid);
  ok(payload.iss === "TEAM999999", "JWT payload iss matches APPLE_TEAM_ID, got " + payload.iss);
  ok(payload.aud === "https://appleid.apple.com", "JWT payload aud is Apple's token endpoint, got " + payload.aud);
  ok(payload.sub === "com.gowayfind.app", "JWT payload sub is the client id, got " + payload.sub);
  ok(typeof payload.exp === "number" && payload.exp - payload.iat <= 300, "JWT exp is at most 5 minutes past iat");

  const signature = Buffer.from(parts[2], "base64url");
  const signingInput = Buffer.from(parts[0] + "." + parts[1]);
  const verified = cryptoVerify("sha256", signingInput, { key: createPublicKey(TEST_PUBLIC_PEM), dsaEncoding: "ieee-p1363" }, signature);
  ok(verified === true, "JWT signature verifies against the matching public key with ieee-p1363 encoding");

  // Red proof: a signature over the WRONG signing input must fail
  // verification, or the check above is not actually checking anything.
  const wrongInput = Buffer.from(parts[0] + "." + parts[1] + "tampered");
  const wrongVerified = cryptoVerify("sha256", wrongInput, { key: createPublicKey(TEST_PUBLIC_PEM), dsaEncoding: "ieee-p1363" }, signature);
  ok(wrongVerified === false, "red proof: signature verification rejects a tampered signing input");

  // appleConfigured() is false once any one credential is missing.
  delete process.env.APPLE_SIWA_KEY_ID;
  ok(appleAuth.appleConfigured() === false, "appleConfigured() is false when APPLE_SIWA_KEY_ID is missing");
  process.env.APPLE_SIWA_KEY_ID = "KEY9988776";

  // exchangeCode / revokeToken with an injected fetch — never the real network.
  let appleCalls = [];
  const fetchImpl = async (url, opts) => {
    appleCalls.push({ url: String(url), method: (opts && opts.method) || "GET" });
    if (String(url) === "https://appleid.apple.com/auth/token") {
      return { ok: true, json: async () => ({ refresh_token: "rt_1", access_token: "at_1" }) };
    }
    if (String(url) === "https://appleid.apple.com/auth/revoke") {
      return { ok: true, json: async () => ({}) };
    }
    throw new Error("unexpected URL in appleAuth test: " + url);
  };
  const tokens = await appleAuth.exchangeCode("code123", { fetchImpl });
  ok(tokens.refresh_token === "rt_1", "exchangeCode returns the refresh token from the injected fetch");
  await appleAuth.revokeToken(tokens.refresh_token, "refresh_token", { fetchImpl });
  ok(appleCalls.some((c) => c.url === "https://appleid.apple.com/auth/revoke"), "revokeToken calls Apple's revoke endpoint");
  ok(appleCalls.every((c) => c.url.startsWith("https://appleid.apple.com/")), "appleAuth only ever calls appleid.apple.com");

  let threw = false;
  try { await appleAuth.exchangeCode("", { fetchImpl }); } catch { threw = true; }
  ok(threw === true, "exchangeCode throws on a missing authorization code rather than calling Apple");

  delete process.env.APPLE_TEAM_ID;
  delete process.env.APPLE_SIWA_KEY_ID;
  delete process.env.APPLE_SIWA_PRIVATE_KEY;
  delete process.env.APPLE_SIWA_CLIENT_ID;
}

// ---------------------------------------------------------------------------
// No secret literals in this file itself (guards common-rules.md's rule).
// ---------------------------------------------------------------------------
{
  const selfSource = readFileSync(new URL(import.meta.url), "utf8");
  ok(!/BEGIN (EC )?PRIVATE KEY/.test(selfSource), "this test file contains no literal private key PEM");
}

// ---------------------------------------------------------------------------
// Source checks — client wiring. Positioned assertions (a call/assignment
// shape, not a bare substring), each with a negative control proving the
// regex actually discriminates.
// ---------------------------------------------------------------------------
{
  const accountSrc = readFileSync(new URL("app/components/sheets/Account.js", ROOT), "utf8");
  ok(accountSrc.includes("Delete account"), "Account.js shows a \"Delete account\" affordance");
  ok(accountSrc.includes("Type delete to confirm"), "Account.js shows the \"Type delete to confirm\" label");
  ok(/deleteAccountUser\s*\(\s*\)/.test(accountSrc), "Account.js calls deleteAccountUser() as a function call");
  ok(!/deleteAccountUser\s*\(\s*\)/.test("const deleteAccountUser = ctx.deleteAccountUser;"), "negative control: a mere reference (no call) does not match the call regex");

  const homeSrc = readFileSync(new URL("app/home.js", ROOT), "utf8");
  ok(/\bsignOutUser,\s*deleteAccountUser,\s*lists,/.test(homeSrc), "home.js passes deleteAccountUser into ctx next to signOutUser");
  ok(/import\(["']\.\.\/lib\/accountDelete\.js["']\)/.test(homeSrc), "home.js lazily imports lib/accountDelete.js (not a static top level import)");
  ok(!/^import .* from ["']\.\.\/lib\/accountDelete\.js["']/m.test(homeSrc), "lib/accountDelete.js is never statically imported into home.js (bundle size)");
  ok(/window\.__wfPushToken/.test(homeSrc), "wfShowDiag reads window.__wfPushToken");

  const privacySrc = readFileSync(new URL("app/privacy/page.js", ROOT), "utf8");
  ok(privacySrc.includes("Delete account"), "privacy page mentions the in app Delete account control");
  ok(!privacySrc.includes("Deletion removes your account, saved places, and tips from our systems."), "privacy page no longer describes deletion as an email only process");

  const swiftSrc = readFileSync(new URL("ios/App/App/AppleSignInPlugin.swift", ROOT), "utf8");
  ok(/result\s*\[\s*"authorizationCode"\s*\]\s*=\s*code/.test(swiftSrc), "AppleSignInPlugin.swift assigns authorizationCode onto the resolved result");
  ok(!/result\s*\[\s*"authorizationCode"\s*\]\s*=\s*code/.test('// result["authorizationCode"] discussed but not assigned'), "negative control: a comment mentioning the key does not match the assignment regex");
}

// ---------------------------------------------------------------------------
// lib/accountDelete.js — cancelling the native Apple sheet must ABORT
// deletion. STRUCTURAL, NOT EXECUTED: isNative() reads navigator.userAgent /
// Capacitor.isNativePlatform(), and nativeAppleCredential() calls a
// registerPlugin("AppleSignIn") bridge method — neither has a real
// implementation off-device, and this file has no seam to inject a stub for
// a plain `import("./native")` (no dependency-injection parameter on
// deleteAccount() for it). A position-based read of the source is the
// honest substitute: it proves the isAppleCancel() check sits INSIDE the
// nativeAppleCredential() catch block, and that its return happens BEFORE
// the fetch("/api/account/delete") call, i.e. an abort here can never fall
// through to the server request. Live behavior is exercised on-device per
// docs/ios-app-store-handoff.md, same as the other STRUCTURAL-ONLY reads in
// scripts/check-ios-shell-wiring.mjs.
{
  const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // Skips PAST the function's own parameter list before looking for its body
  // brace — deleteAccount({ supabase, user, deviceId }) destructures its one
  // argument, so the first "{" after the function keyword is the PARAMETER's
  // brace, not the body's. Parenthesis-depth-matching the "(...)" first (when
  // one is present right after startIdx) avoids picking that up.
  function jsFunctionBody(src, startIdx) {
    let i = startIdx;
    const parenStart = src.indexOf("(", startIdx);
    if (parenStart >= 0 && parenStart < src.indexOf("{", startIdx)) {
      let pdepth = 0;
      for (let j = parenStart; j < src.length; j++) {
        if (src[j] === "(") pdepth++;
        else if (src[j] === ")") { pdepth--; if (pdepth === 0) { i = j + 1; break; } }
      }
    }
    const braceStart = src.indexOf("{", i);
    if (braceStart === -1) return null;
    let depth = 0;
    for (let j = braceStart; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") { depth--; if (depth === 0) return src.slice(braceStart + 1, j); }
    }
    return null;
  }

  const src = stripJs(readFileSync(new URL("lib/accountDelete.js", ROOT), "utf8"));

  // isAppleCancel(): the exact two conditions the task specifies, as a real
  // boolean expression (not merely the strings appearing somewhere).
  const cancelFnStart = src.search(/function\s+isAppleCancel\s*\(/);
  ok(cancelFnStart >= 0, "lib/accountDelete.js declares isAppleCancel()");
  const cancelFnBody = cancelFnStart >= 0 ? jsFunctionBody(src, cancelFnStart) : null;
  ok(!!cancelFnBody && /code\s*===\s*["']APPLE_SIGN_IN_CANCELLED["']/.test(cancelFnBody),
     "isAppleCancel() checks err.code === \"APPLE_SIGN_IN_CANCELLED\" — the code AppleSignInPlugin.swift's ASAuthorizationError.canceled branch rejects with");
  ok(!!cancelFnBody && /\/cancel\/i\.test\(\s*message\s*\)/.test(cancelFnBody),
     "isAppleCancel() also falls back to a case-insensitive /cancel/i test on the message");

  // deleteAccount()'s own body, then the specific try/catch around
  // nativeAppleCredential() inside it.
  const deleteFnStart = src.search(/export\s+async\s+function\s+deleteAccount\s*\(/);
  ok(deleteFnStart >= 0, "lib/accountDelete.js exports async function deleteAccount()");
  const deleteFnBody = deleteFnStart >= 0 ? jsFunctionBody(src, deleteFnStart) : null;
  ok(!!deleteFnBody, "deleteAccount()'s body was extracted by brace matching");

  const credIdx = deleteFnBody ? deleteFnBody.indexOf("nativeAppleCredential()") : -1;
  const fetchIdx = deleteFnBody ? deleteFnBody.indexOf('fetch("/api/account/delete"') : -1;
  ok(credIdx >= 0, "control: deleteAccount() calls nativeAppleCredential() — a miss here would make the ordering check below vacuous");
  ok(fetchIdx > credIdx, "control: the /api/account/delete fetch textually follows the Apple credential attempt");

  // The catch block immediately after the nativeAppleCredential() call site.
  const catchStart = deleteFnBody ? deleteFnBody.indexOf("catch", credIdx) : -1;
  ok(catchStart > credIdx, "a catch block follows the nativeAppleCredential() call");
  const catchBody = catchStart >= 0 ? jsFunctionBody(deleteFnBody, catchStart) : null;
  ok(!!catchBody && /isAppleCancel\s*\(\s*e\s*\)/.test(catchBody),
     "the catch block calls isAppleCancel(e) — not a re-implementation of the check inline, one source of truth");
  const returnMatch = catchBody && catchBody.match(/return\s*\{\s*ok:\s*false,\s*error:\s*["']Deletion cancelled\.["']\s*\}/);
  ok(!!returnMatch, 'on a cancel, the catch block returns { ok: false, error: "Deletion cancelled." } — not just sets a flag that a later step could still fall through past');
  const catchReturnIdxInFn = returnMatch ? deleteFnBody.indexOf(returnMatch[0], catchStart) : -1;
  ok(catchReturnIdxInFn >= 0 && catchReturnIdxInFn < fetchIdx,
     "the cancel-abort return sits BEFORE the /api/account/delete fetch in deleteAccount()'s body — a cancel can never fall through to the server call");

  // RED PROOF: the same probe, run against the pre-fix shape (a catch that
  // only ever sets appleAuthorizationCode = null and lets deletion continue),
  // must find no qualifying return and so must fail the ordering assertion.
  const brokenCatchBody = `
      appleAuthorizationCode = null;
    `;
  const brokenReturnMatch = brokenCatchBody.match(/return\s*\{\s*ok:\s*false,\s*error:\s*["']Deletion cancelled\.["']\s*\}/);
  ok(!brokenReturnMatch, "red proof: the pre-fix catch shape (swallow and continue) has no cancel-abort return for this probe to find");
}

if (failures) {
  console.error(`test-account-delete: FAILED — ${failures} of ${assertions} assertions failed`);
  process.exit(1);
}
console.log(`test-account-delete: OK — ${assertions} assertions`);
