// Client/server-safe privacy boundary for capability-bearing group links:
// Group Vote (/group-plans) and Live Trips (/trips/<id>, whose invite link
// carries its code in the #j= fragment, and /api/trips/live). Pages here get
// no third-party tags, no share token, and scrubbed error reports.
const PRIVATE_GROUP_PATH = /^\/(?:api\/)?group-plans(?:\/|$)|^\/trips(?:\/|$)|^\/api\/trips\/live(?:\/|$)/;
export function isGroupPlanPath(value) {
  try { return PRIVATE_GROUP_PATH.test(new URL(String(value||""),"https://www.gowayfind.com").pathname); }
  catch { return false; }
}
export function scrubGroupPlanTelemetry(event) {
  if(!event||typeof event!=="object")return event;
  const copy={...event};
  const scrubUrl=(value)=>{
    if(typeof value!=="string")return value;
    if(isGroupPlanPath(value)) {const kind=/\/trips(?:\/|$)/.test(value)?"trips":"group-plans";try{const url=new URL(value,"https://www.gowayfind.com");return `${url.origin}/${kind}/:private`;}catch{return `/${kind}/:private`;}}
    return value.replace(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}/gi,"[private invite]");
  };
  const group=isGroupPlanPath(copy.request?.url)||isGroupPlanPath(copy.contexts?.trace?.data?.url)
    ||(typeof window!=="undefined"&&isGroupPlanPath(window.location?.pathname));
  // Leave unrelated event objects byte- and identity-stable. The shared Sentry
  // contract must not change for ordinary server errors merely because private
  // invitations now exist elsewhere in the application.
  if(!group){
    try{
      const serialized=JSON.stringify(event);
      if(!serialized.includes("/group-plans")&&!serialized.includes("/trips")&&!/[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}/i.test(serialized)
        &&!/(?:#|[?&])(?:invite|final|group)=|#j=/i.test(serialized)&&! /"[^"\s]*(?:token|secret|authorization|cookie|phone|recipient)[^"\s]*"\s*:/i.test(serialized))return event;
    }catch{/* Cyclic event data is bounded and redacted by the walk below. */}
  }
  if(copy.request){copy.request={...copy.request,url:scrubUrl(copy.request.url)};if(group){delete copy.request.data;delete copy.request.headers;delete copy.request.cookies;delete copy.request.query_string;}}
  if(group){delete copy.user;delete copy.extra;delete copy.contexts;copy.breadcrumbs=[];}
  if(Array.isArray(copy.breadcrumbs))copy.breadcrumbs=copy.breadcrumbs.filter((crumb)=>!isGroupPlanPath(crumb?.data?.url)&&!isGroupPlanPath(crumb?.data?.to)&&!isGroupPlanPath(crumb?.data?.from)).map((crumb)=>({...crumb,message:scrubUrl(crumb.message)}));
  if(typeof copy.message==="string")copy.message=scrubUrl(copy.message);
  const seen=new WeakSet();
  const scrub=(value,depth=0)=>{
    if(typeof value==="string")return scrubUrl(value).replace(/(?:#|[?&])(?:invite|final|group)=[^\s"<>]+|#j=[^\s"<>]+/gi,"[private link]");
    if(!value||typeof value!=="object")return value;
    if(depth>12||seen.has(value))return "[redacted]";
    seen.add(value);
    if(Array.isArray(value))return value.map((item)=>scrub(item,depth+1));
    const result={};
    for(const [key,item] of Object.entries(value))result[key]=/(?:token|secret|authorization|cookie|phone|recipient)/i.test(key)?"[redacted]":scrub(item,depth+1);
    return result;
  };
  return scrub(copy);
}
