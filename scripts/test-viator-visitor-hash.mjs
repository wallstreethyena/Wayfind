#!/usr/bin/env node
// The click table accepts visitor_context_hash only as 32 lowercase hex
// characters. A 64-character sha256 digest fails the check, so the insert
// never lands and the gclid on that same row is lost.
import {
  attributedViatorDestination,
  computeVisitorContextHash,
} from "../lib/viatorAttribution.js";

const HASH_RX = /^[0-9a-f]{32}$/;
let fails = 0;
const ok = (c, m) => {
  if (!c) {
    console.error("FAIL " + m);
    fails++;
  }
};

const posthogOnly = computeVisitorContextHash({
  adContext: {},
  distinctId: "ph_cookie_distinct_id_0190",
});
const gclidOnly = computeVisitorContextHash({
  adContext: { gclid: "EAIaIQobChMI_gclid_only" },
});
const both = computeVisitorContextHash({
  adContext: { gclid: "EAIaIQobChMI_gclid_only", gbraid: "gbraid_1" },
  distinctId: "ph_cookie_distinct_id_0190",
});
const empty = computeVisitorContextHash({});

ok(HASH_RX.test(posthogOnly), "a PostHog distinct id hashes to 32 hex, got " + posthogOnly);
ok(HASH_RX.test(gclidOnly), "a gclid hashes to 32 hex, got " + gclidOnly);
ok(HASH_RX.test(both), "a PostHog id plus ad click ids hash to 32 hex, got " + both);
ok(posthogOnly !== gclidOnly && gclidOnly !== both, "different visitors do not share a hash");
ok(empty === null, "no visitor id and no ad click id stores null");

const posts = [];
const sb = { url: "https://viator-hash-test.supabase.co", key: "test_key" };
const fetchImpl = async (url, init = {}) => {
  const method = init.method || "GET";
  if (method === "POST" && String(url).endsWith("/wf_viator_clicks")) {
    posts.push(JSON.parse(init.body));
    return { ok: true, status: 201, json: async () => ({}) };
  }
  return { ok: true, status: 200, json: async () => [] };
};

const saved = await attributedViatorDestination(
  {
    offerId: "123164P1",
    destinationUrl: "https://www.viator.com/tours/Orlando/Clear-Kayak/d663-123164P1",
    pageHint: "g-things-to-do-orlando-not-theme-parks",
    surface: "guide_pick",
    contentId: "things-to-do-orlando-not-theme-parks:rock-springs-run-kayak",
    clientClickId: "wf-hash-click-1",
    adContext: {
      vid: null,
      gclid: "EAIaIQobChMI_persist_me",
      gbraid: null,
      wbraid: null,
      observed_utm_campaign: null,
      verified_google_campaign_id: null,
      google_campaign_id: null,
      campaign_metadata_provenance: "none",
      campaign_verification_status: "unverified",
      consent_ad_user_data: "UNKNOWN",
      consent_ad_personalization: "UNKNOWN",
      session_attribution: null,
      first_touch_attribution: null,
    },
    distinctId: "ph_cookie_distinct_id_0190",
  },
  { sb, fetch: fetchImpl },
);

ok(saved && saved.url && !saved.error, "a cookied click with a gclid still stores and redirects");
ok(posts.length === 1, "exactly one click row was written");
const row = posts[0] || {};
ok(HASH_RX.test(row.visitor_context_hash), "the stored hash satisfies the 32 hex check, got " + row.visitor_context_hash);
ok(row.gclid === "EAIaIQobChMI_persist_me", "the gclid is persisted on the same click row");
ok(!String(saved.url || "").includes("EAIaIQobChMI_persist_me"), "the outbound URL does not carry the raw gclid");

if (fails) {
  console.error("test-viator-visitor-hash: " + fails + " failure(s)");
  process.exit(1);
}
console.log("test-viator-visitor-hash: OK");
