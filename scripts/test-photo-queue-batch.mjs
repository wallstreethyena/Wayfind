import assert from 'node:assert/strict';
import { mergeQueueUpsert } from '../lib/photoCoverage.js';
import { upsertQueueRows } from './photo-monitor.mjs';
const merged = mergeQueueUpsert([{place_id:'retired',status:'retired',detections:2}], [
  {placeId:'retired',failureReason:'no-source'}, {placeId:'new',failureReason:'no-source'},
], '2026-09-09T00:00:00Z');
assert.equal(Object.hasOwn(merged[0],'status'),false);
assert.equal(merged[1].status,'open');
const previous=globalThis.fetch;
const writes=[];
try {
  globalThis.fetch=async(url,init={})=>{
    if(init.method!=='POST') return Response.json([{place_id:'existing',status:'retired',detections:3}]);
    const rows=JSON.parse(init.body); const keys=Object.keys(rows[0]).sort().join(',');
    if(rows.some(r=>Object.keys(r).sort().join(',')!==keys)) return Response.json({code:'PGRST102'},{status:400});
    writes.push(...rows);return new Response(null,{status:201});
  };
  assert.equal(await upsertQueueRows({url:'https://fixture.test',key:'fixture'},[
    {placeId:'existing',currentRef:null,failureReason:'no-source'},
    {placeId:'new',currentRef:null,failureReason:'no-source'},
  ]),2);
  assert.equal(writes.find(r=>r.place_id==='existing').detections,4);
  assert.equal(Object.hasOwn(writes.find(r=>r.place_id==='existing'),'status'),false,'retired status must not be reset');
  assert.equal(writes.find(r=>r.place_id==='new').status,'open');
} finally { globalThis.fetch=previous; }
console.log('photo-queue-batch: mixed new/existing rows accepted without resetting retired decisions');
