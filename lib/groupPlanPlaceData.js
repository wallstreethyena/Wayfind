// Read-only adapter. Never calls a paid place provider, LLM, or an internal route
// that can trigger one. Place facts are hydrated per request, never persisted in
// long-lived group state (only stable IDs and neutral labels are stored there).
import { governedScoreOf } from "./lawfulOrder.js";
import { stampOwnerPick } from "./ownerBump.js";
import { computeTrendSignal } from "./trendSignal.js";
import { creatorCountFor } from "./creatorSignals.js";
import { groupEditorial, groupMiles, selectGroupAlternatives, sameGroupIntent, recommendGroupOptions, experienceCategoriesForPlace } from "./groupPlanCandidates.js";
import { findFreePhoto } from "./freePhoto.js";
import { businessStatus } from "./businessStatus.js";
import { isNotPublicPlace } from "./notPublicPlaces.js";
import { servingPath } from "./editorialSource.js";
import { GroupStorageError } from "./groupPlanRepository.js";
import { experienceWayfindScore, destsWithin, metroToDest } from "./experiencesData.js";
import { isExperienceGroupId } from "./shareContext.js";

const ID = /^[A-Za-z0-9_-]{3,200}$/;
const DAY = 86400000;
// Tours (Viator products in wf_experiences) are keyed "vx_<product code>".
// They have no coordinates or opening hours, so alternatives are other tours
// in the same Viator destination and category, and every time stays an
// explicit "check availability" disclosure rather than a verified fit.
const EXP_FIELDS = "product_code,dest_id,city,categories,title,image,rating,reviews,duration_min,link_ok,refreshed_at";
const EXP_HOURS_NOTE = "Tour availability isn’t checked for these times. Check availability before confirming.";
export function shapeGroupExperience(row, times, now) {
  const refreshed = Date.parse(row.refreshed_at), fresh = Number.isFinite(refreshed) && refreshed <= now && now - refreshed < 30 * DAY;
  const score = experienceWayfindScore(row) || null;
  const image = typeof row.image === "string" && /^https:\/\//.test(row.image) ? row.image : null;
  return {
    id: "vx_" + row.product_code, kind: "experience", name: row.title, city: row.city || null, lat: null, lng: null,
    category: "tour", primaryType: null, cuisines: [], categories: Array.isArray(row.categories) ? row.categories : [],
    status: row.link_ok === false ? "UNAVAILABLE" : "OPERATIONAL", excluded: false,
    score, scoreVerified: fresh && score !== null, scoreCheckedAt: fresh ? new Date(refreshed).toISOString() : null,
    factsExpireAt: fresh ? new Date(refreshed + 30 * DAY).toISOString() : null,
    factsCheckedAt: Number.isFinite(refreshed) ? new Date(refreshed).toISOString() : null, factsStale: !fresh,
    rating: Number.isFinite(row.rating) ? row.rating : null, reviews: Number.isFinite(row.reviews) ? row.reviews : 0,
    durationMin: Number.isFinite(row.duration_min) && row.duration_min > 0 ? row.duration_min : null,
    priceLevel: null, openTimeIds: [], closedTimeIds: [], unverifiedTimeIds: (times || []).map((t) => t.id),
    hoursStatus: "unverified", hoursNote: EXP_HOURS_NOTE,
    editorial: { status: "unavailable", text: null, sources: [], publishedAt: null, checkedAt: null },
    photo: image, photoAttr: image ? "Photo: Viator" : null, photoAttrHref: image ? "https://www.viator.com/" : null,
    placeUrl: null, scoreContext: "Compared with tours in the same area", curatorPick: false, creatorVideo: false, trending: false, trendReason: null,
  };
}
const FIELDS = "place_id,name,lat,lng,locality,postal_city,metro,category,primary_type,google_types,cuisines,tags,signals,status,excluded,refreshed_at,last_verified_at";
const category = (value) => String(value || "").toLowerCase();
function offsetAt(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA",{ timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23" }).formatToParts(new Date(timestamp)); // one-clock-ok: exact IANA offset for a supplied outing instant, not current-daypart bucketing.
  const p = Object.fromEntries(parts.map((part) => [part.type,part.value]));
  return (Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)-timestamp)/60000;
}
export function scheduledGroupTimeFit(details, times, now) {
  const fit={openTimeIds:[],closedTimeIds:[],unverifiedTimeIds:[]};
  const zone=details?.timeZone||details?.ianaTimeZone;
  const periods=details?.oh?.periods||details?.regularOpeningHours?.periods;
  const checked=Date.parse(details?.hoursAsOf);
  const usable=zone&&Array.isArray(periods)&&periods.length&&Number.isFinite(checked)&&checked<=now&&now-checked<=14*DAY;
  for(const time of times||[]){
    let verdict='unknown';
    if(details?.businessStatus&&details.businessStatus!=='OPERATIONAL')verdict='closed';
    else if(usable){
      try {
        const start=Date.parse(time.startsAt),end=Date.parse(time.endsAt);
        if(Number.isFinite(start)&&time.endsAt==null){
          // Closed at arrival is a known conflict. Open at arrival cannot
          // verify a whole visit whose duration the organizer has not supplied.
          const status=businessStatus({oh:{periods},utcOffset:offsetAt(Math.floor(start/1000)*1000,zone),specialHours:details.specialHours,businessStatus:details.businessStatus||'OPERATIONAL'},start).open;
          if(status===false)verdict='closed';
        }else if(Number.isFinite(start)&&Number.isFinite(end)&&end>start&&end-start<=24*3600000){
          const checks=[start,end-1];for(let at=Math.ceil(start/60000)*60000;at<end;at+=60000)checks.push(at);
          verdict='open';
          for(const at of checks){
            const status=businessStatus({oh:{periods},utcOffset:offsetAt(Math.floor(at/1000)*1000,zone),specialHours:details.specialHours,businessStatus:details.businessStatus||'OPERATIONAL'},at).open;
            if(status===false){verdict='closed';break;}if(status!==true)verdict='unknown';
          }
        }
      }catch{verdict='unknown';}
    }
    fit[verdict==='open'?'openTimeIds':verdict==='closed'?'closedTimeIds':'unverifiedTimeIds'].push(time.id);
  }
  return {...fit,hoursStatus:fit.unverifiedTimeIds.length?(fit.openTimeIds.length||fit.closedTimeIds.length?'partially_verified':'unverified'):'verified'};
}
export function scheduledGroupOpenTimes(details,times,now){return scheduledGroupTimeFit(details,times,now).openTimeIds;}

export function createGroupPlaceData(config, { fetchImpl = fetch, env = process.env, photoResolver = findFreePhoto } = {}) {
  const headers = { apikey:config.key,authorization:`Bearer ${config.key}` };
  async function read(path) {
    let response;
    try { response=await fetchImpl(`${config.url}/rest/v1/${path}`,{headers,cache:"no-store",signal:AbortSignal.timeout(7000)}); }
    catch { throw new GroupStorageError("PLACE_DATA_UNAVAILABLE","We couldn’t check the place details. Please retry."); }
    if (!response.ok) throw new GroupStorageError("PLACE_DATA_UNAVAILABLE","We couldn’t check the place details. Please retry.");
    return response.json();
  }
  async function rowsByIds(ids) {
    const safe=[...new Set(ids)].filter((id)=>ID.test(id) && !isExperienceGroupId(id));
    if (!safe.length) return [];
    return read(`wf_inventory?place_id=in.(${safe.map(encodeURIComponent).join(",")})&select=${FIELDS}`);
  }
  async function attachPhotos(places) {
    return Promise.all((places||[]).map(async(place)=>{
      if(!place||place.unavailable||place.kind==="experience")return place;
      let photo=null;
      try{photo=await photoResolver({placeId:place.id,width:640},{fetchImpl,env:{SUPABASE_URL:config.url,SUPABASE_SERVICE_ROLE_KEY:config.key}});}catch{/* An unavailable credit record means no photo. */}
      return {...place,photo:photo?.url||null,photoAttr:photo?.attributionText||null,photoAttrHref:photo?.attributionUrl||null};
    }));
  }
  async function enrich(rows, original, times, now) {
    if (!rows.length) return [];
    const ids=rows.map((r)=>r.place_id), inIds=ids.map(encodeURIComponent).join(",");
    const owner=String(env.WF_OWNER_USER_ID || "").trim();
    const [editorial,cache,popularity,likes]=await Promise.all([
      read(servingPath(`place_id=in.(${inIds})&verified=is.true&select=place_id,hook,why_here,facts,verified,written_at`)),
      read(`wf_places_cache?k=in.(${ids.map((id)=>encodeURIComponent(`pd1|${id}`)).join(",")})&select=k,v,wrote_at,exp`),
      read(`wf_place_popularity_scored?place_id=in.(${inIds})&select=place_id,tier2_popularity`),
      /^[0-9a-f-]{36}$/i.test(owner) ? read(`likes?user_id=eq.${encodeURIComponent(owner)}&place_id=in.(${inIds})&select=place_id`) : Promise.resolve(null),
    ]);
    const owned=new Set((likes || []).map((r)=>r.place_id));
    return rows.map((row)=>{
      const refreshed=Date.parse(row.refreshed_at), fresh=Number.isFinite(refreshed)&&refreshed<=now&&now-refreshed<30*DAY;
      // Stale inventory facts never hide identity or the score: the rest of Wayfind shows
      // the same row. Staleness is disclosed (factsStale/factsCheckedAt); unavailable means a missing row only.
      const cached=cache.find((c)=>c.k===`pd1|${row.place_id}`);
      const wrote=Date.parse(cached?.wrote_at), details=cached&&Number.isFinite(wrote)&&wrote<=now&&now-wrote<30*DAY&&Date.parse(cached.exp)>now?cached.v:null;
      const city = row.postal_city || row.locality || row.metro || null;
      let shaped={id:row.place_id,name:row.name,city,lat:row.lat,lng:row.lng,rating:row.signals?.rating??null,reviews:row.signals?.reviews??null,distMi:original?groupMiles(original,row):null};
      const trend=computeTrendSignal({popularity:popularity.find((p)=>p.place_id===row.place_id)?.tier2_popularity??null,corroborationCreators:creatorCountFor(shaped)});
      shaped.trending=trend.trending; shaped.trend_reason=trend.trendReason;
      if (likes) shaped=stampOwnerPick(shaped,owned.has(row.place_id));
      const score=likes?governedScoreOf(shaped):null;
      return {id:row.place_id,kind:"place",name:row.name,city,metro:row.metro||null,lat:row.lat,lng:row.lng,category:category(row.category),primaryType:row.primary_type,
        googleTypes:Array.isArray(row.google_types)?row.google_types:[],tags:Array.isArray(row.tags)?row.tags:[],
        cuisines:row.cuisines||[],status:row.status,excluded:row.excluded===true,score,scoreVerified:fresh&&score!==null,
        scoreCheckedAt:fresh?new Date(refreshed).toISOString():null,factsExpireAt:fresh?new Date(refreshed+30*DAY).toISOString():null,
        factsCheckedAt:Number.isFinite(refreshed)?new Date(refreshed).toISOString():null,factsStale:!fresh,
        priceLevel:Number.isInteger(row.signals?.priceNum)?row.signals.priceNum:null,
        ...scheduledGroupTimeFit(details,times,now), editorial:groupEditorial(editorial.find((e)=>e.place_id===row.place_id),now),
        photoUrl:`/api/og/hero?kind=place&id=${encodeURIComponent(row.place_id)}&t=${encodeURIComponent(row.name)}`,
        placeUrl:`/places/${encodeURIComponent(row.place_id)}`,scoreContext:"Compared near the organizer’s original place",curatorPick:owned.has(row.place_id),
        creatorVideo:shaped.creator_video===true,trending:shaped.trending===true,trendReason:shaped.trend_reason||null,
        hoursNote:"Hours not verified for this time. Check with the venue before confirming."};
    });
  }
  async function experienceRows(ids) {
    const codes=[...new Set(ids)].filter(isExperienceGroupId).map((id)=>id.slice(3));
    if (!codes.length) return [];
    return read(`wf_experiences?product_code=in.(${codes.map(encodeURIComponent).join(",")})&select=${EXP_FIELDS}`);
  }
  async function prepareExperience(originalId,times,now) {
    const row=(await experienceRows([originalId]))[0];
    if (!row || row.link_ok===false || !row.title) throw new GroupStorageError("PLACE_UNAVAILABLE","This tour is not available for group planning right now.",404);
    const first=shapeGroupExperience(row,times,now);
    const cats=(Array.isArray(row.categories)?row.categories:[]).filter((c)=>/^[A-Za-z0-9_-]{1,40}$/.test(String(c)));
    let pool=[];
    try {
      pool=await read(`wf_experiences?dest_id=eq.${encodeURIComponent(row.dest_id)}&link_ok=is.true${cats.length?`&categories=ov.{${cats.map(encodeURIComponent).join(",")}}`:""}&select=${EXP_FIELDS}&order=product_code.asc&limit=300`);
    } catch { return {places:[first],alternativesStatus:"evidence_check_incomplete"}; }
    // Options, never a verdict: up to two higher-scoring tours of the same kind nearby.
    const alternatives=pool.filter((r)=>r.product_code!==row.product_code&&r.title)
      .map((r)=>shapeGroupExperience(r,times,now))
      .filter((p)=>Number.isFinite(p.score)&&Number.isFinite(first.score)&&p.score>first.score)
      .sort((a,b)=>b.score-a.score||b.reviews-a.reviews||a.id.localeCompare(b.id)).slice(0,2);
    for(const p of alternatives)p.comparisonReasons=[`Higher current Wayfind Score: ${(p.score/10).toFixed(1)} vs ${(first.score/10).toFixed(1)}`,`Same kind of tour${row.city?` in ${row.city}`:""}`];
    return {places:[first,...alternatives],alternativesStatus:alternatives.length?"verified":"no_verified_alternatives"};
  }
  async function hydrateExperiences(ids,times,now) {
    const rows=await experienceRows(ids);
    return ids.map((id,i)=>{
      const row=rows.find((r)=>"vx_"+r.product_code===id);
      if (!row) return {id,name:i?"Alternative unavailable":"Original tour unavailable",unavailable:true};
      const p=shapeGroupExperience(row,times,now);
      if (p.status!=="OPERATIONAL") return {id,name:i?"Alternative unavailable":"Original tour unavailable",unavailable:true};
      if (i) p.comparisonReasons=[`Same kind of tour${row.city?` in ${row.city}`:""}`,...(p.score!==null?[`Wayfind Score: ${(p.score/10).toFixed(1)}`]:[])];
      return p;
    });
  }
  async function fetchNearbyExperiences(seed, now) {
    const wantCats = experienceCategoriesForPlace(seed).filter((c)=>/^[A-Za-z0-9_-]{1,40}$/.test(String(c)));
    let destIds = [];
    if (seed.kind === "experience" && seed.destId) destIds = [String(seed.destId)];
    else if (Number.isFinite(seed.lat) && Number.isFinite(seed.lng)) destIds = destsWithin({ lat: seed.lat, lng: seed.lng }, 30).slice(0, 2);
    if (!destIds.length && (seed.metro || seed.city)) {
      const m = metroToDest(seed.metro || seed.city);
      if (m) destIds = [m.destId];
    }
    if (!destIds.length) return [];
    try {
      const catFilter = wantCats.length ? `&categories=ov.{${wantCats.map(encodeURIComponent).join(",")}}` : "";
      const rows = await read(`wf_experiences?dest_id=in.(${destIds.map(encodeURIComponent).join(",")})&link_ok=is.true${catFilter}&select=${EXP_FIELDS}&order=reviews.desc.nullslast&limit=80`);
      return (rows || []).filter((r) => r && r.title && r.link_ok !== false).map((r) => shapeGroupExperience(r, [], now));
    } catch { return []; }
  }
  return {
    async prepare(originalId,times,now) {
      if (isExperienceGroupId(originalId)) return prepareExperience(originalId,times,now);
      if (!ID.test(String(originalId || "")) || isNotPublicPlace(originalId)) throw new GroupStorageError("PLACE_UNAVAILABLE","Choose a supported place to organize.",400);
      const original=(await rowsByIds([originalId]))[0];
      if (!original || original.status!=="OPERATIONAL" || original.excluded || !Number.isFinite(original.lat) || !Number.isFinite(original.lng)) throw new GroupStorageError("PLACE_UNAVAILABLE","This place is not available for group planning.",404);
      const latDelta=10/69, lngDelta=10/(69*Math.cos(original.lat*Math.PI/180));
      // Read every row in the geographic/category envelope in stable pages.
      const candidates=[]; let complete=false;
      for (let offset=0;offset<6000;offset+=1000) {
        const page=await read(`wf_inventory?category=eq.${encodeURIComponent(original.category)}&status=eq.OPERATIONAL&lat=gte.${original.lat-latDelta}&lat=lte.${original.lat+latDelta}&lng=gte.${original.lng-lngDelta}&lng=lte.${original.lng+lngDelta}&select=${FIELDS}&order=place_id.asc&offset=${offset}&limit=1000`);
        candidates.push(...page);
        if (page.length<1000) {complete=true;break;}
      }
      // Preflight exact intent/known budget before bounded evidence hydration.
      const intent=(row)=>({category:category(row.category),primaryType:row.primary_type,cuisines:row.cuisines||[]});
      const similar=candidates.filter((r)=>r.place_id!==originalId&&!r.excluded&&groupMiles(original,r)<=10
        && sameGroupIntent(intent(original),intent(r)))
        .sort((a,b)=>a.place_id.localeCompare(b.place_id));
      if (!complete || similar.length>100) {
        const [place]=await enrich([original],original,times,now);
        return {places:[place],alternativesStatus:"evidence_check_incomplete"};
      }
      const all=await enrich([original,...similar],original,times,now), first=all[0];
      const alternatives=selectGroupAlternatives(first,all.slice(1),{now,timeIds:times.map((t)=>t.id)});
      for(const p of alternatives)p.comparisonReasons=[`Higher current Wayfind Score: ${(p.score/10).toFixed(1)} vs ${(first.score/10).toFixed(1)}`,`Same ${p.category} category`,`${groupMiles(first,p).toFixed(1)} miles from your original idea`,"Compatible known price band"];
      return {places:[first,...alternatives],alternativesStatus:alternatives.length?"verified":"no_verified_alternatives"};
    },
    async prepareSelected(placeIds, times, now) {
      const clean = [...new Set((Array.isArray(placeIds) ? placeIds : []).map((x) => String(x || "").trim()).filter(Boolean))];
      if (!clean.length || clean.length > 5) throw new GroupStorageError("PLACE_UNAVAILABLE", "Choose between 1 and 5 supported spots.", 400);
      for (const id of clean) {
        if (!isExperienceGroupId(id) && (!ID.test(id) || isNotPublicPlace(id))) {
          throw new GroupStorageError("PLACE_UNAVAILABLE", "One of the selected spots is not available for group planning.", 400);
        }
      }
      const hydrated = await this.hydrate(clean, times, now);
      const valid = hydrated.filter((p) => p && !p.unavailable && p.status === "OPERATIONAL");
      if (valid.length !== clean.length) {
        throw new GroupStorageError("PLACE_UNAVAILABLE", "One of your chosen spots is no longer available. Remove it or pick another.", 404);
      }
      return { places: valid, alternativesStatus: valid.length > 1 ? "verified" : "organizer_selected" };
    },
    async suggest(seedId, now = Date.now()) {
      if (isExperienceGroupId(seedId)) {
        const row = (await experienceRows([seedId]))[0];
        if (!row || row.link_ok === false || !row.title) throw new GroupStorageError("PLACE_UNAVAILABLE", "This tour is not available for group planning right now.", 404);
        const seed = { ...shapeGroupExperience(row, [], now), destId: row.dest_id };
        const expPool = await fetchNearbyExperiences(seed, now);
        const { experiences } = recommendGroupOptions(seed, [], expPool, { maxPlaces: 0, maxExperiences: 6 });
        return { seed, places: [], experiences };
      }
      if (!ID.test(String(seedId || "")) || isNotPublicPlace(seedId)) throw new GroupStorageError("PLACE_UNAVAILABLE", "Choose a supported place to organize.", 400);
      const original = (await rowsByIds([seedId]))[0];
      if (!original || original.status !== "OPERATIONAL" || original.excluded || !Number.isFinite(original.lat) || !Number.isFinite(original.lng)) {
        throw new GroupStorageError("PLACE_UNAVAILABLE", "This place is not available for group planning.", 404);
      }
      const latDelta = 15 / 69, lngDelta = 15 / (69 * Math.cos(original.lat * Math.PI / 180));
      const [sameCatPage, expPool] = await Promise.all([
        read(`wf_inventory?category=eq.${encodeURIComponent(original.category)}&status=eq.OPERATIONAL&lat=gte.${original.lat - latDelta}&lat=lte.${original.lat + latDelta}&lng=gte.${original.lng - lngDelta}&lng=lte.${original.lng + lngDelta}&select=${FIELDS}&order=place_id.asc&limit=400`),
        fetchNearbyExperiences({
          id: original.place_id, kind: "place", name: original.name, city: original.postal_city || original.locality || original.metro || null,
          metro: original.metro || null, lat: original.lat, lng: original.lng, category: category(original.category),
          primaryType: original.primary_type, googleTypes: original.google_types || [], cuisines: original.cuisines || [], tags: original.tags || [],
          priceLevel: Number.isInteger(original.signals?.priceNum) ? original.signals.priceNum : null,
        }, now),
      ]);
      // Pre-filter to the closest/most relevant 60 candidates before enriching to keep reads fast & bounded.
      const nearby = (sameCatPage || [])
        .filter((r) => r.place_id !== seedId && !r.excluded && Number.isFinite(r.lat) && Number.isFinite(r.lng))
        .map((r) => ({ row: r, dist: groupMiles(original, r), rating: Number(r.signals?.rating) || 0, reviews: Number(r.signals?.reviews) || 0 }))
        .filter((x) => x.dist !== null && x.dist <= 15)
        .sort((a, b) => (a.dist - b.dist) || (b.rating - a.rating) || (b.reviews - a.reviews))
        .slice(0, 60)
        .map((x) => x.row);
      const enriched = await enrich([original, ...nearby], original, [], now);
      const seed = enriched[0];
      const rec = recommendGroupOptions(seed, enriched.slice(1), expPool, { maxPlaces: 6, maxExperiences: 2, maxMiles: 15 });
      const [seedWithPhoto, ...recPlacesWithPhotos] = await attachPhotos([seed, ...rec.places]);
      return { seed: seedWithPhoto, places: recPlacesWithPhotos, experiences: rec.experiences };
    },
    async searchExperiences(query, near = null, now = Date.now()) {
      const q = String(query || "").trim().slice(0, 80);
      if (!q) return [];
      const tokens = q.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 2).slice(0, 4);
      if (!tokens.length) return [];
      let destFilter = "";
      if (near && Number.isFinite(Number(near.lat)) && Number.isFinite(Number(near.lng))) {
        const dests = destsWithin({ lat: Number(near.lat), lng: Number(near.lng) }, 60).slice(0, 3);
        if (dests.length) destFilter = `&dest_id=in.(${dests.map(encodeURIComponent).join(",")})`;
      }
      try {
        const rows = await read(`wf_experiences?link_ok=is.true${destFilter}&select=${EXP_FIELDS}&order=reviews.desc.nullslast&limit=250`);
        return (rows || [])
          .filter((r) => {
            if (!r || !r.title || r.link_ok === false) return false;
            const hay = [r.title, r.city || "", ...(Array.isArray(r.categories) ? r.categories : [])].join(" ").toLowerCase();
            return tokens.every((t) => hay.includes(t));
          })
          .slice(0, 6)
          .map((r) => shapeGroupExperience(r, [], now));
      } catch { return []; }
    },
    async hydrate(ids,times,now) {
      const list = Array.isArray(ids) ? ids : [];
      if (!list.length) return [];
      const expIds = list.filter(isExperienceGroupId);
      const placeIds = list.filter((id) => !isExperienceGroupId(id));
      // Pure tour plans read only wf_experiences (preserves tour isolation).
      if (!placeIds.length) return hydrateExperiences(list, times, now);
      const [rows, expHydrated] = await Promise.all([
        rowsByIds(placeIds),
        expIds.length ? hydrateExperiences(expIds, times, now) : Promise.resolve([]),
      ]);
      const expMap = new Map(expIds.map((id, idx) => [id, expHydrated[idx]]));
      const original = rows.find((r) => r.place_id === placeIds[0]) || rows[0] || null;
      const enriched = original ? await enrich(rows, original, times, now) : [];
      for (const p of enriched) {
        if (original && p.id !== original.place_id && !p.unavailable) {
          p.comparisonReasons = [`Same ${p.category} category`, `${groupMiles(original, p).toFixed(1)} miles from the original idea`, ...(p.score !== null ? [`Wayfind Score: ${(p.score / 10).toFixed(1)}`] : [])];
        }
      }
      const placeMap = new Map(enriched.filter((p) => p.status === "OPERATIONAL" && !p.excluded).map((p) => [p.id, p]));
      const ordered = list.map((id, i) => {
        if (isExperienceGroupId(id)) return expMap.get(id) || { id, name: i ? "Alternative unavailable" : "Original tour unavailable", unavailable: true };
        return placeMap.get(id) || { id, name: i ? "Alternative unavailable" : "Original place unavailable", unavailable: true };
      });
      return attachPhotos(ordered);
    },
  };
}
