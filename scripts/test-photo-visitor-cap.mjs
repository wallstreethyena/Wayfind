#!/usr/bin/env node
// Regression for the removed visitor cutoff. Execute the real route authorizer
// and real global spend gate with a fake ledger and resolver. No Google calls.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gateShut, spendAllow, spendAllowPhotosDetailed, photosCeiling } from "../lib/spendGate.js";
import { PHOTO_REF_RX, FALLBACK_PATH, placeIdFromRef } from "../lib/placePhotoServe.js";
import { creditedRequest } from "../lib/apiGuard.js";
import { isAutomatedPhotoReader } from "../lib/crawler.js";
import { ledgerOutcomeClass } from "../lib/photoOutcomes.js";
import { bucketHash, idempotencyKey, uaClass } from "../lib/photoPurchaseLog.js";
// Run fixtures in an explicit child environment; ambient shell configuration
// cannot decide the verdict and the parent environment never needs restoring.
if (!process.argv.includes("--fixture")) {
  execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--fixture"], {
    env: { ...process.env, WAYFIND_GATE: "free", WAYFIND_PHOTOS_PAID: "1", GOOGLE_PHOTOS_MONTH_CAP: "10000", VERCEL_ENV: "production", SUPABASE_URL: "https://visitor-removal-fixture.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture-not-a-real-key", GOOGLE_MAPS_SERVER_KEY: "fixture-not-a-real-key" },
    stdio: "inherit", timeout: 20000,
  });
  process.exit(0);
}
let assertions = 0;
const check = (value, message) => { assert.ok(value, message); assertions++; };
const source = readFileSync(new URL("../app/api/photo/route.js", import.meta.url), "utf8");
check(/authorizeSpend:/.test(source), "positive control: runtime authorizer exists in inspected route");
check(!/takeVisitorToken|visitorBucket|visitor-cap|photoVisitorCap/.test(source), "route has no visitor cutoff or replacement visitor ledger");
check(!existsSync(new URL("../lib/photoVisitorCap.js", import.meta.url)), "obsolete visitor cutoff module removed");
const prelude = `const {gateShut,spendAllow,spendAllowPhotosDetailed,photosCeiling,PHOTO_REF_RX,FALLBACK_PATH,placeIdFromRef,creditedRequest,isAutomatedPhotoReader,ledgerOutcomeClass,bucketHash,idempotencyKey,uaClass,resolvePlacePhoto} = globalThis.__visitorRemovalTest;
const findFreePhoto=async()=>null, recordPhotoOutcome=async()=>{}, recordPhotoDeniedCeiling=async()=>{}, recordPhotoPurchase=async()=>{}, recordReaderPhotoMiss=async()=>{};
const NextResponse={json:(body,init={})=>new Response(JSON.stringify(body),init),redirect:(url,init={})=>new Response(null,{...init,headers:{...init.headers,location:String(url)}})};`;
const savedFetch = globalThis.fetch;
let ledgerCalls = 0, purchases = 0, used = 0, transportFail = false;
let allowGoogleResult = false;
const globalCap = 10000;
try {
  check(photosCeiling() === globalCap, "real spend configuration retains the existing monthly limit");
  globalThis.fetch = async (url, options) => {
    check(String(url) === "https://visitor-removal-fixture.supabase.co/rest/v1/rpc/wf_spend_take", "only global ledger transport is used");
    const body = JSON.parse(options.body);
    check(body.p_sku === "photos" && body.p_cap === globalCap, "real global photo budget remains 10,000; no per-visitor SKU");
    ledgerCalls++;
    if (transportFail) throw new Error("fixture offline");
    const granted = used < body.p_cap;
    if (granted) used++;
    return new Response(JSON.stringify(granted), { headers: { "content-type": "application/json" } });
  };
  globalThis.__visitorRemovalTest = { gateShut, spendAllow, spendAllowPhotosDetailed, photosCeiling, PHOTO_REF_RX, FALLBACK_PATH, placeIdFromRef, creditedRequest, isAutomatedPhotoReader, ledgerOutcomeClass, bucketHash, idempotencyKey, uaClass,
    resolvePlacePhoto: async input => {
      if (input.gateShut) return { type: "miss", reason: "gate-shut" };
      if (input.probe) return { type: "miss", reason: "probe-no-spend" };
      if (!input.googleSurface) return { type: "miss", reason: "not-google-surface" };
      const grant = await input.authorizeSpend("photos");
      if (!grant.ok) return { type: "miss", reason: "spend-denied", ledgerReason: grant.reason };
      purchases++;
      return allowGoogleResult ? { type: "redirect", reason: "google", location: "https://lh3.googleusercontent.com/fixture", credit: { name: "Photographer", uri: "https://example.org/author", authors: [{ displayName: "Photographer" }] } } : { type: "miss", reason: "unconfigured" };
    } };
  const { GET } = await import("data:text/javascript," + encodeURIComponent(prelude + source.replace(/^import[^;]+;\n/gm, "")));
  const request = ({ extra = "", ua = "Mozilla/5.0 RealVisitor", site = "same-origin", surface = "detail" } = {}) => new Request(`https://www.gowayfind.com/api/photo?place=ChIJexactVisitorPlace123&s=${surface}&fmt=json${extra}`, { headers: { "user-agent": ua, "x-forwarded-for": "198.51.100.10", "sec-fetch-site": site } });
  for (let i = 0; i < 1501; i++) await GET(request());
  check(purchases === 1501 && ledgerCalls === 1501 && used === 1501, "same visitor can buy beyond 80 and 1,500 only while the global budget grants each request");
  const before = ledgerCalls;
  for (const options of [{ extra: "&nospend=1" }, { ua: "HeadlessChrome/130.0" }, { site: "cross-site" }, { surface: "uncredited" }]) await GET(request(options));
  check(ledgerCalls === before && purchases === 1501, "no-spend, automated, cross-site and uncredited requests take no global grant");
  used = globalCap;
  const blocked = await GET(request());
  check(blocked.headers.get("x-wayfind-photo-result") === "spend-denied" && purchases === 1501 && used === globalCap, "exhausted global monthly budget still blocks this same visitor");
  transportFail = true;
  const offline = await GET(request());
  check(offline.headers.get("x-wayfind-photo-result") === "spend-denied" && purchases === 1501, "global ledger failure remains fail-closed");
  transportFail = false; used = globalCap - 1; allowGoogleResult = true;
  const credited = await GET(request());
  const body = await credited.json();
  check(credited.status === 200 && body.source === "google" && body.credit.name === "Photographer" && body.credit.authors[0].displayName === "Photographer", "allowed live photo retains same-image photographer credit");
  check(credited.headers.get("Cache-Control") === "private, no-store" && used === globalCap, "live response remains private and final global token is accounted for");
  check(ledgerCalls === 1504 && purchases === 1502, "monthly denial and transport failure took no extra successful grant");
} finally {
  globalThis.fetch = savedFetch;
  delete globalThis.__visitorRemovalTest;
}
console.log(`test-photo-visitor-cap: OK (${assertions} assertions; no per-visitor cutoff, real global gate)`);
