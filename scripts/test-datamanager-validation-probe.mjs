#!/usr/bin/env node
// test-datamanager-validation-probe — locks lib/dataManagerValidationProbe.js
//
// The probe proves Data Manager auth + request validation from the deployed
// runtime. It must:
//   - make NO network call when any credential is missing;
//   - always send validateOnly: true, and refuse to send otherwise;
//   - never put the access token, refresh token, client secret or a click ID
//     in its receipt;
//   - report the granted scope and refuse when datamanager is missing;
//   - classify Google's response by body (status + error.status + field
//     violations), not by HTTP status alone;
//   - be wired into the viator-bookings cron only while uploads are not live.
// All network calls are stubbed. Nothing here talks to Google.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runDataManagerValidationProbe, classifyValidation, summarizeGoogleError, probePulseNote, DATA_MANAGER_SCOPE,
} from "../lib/dataManagerValidationProbe.js";
import { resetGoogleOAuthTokenCache } from "../lib/googleOfflineConversions.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = [];
const ok = (c, m) => (c ? pass++ : fail.push(m));

const SECRET = "FIXTURE_CLIENT_SECRET_zzz";
const REFRESH = "1//FIXTURE_REFRESH_TOKEN_abcdefghijk";
const ACCESS = "ya29.FIXTURE_ACCESS_TOKEN_qwerty";
const creds = {
  clientId: "fixture-client.apps.googleusercontent.com",
  clientSecret: SECRET,
  refreshToken: REFRESH,
  operatingAccountId: "5536226713",
  conversionActionId: "7901041576",
  now: new Date("2026-11-15T15:00:00Z"),
};

function stub({ tokenStatus = 200, scope = `${DATA_MANAGER_SCOPE} https://www.googleapis.com/auth/cloud-platform`, ingestStatus = 200, ingestBody = { requestId: "req-1" } } = {}) {
  const calls = [];
  const f = async (url, opts) => {
    calls.push({ url: String(url), opts });
    if (String(url).includes("oauth2")) {
      const body = tokenStatus === 200 ? { access_token: ACCESS, expires_in: 3599, scope, token_type: "Bearer" } : { error: "invalid_grant", error_description: "Token has been expired or revoked." };
      return { ok: tokenStatus === 200, status: tokenStatus, json: async () => body };
    }
    return { ok: ingestStatus < 300, status: ingestStatus, json: async () => ingestBody };
  };
  return { f, calls };
}
const noLeak = (r, label) => {
  const s = JSON.stringify(r);
  ok(!s.includes(ACCESS) && !s.includes(SECRET) && !s.includes(REFRESH) && !s.includes("NOT_A_REAL_CLICK"), `${label}: receipt carries no token, secret or click ID (${s.slice(0, 200)})`);
};

// 1. Not configured: no network.
{
  resetGoogleOAuthTokenCache();
  const { f, calls } = stub();
  const r = await runDataManagerValidationProbe({ ...creds, refreshToken: null }, { fetch: f });
  ok(r.outcome === "not_configured" && r.missing.includes("GOOGLE_ADS_OAUTH_REFRESH_TOKEN"), `missing refresh token -> not_configured (got ${r.outcome})`);
  ok(calls.length === 0, `not_configured makes no network call (made ${calls.length})`);
}

// 2. Happy path: refresh, scope, one validateOnly ingest.
{
  resetGoogleOAuthTokenCache();
  const { f, calls } = stub();
  const r = await runDataManagerValidationProbe(creds, { fetch: f });
  ok(r.outcome === "validated_ok" && r.reached_destination === true, `200 -> validated_ok (got ${r.outcome})`);
  ok(r.token_refresh.ok && r.token_refresh.has_datamanager_scope, "refresh ok and datamanager scope reported");
  const ingest = calls.filter((c) => c.url.includes("datamanager.googleapis.com"));
  ok(ingest.length === 1, `exactly one ingest call (got ${ingest.length})`);
  const sent = ingest[0] ? JSON.parse(ingest[0].opts.body) : {};
  ok(sent.validateOnly === true, "sent body has validateOnly === true");
  ok(sent.destinations?.[0]?.operatingAccount?.accountId === "5536226713" && sent.destinations?.[0]?.productDestinationId === "7901041576", "sent to the configured account + conversion action");
  ok(/^WAYFIND-DM-VALIDATION-FIXTURE-/.test(sent.events?.[0]?.transactionId || ""), "fixture transactionId is labeled");
  ok(sent.events?.[0]?.eventSource === "WEB" && !("consent" in (sent.events?.[0] || {})), "eventSource WEB; unknown consent omitted, never invented");
  ok(ingest[0]?.opts?.headers?.Authorization === `Bearer ${ACCESS}`, "token goes only in the Authorization header");
  ok(r.request_id_present === true, "requestId presence recorded (value not stored)");
  noLeak(r, "happy");
  ok(probePulseNote(r) === "dm=validated_ok/200/scope", `pulse note (got ${probePulseNote(r)})`);
}

// 3. Refresh rejected (revoked / 7-day testing-app expiry).
{
  resetGoogleOAuthTokenCache();
  const { f, calls } = stub({ tokenStatus: 400 });
  const r = await runDataManagerValidationProbe(creds, { fetch: f });
  ok(r.outcome === "token_refresh_failed" && /invalid|revoked|expired/i.test(r.token_refresh.reason), `revoked refresh -> token_refresh_failed (got ${r.outcome})`);
  ok(!calls.some((c) => c.url.includes("datamanager")), "no ingest call after a failed refresh");
  noLeak(r, "refresh-failed");
}

// 4. Grant without datamanager scope.
{
  resetGoogleOAuthTokenCache();
  const { f, calls } = stub({ scope: "https://www.googleapis.com/auth/adwords" });
  const r = await runDataManagerValidationProbe(creds, { fetch: f });
  ok(r.outcome === "missing_datamanager_scope", `adwords-only grant -> missing_datamanager_scope (got ${r.outcome})`);
  ok(!calls.some((c) => c.url.includes("datamanager.googleapis.com")), "no ingest call without the scope");
}

// 5. Response classification by body.
{
  const fixtureOnly = summarizeGoogleError({ error: { code: 400, status: "INVALID_ARGUMENT", message: "bad gclid WAYFIND_VALIDATION_FIXTURE_NOT_A_REAL_CLICK", details: [{ "@type": "type.googleapis.com/google.rpc.BadRequest", fieldViolations: [{ field: "events[0].ad_identifiers.gclid", reason: "INVALID_GCLID", description: "WAYFIND_VALIDATION_FIXTURE_NOT_A_REAL_CLICK is invalid" }] }] } });
  ok(classifyValidation(400, fixtureOnly).outcome === "fixture_rejected_destination_ok", "400 only on the fixture click ID -> destination ok");
  ok(!JSON.stringify(fixtureOnly).includes("NOT_A_REAL_CLICK"), "fixture click value redacted from Google's text");
  const dest = summarizeGoogleError({ error: { code: 400, status: "INVALID_ARGUMENT", details: [{ fieldViolations: [{ field: "destinations[0].product_destination_id", reason: "INVALID_CONVERSION_ACTION" }] }] } });
  ok(classifyValidation(400, dest).outcome === "destination_invalid" && classifyValidation(400, dest).reached_destination === false, "400 on the destination -> destination_invalid");
  const mixed = summarizeGoogleError({ error: { code: 400, details: [{ fieldViolations: [{ field: "events[0].ad_identifiers.gclid" }, { field: "destinations[0].operating_account.account_id" }] }] } });
  ok(classifyValidation(400, mixed).reached_destination === false, "fixture + destination violations -> not reached");
  ok(classifyValidation(400, summarizeGoogleError({ error: { code: 400, details: [] } })).outcome === "request_invalid", "400 with no field detail is not a pass");
  ok(classifyValidation(403, null).outcome === "permission_denied" && classifyValidation(401, null).outcome === "auth_rejected", "403/401 classified");
  ok(classifyValidation(200, null).outcome === "validated_ok", "200 validated_ok");
}

// 6. The validateOnly guard cannot be bypassed from the outside.
{
  const src = fs.readFileSync(path.join(REPO, "lib/dataManagerValidationProbe.js"), "utf8").replace(/\/\/.*$/gm, "");
  ok(/validateOnly:\s*true,/.test(src) && !/validateOnly:\s*(?!true)[A-Za-z]/.test(src), "probe builds with the literal validateOnly: true only");
  ok(/if \(built\.body\.validateOnly !== true\)/.test(src), "post-build validateOnly guard present");
  const exported = src.match(/export async function runDataManagerValidationProbe\(\s*\{([^}]*)\}/);
  ok(exported && !/validateOnly|mode|live/i.test(exported[1]), "probe has no validateOnly/mode/live parameter");
}

// 7. Cron wiring: only while not live; never fails the job.
{
  const route = fs.readFileSync(path.join(REPO, "app/api/cron/viator-bookings/route.js"), "utf8").replace(/\/\/.*$/gm, "");
  ok(/if \(!result\.skipped_locked && uploadMode !== "live"\)\s*\{[\s\S]{0,120}dmProbe = await runDataManagerValidationProbe\(/.test(route), "cron runs the probe only when uploads are not live");
  ok(/datamanager_probe: dmProbe/.test(route) && /\$\{probePulseNote\(dmProbe\)\} pages=/.test(route), "probe result in the run summary and at the front of the pulse note");
  const totalFailuresLine = (route.match(/const totalFailures =[^;]*;/) || [""])[0];
  ok(totalFailuresLine && !/dmProbe/.test(totalFailuresLine), "probe outcome never counts as a job failure");
}

if (fail.length) {
  console.error(`test-datamanager-validation-probe: FAIL (${fail.length})\n  - ${fail.join("\n  - ")}`);
  process.exit(1);
}
console.log(`test-datamanager-validation-probe: OK (${pass} assertions; not-configured makes no call, validateOnly literal + post-build guard, scope check, refresh failure, body-based classification, no token/secret/click ID in receipts, cron wired only while uploads are not live; all network stubbed)`);
