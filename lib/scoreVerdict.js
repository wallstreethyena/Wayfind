// Server-side publication gate for original, evidence-linked editorial.
// Rights are reviewed in a separate registry, never granted by model output.
const date = (s) => typeof s === "string" ? Date.parse(s) : NaN;
const https = (s) => { try { const u = new URL(s); return u.protocol === "https:" && !u.username && !u.password; } catch { return false; } };
export function publishableVerdict(record, policies, now) {
  if (!record || record.version !== 1 || record.status !== "reviewed"
      || typeof record.placeId !== "string" || !record.placeId
      || typeof record.reviewedBy !== "string" || !record.reviewedBy
      || !Number.isFinite(now) || !(date(record.reviewedAt) <= now)
      || !(date(record.expiresAt) > now)
      || !Array.isArray(record.sentences) || record.sentences.length !== 2
      || !Array.isArray(record.sources) || !record.sources.length
      || !["venue_information", "independent_sources", "firsthand"].includes(record.coverage)) return null;
  const sources = new Map();
  for (const s of record.sources) {
    if (!s || typeof s !== "object") return null;
    const policy = policies?.[s.policyId];
    if (!s.id || sources.has(s.id) || s.placeId !== record.placeId
        || !https(s.url) || typeof s.title !== "string" || !s.title.trim()
        || !(date(s.checkedAt) <= now) || !(date(s.expiresAt) > now)
        || !(date(s.checkedAt) <= date(record.reviewedAt))
        || !policy || policy.deriveFacts !== true || policy.displayOriginalVerdict !== true
        || !Array.isArray(policy.urls) || !policy.urls.includes(s.url)
        || !(date(policy.reviewedAt) <= now) || !(date(policy.expiresAt) > now)) return null;
    sources.set(s.id, { id: s.id, title: s.title, url: s.url, checkedAt: s.checkedAt });
  }
  for (const sentence of record.sentences) {
    if (!sentence || typeof sentence.text !== "string" || !sentence.text.trim() || sentence.text.length > 500
        || !Array.isArray(sentence.sourceIds) || !sentence.sourceIds.length
        || sentence.sourceIds.some((id) => !sources.has(id))) return null;
  }
  // Allowlist response fields. Never send source payloads, prompts or rights
  // notes to the browser. Two reviewed sentences are a contract; the validator
  // verifies structure/provenance, not semantic truth or a model's confidence.
  return { placeId: record.placeId, sentences: record.sentences.map(({ text, sourceIds }) => ({ text, sourceIds })),
    sources: [...sources.values()], coverage: record.coverage, reviewedAt: record.reviewedAt };
}

export async function serveScoreVerdict(id, { records, policies, approve, now }) {
  const record = records.find((r) => r?.placeId === id);
  if (!record) return { status: 200, body: { state: "not_researched" } };
  const verdict = publishableVerdict(record, policies, now);
  if (!verdict) return { status: 200, body: { state: "needs_review" } };
  // Judge the identity actually being returned, never a name/alias shortcut.
  try {
    const approval = await approve(verdict.placeId);
    if (!approval?.ok) return { status: 503, body: { state: "unavailable" } };
  } catch { return { status: 503, body: { state: "unavailable" } }; }
  return { status: 200, body: { state: "ready", verdict } };
}
