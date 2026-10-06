import { groupPost,groupReply,groupCredentials } from "../../../../lib/groupPlanApi.js";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req,{params}) {
  const {id}=await params;
  return groupPost(req,async({config,service},body)=>{
    const credentials=await groupCredentials(req,body,config);
    if(body.action==="view") return groupReply({ok:true,plan:await service.read(id,credentials)});
    if(body.action==="command") return groupReply({ok:true,plan:await service.command(id,body.command,credentials)});
    return groupReply({ok:false,error:"INVALID_ACTION",message:"Choose a supported group action."},400);
  });
}
