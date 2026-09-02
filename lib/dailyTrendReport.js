const KINDS = new Set(["related_query", "published_destination_rank", "event_intent", "unmeasured_intent", "local_decision"]);
const LANES = new Set(["intelligence", "lead"]);
const METRICS = new Set(["related_query_score", "published_rank"]);
const SOURCE_STRENGTHS = new Set(["official", "measured", "secondary", "local_editorial", "unverified"]);

function siteDate(nowMs) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(nowMs));
}

function dayNumber(date) {
  const ms = Date.parse(`${date}T12:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 86400000) : null;
}

export function validateDailyTrendReport(input) {
  const errors = [];
  const r = input || {};
  if (r.schemaVersion !== "wayfind-daily-trends-v1") errors.push("schemaVersion must be wayfind-daily-trends-v1");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.reportDate || "")) errors.push("reportDate must be YYYY-MM-DD");
  if (r.region !== "US-FL") errors.push("region must be US-FL");
  if (!Array.isArray(r.items) || !r.items.length) errors.push("items must be a nonempty list");

  const ranks = new Set();
  for (const [index, item] of (r.items || []).entries()) {
    const at = `items[${index}]`;
    if (!Number.isInteger(item.rank) || item.rank < 1) errors.push(`${at}.rank must be a positive integer`);
    if (ranks.has(item.rank)) errors.push(`${at}.rank duplicates ${item.rank}`);
    ranks.add(item.rank);
    if (!item.phrase || !String(item.phrase).trim()) errors.push(`${at}.phrase is required`);
    if (!KINDS.has(item.kind)) errors.push(`${at}.kind is not allowed`);
    if (!LANES.has(item.lane)) errors.push(`${at}.lane is not allowed`);
    if (!item.target || !item.action) errors.push(`${at} needs target and action`);
    if (!item.source || !item.source.name || !SOURCE_STRENGTHS.has(item.source.strength)) errors.push(`${at}.source is incomplete`);
    if (item.metric) {
      if (!METRICS.has(item.metric.name)) errors.push(`${at}.metric.name is not allowed`);
      if (!Number.isFinite(item.metric.value)) errors.push(`${at}.metric.value must be finite`);
    }
    if (item.kind === "related_query" && (!item.metric || item.metric.name !== "related_query_score")) errors.push(`${at} related query needs a related query score`);
    if (item.kind === "published_destination_rank" && (!item.metric || item.metric.name !== "published_rank")) errors.push(`${at} published rank needs a published rank metric`);
    if (item.kind === "event_intent" && (!item.event || !item.event.name || !item.event.startsOn || !item.event.endsOn)) errors.push(`${at} event intent needs event dates and a name`);
  }
  return { ok: errors.length === 0, errors, count: (r.items || []).length };
}

export function trendItemStatus(item, { nowMs = Date.now() } = {}) {
  const today = siteDate(nowMs);
  if (item.kind === "event_intent") {
    if (today > item.event.endsOn) return { key: "expired", label: "Expired" };
    if (today < item.event.startsOn) return { key: "upcoming", label: "Upcoming" };
    return { key: "live", label: "Live today" };
  }
  if (item.source && item.source.strength === "unverified") return { key: "held", label: "Hold" };
  if (item.maxAgeDays && item.observedOn) {
    const age = dayNumber(today) - dayNumber(item.observedOn);
    if (age > item.maxAgeDays) return { key: "stale", label: "Stale" };
  }
  return { key: "active", label: "Active" };
}

export function dailyTrendIntelligence({ nowMs = Date.now(), input } = {}) {
  const validation = validateDailyTrendReport(input);
  if (!validation.ok) throw new Error(`daily trend report invalid: ${validation.errors.join("; ")}`);

  const items = input.items.map((item) => {
    const status = trendItemStatus(item, { nowMs });
    const valueLabel = item.metric
      ? item.metric.name === "related_query_score" ? `Related score ${item.metric.value}` : `Published rank ${item.metric.value}`
      : item.kind === "event_intent" ? `${item.event.startsOn}${item.event.endsOn !== item.event.startsOn ? ` to ${item.event.endsOn}` : ""}`
      : "No volume claimed";
    return { ...item, status, valueLabel };
  });

  const actionable = items.filter((item) => !["expired", "stale", "held"].includes(item.status.key));
  return {
    report: {
      schemaVersion: input.schemaVersion,
      reportDate: input.reportDate,
      region: input.region,
      sourceStatus: input.sourceStatus,
      sourceNote: input.sourceNote,
      count: items.length,
      actionableCount: actionable.length,
      expiredCount: items.filter((item) => item.status.key === "expired").length,
      heldCount: items.filter((item) => item.status.key === "held").length,
    },
    intelligence: items.filter((item) => item.lane === "intelligence"),
    leads: items.filter((item) => item.lane === "lead"),
    excluded: input.excluded || [],
    safeguards: {
      affectsDisplayedWayfindScore: false,
      publishesCardsAutomatically: false,
      startsGooglePlaceCalls: false,
      rule: "A report creates a decision lead. Existing geo, event, editorial, CTA, and freshness gates still decide what can publish.",
    },
  };
}
