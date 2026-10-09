import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { GUIDES } from '../lib/guides.js';
import { currentGuides } from '../lib/guideLifecycle.js';
import { guideDiscoveryIndex } from '../lib/guideDiscoveryIndex.js';
import { guideForPlaceRail } from '../lib/guideDiscovery.js';
import { guideHero, GUIDE_IMAGE_BRIEFS } from '../lib/guideHero.js';
import { guideImageProblems } from '../lib/guideImagePolicy.js';
const guides = guideDiscoveryIndex(currentGuides(GUIDES, '2026-10-04'));
assert(guides.length > 30, 'nonempty production guide corpus');
assert(guides.every(g => g.image?.src && existsSync(new URL('../public' + g.image.src, import.meta.url))), 'every current guide has its real licensed asset');
assert(guides.every(g => !('reviewNotes' in g.image) && !('intro' in g)), 'no review or article bulk reaches client');
assert(!guides.some(g => g.slug === 'red-bull-dance-your-style-tampa-2026'), 'ended guide is excluded');
const local = guides.find(g => g.slug === 'robinson-preserve-bradenton');
const candidate = local || guides.find(g => g.region === 'Bradenton' && g.placeIds.length);
assert(candidate, 'real local guide with covered venues');
const places = Array.from({length:12}, (_,i) => ({id: i===4 ? candidate.placeIds[0] : 'unrelated-'+i, _s:100-i}));
const before=JSON.stringify(places);
const selected=guideForPlaceRail(guides,places,'outdoors');
// OWNER RULE 2026-10-08 (lib/railGuideSlot.js): the guide is the rail's THIRD card.
assert(selected && selected.before===2, 'the guide is the third card of its rail (index 2)');
assert(selected.guide.placeIds.some(id=>places.some(p=>p.id===id)), 'exact venue relevance');
assert.equal(JSON.stringify(places),before,'ranked list untouched');
assert.deepEqual(guideForPlaceRail(guides,places,'outdoors'),selected,'no render jitter');
assert.deepEqual(guideForPlaceRail(guides,[...places,{id:'new-page'}],'outdoors'),selected,'paging does not move initial insert');
assert.equal(guideForPlaceRail(guides,places.map(p=>({...p,id:'miami-'+p.id})),'outdoors'),null,'unrelated city/venue IDs do not match');
assert.equal(guideForPlaceRail(guides,places.slice(0,3),'outdoors'),null,'thin rails have no insert');
assert.equal(guideForPlaceRail([{...candidate,image:null}],places,'outdoors'),null,'no unreviewed image insert');
assert.equal(guideForPlaceRail([candidate],places.map(p=>({...p,_sponsored:true})),'outdoors'),null,'ads never authorize relevance');
assert(guideForPlaceRail([candidate,candidate],places,'outdoors'),'duplicates yield just one selection');
const withAd=[{id:'ad',_sponsored:true},...places];
assert.equal(guideForPlaceRail(guides,withAd,'outdoors').before,2,'with an ad in front the guide is still the third card the reader sees');
const positions = new Set(Array.from({length:30},(_,i)=>guideForPlaceRail([candidate],places,'rail-'+i).before));
assert(positions.size===1 && positions.has(2),'every rail puts the guide at the same third slot');
const miami = guideHero('things-to-do-in-miami-florida');
assert(miami.src.includes('vizcaya'), 'beyond the beach uses covered museum, not beach');
assert.deepEqual(guideImageProblems(miami,GUIDE_IMAGE_BRIEFS['things-to-do-in-miami-florida']),[],'Miami rights and subject policy passes');
assert(guideImageProblems({...miami,subject:'beach'},GUIDE_IMAGE_BRIEFS['things-to-do-in-miami-florida']).includes('wrong-subject'),'red proof: beach mismatch fails');
const component=readFileSync(new URL('../app/components/GuideDiscoveryCard.js',import.meta.url),'utf8');
assert(component.includes("from './RailCard'") && component.includes('<RailCard'),'guide card renders the standard RailCard');
assert(!/GuideFigure|Illustrative|unsplash|module\.css/i.test(component),'no illustrative hero, credit or private stylesheet');
assert(!existsSync(new URL('../app/components/GuideDiscoveryCard.module.css',import.meta.url)),'old guide card stylesheet is gone');
const ladder=readFileSync(new URL('../lib/guideCardPhoto.js',import.meta.url),'utf8');
assert(component.includes("guideCardPhoto(guide, matched)") && ladder.includes('ownedPlacePhotoSrc(placeId, 640, true)'),'photo ladder ends at the matched pick, no-spend (lib/guideCardPhoto.js)');
assert(candidate.topics?.length>=1 && candidate.pickCount>=1,'index carries deterministic topics and pick count');
console.log(`test-guide-discovery: OK — ${guides.length} active guide images, stable relevant inserts, source list immutability, archive exclusion, attribution and subject negative controls`);

// A short first page is the boundary the old length-only test missed.
const shortPlaces = Array.from({length:4}, (_,i)=>({id:i===1?candidate.placeIds[0]:'short-'+i}));
const shortSelection = guideForPlaceRail([candidate], shortPlaces, 'short-rail');
assert(shortSelection && shortSelection.before===2);
const laterGuide={...candidate,slug:'new-guide-on-next-page',placeIds:['late-match']};
const eight=[...shortPlaces,{id:'late-match'},...Array.from({length:3},(_,i)=>({id:'page-'+i}))];
const keptEight=guideForPlaceRail([laterGuide,candidate],eight,'short-rail',shortSelection);
assert.equal(keptEight.guide.slug,shortSelection.guide.slug,'4→8 retains selected guide despite newly eligible guide');
assert.equal(keptEight.before,2,'4→8 keeps the third slot');
const keptTwelve=guideForPlaceRail([laterGuide,candidate],[...eight,...places.slice(8)],'short-rail',keptEight);
assert.equal(keptTwelve.before,2,'8→12 keeps the third slot');
assert.equal(guideForPlaceRail([laterGuide],eight,'short-rail',shortSelection).guide.slug,laterGuide.slug,'removed or archived selection releases slot');

const {guideRailCandidates,settleGuideRailSelection}=await import('../lib/guideRailCollections.js');
const rails=[{id:'unrelated',places:[{id:'other'}]},{id:'covered',places:[{id:candidate.placeIds[0],name:'Test Spot'}]},{id:'event',cards:[{id:candidate.placeIds[0],kind:'event'}]},{id:'tour',cards:[{id:candidate.placeIds[0],kind:'tour'}]}];
const railsBefore=JSON.stringify(rails);
const matches=guideRailCandidates([candidate,candidate],rails,'collection');
assert.equal(matches.length,1,'one exact guide/rail match, no duplicate event or tour inference');
assert.equal(matches[0].railId,'covered');
assert.equal(JSON.stringify(rails),railsBefore,'ranked composer rows untouched');
const previous=matches[0];
const nextMatches=guideRailCandidates([candidate,laterGuide],[...rails,{id:'new',places:[{id:'late-match'}]}],'collection');
assert.equal(settleGuideRailSelection(nextMatches,previous).guide.slug,candidate.slug,'late collection results do not displace a valid guide');
assert.equal(settleGuideRailSelection([],previous),null,'location/filter/no-match removes stale guide');
assert.equal(guideRailCandidates([candidate],[{id:'ad',places:[{id:candidate.placeIds[0],_sponsored:true}]}],'collection').length,0,'sponsored rows excluded');
console.log('test-guide-discovery: short-page stability and all composer matching negative controls OK');

// Execute the real collection and card.
const React=(await import('react')).default;
const {renderToStaticMarkup}=await import('react-dom/server');
const path=await import('node:path');
const {loadComponent}=await import('./lib/jsxLoad.mjs');
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const {Collection,GuideDiscoveryContext:Context,RailGuideSlot}=await loadComponent(path.join(root,'scripts/lib/guideCollectionHarness.js'),root);
// Each rail renders its own track; the collection only says which rail owns the
// guide, and that rail's RailGuideSlot puts it third INSIDE the track.
const track=(rail)=>React.createElement('div',{key:rail.id,className:'wf-rail','data-test-rail':rail.id},
  React.createElement(RailGuideSlot,{railId:rail.id},[0,1,2,3].map(n=>React.createElement('i',{key:n,'data-card':rail.id+'-'+n}))));
const collectionMarkup=renderToStaticMarkup(React.createElement(Context.Provider,{value:[candidate]},
  React.createElement(Collection,{rails,collectionId:'collection'},rails.map(track))));
const cardAt=collectionMarkup.indexOf('wf-rail-card');
assert(collectionMarkup.includes('wf-rail-card')&&collectionMarkup.includes('wf-place-card'),'card carries the standard place card classes');
assert.equal((collectionMarkup.match(/<article/g)||[]).length,1,'actual shared collection renders exactly one guide card, as a standard rail card');
const covered=collectionMarkup.slice(collectionMarkup.indexOf('data-test-rail="covered"'),collectionMarkup.indexOf('data-test-rail="event"'));
assert(covered.includes('wf-rail-card'),'the guide is INSIDE its covered rail track, not between rails');
assert(covered.indexOf('data-card="covered-1"')<covered.indexOf('wf-rail-card') && covered.indexOf('wf-rail-card')<covered.indexOf('data-card="covered-2"'),'the guide is the third card of the track (after two place cards)');
assert(cardAt>collectionMarkup.indexOf('data-test-rail="covered"') && cardAt<collectionMarkup.indexOf('data-test-rail="event"'),'nothing renders between rails');
assert(!collectionMarkup.includes('Illustrative') && !collectionMarkup.includes('data-guide-discovery') && !collectionMarkup.includes('<figcaption'),'no illustrative disclaimer, no old guide grid, no photographer line');
// Guide cards (owner, 2026-10-07): NO chip bubbles, the full title is the focus
// (scripts/check-guide-card.mjs pins the unclamped title), the read time rides
// in the filled "Local guide" tag.
assert(collectionMarkup.includes('wf-guide-card') && !collectionMarkup.includes('wf-place-card-highlights'),'guide card is the guide variant and carries no chip bubbles');
assert(!/[\u2013\u2014]/.test((collectionMarkup.match(/wf-place-card-name">(.*?)<\/div>/)||[])[1]||''),'title has no dashes');
assert(!collectionMarkup.includes('wf-place-card-score'),'no score or READ badge box competes with the title');
assert(/wf-place-card-category">Local guide/.test(collectionMarkup),'the filled Local guide tag leads the card');
assert(collectionMarkup.includes('Local guide') && collectionMarkup.includes(`${candidate.mins} min`) && collectionMarkup.includes('Read the guide'),'tag with read time and single CTA');
assert(collectionMarkup.includes(`/guides/${candidate.slug}`),'internal guide link survives');
assert.equal((collectionMarkup.match(/data-test-rail=/g)||[]).length,rails.length,'every original rail stays present');
const withoutContext=renderToStaticMarkup(React.createElement(Collection,{rails,collectionId:'collection'},rails.map(track)));
assert(!withoutContext.includes('wf-rail-card'),'no context means no guessed guide suggestions');
console.log('test-guide-discovery: real React collection/card render passed; one standard guide card, third inside its own rail');
{
  const css = readFileSync(new URL('../app/components/railMenuCss.js', import.meta.url), 'utf8');
  const rule = css.match(/\.wf8-guide-insert\{[^`]*/)?.[0] || '';
  assert(/--wf-place-card-width:min\(100%,/.test(rule) && /flex:0 0 var\(--wf-place-card-width\)/.test(rule) && /width:var\(--wf-place-card-width\)/.test(rule), 'guide insert uses the same width token as place-card slots');
  const ccss = readFileSync(new URL('../app/components/css.js', import.meta.url), 'utf8');
  const tok = ccss.match(/\.wf8-pcrail \.wf-place-card-slot\{--wf-place-card-width:(.*)\}\n/)?.[1];
  const mine = rule.match(/--wf-place-card-width:(.*?);flex/)?.[1];
  const norm = (x) => x.replace(/\$\{[^}]*\}/g, (m) => m);
  assert(tok && mine && norm(tok) === norm(mine), 'guide insert width formula is byte-identical to the sibling place-card width formula');
}
