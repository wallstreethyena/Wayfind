import {groupEmailReady,processGroupPlanEmails} from "./groupPlanEmail.js";

// One deadline shared by every database and provider fetch, below the route's
// 60s ceiling. Count limits alone cannot bound 50 sequential network timeouts.
export async function runGroupPlanWorker({createRuntime,env=process.env,fetchImpl=fetch,budgetMs=45000}) {
  const deadline=AbortSignal.timeout(budgetMs);
  const shouldContinue=()=>!deadline.aborted;
  const boundedFetch=(url,init={})=>fetchImpl(url,{...init,signal:AbortSignal.any([deadline,...(init.signal?[init.signal]:[])])});
  const {service,repository,config}=createRuntime({worker:true,fetchImpl:boundedFetch});
  const result=await service.sweepDeadlines({shouldContinue});
  const email=shouldContinue()
    ? await processGroupPlanEmails({repository,config,env,fetchImpl:boundedFetch,shouldContinue})
    : {enabled:groupEmailReady(env),attempted:0,accepted:0,failed:0,deferred:true};
  // Permanent deletion is a separately approved retention operation.
  const maintenance=env.WF_GROUP_PLAN_CLEANUP_ENABLED!=="1"?{enabled:false}
    : shouldContinue()?{enabled:true,...await repository.cleanup()}:{enabled:true,deferred:true};
  const ok=result.failed===0&&result.deferred===0&&email.failed===0&&!email.deferred&&!maintenance.deferred&&shouldContinue();
  return {ok,...result,email,maintenance,budgetExhausted:deadline.aborted};
}
