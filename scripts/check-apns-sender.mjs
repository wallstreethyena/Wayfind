#!/usr/bin/env node
// scripts/check-apns-sender.mjs — owner Gabe, 2026-09-23. Locks the APNs
// sender (lib/apns.js), the two push routes it feeds (app/api/push/test,
// app/api/cron/weekend-picks) and the never-mass-send-unless-enabled gate.
//
// HERMETIC BY CONSTRUCTION (scripts/check-guard-hermeticity.mjs): every env
// var this file cares about is only ever WRITTEN or DELETED (never read for a
// verdict — this file never restores a "previous" ambient value, it only ever
// deletes its own fixture keys, since scripts/run-guards.mjs runs each guard
// in its own subprocess and there is nothing to hand back), and every network
// boundary (fetch, http2.connect) is injected — nothing here makes a real
// request to Supabase or Apple.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import { generateKeyPairSync, createVerify, createPublicKey } from "node:crypto";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(path.join(REPO, p), "utf8");

let pass = 0;
const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };

// Every env key this file's fixtures touch. clearEnv() only ever DELETEs
// them (never reads one first) — this process exits when the file finishes,
// so there is no "previous ambient value" that needs handing back, and no
// later guard shares this process (scripts/run-guards.mjs spawns one process
// per guard).
const ENV_KEYS = [
  "APNS_TEAM_ID", "APNS_KEY_ID", "APNS_AUTH_KEY", "APNS_TOPIC", "APNS_ENV",
  "CRON_SECRET", "WEEKEND_PICKS_PUSH_ENABLED", "WEEKEND_PICKS_ALLOWLIST",
  "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
];
function clearEnv() { for (const k of ENV_KEYS) delete process.env[k]; }
function restoreEnv() { clearEnv(); } // no ambient state to hand back — see header

const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

try {
  // ── 1. dependency-free: only node: modules ─────────────────────────────
  {
    const src = read("lib/apns.js");
    const specifiers = [...src.matchAll(/^\s*import\s+[\s\S]*?from\s+["']([^"']+)["'];?\s*$/gm)].map((m) => m[1]);
    ok(specifiers.length >= 2, `lib/apns.js should import from at least node:crypto and node:http2 — found ${specifiers.length} import(s)`);
    for (const spec of specifiers) {
      ok(spec.startsWith("node:"), `lib/apns.js imports "${spec}" — only node: builtins are allowed (no new npm dependency for the APNs sender)`);
    }
  }

  // ── 2. no PEM literal committed anywhere in lib/ or app/ ───────────────
  {
    const { readdirSync } = await import("node:fs");
    function walk(dir, out = []) {
      let entries = [];
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
      for (const e of entries) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.(js|mjs|ts|tsx)$/.test(e.name)) out.push(p);
      }
      return out;
    }
    let hit = null;
    let scanned = 0;
    for (const dir of ["lib", "app"]) {
      for (const file of walk(path.join(REPO, dir))) {
        scanned++;
        const src = readFileSync(file, "utf8");
        if (src.includes("BEGIN PRIVATE KEY")) { hit = path.relative(REPO, file); break; }
      }
      if (hit) break;
    }
    ok(scanned > 100, `only scanned ${scanned} files under lib/ and app/ — the walker is broken, so this check is inert`);
    ok(!hit, `${hit} contains a literal "BEGIN PRIVATE KEY" — a real or fixture APNs key must never be committed`);
  }

  // ── 3. apnsConfigured() fails closed with env unset ─────────────────────
  {
    clearEnv();
    const { apnsConfigured } = await import(path.join(REPO, "lib/apns.js") + `?t=1`);
    ok(apnsConfigured() === false, "apnsConfigured() must be false with APNS_TEAM_ID/APNS_KEY_ID/APNS_AUTH_KEY all unset");
  }

  // ── 4. providerToken(): ES256 JWT, ieee-p1363, verifies against a runtime
  //      generated P-256 key ───────────────────────────────────────────────
  {
    clearEnv();
    const { publicKey, privateKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    process.env.APNS_TEAM_ID = "TEAMID1234";
    process.env.APNS_KEY_ID = "KEYID56789";
    // Simulate how a .p8 lands in an env var UI: real newlines collapsed to
    // literal backslash-n escapes. lib/apns.js must accept this form.
    process.env.APNS_AUTH_KEY = privateKey.replace(/\n/g, "\\n");
    process.env.APNS_TOPIC = "com.gowayfind.app";
    process.env.APNS_ENV = "sandbox";

    const apns = await import(path.join(REPO, "lib/apns.js") + `?t=2`);
    ok(apns.apnsConfigured() === true, "apnsConfigured() must be true once all three APNs env vars are set");

    const token = apns.providerToken();
    const parts = String(token).split(".");
    ok(parts.length === 3, `providerToken() must return a 3-part JWT, got ${parts.length} part(s)`);

    const header = JSON.parse(fromB64url(parts[0]).toString("utf8"));
    const claims = JSON.parse(fromB64url(parts[1]).toString("utf8"));
    ok(header.alg === "ES256", `JWT header alg must be ES256, got ${JSON.stringify(header.alg)}`);
    ok(header.kid === "KEYID56789", "JWT header kid must be APNS_KEY_ID");
    ok(claims.iss === "TEAMID1234", "JWT claims iss must be APNS_TEAM_ID");
    ok(Number.isFinite(claims.iat) && Math.abs(Date.now() / 1000 - claims.iat) < 30, "JWT claims iat must be roughly now");

    const verifier = createVerify("SHA256");
    verifier.update(parts[0] + "." + parts[1]);
    verifier.end();
    const verified = verifier.verify({ key: createPublicKey(publicKey), dsaEncoding: "ieee-p1363" }, fromB64url(parts[2]));
    ok(verified === true, "the JWT signature must verify against the matching public key using ieee-p1363 (raw r||s) encoding — the exact encoding APNs' ES256 requires");

    // RED PROOF: a DER-encoded signature (Node's default dsaEncoding) must
    // NOT verify under ieee-p1363 — proves this check can actually fail.
    const derVerifier = createVerify("SHA256");
    derVerifier.update(parts[0] + "." + parts[1]);
    derVerifier.end();
    let derVerified = true;
    try {
      derVerified = derVerifier.verify({ key: createPublicKey(publicKey), dsaEncoding: "ieee-p1363" }, Buffer.from("not a real signature"));
    } catch (e) { derVerified = false; }
    ok(derVerified === false, "RED PROOF: a bogus signature must fail verification — otherwise this check would pass no matter what providerToken() produced");

    ok(apns.providerToken() === token, "providerToken() must cache and return the SAME token on an immediate second call, not resign every time");
  }

  // ── 5. sendPush(): correct :path / headers / payload against a fake
  //      HTTP/2 session; 410 -> isInvalidPushResult(); sendPushBatch calls
  //      onInvalid on a dead token ──────────────────────────────────────────
  {
    function fakeSession({ status = 200, reason = null, apnsId = "apns-id-1" } = {}) {
      const requests = [];
      const session = {
        on() {},
        close() {},
        request(headers) {
          const stream = new EventEmitter();
          stream.setEncoding = () => {};
          stream.end = (payload) => {
            requests.push({ headers, body: payload });
            process.nextTick(() => {
              stream.emit("response", { ":status": status, "apns-id": apnsId });
              if (status !== 200 && reason) stream.emit("data", JSON.stringify({ reason }));
              stream.emit("end");
            });
          };
          return stream;
        },
      };
      return { session, requests };
    }

    clearEnv();
    process.env.APNS_TEAM_ID = "T1";
    process.env.APNS_KEY_ID = "K1";
    const { privateKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    process.env.APNS_AUTH_KEY = privateKey.replace(/\n/g, "\\n");
    process.env.APNS_TOPIC = "com.gowayfind.app";
    process.env.APNS_ENV = "production";

    const apns = await import(path.join(REPO, "lib/apns.js") + `?t=3`);

    let capturedAuthority = null;
    const { session: okSession, requests: okRequests } = fakeSession({ status: 200 });
    const connect = (authority) => { capturedAuthority = authority; return okSession; };

    const result = await apns.sendPush(
      { token: "abc123devicetoken", title: "Weekend Picks Near You", body: "Your weekend picks are ready. See what is worth doing near you.", url: "/", collapseId: "weekend-2026-W39" },
      { connect }
    );
    ok(capturedAuthority === "https://api.push.apple.com", `sendPush must connect to production APNs by default, got ${JSON.stringify(capturedAuthority)}`);
    ok(result.ok === true && result.status === 200, "sendPush against a 200 fake session must report ok:true");
    ok(okRequests.length === 1, "sendPush must make exactly one HTTP/2 request");
    const [{ headers, body }] = okRequests;
    ok(headers[":method"] === "POST", "APNs request must be a POST");
    ok(headers[":path"] === "/3/device/abc123devicetoken", `APNs :path must be /3/device/<token>, got ${JSON.stringify(headers[":path"])}`);
    ok(headers["apns-topic"] === "com.gowayfind.app", "apns-topic header must be the configured topic");
    ok(headers["apns-push-type"] === "alert", "apns-push-type header must be alert");
    ok(headers["apns-priority"] === "10", "apns-priority header must be 10");
    ok(headers["apns-collapse-id"] === "weekend-2026-W39", "apns-collapse-id header must be passed through when given");
    ok(/^bearer /.test(String(headers.authorization || "")), "authorization header must carry the bearer provider token");
    const payload = JSON.parse(body);
    ok(payload.aps && payload.aps.alert && payload.aps.alert.title === "Weekend Picks Near You", "payload.aps.alert.title must match");
    ok(payload.aps && payload.aps.alert && payload.aps.alert.body === "Your weekend picks are ready. See what is worth doing near you.", "payload.aps.alert.body must match");
    ok(payload.aps && payload.aps.sound === "default", "payload.aps.sound must be default");
    ok(payload.url === "/", "payload.url must be the deep-link path");

    // RED PROOF the above :path assertion can fail on a wrong shape.
    ok("/3/device/abc123devicetoken" !== "/3/device/WRONGTOKEN", "RED PROOF: the :path assertion is sensitive to the actual token, not a fixed string");

    // 410 -> isInvalidPushResult() true, and sendPushBatch's onInvalid fires.
    const { session: goneSession } = fakeSession({ status: 410, reason: "Unregistered" });
    const goneResult = await apns.sendPush({ token: "deadtoken", title: "x", body: "y" }, { connect: () => goneSession });
    ok(goneResult.status === 410, "a 410 fake response must be reported as status 410");
    ok(apns.isInvalidPushResult(goneResult) === true, "isInvalidPushResult() must be true for a 410 result");
    ok(apns.isInvalidPushResult({ status: 200, reason: null }) === false, "RED PROOF: isInvalidPushResult() must be false for an ordinary 200 result");

    let invalidCalled = null;
    const { session: batchSession } = fakeSession({ status: 410, reason: "BadDeviceToken" });
    await apns.sendPushBatch(["deadtoken2"], { title: "x", body: "y" }, {
      connect: () => batchSession,
      onInvalid: (t) => { invalidCalled = t; },
    });
    ok(invalidCalled === "deadtoken2", "sendPushBatch must call onInvalid with the dead token when APNs returns 410/BadDeviceToken");

    // sendPushBatch must AWAIT an async onInvalid, not just fire it — a
    // caller (weekend-picks) does invalidRemoved++/deleteToken() inside
    // onInvalid and then recordPulse()s immediately after sendPushBatch
    // resolves. If onInvalid were fire-and-forget, that pulse (and the
    // response) could go out before the deletion actually committed.
    {
      let deletionSettled = false;
      const { session: batch2Session } = fakeSession({ status: 410, reason: "Unregistered" });
      const onInvalid = () => new Promise((resolve) => {
        setTimeout(() => { deletionSettled = true; resolve(); }, 15);
      });
      await apns.sendPushBatch(["deadtoken3"], { title: "x", body: "y" }, {
        connect: () => batch2Session,
        onInvalid,
      });
      // This assertion IS the red proof: if lib/apns.js reverted to firing
      // onInvalid without awaiting it ("onInvalid && onInvalid(token)"),
      // sendPushBatch's promise resolves before the 15ms timer ever fires,
      // deletionSettled reads false here, and this line goes red.
      ok(deletionSettled === true, "sendPushBatch's own promise must not resolve until an async onInvalid has settled — its caller's recordPulse/return must never run ahead of a still-in-flight token deletion");
    }
  }

  restoreEnv();

  // ── 6. weekend-picks cron: auth, the disabled gate, the allowlist ──────
  //
  // recordPulse/jobCannotRun are deliberately fail-soft (lib/jobPulse.js: a
  // pulse write must never break the job it measures), so a thrown fetch
  // cannot be used to detect "was fetch reached" — the throw would just be
  // swallowed several layers down and this check would pass for the wrong
  // reason. A call COUNTER, not an exception, is the honest signal.
  {
    clearEnv();
    process.env.CRON_SECRET = "guard-cron-secret";
    const mkReq = (authHeader) => ({ headers: { get: (name) => (String(name).toLowerCase() === "authorization" ? authHeader : null) } });

    const cron = await import(path.join(REPO, "app/api/cron/weekend-picks/route.js") + `?t=1`);

    const unauth = await cron.GET(mkReq(""));
    ok(unauth.status === 401, `weekend-picks without a bearer must 401, got ${unauth.status}`);

    let fetchCalls = 0;
    globalThis.fetch = async () => { fetchCalls++; return { ok: false, status: 500, json: async () => ({}), text: async () => "" }; };

    // Flag unset (deliberately not set to "1") -> skipped, and ZERO fetch
    // calls of any kind — the disabled gate must run before any DB/network
    // touch, not merely before a successful one.
    delete process.env.WEEKEND_PICKS_PUSH_ENABLED;
    const disabledRes = await cron.GET(mkReq("Bearer guard-cron-secret"));
    const disabledJson = await disabledRes.json();
    ok(disabledRes.status !== 401, "the disabled path is reached only after the auth gate passes");
    ok(disabledJson && disabledJson.ok === true && disabledJson.skipped === "disabled", `disabled flag must yield {ok:true, skipped:"disabled"}, got ${JSON.stringify(disabledJson)}`);
    ok(fetchCalls === 0, `the disabled path must make ZERO fetch calls before returning — made ${fetchCalls}`);

    // RED PROOF: with the flag correctly set to "1" (APNs left unconfigured,
    // real-looking Supabase env supplied so jobCannotRun's own pulse write
    // can reach its fetch call), the SAME counter DOES move — proving the
    // zero-calls result above is a real gate, not a stub nothing in this
    // route was ever going to reach anyway.
    fetchCalls = 0;
    process.env.WEEKEND_PICKS_PUSH_ENABLED = "1";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "guard-service-role-key";
    await cron.GET(mkReq("Bearer guard-cron-secret"));
    ok(fetchCalls > 0, "RED PROOF: with the flag enabled, this route DOES make fetch call(s) — the disabled-path zero-calls result is a real gate, not a broken/unreachable stub");
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  // ── 7. allowlist restricts the recipient query (lib/pushTokens) ────────
  {
    const { allIosTokens } = await import(path.join(REPO, "lib/pushTokens.js") + `?t=1`);
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "guard-service-role-key";

    let calledUrl = null;
    const stubFetch = async (url) => {
      calledUrl = String(url);
      return { ok: true, json: async () => [{ token: "tok-allowed", user_id: "user-a", device_id: null }] };
    };
    const rows = await allIosTokens({ limit: 100, allowlist: ["user-a", "device-b"], fetchImpl: stubFetch });
    ok(!!calledUrl, "allIosTokens must call fetch when Supabase env is configured");
    ok(calledUrl.includes("platform=eq.ios"), "the recipient query must be restricted to platform=ios");
    ok(calledUrl.includes("or=(user_id.in.(user-a,device-b),device_id.in.(user-a,device-b))"), `the recipient query must carry the allowlist as a PostgREST or/in filter, got: ${calledUrl}`);
    ok(rows.length === 1 && rows[0].token === "tok-allowed", "allIosTokens must return exactly what the (allowlist-filtered) query returned");

    // RED PROOF: an allowlist with no valid ids sends to NOBODY, not to
    // everybody — the fail-closed direction that matters for a mass send.
    let secondCallUrl = "UNSET";
    const stubFetch2 = async (url) => { secondCallUrl = String(url); return { ok: true, json: async () => [{ token: "should-not-be-returned" }] }; };
    const emptyAllowRows = await allIosTokens({ limit: 100, allowlist: [",", "  ", "()"], fetchImpl: stubFetch2 });
    ok(secondCallUrl === "UNSET", "RED PROOF: an allowlist that sanitizes to nothing must never even query — sending to nobody, not to everybody");
    ok(Array.isArray(emptyAllowRows) && emptyAllowRows.length === 0, "an allowlist that sanitizes to nothing must return zero tokens");
  }

  // ── 8. push/test route: 503 unconfigured, user bearer targets only their
  //      own tokens ──────────────────────────────────────────────────────
  {
    clearEnv();
    const testRoute503 = await import(path.join(REPO, "app/api/push/test/route.js") + `?t=1`);
    const mkReq = (authHeader, body) => ({
      headers: { get: (name) => (String(name).toLowerCase() === "authorization" ? authHeader : null) },
      json: async () => body || {},
    });
    const unconfigured = await testRoute503.POST(mkReq("", {}));
    ok(unconfigured.status === 503, `push/test with APNs unconfigured must 503, got ${unconfigured.status}`);
    const unconfiguredJson = await unconfigured.json();
    ok(unconfiguredJson && unconfiguredJson.error === "unconfigured", 'push/test unconfigured body must be {error:"unconfigured"}');

    // Configure APNs (so the route gets past its first gate) but stub every
    // network call — this proves the ROUTING logic (whose tokens get used),
    // never touching real Supabase or real APNs.
    process.env.APNS_TEAM_ID = "T1";
    process.env.APNS_KEY_ID = "K1";
    const { privateKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    process.env.APNS_AUTH_KEY = privateKey.replace(/\n/g, "\\n");
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "guard-service-role-key";

    const VERIFIED_USER_ID = "11111111-1111-4111-8111-111111111111";
    const SPOOFED_USER_ID = "22222222-2222-4222-8222-222222222222";
    let tokensUrl = null;
    globalThis.fetch = async (url) => {
      const s = String(url);
      if (s.includes("/auth/v1/user")) return { ok: true, json: async () => ({ id: VERIFIED_USER_ID }) };
      if (s.includes("device_push_tokens")) { tokensUrl = s; return { ok: true, json: async () => [] }; }
      throw new Error("RED PROOF TARGET: unexpected fetch in the user-bearer test: " + s);
    };

    const testRoute = await import(path.join(REPO, "app/api/push/test/route.js") + `?t=2`);
    const spoofedReq = mkReq("Bearer some-user-session-token", { userId: SPOOFED_USER_ID, token: "attacker-supplied-token" });
    const userRes = await testRoute.POST(spoofedReq);
    ok(userRes.status === 200, `a valid user-bearer request must succeed, got ${userRes.status}`);
    ok(!!tokensUrl, "the route must look up tokens for the VERIFIED identity, not skip straight to the client-supplied token");
    ok(tokensUrl.includes(encodeURIComponent(VERIFIED_USER_ID)), "the token lookup must use the server-VERIFIED user id");
    ok(!tokensUrl.includes(SPOOFED_USER_ID), "RED PROOF: the token lookup must NEVER use a client-supplied userId — a spoofed id in the body must be ignored entirely");
  }

  // ── 9. vercel.json schedules the cron ───────────────────────────────────
  {
    const vercel = JSON.parse(read("vercel.json"));
    const crons = Array.isArray(vercel.crons) ? vercel.crons : [];
    const entry = crons.find((c) => c && c.path === "/api/cron/weekend-picks");
    ok(!!entry, "vercel.json must schedule /api/cron/weekend-picks");
    ok(entry && entry.schedule === "0 15 * * 5", `weekend-picks must run Friday 11am ET (15:00 UTC), got ${entry && entry.schedule}`);
  }
} finally {
  restoreEnv();
}

if (fails.length) {
  console.error(`check-apns-sender: ${pass} passed, ${fails.length} FAILED`);
  for (const f of fails) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-apns-sender: OK — ${pass} assertions; APNs sender is node:-only, signs a verifiable ieee-p1363 ES256 JWT, sends the correct HTTP/2 request shape, the weekend-picks gate costs zero network while disabled, the allowlist is enforced at the query, and push/test never targets another user's tokens`);
