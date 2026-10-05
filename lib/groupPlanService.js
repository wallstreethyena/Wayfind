import { randomUUID } from "node:crypto";
import { createGroupPlan, applyGroupPlanCommand, settleGroupPlan, organizerPlanView, participantPlanView, GroupPlanError } from "./groupPlan.js";
import { inviteCapability, finalCapability, verifyInviteCapability, verifyFinalCapability, newGroupPlanSecret, groupRateKey, GROUP_PLAN_ID } from "./groupPlanSecurity.js";
import { GroupStorageError } from "./groupPlanRepository.js";

const nowIso=(now)=>new Date(now).toISOString();
const deny=()=>{ throw new GroupStorageError("PLAN_NOT_FOUND","This invitation is unavailable or has expired.",404); };
const labels=(places)=>places.map((p,i)=>({id:p.id,name:i?`Alternative ${i}`:"Original idea"}));
const OWNER_COMMANDS=new Set(["start","close","cancel","finalize"]);
const PARTICIPANT_COMMANDS=new Set(["respond","withdraw"]);

export function createGroupPlanService({ repository, placeData, clock=Date.now, uuid=randomUUID, secret=newGroupPlanSecret, emailAvailable=false }) {
  const get=async(id)=>{
    if (!GROUP_PLAN_ID.test(String(id))) return deny();
    const row=await repository.get(id);
    if (!row || Date.parse(row.expires_at)<=clock()) return deny();
    return row;
  };
  async function settle(row) {
    for(let attempt=0;attempt<3;attempt++) {
      const next=settleGroupPlan(row.state,{now:nowIso(clock())});
      if(next===row.state) return row;
      const result=await repository.compareAndSwap(row.id,row.revision,next,"settle");
      if(!result.conflict) return result;
      row=await get(row.id);
    }
    throw new GroupStorageError("PLAN_BUSY","Several replies arrived together. Please retry.",409);
  }
  function actor(row,{user,token,finalToken}) {
    if(user?.id===row.owner_id) return {role:"organizer"};
    if(token) { const slotId=verifyInviteCapability(row.state,token,row.invite_secret,clock()); if(slotId) return {role:"participant",slotId}; }
    if(finalToken && verifyFinalCapability(row.state,finalToken,row.invite_secret,clock())) return {role:"final"};
    return deny();
  }
  async function view(row,identity) {
    const now=clock(),options={now:nowIso(now)};
    let result;
    if(identity.role==="organizer") {
      result=organizerPlanView(row.state,options);
      result.invites=result.invitees.map((slot)=>({slotId:slot.id,token:inviteCapability(row.state,slot,row.invite_secret)}));
      result.finalToken=finalCapability(row.state,row.invite_secret);
      result.emailConsent=row.email_consent===true;
      result.emailAvailable=emailAvailable;
      result.draftExpired=row.state.status==="draft"&&Date.parse(row.state.deadline)<=now;
    } else if(identity.role==="participant") result=participantPlanView(row.state,identity.slotId,options);
    else {
      const plan=row.state;
      const chosen=plan.places.filter((p)=>p.id===plan.finalPlan.placeId);
      result={id:plan.id,status:plan.status,timeZone:plan.timeZone,places:chosen,times:plan.times.filter((t)=>t.id===plan.finalPlan.timeId),finalPlan:plan.finalPlan};
    }
    result.role=identity.role;
    try { result.places=await placeData.hydrate(result.places.map((p)=>p.id),result.times,now); }
    catch { result.places=result.places.map((p)=>({id:p.id,name:p.name,unavailable:true})); result.placeDataUnavailable=true; }
    return result;
  }
  return {
    async create(input,user) {
      if(!user?.id) throw new GroupStorageError("SIGN_IN_REQUIRED","Sign in to organize a group.",401);
      if(!GROUP_PLAN_ID.test(input.createKey || "")) throw new GroupPlanError("INVALID_CREATE_KEY","Refresh the form and try again.");
      const existing=await repository.findCreated(user.id,input.createKey);
      if(existing) {
        if(Date.parse(existing.expires_at)<=clock()) throw new GroupStorageError("PLAN_EXPIRED","That draft has expired. Start a new plan.",410);
        return view(await settle(existing),{role:"organizer"});
      }
      if(input.emailConsent===true && (!emailAvailable || !user.hasVerifiedEmail)) throw new GroupStorageError("EMAIL_NOT_READY","Email updates are unavailable. Continue with updates in Wayfind, or verify your account email.",409);
      const now=clock(),id=uuid();
      const slotIds=(Array.isArray(input.invitees)?input.invitees:[]).map(()=>uuid()),timeIds=(Array.isArray(input.times)?input.times:[]).map(()=>uuid());
      const safe={ownerId:user.id,organizerName:input.organizerName,originalPlaceId:input.originalPlaceId,
        invitees:input.invitees,times:input.times,timeZone:input.timeZone,deadline:input.deadline,
        places:[{id:input.originalPlaceId,name:"Original idea"}]};
      const options={now:nowIso(now),id,slotIds,timeIds};
      // Validate cheap deterministic bounds before any inventory reads.
      const first=createGroupPlan(safe,options);
      await repository.rateLimit(groupRateKey("create",user.id),10);
      const prepared=await placeData.prepare(input.originalPlaceId,first.times,now);
      const state=createGroupPlan({...safe,places:labels(prepared.places)},options);
      state.alternativesStatus=prepared.alternativesStatus;
      const row=await repository.create({state,secret:secret(),createKey:input.createKey,emailConsent:input.emailConsent===true});
      const result=await view(row,{role:"organizer"});
      result.alternativesStatus=row.state.alternativesStatus;
      return result;
    },
    read: async function readGroupPlan(id,credentials) {
      const row=await get(id),identity=actor(row,credentials);
      await repository.rateLimit(groupRateKey("read",`${id}/${identity.slotId||credentials.user?.id||"final"}`),60);
      const settled=await settle(row);
      return view(settled,actor(settled,credentials));
    },
    async command(id,command,credentials) {
      if(!GROUP_PLAN_ID.test(command?.id||"")) throw new GroupPlanError("INVALID_COMMAND_ID","Retry this action with a new request.");
      let row=await get(id),identity=actor(row,credentials);
      const allowed=identity.role==="organizer"?OWNER_COMMANDS:PARTICIPANT_COMMANDS;
      if(identity.role==="final" || !allowed.has(command.type)) throw new GroupStorageError("ACTION_NOT_ALLOWED","This link cannot perform that action.",403);
      if(identity.role==="participant" && command.slotId!==identity.slotId) throw new GroupStorageError("ACTION_NOT_ALLOWED","This link belongs to a different invite.",403);
      await repository.rateLimit(groupRateKey("command",`${id}/${identity.slotId||credentials.user?.id}`),30);
      for(let attempt=0;attempt<3;attempt++) {
        row=await settle(row);
        identity=actor(row,credentials);
        const next=applyGroupPlanCommand(row.state,command,{now:nowIso(clock())});
        if(next===row.state) return view(row,identity);
        if(command.type==="finalize") {
          const currentPlaces=await placeData.hydrate([command.placeId],row.state.times,clock());
          if(!currentPlaces[0]||currentPlaces[0].unavailable||currentPlaces[0].status!=="OPERATIONAL") throw new GroupStorageError("PLACE_UNAVAILABLE","This place can’t currently be verified. Choose another option or start a new plan.",409);
          if(currentPlaces[0].closedTimeIds?.includes(command.timeId)) throw new GroupStorageError("VENUE_CLOSED","The venue’s known hours conflict with that time. Choose another time or place.",409);
          const hoursVerified=currentPlaces[0].openTimeIds?.includes(command.timeId)===true;
          if(!hoursVerified&&command.acknowledgeVenueHours!==true) throw new GroupStorageError("VENUE_HOURS_CHECK_REQUIRED","Check the venue’s opening hours before confirming this time.",409);
          next.finalPlan.venueHoursStatus=hoursVerified?"regular_hours_fit":"organizer_checked";
        }
        const result=await repository.compareAndSwap(id,row.revision,next,command.type);
        if(!result.conflict) return view(result,identity);
        row=await get(id);
      }
      throw new GroupStorageError("PLAN_BUSY","Several replies arrived together. Your response was not confirmed; please retry.",409);
    },
    async sweepDeadlines({shouldContinue=()=>true}={}) {
      const due=await repository.due(50); let closed=0,failed=0,deferred=0;
      for(const [index,item] of due.entries()) {
        if(!shouldContinue()){deferred=due.length-index;break;}
        try { const row=await settle(await get(item.id)); if(row.status==="closed") closed++; }
        catch { failed++; }
      }
      return {checked:due.length-deferred,closed,failed,deferred,mayHaveMore:due.length===50||deferred>0};
    },
    async notices(user) { if(!user?.id) return deny(); return {notices:await repository.notices(user.id),plans:await repository.listOwned(user.id)}; },
  };
}
