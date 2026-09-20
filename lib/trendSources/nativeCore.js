// Private research only. Topic observations never alter a place's merit score.
// Pure transforms; adapters own transport and the existing trendScore owns math.
import { createHash } from 'node:crypto';

export const NATIVE_MODE = 'wayfind_native_v1';
export const DAY_MS = 86400000;
export const MAX_TOPICS = 200;
export const INTERNAL_EMAILS = new Set(['gabrielpereira@me.com', 'cindyqnns@gmail.com']);
export const ACTIVITY_ACTIONS = ['detail_open', 'save', 'share', 'primary_cta_clicked', 'tickets_out'];
const flag = (v) => v === true || v === 1 || v === 'true' || v === '1';
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const natural = (v) => Number.isSafeInteger(v) && v >= 0;
const norm = (s) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const utcDay = (ms) => Math.floor(ms / DAY_MS) * DAY_MS;
const iso = (ms) => new Date(ms).toISOString();
export const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function windowGrowth(previous, current, minimum) {
  if (!natural(previous) || !natural(current) || !natural(minimum) || minimum < 1) return null;
  // A zero/tiny baseline is insufficient evidence, not infinite growth.
  if (previous < minimum || current < minimum) return null;
  return ((current - previous) / previous) * 100;
}

export function wikiWindow(nowMs) {
  const end = utcDay(nowMs) - 2 * DAY_MS; // publication lag, not an invented zero
  const start = end - 13 * DAY_MS;
  const stamp = (ms) => iso(ms).slice(0, 10).replace(/-/g, '') + '00';
  return { start, end, startStamp: stamp(start), endStamp: stamp(end) };
}

export function wikiObservation(payload, spec, nowMs, evidenceUrl) {
  const { start, end } = wikiWindow(nowMs);
  if (!Array.isArray(payload?.items) || payload.items.length !== 14) throw new Error('incomplete-history');
  const days = new Map();
  for (const it of payload.items) {
    const t = String(it.timestamp || '');
    if (!/^\d{8}00$/.test(t) || !natural(it.views)) throw new Error('invalid-history');
    const ms = Date.parse(`${t.slice(0,4)}-${t.slice(4,6)}-${t.slice(6,8)}T00:00:00Z`);
    if (!finite(ms) || ms < start || ms > end || days.has(ms)) throw new Error('invalid-history');
    days.set(ms, it.views);
  }
  let previous = 0, current = 0;
  for (let i = 0; i < 14; i++) {
    const value = days.get(start + i * DAY_MS);
    if (!natural(value)) throw new Error('incomplete-history');
    if (i < 7) previous += value; else current += value;
  }
  return {
    subjectKey: `concept:${spec.concept}`, conceptKey: spec.concept, title: spec.article.replace(/_/g, ' '),
    scope: 'broad_interest', geography: 'enwiki-global', source: 'wikimedia', metric: 'article_pageviews',
    previous, current, growthPct: windowGrowth(previous, current, 100), minimum: 100,
    observedAt: iso(end + DAY_MS - 1), evidenceUrl, windowDays: 7,
    // A broad article is a research proxy, never evidence about a local venue.
    proxy: true,
  };
}

export function activityObservations(events, inventory, users, nowMs, allowedMetros) {
  if (!Array.isArray(events) || !Array.isArray(inventory) || !Array.isArray(users) || !Array.isArray(allowedMetros)) throw new Error('activity-shape');
  const cutoff = utcDay(nowMs);
  const internal = new Set(users.filter((u) => INTERNAL_EMAILS.has(String(u.email || '').trim().toLowerCase()) || flag(u.app_metadata?.is_internal)).map((u) => u.id));
  const known = new Set(users.filter((u) => u.id && !internal.has(u.id) && !u.is_anonymous && (u.email_confirmed_at || u.phone_confirmed_at)).map((u) => u.id));
  // Known internal devices stay excluded even if their later events lack user_id.
  const internalDevices = new Set(events.filter((e) => internal.has(e.user_id) && e.device_id).map((e) => e.device_id));
  const byPlace = new Map();
  for (const e of events) {
    const ms = Date.parse(e.created_at || '');
    const meta = e.meta || {};
    if (!finite(ms) || ms < cutoff - 14 * DAY_MS || ms >= cutoff || !ACTIVITY_ACTIONS.includes(e.action)) continue;
    if (!known.has(e.user_id) || internalDevices.has(e.device_id)) continue;
    if (['is_internal','internal','is_test','test','is_bot','bot','is_preview','preview'].some((k) => flag(meta[k]))) continue;
    const environment = meta.environment || meta.env;
    if (environment && environment !== 'production') continue;
    const location = meta.hostname || meta.host || meta.$host || meta.url || meta.$current_url;
    if (location) {
      let host;
      try { host = new URL(String(location).includes('://') ? location : `https://${location}`).hostname; } catch { continue; }
      if (!['gowayfind.com', 'www.gowayfind.com'].includes(host)) continue;
    }
    if (!byPlace.has(e.place_id)) byPlace.set(e.place_id, { before: new Set(), after: new Set(), last: 0 });
    const g = byPlace.get(e.place_id);
    (ms < cutoff - 7 * DAY_MS ? g.before : g.after).add(e.user_id);
    g.last = Math.max(g.last, ms);
  }
  const out = [];
  for (const p of inventory) {
    const g = byPlace.get(p.place_id);
    if (!g || !g.after.size || p.excluded || p.needs_review || !allowedMetros.includes(p.metro) || !p.name) continue;
    if (!finite(p.lat) || !finite(p.lng) || p.lat < 24.3 || p.lat > 31.1 || p.lng < -87.7 || p.lng > -79.7) continue;
    const refreshed = Date.parse(p.refreshed_at || '');
    if (!finite(refreshed) || refreshed > nowMs || nowMs - refreshed > 30 * DAY_MS) continue;
    if (String(p.status || '').toUpperCase() !== 'OPERATIONAL') continue;
    out.push({
      subjectKey: `place:${p.place_id}`, conceptKey: null, title: p.name,
      scope: `venue_metro:${p.metro}`, geography: p.metro, source: 'wayfind_activity',
      metric: 'distinct_confirmed_accounts_per_place', previous: g.before.size, current: g.after.size,
      growthPct: windowGrowth(g.before.size, g.after.size, 5), minimum: 5, windowDays: 7,
      observedAt: iso(g.last), evidenceUrl: null, proxy: false,
      // A venue's metro is not a measurement of the visitor's location.
      country: 'US', state: 'FL', city: null,
    });
  }
  return out;
}

export function buildNativeTopics(observations, { nowMs, score, normalizeGrowth, config, concepts }) {
  if (!finite(nowMs) || typeof score !== 'function' || typeof normalizeGrowth !== 'function' || !config?.weights || !config?.thresholds || !config?.labels || !config?.version) throw new Error('native-configuration');
  const thresholds = ['building','rising','exploding'].map((k) => config.thresholds[k]);
  if (thresholds.some((n) => !Number.isInteger(n) || n < 1 || n > 100) || thresholds[0] >= thresholds[1] || thresholds[1] >= thresholds[2] || ['watch','building','rising','exploding'].some((k) => typeof config.labels[k] !== 'string' || !config.labels[k])) throw new Error('native-score-config');
  const groups = new Map();
  for (const o of observations) {
    const ms = Date.parse(o.observedAt || '');
    if (!finite(ms) || ms > nowMs || nowMs - ms > 3 * DAY_MS) continue;
    if (o.conceptKey && !concepts[o.conceptKey]) continue;
    if (!o.subjectKey || !o.scope || !['google_trends','wikimedia','wayfind_activity'].includes(o.source)) continue;
    const key = `${o.subjectKey}|${o.scope}`;
    if (!groups.has(key)) groups.set(key, new Map());
    // Multiple keywords/articles from one provider are NOT independent sources.
    const group = groups.get(key), prior = group.get(o.source);
    if (!prior || Date.parse(prior.observedAt) < ms || (Date.parse(prior.observedAt) === ms && String(o.title) < String(prior.title))) group.set(o.source, o);
  }
  if (groups.size > MAX_TOPICS) throw new Error('topic-cap');
  const result = [];
  for (const [key, sourceMap] of [...groups.entries()].sort(([a],[b]) => a.localeCompare(b))) {
    const signals = [...sourceMap.values()].sort((a,b) => a.source.localeCompare(b.source));
    const first = signals[0];
    const deltas = signals.filter((s) => natural(s.minimum) && windowGrowth(s.previous, s.current, s.minimum) !== null);
    const growing = deltas.filter((s) => windowGrowth(s.previous, s.current, s.minimum) >= 25);
    const velocity = deltas.length ? Math.max(...deltas.map((s) => normalizeGrowth(windowGrowth(s.previous, s.current, s.minimum)))) : null;
    const demand = signals.map((s) => s.demandIndex).filter((v) => finite(v) && v >= 0 && v <= 1);
    const last = Math.max(...signals.map((s) => Date.parse(s.observedAt)));
    const factors = {
      growth: null, demand: demand.length ? Math.max(...demand) : null, velocity,
      localIntent: null, bookability: null, quality: null,
      freshness: Math.pow(0.5, (nowMs - last) / (3 * DAY_MS)),
      confidence: Math.min(0.65, 0.25 + 0.2 * (signals.length - 1)),
    };
    const scored = score(factors, config.weights, config.thresholds, config.labels);
    if (!scored || !finite(scored.score) || scored.score < 0 || scored.score > 100 || !finite(scored.coverage)) throw new Error('invalid-native-score');
    // Missing history cannot turn freshness + renormalized weights into 100.
    const ceiling = !growing.length ? config.thresholds.building - 1
      : growing.length < 2 ? config.thresholds.rising - 1 : 100;
    const value = Math.min(scored.score, ceiling);
    const momentum = value >= config.thresholds.exploding ? 'exploding' : value >= config.thresholds.rising ? 'rising' : value >= config.thresholds.building ? 'building' : 'watch';
    const title = first.conceptKey ? concepts[first.conceptKey].aliases[0] : first.title;
    const topicKey = `native:${digest(key)}`;
    result.push({
      topic_key: topicKey, canonical_topic: title, normalized_topic: norm(title),
      concept_key: first.conceptKey, topic_family: first.conceptKey ? concepts[first.conceptKey].family : null,
      source_category: first.scope, classification: 'research',
      observed_at: iso(last), expires_at: iso(last + 3 * DAY_MS),
      // No second ranking system, guessed local relevance, or automatic publication.
      eligible: false, eligibility_reason: 'Private research only; venue publication and ranking are unchanged.',
      strength: value / 100, trend_score: value, momentum, public_label: config.labels[momentum],
      model_version: config.version,
      component_scores: { ...scored.components, _coverage: scored.coverage, _sourceCount: signals.length, _growthSourceCount: growing.length },
      country: first.country || null, state: first.state || null, city: null,
      raw_row: {
        native_version: NATIVE_MODE, score_config_hash: digest(config), scope: first.scope, cutoff_day: iso(utcDay(nowMs)).slice(0,10),
        note: first.conceptKey ? 'Broad interest proxies, not local venue demand.' : 'Confirmed-account activity about this venue; not all visitors or local residents.',
        signals: signals.map((s) => ({ source: s.source, metric: s.metric, geography: s.geography,
          previous: natural(s.previous) ? s.previous : null, current: natural(s.current) ? s.current : null,
          growth_pct: windowGrowth(s.previous,s.current,s.minimum), window_days: s.windowDays || null,
          observed_at: s.observedAt, evidence_url: s.evidenceUrl || null, proxy: Boolean(s.proxy) })),
      },
    });
  }
  return result;
}
