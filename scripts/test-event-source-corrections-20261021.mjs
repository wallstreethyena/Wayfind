#!/usr/bin/env node
// Official pages checked 2026-10-21; frozen input reproduces provider drift.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { applyStoredStartCorrection, applyStoredStartCorrections, applyFreshTicketmasterStarts } from '../lib/eventStartRefresh.js';
import { FALL_LIVE_AREA_2026_10_19 } from '../lib/fallLiveArea20261019.js';
import { mergeFallDiscoveryRows } from '../lib/fallEventImage.js';
import { curatedFeedEventsWithFall } from '../lib/curatedFallFeed.js';

const cases = [
  ['tm_Z7r9jZ1A709qK', '2026-10-22', '19:00:00', '18:30:00'],
  ['tm_vvG1VZ_1mYOzEm', '2026-10-22', '19:00:00', '18:30:00'],
  ['tm_vvG1VZ_2VThmB4', '2026-10-23', '17:30:00', '18:30:00'],
];
for (const [id, date, time, expected] of cases) {
  const input = { id, date, time, name: 'Original title', venue: 'Original venue', rank: 123, image: 'own-photo', lat: 27.95, lng: -82.46 };
  const geo = date === '2026-10-22' ? { lat: 27.967441, lng: -82.803655 } : {};
  const corrected = applyStoredStartCorrection(input);
  assert.deepEqual(corrected, { ...input, time: expected, ...geo });
  assert.equal(applyStoredStartCorrection(corrected), corrected, 'idempotent');
  const otherDay = { ...input, date: '2026-11-23' };
  assert.equal(applyStoredStartCorrection(otherDay), otherDay, 'date scoped');
  const otherId = { ...input, id: 'tm_unrelated' };
  assert.equal(applyStoredStartCorrection(otherId), otherId, 'ID scoped');
  const refreshed = applyStoredStartCorrections(applyFreshTicketmasterStarts([corrected], [input], new Date(date + 'T12:00:00Z')));
  assert.equal(refreshed[0].time, expected, 'fresh provider cannot restore wrong start');
}
const cake = { id: 'tm_Z7r9jZ1A7xoQ8', date: '2026-10-23', name: 'Cake', time: '20:30:00', venue: 'Ruth Eckerd Hall', lat: 27.981199, lng: -82.715599, image: 'artist-photo', rank: 71 };
assert.deepEqual(applyStoredStartCorrection(cake), { ...cake, venue: 'The BayCare Sound', lat: 27.967441, lng: -82.803655 });

// Execute the route's actual Ticketmaster adapter, proving the corrected venue
// reaches validation/dedup/geo before the final cache-serving correction.
const route = readFileSync(new URL('../app/api/events/route.js', import.meta.url), 'utf8');
const seasonalRoute = readFileSync(new URL('../app/api/events/fall/route.js', import.meta.url), 'utf8');
assert.match(seasonalRoute, /fall-intents:v40:/, 'seasonal snapshot retires the old paddle sessions');
const start = route.indexOf('async function fromTicketmaster(');
const end = route.indexOf('\nfunction seatgeekSegment(', start);
assert(start > 0 && end > start);
const raw = [cake, ...cases.map(([id,date,time]) => ({id,date,time,name:id,venue:'The BayCare Sound',lat:27.967441,lng:-82.803655}))].map(e => ({
  id: e.id.slice(3), name: e.name, dates: {start: {localDate:e.date,localTime:e.time}},
  _embedded: {venues:[{name:e.venue,location:{latitude:e.lat,longitude:e.lng}}]},
}));
const context = vm.createContext({ process:{env:{TICKETMASTER_API_KEY:'fixture'}}, Date, URLSearchParams,
  _tmMem:new Map(), TM_SEGMENTS:[], TM_TTL:1000, isoNowZ:()=> '2026-10-21T12:00:00Z',
  eventProviderCap:()=>1, eventProviderSpendAllow:async()=>true, applyStoredStartCorrection,
  fetch:async()=>({ok:true,json:async()=>({_embedded:{events:raw}})}),
});
vm.runInContext(route.slice(start,end), context);
const adapted = await context.fromTicketmaster(27.95,-82.46,60,null);
assert.equal(adapted.events.length,4);
assert.equal(adapted.events[0].venue,'The BayCare Sound');
assert.equal(adapted.events[0].lng,-82.803655);
for (const row of adapted.events.slice(1)) assert.equal(row.time,'18:30:00');

const paddleIds = ['ami-mangrove-murders-paddle-2026','ami-mangrove-murders-paddle-adults-2026'];
const sessions = FALL_LIVE_AREA_2026_10_19.filter(e=>paddleIds.includes(e.event_id));
assert.equal(sessions.length,2);
assert.equal(sessions[1].minimum_age,18);
assert.deepEqual(sessions.map(e=>[e.start_time,e.end_time]),[['18:00:00','19:30:00'],['20:30:00','22:00:00']]);
assert.deepEqual(sessions.map(e=>e.audience),[['families','kids'],['adults']]);
assert.notEqual(sessions[0].event_series_id,sessions[1].event_series_id,'distinct sessions survive series dedup');
assert.match(sessions[0].schedule_note,/5:40 PM/);
assert.match(sessions[1].schedule_note,/8:10 PM/);
const stale = sessions.map(e=>({...e,start_time:'17:30:00',hero_image:'/verified-event-photo.webp'}));
const merged = mergeFallDiscoveryRows(stale,sessions);
assert.equal(merged.length,2,'no static/DB twins');
assert.deepEqual(merged.map(e=>e.start_time),['18:00:00','20:30:00']);
assert(merged.every(e=>e.hero_image==='/verified-event-photo.webp'),'DB event photos retained');
const feed = curatedFeedEventsWithFall(stale,{today:'2026-10-21'}).filter(e=>paddleIds.includes(e.id.replace(/^wfc:/,'')));
assert.equal(feed.length,2);
assert.deepEqual(feed.map(e=>e.time),['18:00:00','20:30:00']);
const theatre = FALL_LIVE_AREA_2026_10_19.find(e=>e.event_id==='tampa-theatre-nightmare-on-franklin-2026');
assert.doesNotMatch(theatre.schedule_note+' '+theatre.verify_note,/Burnt Offerings/);
assert.match(theatre.schedule_note,/Rocky Horror Picture Show at 7:00 PM and 11:00 PM/);
console.log('test-event-source-corrections-20261021: PASS (4 provider variants, exact-scope controls, live adapter, 2 sessions, stale DB/photo merge)');
