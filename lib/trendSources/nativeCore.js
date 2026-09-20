// Private research only. No venue-score, ranking or publication writes.
import { createHash } from 'node:crypto';
export const NATIVE_MODE = 'wayfind_native_v1';
export const DAY_MS = 86400000;
export const MAX_TOPICS = 200;
export const ACTIVITY_ACTIONS = ['detail_open','save','share','primary_cta_clicked','tickets_out'];
const sha = (s) => createHash('sha256').update(s).digest('hex');
export const digest = (v) => sha(JSON.stringify(v));
// Owner-designated analytics exclusions. Do not publish private email literals.
const INTERNAL_EMAIL_DIGESTS = new Set(['7de1bbc72acfb58f060d88d822deb490ae715f12549ce3dedb6936e37536fc46','6a354aa9619400a486be56b22671761fb617f5585a6740a818d56cbd7791eee1']);
const flag = (v) => [true,1,'true','1'].includes(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const natural = (v) => Number.isSafeInteger(v) && v >= 0;
const iso = (ms) => new Date(ms).toISOString();
export const utcDay = (ms) => Math.floor(ms / DAY_MS) * DAY_MS;
export function windowGrowth(previous, current, minimum) {
  if (!natural(previous) || !natural(current) || !natural(minimum) || minimum < 1 || previous < minimum || current < minimum) return null;
  return (current - previous) / previous * 100;
}
export function wikiWindow(nowMs) {
  const end = utcDay(nowMs) - 2 * DAY_MS, start = end - 13 * DAY_MS;
  const stamp = (ms) => iso(ms).slice(0,10).replace(/-/g,'') + '00';
  return { start, end, startStamp: stamp(start), endStamp: stamp(end) };
}
export function wikiObservation(payload, spec, nowMs, evidenceUrl) {
  const {start,end} = wikiWindow(nowMs), days = new Map();
  if (!Array.isArray(payload?.items) || payload.items.length !== 14) throw new Error('incomplete-history');
  for (const row of payload.items) {
    const t = String(row.timestamp || '');
    if (!/^\d{8}00$/.test(t) || !natural(row.views)) throw new Error('invalid-history');
    const ms = Date.parse(`${t.slice(0,4)}-${t.slice(4,6)}-${t.slice(6,8)}T00:00:00Z`);
    if (!finite(ms) || ms < start || ms > end || days.has(ms)) throw new Error('invalid-history');
    days.set(ms,row.views);
  }
  let previous = 0, current = 0;
  for (let i = 0; i < 14; i++) {
    const value = days.get(start + i * DAY_MS);
    if (!natural(value)) throw new Error('incomplete-history');
    if (i < 7) previous += value; else current += value;
  }
  return { subjectKey:`concept:${spec.concept}`, conceptKey:spec.concept, title:spec.article.replace(/_/g,' '),
    scope:'broad_interest', geography:'enwiki-global', source:'wikimedia', metric:'article_pageviews',
    previous,current,minimum:100,windowDays:7,observedAt:iso(end+DAY_MS-1),evidenceUrl,proxy:true };
}
export function activityObservations(events, inventory, users, nowMs, allowedMetros) {
  if (![events,inventory,users,allowedMetros].every(Array.isArray)) throw new Error('activity-shape');
  const cutoff = utcDay(nowMs);
  const internal = new Set(users.filter(u => INTERNAL_EMAIL_DIGESTS.has(sha(String(u.email || '').trim().toLowerCase())) || flag(u.app_metadata?.is_internal)).map(u=>u.id));
  const known = new Set(users.filter(u=>u.id && !internal.has(u.id) && !u.is_anonymous && (u.email_confirmed_at || u.phone_confirmed_at)).map(u=>u.id));
  const internalDevices = new Set(events.filter(e=>internal.has(e.user_id) && e.device_id).map(e=>e.device_id));
  const byPlace = new Map();
  for (const e of events) {
    const ms = Date.parse(e.created_at || ''), meta = e.meta || {};
    if (!finite(ms) || ms < cutoff-14*DAY_MS || ms >= cutoff || !ACTIVITY_ACTIONS.includes(e.action) || !known.has(e.user_id) || internalDevices.has(e.device_id)) continue;
    if (['is_internal','internal','is_test','test','is_bot','bot','is_preview','preview'].some(k=>flag(meta[k]))) continue;
    const environment = meta.environment || meta.env;
    if (environment && environment !== 'production') continue;
    const location = meta.hostname || meta.host || meta.$host || meta.url || meta.$current_url;
    if (location) {
      let host;
      try { host = new URL(String(location).includes('://') ? location : `https://${location}`).hostname; } catch { continue; }
      if (!['gowayfind.com','www.gowayfind.com'].includes(host)) continue;
    }
    if (!byPlace.has(e.place_id)) byPlace.set(e.place_id,{before:new Set(),after:new Set(),last:0});
    const g = byPlace.get(e.place_id);
    (ms < cutoff-7*DAY_MS ? g.before : g.after).add(e.user_id);
    g.last = Math.max(g.last,ms);
  }
  const out = [];
  for (const p of inventory) {
    const g = byPlace.get(p.place_id), refreshed = Date.parse(p.refreshed_at || '');
    if (!g || !g.after.size || p.excluded || p.needs_review || !allowedMetros.includes(p.metro) || !p.name) continue;
    if (!finite(p.lat) || !finite(p.lng) || p.lat<24.3 || p.lat>31.1 || p.lng< -87.7 || p.lng> -79.7) continue;
    if (!finite(refreshed) || refreshed>nowMs || nowMs-refreshed>30*DAY_MS || String(p.status || '').toUpperCase() !== 'OPERATIONAL') continue;
    out.push({subjectKey:`place:${p.place_id}`,conceptKey:null,title:p.name,scope:`venue_metro:${p.metro}`,geography:p.metro,
      source:'wayfind_activity',metric:'distinct_confirmed_accounts_per_place',previous:g.before.size,current:g.after.size,
      minimum:5,windowDays:7,observedAt:iso(g.last),evidenceUrl:null,proxy:false,country:'US',state:'FL'});
  }
  return out;
}
export function buildNativeTopics(observations,{nowMs,score,normalizeGrowth,config,concepts}) {
  if (!finite(nowMs) || typeof score!=='function' || typeof normalizeGrowth!=='function' || !config?.weights || !config?.thresholds || !config?.labels || !config?.version) throw new Error('native-configuration');
  const levels = ['building','rising','exploding'].map(k=>config.thresholds[k]);
  if (levels.some(n=>!Number.isInteger(n)||n<1||n>100) || levels[0]>=levels[1] || levels[1]>=levels[2] || ['watch','building','rising','exploding'].some(k=>typeof config.labels[k]!=='string'||!config.labels[k])) throw new Error('native-score-config');
  const groups = new Map();
  for (const o of observations) {
    const ms = Date.parse(o.observedAt || '');
    if (!finite(ms) || ms>nowMs || nowMs-ms>3*DAY_MS || (o.conceptKey && !concepts[o.conceptKey])) continue;
    if (!o.subjectKey || !o.scope || !['google_trends','wikimedia','wayfind_activity'].includes(o.source)) continue;
    const key = `${o.subjectKey}|${o.scope}`;
    if (!groups.has(key)) groups.set(key,new Map());
    const g = groups.get(key), prior = g.get(o.source);
    if (!prior || Date.parse(prior.observedAt)<ms || (Date.parse(prior.observedAt)===ms && String(o.title)<String(prior.title))) g.set(o.source,o);
  }
  if (groups.size>MAX_TOPICS) throw new Error('topic-cap');
  return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([key,map])=>{
    const signals = [...map.values()].sort((a,b)=>a.source.localeCompare(b.source)), first = signals[0];
    const deltas = signals.map(s=>windowGrowth(s.previous,s.current,s.minimum)).filter(v=>v!==null);
    const growing = deltas.filter(v=>v>=25).length;
    const demand = signals.map(s=>s.demandIndex).filter(v=>finite(v)&&v>=0&&v<=1);
    const observed = Math.max(...signals.map(s=>Date.parse(s.observedAt)));
    const scored = score({growth:null,demand:demand.length?Math.max(...demand):null,
      velocity:deltas.length?Math.max(...deltas.map(normalizeGrowth)):null,
      localIntent:null,bookability:null,quality:null,freshness:Math.pow(.5,(nowMs-observed)/(3*DAY_MS)),
      confidence:Math.min(.65,.25+.2*(signals.length-1))},config.weights,config.thresholds,config.labels);
    if (!scored || !finite(scored.score) || scored.score<0 || scored.score>100 || !finite(scored.coverage)) throw new Error('invalid-native-score');
    // A high level or tiny baseline never becomes manufactured growth.
    const ceiling = !growing ? levels[0]-1 : growing<2 ? levels[1]-1 : 100;
    const value = Math.min(scored.score,ceiling);
    const momentum = value>=levels[2]?'exploding':value>=levels[1]?'rising':value>=levels[0]?'building':'watch';
    const title = first.conceptKey ? concepts[first.conceptKey].aliases[0] : first.title;
    return {topic_key:`native:${digest(key)}`,canonical_topic:title,normalized_topic:String(title).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(),
      concept_key:first.conceptKey,topic_family:first.conceptKey?concepts[first.conceptKey].family:null,
      source_category:first.scope,classification:'research',observed_at:iso(observed),expires_at:iso(observed+3*DAY_MS),
      eligible:false,eligibility_reason:'Private research only; venue publication and ranking are unchanged.',
      strength:value/100,trend_score:value,momentum,public_label:config.labels[momentum],model_version:config.version,
      component_scores:{...scored.components,_coverage:scored.coverage,_sourceCount:signals.length,_growthSourceCount:growing},
      country:first.country||null,state:first.state||null,city:null,
      raw_row:{native_version:NATIVE_MODE,score_config_hash:digest(config),scope:first.scope,cutoff_day:iso(utcDay(nowMs)).slice(0,10),
        note:first.conceptKey?'Broad interest proxies, not local venue demand.':'Confirmed-account activity about this venue; not all visitors or local residents.',
        signals:signals.map(s=>({source:s.source,metric:s.metric,geography:s.geography,previous:natural(s.previous)?s.previous:null,
          current:natural(s.current)?s.current:null,growth_pct:windowGrowth(s.previous,s.current,s.minimum),window_days:s.windowDays||null,
          observed_at:s.observedAt,evidence_url:s.evidenceUrl||null,proxy:Boolean(s.proxy)}))}};
  });
}
