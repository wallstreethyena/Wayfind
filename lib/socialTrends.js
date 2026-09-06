import { seasonalEvidence, SOCIAL_POLICY_VERSION } from "./socialQualification.js";

export function buildWeeklySocialTrendReport(leads, { start, end, region = "FL" } = {}) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("valid trend window required");
  const category = new Map();
  let qualified = 0, likes = 0, comments = 0, resolved = 0;
  for (const lead of Array.isArray(leads) ? leads : []) {
    const seen = Date.parse(lead.last_seen_at || lead.posted_at);
    if (!Number.isFinite(seen) || seen < start || seen >= end) continue;
    if (!lead.qualification_reason) continue;
    qualified++;
    likes += Number.isSafeInteger(lead.like_count) ? lead.like_count : 0;
    comments += Number.isSafeInteger(lead.comments_count) ? lead.comments_count : 0;
    if (lead.candidate_place_id) resolved++;
    for (const evidence of seasonalEvidence(lead.caption)) {
      const row = category.get(evidence.category) || { category: evidence.category, leads: 0, likes: 0, comments: 0 };
      row.leads++; row.likes += Number.isSafeInteger(lead.like_count) ? lead.like_count : 0;
      row.comments += Number.isSafeInteger(lead.comments_count) ? lead.comments_count : 0;
      category.set(evidence.category, row);
    }
  }
  const categories = [...category.values()].sort((a, b) => b.leads - a.leads || b.likes - a.likes || a.category.localeCompare(b.category));
  return { region, policy: SOCIAL_POLICY_VERSION, window_start: new Date(start).toISOString(), window_end: new Date(end).toISOString(), qualified_leads: qualified, resolved_leads: resolved, observed_likes: likes, observed_comments: comments, categories };
}
