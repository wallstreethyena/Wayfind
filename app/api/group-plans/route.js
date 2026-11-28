import { groupPost,groupReply } from "../../../lib/groupPlanApi.js";
import { verifiedGroupOrganizer } from "../../../lib/groupPlanRepository.js";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req) {
  return groupPost(req,async({config,service},body)=>{
    const user=await verifiedGroupOrganizer(req,config);
    if(body.action==="list") return groupReply({ok:true,...await service.notices(user),emailAvailable:config.emailAvailable,hasVerifiedEmail:user.hasVerifiedEmail});
    if(body.action==="suggest") return groupReply({ok:true,...await service.suggest(body.placeId,user)});
    if(body.action==="santa_suggest") return groupReply({ok:true,...await service.santaSuggest(body.placeId,user)});
    if(body.action==="search_experiences") return groupReply({ok:true,...await service.searchExperiences(body.query,body.near||null,user)});
    if(body.action==="smart_search") return groupReply({ok:true,...await service.smartSearch(body.query,body.near||null,user)});
    if(body.action==="delete") return groupReply({ok:true,...await service.deletePlan(body.planId,user)});
    if(body.action==="clean_history") return groupReply({ok:true,...await service.cleanHistory(body.scope,user)});
    if(body.action==="dismiss_notice") return groupReply({ok:true,...await service.dismissNotice(body.noticeId,user)});
    if(body.action!=="create") return groupReply({ok:false,error:"INVALID_ACTION",message:"Choose a supported group action."},400);
    return groupReply({ok:true,plan:await service.create(body,user)},201);
  });
}
