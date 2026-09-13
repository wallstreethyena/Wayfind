import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadComponent } from './lib/jsxLoad.mjs';
import { governedWayfindScore } from '../lib/wayfindScore.js';
import { wayfindScore } from '../lib/wayfindScore.js';
import { stampGoverned, lawfulSort, governedScoreOf, attachOfficialScoreReceipt } from '../lib/lawfulOrder.js';
import { stampOwnerPick } from '../lib/ownerBump.js';
import { readableScoreReceipt } from '../lib/scoreExplanation.js';
import { publishableVerdict, serveScoreVerdict } from '../lib/scoreVerdict.js';

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
const raw = {id:'score-fixture', name:'Score fixture', rating:4.6, reviews:3000, distance_mi:18, trending:true};
stampGoverned([raw]);
const receipt = readableScoreReceipt(raw);
equal(receipt.origin,'reviews');
equal(receipt.steps.map(s=>s.key), ['distance','trending']);
equal(receipt.score,raw.governed_score);
const owned = stampOwnerPick({id:'owned-fixture',wfScore:96},true);
stampGoverned([owned]);
equal(readableScoreReceipt(owned).steps[0].delta,4); // actual capped +0.4, not +0.7
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
const good = await serveScoreVerdict(record.placeId,args);
equal(good.status,200);
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
const detail = readFileSync('app/components/sheets/Detail.js','utf8');
equal(/<ScoreExplanation\s+place=\{detail\}\s*\/>/.test(detail),true);
const home = readFileSync('app/home.js','utf8');
equal(/setDetail\(\s*attachOfficialScoreReceipt\(\s*\{\s*\.\.\.p\s*\}\s*,\s*locName\s*\)\s*\)/.test(home),true);
equal(/attachOfficialScoreReceipt\(\s*\{\s*\.\.\.cur,\s*wfScore:/.test(home),true);

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
const component = await loadComponent(fileURLToPath(new URL('../app/components/ScoreExplanation.js',import.meta.url)),fileURLToPath(new URL('..',import.meta.url)));
const render = place => renderToStaticMarkup(createElement(component.default,{place}));
const html = render(owned);
equal(html.includes('Why this score?'),true);
equal(html.includes('Wayfind curator recommendation'),true);
equal(html.includes('+0.4'),true);
equal(html.includes('+0.7'),false);
equal(html.includes('The earlier breakdown of the starting score is unavailable.'),true);
equal(render(stale).includes('The calculation breakdown for this score is unavailable.'),true);
equal(render(raw).includes('using a review average adjusted for review count'),true);
equal(render(null).includes('Why this score?'),true);
const owensHtml = render(owensDeep);
equal(owensHtml.includes('using a review average adjusted for review count'),true);
equal(owensHtml.includes('9.2'),true);
equal(owensHtml.includes('No additional ranking adjustments were applied.'),true);
equal(owensHtml.includes('The calculation breakdown for this score is unavailable.'),false);
equal(render(staleNumber).includes('The calculation breakdown for this score is unavailable.'),true);
equal(render(leftover).includes('The calculation breakdown for this score is unavailable.'),true);
equal(render(leftover).includes('9.2'),false);
console.log(`test-score-explanation: ${checks} assertions passed, including altered-receipt and revoked-source red proofs`);
