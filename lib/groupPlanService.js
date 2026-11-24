import { randomUUID } from "node:crypto";
import { createGroupPlan, applyGroupPlanCommand, settleGroupPlan, organizerPlanView, participantPlanView, groupPlanView, GroupPlanError } from "./groupPlan.js";
import { inviteCapability, groupCapability, finalCapability, verifyInviteCapability, verifyGroupCapability, verifyFinalCapability, newGroupPlanSecret, groupRateKey, GROUP_PLAN_ID } from "./groupPlanSecurity.js";
import { GroupStorageError } from "./groupPlanRepository.js";
import { santaCurateShortlist } from "./groupPlanSanta.js";
import { sendGroupPlanSms, toE164, phoneTail, ORGANIZER_SMS_CONSENT_TEXT, PARTICIPANT_SMS_CONSENT_TEXT } from "./groupPlanSms.js";
import { formatGroupTimeShort } from "./groupPlanTime.js";
import { SITE_URL } from "./site.js";

const nowIso=(now)=>new Date(now).toISOString();
const deny=()=>{ throw new GroupStorageError("PLAN_NOT_FOUND","This invitation is unavailable or has expired.",404); };
const labels=(places)=>places.map((p,i)=>({id:p.id,name:i?`Alternative ${i}`:"Original idea"}));
const OWNER_COMMANDS=new Set(["start","close","cancel","finalize"]);
const PARTICIPANT_COMMANDS=new Set(["respond","withdraw"]);
const GROUP_COMMANDS=new Set(["join_respond"]);

export function createGroupPlanService({ repository, placeData, clock=Date.now, uuid=randomUUID, secret=newGroupPlanSecret, emailAvailable=false, smsAvailable=false, smsSender=sendGroupPlanSms, santaCurator=santaCurateShortlist, env=process.env, fetchImpl=fetch, siteUrl=SITE_URL }) {
  const get=async(id)=>{
    if (!GROUP_PLAN_ID.test(String(id))) return deny();
    const row=await repository.get(id);
    if (!row || Date.parse(row.expires_at)<=clock()) return deny();
    return row;
  };
  async function fireOrganizerClosedSms(row, places) {
    if (!smsAvailable || typeof repository.listSmsOptIns !== "function") return;
    try {
      const optIns = await repository.listSmsOptIns(row.id);
      const org = (optIns || []).find((o) => o && o.slot_key === "organizer" && o.phone);
      if (!org) return;
      const lead = (places && places[0] && !places[0].unavailable ? places[0].name : null) || "your group vote";
      const replyCount = (row.state?.invitees || []).filter((s) => s.response !== null).length;
      await smsSender({
        repository, planId: row.id, slotKey: "organizer", kind: "organizer_closed",
        to: org.phone, consentText: org.consent_text || ORGANIZER_SMS_CONSENT_TEXT,
        textParams: { placeName: lead, organizerUrl: `${siteUrl}/group-plans/${encodeURIComponent(row.id)}`, replyCount },
        env, fetchImpl, now: clock,
      });
    } catch {}
  }
  async function fireOrganizerCreatedSms(row, places) {
    if (!smsAvailable || typeof repository.listSmsOptIns !== "function") return;
    try {
      const optIns = await repository.listSmsOptIns(row.id);
      const org = (optIns || []).find((o) => o && o.slot_key === "organizer" && o.phone);
      if (!org) return;
      const gToken = groupCapability(row.state, row.invite_secret);
      if (!gToken) return;
      const lead = (places && places[0] && !places[0].unavailable ? places[0].name : null) || "your outing";
      await smsSender({
        repository, planId: row.id, slotKey: "organizer", kind: "organizer_created",
        to: org.phone, consentText: org.consent_text || ORGANIZER_SMS_CONSENT_TEXT,
        textParams: {
          placeName: lead,
          groupUrl: `${siteUrl}/group-plans/${encodeURIComponent(row.id)}#group=${encodeURIComponent(gToken)}`,
          organizerUrl: `${siteUrl}/group-plans/${encodeURIComponent(row.id)}`,
        },
        env, fetchImpl, now: clock,
      });
    } catch {}
  }
  async function fireFinalizedSms(row, finalPlace) {
    if (!smsAvailable || typeof repository.listSmsOptIns !== "function") return;
    try {
      const optIns = await repository.listSmsOptIns(row.id);
      if (!Array.isArray(optIns) || !optIns.length) return;
      const fToken = finalCapability(row.state, row.invite_secret);
      if (!fToken) return;
      const finalUrl = `${siteUrl}/group-plans/${encodeURIComponent(row.id)}#final=${encodeURIComponent(fToken)}`;
      const finalTime = (row.state.times || []).find((t) => t.id === row.state.finalPlan?.timeId);
      const timeLabel = finalTime ? formatGroupTimeShort(finalTime, row.state.timeZone) : "";
      const placeName = (finalPlace && !finalPlace.unavailable ? finalPlace.name : null) || "your plan";
      await Promise.all(optIns.map((o) => smsSender({
        repository, planId: row.id, slotKey: o.slot_key, kind: "participant_finalized",
        to: o.phone, consentText: o.consent_text || PARTICIPANT_SMS_CONSENT_TEXT,
        textParams: { placeName, finalUrl, timeLabel },
        env, fetchImpl, now: clock,
      }).catch(() => null)));
    } catch {}
  }
  async function settle(row) {
    for(let attempt=0;attempt<3;attempt++) {
      const next=settleGroupPlan(row.state,{now:nowIso(clock())});
      if(next===row.state) return row;
      const result=await repository.compareAndSwap(row.id,row.revision,next,"settle");
      if(!result.conflict) {
        if (result.status === "closed") {
          let hydrated = null;
          try { hydrated = await placeData.hydrate([result.state.places[0]?.id].filter(Boolean), result.state.times, clock()); } catch {}
          void fireOrganizerClosedSms(result, hydrated);
        }
        return result;
      }
      row=await get(row.id);
    }
    throw new GroupStorageError("PLAN_BUSY","Several replies arrived together. Please retry.",409);
  }
  function actor(row,{user,token,groupToken,finalToken}) {
    if(user?.id===row.owner_id) return {role:"organizer"};
    if(token) { const slotId=verifyInviteCapability(row.state,token,row.invite_secret,clock()); if(slotId) return {role:"participant",slotId}; }
    if(groupToken && verifyGroupCapability(row.state,groupToken,row.invite_secret,clock())) return {role:"group"};
    if(finalToken && verifyFinalCapability(row.state,finalToken,row.invite_secret,clock())) return {role:"final"};
    return deny();
  }
  async function view(row,identity) {
    const now=clock(),options={now:nowIso(now)};
    let result;
    if(identity.role==="organizer") {
      result=organizerPlanView(row.state,options);
      result.invites=result.invitees.map((slot)=>({slotId:slot.id,token:inviteCapability(row.state,slot,row.invite_secret)}));
      result.groupToken=groupCapability(row.state,row.invite_secret);
      result.finalToken=finalCapability(row.state,row.invite_secret);
      result.emailConsent=row.email_consent===true;
      result.emailAvailable=emailAvailable;
      result.smsAvailable=smsAvailable;
      result.draftExpired=row.state.status==="draft"&&Date.parse(row.state.deadline)<=now;
      if (smsAvailable && typeof repository.listSmsOptIns === "function") {
        try {
          const optIns = await repository.listSmsOptIns(row.id);
          const org = (optIns || []).find((o) => o && o.slot_key === "organizer");
          if (org?.phone) result.organizerSmsTail = phoneTail(org.phone);
        } catch {}
      }
    } else if(identity.role==="participant") {
      result=participantPlanView(row.state,identity.slotId,options);
      result.smsAvailable=smsAvailable;
    } else if(identity.role==="group") {
      result=groupPlanView(row.state,options);
      result.smsAvailable=smsAvailable;
    } else {
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
      const customIds = Array.isArray(input.selectedPlaceIds) && input.selectedPlaceIds.length
        ? [...new Set(input.selectedPlaceIds.map((x) => String(x || "").trim()).filter(Boolean))]
        : null;
      if (customIds && customIds.length > 5) throw new GroupPlanError("INVALID_PLACE_COUNT", "Choose between 1 and 5 places.");
      const primaryPlaceId = customIds ? customIds[0] : input.originalPlaceId;
      const shareMode = input.shareMode === "group" ? "group" : "individual";
      const inviteeList = Array.isArray(input.invitees) ? input.invitees : [];
      const openGroup = shareMode === "group" && (input.openGroup === true || inviteeList.length === 0);
      const now=clock(),id=uuid();
      const slotIds=inviteeList.map(()=>uuid()),timeIds=(Array.isArray(input.times)?input.times:[]).map(()=>uuid());
      const safe={ownerId:user.id,organizerName:input.organizerName,originalPlaceId:primaryPlaceId,
        shareMode, openGroup,
        invitees:inviteeList,times:input.times,timeZone:input.timeZone,deadline:input.deadline,
        places:(customIds || [primaryPlaceId]).map((pid,i)=>({id:pid,name:i?`Alternative ${i}`:"Original idea"}))};
      const options={now:nowIso(now),id,slotIds,timeIds};
      // Validate cheap deterministic bounds before any inventory reads.
      const first=createGroupPlan(safe,options);
      await repository.rateLimit(groupRateKey("create",user.id),10);
      const prepared = customIds && typeof placeData.prepareSelected === "function"
        ? await placeData.prepareSelected(customIds, first.times, now)
        : await placeData.prepare(primaryPlaceId, first.times, now);
      const state=createGroupPlan({...safe,originalPlaceId:prepared.places[0].id,places:labels(prepared.places)},options);
      state.alternativesStatus=prepared.alternativesStatus;
      let row=await repository.create({state,secret:secret(),createKey:input.createKey,emailConsent:input.emailConsent===true});
      // Optional first-party organizer SMS opt-in (strictly organizer's own phone).
      const orgPhone = input.organizerSmsConsent === true ? toE164(input.organizerPhone) : null;
      if (orgPhone && smsAvailable && typeof repository.saveSmsOptIn === "function") {
        try {
          await repository.saveSmsOptIn({ planId: row.id, slotKey: "organizer", phone: orgPhone, consentAt: nowIso(now), consentText: ORGANIZER_SMS_CONSENT_TEXT });
        } catch {}
      }
      // Single-step open when requested by the organizer create form.
      if (input.autoStart === true && row.status === "draft") {
        const opened = applyGroupPlanCommand(row.state, { id: uuid(), type: "start" }, { now: nowIso(clock()) });
        const committed = await repository.compareAndSwap(row.id, row.revision, opened, "start");
        if (!committed.conflict) row = committed;
      }
      if (orgPhone && row.status === "open") {
        void fireOrganizerCreatedSms(row, prepared.places);
      }
      const result=await view(row,{role:"organizer"});
      result.alternativesStatus=row.state.alternativesStatus;
      return result;
    },
    read: async function readGroupPlan(id,credentials) {
      const row=await get(id),identity=actor(row,credentials);
      await repository.rateLimit(groupRateKey("read",`${id}/${identity.slotId||credentials.user?.id||identity.role}`),60);
      const settled=await settle(row);
      return view(settled,actor(settled,credentials));
    },
    async command(id,command,credentials) {
      if(!GROUP_PLAN_ID.test(command?.id||"")) throw new GroupPlanError("INVALID_COMMAND_ID","Retry this action with a new request.");
      let row=await get(id),identity=actor(row,credentials);
      const allowed=identity.role==="organizer"?OWNER_COMMANDS:identity.role==="participant"?PARTICIPANT_COMMANDS:identity.role==="group"?GROUP_COMMANDS:new Set();
      if(identity.role==="final" || !allowed.has(command.type)) throw new GroupStorageError("ACTION_NOT_ALLOWED","This link cannot perform that action.",403);
      if(identity.role==="participant" && command.slotId!==identity.slotId) throw new GroupStorageError("ACTION_NOT_ALLOWED","This link belongs to a different invite.",403);
      await repository.rateLimit(groupRateKey("command",`${id}/${identity.slotId||credentials.user?.id||identity.role}`),30);
      // Extract optional first-party voter SMS opt-in before handing command to pure state machine.
      const voterPhone = command.voterSmsConsent === true ? toE164(command.voterPhone) : null;
      const cleanCommand = { ...command };
      delete cleanCommand.voterSmsConsent;
      delete cleanCommand.voterPhone;
      const assignedJoinSlotId = identity.role === "group" && command.type === "join_respond" ? uuid() : null;
      for(let attempt=0;attempt<3;attempt++) {
        row=await settle(row);
        identity=actor(row,credentials);
        const execCmd = assignedJoinSlotId ? { ...cleanCommand, slotId: assignedJoinSlotId } : cleanCommand;
        const next=applyGroupPlanCommand(row.state,execCmd,{now:nowIso(clock())});
        if(next===row.state) return view(row,identity);
        let finalPlaceObj = null;
        if(execCmd.type==="finalize") {
          const currentPlaces=await placeData.hydrate([execCmd.placeId],row.state.times,clock());
          finalPlaceObj = currentPlaces[0] || null;
          if(!currentPlaces[0]||currentPlaces[0].unavailable||currentPlaces[0].status!=="OPERATIONAL") throw new GroupStorageError("PLACE_UNAVAILABLE","This place can’t currently be verified. Choose another option or start a new plan.",409);
          if(currentPlaces[0].closedTimeIds?.includes(execCmd.timeId)) throw new GroupStorageError("VENUE_CLOSED","The venue’s known hours conflict with that time. Choose another time or place.",409);
          const hoursVerified=currentPlaces[0].openTimeIds?.includes(execCmd.timeId)===true;
          if(!hoursVerified&&execCmd.acknowledgeVenueHours!==true) throw new GroupStorageError("VENUE_HOURS_CHECK_REQUIRED","Check the venue’s opening hours before confirming this time.",409);
          next.finalPlan.venueHoursStatus=hoursVerified?"regular_hours_fit":"organizer_checked";
        }
        const result=await repository.compareAndSwap(id,row.revision,next,execCmd.type);
        if(!result.conflict) {
          // Determine the voter's real slot id (matched pre-listed or newly appended) for group-link replies.
          let resolvedSlot = null;
          if (execCmd.type === "join_respond") {
            const lower = String(execCmd.guestName || "").trim().toLowerCase();
            resolvedSlot = result.state.invitees.find((s) => s.id === assignedJoinSlotId)
              || result.state.invitees.find((s) => String(s.name || "").trim().toLowerCase() === lower);
          } else if (execCmd.type === "respond") {
            resolvedSlot = result.state.invitees.find((s) => s.id === execCmd.slotId);
          }
          if (voterPhone && resolvedSlot && smsAvailable && typeof repository.saveSmsOptIn === "function") {
            try {
              await repository.saveSmsOptIn({ planId: result.id, slotKey: resolvedSlot.id, phone: voterPhone, consentAt: nowIso(clock()), consentText: PARTICIPANT_SMS_CONSENT_TEXT });
            } catch {}
          }
          if (row.status === "draft" && result.status === "open") {
            let hydrated = null;
            try { hydrated = await placeData.hydrate([result.state.places[0]?.id].filter(Boolean), result.state.times, clock()); } catch {}
            void fireOrganizerCreatedSms(result, hydrated);
          }
          if (row.status !== "closed" && result.status === "closed") {
            let hydrated = null;
            try { hydrated = await placeData.hydrate([result.state.places[0]?.id].filter(Boolean), result.state.times, clock()); } catch {}
            void fireOrganizerClosedSms(result, hydrated);
          }
          if (result.status === "finalized") {
            void fireFinalizedSms(result, finalPlaceObj);
          }
          if (execCmd.type === "join_respond" && resolvedSlot) {
            const out = await view(result, { role: "participant", slotId: resolvedSlot.id });
            out.slotToken = inviteCapability(result.state, resolvedSlot, result.invite_secret);
            return out;
          }
          return view(result,identity);
        }
        row=await get(id);
      }
      throw new GroupStorageError("PLAN_BUSY","Several replies arrived together. Your response was not confirmed; please retry.",409);
    },
    async suggest(seedId, user) {
      if (!user?.id) throw new GroupStorageError("SIGN_IN_REQUIRED", "Sign in to organize a group.", 401);
      await repository.rateLimit(groupRateKey("suggest", user.id), 30);
      if (typeof placeData.suggest !== "function") throw new GroupStorageError("PLACE_DATA_UNAVAILABLE", "Suggestions are unavailable right now.");
      return placeData.suggest(seedId, clock());
    },
    async santaSuggest(seedId, user) {
      if (!user?.id) throw new GroupStorageError("SIGN_IN_REQUIRED", "Sign in to organize a group.", 401);
      await repository.rateLimit(groupRateKey("santa", user.id), 12);
      if (typeof placeData.suggest !== "function") throw new GroupStorageError("PLACE_DATA_UNAVAILABLE", "Suggestions are unavailable right now.");
      const data = await placeData.suggest(seedId, clock());
      const curated = await santaCurator({ seed: data.seed, places: data.places, experiences: data.experiences, env, fetchImpl });
      return { ...data, santa: curated };
    },
    async searchExperiences(query, near, user) {
      if (!user?.id) throw new GroupStorageError("SIGN_IN_REQUIRED", "Sign in to organize a group.", 401);
      await repository.rateLimit(groupRateKey("search_exp", user.id), 30);
      if (typeof placeData.searchExperiences !== "function") return { experiences: [] };
      return { experiences: await placeData.searchExperiences(query, near, clock()) };
    },
    async deletePlan(planId, user) {
      if (!user?.id) throw new GroupStorageError("SIGN_IN_REQUIRED", "Sign in to manage your group votes.", 401);
      if (!GROUP_PLAN_ID.test(String(planId || ""))) throw new GroupPlanError("INVALID_INPUT", "Choose a valid group vote to delete.");
      await repository.rateLimit(groupRateKey("delete", user.id), 30);
      const deleted = await repository.deletePlan(planId, user.id);
      return { deleted: deleted === true };
    },
    async cleanHistory(scope, user) {
      if (!user?.id) throw new GroupStorageError("SIGN_IN_REQUIRED", "Sign in to manage your group votes.", 401);
      const mode = scope === "all" ? "all" : "finished";
      await repository.rateLimit(groupRateKey("clean", user.id), 10);
      const res = await repository.cleanHistory(user.id, mode);
      return { deletedPlans: Number(res?.deleted_plans || 0), scope: mode };
    },
    async dismissNotice(noticeId, user) {
      if (!user?.id) throw new GroupStorageError("SIGN_IN_REQUIRED", "Sign in to manage your updates.", 401);
      if (!GROUP_PLAN_ID.test(String(noticeId || ""))) throw new GroupPlanError("INVALID_INPUT", "Choose a valid update to dismiss.");
      await repository.rateLimit(groupRateKey("dismiss", user.id), 30);
      const dismissed = await repository.dismissNotice(noticeId, user.id);
      return { dismissed: dismissed === true };
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
    async notices(user) {
      if(!user?.id) return deny();
      const [rawNotices, rawPlans] = await Promise.all([repository.notices(user.id), repository.listOwned(user.id)]);
      const now = clock();
      // Hydrate lead place names so history rows and updates show the real spot name.
      const leadIds = [...new Set((rawPlans || []).map((p) => p?.state?.originalPlaceId || p?.state?.places?.[0]?.id).filter(Boolean))];
      const nameById = new Map();
      if (leadIds.length && typeof placeData.hydrate === "function") {
        try {
          const hydrated = await placeData.hydrate(leadIds, [], now);
          for (const h of hydrated || []) if (h && h.id && h.name && !h.unavailable) nameById.set(h.id, h.name);
        } catch {}
      }
      const titleByPlan = new Map();
      const plans = (rawPlans || []).map((item) => {
        const st = item.state || null;
        const leadId = st?.originalPlaceId || st?.places?.[0]?.id || "";
        const placeCount = Array.isArray(st?.places) ? st.places.length : 0;
        const leadName = nameById.get(leadId) || null;
        const title = leadName ? (placeCount > 1 ? `${leadName} + ${placeCount - 1} more` : leadName) : null;
        if (title) titleByPlan.set(item.id, title);
        const invitees = Array.isArray(st?.invitees) ? st.invitees : [];
        const responseCount = invitees.filter((s) => s && s.response !== null).length;
        const draftExpired = item.status === "draft" && Number.isFinite(Date.parse(item.deadline)) && Date.parse(item.deadline) <= now;
        const out = { id: item.id, status: item.status, deadline: item.deadline };
        if (item.created_at !== undefined) out.created_at = item.created_at;
        if (item.updated_at !== undefined) out.updated_at = item.updated_at;
        if (title) out.title = title;
        if (st) { out.placeCount = placeCount; out.responseCount = responseCount; out.expectedCount = invitees.length; out.draftExpired = draftExpired; }
        return out;
      });
      const notices = (rawNotices || []).map((n) => (titleByPlan.has(n.plan_id) ? { ...n, planTitle: titleByPlan.get(n.plan_id) } : n));
      return { notices, plans, smsAvailable };
    },
  };
}
