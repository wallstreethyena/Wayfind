// Executes the real /p generateMetadata declaration with the actual read-only
// inventory adapter. Canonical/season dependencies are controlled separately;
// network, provider calls, real credentials and production writes are forbidden.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { register } from "node:module";
import { notFound } from "next/navigation.js";
import { isGooglePlaceId } from "../lib/placePhoto.js";
register("./lib/placeDataNodeHook.mjs", import.meta.url);
const { editorialSharePlaceName, trimDescriptionToLimit } = await import("../lib/placeData.js");
import { getInventoryIdentity } from "../lib/inventoryIdentity.js";

const MUTATION=process.argv.includes("--mutation-control-child");
const ROOT=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source=readFileSync(path.join(ROOT,"app/p/[id]/page.js"),"utf8");
const ast=ts.createSourceFile("place-share.js",source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS);
const declaration=(name)=>{const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(node,`real ${name} declaration must exist`);return node.getText(ast).replace(/^export(?:\s+default)?\s+/,"");};
let metadataSource=declaration("generateMetadata");
if(MUTATION){const recovery=/const identity = await getInventoryIdentity\(id, \{ freshOnly: true \}\);/;assert.ok(recovery.test(metadataSource),"mutation must find the real authoritative name lookup");metadataSource=metadataSource.replace(recovery,"const identity = null;");}
let durableUrl=null;const durableAsked=[];
const builders = Function("getInventoryIdentity", "SITE_URL", "placeCanonical", "fallCardClass", "siteTodayStr", "durablePlaceUrl",
  "notFound", "isGooglePlaceId", "editorialSharePlaceName", "trimDescriptionToLimit", "headers", "retiredLunchLaunchTarget",
  "homeShellData", "placeHeroPreloadSrc", "preload", "React", "Home",
  ts.transpileModule([declaration("s"), declaration("shareRouteId"), metadataSource, declaration("PlaceSharePage"),
    "return { metadata: generateMetadata, page: PlaceSharePage };"].join("\n"), {
    fileName: "share-page.tsx", compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, module: ts.ModuleKind.None },
  }).outputText
)(getInventoryIdentity, "https://www.gowayfind.com", () => null, () => "", () => "2026-10-04",
  async id => { durableAsked.push(id); return durableUrl; }, notFound, isGooglePlaceId, editorialSharePlaceName, trimDescriptionToLimit,
  async () => new Headers(), () => null, async () => ({ railMenu: [], localEditGuides: [] }), async () => null, () => {},
  { createElement: (_, props) => props }, "Home");
const metadata = builders.metadata;
const originalFetch=globalThis.fetch,originalNow=Date.now;
const keys=["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY"];
const now=Date.parse("2026-10-04T12:00:00Z"),DAY=86400000;
let row,mode="ok",calls=[];
let assertions=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);assertions++;};
const yes=(c,m)=>{assert.ok(c,m);assertions++;};
const build=(query={}, id="ChIJfixtureSharePlace0001")=>metadata({params:Promise.resolve({id}),searchParams:Promise.resolve(query)});
const page=id=>builders.page({params:Promise.resolve({id}),searchParams:Promise.resolve({})});
const fresh=()=>({place_id:"ChIJfixtureSharePlace0001",name:"Verified Place Name",lat:27.95,lng:-82.45,category:"Food",primary_type:"restaurant",google_types:["restaurant"],signals:{rating:4.7,reviews:210},status:"OPERATIONAL",refreshed_at:new Date(now-1000).toISOString(),excluded:false});
try{
 process.env.SUPABASE_URL="https://metadata-fixture.example";
 process.env.SUPABASE_SERVICE_ROLE_KEY="fixture-read-only-backend-key";
 delete process.env.NEXT_PUBLIC_SUPABASE_URL;delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 Date.now=()=>now;
 globalThis.fetch=async(url,init)=>{calls.push({url,init});if(!String(url).startsWith("https://metadata-fixture.example/rest/v1/wf_inventory?"))throw new Error("Forbidden provider or unexpected metadata request");if(mode==="throw")throw new Error("fixture timeout");if(mode==="denied")return Response.json({},{status:403});return Response.json(row?[row]:[]);};
 row=fresh();
 const bare=await build();eq(bare.title,"Verified Place Name · Wayfind","bare place links use fresh authoritative identity");
 const hero=new URL(bare.openGraph.images[0].url);eq(hero.pathname,"/api/og/hero");eq(hero.searchParams.get("kind"),"place");eq(hero.searchParams.get("id"),"ChIJfixtureSharePlace0001");eq(hero.searchParams.get("t"),"Verified Place Name");eq(hero.searchParams.has("src"),false);eq(hero.searchParams.has("sc"),false,"name recovery must not invent a Wayfind score");
 const supplied=await build({t:"Untrusted renamed venue",r:"4.8",rev:"300",loc:"Caller City"});eq(supplied.title,"Verified Place Name · Wayfind","fresh server identity outranks caller title");
 eq(new URL(supplied.openGraph.images[0].url).searchParams.get("r"),"4.8","legacy caller fact fields remain unchanged, with accuracy risk documented");
 yes(calls.every(c=>!c.init.method||c.init.method==="GET"),"lookup is read-only");yes(calls.every(c=>c.init.cache==="no-store"));yes(calls.every(c=>c.init.signal instanceof AbortSignal),"metadata lookup is bounded");yes(calls.every(c=>new URL(c.url).searchParams.get("select").includes("refreshed_at")),"the adapter actually requests its freshness evidence");
 for(const patch of [{refreshed_at:new Date(now-30*DAY).toISOString()},{refreshed_at:new Date(now-31*DAY).toISOString()},{refreshed_at:new Date(now+1).toISOString()},{refreshed_at:null},{place_id:"another-place"},{excluded:true},{name:" "}]){
  row={...fresh(),...patch};const stale=await build();eq(stale.title,"A spot worth your time · Wayfind","unverified identity must not enter a share card");yes(!stale.openGraph.images[0].url.includes("Verified%20Place%20Name"));
 }
 // Canonical (audit 2026-10-20): an indexable durable /places page takes the share link's canonical; otherwise /p keeps its own.
 eq(bare.alternates.canonical,"https://www.gowayfind.com/p/ChIJfixtureSharePlace0001","no durable page → /p keeps its own canonical");
 durableUrl="https://www.gowayfind.com/places/ChIJfixtureSharePlace0001";eq((await build()).alternates.canonical,"https://www.gowayfind.com/places/ChIJfixtureSharePlace0001","an indexable /places page receives the share link's canonical");durableUrl=null;
 yes(durableAsked.length>0&&durableAsked.every(id=>id==="ChIJfixtureSharePlace0001"),"the durable lookup is asked about this exact id");
 // A stale provider row cannot supply a name. Recover only a pinned guide
 // or published Atlas name, including the official place within a longer outing.
 row = null;
 for (const [id, name] of [
   ["ChIJYyfzl39Qw4gRRSr5_0Mz9qU", "Cracker Barrel"],
   ["ChIJu3hNU-N654gR0x0I9_3iNvc", "Lake Eola Park"],
   ["ChIJ6y2dx9g_w4gRWoZIRhLk-JI", "The Ringling"],
 ]) {
   const meta = await build({ t: "Wrong caller title" }, id);
   eq(meta.openGraph.title, name, "editorial source is tied to the requested ID");
   eq(meta.twitter.title, name);
   eq(new URL(meta.openGraph.images[0].url).searchParams.get("t"), name);
   eq(meta.openGraph.url, "https://www.gowayfind.com/p/" + id, "OG identifies the clean, shareable URL");
 }
 const longWord = "supercalifragilistic".repeat(8);
 const clipped = await build({ hk: "A short hook " + longWord });
 eq(new URL(clipped.openGraph.images[0].url).searchParams.get("hk"), "A short hook…");
 yes(clipped.description.startsWith("A short hook… · ") && !clipped.description.includes("supercali"), "metadata never splits a word");
 eq(new URL((await build({ hk: longWord })).openGraph.images[0].url).searchParams.has("hk"), false, "an oversized single token supplies no share hook");
 const full = await build({ hk: "The trusted venue has room for an early lunch.", cat: "outdoor dining ".repeat(20) });
 yes(full.description.length <= 155 && /(?:outdoor|dining)…$/.test(full.description), "the assembled description fits its budget at a complete word");
 const beforeInvalid = calls.length;
 for (const id of ["bogus123", "bad/id", "bad id", "wfadd_", ""]) {
   for (const operation of [() => build({ t: "Caller title" }, id), () => page(id)]) {
     await assert.rejects(operation, err => err.digest === "NEXT_HTTP_ERROR_FALLBACK;404");
     assertions++;
   }
 }
 eq(calls.length, beforeInvalid, "malformed routes return a framework 404 before lookup");
 for (const id of ["wfadd_spirit_christmas_clearwater", "GhIJ-validExternalPlace001", "ChIJfixtureSharePlace0001"]) {
   eq((await page(id)).initialPlaceId, id, "native and external place links still open the requested place");
 }
 row=null;eq((await build({t:"Existing caller title"})).title,"Existing caller title · Wayfind","unavailable authoritative identity preserves the legacy supplied title");
 mode="denied";eq((await build()).title,"A spot worth your time · Wayfind");mode="throw";eq((await build()).title,"A spot worth your time · Wayfind");mode="ok";
 const before=calls.length;eq(await getInventoryIdentity("bad/id",{freshOnly:true,now}),null);eq(calls.length,before,"invalid fresh identity IDs issue no request");
 row=fresh();delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;eq((await build()).title,"A spot worth your time · Wayfind");eq(calls.length,before,"unconfigured identity lookup makes no provider fallback request");
 process.env.SUPABASE_URL="https://metadata-fixture.example";process.env.SUPABASE_SERVICE_ROLE_KEY="fixture-read-only-backend-key";
 row={...fresh(),refreshed_at:new Date(now-31*DAY).toISOString()};eq((await getInventoryIdentity("ChIJfixtureSharePlace0001")).name,"Verified Place Name","opt-in freshness mode leaves older existing consumers unchanged");
 // Real negative control: prove a forged/mismatched fresh row is distinguishable
 // from a healthy row using the same exercised read adapter and metadata body.
 row=fresh();const positive=await build();row={...fresh(),place_id:"wrong-place"};const negative=await build();yes(positive.title!==negative.title);eq(negative.title,"A spot worth your time · Wayfind");
 if(!MUTATION){const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url),"--mutation-control-child"],{cwd:ROOT,encoding:"utf8"});eq(child.status,1,"removing name recovery must fail the real metadata control in a child process");yes(child.stderr.includes("bare place links use fresh authoritative identity"),"mutation must fail the intended invariant");}
 console.log(`place-share-metadata PASS: ${assertions} runtime assertions; authoritative bare-place name, promised route params, freshness/identity/expiry negatives, no paid calls, bounded read-only metadata lookup and existing caller compatibility; applied missing-identity mutation fails in its own process`);
}finally{globalThis.fetch=originalFetch;Date.now=originalNow;for(const key of keys)delete process.env[key];}
