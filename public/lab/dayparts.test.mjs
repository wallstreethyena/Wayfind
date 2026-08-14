import { DAYPARTS, DAYPART_IDS, partForHour, orderFor, orderForHour, regionFor, metroFor, railHref, LEGACY_HERO_EVENT } from './dayparts.js';
let pass=0, fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL:',m));};
const eq=(a,b,m)=>ok(JSON.stringify(a)===JSON.stringify(b),`${m}\n    got ${JSON.stringify(a)}\n    want ${JSON.stringify(b)}`);

const ALL=['trending','best','eat','break','today','gems','locals','tonight','drive','events','beach','family','datenight','season','blog'];

// ── partForHour: every hour of the day, including the wrap
for(let h=0;h<24;h++){
  const p=partForHour(h);
  ok(DAYPART_IDS.includes(p),`hour ${h} -> valid band`);
}
eq(partForHour(5),'morning','05:00 is morning (boundary)');
eq(partForHour(10),'morning','10:59 band');
eq(partForHour(11),'lunch','11:00 flips to lunch');
eq(partForHour(13),'lunch','13:xx lunch');
eq(partForHour(14),'afternoon','14:00 flips to afternoon');
eq(partForHour(16),'afternoon','16:xx afternoon');
eq(partForHour(17),'night','17:00 flips to night');
eq(partForHour(23),'night','23:00 night');
eq(partForHour(0),'night','midnight is still night');
eq(partForHour(4),'night','04:59 still night');
eq(partForHour(4.9),'night','fractional hour floors');
eq(partForHour(-1),'night','negative wraps to 23');
eq(partForHour(25),'night','25 wraps to 01:00, which is night');
eq(partForHour(NaN),'afternoon','NaN falls back, never throws');
eq(partForHour(undefined),'afternoon','undefined falls back');

// ── orderFor: nothing is ever hidden
for(const p of DAYPART_IDS){
  const o=orderFor(p,ALL);
  eq(o.length,ALL.length,`${p}: every rail renders`);
  eq([...new Set(o)].length,o.length,`${p}: no duplicates`);
  eq([...o].sort(),[...ALL].sort(),`${p}: same set as input`);
  eq(o[0],'season',`${p}: Summer Picks leads`);
  ok(o.indexOf('trending')<3,`${p}: Trending in the top 3 (is #${o.indexOf('trending')+1})`);
}
// the specific calls Gabe made
eq(orderFor('morning',ALL).slice(0,5),['season','today','trending','eat','best'],'morning top 5');
eq(orderFor('lunch',ALL).slice(0,5),['season','eat','trending','break','best'],'lunch: Eat ahead of Break');
eq(orderFor('night',ALL).slice(0,5),['season','tonight','trending','eat','datenight'],'night: Eat ahead of Events');
ok(orderFor('night',ALL).indexOf('break')>10,'night: Break parked at the back');
ok(orderFor('morning',ALL).indexOf('events')>10,'morning: Events parked at the back');

// ── robustness
eq(orderFor('nonsense',ALL).length,ALL.length,'unknown band falls back, still complete');
eq(orderFor('morning',[]),[],'empty rail set -> empty');
eq(orderFor('morning',['eat','zzz']),['eat','zzz'],'unknown ids kept, known ones prioritised');
eq(orderFor('morning',['zzz']),['zzz'],'a rail not in any priority list still renders');
ok(!orderFor('morning',['eat']).includes('today'),'never invents a rail that does not exist');
eq(orderForHour(19,ALL)[1],'tonight','orderForHour composes');

// ── regionFor
eq(regionFor(28.5383,-81.3792),'orlando','downtown Orlando');
eq(regionFor(28.3852,-81.5639),'orlando','Walt Disney World');
eq(regionFor(28.20,-81.75),'orlando','SW corner inclusive');
eq(regionFor(28.85,-80.95),'orlando','NE corner inclusive');
eq(regionFor(27.3364,-82.5307),'fl','Sarasota');
eq(regionFor(27.4989,-82.5748),'fl','Bradenton');
eq(regionFor(25.7617,-80.1918),'fl','Miami');
eq(regionFor(30.3322,-81.6557),'fl','Jacksonville');
eq(regionFor(33.7490,-84.3880),'other','Atlanta');
eq(regionFor(40.7128,-74.0060),'other','New York');
eq(regionFor(null,null),'other','no coords -> other, never throws');
eq(regionFor('x','y'),'other','junk coords -> other');

// ── hrefs: the 404 that started this
eq(railHref({href:'/best-beaches'},'fl'),'/best-beaches/sarasota-bradenton','beach gets a metro (fl)');
eq(railHref({href:'/best-beaches'},'orlando'),'/best-beaches/orlando','beach gets a metro (orlando)');
eq(railHref({href:'/best-beaches'},'other'),'/best-beaches/sarasota-bradenton','beach falls back');
eq(railHref({href:'/family'},'fl'),'/family','plain routes pass through');
eq(railHref({},'fl'),null,'no href -> null');
eq(railHref(null,'fl'),null,'no rail -> null, never throws');
eq(metroFor('orlando'),'orlando','metroFor');
eq(metroFor('bogus'),'sarasota-bradenton','metroFor falls back');

// ── legacy events
eq(Object.keys(LEGACY_HERO_EVENT).length,8,'all 8 legacy hero events mapped');
ok(Object.values(LEGACY_HERO_EVENT).every(v=>/_hero_open$/.test(v)),'legacy names look right');
ok(Object.keys(LEGACY_HERO_EVENT).every(k=>ALL.includes(k)),'every legacy key is a real rail');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
