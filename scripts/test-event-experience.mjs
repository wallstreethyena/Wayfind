// Render both real event page functions with deterministic provider fixtures.
// The shared shell, story, and action controls are real. Provider, payment,
// storage, analytics, and map leaves are stubbed so this stays deterministic.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// REAL, not stubbed: the venue-photo rung is the thing under test below.
import { eventVenueImageSrc, withTampaPassFacts } from '../lib/eventPageImage.js';
import { eventDatesLabel } from '../lib/eventOccurrences.js';
import { FALL_EVENT_IMAGE_HOLDS } from '../lib/fallEventImage.js';
import { FALL_DISCOVERIES_2026 } from '../lib/fallDiscoveries2026.js';
import { orderPlaceRecommendations } from '../lib/placeRecommendationOrder.js';
import * as eventVisitFacts from '../lib/eventVisitFacts.js';
import * as eventTimeReal from '../lib/eventTime.js';
let event, curated, photographs, social = [];
let mapPicks, nearbyPicks;
const reviewDir = process.argv.includes("--write-review") ? "public/design" : null;
const leaf = () => null;
const modules = new Map();

const contentActions = {
 saved: false, liked: false, disliked: false,
 toggleSave() {}, toggleLike() {}, toggleDislike() {}, share() {},
};

function page(file) {
 if(modules.has(file)) return modules.get(file);
 const src=fs.readFileSync(file,'utf8');
 const code=ts.transpileModule(src,{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 const stubs={
  notFound:()=>{throw new Error('NOT_FOUND');},headers:()=>({get:()=>null}),
  resolveEventById:async()=>event,idFromSlug:()=> 'fixture',isEventWindow:()=>false,
  fetchCuratedEventBySlug:async()=>curated,fetchCuratedEvents:async()=>[],
  eventJsonLd:()=>null,dateRangeLabel:()=> 'September 18',eventWebsiteUrl:()=>null,
  eventPhotos:()=>photographs,eventVenueImageSrc,withTampaPassFacts,eventDatesLabel,addressLine:()=> '123 Test St, Sarasota, FL',
  directionsUrl:()=> 'https://www.google.com/maps/dir/?api=1&destination=test',
  appleDirectionsUrl:()=> 'https://maps.apple.com/?daddr=27.3,-82.5&dirflg=d',
  websiteUrl:()=> 'https://www.universalorlando.com',websiteHost:()=> 'universalorlando.com',safeUrl:()=>null,SITE_URL:'https://www.gowayfind.com',
  eventPairings:async()=>Array.from({length:6},(_,i)=>({id:'fixture-place-'+i,name:['A long nearby restaurant name that should wrap cleanly','Nearby coffee and breakfast','A nearby dinner spot'][i%3],lat:27.3+i*.01,lng:-82.5,cat:'Restaurant',wfScore:98,distMi:1.2})),
  cachedEventPairings:async()=>({places:Array.from({length:6},(_,i)=>({id:'fixture-place-'+i,name:['A long nearby restaurant name that should wrap cleanly','Nearby coffee and breakfast','A nearby dinner spot'][i%3],lat:27.3+i*.01,lng:-82.5,cat:'Restaurant',wfScore:98,distMi:1.2})),unavailable:false}),pairingHref:()=>'/p/fixture',clockLabel:()=>null,
  eventSocialPosts:()=>social,
  isEmbeddable:()=>true,
  embedSrc:()=>"https://www.instagram.com/reel/fixture/embed/", PLATFORM:{instagram:{label:"Instagram",color:"#E1306C"}},
  eventDetailTicketAction:()=>curated?.is_free?null:{kind:'affiliate',href:'/api/commerce/go?offer=test',label:'Get tickets ↗'},
  eventTicketCta:()=>curated?.is_free?null:{href:'/api/commerce/go?offer=test',label:'Get tickets ↗'},
  isTicketmasterFamily:()=>true,eventStoryEvidence:x=>x,eventStoryFallback:()=>({whyGo:longReason,bestFor:'People making a real plan together',expect:'A busy entrance and a full evening'}),
  useContentCardActions:()=>contentActions,addPlaceToTrips:(trips)=>trips,
  shareOut:()=> 'clipboard',track:()=>{},
 };
 const require=(spec)=>{
  if(spec==='react')return React;
  if(spec.includes('eventVisitFacts'))return eventVisitFacts;
  if(spec.endsWith('lib/eventTime.js'))return eventTimeReal;
  if(spec.includes('placeRecommendationOrder'))return {orderPlaceRecommendations};
  if(spec.includes('CreatorPlaybackDetails'))return {default:p=>React.createElement(React.Fragment,null,p.children,React.createElement('button',null,'Details'),React.createElement('div',null,p.details)),usePlaybackDetails:()=>null};
  if(spec.includes('CreatorVideoRail'))return {default:page('app/components/CreatorVideoRail.js')};
  if(spec.includes('VideoFacade'))return {default:page('app/components/VideoFacade.js')};
  if(spec.includes('EventDetailShell'))return {default:page('app/components/EventDetailShell.js')};
  if(spec.includes('EventExperienceStyles'))return {default:page('app/components/EventExperienceStyles.js')};
  if(spec.includes('/EventStory') || spec.endsWith('./EventStory.js'))return {default:page('app/events/[city]/[slug]/EventStory.js')};
  if(spec.includes('/EventActions') || spec.endsWith('./EventActions.js'))return {default:page('app/events/[city]/[slug]/EventActions.js')};
  if(spec.includes('SaveEventButton'))return {default:page('app/florida-events/[slug]/SaveEventButton.js')};
  if(spec.includes('ShareButton'))return {default:page('app/components/ShareButton.js')};
  if(spec.includes('EventPlacePhoto'))return {default:page('app/components/EventPlacePhoto.js')};
  if(spec.includes('EventVenueMapLoader'))return {default:p=>{mapPicks=p.picks;return React.createElement('div',{style:{height:420,display:'grid',placeItems:'center',background:'#17202b'}},'Map area · layout fixture');}};
  if(spec.includes('EventNearbyCards'))return {default:p=>{nearbyPicks=p.places;return null;}};
  if(spec.includes('EventMapPlaces'))return {default:page('app/components/EventMapPlaces.js')};
  if(spec.includes('TicketButton'))return {default:p=>React.createElement('a',{'data-ticket':p.provider,href:p.url},p.label)};
  if(spec.includes('EventWhere'))return {default:page('app/components/EventWhere.js')};
  if(spec.includes('EventRouteJump'))return {default:p=>React.createElement('a',{className:'wfw-btn wfw-dir',href:'#event-route'},p.children)};
  return new Proxy({...stubs,default:leaf},{get:(o,k)=>k in o?o[k]:leaf});
 };
 vm.runInNewContext(code,{exports,require,React,console,URL,Date,Number,String,JSON},{filename:file});
 modules.set(file,exports.default);
 return exports.default;
}
const live=page('app/events/[city]/[slug]/page.js');
const local=page('app/florida-events/[slug]/page.js');
const longReason='A specific reason to go that deliberately wraps across several lines on a narrow phone: arrive early for the opening set, expect a lively crowd, and leave enough time to find the entrance with your group.';
const longVerdict='Worth traveling for if you like being scared, can handle the crowd, and want a full evening plan whose recommendation wraps without colliding with Save or Share.';
const fixture={id:'fixture',name:'A deliberately long real fixture concert title for narrow phones',date:'2026-09-18',time:'19:00',venue:'Fixture Hall With A Long Formal Venue Name',city:'Sarasota',lat:27.3,lng:-82.5,image:'/fixture-photo.jpg',url:'https://www.ticketmaster.com/fixture',price:'$45–$70',ticketed:true,source:'Fixture provider'};
function assertShellOrder(html,label){
 const facts=html.indexOf('class="wf-event-summary"');
 const reason=html.indexOf('class="wf-event-reason"');
 const actions=html.indexOf('class="wf-event-actions"');
 const media=html.indexOf('class="wf-event-media"');
 const where=html.indexOf('class="wfw"');
 assert.ok(facts>=0 && reason>facts && media>=0 && facts>media && actions>reason && where>actions,`${label}: media -> facts -> reason -> actions -> EventWhere DOM order`);
 assert.match(html.slice(facts,reason),/<dt>When<\/dt>/,`${label}: date is present in the facts block before the reason and actions`);
 assert.doesNotMatch(html,/margin:-\d+px/,`${label}: no negative inline margin can pull actions into the answer`);
 assert.doesNotMatch(html,/What it looks like/,`${label}: no duplicate photo heading`);
 checks+=4;
}
function photoCount(html){return (html.match(/class="wf-event-photo(?: [^"]+)?"/g)||[]).length;}
let checks=0;
// EventWhere's admission and displayed-score order are real, not a null leaf.
// The provider/map leaves record the ONE array sent to both card and pin views.
const where=page('app/components/EventWhere.js');
const nearbyFixture=[
 {id:'lower',name:'Lower score',href:'/p/lower',lat:27.31,lng:-82.51,distMi:1,wfScore:80},
 {id:'invalid',name:'No exact point',href:'/p/invalid',lat:null,lng:-82.51,distMi:1,wfScore:100},
 {id:'higher',name:'Higher score',href:'/p/higher',lat:27.32,lng:-82.52,distMi:2,wfScore:98},
 {id:'no-route',name:'No detail route',lat:27.33,lng:-82.53,distMi:1,wfScore:99},
];
const whereProps={venue:'Fixture Hall',address:'123 Test St',lat:27.3,lng:-82.5,picks:nearbyFixture};
renderToStaticMarkup(React.createElement(where,whereProps));
assert.deepEqual(mapPicks.map(p=>p.id),['higher','lower'],'EventWhere admits valid rows in displayed-score order');
assert.equal(nearbyPicks,mapPicks,'map pins and nearby cards receive the same ordered array');
assert.deepEqual(nearbyFixture.map(p=>p.id),['lower','invalid','higher','no-route'],'recommendation rendering does not mutate provider selection');
mapPicks=nearbyPicks=undefined;
const noPoint=renderToStaticMarkup(React.createElement(where,{...whereProps,lat:null}));
assert.equal(mapPicks,undefined,'missing venue coordinates cannot claim map pins');
assert.equal(nearbyPicks,undefined,'missing venue coordinates cannot claim nearby cards');
assert.doesNotMatch(noPoint,/id="event-nearby"|aria-label="Map key"/,'unlocated venue has no map or nearby shell');
checks+=6;
for(const cancelled of [false,true])for(const hasPhoto of [false,true]){
 event={...fixture,status:cancelled?'cancelled':'scheduled',image:hasPhoto?fixture.image:null};
 const html=renderToStaticMarkup(await live({params:{city:'sarasota',slug:'fixture'}}));
 assert.match(html,/class="wf-event-experience"/);assert.match(html,/class="wf-event-booking"/);
 assert.match(html,/deliberately long real fixture/);assert.match(html,/\$45/);assert.match(html,/123 Test St/);
 assert.equal(html.includes('data-ticket="ticketmaster"'),!cancelled);
 assert.equal(html.includes('src="/fixture-photo.jpg"'),hasPhoto);
 assert.equal(photoCount(html),1);assert.equal(/class="wf-event-photo wf-event-photo-fallback"/.test(html),!hasPhoto);
 assert.match(html,/♡ Save event/);assert.match(html,/Share this event/);assert.match(html,/A specific reason to go/);
 assert.ok(!html.includes('$59'));checks+=8;
 checks+=5;assertShellOrder(html,`live ${cancelled?'cancelled':'scheduled'} ${hasPhoto?'photo':'fallback'}`);
}
for(const free of [false,true])for(const hasPhoto of [false,true]){
 curated={event_id:'fixture',event_name:'Fixture local event with a deliberately long title',year:2026,city:'Sarasota',state:'FL',venue:'Fixture Hall',is_free:free,price_band:'$25',visit_restrictions:['Timed entry required'],lat:27.3,lng:-82.5,card_hook:longReason,why_go:longReason,wayfind_verdict:longVerdict,hero_image:hasPhoto?'/row-photo.jpg':null,image_alt:'Venue exterior'};
 photographs=hasPhoto?{hero:{src:'/owned-photo.jpg',alt:'Owned event photo',w:1200,h:630},photos:[{src:'/owned-photo.jpg',alt:'Duplicate hero',w:1200,h:630},{src:'/portrait-one.jpg',alt:'Portrait one',w:853,h:1280},{src:'/portrait-two.jpg',alt:'Portrait two',w:853,h:1280}],credit:'Fixture photographer'}:null;
 const html=renderToStaticMarkup(await local({params:{slug:'fixture'}}));
 assert.match(html,/class="wf-event-booking"/);assert.match(html,/Fixture local event/);assert.match(html,/123 Test St/);
 assert.equal(html.includes('/api/commerce/go?offer=test'),!free);
 assert.equal(html.includes('src="/owned-photo.jpg"'),hasPhoto);
 assert.equal((html.match(/src="\/owned-photo.jpg"/g)||[]).length,hasPhoto?1:0);
 assert.equal(photoCount(html),hasPhoto?3:1);
 assert.equal(html.includes('/row-photo.jpg'),false);
 assert.ok(!html.includes('$59'));checks+=6;
 assert.match(html,/Worth traveling for/);assert.match(html,/A specific reason to go/);
 assert.match(html,/>Save</);assert.match(html,/>Share</);
 assert.match(html,/Timed entry required/,'the real visit-facts helper preserves the provider entry restriction');
 checks+=8;assertShellOrder(html,`curated ${free?'free':'paid'} ${hasPhoto?'owned':'fallback'}`);
 if(reviewDir && !free && hasPhoto){
  fs.mkdirSync(reviewDir,{recursive:true});
  const document='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Event layout fixture</title></head><body style="margin:0;background:#080b10">'+html.replaceAll('/owned-photo.jpg','/brand/orlando-roller-coaster-portrait.jpg').replaceAll(/src="\/api\/photo[^"]*"/g,'src="/fixture-intentionally-missing.jpg"')+'</body></html>';
  fs.writeFileSync(path.join(reviewDir,'event-fixture.html'),document);
  fs.writeFileSync(path.join(reviewDir,'event-mobile-review.html'),'<!doctype html><html><head><title>Mobile layout review</title></head><body style="margin:0;background:#1b2330;color:white;font-family:Arial"><p>Layout verification fixture. Fictional event; map and booking integrations are stubbed.</p>'+[320,390,430].map(w=>'<iframe title="'+w+'px mobile layout" src="event-fixture.html" style="display:inline-block;vertical-align:top;width:'+w+'px;height:860px;border:1px solid #536070;margin:5px"></iframe>').join('')+'</body></html>');
 }
}

// The row-photo rung and the no-photo rung are distinct from the owned-photo cases above.
curated={...curated,is_free:true,hero_image:'/row-only.jpg',image_alt:'A venue-only row photograph'};photographs=null;
let html=renderToStaticMarkup(await local({params:{slug:'fixture'}}));
assert.equal(photoCount(html),1);assert.match(html,/src="\/row-only.jpg"/);assert.doesNotMatch(html,/class="wf-event-photo wf-event-photo-fallback"/);checks+=3;
curated={...curated,hero_image:null};
html=renderToStaticMarkup(await local({params:{slug:'fixture'}}));
assert.equal(photoCount(html),1);assert.match(html,/class="wf-event-photo wf-event-photo-fallback"/);assert.match(html,/role="img"/);checks+=3;

// THE VENUE-PHOTO RUNG (owner, 2026-10-01, Ananda Farm): the Fall rail card
// showed the venue's own photo (/api/photo?place=<its place_id>) and the page
// it opened showed initials. A row with no hero_image but an exact place_id
// must render the card's exact URL, not the monogram.
const ANANDA='ChIJScJ5bQAZw4gRjNIj9iS5bus';
const cardUrl='/api/photo?place='+ANANDA+'&g=2&w=640';
curated={...curated,event_id:'ananda-farm-fall-festival-2026',place_id:ANANDA,hero_image:null};
html=renderToStaticMarkup(await local({params:{slug:'fixture'}}));
assert.ok(html.includes('src="'+cardUrl.replaceAll('&','&amp;')+'"'),'venue-photo rung: page renders the same /api/photo?place= URL the rail card shows');
assert.doesNotMatch(html,/class="wf-event-photo wf-event-photo-fallback"/,'venue-photo rung: no initials panel when the venue has an exact place_id');
assert.equal(photoCount(html),1);checks+=3;
// The registry rung: a database row lagging its place_id still gets the
// registry's identity, exactly like the rail (mergeFallDiscoveryRows).
const reg=FALL_DISCOVERIES_2026.find(r=>r.place_id&&!r.hero_image&&!FALL_EVENT_IMAGE_HOLDS.has(r.event_id));
assert.ok(reg,'registry fixture: at least one place_id-only discovery row exists (positive control)');
curated={...curated,event_id:reg.event_id,place_id:null,hero_image:null};
html=renderToStaticMarkup(await local({params:{slug:'fixture'}}));
assert.ok(html.includes('/api/photo?place='+encodeURIComponent(reg.place_id)),'registry rung: '+reg.event_id+' renders its registry venue photo');checks+=2;
// Holds stay held: an image hold must not leak back in through this rung.
const held=[...FALL_EVENT_IMAGE_HOLDS][0];
curated={...curated,event_id:held,place_id:ANANDA,hero_image:null};
html=renderToStaticMarkup(await local({params:{slug:'fixture'}}));
assert.match(html,/class="wf-event-photo wf-event-photo-fallback"/,'image hold '+held+' still renders the initials panel');
assert.doesNotMatch(html,/\/api\/photo\?place=/,'image hold '+held+' never wears a venue photo');checks+=2;
// A stored hero still wins over the venue photo (no regression to the row rung).
curated={...curated,event_id:'ananda-farm-fall-festival-2026',place_id:ANANDA,hero_image:'/row-only.jpg'};
html=renderToStaticMarkup(await local({params:{slug:'fixture'}}));
assert.match(html,/src="\/row-only.jpg"/);assert.doesNotMatch(html,/\/api\/photo\?place=/);checks+=2;
curated={...curated,event_id:'fixture',place_id:null,hero_image:null};
console.log(`test-event-experience: OK — ${checks} assertions across 14 real page renders; live/cancelled, paid/free, owned/row/venue/held/missing photos. Provider/map internals remain covered separately.`);

// Render the real event/facade chain: the cover must already be visible before
// any image load event (including a cached image that precedes hydration).
social=[{platform:'instagram',creator:'fixturecreator',url:'https://www.instagram.com/reel/fixture/'}];
curated={...curated,is_free:false,hero_image:'/venue-cover.jpg'};
for(const owned of [true,false]) {
 photographs=owned?{hero:{src:'/event-cover.jpg',alt:'Event cover',w:1200,h:630},photos:[]}:null;
 const html=renderToStaticMarkup(await local({params:{slug:'fixture'}}));
 assert.match(html,/THE @fixturecreator EDIT/);
 assert.match(html,/Swipe to see every creator post/);
 assert.match(html,/aria-label="Previous creator posts about Fixture local event/);
 assert.match(html,/role="region" aria-label="creator posts about Fixture local event/);
 assert.doesNotMatch(html,/THE CINDY SELECTS EDIT|Cindy Selects · Video guide/);
 assert.match(html,/font-family:Georgia,serif/);
 assert.match(html,/aspect-ratio:3 \/ 4/);
 assert.match(html,/Event cover shown/);
 assert.match(html,owned?/src="\/event-cover.jpg"/:/src="\/venue-cover.jpg"/);
 assert.doesNotMatch(html,/opacity:0/);
 assert.doesNotMatch(html,/<iframe/);
 assert.match(html,/0 0 22px rgba\(249,115,22,.30\)/);
}
console.log('event creator style: 24 assertions across owned and venue header covers; shared Cindy rail, visible poster before hydration, real creator credit, click-to-load, glow');
