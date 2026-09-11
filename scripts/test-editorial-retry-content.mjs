import assert from 'node:assert/strict';
import { persistEditorialRetry } from '../lib/editorialRetry.js';
const row = {place_id:'fixture',hook:'New researched description',why_here:'New sourced paragraphs',facts:[{claim:'A fact',source:'https://example.org'}],verified:true,issues:null};
const run=body=>persistEditorialRetry({endpoint:'https://example.org/rpc/wf_editorial_record_attempt_content',headers:{},row,fetchImpl:async(url,init)=>{
  assert.deepEqual(JSON.parse(init.body),{p_row:row},'the full researched content must reach the write');
  return Response.json(body);
}});
assert.deepEqual(await run({updated:1,published:1}),{ok:true,updated:1,published:1});
assert.deepEqual(await run({updated:0,published:0}),{ok:true,updated:0,published:0});
for(const body of [null,{}, {updated:0,published:1},{updated:1,published:2},{updated:'1',published:1}]) assert.equal((await run(body)).ok,false);
assert.equal((await persistEditorialRetry({endpoint:'x',headers:{},row,fetchImpl:async()=>new Response('',{status:500})})).published,0);
assert.equal((await persistEditorialRetry({endpoint:'x',headers:{},row,fetchImpl:async()=>{throw new Error('offline');}})).ok,false);
console.log('editorial-retry-content: full content payload, actual effects, invalid counters and write failures passed');
