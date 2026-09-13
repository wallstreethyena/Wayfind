import assert from 'node:assert/strict';
import { fetchPlanningAlerts } from '../lib/beachAlerts.js';
import { forecastPeriods, planningSummary, localBeachSources, BEACH_PILOT } from '../lib/beachPlanning.js';
const clear = () => Response.json({ features: [] });
const run = async responses => {
  let calls = 0; const waits = [];
  const data = await fetchPlanningAlerts(27.4586, -82.6947, { fetchImpl: async url => {
    assert.equal(url, 'https://api.weather.gov/alerts/active?point=27.4586,-82.6947');
    const r = responses[calls++]; if (r instanceof Error) throw r; return r;
  }, wait: async ms => waits.push(ms) });
  return { data, calls, waits };
};
assert.deepEqual((await run([clear()])).data, []);
assert.equal((await run([new Error('network'), clear()])).calls, 2);
assert.equal((await run([new Response('', {status:503}), clear()])).calls, 2);
assert.deepEqual((await run([new Response('', {status:429,headers:{'Retry-After':'1'}}), clear()])).waits, [1000]);
for (const response of [new Response('', {status:403}), new Response('', {status:429,headers:{'Retry-After':'60'}}), Response.json({}), Response.json({features:[{}]}), Response.json({features:[],pagination:{next:'more'}})]) {
  let calls=0;
  await assert.rejects(fetchPlanningAlerts(27,-82,{fetchImpl:async()=>{calls++;return response;},wait:async()=>{}}));
  assert.equal(calls,1);
}
await assert.rejects(run([new Error('network'),new Error('network')]));
const now=Date.parse('2026-09-09T14:30:00Z');
const periods=forecastPeriods({properties:{updateTime:'2026-09-09T14:00:00Z',periods:[
  {startTime:'2026-09-09T14:00:00Z',endTime:'2026-09-09T15:00:00Z',shortForecast:'Thunderstorms',isDaytime:true,probabilityOfPrecipitation:{value:70}},
  {startTime:'2026-09-09T15:00:00Z',endTime:'2026-09-09T16:00:00Z',shortForecast:'Sunny',isDaytime:true,probabilityOfPrecipitation:{value:10}},
]}},now);
assert.equal(periods.length,2,'the current hour must not disappear halfway through a storm');
assert.equal(planningSummary({periods,alerts:[]}).better,null);
for(const beach of BEACH_PILOT) assert.ok(localBeachSources(beach).conditionsUrl.startsWith('https://'));
console.log('beach-alert-recovery: transient recovery, backoff, incomplete feeds, current-hour storm and local sources passed');
