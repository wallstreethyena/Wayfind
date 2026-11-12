// Wayfind Trend Score V1 (owner brief, 2026-11-12). Pure, server only.
//
// ONE scoring module for every Trending candidate: a place, an event, or a
// social post (Wayfind's own Reel or carousel, or a creator post) attached to
// any of them. Nothing here needs a place_id; a candidate is
// { kind, id, entity, signals }. The full specification, the reasoning behind
// each weight and the worked examples live in docs/trending-model-v1.md;
// scripts/test-trend-engine.mjs locks the behaviour that matters.
//
// The score answers "what is becoming unusually relevant right now, near
// this person", so it is built from CHANGE and TIME, never from lifetime
// popularity: no review count, no follower count, no all-time views enter
// it. A huge attraction with no fresh evidence scores like anyone else.
//
//   score = freshness + urgency + momentum + velocity + local + quality
//           + novelty - penalties          (clamped 0..100)
//
// Every point is written to a receipt, so an operator can see exactly why
// an item ranks where it does.

export const TREND_MODEL_VERSION = "v1-2026-11-12";

export const TREND_V1 = Object.freeze({
  // Freshness of a published social post: 30 points the day it posts, half
  // life of ~5 days, gone after the retention window.
  SOCIAL_FRESH_MAX: 30, SOCIAL_FRESH_TAU_DAYS: 7, SOCIAL_WINDOW_DAYS: 30,
  // A post about an event that is still ahead (or in season) stays eligible
  // past the window, up to this age, and the event must start within
  // EVENT_LIVE_AHEAD_DAYS.
  SOCIAL_EVENT_MAX_POST_AGE_DAYS: 120, EVENT_LIVE_AHEAD_DAYS: 45,
  // Event urgency.
  URGENCY_TODAY: 25, URGENCY_3D: 18, URGENCY_WEEKEND: 15, URGENCY_10D: 8, URGENCY_30D: 3,
  URGENCY_FINAL_DAYS: 8, URGENCY_FINAL_WINDOW_DAYS: 3,
  // Independent creator corroboration on the same entity (distinct handles).
  CREATOR_PER: 6, CREATOR_MAX_COUNT: 4,
  // Wayfind first party velocity: recent per-day rate vs the entity's own
  // baseline, Bayesian smoothed so a tiny count cannot explode.
  VELOCITY_MAX: 20, VELOCITY_RECENT_DAYS: 3, VELOCITY_BASE_DAYS: 14,
  VELOCITY_PRIOR: 1, VELOCITY_MIN_RECENT: 3, VELOCITY_DOUBLINGS_FOR_MAX: 3,
  // Owned post engagement velocity vs the account's median (views per day).
  SOCIAL_ENGAGE_MAX: 10,
  // Local relevance: distance decay, never zero.
  LOCAL_MAX: 20, LOCAL_TAU_MI: 35, LOCAL_UNKNOWN: 10,
  // Quality / trust.
  QUALITY_MAX: 8,
  // Novelty: new on Wayfind.
  NOVELTY_MAX: 8, NOVELTY_DAYS: 14,
  // Penalties.
  STALE_VERIFY_DAYS: 21, STALE_PENALTY: 5, APPROX_LOCATION_PENALTY: 3,
  // Diversity pass (ranking, not scoring).
  MAX_PER_ENTITY: 1, MAX_PER_METRO_TOP: 4, TOP_WINDOW: 12,
});

const DAY = 86400000;
const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const round1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function dayIndex(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY : null;
}

export function haversineMi(a, b) {
  if (!a || !b || num(a.lat) == null || num(a.lng) == null || num(b.lat) == null || num(b.lng) == null) return null;
  const R = 3958.8, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function eventIsLive(entity, today) {
  const start = dayIndex(entity.start_date), end = dayIndex(entity.end_date || entity.start_date);
  if (today == null) return false;
  if (end != null && end < today) return false;
  if (start != null && start - today > TREND_V1.EVENT_LIVE_AHEAD_DAYS) return false;
  return start != null || end != null;
}

/**
 * Is this candidate allowed into Trending at all? Eligibility is separate from
 * score: an eligible item always enters the pool, the score only orders it.
 * Returns { ok, reason }.
 */
export function trendEligibility(c, ctx) {
  const today = dayIndex(ctx.today);
  const s = c.signals || {};
  if (c.entity && c.entity.type === "event") {
    const end = dayIndex(c.entity.end_date || c.entity.start_date);
    if (end != null && today != null && end < today) return { ok: false, reason: "event_ended" };
    if (c.entity.status === "cancelled") return { ok: false, reason: "event_cancelled" };
  }
  if (c.kind === "social") {
    const pub = num(s.publishedMs);
    if (pub == null) return { ok: false, reason: "no_publish_date" };
    const age = (ctx.nowMs - pub) / DAY;
    if (age < -1) return { ok: false, reason: "not_yet_published" };
    // The post's clock or its subject's clock, whichever keeps it relevant:
    // an older reel about an event that is still ahead stays in Trending until
    // the event is over (capped), and an in-season seasonal post stays while
    // its season runs. Otherwise a post ages out of the pool.
    const liveEvent = c.entity && c.entity.type === "event" && eventIsLive(c.entity, today);
    if (liveEvent && age <= TREND_V1.SOCIAL_EVENT_MAX_POST_AGE_DAYS) return { ok: true, reason: null };
    if (s.inSeason === true && age <= TREND_V1.SOCIAL_EVENT_MAX_POST_AGE_DAYS) return { ok: true, reason: null };
    if (age > TREND_V1.SOCIAL_WINDOW_DAYS) return { ok: false, reason: "aged_out" };
  }
  return { ok: true, reason: null };
}

/**
 * Score one candidate. ctx: { today: "YYYY-MM-DD" (site time), nowMs,
 * origin: {lat,lng}|null, accountMedianViewsPerDay }.
 * Returns { score, receipt: [{key,label,points}], labels: [string] }.
 */
export function scoreTrendCandidate(c, ctx) {
  const s = c.signals || {};
  const e = c.entity || {};
  const receipt = [];
  const labels = [];
  const add = (key, label, points) => { if (points) receipt.push({ key, label, points: round1(points) }); };
  const today = dayIndex(ctx.today);

  // FRESHNESS: a newly published Wayfind or creator post.
  if (c.kind === "social" && num(s.publishedMs) != null) {
    const ageDays = Math.max(0, (ctx.nowMs - s.publishedMs) / DAY);
    const f = TREND_V1.SOCIAL_FRESH_MAX * Math.exp(-ageDays / TREND_V1.SOCIAL_FRESH_TAU_DAYS);
    add("freshness", s.owned ? "New Wayfind post" : "New creator post", f);
    if (s.owned && ageDays <= 3) labels.push("New on Wayfind's Instagram");
  }

  // URGENCY: a dated happening that will not wait.
  if (e.type === "event" && today != null) {
    const start = dayIndex(e.start_date);
    const end = dayIndex(e.end_date || e.start_date);
    if (start != null) {
      const open = start <= today && (end == null || end >= today);
      const until = start - today;
      const weekday = new Date(today * DAY).getUTCDay(); // 0 Sun .. 6 Sat
      const daysToSat = (6 - weekday + 7) % 7;
      const thisWeekend = until >= 0 && until <= daysToSat + 1;
      let u = 0, why = null;
      if (open || until === 0) { u = TREND_V1.URGENCY_TODAY; why = open && start < today ? "On now" : "Happening today"; }
      else if (until <= 3) { u = TREND_V1.URGENCY_3D; why = "In the next 3 days"; }
      else if (thisWeekend) { u = TREND_V1.URGENCY_WEEKEND; why = "This weekend"; }
      else if (until <= 10) { u = TREND_V1.URGENCY_10D; why = "Within 10 days"; }
      else if (until <= 30) { u = TREND_V1.URGENCY_30D; why = "This month"; }
      add("urgency", why, u);
      if (u >= TREND_V1.URGENCY_WEEKEND) labels.push(why === "This weekend" ? "Trending this weekend" : why);
      if (open && end != null && end - today <= TREND_V1.URGENCY_FINAL_WINDOW_DAYS && end > start) {
        add("final_days", "Final days of the run", TREND_V1.URGENCY_FINAL_DAYS);
        labels.push("Final days");
      }
      if (e.ticket_status === "sold_out") add("sold_out", "Sold out", -TREND_V1.URGENCY_TODAY);
    }
  }

  // MOMENTUM: distinct independent creators covering this entity recently.
  const creators = clamp(num(s.independentCreators) || 0, 0, TREND_V1.CREATOR_MAX_COUNT);
  if (creators > 0) {
    add("creators", creators === 1 ? "1 independent creator" : creators + " independent creators", creators * TREND_V1.CREATOR_PER);
    if (creators >= 2) labels.push(creators + " creators are talking about this");
  }

  // VELOCITY: Wayfind's own users, recent rate vs this entity's baseline.
  // Counts arrive already bot filtered (distinct devices, capped per device).
  const recent = num(s.recentActions), base = num(s.baselineActions);
  if (recent != null && recent >= TREND_V1.VELOCITY_MIN_RECENT) {
    const p = TREND_V1.VELOCITY_PRIOR;
    const rateNow = (recent + p) / TREND_V1.VELOCITY_RECENT_DAYS;
    const rateBase = ((base || 0) + p) / TREND_V1.VELOCITY_BASE_DAYS;
    const doublings = Math.log2(rateNow / rateBase);
    const v = TREND_V1.VELOCITY_MAX * clamp(doublings / TREND_V1.VELOCITY_DOUBLINGS_FOR_MAX, 0, 1);
    add("velocity", "Wayfind users opening it more than usual", v);
    if (v >= TREND_V1.VELOCITY_MAX * 0.6) labels.push("Wayfind is seeing this take off");
  }

  // OWNED POST ENGAGEMENT: views per day vs the account's median.
  if (c.kind === "social" && s.owned && num(s.views) != null && num(ctx.accountMedianViewsPerDay) > 0) {
    const ageDays = Math.max(1, (ctx.nowMs - s.publishedMs) / DAY);
    const ratio = (s.views / ageDays) / ctx.accountMedianViewsPerDay;
    add("social_engagement", "Post engagement above our usual", TREND_V1.SOCIAL_ENGAGE_MAX * clamp(Math.log2(Math.max(ratio, 1)) / 3, 0, 1));
  }

  // LOCAL RELEVANCE: distance decay, never zero.
  const d = ctx.origin ? haversineMi(ctx.origin, e) : null;
  if (d == null) add("local", "Location unknown", TREND_V1.LOCAL_UNKNOWN);
  else add("local", Math.round(d) + " mi away", TREND_V1.LOCAL_MAX * Math.exp(-d / TREND_V1.LOCAL_TAU_MI));

  // QUALITY: complete, verified, worth a tap.
  let q = 0;
  if (e.photo) q += 3;
  if (e.verified) q += 3;
  if (e.href) q += 2;
  add("quality", "Complete and verified listing", Math.min(q, TREND_V1.QUALITY_MAX));

  // NOVELTY: new on Wayfind.
  const firstSeen = num(s.firstSeenMs);
  if (firstSeen != null) {
    const ageDays = (ctx.nowMs - firstSeen) / DAY;
    if (ageDays >= 0 && ageDays <= TREND_V1.NOVELTY_DAYS) {
      add("novelty", "New on Wayfind", TREND_V1.NOVELTY_MAX * (1 - ageDays / TREND_V1.NOVELTY_DAYS));
      if (ageDays <= 7) labels.push("New this week");
    }
  }

  // PENALTIES.
  const verified = num(s.lastVerifiedMs);
  if (e.type === "event" && verified != null && (ctx.nowMs - verified) / DAY > TREND_V1.STALE_VERIFY_DAYS) add("stale", "Not re-verified in 3 weeks", -TREND_V1.STALE_PENALTY);
  if (e.approxLocation) add("approx_location", "Approximate location", -TREND_V1.APPROX_LOCATION_PENALTY);

  const score = round1(clamp(receipt.reduce((t, r) => t + r.points, 0), 0, 100));
  return { score, receipt, labels: [...new Set(labels)].slice(0, 2), distanceMi: d == null ? null : round1(d) };
}

/**
 * Score, then order with a diversity pass: one card per entity (the best
 * post about an event stands for it), and no metro holds more than
 * MAX_PER_METRO_TOP of the first TOP_WINDOW slots when others are waiting.
 * Nothing eligible is dropped: diversity only defers. Returns
 * { ranked: [...candidate & {trend}], excluded: [{id, reason}], collapsed: [{id, into}] }.
 */
export function rankTrendCandidates(candidates, ctx) {
  const excluded = [];
  const scored = [];
  for (const c of candidates || []) {
    const el = trendEligibility(c, ctx);
    if (!el.ok) { excluded.push({ id: c.id, reason: el.reason }); continue; }
    scored.push({ ...c, trend: scoreTrendCandidate(c, ctx) });
  }
  scored.sort((a, b) => b.trend.score - a.trend.score || String(a.id).localeCompare(String(b.id)));

  // One card per entity: later items about the same entity are kept as
  // alternates of the leader (still reachable, never silently lost).
  const byEntity = new Map();
  const leaders = [];
  const collapsed = [];
  for (const c of scored) {
    const key = c.entity && c.entity.type && c.entity.id ? c.entity.type + ":" + c.entity.id : "self:" + c.id;
    const lead = byEntity.get(key);
    if (lead && lead.alternates.length + 1 >= TREND_V1.MAX_PER_ENTITY) { lead.alternates.push(c.id); collapsed.push({ id: c.id, into: lead.id }); continue; }
    const row = { ...c, alternates: [] };
    byEntity.set(key, row);
    leaders.push(row);
  }

  // Metro spread in the head.
  const head = [], deferred = [];
  const perMetro = new Map();
  for (const c of leaders) {
    const metro = (c.entity && (c.entity.metro || c.entity.city)) || "?";
    const n = perMetro.get(metro) || 0;
    if (head.length < TREND_V1.TOP_WINDOW && n >= TREND_V1.MAX_PER_METRO_TOP) { deferred.push(c); continue; }
    perMetro.set(metro, n + 1);
    head.push(c);
  }
  return { ranked: [...head, ...deferred], excluded, collapsed };
}
