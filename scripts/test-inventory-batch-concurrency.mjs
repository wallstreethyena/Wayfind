import assert from "node:assert/strict";
import { primeConsolidatedInventoryReads } from "../lib/inventoryBoxBatch.js";

const cities = [{lat:27.34,lng:-82.55},{lat:27.45,lng:-82.48}];
const jobs = ["restaurants", "nightlife", "beaches", "things-to-do"].flatMap(catSlug => cities.map(city => ({catSlug,city})));
const stored = new Map(), starts = [], releases = [];
let active = 0, peak = 0;
const pending = primeConsolidatedInventoryReads(jobs, {get:(key,load)=>{const value=load();stored.set(key,value);return value;}}, {
  config: {url:"https://fixture.invalid",key:"fixture"},
  readUnion: async (_config, category, box, limit) => {
    starts.push({category,box,limit}); active++; peak=Math.max(peak,active);
    await new Promise(resolve => releases.push(resolve)); active--;
    return [{place_id:"ChIJFixture",name:"Fixture",lat:27.34,lng:-82.55,rating:4.8,user_ratings_total:100,category}];
  },
});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(starts.length,4,"all independent categories start before one is released (no serial waterfall)");
assert.equal(peak,4); assert.equal(stored.size,0);
for(const release of releases) release();
const completedEntries = await pending.then(() => stored.size);
assert.equal(completedEntries,16,"completion waits until every successful batch is primed");
assert.equal(stored.size,16,"same two radii × two cities × four categories are primed");
assert.ok(starts.every(x=>x.limit===2000));
assert.equal(active,0);

const second = new Map();
await primeConsolidatedInventoryReads(jobs,{get:(key,load)=>second.set(key,load())},{
 config:{url:"https://fixture.invalid",key:"fixture"},
 readUnion:async(_config,category)=>{if(category==="food")throw new Error("fixture outage");return [{place_id:"ChIJFixture",name:"Fixture",lat:27.34,lng:-82.55,rating:4.8,user_ratings_total:100,category}];},
});
assert.equal(second.size,12,"one category failure does not cancel siblings");
for(const [key,value] of second)assert.deepEqual(value,stored.get(key),"ranking and per-city result are unchanged");
console.log("test-inventory-batch-concurrency: OK — four concurrent categories, 16 unchanged cache entries, isolated failure and ranking equivalence");
