export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { createClient } from "@supabase/supabase-js";
import { readSocialPages, buildSocialReviewQueue } from "../../../../lib/socialReviewQueue.js";

// Read-only preflight over the existing schema. No model calls or schedule.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const headers = { "cache-control": "no-store" };
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ ok: false, error: "supabase_unconfigured" }, { status: 503, headers });
  const db = createClient(url, key, { auth: { persistSession: false } });
  try {
    const signal = AbortSignal.timeout(45000);
    const [leads, inventory, creators] = await Promise.all([
      readSocialPages(db, "wf_social_candidates", "media_id,platform,source,handle,caption,permalink,like_count,creator_follower_count,follower_observed_at,review_status", "media_id", { signal }),
      readSocialPages(db, "wf_inventory", "place_id,name,lat,lng,metro,state,status", "place_id", { signal }),
      readSocialPages(db, "wf_social_creators", "id,platform,handle,status,evidence_url,reviewed_at,expires_at,canonical_place_id", "id", { ceiling: 5000, signal }),
    ]);
    const report = buildSocialReviewQueue(leads, inventory, { now: Date.now(), creators });
    return Response.json({ ok: true, publication_enabled: false, ...report,
      acquisition_status: leads.length ? "stored_leads_available" : "no_stored_leads",
      inventory_read: inventory.length, creators_read: creators.length }, { headers });
  } catch {
    return Response.json({ ok: false, error: "social_preflight_incomplete" }, { status: 503, headers });
  }
}
