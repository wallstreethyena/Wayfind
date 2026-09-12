export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { createClient } from "@supabase/supabase-js";
import { readSocialPages, readSocialIdentityInventory, buildSocialReviewQueue } from "../../../../lib/socialReviewQueue.js";
import { recordPulse } from "../../../../lib/jobPulse.js";

function ownerDiscoveryLead(row) {
  return {
    media_id: row.media_id,
    platform: row.platform,
    source: "owner_submission",
    handle: row.creator_handle || null,
    caption: row.title || "",
    permalink: row.permalink,
    like_count: row.observed_likes ?? null,
    review_status: row.qualification_status === "rejected" ? "rejected" : "new",
    candidate_place_id: row.candidate_place_id || null,
    owner_seasonal_evidence: Array.isArray(row.seasonal_evidence) ? row.seasonal_evidence : [],
  };
}

// Read-only preflight over stored social evidence. No model calls or publication.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const headers = { "cache-control": "no-store" };
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    await recordPulse("social-intelligence", { attempted: 1, succeeded: 0, failed: 1, note: "configuration: missing Supabase credentials" });
    return Response.json({ ok: false, error: "supabase_unconfigured" }, { status: 503, headers });
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  try {
    const signal = AbortSignal.timeout(45000);
    const [candidateLeads, ownerDiscoveries, creators] = await Promise.all([
      readSocialPages(db, "wf_social_candidates", "media_id,platform,source,handle,caption,permalink,like_count,creator_follower_count,follower_observed_at,review_status,source_place_id,candidate_place_id,location_name,location_city,location_lat,location_lng", "media_id", { signal }),
      readSocialPages(db, "wf_social_discoveries", "discovery_id,media_id,provider,platform,permalink,creator_handle,title,observed_likes,seasonal_evidence,qualification_status,candidate_place_id,identity_status,identity_method", "discovery_id", { ceiling: 5000, signal, filters: { provider: "owner_submission" } }),
      readSocialPages(db, "wf_social_creators", "id,platform,handle,status,evidence_url,reviewed_at,expires_at,canonical_place_id", "id", { ceiling: 5000, signal }),
    ]);
    const leads = [...candidateLeads, ...ownerDiscoveries.map(ownerDiscoveryLead)];
    if (!leads.length) {
      await recordPulse("social-intelligence", { attempted: 0, succeeded: 0, failed: 0, note: "healthy empty: no stored social leads" });
      return Response.json({ ok: true, publication_enabled: false, mode: "private_review", acquisition_status: "no_stored_leads",
        inspected: 0, candidates: [], rejected: {}, duplicates: 0, published: 0, paid_calls: 0,
        inventory_read: 0, creators_read: creators.length, owner_submissions_read: ownerDiscoveries.length }, { headers });
    }
    const inventory = await readSocialIdentityInventory(db, leads, creators, { signal });
    const report = buildSocialReviewQueue(leads, inventory, { now: Date.now(), creators });
    await recordPulse("social-intelligence", { attempted: report.inspected, succeeded: report.candidates.length,
      failed: Object.values(report.rejected).reduce((sum, count) => sum + Number(count || 0), 0),
      note: `private-preflight; stored:${leads.length}; owner:${ownerDiscoveries.length}; candidates:${report.candidates.length}; published:0` });
    return Response.json({ ok: true, publication_enabled: false, ...report,
      acquisition_status: leads.length ? "stored_leads_available" : "no_stored_leads",
      inventory_read: inventory.length, creators_read: creators.length, owner_submissions_read: ownerDiscoveries.length }, { headers });
  } catch {
    await recordPulse("social-intelligence", { attempted: 1, succeeded: 0, failed: 1, note: "private preflight failed" });
    return Response.json({ ok: false, error: "social_preflight_incomplete" }, { status: 503, headers });
  }
}
