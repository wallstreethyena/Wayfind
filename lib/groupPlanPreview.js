import { GROUP_PLAN_ID } from "./groupPlanSecurity.js";
import { groupPlanConfiguration } from "./groupPlanRepository.js";
import { SITE_URL } from "./site.js";

// Deliberately public subset: only a public place identity and its branded
// preview. Never include organizer/guest names, times, votes, or capabilities.
export async function groupPlanPreview(id,{env=process.env,fetchImpl=fetch,now=Date.now()}={}) {
  if(!GROUP_PLAN_ID.test(String(id||"")))return null;
  try{
    const config=groupPlanConfiguration(env),headers={apikey:config.key,authorization:`Bearer ${config.key}`};
    const read=async(path)=>{
      const response=await fetchImpl(`${config.url}/rest/v1/${path}`,{headers,cache:"no-store",signal:AbortSignal.timeout(4000)});
      return response.ok?response.json():[];
    };
    const [row]=await read(`wf_group_plans?id=eq.${encodeURIComponent(id)}&select=status,expires_at,original:state->>originalPlaceId,final:state->finalPlan&limit=1`);
    if(!row||row.status==="cancelled"||Date.parse(row.expires_at)<=now)return null;
    const placeId=row.status==="finalized"?row.final?.placeId:row.original;
    if(!/^[A-Za-z0-9_-]{3,200}$/.test(placeId||""))return null;
    const [place]=await read(`wf_inventory?place_id=eq.${encodeURIComponent(placeId)}&status=eq.OPERATIONAL&select=place_id,name,refreshed_at,excluded&limit=1`);
    const checked=Date.parse(place?.refreshed_at);
    if(!place||place.excluded||!place.name||!Number.isFinite(checked)||checked>now||now-checked>=30*86400000)return null;
    const image=new URL("/api/og/hero",SITE_URL);image.searchParams.set("kind","place");image.searchParams.set("id",place.place_id);image.searchParams.set("t",place.name);image.searchParams.set("purpose",row.status==="finalized"?"group_final":"group");
    return {title:place.name,image:image.toString(),finalized:row.status==="finalized"};
  }catch{return null;}
}
