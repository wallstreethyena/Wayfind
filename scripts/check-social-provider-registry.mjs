import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reserveFreeProviderCall } from "../lib/providerMeter.js";

const migration=readFileSync(new URL("../supabase/migrations/20260906063000_social_provider_registry.sql",import.meta.url),"utf8");
for(const table of ["wf_source_registry","wf_provider_usage_daily","wf_provider_call_budget_daily"]){
  assert.match(migration,new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(migration,new RegExp(`revoke all on public\\.${table} from anon, authenticated`));
}
assert.match(migration,/cost_after_free_micros <> 0/);
assert.match(migration,/daily_ceiling_reached/);
assert.match(migration,/wf_provider_call_budget_daily\.calls \+ excluded\.calls <= source_row\.hard_call_ceiling_daily/);
assert.match(migration,/commercial_api_allowed[^\n]*default false/);
let args=null;
const db={rpc:async(name,input)=>{args={name,input};return{data:[{allowed:true,reason:"reserved",calls:3,free_units:3}],error:null};}};
const yes=await reserveFreeProviderCall(db,"hashtag_search",{now:Date.parse("2026-09-06T12:00:00Z")});
assert.equal(yes.allowed,true); assert.equal(yes.calls,3);
assert.equal(args.name,"wf_reserve_free_provider_call");
assert.equal(args.input.p_usage_date,"2026-09-06");
await reserveFreeProviderCall(db,"hashtag_search",{now:Date.parse("2026-09-07T01:00:00Z")});
assert.equal(args.input.p_usage_date,"2026-09-06","daily provider budget must remain on the Florida calendar day after UTC midnight");
assert.equal((await reserveFreeProviderCall({rpc:async()=>({data:null,error:new Error("down")})},"x",{now:Date.now()})).allowed,false);
assert.equal((await reserveFreeProviderCall(db,"x",{})).allowed,false);
console.log("check-social-provider-registry: OK — rights, zero-cost gate, atomic ceiling and client fail-closed controls passed");
