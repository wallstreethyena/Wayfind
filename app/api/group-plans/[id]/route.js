import { groupPost,groupReply,groupCredentials } from "../../../../lib/groupPlanApi.js";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req,{params}) {
  const {id}=await params;
  return groupPost(req,async({config,service},body)=>{
    const credentials=await groupCredentials(req,body,config);
    if(body.action==="view") return groupReply({ok:true,plan:await service.read(id,credentials)});
    if(body.action==="command") {
      // Proof of consent for an optional text-list signup: where and on what device.
      const meta={ip:String(req.headers.get("x-forwarded-for")||req.headers.get("x-real-ip")||"").split(",")[0].trim(),userAgent:String(req.headers.get("user-agent")||"")};
      const plan = await service.command(id,body.command,credentials,meta);
      const slotToken = plan && plan.slotToken ? plan.slotToken : undefined;
      if (slotToken) delete plan.slotToken;
      return groupReply({ok:true,plan,...(slotToken ? { slotToken } : {})});
    }
    return groupReply({ok:false,error:"INVALID_ACTION",message:"Choose a supported group action."},400);
  });
}
