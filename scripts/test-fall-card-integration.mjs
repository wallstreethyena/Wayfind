#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const { transformSync } = require('next/dist/build/swc');
const root = process.cwd(), cardFile = path.join(root,'app/components/RailCard.js'), fallFile = path.join(root,'app/components/FallIntentRails.js');
const originalLoader = Module._extensions['.js'], originalLoad = Module._load;
let now = new Date('2026-10-04T22:00:00Z');
const sentinelRef = () => {};
const effects = [];
let state=[], cursor=0, payload=null, fallStateCalls=0;
let checks=0;
const ok=(value,message)=>{assert.ok(value,message);checks++;};
Module._extensions['.js'] = (module, filename) => {
  if (!filename.startsWith(root + path.sep) || filename.includes('/node_modules/')) return originalLoader(module,filename);
  const source = fs.readFileSync(filename,'utf8');
  module._compile(transformSync(source,{filename,jsc:{parser:{syntax:'ecmascript',jsx:true},target:'es2020',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}}).code,filename);
};
Module._load=function(request,parent,isMain){
  let resolved='';try{resolved=Module._resolveFilename(request,parent,isMain);}catch{}
  if(request==='react' && parent?.filename===cardFile) return {...React,useState:(init)=>{const index=cursor++;if(!(index in state))state[index]=typeof init==='function'?init():init;return [state[index],(value)=>{state[index]=typeof value==='function'?value(state[index]):value;}];}};
  if(request==='react' && parent?.filename===fallFile) return {...React,useState:(init)=>[fallStateCalls++===0?payload:typeof init==='function'?init():init,()=>{}],useRef:()=>({current:''}),useEffect:(fn,deps)=>{effects.push({fn,deps});},useMemo:(fn)=>fn()};
  if(resolved===path.join(root,'app/components/useEventClock.js'))return {__esModule:true,default:()=>now};
  if(parent?.filename===cardFile && resolved===path.join(root,'lib/cardActions.js'))return {useCardActions:()=>({hydrated:false})};
  if(parent?.filename===cardFile && resolved===path.join(root,'lib/contentCardActions.js'))return {useContentCardActions:()=>({toggleSave:()=>{},toggleLike:()=>{},toggleDislike:()=>{},share:()=>{}})};
  if(parent?.filename===cardFile && resolved===path.join(root,'app/components/useCardTapIntent.js'))return {useCardTapIntent:()=>({shouldOpen:()=>true})};
  if(parent?.filename===cardFile && resolved===path.join(root,'app/components/photoPolicyContext.js'))return {usePhotoSrcFilter:()=>(src)=>src};
  if(parent?.filename===fallFile && resolved===path.join(root,'app/components/GuideRailCollection.js'))return {__esModule:true,default:({children})=>React.createElement(React.Fragment,null,children)};
  if(parent?.filename===fallFile && resolved===path.join(root,'app/components/FallRecommendedHotels.js'))return {__esModule:true,default:()=>null};
  if(parent?.filename===fallFile && resolved===path.join(root,'lib/curatorPicks.js'))return {useCuratorPicks:()=>({}),applyCuratorPicks:(items)=>items};
  if(parent?.filename===fallFile && resolved===path.join(root,'app/components/usePagedRail.js'))return {usePagedRail:(_route,_params,opts)=>({items:opts.seedItems,total:opts.seedTotal,sentinelIndex:7,sentinelRef,loading:false,loadingMore:false})};
  return originalLoad.call(this,request,parent,isMain);
};
try{
  const RailCard=require('../app/components/RailCard.js').default;
  const CardPhoto=require('../app/components/CardPhoto.js').default;
  const cardProps={title:'Verified event',photo:'/licensed/current-event.webp',photoFallback:'/api/photo?place=ChIJExactVenue',visitFacts:{start_date:'2026-10-01',end_date:'2026-11-01',place_id:'ChIJExactVenue',venue:'Exact Venue',hero_image:'/licensed/current-event.webp',photoAttr:'Original photographer',photoAttrHref:'https://example.com/license'}};
  const walk=(node,fn)=>{if(!node||typeof node!=='object')return;fn(node);React.Children.forEach(node.props?.children,(child)=>walk(child,fn));};
  cursor=0;let tree=RailCard(cardProps), primary=null;
  walk(tree,(node)=>{if(node.type===CardPhoto&&node.props['data-fallback'])primary=node;});
  ok(!!primary,'real primary image exposes its owned same-venue fallback');
  ok(renderToStaticMarkup(tree).includes('Original photographer'),'original image starts with its own credit');
  primary.props.onError({currentTarget:{dataset:{fallback:cardProps.photoFallback},src:cardProps.photo}});
  cursor=0;tree=RailCard(cardProps);const fallbackMarkup=renderToStaticMarkup(tree);
  ok(!fallbackMarkup.includes('Venue photo')&&fallbackMarkup.includes('>©<'),'actual image onError keeps the plain (c) chip and prints no venue caption');
  ok(fallbackMarkup.includes('Photo: Google Maps')&&!fallbackMarkup.includes('Original photographer'),'fallback cannot retain the old image author credit');
  let fallback=null;walk(tree,(node)=>{if(node.type===CardPhoto&&node.props.src===cardProps.photoFallback&&node.props['data-fallback']!==undefined)fallback=node;});
  ok(!!fallback&&fallback.props['data-fallback']==='','fallback is used once, never an image-error loop');
  fallback.props.onError({currentTarget:{dataset:{fallback:''}}});
  cursor=0;const failed=renderToStaticMarkup(RailCard(cardProps));
  ok(failed.includes('wf-place-card-monogram')&&!failed.includes('wf-event-card-backdrop'),'second failure leaves honest unavailable-photo fallback');

  const FallIntentRails=require('../app/components/FallIntentRails.js').default;
  payload={phase:'opening',rails:[{id:'farms',title:'Expired-only rail',cards:[{id:'expired',kind:'event',name:'Ended one-day event',start_date:'2026-10-03',end_date:null,detailHref:'/florida-events/expired',image:'/event.webp'}]}]};
  const expired=renderToStaticMarkup(React.createElement(FallIntentRails,{center:{lat:27.95,lng:-82.46}}));
  ok(!expired.includes('Expired-only rail')&&!expired.includes('data-rail="fall-intent-farms"'),'retained prior-day payload removes expired-only title, region and card before visibility/counts');
  payload={phase:'opening',rails:[{id:'farms',title:'Active rail',cards:[{id:'expired',kind:'event',name:'Ended event',start_date:'2026-10-03',end_date:null,image:'/event.webp'},{id:'active',kind:'event',name:'Future event',start_date:'2026-10-10',end_date:'2026-10-11',detailHref:'/florida-events/future',image:'/event.webp'}]}]};
  state=[];cursor=0;fallStateCalls=0;
  const mixed=renderToStaticMarkup(React.createElement(FallIntentRails,{center:{lat:27.95,lng:-82.46}}));
  ok(mixed.includes('Active rail')&&mixed.includes('Future event')&&!mixed.includes('Ended event'),'mixed retained payload preserves legitimate future event');
  ok(mixed.includes('aria-label="Rank 1"')&&!mixed.includes('aria-label="Rank 2"'),'expiry recomputes visible rank, not a hole');

  payload={today:'2026-10-03',phase:'opening',rails:[{id:'farms',title:'Yesterday generation',cards:Array.from({length:11},(_,i)=>({id:`old-${i}`,kind:'event',name:i===10?'Later survivor':'Expired event',start_date:i===10?'2026-10-10':'2026-10-03',end_date:i===10?'2026-10-11':null,image:'/event.webp'}))}]};
  state=[];cursor=0;fallStateCalls=0;
  const generation=renderToStaticMarkup(React.createElement(FallIntentRails,{center:{lat:27.95,lng:-82.46}}));
  ok(!generation.includes('Yesterday generation')&&generation.includes('Ranking Florida fall experiences'),'all-expired loaded page from yesterday refreshes its generation instead of draining obsolete offsets');
  ok(effects.at(-1).deps[0].endsWith('|2026-10-04'),'new venue day participates in the actual bulk request effect identity');
  payload={phase:'opening',rails:[{id:'farms',title:'Sentinel rail',cards:Array.from({length:11},(_,i)=>({id:`sentinel-${i}`,kind:'event',name:i>=9?`Survivor ${i}`:'Expired event',start_date:i>=9?'2026-10-10':'2026-10-03',end_date:i>=9?'2026-10-11':null,image:'/event.webp'}))}]};
  state=[];cursor=0;fallStateCalls=0;
  const railRoot=FallIntentRails({center:{lat:27.95,lng:-82.46}});let section=null;
  walk(railRoot,(node)=>{if(node.type?.name==='FallRailSection')section=node;});
  ok(section?.key==='2026-10-04:farms','paged rail remount key changes with the date generation');
  const sectionTree=section.type(section.props);let survivor=null;
  walk(sectionTree,(node)=>{if(node.type===RailCard&&node.props.title==='Survivor 9')survivor=node;});
  ok(survivor?.props.domRef===sentinelRef,'expired slots cannot remove the pagination sentinel from the final visible card');

  const {fetchCuratedEvents,curatedToFeedEvent,eventJsonLd}=require('../lib/curatedEvents.js');
  const central={event_id:'central-fixture',slug:'central-fixture',year:2026,event_status:'scheduled',source_tier:1,verification_confidence:'high',card_hook:'Verified event fixture',event_name:'Pensacola fixture',state:'FL',city:'Pensacola',start_date:'2026-10-04',end_date:'2026-10-04',start_time:'11:00:00',end_time:'13:00:00',timezone:'America/Chicago'};
  let selected='';const query={select:(columns)=>{selected=columns;return query;},in:()=>query,order:()=>query,abortSignal:()=>query,limit:async()=>({data:[Object.fromEntries(selected.split(',').map(key=>[key,central[key]]))],error:null})};
  const rows=await fetchCuratedEvents({limit:1,db:{from:()=>query},signal:null});
  const {eventVisitStatus}=require('../lib/eventVisitFacts.js');
  ok(eventVisitStatus(curatedToFeedEvent(rows[0]).visitFacts,new Date('2026-10-04T15:30:00Z')).label==='Opens today','actual DB projection -> feed -> session retains Central timezone');
  const {withVerifiedFallVisitFacts}=require('../lib/fallVisitFacts2026.js');
  const hyde=withVerifiedFallVisitFacts({...central,event_id:'hyde-park-pumpkin-patch-2026',is_free:true,price_min:0});
  const hhn=withVerifiedFallVisitFacts({...central,event_id:'hhn-orlando-2026',is_free:false,price_min:94.1});
  ok(hyde.is_free===null&&hyde.price_min===null&&!eventJsonLd(hyde)?.offers?.price,'unknown Hyde admission clears stale free price in scalar and schema');
  ok(hhn.price_min===null&&!eventJsonLd(hhn)?.offers?.price,'unknown HHN starting price cannot leak stale price via schema');
}finally{Module._extensions['.js']=originalLoader;Module._load=originalLoad;}
console.log(`test-fall-card-integration: OK — ${checks} actual fallback, retained-payload expiry, timezone projection and schema consistency assertions`);
