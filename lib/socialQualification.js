// Acquisition policy, not publication approval. No network, clock or model calls.
// A source's home city is never proof of the destination in a particular post.
export const SOCIAL_POLICY_VERSION = "fl-fall-v1";
export const UNKNOWN_CREATOR_LIKES_EXCLUSIVE = 1000;

export function observedCount(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

const OFFERINGS = [
  ["pumpkin_patch", /\bpumpkin\s+(?:patch|festival|picking)\b/i],
  ["corn_maze", /\bcorn\s+maze\b/i],
  ["hayride", /\bhay\s?rides?\b/i],
  ["fall_festival", /\b(?:fall|harvest|autumn)\s+(?:festival|fair|celebration|market)\b/i],
  ["haunted_attraction", /\b(?:haunted\s+(?:house|trail|attraction|ride|maze)|horror\s+nights|howl.o.scream)\b/i],
  ["family_halloween", /\b(?:trunk.or.treat|trick.or.treat|halloween\s+(?:parade|festival|event|party))\b/i],
  ["ghost_tour", /\bghost\s+tours?\b/i],
  ["oktoberfest", /\boktoberfest\b/i],
  ["seasonal_food", /\b(?:fall|autumn|halloween|pumpkin\s+spice|apple\s+cider)\s+(?:menu|tasting|drink|latte|coffee|dessert|donut|doughnut|cocktail|flight|special)s?\b/i],
  ["halloween_nightlife", /\b(?:halloween|costume|spooky)\s+(?:party|parties|bar\s+crawl|date\s+night|dinner)\b/i],
  ["limited_popup", /\b(?:fall|autumn|halloween)\s+pop.up\b/i],
];

export function seasonalEvidence(caption) {
  const text = String(caption || "");
  return OFFERINGS.flatMap(([category, pattern]) => {
    const match = text.match(pattern);
    return match ? [{ category, quote: match[0] }] : [];
  });
}

export function creatorQualified(creator, platform, handle, now) {
  // Qualification comes from a reviewed registry, not from untrusted post fields.
  return !!(creator && creator.platform === platform && creator.handle === handle
    && creator.status === "approved" && creator.evidence_url
    && Number.isFinite(Date.parse(creator.reviewed_at))
    && Date.parse(creator.reviewed_at) <= now
    && Date.parse(creator.expires_at) > now);
}

export function qualifySocialPost(post, { creator = null, now } = {}) {
  if (!Number.isFinite(now)) throw new Error("social qualification requires an explicit observation time");
  const evidence = seasonalEvidence(post?.caption);
  const likes = observedCount(post?.like_count);
  const trusted = creatorQualified(creator, post?.platform, post?.handle, now);
  const base = { policy: SOCIAL_POLICY_VERSION, evidence, likes, creator_qualified: trusted, publish: false };
  if (!evidence.length) return { ...base, eligible: false, reason: "no_seasonal_offering" };
  if (!trusted && (likes === null || likes <= UNKNOWN_CREATOR_LIKES_EXCLUSIVE)) {
    return { ...base, eligible: false, reason: likes === null ? "likes_unavailable" : "below_like_threshold" };
  }
  // The scout does not have authoritative destination evidence yet. Only qualified
  // leads proceed to identity verification; nobody is published from this decision.
  return { ...base, eligible: true, reason: trusted ? "qualified_creator" : "likes_over_1000", next: "verify_florida_destination" };
}

export function sourceRetryDue(health, now) {
  if (!health || health.ok || health.fail_count < 3) return true;
  const last = Date.parse(health.last_checked_at);
  return !Number.isFinite(last) || now - last >= 24 * 60 * 60 * 1000;
}

export async function safeSocialJson(url, { fetcher = fetch, timeoutMs = 8000 } = {}) {
  try {
    const response = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.error || !body || typeof body !== "object" || Array.isArray(body)) {
      // Do not include provider error text or URLs: either can contain tokens.
      return { ok: false, error: `provider_response_${response.status}`, body: null };
    }
    return { ok: true, body };
  } catch {
    return { ok: false, error: "network_or_timeout", body: null };
  }
}
