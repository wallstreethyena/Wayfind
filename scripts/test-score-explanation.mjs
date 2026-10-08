import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadComponent } from './lib/jsxLoad.mjs';
import { governedWayfindScore } from '../lib/wayfindScore.js';
import { wayfindScore } from '../lib/wayfindScore.js';
import { stampGoverned, lawfulSort, governedScoreOf, attachOfficialScoreReceipt, restampGoverned } from '../lib/lawfulOrder.js';
import { stampOwnerPick, withOwnerBump } from '../lib/ownerBump.js';
import { readableScoreReceipt, visibleScoreMath } from '../lib/scoreExplanation.js';
import { publishableVerdict, serveScoreVerdict, displayableScoreVerdict } from '../lib/scoreVerdict.js';

let checks = 0;
const equal = (a,b) => { assert.deepEqual(a,b); checks++; };
// Frozen pre-change arithmetic is the score-preservation oracle.
function previous(base, c) {
  if (base == null || !isFinite(base)) return null;
  let s = base;
  if (c.hasCreatorVideo) s += 2;
  if (typeof c.distanceMi === 'number' && isFinite(c.distanceMi) && c.distanceMi > 17) s -= 2;
  if (c.trending) s = Math.max(s, Math.min(99, s + 6));
  return Math.max(0, Math.min(100, Math.round(s)));
}
for (const base of [null, NaN, Infinity, 0, 1, 50.4, 78, 90, 95, 99, 100]) {
  for (const hasCreatorVideo of [false,true]) for (const trending of [false,true]) {
    for (const distanceMi of [undefined, null, 0, 17, 17.01, 40, NaN]) {
      const c = {hasCreatorVideo,trending,distanceMi};
      const trace = [];
      const score = governedWayfindScore(base,c,trace);
      equal(score, previous(base,c));
      if (Number.isFinite(score)) equal(base + trace.reduce((n,s) => n+s.delta,0), score);
    }
  }
}
for (const trace of [true, {}, Object.freeze([])]) equal(governedWayfindScore(90,{hasCreatorVideo:true,trending:true},trace),98);

// Current-main base oracle: Bayesian prior, original rounding, then the
// September 28 review-depth deduction. Affinity remains absent from inputs.
function previousReview(rating, reviews) {
  if (!rating) return null;
  const v = reviews || 0;
  const bayes = (v / (v + 60)) * rating + (60 / (v + 60)) * 3.9;
  const number = Number(reviews);
  const n = isFinite(number) && number > 0 ? number : 0;
  const depth = n < 500 ? 3 : n <= 2000 ? 1 : 0;
  return Math.max(0, Math.round((bayes / 5) * 100) - depth);
}
for (const rating of [null, undefined, 0, 1, 3.9, 4.6, 4.9, 5]) {
  for (const count of [undefined, null, 0, 1, 60, 499, 500, 2000, 2001, 3000, 4531]) {
    equal(wayfindScore(rating, count), previousReview(rating, count));
  }
}
for (const base of [0, 70, 79, 80, 89, 90, 96, 99, 100]) {
  const owner = stampOwnerPick({id:'owner-band-' + base, wfScore:base}, true);
  stampGoverned([owner]);
  equal(owner.wfScore, withOwnerBump(base, true));
  const explanation = readableScoreReceipt(owner);
  if (base > 0) {
    equal(explanation.steps[0].delta, withOwnerBump(base, true) - base);
    equal(explanation.start, base);
  }
}
const creatorStored = {id:'unknown-persisted-creator',wfScore:90, creator_video:true};
const creatorRaw = {id:'unknown-raw-creator',rating:4.6,reviews:3000,creator_video:true};
stampGoverned([creatorStored, creatorRaw]);
equal(creatorStored.governed_score,92);
equal(creatorRaw.governed_score,94);
equal(readableScoreReceipt(creatorStored).steps[0].key,'creator');
equal(readableScoreReceipt(creatorRaw).steps[0].key,'creator');
const creatorDetail = attachOfficialScoreReceipt({...creatorStored,score_explanation:undefined});
equal(readableScoreReceipt(creatorDetail).score,92);
const creatorRecompute = {...creatorStored,wfScore:91};
restampGoverned(creatorStored,creatorRecompute);
equal(creatorRecompute.creator_video,true);
equal(creatorRecompute.governed_score,93);
equal(readableScoreReceipt(creatorRecompute).steps[0].key,'creator');
// Mirrored final scores cannot safely be replayed; keep the displayed number
// and invalidate a copied receipt instead of adding creator/trend terms twice.
const mirror = {id:'mirror',wfScore:94,governed_score:94,score_explanation:creatorRaw.score_explanation};
const mirrorNext = restampGoverned(mirror,{...mirror,wfScore:96});
equal(mirrorNext.governed_score,96);
equal(mirrorNext.score_explanation,undefined);
const affinityLow = {id:'affinity-low',wfScore:90,affinity:-1000};
const affinityHigh = {id:'affinity-high',wfScore:90,affinity:1000};
stampGoverned([affinityLow,affinityHigh]);
equal(affinityLow.governed_score,affinityHigh.governed_score);
equal(readableScoreReceipt(affinityLow).steps,readableScoreReceipt(affinityHigh).steps);
const raw = {id:'score-fixture', name:'Score fixture', rating:4.6, reviews:3000, distance_mi:18, trending:true};
stampGoverned([raw]);
const receipt = readableScoreReceipt(raw);
equal(receipt.origin,'reviews');
equal(receipt.steps.map(s=>s.key), ['distance','trending']);
equal(receipt.score,raw.governed_score);
const owned = stampOwnerPick({id:'owned-fixture',wfScore:96},true);
stampGoverned([owned]);
equal(readableScoreReceipt(owned).steps[0].delta,2); // current >=9.0 band is +0.2
const stale = {...raw,governed_score:raw.governed_score-1};
equal(readableScoreReceipt(stale),null);
equal(readableScoreReceipt({...raw,id:'different'}),null);
equal(readableScoreReceipt({id:'legacy',governed_score:90}),null);
equal(readableScoreReceipt({id:'unrated'}),null);
const broken = structuredClone(raw);
broken.score_explanation.steps[0].delta = 2;
equal(readableScoreReceipt(broken),null); // red proof: altered calculation rejected
broken.score_explanation.steps[0].key = '__proto__';
equal(readableScoreReceipt(broken),null);
const zero = {id:'zero',wfScore:0}; stampGoverned([zero]);
equal(readableScoreReceipt(zero),null);
const rows = lawfulSort([{id:'a',wfScore:80},{id:'b',wfScore:95},{id:'c',wfScore:90}]);
equal(rows.map(p=>p.id),['b','c','a']);
equal(rows.every(p=>readableScoreReceipt(p)?.score === p.governed_score),true);
equal(governedScoreOf(Object.freeze({id:'frozen',wfScore:90})),90);
const before = JSON.stringify(raw);
stampGoverned([raw]);
equal(JSON.stringify(raw),before); // never recompute/stamp a second time

const records = JSON.parse(readFileSync('data/score-verdicts.json','utf8'));
const policies = JSON.parse(readFileSync('data/score-verdict-policies.json','utf8'));
// A fixed clock tests the record itself; expiry in production is enforced at read.
const now = Date.parse('2026-09-13T22:22:12Z');
const record = records[0];
equal(!!publishableVerdict(record,policies,now),true);
for (const edit of [
  r=>r.status='draft', r=>r.expiresAt='2026-09-05T00:00:00Z',
  r=>r.reviewedAt='2027-01-01T00:00:00Z', r=>r.sentences.pop(),
  r=>r.sentences[0].sourceIds=['absent'], r=>r.sources[0].placeId='wrong',
  r=>r.sources[0].url='javascript:alert(1)', r=>r.sources[0].policyId='unknown',
  r=>r.sources[0].expiresAt='2026-09-05T00:00:00Z',
  r=>r.sources[0].checkedAt='2027-01-01T00:00:00Z',
  r=>r.sources.push(r.sources[0]),
  r=>r.sources[0]=null, r=>r.sentences[0]=null,
]) {
  const bad = structuredClone(record); edit(bad);
  equal(publishableVerdict(bad,policies,now),null);
}
const revoked = structuredClone(policies);
revoked[record.sources[0].policyId].deriveFacts=false;
equal(publishableVerdict(record,revoked,now),null);
const expiry = Date.parse(record.expiresAt);
equal(expiry - Date.parse(record.reviewedAt), 7 * 24 * 60 * 60 * 1000);
equal(!!publishableVerdict(record,policies,expiry - 1),true);
equal(publishableVerdict(record,policies,expiry),null);
equal(publishableVerdict(record,policies,expiry + 1),null);
const sourceExpired = structuredClone(record);
sourceExpired.sources[0].expiresAt = record.reviewedAt;
equal(publishableVerdict(sourceExpired,policies,now),null);
const policyExpired = structuredClone(policies);
policyExpired[record.sources[0].policyId].expiresAt = record.reviewedAt;
equal(publishableVerdict(record,policyExpired,now),null);
const calls=[];
const args={records,policies,now,approve:async(id)=>{calls.push(id);return {ok:true};}};
const expired = await serveScoreVerdict(record.placeId,{...args,now:expiry});
equal(expired.body.state,'needs_review');
equal(expired.body.verdict,undefined);
equal(calls,[]); // stale evidence never reaches inventory approval
const todayExpired = await serveScoreVerdict(record.placeId,{...args,now:Date.parse('2026-10-04T00:00:00Z')});
equal(todayExpired.body.state,'needs_review');
equal(todayExpired.body.verdict,undefined);
equal(calls,[]);
const good = await serveScoreVerdict(record.placeId,args);
equal(good.status,200);
equal(displayableScoreVerdict(good.body.verdict,record.placeId),good.body.verdict);
equal(displayableScoreVerdict(good.body.verdict,'other-id'),null);
for (const edit of [v=>v.sentences=null,v=>v.sources=null,v=>v.sources[0].url='javascript:alert(1)',v=>v.sentences[0].sourceIds=['missing'],v=>v.reviewedAt='nonsense']) {
  const bad=structuredClone(good.body.verdict);edit(bad);equal(displayableScoreVerdict(bad,record.placeId),null);
}
equal(calls,[record.placeId]);
equal(good.body.verdict.sources[0].policyId,undefined); // no policy/raw payload leakage
for (const approve of [async()=>({ok:false}),async()=>{throw new Error('outage');},async()=>null]) {
 const bad = await serveScoreVerdict(record.placeId,{...args,approve});
 equal(bad.status,503); equal(bad.body.verdict,undefined);
}
equal((await serveScoreVerdict('missing',args)).body.state,'not_researched');
equal((await serveScoreVerdict(record.placeId,{...args,policies:revoked})).body.state,'needs_review');
const route = readFileSync('app/api/score-verdict/route.js','utf8');
equal(route.includes('approvePlace(placeId,'),true);
equal(route.includes('"no-store"'),true);
// Exercise the actual route rather than only grepping its wiring. The pilot
// is expired at today's clock, so even configured inventory must not be read.
const routeModule = await loadComponent(fileURLToPath(new URL('../app/api/score-verdict/route.js', import.meta.url)),fileURLToPath(new URL('..',import.meta.url)));
const realNow = Date.now;
const realFetch = globalThis.fetch;
const request = id => new Request('http://localhost/api/score-verdict?id=' + encodeURIComponent(id));
let inventoryReads = 0;
try {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://e2eplaceholder.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'e2e-placeholder-anon-key-not-real';
  globalThis.fetch = async () => { inventoryReads++; throw new Error('unexpected inventory read'); };
  Date.now = () => Date.parse('2026-10-04T00:00:00Z');
  const expiredResponse = await routeModule.GET(request(record.placeId));
  equal(expiredResponse.status,200);
  equal(expiredResponse.headers.get('cache-control'),'no-store');
  equal(await expiredResponse.json(),{state:'needs_review'});
  equal(inventoryReads,0);
  for (const id of ['', 'x'.repeat(201)]) {
    const invalid = await routeModule.GET(request(id));
    equal(invalid.status,400);
    equal(await invalid.json(),{state:'invalid_request'});
  }
  const absent = await routeModule.GET(request('unresearched-fixture'));
  equal(await absent.json(),{state:'not_researched'});
  equal(inventoryReads,0);
  Date.now = () => now;
  for (const [row, expected] of [
    [{place_id:record.placeId,status:'OPERATIONAL',excluded:false},'ready'],
    [{place_id:record.placeId,status:'OPERATIONAL',excluded:true},'unavailable'],
    [{place_id:record.placeId,status:'CLOSED_PERMANENTLY',excluded:false},'unavailable'],
    [{place_id:record.placeId,status:null,excluded:false},'unavailable'],
  ]) {
    globalThis.fetch = async (url, init) => {
      inventoryReads++;
      equal(new URL(url).origin,'https://e2eplaceholder.supabase.co');
      equal(url.includes('place_id=eq.'+encodeURIComponent(record.placeId)),true);
      equal(init.cache,'no-store');
      equal(init.signal instanceof AbortSignal,true);
      return Response.json([row]);
    };
    const served = await routeModule.GET(request(record.placeId));
    equal(served.status,expected === 'ready' ? 200 : 503);
    equal((await served.json()).state,expected);
  }
  equal(inventoryReads,4);
  globalThis.fetch = async () => { inventoryReads++; return Response.json({error:'malformed'}); };
  const malformed = await routeModule.GET(request(record.placeId));
  equal(malformed.status,503);
  equal(await malformed.json(),{state:'unavailable'});
} finally {
  Date.now = realNow;
  globalThis.fetch = realFetch;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
const detail = readFileSync('app/components/sheets/Detail.js','utf8');
// Owner 2026-10-08: the score math is internal. The place sheet must never
// render the breakdown (starting score, curator adjustment, method copy) or a
// status box about Wayfind's own pipeline. The receipt still exists for us.
equal(/ScoreExplanation/.test(detail),false);
equal(detail.includes('Why this score?'),false);
{
  // Global lock: no page or component anywhere may print the score breakdown.
  const { readdirSync, statSync } = await import('node:fs');
  const walk = (d) => readdirSync(d).flatMap((n) => { const f = d + '/' + n; return statSync(f).isDirectory() ? walk(f) : /\.(js|jsx|ts|tsx)$/.test(n) ? [f] : []; });
  const banned = ['Why this score?', 'Starting score', 'Wayfind curator recommendation', 'The earlier breakdown of the starting score', 'A sourced verdict has not been prepared'];
  for (const f of walk('app')) { const src = readFileSync(f, 'utf8'); for (const b of banned) equal(src.includes(b), false, f + ' prints internal score copy: ' + b); }
}
const home = readFileSync('app/home.js','utf8');
equal(/setDetail\(\s*attachOfficialScoreReceipt\(\s*\{\s*\.\.\.p\s*\}\s*,\s*locName\s*\)\s*\)/.test(home),true);
equal(/attachOfficialScoreReceipt\(withSignalFields\(cur, next\), locName\)/.test(home),true);

// Detail-sheet path: Owen's inventory signals (wf_inventory, not a Places fetch).
// Deep-link / card-slim shapes copy a number without a receipt; the official
// scorer must be able to produce one that matches the chip.
const OWENS_ID = 'ChIJ5ab4TmtAw4gROiDA30SjNWY';
const owensBase = wayfindScore(4.6, 4531);
equal(owensBase, 92);
const owensDeep = attachOfficialScoreReceipt({
  id: OWENS_ID, name: "Owen's Fish Camp", rating: 4.6, reviews: 4531, wfScore: owensBase,
});
const owensReceipt = readableScoreReceipt(owensDeep);
equal(owensReceipt != null, true);
equal(owensReceipt.placeId, OWENS_ID);
equal(owensReceipt.origin, 'reviews');
equal(owensReceipt.start, 92);
equal(owensReceipt.score, 92);
equal(owensReceipt.steps, []);
equal(visibleScoreMath(owensDeep), null); // 9.2 → 9.2 is not an explanation
equal(owensDeep.governed_score, 92);
const owensCard = attachOfficialScoreReceipt({
  id: OWENS_ID, name: "Owen's Fish Camp", rating: 4.6, reviews: 4531,
  wfScore: owensBase, governed_score: 92, distMi: 2, trending: false,
});
equal(readableScoreReceipt(owensCard)?.score, 92);
equal(owensCard.governed_score, 92); // never replace the chip number
const owensFar = attachOfficialScoreReceipt({
  id: OWENS_ID, name: "Owen's Fish Camp", rating: 4.6, reviews: 4531, wfScore: owensBase, distMi: 18,
});
equal(readableScoreReceipt(owensFar)?.steps.map((s) => s.key), ['distance']);
equal(readableScoreReceipt(owensFar)?.score, 90);
equal(visibleScoreMath(owensFar)?.steps.map((s) => s.key), ['distance']);
equal(visibleScoreMath(raw)?.steps.map((s) => s.key), ['distance','trending']);
const staleNumber = attachOfficialScoreReceipt({ id: OWENS_ID, governed_score: 92 });
equal(readableScoreReceipt(staleNumber), null);
equal(staleNumber.score_explanation, undefined);
const mismatch = attachOfficialScoreReceipt({
  id: OWENS_ID, name: "Owen's Fish Camp", rating: 4.6, reviews: 4531, wfScore: owensBase, governed_score: 91,
});
equal(readableScoreReceipt(mismatch), null);
equal(mismatch.governed_score, 91);
const leftover = attachOfficialScoreReceipt({
  id: 'other-place',
  governed_score: owensDeep.governed_score,
  score_explanation: owensDeep.score_explanation,
});
equal(readableScoreReceipt(leftover), null);
equal(leftover.score_explanation, undefined);
const ranked = { id: 'ranked-row', wfScore: 90, governed_score: 90 };
const rankedCopy = attachOfficialScoreReceipt(ranked);
equal(ranked.score_explanation, undefined); // list row not mutated
equal(readableScoreReceipt(rankedCopy)?.score, 90);

equal(record.placeId, OWENS_ID);
equal(record.sentences[0].text, 'For a casual seafood dinner with old Florida character, the Burns Court location is a strong fit: its own site describes local fish, Southern dishes and a backyard tire swing.');
equal(record.sentences[1].text, 'It does not accept reservations and seats parties of up to eight, so choose another option if booking ahead or accommodating a larger group matters.');
console.log(`test-score-explanation: ${checks} assertions passed, including altered-receipt and revoked-source red proofs`);
