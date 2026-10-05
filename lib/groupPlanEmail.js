// Optional completion notice only. Disabled until an operator verifies the
// existing sender and explicitly enables this channel. No SMS or new provider.
import { randomUUID } from "node:crypto";

export function groupEmailReady(env = process.env) {
  return env.VERCEL_ENV === "production" && env.WF_GROUP_PLAN_EMAIL_ENABLED === "1"
    && env.WF_GROUP_PLAN_EMAIL_VERIFIED === "1" && Boolean(env.RESEND_API_KEY)
    && /^[^\r\n]+@[^\r\n]+\.[^\r\n]+$/.test(String(env.WF_ALERT_FROM || ""));
}
export async function deliverGroupPlanEmail(notice,{config,env=process.env,fetchImpl=fetch}={}) {
  if(!groupEmailReady(env))return {status:"pending_configuration",error:"email_not_ready"};
  if(notice?.event_type!=="voting_closed" || notice.email_consent!==true)return {status:"suppressed",error:"consent_required"};
  if(!/^[0-9a-f-]{36}$/i.test(notice.owner_id||"")||!/^[0-9a-f-]{36}$/i.test(notice.plan_id||"")||!/^[0-9a-f-]{36}$/i.test(notice.id||""))return {status:"suppressed",error:"invalid_notice"};
  let response,user;
  try{
    response=await fetchImpl(`${config.url}/auth/v1/admin/users/${notice.owner_id}`,{headers:{apikey:config.key,authorization:`Bearer ${config.key}`},cache:"no-store",signal:AbortSignal.timeout(4000)});
    if(response.status===404)return {status:"suppressed",error:"account_unavailable"};
    if(!response.ok)return {status:"failed",error:"account_check_failed"};
    const body=await response.json();user=body?.user||body;
  }catch{return {status:"failed",error:"account_check_failed"};}
  if(user.id!==notice.owner_id||!user.email_confirmed_at||user.is_anonymous===true||!/^\S+@\S+\.\S+$/.test(user.email||""))return {status:"suppressed",error:"verified_email_required"};
  try{
    response=await fetchImpl("https://api.resend.com/emails",{method:"POST",cache:"no-store",signal:AbortSignal.timeout(5000),headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,"content-type":"application/json","idempotency-key":`group-plan-close/${notice.id}`},body:JSON.stringify({from:env.WF_ALERT_FROM,to:[user.email],subject:"Your group’s votes are ready",text:`Voting has finished. See the place results and which times work for your group, then choose the final plan.\n\nhttps://www.gowayfind.com/group-plans/${notice.plan_id}\n\nSign in to your Wayfind account to view the private result. You requested this one-time update when you made the plan.`})});
    // Provider acceptance is not inbox delivery; the durable in-app notice is
    // the source of truth even if this secondary channel never arrives.
    if(response.ok)return {status:"provider_accepted",error:null};
    return {status:response.status===429||response.status>=500?"failed":"suppressed",error:"provider_rejected"};
  }catch{return {status:"failed",error:"provider_unconfirmed"};}
}
export async function processGroupPlanEmails({repository,config,env=process.env,fetchImpl=fetch,uuid=randomUUID,shouldContinue=()=>true}) {
  if(!groupEmailReady(env))return {enabled:false,attempted:0,accepted:0,failed:0};
  let attempted=0,accepted=0,failed=0,deferred=false;
  for(let i=0;i<3;i++){
    if(!shouldContinue()){deferred=true;break;}
    const claim=uuid(),notice=await repository.claimNotice(claim);
    if(!notice)break;
    attempted++;
    const result=await deliverGroupPlanEmail(notice,{config,env,fetchImpl});
    await repository.finishNotice(notice.id,claim,result.status,result.error);
    if(result.status==="provider_accepted")accepted++;else if(result.status==="failed")failed++;
  }
  return {enabled:true,attempted,accepted,failed,deferred};
}
