// Server-only, bounded, keyless external research + the owner's existing data.
// No provider subscription, Places search, ranking write or publication call.
import { setTimeout as pause } from 'node:timers/promises';
import { NATIVE_MODE, DAY_MS, MAX_TOPICS, ACTIVITY_ACTIONS, utcDay, digest,
  wikiWindow, wikiObservation, activityObservations, buildNativeTopics } from './nativeCore.js';

export const WIKI_SPECS = Object.freeze([
  { article: 'Pickleball', concept: 'pickleball' },
  { article: 'Matcha', concept: 'matcha_specialty_coffee' },
  { article: 'Food_hall', concept: 'food_hall' },
  { article: 'Pilates', concept: 'pilates_reformer' },
  { article: 'Ramen', concept: 'elevated_ramen' },
  { article: 'Sauna', concept: 'cold_plunge_sauna' },
]);
const BODY_CAP = 2 * 1024 * 1024;
const safeError = (e) => /^[a-z0-9:_-]{1,90}$/.test(String(e?.message)) ? e.message : 'transport-or-payload-failure';
async function smallText(response) {
  if (Number(response.headers.get('content-length')) > BODY_CAP) throw new Error('body-cap');
  const text = await response.text();
  if (Buffer.byteLength(text) > BODY_CAP) throw new Error('body-cap');
  return text;
}

export function nativeTransport(service, { fetchImpl = fetch, deadline = Date.now() + 50000 } = {}) {
  if (!service?.url || !service?.key) throw new Error('missing-service-configuration');
  const base = new URL(service.url);
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash || !base.hostname.endsWith('.supabase.co')) throw new Error('invalid-service-origin');
  const request = async (url, options = {}) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('run-deadline');
    return fetchImpl(url, { ...options, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(Math.min(5000, remaining)) });
  };
  const db = async (resource, { method = 'GET', body, prefer } = {}) => {
    if (!resource.startsWith('/rest/v1/') && !resource.startsWith('/auth/v1/admin/users?')) throw new Error('invalid-private-resource');
    const response = await request(base.origin + resource, {
      method, headers: { apikey: service.key, Authorization: `Bearer ${service.key}`,
        'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`database:http-${response.status}`);
    const text = await smallText(response);
    return text ? JSON.parse(text) : null;
  };
  // Deliberately no service headers in this transport.
  const publicRequest = async (url, options = {}) => {
    const target = new URL(url);
    if (target.protocol !== 'https:' || target.username || target.password || target.port || !['trends.google.com', 'wikimedia.org'].includes(target.hostname)) throw new Error('invalid-public-origin');
    return request(url, { ...options, headers: { Accept: 'application/json,application/rss+xml,text/xml',
      'User-Agent': 'WayfindTrendResearch/1.0 (https://www.gowayfind.com)' } });
  };
  return { db, publicRequest };
}

async function collectGoogle(publicRequest, nowMs, { fetchGoogleTrendingRss, conceptSignalsFromItems }) {
  try {
    const result = await fetchGoogleTrendingRss({ fetchImpl: async (url) => {
      const response = await publicRequest(url);
      if (!response.ok) return response;
      const xml = await smallText(response);
      if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml)) throw new Error('invalid-rss');
      return new Response(xml, { status: response.status });
    } });
    if (!result.ok) return { ok: false, error: result.error, scanned: 0, observations: [] };
    const observations = [];
    for (const item of result.items) {
      const observed = Date.parse(item.pubDate || '');
      if (!Number.isFinite(observed) || observed > nowMs || nowMs - observed > 2 * DAY_MS) continue;
      for (const signal of conceptSignalsFromItems([item], { observedAt: new Date(observed).toISOString() })) {
        observations.push({ subjectKey: `concept:${signal.conceptKey}`, conceptKey: signal.conceptKey,
          title: item.title, scope: 'broad_interest', geography: 'US', source: 'google_trends',
          metric: 'bucketed_search_interest', demandIndex: signal.demandIndex,
          previous: null, current: null, minimum: null, growthPct: null,
          observedAt: signal.observedAt, evidenceUrl: 'https://trends.google.com/trending/rss?geo=US', proxy: true });
      }
    }
    return { ok: true, scanned: result.items.length, observations };
  } catch (e) { return { ok: false, error: safeError(e), scanned: 0, observations: [] }; }
}

async function collectWiki(publicRequest, nowMs, sleepImpl, concepts) {
  const window = wikiWindow(nowMs), observations = [], failures = [];
  let scanned = 0;
  for (const spec of WIKI_SPECS) {
    if (!concepts[spec.concept]) throw new Error('undeclared-wiki-concept');
    if (scanned) await sleepImpl(1000);
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/${encodeURIComponent(spec.article)}/daily/${window.startStamp}/${window.endStamp}`;
    try {
      scanned++;
      const response = await publicRequest(url);
      if (!response.ok) {
        failures.push({ article: spec.article, error: `http-${response.status}` });
        // Respect throttling: do not retry or proceed through the remaining queue.
        if (response.status === 429 || response.status === 403) break;
        continue;
      }
      observations.push(wikiObservation(JSON.parse(await smallText(response)), spec, nowMs, url));
    } catch (e) { failures.push({ article: spec.article, error: safeError(e) }); }
  }
  return { ok: failures.length === 0 && scanned === WIKI_SPECS.length,
    scanned, expected: WIKI_SPECS.length, failures, observations };
}

async function collectActivity(db, nowMs, allowedMetros) {
  try {
    // These identities never leave this function or enter snapshots/logs.
    const identities = await db('/auth/v1/admin/users?per_page=200&page=1');
    if (!Array.isArray(identities?.users)) throw new Error('identity-shape');
    if (identities.users.length >= 200 || Number(identities.total) > 200 || Number(identities.next_page) > 1) throw new Error('identity-cap');
    const cutoff = utcDay(nowMs), from = new Date(cutoff - 14 * DAY_MS).toISOString(), to = new Date(cutoff).toISOString();
    const events = await db(`/rest/v1/events?select=action,place_id,user_id,device_id,meta,created_at&created_at=gte.${encodeURIComponent(from)}&created_at=lt.${encodeURIComponent(to)}&action=in.(${ACTIVITY_ACTIONS.join(',')})&order=created_at.asc,id.asc&limit=1000`);
    if (!Array.isArray(events)) throw new Error('activity-shape');
    // The database may impose its own 1000-row response ceiling. Never call a
    // capped slice a complete 14-day history, even if Content-Range is absent.
    if (events.length >= 1000) throw new Error('activity-cap');
    const ids = [...new Set(events.map((e) => e.place_id).filter((id) => typeof id === 'string' && /^[A-Za-z0-9:_-]{6,200}$/.test(id)))];
    if (ids.length > 200) throw new Error('inventory-cap');
    const inventory = [];
    for (let offset = 0; offset < ids.length; offset += 50) {
      const batch = ids.slice(offset, offset + 50);
      const rows = await db('/rest/v1/wf_inventory?select=place_id,name,metro,lat,lng,status,excluded,needs_review,refreshed_at&place_id=in.(' + batch.map(encodeURIComponent).join(',') + ')&limit=200');
      if (!Array.isArray(rows)) throw new Error('inventory-shape');
      inventory.push(...rows);
    }
    const observations = activityObservations(events, inventory, identities.users, nowMs, allowedMetros);
    return { ok: true, scanned: events.length, matchedPlaces: observations.length, observations };
  } catch (e) { return { ok: false, error: safeError(e), scanned: 0, observations: [] }; }
}

export async function persistNativeSnapshot(db, topics, sourceStatus, nowMs) {
  if (!Array.isArray(topics) || topics.length > MAX_TOPICS || topics.some((t) => t.eligible !== false)) throw new Error('invalid-private-snapshot');
  // Hash observations, not the wall-clock freshness factor. A second fetch of
  // the same evidence on the same UTC day reuses the immutable snapshot.
  const facts = topics.map((t) => ({ topic_key: t.topic_key, observed_at: t.observed_at,
    raw_row: t.raw_row, model_version: t.model_version }));
  const hash = 'native:' + digest({ facts, sourceStatus, day: new Date(utcDay(nowMs)).toISOString(), mode: NATIVE_MODE });
  const filter = `source_hash=eq.${encodeURIComponent(hash)}&source_mode=eq.${NATIVE_MODE}`;
  const lease = new Date(nowMs).toISOString();
  let rows = await db('/rest/v1/wf_trend_snapshots?on_conflict=source_hash', {
    method: 'POST', prefer: 'resolution=ignore-duplicates,return=representation', body: {
      source_mode: NATIVE_MODE, source_hash: hash, imported_at: lease, observed_at: lease,
      expected_cadence: 'daily', status: 'validating', schema_version: 'native-v1',
      requested_rows: topics.length, accepted_rows: 0,
      notes: JSON.stringify({ privateResearch: true, sources: sourceStatus, paidProviderCalls: 0 }),
    },
  });
  if (!Array.isArray(rows)) throw new Error('snapshot-write-shape');
  if (!rows.length) {
    const existing = await db(`/rest/v1/wf_trend_snapshots?${filter}&select=id,status,accepted_rows,imported_at&limit=1`);
    if (!Array.isArray(existing) || !existing[0]) throw new Error('snapshot-conflict-unresolved');
    const old = existing[0];
    if (['complete','partial'].includes(old.status)) {
      if (old.accepted_rows !== topics.length) throw new Error('snapshot-count-mismatch');
      const confirmed = await db(`/rest/v1/wf_trend_topics?snapshot_id=eq.${old.id}&select=topic_key&limit=${MAX_TOPICS + 1}`);
      if (!Array.isArray(confirmed) || confirmed.length !== topics.length || topics.some((t) => !confirmed.some((r) => r.topic_key === t.topic_key))) throw new Error('snapshot-count-mismatch');
      return { id: old.id, topics: topics.length, reused: true, status: old.status };
    }
    if (old.status !== 'failed' && !(old.status === 'validating' && nowMs - Date.parse(old.imported_at) > 5 * 60000)) throw new Error('snapshot-in-flight');
    // Compare-and-swap recovery; a second writer cannot steal an active lease.
    rows = await db(`/rest/v1/wf_trend_snapshots?id=eq.${old.id}&status=eq.${old.status}&imported_at=eq.${encodeURIComponent(old.imported_at)}`, {
      method: 'PATCH', prefer: 'return=representation', body: { status: 'validating', imported_at: lease },
    });
  }
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0].id) throw new Error('snapshot-lease-not-acquired');
  const id = rows[0].id;
  const owned = `/rest/v1/wf_trend_snapshots?id=eq.${id}&status=eq.validating&imported_at=eq.${encodeURIComponent(lease)}`;
  try {
    if (topics.length) await db('/rest/v1/wf_trend_topics?on_conflict=snapshot_id,topic_key', {
      method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: topics.map((t) => ({ ...t, snapshot_id: id })),
    });
    const written = await db(`/rest/v1/wf_trend_topics?snapshot_id=eq.${id}&select=topic_key&limit=${MAX_TOPICS + 1}`);
    if (!Array.isArray(written) || written.length !== topics.length || topics.some((t) => !written.some((r) => r.topic_key === t.topic_key))) throw new Error('topic-write-incomplete');
    const status = Object.values(sourceStatus).every((s) => s.ok) ? 'complete' : 'partial';
    const finished = await db(owned, { method: 'PATCH', prefer: 'return=representation', body: { status, accepted_rows: topics.length } });
    if (!Array.isArray(finished) || finished.length !== 1 || finished[0].status !== status) throw new Error('snapshot-finalize-incomplete');
    return { id, topics: topics.length, reused: false, status };
  } catch (e) {
    try { await db(owned, { method: 'PATCH', body: { status: 'failed' } }); } catch { /* original error stays loud */ }
    throw e;
  }
}

export async function runNativeTrends(service, { fetchImpl = fetch, nowMs = Date.now(), sleepImpl = pause, dependencies } = {}) {
  if (!Array.isArray(dependencies?.metros) || !dependencies?.concepts || typeof dependencies.score !== 'function' || typeof dependencies.normalizeGrowth !== 'function' || typeof dependencies.fetchGoogleTrendingRss !== 'function' || typeof dependencies.conceptSignalsFromItems !== 'function') throw new Error('native-dependencies');
  const { db, publicRequest } = nativeTransport(service, { fetchImpl });
  const configs = await db('/rest/v1/wf_trend_score_config?active=is.true&limit=2');
  if (!Array.isArray(configs) || configs.length !== 1) throw new Error('one-active-score-config-required');
  const [google, wikimedia, activity] = await Promise.all([
    collectGoogle(publicRequest, nowMs, dependencies), collectWiki(publicRequest, nowMs, sleepImpl, dependencies.concepts), collectActivity(db, nowMs, dependencies.metros),
  ]);
  const sourceStatus = Object.fromEntries(Object.entries({ google, wikimedia, activity }).map(([key, value]) => {
    const { observations, ...status } = value;
    return [key, { ...status, observations: observations.length }];
  }));
  const observations = [...google.observations, ...wikimedia.observations, ...activity.observations];
  if (!Object.values(sourceStatus).some((s) => s.ok) && !observations.length) throw new Error('all-native-sources-failed');
  const topics = buildNativeTopics(observations, { nowMs, score: dependencies.score,
    normalizeGrowth: dependencies.normalizeGrowth, config: configs[0], concepts: dependencies.concepts });
  const snapshot = await persistNativeSnapshot(db, topics, sourceStatus, nowMs);
  return { ok: true, mode: NATIVE_MODE, privateResearch: true, paidProviderCalls: 0,
    sources: sourceStatus, snapshot, degraded: snapshot.status === 'partial',
    note: topics.length ? 'Research observations stored; no place ranking or publication changed.' : 'Sources checked; no qualified observations. Empty is not a trend.' };
}

export async function nativeMaintenance(service, { fetchImpl = fetch, nowMs = Date.now() } = {}) {
  const { db } = nativeTransport(service, { fetchImpl });
  const snapshots = await db(`/rest/v1/wf_trend_snapshots?source_mode=eq.${NATIVE_MODE}&status=in.(complete,partial)&order=observed_at.desc&limit=1`);
  if (!Array.isArray(snapshots)) throw new Error('native-maintenance-shape');
  const latest = snapshots[0] || null;
  if (!latest) return { ok: true, mode: NATIVE_MODE, idle: true, expired: 0, note: 'Awaiting first native collection; no CSV or paid discovery required.' };
  const stale = !Number.isFinite(Date.parse(latest.observed_at)) || nowMs - Date.parse(latest.observed_at) > 3 * DAY_MS;
  // Pure status check: no inventory/photo/score writes, no provider discovery.
  return { ok: !stale, mode: NATIVE_MODE, idle: false, expired: 0,
    snapshotId: latest.id, stale, note: stale ? 'Native collector is stale; inspect trend-signals.' : 'Native collection is fresh; private topic rows expire by expires_at.' };
}
