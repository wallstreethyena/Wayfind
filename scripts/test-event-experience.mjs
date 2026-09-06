// Render both real event page functions with deterministic provider fixtures.
// Leaf integrations are stubbed; this tests layout/data/CTA gating, not payments or map WebGL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
let event, curated, photographs;
const leaf = () => null;
const style = () => React.createElement('style',null,'/* shared event presentation */');
function page(file) {
 const src=fs.readFileSync(file,'utf8');
 const code=ts.transpileModule(src,{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 const stubs={
  notFound:()=>{throw new Error('NOT_FOUND');},headers:()=>({get:()=>null}),
  resolveEventById:async()=>event,idFromSlug:()=> 'fixture',isEventWindow:()=>false,
  fetchCuratedEventBySlug:async()=>curated,fetchCuratedEvents:async()=>[],
  eventJsonLd:()=>null,dateRangeLabel:()=> 'September 18',eventWebsiteUrl:()=>null,
  eventPhotos:()=>photographs,addressLine:()=> '123 Test St, Sarasota, FL',
  directionsUrl:()=> 'https://www.google.com/maps/dir/?api=1&destination=test',
  websiteUrl:()=>null,safeUrl:()=>null,SITE_URL:'https://www.gowayfind.com',
  eventPairings:async()=>[],pairingHref:()=>null,clockLabel:()=>null,
  eventTicketCta:()=>curated?.is_free?null:{href:'/api/commerce/go?offer=test',label:'Get tickets ↗'},
  isTicketmasterFamily:()=>true,eventStoryEvidence:x=>x,eventStoryFallback:()=>({whyGo:'Fixture story'}),
 };
 const require=(spec)=>{
  if(spec.includes('EventExperienceStyles'))return {default:style};
  if(spec.includes('TicketButton'))return {default:p=>React.createElement('a',{'data-ticket':p.provider,href:p.url},p.label)};
  if(spec.includes('EventWhere'))return {default:p=>React.createElement('section',{'data-where':true},p.address)};
  return new Proxy({...stubs,default:leaf},{get:(o,k)=>k in o?o[k]:leaf});
 };
 vm.runInNewContext(code,{exports,require,React,console,URL,Date,Number,String,JSON},{filename:file});
 return exports.default;
}
const live=page('app/events/[city]/[slug]/page.js');
const local=page('app/florida-events/[slug]/page.js');
const fixture={id:'fixture',name:'Real fixture concert',date:'2026-09-18',time:'19:00',venue:'Fixture Hall',city:'Sarasota',lat:27.3,lng:-82.5,image:'/fixture-photo.jpg',url:'https://www.ticketmaster.com/fixture',price:'$45–$70',ticketed:true,source:'Fixture provider'};
let checks=0;
for(const cancelled of [false,true])for(const hasPhoto of [false,true]){
 event={...fixture,status:cancelled?'cancelled':'scheduled',image:hasPhoto?fixture.image:null};
 const html=renderToStaticMarkup(await live({params:{city:'sarasota',slug:'fixture'}}));
 assert.match(html,/class="wf-event-experience"/);assert.match(html,/class="wf-event-booking"/);
 assert.match(html,/Real fixture concert/);assert.match(html,/\$45/);assert.match(html,/123 Test St/);
 assert.equal(html.includes('data-ticket="ticketmaster"'),!cancelled);
 assert.equal(html.includes('src="/fixture-photo.jpg"'),hasPhoto);
 assert.ok(!html.includes('$59'));checks+=8;
}
for(const free of [false,true])for(const hasPhoto of [false,true]){
 curated={event_id:'fixture',event_name:'Fixture local event',year:2026,city:'Sarasota',state:'FL',venue:'Fixture Hall',is_free:free,price_band:'$25',lat:27.3,lng:-82.5};
 photographs=hasPhoto?{hero:{src:'/owned-photo.jpg',alt:'Owned event photo',w:1200,h:630},photos:[]}:null;
 const html=renderToStaticMarkup(await local({params:{slug:'fixture'}}));
 assert.match(html,/class="wf-event-booking"/);assert.match(html,/Fixture local event/);assert.match(html,/123 Test St/);
 assert.equal(html.includes('/api/commerce/go?offer=test'),!free);
 assert.equal(html.includes('src="/owned-photo.jpg"'),hasPhoto);
 assert.ok(!html.includes('$59'));checks+=6;
}
console.log(`test-event-experience: OK — ${checks} assertions across 8 real page renders; live/cancelled, paid/free, owned/missing photos. Provider/map internals remain covered separately.`);
