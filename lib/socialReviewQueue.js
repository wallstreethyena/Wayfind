import { qualifySocialPost } from "./socialQualification.js";
import { resolveSocialPlace } from "./socialIdentity.js";

function creatorKey(platform, handle) {
  return `${String(platform || "").toLowerCase()}:${String(handle || "").trim().replace(/^@/, "").toLowerCase()}`;
}

export async function readSocialPages(db, table, columns, key, { ceiling = 40000, signal } = {}) {
  const rows = [];
  let cursor = null;
  while (true) {
    let query = db.from(table).select(columns).order(key, { ascending: true }).limit(500);
    if (table === "wf_inventory") query = query.eq("status", "OPERATIONAL");
    if (cursor !== null) query = query.gt(key, cursor);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) throw new Error("social_read_failed:" + table);
    if (!data.length) return rows;
    for (const row of data) {
      if (typeof row[key] !== "string" || (cursor !== null && row[key] <= cursor)) throw new Error("social_cursor_invalid:" + table);
      cursor = row[key]; rows.push(row);
      if (rows.length > ceiling) throw new Error("social_read_ceiling:" + table);
    }
  }
}

export function buildSocialReviewQueue(leads, inventory, { now, creators = [] } = {}) {
  const seen = new Set(), rejected = {}, candidates = [];
  const creatorMap = new Map((Array.isArray(creators) ? creators : []).map((row) => [creatorKey(row.platform, row.handle), row]));
  let duplicates = 0;
  for (const lead of leads) {
    const id = `${lead.platform}:${lead.media_id}`;
    if (seen.has(id)) { duplicates++; continue; }
    seen.add(id);
    if (lead.review_status === "rejected") { rejected.previously_rejected = (rejected.previously_rejected || 0) + 1; continue; }
    const creator = creatorMap.get(creatorKey(lead.platform, lead.handle)) || null;
    const decision = qualifySocialPost(lead, { now, creator });
    if (!decision.eligible) { rejected[decision.reason] = (rejected[decision.reason] || 0) + 1; continue; }
    const identity = resolveSocialPlace(lead, { creator, inventory, now });
    candidates.push({ media_id: lead.media_id, platform: lead.platform, permalink: lead.permalink,
      qualification: decision.reason, seasonal_evidence: decision.evidence, identity,
      publishable: false, required: ["post_specific_location_verification", "current_offering_verification", "source_rights", "quality_review", "venue_photo"] });
  }
  return { inspected: leads.length, duplicates, rejected, candidates, published: 0,
    paid_calls: 0, mode: "private_review", coverage: "stored_leads_only" };
}
