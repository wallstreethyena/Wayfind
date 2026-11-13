#!/usr/bin/env node
// scripts/test-viator-consent-basis.mjs
//
// Locks the owner-approved consent rule for Google Ads offline booking uploads
// (2026-11-12, lib/adConsentRegion.js + migration 20261113120000):
//   upload ONLY on an explicit GRANTED consent, or for a click made outside the
//   EEA / UK / Switzerland with no Global Privacy Control signal. DENIED, GPC,
//   an unknown country, or a covered region without GRANTED all block.
//
// Proves it end to end against PGlite loaded with the production migrations:
// the click row the redirect builds, the reconcile function's upload ledger
// status per case, the JS payload builder, idempotency, and that the
// migration refuses to run against a drifted function body. Fixture
// identifiers only; nothing leaves the process.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {
  uploadConsentBasis, countryFromHeaders, gpcFromHeaders, isUploadableConsentBasis, CONSENT_REQUIRED_COUNTRIES,
} from "../lib/adConsentRegion.js";
import { attributedViatorDestination } from "../lib/viatorAttribution.js";
import { encodeAdClickCookie } from "../lib/adClickCookie.js";
import { normalizeViatorBookingEvent } from "../lib/viatorBookings.js";
import { buildGoogleDataManagerEventPayload, UPLOAD_STATES } from "../lib/googleOfflineConversions.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = fs.readFileSync(path.join(REPO, "supabase/migrations/20261103220000_wf_viator_booking_attribution.sql"), "utf8");
const GATE = fs.readFileSync(path.join(REPO, "supabase/migrations/20261113120000_wf_viator_upload_consent_basis.sql"), "utf8");
let pass = 0;
const fail = [];
const ok = (c, m) => (c ? pass++ : fail.push(m));

// ---- 1. The rule itself -----------------------------------------------------
const matrix = [
  [{ country: "US" }, "not_required_region"],
  [{ country: "us" }, "not_required_region"],
  [{ country: "BR" }, "not_required_region"],
  [{ country: "US", gpc: true }, "gpc_opt_out"],
  [{ country: "US", adUserData: "DENIED" }, "denied"],
  [{ country: "US", adUserData: "GRANTED" }, "granted"],
  [{ country: "DE", adUserData: "GRANTED" }, "granted"],
  [{ country: "DE", adUserData: "GRANTED", gpc: true }, "gpc_opt_out"],
  [{ country: "DE", adUserData: "DENIED", gpc: true }, "denied"],
  [{ country: "DE" }, "restricted_region_no_consent"],
  [{ country: "GB" }, "restricted_region_no_consent"],
  [{ country: "CH" }, "restricted_region_no_consent"],
  [{ country: "NO" }, "restricted_region_no_consent"],
  [{ country: null }, "unknown_region"],
  [{ country: "" }, "unknown_region"],
  [{ country: "XYZ" }, "unknown_region"],
  [{}, "unknown_region"],
];
for (const [input, want] of matrix) {
  ok(uploadConsentBasis(input) === want, `uploadConsentBasis(${JSON.stringify(input)}) is ${want} (got ${uploadConsentBasis(input)})`);
}
ok(CONSENT_REQUIRED_COUNTRIES.size === 32, `covered regions = EU27 + IS/LI/NO + GB + CH = 32 (got ${CONSENT_REQUIRED_COUNTRIES.size})`);
ok(isUploadableConsentBasis("granted") && isUploadableConsentBasis("not_required_region"), "granted and not_required_region are uploadable");
for (const b of ["denied", "gpc_opt_out", "restricted_region_no_consent", "unknown_region", "", null, undefined, "GRANTED"]) {
  ok(!isUploadableConsentBasis(b), `${JSON.stringify(b)} is not uploadable`);
}
ok(gpcFromHeaders(new Headers({ "sec-gpc": "1" })) === true, "Sec-GPC: 1 is read as opt-out");
ok(gpcFromHeaders(new Headers({})) === false && gpcFromHeaders(new Headers({ "sec-gpc": "0" })) === false, "no/0 Sec-GPC is not opt-out");
ok(countryFromHeaders(new Headers({ "x-vercel-ip-country": "us" })) === "US", "Vercel country header is read and upper-cased");
ok(countryFromHeaders(new Headers({ "x-vercel-ip-country": "nowhere" })) === null && countryFromHeaders(new Headers({})) === null, "missing or malformed country is null");

// ---- 2. Database: migration, click rows, reconcile ledger -----------------
async function freshDb() {
  const db = new PGlite();
  await db.exec(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
  END $$;`);
  await db.exec(BASE);
  return db;
}
const db = await freshDb();
await db.exec(GATE);
const fnDef = (await db.query(`select pg_get_functiondef('public.wf_viator_reconcile'::regproc) d`)).rows[0].d;
ok(/upload_consent_basis\s*=\s*coalesce\(/.test(fnDef), "migrated reconcile copies upload_consent_basis onto the booking");
ok(/not in \('granted', 'not_required_region'\)/.test(fnDef) && !/coalesce\(v_current\.consent_ad_user_data, 'UNKNOWN'\) <> 'GRANTED'/.test(fnDef),
  "migrated reconcile gates on the consent basis, not GRANTED-only");
let rerunErr = null;
try { await db.exec(GATE); } catch (e) { rerunErr = String(e.message || e); }
ok(rerunErr === null, `migration is idempotent (re-run error: ${rerunErr})`);

// Drift guard: against a function whose gate text differs, the migration must refuse.
{
  const drift = await freshDb();
  const d0 = (await drift.query(`select pg_get_functiondef('public.wf_viator_reconcile'::regproc) d`)).rows[0].d;
  const old = `elsif coalesce(v_current.consent_ad_user_data, 'UNKNOWN') <> 'GRANTED' then`;
  ok(d0.includes(old), "drift control: the reviewed gate anchor exists in the base function");
  await drift.exec(d0.replace(old, `elsif coalesce(v_current.consent_ad_user_data, 'UNKNOWN') != 'GRANTED' then`));
  let driftErr = null;
  try { await drift.exec(GATE); } catch (e) { driftErr = String(e.message || e); }
  ok(driftErr && /anchor found 0 times/.test(driftErr), `migration refuses a drifted function body (got ${driftErr})`);
  const cols = (await drift.query(`select count(*)::int n from information_schema.columns where table_name='wf_viator_clicks' and column_name='upload_consent_basis'`)).rows[0].n;
  ok(cols === 0, "a refused migration leaves no partial column behind (single transaction)");
  await drift.close();
}

// The click row the redirect builds carries the basis and is accepted by the table.
async function insertRow(row) {
  const cols = Object.keys(row);
  const ident = cols.map((c) => `"${c}"`).join(", ");
  try {
    await db.query(`insert into public.wf_viator_clicks (${ident}) select ${ident} from json_populate_record(null::public.wf_viator_clicks, $1::json)`, [JSON.stringify(row)]);
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
}
let seq = 0;
async function clickFor(label, { country, gpc, consent }) {
  const cookie = encodeAdClickCookie({
    sessionRecord: { v: 1, at: "2026-11-13T12:00:00Z", p: { utm_source: "google", utm_campaign: "wf_fl_search", gclid: `FIXTURE_gclid_${label}` }, lp: "/", rd: "" },
    consentAdUserData: consent, visitorNonce: `fixturevisitor${label}`.padEnd(34, "x").slice(0, 34),
  });
  let posted = null; let stored = null;
  const fakeFetch = async (url, opts = {}) => {
    if ((opts.method || "GET") !== "POST") return { ok: true, status: 200, json: async () => [] };
    posted = JSON.parse(opts.body); stored = await insertRow(posted);
    return { ok: stored.ok, status: stored.ok ? 201 : 400, json: async () => [] };
  };
  const token = "wfv_" + (++seq).toString(16).padStart(32, "c");
  const res = await attributedViatorDestination({
    offerId: "123164P1", destinationUrl: "https://www.viator.com/tours/Orlando/x/d663-123164P1", pageHint: "consent", surface: `consent_${label}`,
    clientClickId: `c_fixture_${label}`, cookieHeader: "wf_ad_ctx=" + cookie, trafficClass: "human", visitorCountry: country, gpc,
  }, { sb: { url: "https://fixture.invalid", key: "k" }, fetch: fakeFetch, now: "2026-11-13T12:05:00Z", mintToken: () => token });
  return { res, posted, stored };
}

const cases = [
  ["us", { country: "US", gpc: false }, "not_required_region", "awaiting_upload"],
  ["usgpc", { country: "US", gpc: true }, "gpc_opt_out", "ineligible_missing_consent"],
  ["de", { country: "DE", gpc: false }, "restricted_region_no_consent", "ineligible_missing_consent"],
  ["nocountry", { country: null, gpc: false }, "unknown_region", "ineligible_missing_consent"],
  ["denied", { country: "US", gpc: false, consent: "DENIED" }, "denied", "ineligible_missing_consent"],
  ["granted", { country: "DE", gpc: false, consent: "GRANTED" }, "granted", "awaiting_upload"],
];
const events = [];
let n = 0;
for (const [label, input, wantBasis] of cases) {
  const c = await clickFor(label, input);
  ok(c.posted && c.posted.upload_consent_basis === wantBasis, `${label}: click row carries upload_consent_basis=${wantBasis} (got ${c.posted && c.posted.upload_consent_basis})`);
  ok(c.posted && !("visitor_country" in c.posted) && !JSON.stringify(c.posted).includes(`"${input.country}"`) || input.country == null,
    `${label}: the click row stores the label only, never the country`);
  ok(c.stored && c.stored.ok, `${label}: the real table accepts the row (got ${JSON.stringify(c.stored)})`);
  ok(c.res && c.res.attributedCampaign, `${label}: the redirect is attributed`);
  n++;
  events.push(normalizeViatorBookingEvent({
    bookingRef: `BR-CONSENT-${n}`, transactionRef: `TX-CONSENT-${n}`, eventType: "CONFIRMATION", status: "CONFIRMED",
    bookedItem: { productCode: "123164P1", travelDate: "2026-11-20", travelTime: "09:30" },
    campaignValue: c.res.attributedCampaign, grossBookingValue: 238.0, estimatedCommission: 19.04, confirmedCommission: 19.04,
    currencyCode: "USD", bookingDate: "2026-11-13T13:00:00Z", lastUpdated: "2026-11-13T13:00:00Z",
  }));
}
// A click made before this rule (no basis recorded, GRANTED consent) keeps working.
await db.exec(`insert into public.wf_viator_clicks (click_token, provider, offer_id, surface, placement_campaign, attributed_campaign, destination_host, gclid, consent_ad_user_data, consent_ad_personalization, clicked_at, expires_at, redact_after)
  values ('wfv_${"9".repeat(32)}', 'viator', '123164P1', 'consent_legacy', 'wf-consent-legacy', 'wf-consent-legacy-wfv-${"9".repeat(32)}', 'www.viator.com', 'FIXTURE_gclid_legacy', 'GRANTED', 'GRANTED', '2026-11-13T12:00:00Z', '2026-12-13T12:00:00Z', '2027-02-13T12:00:00Z')`);
events.push(normalizeViatorBookingEvent({
  bookingRef: "BR-CONSENT-LEGACY", transactionRef: "TX-CONSENT-LEGACY", eventType: "CONFIRMATION", status: "CONFIRMED",
  bookedItem: { productCode: "123164P1", travelDate: "2026-11-20", travelTime: "09:30" },
  campaignValue: `wf-consent-legacy-wfv-${"9".repeat(32)}`, grossBookingValue: 100, estimatedCommission: 8, confirmedCommission: 8,
  currencyCode: "USD", bookingDate: "2026-11-13T13:00:00Z", lastUpdated: "2026-11-13T13:00:00Z",
}));
await db.query(`select public.wf_viator_reconcile($1::jsonb, null, null, '2026-11-13T14:00:00Z'::timestamptz, null, null)`, [JSON.stringify(events)]);

const ledger = (await db.query(`select b.booking_ref, b.attribution_status, b.upload_consent_basis, u.upload_status
  from public.wf_viator_bookings b left join public.wf_google_conversion_uploads u on u.booking_ref = b.booking_ref and u.upload_kind = 'initial_booking'
  where b.booking_ref like 'BR-CONSENT-%' order by b.booking_ref`)).rows;
const byRef = Object.fromEntries(ledger.map((r) => [r.booking_ref, r]));
cases.forEach(([label, , wantBasis, wantStatus], i) => {
  const r = byRef[`BR-CONSENT-${i + 1}`];
  ok(r && r.attribution_status === "matched", `${label}: booking matched its click (got ${JSON.stringify(r)})`);
  ok(r && r.upload_consent_basis === wantBasis, `${label}: booking carries basis ${wantBasis} (got ${r && r.upload_consent_basis})`);
  ok(r && r.upload_status === wantStatus, `${label}: upload ledger is ${wantStatus} (got ${r && r.upload_status})`);
});
{
  const r = byRef["BR-CONSENT-LEGACY"];
  ok(r && r.upload_consent_basis === null && r.upload_status === "awaiting_upload",
    `a pre-rule GRANTED click (no basis recorded) still uploads, same as the JS builder (got ${JSON.stringify(r)})`);
}

// ---- 3. JS payload builder applies the same rule ---------------------------
const base = { booking_ref: "FIXTURE-JS", gclid: "FIXTURE_gclid_js", confirmed_commission: 12.34, currency: "USD", original_booking_at: "2026-11-13T13:00:00Z" };
const build = (b) => buildGoogleDataManagerEventPayload({ booking: { ...base, ...b }, conversionActionId: "7999000111" });
{
  const r = build({ upload_consent_basis: "not_required_region", consent_ad_user_data: "UNKNOWN", consent_ad_personalization: "UNKNOWN" });
  ok(r.eligible === true, `JS: not_required_region uploads (got ${JSON.stringify({ s: r.status, reason: r.reason })})`);
  const ev = r.body && r.body.events && r.body.events[0];
  ok(ev && !("consent" in ev) && !(r.body && "consent" in r.body), "JS: an unknown consent is omitted from the body, never invented as granted");
}
for (const [b, label] of [
  [{ upload_consent_basis: "gpc_opt_out", consent_ad_user_data: "UNKNOWN" }, "gpc_opt_out"],
  [{ upload_consent_basis: "restricted_region_no_consent", consent_ad_user_data: "UNKNOWN" }, "restricted region"],
  [{ upload_consent_basis: "unknown_region", consent_ad_user_data: "UNKNOWN" }, "unknown region"],
  [{ upload_consent_basis: "not_required_region", consent_ad_user_data: "DENIED" }, "DENIED beats region"],
  [{ consent_ad_user_data: "UNKNOWN" }, "no basis, no GRANTED"],
]) {
  const r = build(b);
  ok(r.eligible === false && r.status === UPLOAD_STATES.INELIGIBLE_MISSING_CONSENT, `JS: ${label} is held as ineligible_missing_consent (got ${r.status})`);
}
ok(build({ consent_ad_user_data: "GRANTED", consent_ad_personalization: "GRANTED" }).eligible === true, "JS: a pre-rule GRANTED booking with no basis still uploads");

await db.close();
if (fail.length) {
  console.error("test-viator-consent-basis: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`test-viator-consent-basis: OK (${pass} assertions; ${matrix.length} rule cases, ${cases.length} end-to-end click→booking→ledger cases in PGlite with both migrations, drift refusal, JS builder; no network)`);
