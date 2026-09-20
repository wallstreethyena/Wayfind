import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { knownCityGeocode } from '../lib/knownCityGeocode.js';
import { localCitySuggestions, createSearchAttempt } from '../lib/searchExperience.js';
import { localityFromFormattedAddress, centerAgreesWithLabel } from '../lib/locationHonesty.js';
import { themeParkIntent } from '../lib/themeParks.js';

// Run the actual UI handlers. React setters, the network and sheet rendering
// are the only boundaries mocked here; no copied search algorithm.
const source = readFileSync(process.argv[2] || new URL('../app/home.js', import.meta.url), 'utf8');
const ast = ts.createSourceFile('home.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const functions = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
const row = (extra = {}) => ({ id: 'known-cafe', displayName: {text:'Known Cafe'}, formattedAddress:'123 Main St, Orlando, FL 32801, USA', location:{latitude:28.54,longitude:-81.38}, exactMatch:true, ...extra });
function harness(query, response = {status:'ok',places:[row()]}) {
  const state = { query, suggestions: [], searchFeedback:'', calls:[], events:[], detail:{id:'old'}, hookDetail:{id:'old'} };
  const target = {
    setTimeout, clearTimeout,
    query, center:{lat:28.54,lng:-81.38}, deviceLoc:{lat:25.76,lng:-80.19}, locName:'Orlando, FL', screen:'suggested',
    manualRef:{current:true}, debounceRef:{current:null}, suggestionRequestRef:{current:0},
    mainSearchAbortRef:{current:null}, mainSearchAttemptRef:{current:null}, detailOpenRequestRef:{current:0},
    localCitySuggestions, createSearchAttempt, themeParkIntent, localityFromFormattedAddress, centerAgreesWithLabel,
    geocodeCity: async q => knownCityGeocode(q), feelingToMoment:()=>null,
    EXPERIENCES:{ pizza:{label:'Pizza',keyword:'pizza'}, coffee:{label:'Coffee',keyword:'coffee shop'}, citytrap:{label:'Best of Sarasota',keyword:'Sarasota highlights'} },
    C:{accent:'#ff7a12'},
    logEvent:(name,place,extra)=>state.events.push({name,place,...extra}),
    normalizeSearchPlace:p=> p?.id && Number.isFinite(p.location?.latitude) && Number.isFinite(p.location?.longitude) ? ({id:p.id,name:p.displayName.text,address:p.formattedAddress||'',lat:p.location.latitude,lng:p.location.longitude}) : null,
    openDetail:(p,context)=>{state.detail=p;state.detailContext=context;},
    openExperience:key=>state.experience=key, openMoment:feel=>state.moment=feel, openCurated:key=>state.curated=key,
    pickCat:key=>state.category=key, openSurprise:()=>state.surprise=true,
    fetch:async(url,init)=>{state.calls.push({url,init});return {ok:true,json:async()=>response};},
    window:{scrollTo(){}},
  };
  const ctx = new Proxy(target, {
    has:(obj,key)=>key in obj || typeof key === 'string' && /^set[A-Z]/.test(key),
    get:(obj,key)=> {
      if (key in obj) return obj[key];
      if (typeof key === 'string' && /^set[A-Z]/.test(key)) return value=> {
        const prop=key[3].toLowerCase()+key.slice(4);
        state[prop]=typeof value==='function'?value(state[prop]):value;
        if (['query','center','locName','screen'].includes(prop)) obj[prop]=state[prop];
      };
    },
  });
  for (const name of ['cancelMainSearch','onQueryChange','mainSearchJson','ownedSearch','searchFailureMessage','fetchSuggestions','closeSearchLayers','goToSearchCity','openSearchPlace','pickSuggestion','submitSearch']) {
    assert(functions.has(name), `${name} exists`);
    target[name]=new Function('ctx', `with(ctx) { return (${functions.get(name)}); }`)(ctx);
  }
  return {ctx,state};
}
const outcomes=s=>s.events.filter(e=>e.name==='search_outcome');
function oneOutcome(state, expected) {
  assert.equal(outcomes(state).length,1,'one terminal outcome per submitted attempt');
  if(expected) assert.equal(outcomes(state)[0].outcome,expected);
  const searches=state.events.filter(e=>e.name==='search');
  assert.equal(searches.length,1);
  assert.equal(searches[0].search_id,outcomes(state)[0].search_id);
}
{
 const {ctx,state}=harness('Known Cafe'); await ctx.submitSearch();
 assert.equal(state.detail.id,'known-cafe'); assert.equal(state.query,'');
 assert.equal(state.calls.length,1); assert.match(state.calls[0].url,/^\/api\/search\?/);
 assert(state.calls[0].init.signal,'request has cancellation/deadline');
 assert.equal(new URL(state.calls[0].url,'https://local').searchParams.get('lat'),'28.54','manual city wins over GPS');
 oneOutcome(state,'place_opened'); assert.equal(state.searchBusy,false);
}
{
 const {ctx,state}=harness('123 Main St, Orlando, FL'); await ctx.submitSearch();
 assert.equal(state.detail.id,'known-cafe');
 assert(!JSON.stringify(state.events).includes('123 Main'),'street query never reaches analytics');
 oneOutcome(state,'place_opened');
}
for(const places of [[row({exactMatch:false})],[row(),row({id:'second'})]]) {
 const {ctx,state}=harness('Known Cafe',{status:'ok',places}); await ctx.submitSearch();
 assert.equal(state.detail.id,'old','partial or ambiguous match never autoopens');
 assert.equal(state.suggestions.length,places.length);
 oneOutcome(state);
 const searchId=outcomes(state)[0].search_id;
 ctx.pickSuggestion(state.suggestions[0]);
 assert.equal(state.detail.id,'known-cafe'); assert.equal(state.detail._searchId,searchId);
 assert.equal(outcomes(state).length,1,'choosing a submitted result does not doublecount terminal outcome');
}
for(const query of ['Orlando','Sarasota','Sarasota, Florida']) {
 const {ctx,state}=harness(query); await ctx.submitSearch();
 assert.equal(state.calls.length,0,'known city never needs a provider');
 assert.match(state.cityTransition.text,/Now exploring/);
 assert.equal(state.detail,null); assert.equal(state.hookDetail,null);
 assert.equal(state.experience,undefined,'city wins over experience keyword containing city');
 oneOutcome(state,'city_changed');
}
{
 const {ctx,state}=harness('stale text'); await ctx.submitSearch('Orlando');
 assert.equal(state.events.find(e=>e.name==='search').q,'Orlando','programmatic override is the logged query');
}
for(const response of [{status:'empty',places:[]},{status:'unavailable',places:[],reason:'source_unavailable'},null,{status:'ok',places:[{}]}]) {
 const {ctx,state}=harness('Missing Cafe',response); await ctx.submitSearch();
 assert.match(state.searchFeedback,/No matching|temporarily unavailable/i);
 assert.equal(state.query,'Missing Cafe'); assert.equal(state.searchRecovery,true); assert.equal(state.searchBusy,false);
 oneOutcome(state);
}
{
 const {ctx,state}=harness('Missing Cafe'); ctx.fetch=async()=>({ok:false,status:503}); await ctx.submitSearch();
 assert.match(state.searchFeedback,/temporarily unavailable/i); oneOutcome(state,'unavailable');
}
{
 const {ctx,state}=harness(''); await ctx.submitSearch();
 assert.equal(state.calls.length,0); assert(state.searchFeedback); assert.equal(state.surprise,undefined);
}
{
 const {ctx,state}=harness('old cafe'); let finish;
 ctx.fetch=()=>new Promise(resolve=>finish=resolve);
 const pending=ctx.submitSearch();
 for(let i=0;i<30&&!finish;i++)await Promise.resolve();
 assert(finish,'old request started');
 ctx.onQueryChange('Orlando');
 clearTimeout(ctx.debounceRef.current); ctx.debounceRef.current=null;
 await ctx.submitSearch();
 finish({ok:true,json:async()=>({status:'ok',places:[row()]})}); await pending;
 assert.equal(state.detail,null,'old place cannot replace a newer city');
 assert.match(state.locName,/Orlando/); assert.equal(state.searchBusy,false);
 assert.equal(outcomes(state).length,2); assert.equal(outcomes(state)[0].outcome,'superseded'); assert.equal(outcomes(state)[1].outcome,'city_changed');
}
{
 const {ctx,state}=harness('Orl'); ctx.pickSuggestion(localCitySuggestions('Orl')[0]);
 assert.match(state.locName,/Orlando/); oneOutcome(state,'city_changed');
}
for (const [query,kind,value] of [['Coffee shop','experience','coffee'],['Pizza','experience','pizza'],['Hotel','category','hotels'],['Restaurante','category','food']]) {
 const {ctx,state}=harness(query); await ctx.submitSearch();
 assert.equal(state[kind],value); assert.equal(state.calls.length,0);
 oneOutcome(state,kind==='category'?'category_opened':'exploration_opened');
 assert.equal(outcomes(state)[0].count,undefined,'opening discovery is not proof of loaded results');
}
{
 const {ctx,state}=harness('Orlando, California',{status:'unavailable',reason:'unsupported_location',places:[]});
 await ctx.submitSearch(); assert.equal(state.cityTransition,null); assert.equal(state.detail.id,'old');
 assert.match(state.searchFeedback,/location yet/i); oneOutcome(state,'unavailable');
}
{
 const {ctx,state}=harness('Timed out Cafe'); let timeout;
 ctx.setTimeout=(fn,ms)=>{assert.equal(ms,10000);timeout=fn;return 1;}; ctx.clearTimeout=()=>{};
 ctx.fetch=(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('timeout'))));
 const pending=ctx.submitSearch(); for(let i=0;i<30&&!timeout;i++)await Promise.resolve();
 assert(timeout,'deadline is armed'); timeout(); await pending;
 assert.equal(state.searchBusy,false); assert.equal(state.query,'Timed out Cafe');
 assert.match(state.searchFeedback,/temporarily unavailable/i); oneOutcome(state,'unavailable');
}
{
 const {ctx,state}=harness('Known Cafe'); await ctx.submitSearch('Known Cafe',{placeIntent:true,near:'Key West'});
 assert.equal(state.calls.length,0,'an unsupported explicit guide region never searches the visitor city');
 assert.equal(state.detail.id,'old'); oneOutcome(state,'unavailable');
 assert.equal(outcomes(state)[0].reason,'unsupported_location');
}
{
 const {ctx,state}=harness('EPCOT',{status:'empty',reason:'not_in_library',places:[]});
 ctx.fetch=async(url,init)=>{state.calls.push({url,init});return url.startsWith('/api/theme-parks')?{ok:false,status:503}:{ok:true,json:async()=>({status:'empty',reason:'not_in_library',places:[]})};};
 await ctx.submitSearch(); oneOutcome(state,'unavailable');
 assert.equal(outcomes(state)[0].reason,'source_unavailable','park outage is not mislabeled a missing catalog entry');
}
{
 const {ctx,state}=harness('Known Cafe'); await ctx.submitSearch();
 assert.equal(state.detail._ownedSearchOnly,true,'owned search identity cannot trigger paid detail/insight enrichment');
 Object.assign(ctx,{
   sessionStorage:{setItem(){}}, experienceBadges(){}, scrollRef:{current:null},
   fetchMemberSignals:()=>Promise.resolve(null), supabase:null, recordSignal(){}, OFFERS:{},recentRef:{current:[]},
   videoCache:{current:{}},insightFullCache:{current:{}},insightCache:{current:{}},detailCache:{current:{}},
   getCachedInsight:()=>null, HINTS:{}, loadInsight(){},
   fetchPlaceDetail:()=>{throw new Error('owned search must not buy details');},
 });
 const realDetail=new Function('ctx',`with(ctx){return (${functions.get('openDetail')});}`)(ctx);
 await realDetail(state.detail,'search');
 assert.equal(state.detailExtra._resolved,true,'uncached details settle to honest unavailable state');
 for(const name of ['loadInsight','loadFullInsight']) {
   const actual=new Function('ctx',`with(ctx){return (${functions.get(name)});}`)(ctx);
   const before=state.calls.length; await actual(state.detail,state.detailExtra);
   assert.equal(state.calls.length,before,name+' uses only already-owned insight for this search');
 }
}
assert(source.includes('aria-busy={searchBusy}'),'search announces loading');
assert(source.includes('prefers-reduced-motion') || readFileSync(new URL('../app/components/css.js',import.meta.url),'utf8').includes('prefers-reduced-motion'),'motion respects preference');
assert(readFileSync(new URL('../middleware.js',import.meta.url),'utf8').includes('"/api/search"'),'free database route keeps full origin guard');
console.log('test-address-search: OK — real handlers: exact/ambiguous/address/city/override/empty/unavailable/stale, outcome linkage and privacy');
