import { groupPost,groupReply } from "../../../lib/groupPlanApi.js";
import { verifiedGroupOrganizer } from "../../../lib/groupPlanRepository.js";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req) {
  return groupPost(req,async({config,service},body)=>{
    const user=await verifiedGroupOrganizer(req,config);
    if(body.action==="list") return groupReply({ok:true,...await service.notices(user),emailAvailable:config.emailAvailable,hasVerifiedEmail:user.hasVerifiedEmail});
    if(body.action!=="create") return groupReply({ok:false,error:"INVALID_ACTION",message:"Choose a supported group action."},400);
    return groupReply({ok:true,plan:await service.create(body,user)},201);
  });
}
