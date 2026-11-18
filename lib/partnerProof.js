// lib/partnerProof.js — the only place the partners pitch audience numbers live.
//
// Owner still needs to confirm the exact date range behind these counts.
// Until that confirmation, the pitch may quote them only as written here:
// last 90 days, counted early November 2026, source PostHog unique visitors.
// Do not copy the digits into a page, a mailto, or a second module.

export const VERIFIED_AUDIENCE = Object.freeze({
  visitors: 16000,
  floridaVisitors: 3900,
  windowLabel: "last 90 days, counted early November 2026",
  countedLine: "Counted in early November 2026.",
  source: "PostHog unique visitors",
});

export function formatAudienceCount(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return "";
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function audienceProofParts(audience = VERIFIED_AUDIENCE) {
  return Object.freeze({
    visitors: formatAudienceCount(audience.visitors),
    floridaVisitors: formatAudienceCount(audience.floridaVisitors),
    period: String(audience.windowLabel || "").split(",")[0],
    countedLine: String(audience.countedLine || ""),
  });
}

export function audienceProofSentence(audience = VERIFIED_AUDIENCE) {
  const p = audienceProofParts(audience);
  return `About ${p.visitors} people used Wayfind in the ${p.period}. About ${p.floridaVisitors} of them were in Florida. ${p.countedLine}`;
}
