import { groupPlanConfiguration,groupWorkerConfiguration,createGroupPlanRepository,verifiedGroupOrganizer } from "./groupPlanRepository.js";
import { createGroupPlaceData } from "./groupPlanPlaceData.js";
import { createGroupPlanService } from "./groupPlanService.js";
import { sameOriginGroupRequest,readGroupJson } from "./groupPlanSecurity.js";
import { groupSmsReady } from "./groupPlanSms.js";

export const GROUP_HEADERS={"cache-control":"private, no-store","referrer-policy":"no-referrer","x-content-type-options":"nosniff"};
export function groupReply(body,status=200) { return Response.json(body,{status,headers:GROUP_HEADERS}); }
export function groupFailure(error) {
  const known=typeof error?.code==="string"&&Number.isInteger(error?.status);
  if(!known) console.error("[group-plans] request failed"); // No tokens, roster or raw provider errors.
  return groupReply({ok:false,error:known?error.code:"GROUP_UNAVAILABLE",message:known?error.message:"Group planning is temporarily unavailable. Please retry."},known?error.status:503);
}
export function groupRuntime({worker=false,fetchImpl=fetch}={}) {
  const config=worker?groupWorkerConfiguration():groupPlanConfiguration();
  const repository=createGroupPlanRepository(config,fetchImpl);
  const service=createGroupPlanService({repository,placeData:createGroupPlaceData(config,{fetchImpl}),emailAvailable:config.emailAvailable,smsAvailable:groupSmsReady(process.env),fetchImpl});
  return {config,repository,service};
}
export async function groupPost(req,handler) {
  try {
    if(!sameOriginGroupRequest(req)) return groupReply({ok:false,error:"ORIGIN_REQUIRED",message:"Open this plan in Wayfind to continue."},403);
    const runtime=groupRuntime(),body=await readGroupJson(req);
    return await handler(runtime,body);
  } catch(error) {return groupFailure(error);}
}
export async function groupCredentials(req,body,config) {
  if(body.token || body.groupToken || body.finalToken) {
    const out = { token: body.token, finalToken: body.finalToken };
    if (body.groupToken) out.groupToken = body.groupToken;
    return out;
  }
  return {user:await verifiedGroupOrganizer(req,config)};
}
