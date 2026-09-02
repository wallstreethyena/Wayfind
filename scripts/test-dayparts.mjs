import { DAYPARTS, DAYPART_IDS, BAND_TO_BUCKET, partForHour, orderFor, orderForHour, regionFor, metroFor, cityFor, railHref, LEGACY_HERO_EVENT } from '../lib/dayparts.js';
import { BEACH_METROS } from '../lib/beaches.js';
import { RAIL_IDS } from '../lib/rails.js';
import { bucketForHour, BUCKET_EDGES, siteHourFloat } from '../lib/nowContext.js';
let pass=0, fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL:',m));};
const eq=(a,b,m)=>ok(JSON.stringify(a)===JSON.stringify(b),`${m}\n    got ${JSON.stringify(a)}\n    want ${JSON.stringify(b)}`);

// v8.23.2 — 'breakfast' and 'birthday' JOINED THE RAILS IN v8.15 and were never
// added to this fixture, so every ordering assertion below spent four days
// running against a rail set two short of production. The five-item snapshots
// kept passing precisely BECAUSE the missing rails could not appear in them —
// the fixture hid the very change it should have caught. Derived from RAILS now,
// so a new rail can never again be silently excluded from its own test.
const ALL=RAIL_IDS.slice();

// ── partForHour: every hour of the day, including the wrap
for(let h=0;h<24;h++){
  const p=partForHour(h);
  ok(DAYPART_IDS.includes(p),`hour ${h} -> valid band`);
}
eq(partForHour(6),'morning','06:00 is morning (nowContext morningStart)');
eq(partForHour(10),'morning','10:59 band');
eq(partForHour(11.5),'lunch','11:30 flips to lunch (nowContext afternoonStart)');
eq(partForHour(12.9),'lunch','12:54 is still lunch');
eq(partForHour(13),'afternoon','13:00 flips to afternoon — tonight takes over at 1pm');
eq(partForHour(14),'afternoon','14:00 is afternoon');
eq(partForHour(16),'afternoon','16:xx afternoon');
eq(partForHour(17.5),'night','17:30 flips to night (nowContext nightStart)');
eq(partForHour(22),'night','22:00 is night');
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
  // v8.23.2 — WAS eq(o[0],'season'). Owner, 2026-08-19: "the placement of the
  // cards are not getting updated based on the time of day, can you check to see
  // if it is broken?" It was not broken; it was invisible. Season led all four
  // bands and a phone shows ~1.3 tiles, so the pinned leader WAS the rail as far
  // as a phone reader could tell. The band's own axis leads now.
  eq(o[0],DAYPARTS[p].order[0],`${p}: leads with its own axis, not one pinned card`);
  ok(o[0]!=='season',`${p}: Summer Picks must not lead — it eats the only tile a phone shows`);
  // v8.93 — the tonight-led bands now open tonight → datenight (owner,
  // 2026-08-30: "Date Night … to the right of Tonight's Move"), so seasonal
  // sits fourth there and third elsewhere. The rule this pinned is unchanged
  // and is what is asserted: seasonal is prominent and never adrift, and it is
  // in the same place in both bands a reader meets after 1pm.
  // test-seasonal-picks owns the cross-band agreement; this file owns the
  // per-band bound, because orderFor() is what it executes.
  ok(o.indexOf('season')>=1&&o.indexOf('season')<=4,`${p}: Summer Picks stays in the first five behind Fall (found ${o.indexOf('season')+1})`);
  ok(o.indexOf('trending')<4,`${p}: Trending stays in the first four behind Fall (is #${o.indexOf('trending')+1})`);
}
// the specific calls Gabe made
// The owner's standing calls, re-expressed as RELATIONS rather than as five-item
// snapshots. A positional snapshot is what let v8.15's two new rails slip past
// this file; a relation survives an insertion.
for (const band of DAYPART_IDS) eq(orderFor(band,ALL)[0],'augtober',`${band}: Fall in Florida leads throughout the season`);
ok(orderFor('lunch',ALL).indexOf('eat')<orderFor('lunch',ALL).indexOf('breakfast'),'lunch: Eat ahead of breakfast (morning is over)');
ok(orderFor('night',ALL).indexOf('events')<orderFor('night',ALL).indexOf('eat'),
   'night: Events ahead of Eat — a show still open beats a table');
ok(orderFor('morning',ALL)[1]==='breakfast' && orderFor('lunch',ALL)[1]==='break',
   'the daypart axis remains directly behind the seasonal Fall lead');
ok(orderFor('afternoon',ALL)[1]==='tonight' && orderFor('night',ALL)[1]==='tonight',
   'from 1pm Tonight remains directly behind the seasonal Fall lead');
ok(orderFor('night',ALL).indexOf('break')>10,'night: Break parked at the back');
ok(orderFor('morning',ALL).indexOf('events')>10,'morning: Events parked at the back');

// ── robustness
eq(orderFor('nonsense',ALL).length,ALL.length,'unknown band falls back, still complete');
eq(orderFor('morning',[]),[],'empty rail set -> empty');
eq(orderFor('morning',['eat','zzz']),['eat','zzz'],'unknown ids kept, known ones prioritised');
eq(orderFor('morning',['zzz']),['zzz'],'a rail not in any priority list still renders');
ok(!orderFor('morning',['eat']).includes('today'),'never invents a rail that does not exist');
eq(orderForHour(19,ALL)[0],'augtober','orderForHour keeps Fall first at 19:00');
// Owner-required first-poster clock (2026-08-29 12:25 ET). Hour in, first
// rail out — not a regex over the order arrays.
eq(orderForHour(8,ALL)[0],'augtober','hour 8: Fall first');
ok(orderForHour(11.6,ALL)[0]!=='breakfast','hour 11.6: not breakfast-first');
ok(orderForHour(11.6,ALL)[0]!=='tonight','hour 11.6: not tonight-first');
eq(orderForHour(13.1,ALL)[0],'augtober','hour 13.1: Fall first');
eq(orderForHour(15,ALL)[0],'augtober','hour 15: Fall first');
eq(orderForHour(22,ALL)[0],'augtober','hour 22: Fall first');
eq(orderForHour(23,ALL)[0],'augtober','hour 23: Fall first');

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
// /best-beaches has NO index route. The segment must be a real BEACH_METROS
// key or the page answers 200-indexable with the homepage's canonical.
eq(railHref({href:'/best-beaches'},'fl'),null,'beach without a city is not invented');
eq(railHref({href:'/best-beaches'},'orlando'),null,'region alone is not a beach metro');
eq(railHref({href:'/best-beaches'},'other'),null,'other + no city is not Sarasota');
eq(railHref({href:'/best-beaches'},'fl','sarasota'),'/best-beaches/manatee-sarasota','gulf city maps to manatee-sarasota');
eq(railHref({href:'/best-beaches'},'orlando','orlando'),'/best-beaches/orlando','orlando city maps to orlando metro');
eq(railHref({href:'/best-beaches'},'fl','tampa'),'/best-beaches/tampa','tampa city maps to tampa metro');
for (const r of ['orlando','fl','other','bogus']) {
  ok(Object.prototype.hasOwnProperty.call(BEACH_METROS, metroFor(r)), `metroFor(${r}) is a real BEACH_METROS key`);
}
// /things-to-do and /restaurants are [city]-only too. No city → no href.
eq(railHref({href:'/things-to-do'},'fl'),null,'things-to-do without a city is not invented');
eq(railHref({href:'/things-to-do'},'orlando'),null,'region alone is not a city');
eq(railHref({href:'/things-to-do'},'fl','parrish'),'/things-to-do/parrish','an explicit city wins');
eq(railHref({href:'/restaurants'},'fl','bradenton'),'/restaurants/bradenton','restaurants take the city');
eq(railHref({href:'/restaurants'},'other',null),null,'Boston/NY region must not emit /restaurants/sarasota');
eq(railHref({href:'/family'},'fl'),'/family','plain routes pass through');
eq(railHref({href:'/family'},'fl','parrish'),'/family','a city never leaks into a plain route');
eq(railHref({},'fl'),null,'no href -> null');
eq(railHref(null,'fl'),null,'no rail -> null, never throws');
eq(metroFor('orlando'),'orlando','metroFor');
eq(metroFor('bogus'),'manatee-sarasota','metroFor falls back');
eq(cityFor('bogus'),'sarasota','cityFor falls back');

// ── legacy events
eq(Object.keys(LEGACY_HERO_EVENT).length,7,'all active legacy hero events mapped');
ok(Object.values(LEGACY_HERO_EVENT).every(v=>/_hero_open$/.test(v)),'legacy names look right');
ok(Object.keys(LEGACY_HERO_EVENT).every(k=>ALL.includes(k)),'every legacy key is a real rail');
ok(!Object.prototype.hasOwnProperty.call(LEGACY_HERO_EVENT,'gems'),'the retired hidden-gems poster cannot emit a homepage-open event');

// ── THE REFINEMENT PROOF ────────────────────────────────────────────────────
// The four rail bands must never contradict the three canonical nowContext
// buckets. If they can, the rail says "morning" while the greeting, the meal
// window and the outdoor gate all say "afternoon" — which is precisely the
// 38-private-bucketings bug scripts/check-one-clock.mjs exists to prevent.
// Checked at every minute of the day, not at the edges someone remembered.
{
  let mismatches = 0, checked = 0;
  for (let m = 0; m < 1440; m++) {
    const h = m / 60;
    checked++;
    if (BAND_TO_BUCKET[partForHour(h)] !== bucketForHour(h)) {
      if (mismatches < 5) console.log('  FAIL: band/bucket disagree at hour', h.toFixed(3), partForHour(h), 'vs', bucketForHour(h));
      mismatches++;
    }
  }
  ok(mismatches === 0, `every band refines its nowContext bucket (${checked} minutes checked, ${mismatches} disagreements)`);
}
// The two shared edges are nowContext's, not a copy that can drift.
eq(DAYPARTS.morning.from, BUCKET_EDGES.morningStart, 'morning starts where nowContext says');
eq(DAYPARTS.lunch.from, BUCKET_EDGES.afternoonStart, 'lunch starts where nowContext ends morning');
eq(DAYPARTS.lunch.to, BUCKET_EDGES.lunchEnd, 'lunch ends at 13:00');
eq(BUCKET_EDGES.lunchEnd, BUCKET_EDGES.lateNightStart, 'lunchEnd and lateNightStart are the same 1pm edge');
eq(DAYPARTS.afternoon.from, BUCKET_EDGES.lateNightStart, 'afternoon (tonight-leads) starts at 1pm');
eq(DAYPARTS.afternoon.to, BUCKET_EDGES.nightStart, 'afternoon ends where nowContext starts night');
eq(DAYPARTS.night.from, BUCKET_EDGES.nightStart, 'night band starts where nowContext says night');
eq(DAYPARTS.night.to, BUCKET_EDGES.morningStart, 'night ends where nowContext starts morning');
eq(Object.keys(BAND_TO_BUCKET).sort().join(','), [...DAYPART_IDS].sort().join(','),
  'every band has a canonical-bucket mapping');
// Floats matter: 11:29 is still morning, 11:30 is lunch. An integer hour
// cannot express that, which is why partForHour takes siteHourFloat's output.
eq(partForHour(11 + 29/60), 'morning', '11:29 is morning');
eq(partForHour(11.5), 'lunch', '11:30 is lunch');
eq(partForHour(12 + 59/60), 'lunch', '12:59 is still lunch');
eq(partForHour(13), 'afternoon', '13:00 is afternoon — tonight first');
eq(partForHour(17 + 29/60), 'afternoon', '17:29 is afternoon');
eq(partForHour(17.5), 'night', '17:30 is night');
// siteHourFloat is the ONE clock; prove the band pipeline consumes it cleanly.
ok(typeof siteHourFloat() === 'number' && isFinite(siteHourFloat()), 'siteHourFloat returns a usable float hour');
ok(DAYPART_IDS.includes(partForHour(siteHourFloat())), 'the live hour resolves to a real band');


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
