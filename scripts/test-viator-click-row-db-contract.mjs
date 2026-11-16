#!/usr/bin/env node
// scripts/test-viator-click-row-db-contract.mjs
//
// The Viator click row that attributedViatorDestination() builds must be
// ACCEPTED by the real wf_viator_clicks table, and must keep the Google click
// id, for the landings ad visitors actually arrive with.
//
// Why this exists (2026-11-12): `observed_utm_campaign` is check-constrained
// to a numeric Google Ads campaign id (^[0-9]{8,16}$), but the code copied the
// utm_campaign NAME into it. Google Ads traffic lands with
// utm_campaign=wf_fl_search (PostHog, 2026-11-05..12: 866 ad landings), so
// Postgres rejected every click row those visitors produced, gclid included,
// and the insert error was swallowed. Result: 0 of 2,414 stored clicks kept a
// gclid while 54 of 63 Viator CTA clicks came from ad sessions. The earlier
// 64-hex visitor hash bug (#2354) failed the same way. Both were invisible
// because no test ever put a built row through the real table constraints.
//
// This test asserts on the CALL: it runs the real redirect attribution code
// with a fixture cookie, then inserts the exact row it POSTs into PGlite
// loaded with the production migration. Fixture identifiers only; nothing
// leaves the process.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { attributedViatorDestination } from "../lib/viatorAttribution.js";
import { encodeAdClickCookie, resolveGoogleCampaignObservation } from "../lib/adClickCookie.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = [];
const ok = (c, m) => (c ? pass++ : fail.push(m));

const db = new PGlite();
await db.exec(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;`);
await db.exec(fs.readFileSync(path.join(REPO, "supabase/migrations/20261103220000_wf_viator_booking_attribution.sql"), "utf8"));
await db.exec(fs.readFileSync(path.join(REPO, "supabase/migrations/20261113105510_wf_viator_upload_consent_basis.sql"), "utf8"));
// A second database with ONLY the original schema: the tier 2 fallback must land there too.
const baseOnlyDb = new PGlite();
await baseOnlyDb.exec(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;`);
await baseOnlyDb.exec(fs.readFileSync(path.join(REPO, "supabase/migrations/20261103220000_wf_viator_booking_attribution.sql"), "utf8"));

// Insert exactly the keys the code sends; everything else takes its DB default.
async function insertRow(row) {
  const cols = Object.keys(row);
  const ident = cols.map((c) => `"${c.replace(/"/g, "")}"`).join(", ");
  try {
    await db.query(
      `insert into public.wf_viator_clicks (${ident})
       select ${ident} from json_populate_record(null::public.wf_viator_clicks, $1::json)`,
      [JSON.stringify(row)],
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

// Positive control: the constraint this test depends on is live in the table.
const ctl = await insertRow({
  click_token: "wfv_" + "0".repeat(32), provider: "viator", offer_id: "CTRL", surface: "ctrl",
  placement_campaign: "wf-ctrl", attributed_campaign: "wf-ctrl", destination_host: "www.viator.com",
  observed_utm_campaign: "wf_fl_search",
});
ok(ctl.ok === false && /observed_utm_campaign/.test(ctl.error),
  `positive control: the real table rejects a campaign NAME in observed_utm_campaign (got ${JSON.stringify(ctl)})`);

let tokenSeq = 0;
async function runLanding(label, sessionRecord, legacyRecord) {
  const cookie = encodeAdClickCookie({ sessionRecord, legacyRecord, visitorNonce: "fixturevisitor0123456789abcdefABCD" });
  let posted = null;
  let stored = null;
  const fakeFetch = async (url, opts = {}) => {
    if ((opts.method || "GET") === "POST") {
      posted = JSON.parse(opts.body);
      stored = await insertRow(posted);
      return { ok: stored.ok, status: stored.ok ? 201 : 400, json: async () => [] };
    }
    return { ok: true, status: 200, json: async () => [] };
  };
  const warn = console.warn; const warnings = [];
  console.warn = (m) => warnings.push(String(m));
  let res;
  try {
    res = await attributedViatorDestination({
      offerId: "123P45", destinationUrl: "https://www.viator.com/tours/Tampa/x/d666-123P45",
      pageHint: "christmas", surface: "christmas_tours", clientClickId: "c_fixture_" + label.replace(/\W/g, ""),
      cookieHeader: "wf_device=x; wf_ad_ctx=" + cookie, distinctId: "fixture-distinct", trafficClass: "human",
    }, {
      sb: { url: "https://fixture.invalid", key: "fixture" }, fetch: fakeFetch, now: "2026-11-12T23:05:00Z",
      mintToken: () => "wfv_" + (++tokenSeq).toString(16).padStart(32, "a"),
    });
  } finally { console.warn = warn; }
  return { res, posted, stored, warnings };
}

const cases = [
  ["ad landing with a campaign NAME (the live case)", { v: 1, at: "2026-11-12T23:00:00Z", p: { utm_source: "google", utm_medium: "cpc", utm_campaign: "wf_fl_search", gclid: "FIXTURE_gclid_name" }, lp: "/", rd: "" }, null, "gclid", "FIXTURE_gclid_name", null],
  ["ad landing with a numeric campaign id", { v: 1, at: "2026-11-12T23:00:00Z", p: { utm_source: "google", utm_campaign: "24380159401", gclid: "FIXTURE_gclid_num" }, lp: "/", rd: "" }, null, "gclid", "FIXTURE_gclid_num", "24380159401"],
  ["ad landing with no utm tags (auto-tagging only)", { v: 1, at: "2026-11-12T23:00:00Z", p: { gclid: "FIXTURE_gclid_bare" }, lp: "/", rd: "" }, null, "gclid", "FIXTURE_gclid_bare", null],
  ["iOS ad landing with gbraid and a campaign name", { v: 1, at: "2026-11-12T23:00:00Z", p: { utm_source: "google", utm_campaign: "Florida Christmas", gbraid: "FIXTURE_gbraid" }, lp: "/christmas", rd: "" }, null, "gbraid", "FIXTURE_gbraid", null],
  ["legacy storage only, campaign name", null, { utm_source: "google", utm_campaign: "wf_fl_search", gclid: "FIXTURE_gclid_legacy", landed_at: "2026-11-12T22:00:00Z" }, "gclid", "FIXTURE_gclid_legacy", null],
];
for (const [label, sess, leg, idKey, idVal, expectObserved] of cases) {
  const r = await runLanding(label, sess, leg);
  ok(r.posted !== null, `${label}: the code attempted to store a click row`);
  ok(r.stored && r.stored.ok === true, `${label}: the real table ACCEPTS the row (got ${JSON.stringify(r.stored)})`);
  ok(r.posted && r.posted[idKey] === idVal, `${label}: the stored row keeps ${idKey}`);
  ok(r.posted && (r.posted.observed_utm_campaign ?? null) === expectObserved,
    `${label}: observed_utm_campaign is ${JSON.stringify(expectObserved)} (got ${JSON.stringify(r.posted && r.posted.observed_utm_campaign)})`);
  ok(r.res && r.res.clickToken && !r.res.error, `${label}: the redirect gets an attributed click token`);
  ok(r.warnings.length === 0, `${label}: no store-failure warning`);
}

// The campaign NAME is not lost: it stays in the session snapshot.
{
  const r = await runLanding("name kept in snapshot", { v: 1, at: "2026-11-12T23:00:00Z", p: { utm_source: "google", utm_campaign: "wf_fl_search", gclid: "FIXTURE_gclid_snap" }, lp: "/", rd: "" }, null);
  ok(r.posted && r.posted.session_attribution && r.posted.session_attribution.utm_campaign === "wf_fl_search",
    "campaign name survives in session_attribution");
}

// Every rows' rows are in the table and each kept its Google click id.
const stats = await db.query(`select count(*)::int n, count(*) filter (where gclid is not null or gbraid is not null)::int with_id from public.wf_viator_clicks where surface = 'christmas_tours'`);
ok(stats.rows[0].n === 6 && stats.rows[0].with_id === 6, `all 6 fixture clicks stored with a Google click id (got ${JSON.stringify(stats.rows[0])})`);

// A store failure is no longer silent.
{
  const warn = console.warn; const warnings = [];
  console.warn = (m) => warnings.push(String(m));
  try {
    await attributedViatorDestination({
      offerId: "123P45", destinationUrl: "https://www.viator.com/tours/Tampa/x/d666-123P45", pageHint: "x", surface: "x_surface",
      cookieHeader: "wf_ad_ctx=" + encodeAdClickCookie({ sessionRecord: { v: 1, p: { gclid: "FIXTURE_gclid_fail" } } }), trafficClass: "human",
    }, { sb: { url: "https://fixture.invalid", key: "k" }, fetch: async (u, o = {}) => ({ ok: (o.method || "GET") !== "POST", status: (o.method || "GET") === "POST" ? 400 : 200, json: async () => [] }), mintToken: () => "wfv_" + "f".repeat(32) });
  } finally { console.warn = warn; }
  const ws = warnings.map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter((x) => x && x.tag === "viator_click_store_failed");
  ok(ws.length === 3 && ws.every((w) => w.status === 400 && w.had_google_click_id === true) && ws.map((w) => w.tier).join() === "0,1,2",
    `a rejected insert logs viator_click_store_failed for the first try and both fallbacks (got ${JSON.stringify(warnings)})`);
  ok(!warnings.join(" ").includes("FIXTURE_gclid_fail"), "the failure log never contains the click id itself");
}

// A rejected insert never silently drops the Google click id or the campaign
// snapshot: simulate a future typed-field bug (the exact 2026-11-12 failure:
// a campaign NAME in the numeric observed_utm_campaign column) on the first
// attempt only, and require the fallback to land the row in the REAL table.
{
  const cookie = encodeAdClickCookie({ sessionRecord: { v: 1, at: "2026-11-12T23:00:00Z", p: { utm_source: "google", utm_campaign: "wf_fl_search", gclid: "FIXTURE_gclid_fallback" }, lp: "/", rd: "" }, visitorNonce: "fixturevisitor0123456789abcdefFALL" });
  let attempt = 0; const outcomes = [];
  const fakeFetch = async (url, opts = {}) => {
    if ((opts.method || "GET") !== "POST") return { ok: true, status: 200, json: async () => [] };
    attempt++;
    const row = JSON.parse(opts.body);
    if (attempt === 1) row.observed_utm_campaign = "wf_fl_search"; // the old bug, injected
    const r = await insertRow(row);
    outcomes.push({ attempt, ok: r.ok, error: r.error || null });
    return { ok: r.ok, status: r.ok ? 201 : 400, json: async () => [] };
  };
  const warn = console.warn; const warnings = [];
  console.warn = (m) => warnings.push(String(m));
  let res;
  try {
    res = await attributedViatorDestination({
      offerId: "123P45", destinationUrl: "https://www.viator.com/tours/Tampa/x/d666-123P45", pageHint: "christmas", surface: "fallback_surface",
      clientClickId: "c_fixture_fallback", cookieHeader: "wf_ad_ctx=" + cookie, trafficClass: "human",
    }, { sb: { url: "https://fixture.invalid", key: "k" }, fetch: fakeFetch, now: "2026-11-12T23:06:00Z", mintToken: () => "wfv_" + "e".repeat(32) });
  } finally { console.warn = warn; }
  ok(outcomes[0] && outcomes[0].ok === false && /observed_utm_campaign/.test(outcomes[0].error),
    `fallback: the injected old-bug row is rejected by the real table (got ${JSON.stringify(outcomes[0])})`);
  ok(outcomes[1] && outcomes[1].ok === true, `fallback: the tier 1 row is accepted by the real table (got ${JSON.stringify(outcomes[1])})`);
  ok(res && res.clickToken && !res.error && res.degraded === true, `fallback: the redirect still gets an attributed click token (got ${JSON.stringify(res)})`);
  const stored = await db.query(`select gclid, session_attribution->>'utm_campaign' as camp, observed_utm_campaign from public.wf_viator_clicks where surface = 'fallback_surface'`);
  ok(stored.rows.length === 1 && stored.rows[0].gclid === "FIXTURE_gclid_fallback" && stored.rows[0].camp === "wf_fl_search" && stored.rows[0].observed_utm_campaign === null,
    `fallback: the stored row keeps the gclid and the campaign name snapshot (got ${JSON.stringify(stored.rows)})`);
  const tags = warnings.map((x) => { try { return JSON.parse(x); } catch { return {}; } });
  ok(tags.some((t) => t.tag === "viator_click_store_failed" && t.tier === 0 && t.status === 400 && t.had_google_click_id === true), "fallback: the first rejection is logged, not swallowed");
  ok(tags.some((t) => t.tag === "viator_click_store_recovered" && t.tier === 1), "fallback: the recovery is logged");
  ok(!warnings.join(" ").includes("FIXTURE_gclid_fallback"), "fallback: logs never contain the click id");
}

// Tier 2 keeps every Google click id and both snapshots, drops only typed metadata,
// and is accepted by the real table on its own.
{
  const { viatorClickFallbackRows } = await import("../lib/viatorAttribution.js");
  const base = { click_token: "wfv_" + "d".repeat(32), provider: "viator", offer_id: "T2", surface: "tier2_surface", placement_campaign: "wf-t2", attributed_campaign: "wf-t2", destination_host: "www.viator.com", gclid: "FIXTURE_g2", gbraid: "FIXTURE_b2", wbraid: null, observed_utm_campaign: "not-a-number", verified_google_campaign_id: "x", google_campaign_id: "y", campaign_metadata_provenance: "url_utm_unverified", campaign_verification_status: "unverified", session_attribution: { utm_campaign: "wf_fl_search" }, first_touch_attribution: { utm_campaign: "wf_fl_search" }, page_key: "p", content_id: "c" };
  const [t1, t2] = viatorClickFallbackRows(base);
  for (const [name, r] of [["tier 1", t1], ["tier 2", t2]]) {
    ok(r.gclid === "FIXTURE_g2" && r.gbraid === "FIXTURE_b2" && "wbraid" in r, `${name} keeps gclid, gbraid and wbraid`);
    ok(r.session_attribution && r.session_attribution.utm_campaign === "wf_fl_search" && r.first_touch_attribution, `${name} keeps both campaign snapshots`);
    ok(r.observed_utm_campaign == null && r.google_campaign_id == null && r.verified_google_campaign_id == null, `${name} drops the typed campaign-id fields`);
  }
  const ins = await insertRow(t2);
  ok(ins.ok === true, `tier 2 row is accepted by the real table (got ${JSON.stringify(ins)})`);
  ok(!("upload_consent_basis" in t2), "tier 2 uses only original-schema columns");
  const t2b = { ...t2, click_token: "wfv_" + "b".repeat(32), surface: "tier2_baseonly" };
  const cols = Object.keys(t2b); const ident = cols.map((c) => `"${c}"`).join(", ");
  let baseErr = null;
  try { await baseOnlyDb.query(`insert into public.wf_viator_clicks (${ident}) select ${ident} from json_populate_record(null::public.wf_viator_clicks, $1::json)`, [JSON.stringify(t2b)]); } catch (e) { baseErr = String(e.message || e); }
  ok(baseErr === null, `tier 2 lands even on the original schema before newer migrations (got ${baseErr})`);
}

// Verified-campaign path only emits statuses the table allows.
{
  const allowed = ["not_applicable", "unverified", "verified", "mismatch"];
  for (const [sess, auth] of [[{ utm_campaign: "11111111111" }, "22222222222"], [{ utm_campaign: "22222222222" }, "22222222222"], [{ utm_campaign: "wf_fl_search" }, "22222222222"]]) {
    const o = resolveGoogleCampaignObservation({ sessionAttribution: sess, authoritativeCampaignId: auth });
    ok(allowed.includes(o.campaign_verification_status), `verification status ${o.campaign_verification_status} is one the table allows`);
  }
}

await db.close();
await baseOnlyDb.close();
if (fail.length) {
  console.error("test-viator-click-row-db-contract: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`test-viator-click-row-db-contract: OK (${pass} assertions; built rows inserted into PGlite with the production wf_viator_clicks constraints; 5 landing shapes; no network)`);
