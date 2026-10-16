import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import sharp from "sharp";
import { liveCreditFrom } from "../lib/placePhotoServe.js";
import { claimGooglePhotoStore, readStoredGooglePhoto, saveStoredGooglePhoto, failGooglePhotoStore, removeStoredGooglePhoto, readStoredGooglePhotoBytes, GOOGLE_PHOTO_STORE_MAX_BYTES } from "../lib/googlePhotoStore.js";

let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions++; };
const db = new PGlite();
// Actual PostgreSQL migration and RPCs execute locally, with fixture Supabase
// roles/auth/bucket catalog. No real credentials, Google, or remote database.
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema auth; create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role',true) $$;
create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
set request.jwt.claim.role='service_role';`);
await db.exec(readFileSync(new URL("../supabase/migrations/20261016010000_wf_google_photo_store.sql", import.meta.url), "utf8"));
const env = { SUPABASE_URL: "https://store-fixture.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture-not-a-real-key" };
const image = await sharp({ create: { width: 32, height: 24, channels: 3, background: "#f9a111" } }).jpeg().toBuffer();
const credit = liveCreditFrom({photos:[{googleMapsUri:"https://maps.google.com/place",authorAttributions:[{displayName:"Photographer",uri:"https://example.org/author",photoUri:"https://example.org/avatar"}]}]});
const objects = new Map(), calls = [];
let mode = "normal", removeAtComplete = false, dropCompleteResponse = false, failCleanup = false;
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const fetchImpl = async (url, options = {}) => {
  const u = new URL(url), method = options.method || "GET"; calls.push({ url: u, method });
  if (u.origin !== "https://store-fixture.supabase.co") {
    check(u.hostname === "lh3.googleusercontent.com" && options.redirect === "manual", "only validated Google image download, without auth headers");
    check(!options.headers, "service credentials never sent to source download");
    if (mode === "redirect-evil") return new Response(null, { status: 302, headers: { location: "https://127.0.0.1/private" } });
    if (mode === "redirect-google") { mode = "normal"; return new Response(null, { status: 302, headers: { location: "https://lh3.googleusercontent.com/next" } }); }
    if (mode === "oversize") return new Response("x", { headers: { "content-type": "image/jpeg", "content-length": String(GOOGLE_PHOTO_STORE_MAX_BYTES + 1) } });
    if (mode === "stream-oversize") return new Response(new Uint8Array(GOOGLE_PHOTO_STORE_MAX_BYTES + 1), { headers: { "content-type": "image/jpeg" } });
    if (mode === "html") return new Response("html", { headers: { "content-type": "text/html" } });
    if (mode === "corrupt") return new Response("not jpeg", { headers: { "content-type": "image/jpeg" } });
    return new Response(image, { headers: { "content-type": "image/jpeg" } });
  }
  check(options.cache === 'no-store', 'metadata, RPC and private byte requests never use cached tombstone state');
  if (u.pathname.startsWith("/rest/v1/rpc/")) {
    const fn = u.pathname.split("/").at(-1), b = JSON.parse(options.body), values = Object.values(b);
    if (fn.endsWith("complete") && removeAtComplete) { removeAtComplete = false; await db.query('select public.wf_google_photo_store_remove($1)', [b.p_place_id]); }
    const r = await db.query(`select public.${fn}(${values.map((_,i) => '$'+(i+1)).join(',')}) as value`, values.map(v => typeof v === 'object' ? JSON.stringify(v) : v));
    if(fn.endsWith('complete')&&dropCompleteResponse) { dropCompleteResponse=false; throw new Error('response lost after commit'); }
    return json(r.rows[0].value);
  }
  if (u.pathname === "/rest/v1/wf_google_photo_store") {
    const values = [], where = [];
    for (const [k, v] of u.searchParams) {
      if (k === "select") continue;
      assert.ok(["place_id", "state", "lease_token", "lease_until"].includes(k));
      const split = v.indexOf('.'); const op = v.slice(0,split), value=v.slice(split+1);
      values.push(value); where.push(`${k} ${op === 'gt' ? '>' : '='} $${values.length}`);
    }
    return json((await db.query(`select * from public.wf_google_photo_store where ${where.join(' and ')}`,values)).rows);
  }
  const base = "/storage/v1/object/google-place-photos";
  if (u.pathname.startsWith(base + "/") && method === "POST") { objects.set(u.pathname.slice(base.length+1), Buffer.from(options.body)); return json({}); }
  if (u.pathname === base && method === "DELETE") { if(failCleanup)return json({},503);for(const p of JSON.parse(options.body).prefixes) objects.delete(p); return json({}); }
  const privateBase = "/storage/v1/object/authenticated/google-place-photos/";
  if (u.pathname.startsWith(privateBase)) { const body = objects.get(u.pathname.slice(privateBase.length)); return body ? new Response(body) : json({},404); }
  throw new Error("unexpected fixture transport");
};
const deps = { env, fetchImpl };
const id = "ChIJstoredExactPlace123";
try {
  check((await claimGooglePhotoStore(id,{env:{},fetchImpl:()=>assert.fail("unconfigured must not fetch")})).state === "unavailable", "unconfigured storage cannot authorize a paid acquisition");
  const claims = await Promise.all(Array.from({length:20},()=>claimGooglePhotoStore(id,deps)));
  check(claims.filter(c=>c.state==='claimed').length===1 && claims.filter(c=>c.state==='pending').length===19, "actual SQL lease admits one buyer across 20 independent requests");
  const token = claims.find(c=>c.state==='claimed').token;
  mode = "redirect-google";
  const photo = await saveStoredGooglePhoto({placeId:id,token,uri:"https://lh3.googleusercontent.com/photo",credit},deps);
  check(photo?.source==='google' && photo.width===32 && photo.height===24 && photo.src.startsWith('/api/photo/stored/'), "decoded image is privately stored with honest Google source");
  assert.deepEqual(photo.credit,credit); assertions++;
  const downloads = calls.filter(c=>c.url.hostname==='lh3.googleusercontent.com').length;
  check((await claimGooglePhotoStore(id,deps)).state==='ready' && (await readStoredGooglePhoto(id,deps)).version===photo.version, "later request reuses same durable asset");
  await db.query("update public.wf_google_photo_store set updated_at='2000-01-01' where place_id=$1",[id]);
  check((await claimGooglePhotoStore(id,deps)).state==='ready',"stored ready photo does not expire on a daily or monthly timer");
  check(calls.filter(c=>c.url.hostname==='lh3.googleusercontent.com').length===downloads, "ready reuse makes no second Google download");
  const bytes = await readStoredGooglePhotoBytes({placeId:id,version:photo.version},deps);
  check(bytes?.body.equals(image) && bytes.photo.credit.name==='Photographer', "private proxy bytes and full credit refer to same stored photo");
  check(await readStoredGooglePhotoBytes({placeId:id,version:'0'.repeat(64)},deps)===null, "wrong version does not expose bytes");
  failCleanup=true;
  check(await removeStoredGooglePhoto(id,deps)===false && await readStoredGooglePhoto(id,deps)===null, "failed object cleanup still tombstones delivery first");
  failCleanup=false;
  check(await removeStoredGooglePhoto(id,deps), "owner removal retries retained private object cleanup");
  check((await claimGooglePhotoStore(id,deps)).state==='removed' && await readStoredGooglePhoto(id,deps)===null && objects.size===0, "removed asset cannot refill and original bytes deleted");
  check(await readStoredGooglePhotoBytes({placeId:id,version:photo.version},deps)===null, "old private URL is revoked after removal");

  const inflight = "ChIJinflightRemoved123"; const inflightClaim = await claimGooglePhotoStore(inflight,deps);
  removeAtComplete=true;
  check(await saveStoredGooglePhoto({placeId:inflight,token:inflightClaim.token,uri:"https://lh3.googleusercontent.com/photo",credit},deps)===null, "tombstone during download defeats SQL completion");
  check((await claimGooglePhotoStore(inflight,deps)).state==='removed' && objects.size===0, "inflight completion never resurrects removed photo and cleans orphan upload");
  const uncertainId='ChIJuncertainCompletion123';const uncertainClaim=await claimGooglePhotoStore(uncertainId,deps);
  dropCompleteResponse=true;
  const reconciled=await saveStoredGooglePhoto({placeId:uncertainId,token:uncertainClaim.token,uri:'https://lh3.googleusercontent.com/photo',credit},deps);
  check(!!reconciled && (await readStoredGooglePhotoBytes({placeId:uncertainId,version:reconciled.version},deps))?.body.equals(image),"committed completion with dropped response reconciles without deleting ready bytes");
  const noAuthorId='ChIJnoAuthorGoogle123';const noAuthorClaim=await claimGooglePhotoStore(noAuthorId,deps);
  const noAuthor=liveCreditFrom({photos:[{}]});
  const noAuthorPhoto=await saveStoredGooglePhoto({placeId:noAuthorId,token:noAuthorClaim.token,uri:'https://lh3.googleusercontent.com/photo',credit:noAuthor},deps);
  check(noAuthorPhoto?.credit.name===''&&noAuthorPhoto.credit.authors.length===0,"actual no-author Google credit persists truthfully without inventing author");
  check(noAuthorPhoto.credit.mapsUri.includes('query_place_id='+noAuthorId),"missing Google photo link uses this exact place's Maps link");

  for(const bad of ['https://lh3.googleusercontent.com./p','https://googleusercontent.com.evil.org/p','https://lh3.googleusercontent.com:444/p','https://user@lh3.googleusercontent.com/p','https://lh3.googleusercontent.com/p#fragment','http://lh3.googleusercontent.com/p']) {
    const pid='ChIJinvalidUrl'+assertions;const claim=await claimGooglePhotoStore(pid,deps);const before=calls.length;
    check(await saveStoredGooglePhoto({placeId:pid,token:claim.token,uri:bad,credit},deps)===null,"unsafe original URL refused");
    check(calls.slice(before).every(c=>c.url.origin==='https://store-fixture.supabase.co'),"unsafe URL causes no source request");
  }
  for(const failMode of ['redirect-evil','oversize','stream-oversize','html','corrupt']) {
    const pid='ChIJfailedStore'+assertions;const claim=await claimGooglePhotoStore(pid,deps);mode=failMode;
    check(await saveStoredGooglePhoto({placeId:pid,token:claim.token,uri:'https://lh3.googleusercontent.com/photo',credit},deps)===null,"invalid download rejected: "+failMode);
    check((await claimGooglePhotoStore(pid,deps)).state==='pending',"failed download backs off before another paid acquisition");
  }
  mode='normal';
  const expired='ChIJexpiredClaim123';const first=await claimGooglePhotoStore(expired,deps);
  await db.query("update public.wf_google_photo_store set lease_until=now()-interval '1 second' where place_id=$1",[expired]);
  const second=await claimGooglePhotoStore(expired,deps);
  check(second.state==='claimed'&&second.token!==first.token,"expired lease can be reclaimed with distinct token");
  check(await saveStoredGooglePhoto({placeId:expired,token:first.token,uri:'https://lh3.googleusercontent.com/photo',credit},deps)===null,"stale claim cannot download/save against newer lease");
  check(await failGooglePhotoStore({placeId:expired,token:first.token},deps)===false,"stale failure cannot release another worker's lease");
  const meta=(await db.query("select relrowsecurity from pg_class where relname='wf_google_photo_store'")).rows[0];
  check(meta.relrowsecurity,"actual table has row-level security");
  check((await db.query("select public from storage.buckets where id='google-place-photos'")).rows[0].public===false,"actual bucket is private");
  await db.exec("set request.jwt.claim.role='authenticated'");
  await assert.rejects(()=>db.query("select public.wf_google_photo_store_claim($1)",[id]),/insufficient_privilege|insufficient privilege/); assertions++;
  check(!calls.some(c=>c.url.pathname.includes('/wf_place_photo')), "Google storage never relabels or mutates the licensed vault");
} finally { await db.close(); }
console.log(`test-google-photo-store: OK (${assertions} assertions; actual local PostgreSQL RPCs, fake private storage and Google transport)`);
