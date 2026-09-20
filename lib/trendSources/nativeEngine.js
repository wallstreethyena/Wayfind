// Server-only bounded collection. No subscriptions, Places calls or publication.
import { setTimeout as pause } from 'node:timers/promises';
import { NATIVE_MODE, DAY_MS, MAX_TOPICS, ACTIVITY_ACTIONS, utcDay, digest,
  wikiWindow, wikiObservation, activityObservations, buildNativeTopics } from './nativeCore.js';
export const WIKI_SPECS = Object.freeze([
  {article:'Pickleball',concept:'pickleball'}, {article:'Matcha',concept:'matcha_specialty_coffee'},
  {article:'Food_hall',concept:'food_hall'}, {article:'Pilates',concept:'pilates_reformer'},
  {article:'Ramen',concept:'elevated_ramen'}, {article:'Sauna',concept:'cold_plunge_sauna'},
]);
const BODY_CAP = 2 * 1024 * 1024;
export const safeError = (e) => /^[a-z0-9:_-]{1,90}$/.test(String(e?.message)) ? e.message : 'transport-or-payload-failure';
async function smallText(response) {
  if (Number(response.headers.get('content-length')) > BODY_CAP) throw new Error('body-cap');
  if (!response.body) return '';
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > BODY_CAP) { await reader.cancel(); throw new Error('body-cap'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}
export function nativeTransport(service,{fetchImpl=fetch,deadline=Date.now()+50000}={}) {
  if (!service?.url || !service?.key) throw new Error('missing-service-configuration');
  const base = new URL(service.url);
  if (base.protocol!=='https:' || base.username || base.password || base.port || base.pathname!=='/' || base.search || base.hash || !base.hostname.endsWith('.supabase.co')) throw new Error('invalid-service-origin');
  const request = async (url,options={}) => {
    const remaining = deadline-Date.now(); if (remaining<=0) throw new Error('run-deadline');
    return fetchImpl(url,{...options,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(Math.min(5000,remaining))});
  };
  const db = async (resource,{method='GET',body,prefer}={}) => {
    if (!resource.startsWith('/rest/v1/') && !resource.startsWith('/auth/v1/admin/users?')) throw new Error('invalid-private-resource');
    const r = await request(base.origin+resource,{method,headers:{apikey:service.key,Authorization:`Bearer ${service.key}`,
      'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    if (!r.ok) throw new Error(`database:http-${r.status}`);
    const text = await smallText(r); return text ? JSON.parse(text) : null;
  };
  const publicRequest = async (url) => {
    const u = new URL(url);
    if (u.protocol!=='https:' || u.username || u.password || u.port || !['trends.google.com','wikimedia.org'].includes(u.hostname)) throw new Error('invalid-public-origin');
    return request(url,{headers:{Accept:'application/json,application/rss+xml,text/xml',
      'User-Agent':'WayfindTrendResearch/1.0 (https://www.gowayfind.com)'}});
  };
  return {db,publicRequest};
}
async function collectGoogle(publicRequest,nowMs,deps) {
  try {
    const r = await deps.fetchGoogleTrendingRss({fetchImpl:async(url)=>{
      const response = await publicRequest(url); if (!response.ok) return response;
      const xml = await smallText(response);
      if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml)) throw new Error('invalid-rss');
      return new Response(xml,{status:response.status});
    }});
    if (!r.ok) return {ok:false,error:r.error,scanned:0,observations:[]};
    const observations = [];
    for (const item of r.items) {
      const time = Date.parse(item.pubDate || '');
      if (!Number.isFinite(time) || time>nowMs || nowMs-time>2*DAY_MS) continue;
      for (const s of deps.conceptSignalsFromItems([item],{observedAt:new Date(time).toISOString()})) {
        observations.push({subjectKey:`concept:${s.conceptKey}`,conceptKey:s.conceptKey,title:item.title,
          scope:'broad_interest',geography:'US',source:'google_trends',metric:'bucketed_search_interest',
          demandIndex:s.demandIndex,previous:null,current:null,minimum:null,observedAt:s.observedAt,
          evidenceUrl:'https://trends.google.com/trending/rss?geo=US',proxy:true});
      }
    }
    return {ok:true,scanned:r.items.length,observations};
  } catch(e) { return {ok:false,error:safeError(e),scanned:0,observations:[]}; }
}
async function collectWiki(publicRequest,nowMs,sleepImpl,concepts) {
  const w = wikiWindow(nowMs), observations = [], failures = []; let scanned = 0;
  for (const spec of WIKI_SPECS) {
    if (!concepts[spec.concept]) throw new Error('undeclared-wiki-concept');
    if (scanned) await sleepImpl(1000);
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/${encodeURIComponent(spec.article)}/daily/${w.startStamp}/${w.endStamp}`;
    scanned++;
    try {
      const r = await publicRequest(url);
      if (!r.ok) {
        failures.push({article:spec.article,error:`http-${r.status}`});
        if (r.status===429 || r.status===403) break;
        continue;
      }
      observations.push(wikiObservation(JSON.parse(await smallText(r)),spec,nowMs,url));
    } catch(e) { failures.push({article:spec.article,error:safeError(e)}); }
  }
  return {ok:!failures.length&&scanned===WIKI_SPECS.length,scanned,expected:WIKI_SPECS.length,failures,observations};
}
async function collectActivity(db,nowMs,metros) {
  try {
    // Raw account identities and devices never leave this function's aggregate.
    const identities = await db('/auth/v1/admin/users?per_page=200&page=1');
    if (!Array.isArray(identities?.users)) throw new Error('identity-shape');
    if (identities.users.length>=200 || Number(identities.total)>200 || Number(identities.next_page)>1) throw new Error('identity-cap');
    const cutoff = utcDay(nowMs), from = new Date(cutoff-14*DAY_MS).toISOString(), to = new Date(cutoff).toISOString();
    const events = await db(`/rest/v1/events?select=action,place_id,user_id,device_id,meta,created_at&created_at=gte.${encodeURIComponent(from)}&created_at=lt.${encodeURIComponent(to)}&action=in.(${ACTIVITY_ACTIONS.join(',')})&order=created_at.asc,id.asc&limit=1000`);
    if (!Array.isArray(events)) throw new Error('activity-shape');
    if (events.length>=1000) throw new Error('activity-cap');
    const ids = [...new Set(events.map(e=>e.place_id).filter(id=>typeof id==='string'&&/^[A-Za-z0-9:_-]{6,200}$/.test(id)))];
    if (ids.length>200) throw new Error('inventory-cap');
    const inventory = [];
    for (let i=0;i<ids.length;i+=50) {
      const rows = await db('/rest/v1/wf_inventory?select=place_id,name,metro,lat,lng,status,excluded,needs_review,refreshed_at&place_id=in.('+ids.slice(i,i+50).map(encodeURIComponent).join(',')+')&limit=200');
      if (!Array.isArray(rows)) throw new Error('inventory-shape');
      inventory.push(...rows);
    }
    const observations = activityObservations(events,inventory,identities.users,nowMs,metros);
    return {ok:true,scanned:events.length,matchedPlaces:observations.length,observations};
  } catch(e) { return {ok:false,error:safeError(e),scanned:0,observations:[]}; }
}
export async function persistNativeSnapshot(db,topics,sources,nowMs) {
  if (!Array.isArray(topics) || topics.length>MAX_TOPICS || topics.some(t=>t.eligible!==false)) throw new Error('invalid-private-snapshot');
  // Same day and evidence => same snapshot, independent of moving freshness.
  const facts = topics.map(t=>({topic_key:t.topic_key,observed_at:t.observed_at,raw_row:t.raw_row,model_version:t.model_version}));
  const hash = 'native:'+digest({facts,sources,day:new Date(utcDay(nowMs)).toISOString(),mode:NATIVE_MODE});
  const lease = new Date(nowMs).toISOString();
  let rows = await db('/rest/v1/wf_trend_snapshots?on_conflict=source_hash',{method:'POST',prefer:'resolution=ignore-duplicates,return=representation',body:{
    source_mode:NATIVE_MODE,source_hash:hash,imported_at:lease,observed_at:lease,expected_cadence:'daily',status:'validating',schema_version:'native-v1',
    requested_rows:topics.length,accepted_rows:0,notes:JSON.stringify({privateResearch:true,sources,paidProviderCalls:0})}});
  if (!Array.isArray(rows)) throw new Error('snapshot-write-shape');
  const verifyTopics = async(id) => {
    const written = await db(`/rest/v1/wf_trend_topics?snapshot_id=eq.${id}&select=topic_key&limit=${MAX_TOPICS+1}`);
    if (!Array.isArray(written) || written.length!==topics.length || topics.some(t=>!written.some(r=>r.topic_key===t.topic_key))) throw new Error('topic-write-incomplete');
  };
  if (!rows.length) {
    const existing = await db(`/rest/v1/wf_trend_snapshots?source_hash=eq.${encodeURIComponent(hash)}&source_mode=eq.${NATIVE_MODE}&select=id,status,accepted_rows,imported_at&limit=1`);
    if (!Array.isArray(existing) || !existing[0]) throw new Error('snapshot-conflict-unresolved');
    const old = existing[0];
    if (['complete','partial'].includes(old.status)) {
      if (old.accepted_rows!==topics.length) throw new Error('snapshot-count-mismatch');
      await verifyTopics(old.id);
      return {id:old.id,topics:topics.length,reused:true,status:old.status};
    }
    if (old.status!=='failed' && !(old.status==='validating'&&nowMs-Date.parse(old.imported_at)>5*60000)) throw new Error('snapshot-in-flight');
    rows = await db(`/rest/v1/wf_trend_snapshots?id=eq.${old.id}&status=eq.${old.status}&imported_at=eq.${encodeURIComponent(old.imported_at)}`,{
      method:'PATCH',prefer:'return=representation',body:{status:'validating',imported_at:lease}});
  }
  if (!Array.isArray(rows) || rows.length!==1 || !rows[0].id) throw new Error('snapshot-lease-not-acquired');
  const id = rows[0].id, owned = `/rest/v1/wf_trend_snapshots?id=eq.${id}&status=eq.validating&imported_at=eq.${encodeURIComponent(lease)}`;
  try {
    if (topics.length) await db('/rest/v1/wf_trend_topics?on_conflict=snapshot_id,topic_key',{
      method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:topics.map(t=>({...t,snapshot_id:id}))});
    await verifyTopics(id);
    const status = Object.values(sources).every(s=>s.ok)?'complete':'partial';
    const finished = await db(owned,{method:'PATCH',prefer:'return=representation',body:{status,accepted_rows:topics.length}});
    if (!Array.isArray(finished) || finished.length!==1 || finished[0].status!==status) throw new Error('snapshot-finalize-incomplete');
    return {id,topics:topics.length,reused:false,status};
  } catch(e) {
    try { await db(owned,{method:'PATCH',body:{status:'failed'}}); } catch { /* preserve original failure */ }
    throw e;
  }
}
export async function runNativeTrends(service,{fetchImpl=fetch,nowMs=Date.now(),sleepImpl=pause,dependencies:d}={}) {
  if (!d?.concepts || !Array.isArray(d.metros) || ![d.score,d.normalizeGrowth,d.fetchGoogleTrendingRss,d.conceptSignalsFromItems].every(v=>typeof v==='function')) throw new Error('native-dependencies');
  const {db,publicRequest} = nativeTransport(service,{fetchImpl});
  const configs = await db('/rest/v1/wf_trend_score_config?active=is.true&limit=2');
  if (!Array.isArray(configs) || configs.length!==1) throw new Error('one-active-score-config-required');
  const [google,wikimedia,activity] = await Promise.all([
    collectGoogle(publicRequest,nowMs,d),collectWiki(publicRequest,nowMs,sleepImpl,d.concepts),collectActivity(db,nowMs,d.metros)]);
  const sources = Object.fromEntries(Object.entries({google,wikimedia,activity}).map(([key,value])=>{
    const {observations,...status} = value; return [key,{...status,observations:observations.length}];
  }));
  const observations = [...google.observations,...wikimedia.observations,...activity.observations];
  if (!Object.values(sources).some(s=>s.ok) && !observations.length) throw new Error('all-native-sources-failed');
  const topics = buildNativeTopics(observations,{nowMs,score:d.score,normalizeGrowth:d.normalizeGrowth,config:configs[0],concepts:d.concepts});
  const snapshot = await persistNativeSnapshot(db,topics,sources,nowMs);
  return {ok:true,mode:NATIVE_MODE,privateResearch:true,paidProviderCalls:0,sources,snapshot,degraded:snapshot.status==='partial',
    note:topics.length?'Research stored; venue ranking and publication unchanged.':'Sources checked; no qualified observations. Empty is not a trend.'};
}
export async function nativeMaintenance(service,{fetchImpl=fetch,nowMs=Date.now()}={}) {
  const {db} = nativeTransport(service,{fetchImpl});
  const rows = await db(`/rest/v1/wf_trend_snapshots?source_mode=eq.${NATIVE_MODE}&status=in.(complete,partial)&order=observed_at.desc&limit=1`);
  if (!Array.isArray(rows)) throw new Error('native-maintenance-shape');
  // Purge only our expired private evidence, including copied venue names.
  // No inventory, photo, legacy-source or public content deletion is possible.
  await db(`/rest/v1/wf_trend_topics?raw_row->>native_version=eq.${NATIVE_MODE}&expires_at=lt.${encodeURIComponent(new Date(nowMs).toISOString())}`,{
    method:'DELETE',prefer:'return=minimal'});
  if (!rows[0]) return {ok:true,idle:true,mode:NATIVE_MODE,expirySweep:true,note:'Awaiting first native collection; no CSV or paid discovery required.'};
  const age = nowMs-Date.parse(rows[0].observed_at), stale = !Number.isFinite(age)||age<0||age>3*DAY_MS;
  return {ok:!stale,idle:false,mode:NATIVE_MODE,expirySweep:true,stale,snapshotId:rows[0].id,
    note:stale?'Native collector is stale; inspect trend-signals.':'Native collection is fresh; expired private observations removed.'};
}
