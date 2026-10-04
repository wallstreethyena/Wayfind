#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadComponent } from './lib/jsxLoad.mjs';
import { eventImageIsVenue } from '../lib/fallEventImage.js';
import { withVerifiedFallVisitFacts } from '../lib/fallVisitFacts2026.js';
import { fallEventLive, fallScheduleChip } from '../lib/fallPool.js';
const ROOT = process.cwd();
let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks++; };
const mutation = process.argv.includes('--mutation-child');
let source = readFileSync('lib/eventVisitFacts.js', 'utf8').replace('from "./nowContext.js"', `from "${new URL('../lib/nowContext.js', import.meta.url).href}"`);
if (mutation) {
  const needle = 'export function eventVisitStatus(event, now = new Date(), todayOverride = null) {';
  assert.ok(source.includes(needle), 'Mutation must reach the real status function');
  source = source.replace(needle, needle + '\n return { label: "Open now", tone: "now" };');
}
const facts = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const { eventVisitStatus: status, eventCostSummary: cost, eventRestrictions, eventLocalClock, eventClockMinutes, eventScheduleLabel } = facts;
// Independent reproduction of the organizer's published Wed–Fri and weekend
// hours. Sunday 18:00 ET is the exact production defect, not an arbitrary case.
const parlour = { event_id: 'fat-beet-pumpkin-parlour-2026', start_date: '2026-09-27', end_date: null, schedule_note: 'Closing date has not been published.', visit_schedule: { timezone: 'America/New_York', label: 'Wed–Sun · hours vary', weekday_hours: { 0: [['09:00','16:00']], 1: [], 2: [], 3: [['10:00','17:00']], 4: [['10:00','17:00']], 5: [['10:00','17:00']], 6: [['09:00','16:00']] } } };
ok(status(parlour, new Date('2026-10-04T22:00:00Z')).label === 'Closed now', 'Pumpkin Parlour is closed Sunday 18:00 Florida time');
ok(status(parlour, new Date('2026-10-04T19:59:00Z')).label === 'Open now', 'positive control: Sunday 15:59 is open');
ok(status(parlour, new Date('2026-10-04T20:00:00Z')).label === 'Closed now', 'close boundary is exclusive');
ok(status(parlour, new Date('2026-10-04T12:59:00Z')).label === 'Opens today', 'one minute before opening');
ok(status(parlour, new Date('2026-10-04T13:00:00Z')).label === 'Open now', 'opening boundary is inclusive');
ok(status(parlour, new Date('2026-10-05T17:00:00Z')).nextDate === '2026-10-07', 'Monday closure points to the verified Wednesday session');
ok(status(parlour, new Date('2026-10-05T01:00:00Z')).nextDate === '2026-10-07', 'UTC rollover preserves Sunday night Florida day');
ok(status(parlour, new Date('2026-11-01T13:30:00Z')).label === 'Opens today', 'DST fall-back uses EST, not a fixed UTC offset');
ok(status(parlour, new Date('2026-11-01T14:00:00Z')).label === 'Open now', 'DST positive control at 09:00 EST');
ok(eventLocalClock({ timezone: 'America/Chicago' }, new Date('2026-10-05T04:30:00Z')).day === '2026-10-04', 'Florida Panhandle timezone is honored');
ok(status({ ...parlour, visit_schedule: { timezone: 'Invalid/Zone' } }, new Date()).label === 'Check hours', 'invalid timezone never claims open');
ok(eventClockMinutes('12:99') === null && eventClockMinutes('24:00') === null, 'invalid clock inputs cannot create sessions');
const overnight = { start_date: '2026-10-02', end_date: '2026-10-04', visit_schedule: { weekday_hours: { 0: [['19:00','01:00']], 5: [['19:00','01:00']], 6: [['19:00','01:00']] } } };
ok(status(overnight, new Date('2026-10-04T04:30:00Z')).label === 'Open now', 'Saturday session remains open at Sunday 00:30');
ok(status(overnight, new Date('2026-10-04T05:00:00Z')).label === 'Opens today', 'overnight closes at 01:00; next opening is Sunday evening');
ok(status(overnight, new Date('2026-10-05T04:30:00Z')).label === 'Open now', 'final dated session remains open through verified overnight close');
ok(status(overnight, new Date('2026-10-05T05:00:00Z')).expired === true, 'season expires after the final session');
ok(fallEventLive({ start_date:'2026-10-01', end_date:'2026-10-04' }, '2026-10-05') === false, 'server date gate retires ended cards');
const oneDay = { start_date:'2026-10-17', end_date:null, start_time:'17:00:00', schedule_note:'Saturday, October 17, 5–7:45pm. Rain date October 24.' };
ok(status(oneDay,new Date('2026-10-18T14:00:00Z')).expired === true, 'one-day null-end card expires across midnight, matching server gate');
ok(status({...oneDay,verify_note:'No end date published'},new Date('2026-10-18T14:00:00Z')).expired !== true, 'open-run declaration in verify_note remains supported');
ok(status({...oneDay,schedule_note:'Until further notice'},new Date('2027-02-01T14:00:00Z')).expired === true, 'open-run card cannot outlive the existing 90-day cap');
const unknown = { start_date: '2026-09-01', end_date: '2026-11-01', select_nights: true, start_time:'10:00', end_time:'17:00' };
ok(status(unknown, new Date('2026-10-04T16:00:00Z')).label === 'Select dates', 'season + clock + select_nights without calendar never proves open');
ok(status({ ...unknown, select_nights: false }, new Date('2026-10-04T16:00:00Z')).label === 'In season', 'continuous season without daily evidence never proves open');
ok(eventScheduleLabel({ ...unknown, schedule_note:'Select nights; activities 10am–5pm.' }) !== 'Select nights', 'daytime clock overrides legacy night flag');
ok(eventScheduleLabel({ ...unknown, schedule_note:'Monday–Thursday 3–6pm; Friday–Sunday 10am–6pm.' }) !== 'Thu–Sun', 'overlapping prose ranges cannot fabricate Thu–Sun');
ok(fallScheduleChip({ ...parlour, start_time:'09:00', end_time:'16:00' }).label === 'Wed–Sun · hours vary', 'variable weekly hours cannot display one misleading all-week clock');
ok(status({ ...unknown, start_date:'2026-10-10' }, new Date('2026-10-04T16:00:00Z')).label === 'Opens Oct 10', 'future season start stays visible');
ok(!JSON.stringify(status(unknown, new Date('2026-10-04T16:00:00Z'))).includes('Nov 1'), 'card status does not need season-end clutter');
ok(eventScheduleLabel({ ...unknown, schedule_note:'Two weekends: October 16–18 and October 23–25. The organizer has not yet posted 2026 daily hours.' }) !== 'Daily', 'Cape Coral unpublished daily hours are not affirmative daily operation');
ok(eventScheduleLabel({...unknown,schedule_note:'Open daily, 10am–5pm.'}) === 'Daily', 'affirmative daily schedule positive control');
const exact = { ...unknown, occurrence_dates:['2026-10-10'], start_time:'10:00', end_time:'17:00' };
ok(status(exact, new Date('2026-10-04T16:00:00Z')).nextDate === '2026-10-10', 'exact calendar wins over season envelope');
ok(status(exact, new Date('2026-10-10T16:00:00Z')).label === 'Open now', 'exact date and clocks prove a session');
ok(cost({ is_free:true, visit_cost:{ currency:'USD', free:true, parking:10 } }) === 'Free entry · $10 parking', 'free entry cannot conceal mandatory parking');
ok(cost({ visit_cost:{ currency:'USD', entry:34.90, from:true, parking:19 } }) === 'From $34.90 · $19 parking', 'entry + mandatory online fee and parking preserve cents');
ok(cost({ visit_cost:{ currency:'CAD', entry:12.50 } }).includes('CA$12.50'), 'currency is explicit and not silently relabelled USD');
ok(cost({ visit_cost:{ currency:'BAD!', entry:15 } }) === 'Check admission', 'invalid currency does not make up a price');
ok(cost({}) === 'Check admission' && cost({ price_min:-5 }) === 'Check admission', 'unknown/negative price stays unknown');
ok(cost({ visit_cost:{ currency:'USD', entry:0, parking:0 } }) === '$0 · free parking', 'known numeric zero is not missing');
ok(eventRestrictions({}).length === 0, 'missing restrictions do not become a guessed minimum age');
ok(eventRestrictions({ visit_restrictions:['Not recommended under 13'] })[0] === 'Not recommended under 13', 'recommended age remains a recommendation');
ok(eventImageIsVenue({ hero_image:'/api/photo?w=640&ref=places/real/photos/owned' }), 'Google ref photo is venue context despite parameter order');
ok(eventImageIsVenue({ hero_image:'/api/photo?w=640&place=real' }), 'place photo parameter order cannot erase venue disclosure');
ok(!eventImageIsVenue({ hero_image:'/licensed/event-2026.webp' }), 'event-specific licensed image remains event photography');
const corrected = withVerifiedFallVisitFacts({ event_id: 'fat-beet-pumpkin-parlour-2026', start_date:'2026-09-27', schedule_note:'Closing date unpublished' });
ok(status(corrected, new Date('2026-10-04T22:00:00Z')).label === 'Closed now', 'published registry itself fixes the observed Parlour failure');
const { default: RailCard } = await loadComponent(path.join(ROOT,'app/components/RailCard.js'), ROOT);
const { default: VisitDetails } = await loadComponent(path.join(ROOT,'app/components/EventVisitDetails.js'), ROOT);
const fixture = { ...parlour, start_date:'2026-09-27', visit_cost:{ currency:'USD', free:true, parking:10 }, visit_restrictions:['Timed entry required'], visit_source_url:'https://example.com/official' };
const props = { title:'Verified Pumpkin Event', photo:'/event.webp', visitFacts:fixture, planningHref:'/florida-events/verified-pumpkin-event-2026', photoCaption:'Venue photo · event not pictured', photoAttr:'Photographer · CC BY 4.0', photoAttrHref:'https://example.com/license', facts:['Tampa','8.2 mi'], chips:[{key:'schedule',label:'Wed–Sun · hours vary'}], cta:{ label:'Official details ↗', href:'https://example.com/event', external:true } };
ok(renderToStaticMarkup(React.createElement(RailCard,{title:'No photo control'})).includes('wf-place-card-monogram'), 'unrelated no-photo place/event cards retain their safe monogram render');
const markup = renderToStaticMarkup(React.createElement(RailCard, props));
ok(markup.includes('Plan your visit') && markup.includes('href="/florida-events/verified-pumpkin-event-2026"'), 'real card renders exact internal planning link');
ok(markup.includes('Official details') && markup.includes('href="https://example.com/event"'), 'real card separately renders exact outside link');
ok(markup.includes('Free entry · $10 parking'), 'entry and parking are visible card text, not only title');
ok(markup.includes('Venue photo · event not pictured') && markup.includes('Photographer · CC BY 4.0'), 'real card displays provenance and author/license');
ok(markup.includes('wf-event-card-backdrop'), 'photo treatment uses the actual source image across shared card body');
ok(!renderToStaticMarkup(React.createElement(RailCard,{...props,planningHref:'https://wrong.example'})).includes('Plan your visit'), 'planning control cannot be repurposed to an external destination');
const dialog = renderToStaticMarkup(React.createElement(VisitDetails,{event:fixture,title:props.title,onClose:()=>{}}));
ok(dialog.includes('<dialog') && dialog.includes('Timed entry required') && dialog.includes('Close visit details'), 'touch/keyboard details contain full rules and a close control');
if (!mutation) {
  const child = spawnSync(process.execPath,[process.argv[1],'--mutation-child'],{cwd:ROOT,encoding:'utf8'});
  ok(child.status === 1 && (child.stderr + child.stdout).includes('Pumpkin Parlour is closed Sunday'), 'negative control: restoring always-open defect makes the real guard process fail');
}
if (process.argv.includes('--require-browser')) {
  const { chromium } = await import('@playwright/test');
  const { WF_PLACE_CARD_CSS } = await loadComponent(path.join(ROOT,'app/components/css.js'),ROOT);
  const browser = await chromium.launch({ executablePath:'/usr/bin/chromium', args:['--no-sandbox'] });
  const output = path.join(ROOT,'artifacts/fall-visit-cards'); mkdirSync(output,{recursive:true});
  try {
    for (const width of [320,395,768,1280]) {
      const page = await browser.newPage({viewport:{width,height:900}});
      const photoPath='/tmp/wayfind-fall-photo-evidence/sweetfields-current.jpg';
      const photo=existsSync(photoPath)?'data:image/jpeg;base64,'+readFileSync(photoPath).toString('base64'):'/event.webp';
      const html=renderToStaticMarkup(React.createElement(RailCard,{...props,title:'Sweetfields Farm Corn Maze & Pumpkin Patch',photo}));
      await page.setContent(`<html><head><style>body{margin:13px;background:#0d1117;font-family:Arial;color:white}${WF_PLACE_CARD_CSS}</style></head><body><div class="wf-rail wf-fall">${html}</div></body></html>`);
      const box=await page.locator('article').boundingBox();
      ok(box && Math.abs(box.height-268)<1 && box.width<=440 && box.width<=width-26, `${width}px actual card retains body/width contract`);
      const contained=await page.locator('article').evaluate((card)=>{ const b=card.getBoundingClientRect();return [...card.querySelectorAll('.wf-rail-card-links a,.wf-sheet-card-actions button,.wf-event-card-cost')].every(el=>{const r=el.getBoundingClientRect();return r.x>=b.x&&r.right<=b.right+1&&r.y>=b.y&&r.bottom<=b.bottom+1;}); });
      ok(contained,`${width}px actual costs, dual CTAs and all four actions are contained`);
      ok(await page.evaluate(()=>innerWidth)===width,`${width}px achieved viewport verified`);
      await page.screenshot({path:path.join(output,`card-${width}.png`)}); await page.close();
    }
  } finally { await browser.close(); }
  writeFileSync(path.join(output,'result.json'),JSON.stringify({checks,viewports:[320,395,768,1280],rendered:true},null,2));
}
console.log(`test-fall-visit-facts: OK — ${checks} assertions; real time/session, cost, image, link and render contracts; always-open mutation exits 1`);
