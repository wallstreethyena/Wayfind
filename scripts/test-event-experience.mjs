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
const reviewDir = process.argv.includes("--write-review") ? "public/design" : null;
const leaf = () => null;

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
  appleDirectionsUrl:()=> 'https://maps.apple.com/?daddr=27.3,-82.5&dirflg=d',
  websiteUrl:()=> 'https://www.universalorlando.com',websiteHost:()=> 'universalorlando.com',safeUrl:()=>null,SITE_URL:'https://www.gowayfind.com',
  eventPairings:async()=>Array.from({length:6},(_,i)=>({id:'fixture-place-'+i,name:['A long nearby restaurant name that should wrap cleanly','Nearby coffee and breakfast','A nearby dinner spot'][i%3],lat:27.3+i*.01,lng:-82.5,cat:'Restaurant',wfScore:98,distMi:1.2})),pairingHref:()=>'/p/fixture',clockLabel:()=>null,
  eventTicketCta:()=>curated?.is_free?null:{href:'/api/commerce/go?offer=test',label:'Get tickets ↗'},
  isTicketmasterFamily:()=>true,eventStoryEvidence:x=>x,eventStoryFallback:()=>({whyGo:'Fixture story'}),
 };
 const require=(spec)=>{
  if(spec==='react')return React;
  if(spec.includes('EventExperienceStyles'))return {default:page('app/components/EventExperienceStyles.js')};
  if(spec.includes('EventPlacePhoto'))return {default:page('app/components/EventPlacePhoto.js')};
  if(spec.includes('EventVenueMapLoader'))return {default:()=>React.createElement('div',{style:{height:420,display:'grid',placeItems:'center',background:'#17202b'}},'Map area · layout fixture')};
  if(spec.includes('TicketButton'))return {default:p=>React.createElement('a',{'data-ticket':p.provider,href:p.url},p.label)};
  if(spec.includes('EventWhere'))return {default:page('app/components/EventWhere.js')};
  if(spec.includes('EventRouteJump'))return {default:p=>React.createElement('a',{className:'wfw-btn wfw-dir',href:'#event-route'},p.children)};
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
 curated={event_id:'fixture',event_name:'Fixture local event',year:2026,city:'Sarasota',state:'FL',venue:'Fixture Hall',is_free:free,price_band:'$25',lat:27.3,lng:-82.5,wayfind_verdict:'Worth traveling for if you like being scared and can handle the crowd.'};
 photographs=hasPhoto?{hero:{src:'/owned-photo.jpg',alt:'Owned event photo',w:1200,h:630},photos:[]}:null;
 const html=renderToStaticMarkup(await local({params:{slug:'fixture'}}));
 assert.match(html,/class="wf-event-booking"/);assert.match(html,/Fixture local event/);assert.match(html,/123 Test St/);
 assert.equal(html.includes('/api/commerce/go?offer=test'),!free);
 assert.equal(html.includes('src="/owned-photo.jpg"'),hasPhoto);
 assert.ok(!html.includes('$59'));checks+=6;
 assert.match(html,/Worth traveling for/);
 checks++;
 if(!free) { assert.doesNotMatch(html,/style="margin:-\d+px 0 24px"/);assert.match(html,/style="margin:16px 0 24px"/);checks+=2; }
 if(reviewDir && !free && hasPhoto){
  fs.mkdirSync(reviewDir,{recursive:true});
  const document='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Event layout fixture</title></head><body style="margin:0;background:#080b10">'+html.replaceAll('/owned-photo.jpg','/brand/orlando-roller-coaster-portrait.jpg').replaceAll(/src="\/api\/photo[^"]*"/g,'src="/fixture-intentionally-missing.jpg"')+'</body></html>';
  fs.writeFileSync(path.join(reviewDir,'event-fixture.html'),document);
  fs.writeFileSync(path.join(reviewDir,'event-mobile-review.html'),'<!doctype html><html><head><title>Mobile layout review</title></head><body style="margin:0;background:#1b2330;color:white;font-family:Arial"><p>Layout verification fixture. Fictional event; map and booking integrations are stubbed.</p>'+[320,390,430].map(w=>'<iframe title="'+w+'px mobile layout" src="event-fixture.html" style="display:inline-block;vertical-align:top;width:'+w+'px;height:860px;border:1px solid #536070;margin:5px"></iframe>').join('')+'</body></html>');
 }
}
console.log(`test-event-experience: OK — ${checks} assertions across 8 real page renders; live/cancelled, paid/free, owned/missing photos. Provider/map internals remain covered separately.`);
