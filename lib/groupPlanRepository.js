import { groupEmailReady } from "./groupPlanEmail.js";
// Service-role-only persistence. Public API code must verify actor ownership/capability first.
export class GroupStorageError extends Error {
  constructor(code, message, status = 503) { super(message); this.code = code; this.status = status; }
}
export function groupPlanConfiguration(env = process.env) {
  if (env.NEXT_PUBLIC_GROUP_PLANS_ENABLED !== "1" || env.WF_GROUP_PLANS_ENABLED !== "1") {
    throw new GroupStorageError("GROUP_PLANS_DISABLED", "Group planning is not available yet.");
  }
  if (env.WF_GROUP_PLAN_DEADLINE_WORKER_READY !== "1") {
    throw new GroupStorageError("DEADLINE_WORKER_UNVERIFIED", "Group planning is waiting for its deadline service.");
  }
  return groupStorageConfiguration(env);
}
// Authenticated scheduler bootstrap is deliberately independent of public
// rollout/readiness. The cron route verifies CRON_SECRET before using this.
export function groupWorkerConfiguration(env = process.env) {
  if (env.WF_GROUP_PLAN_WORKER_ENABLED !== "1") {
    throw new GroupStorageError("GROUP_WORKER_DISABLED", "The group deadline service is not enabled.");
  }
  return groupStorageConfiguration(env);
}
function groupStorageConfiguration(env) {
  const url = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!/^https:\/\/[^\s/]+$/.test(url) || !key) throw new GroupStorageError("GROUP_STORAGE_UNCONFIGURED", "Group planning storage is unavailable.");
  return { url, key, emailAvailable: groupEmailReady(env) };
}

export function createGroupPlanRepository(config, fetchImpl = fetch) {
  const headers = { apikey: config.key, authorization: `Bearer ${config.key}`, "content-type": "application/json" };
  const read = async (resource, init = {}) => {
    let response;
    try { response = await fetchImpl(`${config.url}/rest/v1/${resource}`, { ...init, headers: { ...headers, ...init.headers }, cache: "no-store", signal: AbortSignal.timeout(8000) }); }
    catch { throw new GroupStorageError("GROUP_STORAGE_UNAVAILABLE", "Your plan could not be loaded. Please retry."); }
    if (!response.ok) throw new GroupStorageError("GROUP_STORAGE_UNAVAILABLE", "Your plan could not be saved. Please retry.");
    return response.status === 204 ? null : response.json();
  };
  const rpc = (name, body) => read(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
  return {
    async get(id) { return (await read(`wf_group_plans?id=eq.${encodeURIComponent(id)}&select=*&limit=1`))?.[0] || null; },
    async findCreated(ownerId,createKey) { return (await read(`wf_group_plans?owner_id=eq.${encodeURIComponent(ownerId)}&create_key=eq.${encodeURIComponent(createKey)}&select=*&limit=1`))?.[0] || null; },
    async create({ state, secret, createKey, emailConsent }) {
      const result = await rpc("wf_group_plan_create", { p_state: state, p_invite_secret: secret, p_create_key: createKey, p_email_consent: emailConsent === true });
      if (result?.error === "rate_limited") throw new GroupStorageError("RATE_LIMITED", "You have created several plans recently. Please try again later.", 429);
      if (result?.error) throw new GroupStorageError("GROUP_CREATE_REJECTED", "That plan could not be created. Review it and try again.", 409);
      return result;
    },
    async compareAndSwap(id, revision, state, operation) {
      const result = await rpc("wf_group_plan_commit", { p_id: id, p_expected_revision: revision, p_state: state, p_operation: operation });
      if (result?.error === "conflict" || result?.error === "deadline") return { conflict: true };
      if (result?.error) throw new GroupStorageError("GROUP_SAVE_REJECTED", "This plan changed. Reload it before trying again.", 409);
      return result;
    },
    async rateLimit(key, limit = 60) {
      const result = await rpc("wf_group_plan_rate_limit", { p_key: key, p_limit: limit });
      if (result !== true) throw new GroupStorageError("RATE_LIMITED", "Please wait a moment before trying again.", 429);
    },
    async notices(ownerId) {
      return read(`wf_group_plan_notices?owner_id=eq.${encodeURIComponent(ownerId)}&select=id,plan_id,event_type,created_at,read_at,email_status,attempts,next_attempt_at&order=created_at.desc&limit=30`);
    },
    async listOwned(ownerId) {
      return read(`wf_group_plans?owner_id=eq.${encodeURIComponent(ownerId)}&select=id,status,deadline,created_at,updated_at,state&order=updated_at.desc&limit=30`);
    },
    async deletePlan(id, ownerId) {
      return rpc("wf_group_plan_delete", { p_id: id, p_owner_id: ownerId });
    },
    async cleanHistory(ownerId, scope = "finished") {
      return rpc("wf_group_plan_clean_history", { p_owner_id: ownerId, p_scope: scope });
    },
    async dismissNotice(noticeId, ownerId) {
      return rpc("wf_group_plan_dismiss_notice", { p_notice_id: noticeId, p_owner_id: ownerId });
    },
    // Owner-only SMS subscriber list (service role; RLS blocks every client).
    // One row per phone, plus an append-only consent log as proof of consent.
    async saveSmsSubscriber({ phone, firstName, consentText, consentVersion, consentAt, source, sourceRef, ip, userAgent }) {
      const proof = { phone, first_name: firstName || null, consent_text: consentText, consent_version: consentVersion, consent_at: consentAt, source, source_ref: sourceRef || null, ip: ip || null, user_agent: userAgent || null };
      await read("wf_sms_subscribers?on_conflict=phone", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ ...proof, status: "subscribed", unsubscribed_at: null, unsubscribe_source: null, updated_at: consentAt }),
      });
      await read("wf_sms_consent_log", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ ...proof, action: "opt_in" }),
      });
    },
    async markSmsUnsubscribed({ phone, at, source }) {
      await read(`wf_sms_subscribers?phone=eq.${encodeURIComponent(phone)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "unsubscribed", unsubscribed_at: at, unsubscribe_source: source, updated_at: at }),
      });
      await read("wf_sms_consent_log", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ phone, action: "opt_out", consent_at: at, source }) });
    },
    async logSmsHelp({ phone, at, source }) {
      await read("wf_sms_consent_log", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ phone, action: "help", consent_at: at, source }) });
    },
    async saveSmsOptIn({ planId, slotKey, phone, consentAt, consentText }) {
      return read("wf_group_plan_sms_optins?on_conflict=plan_id,slot_key", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ plan_id: planId, slot_key: slotKey, phone, consent_at: consentAt, consent_text: consentText }),
      });
    },
    async listSmsOptIns(planId) {
      return read(`wf_group_plan_sms_optins?plan_id=eq.${encodeURIComponent(planId)}&select=plan_id,slot_key,phone,consent_at,consent_text`);
    },
    async claimSms({ planId, slotKey, kind, recipient, consentAt, consentText }) {
      const inserted = await read("wf_group_plan_sms?on_conflict=plan_id,slot_key,kind", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify({ plan_id: planId, slot_key: slotKey, kind, recipient, consent_at: consentAt, consent_text: consentText, status: "queued" }),
      });
      if (Array.isArray(inserted) && inserted[0]) return { ...inserted[0], claimed: true };
      const existing = await read(`wf_group_plan_sms?plan_id=eq.${encodeURIComponent(planId)}&slot_key=eq.${encodeURIComponent(slotKey)}&kind=eq.${encodeURIComponent(kind)}&limit=1`);
      return existing?.[0] ? { ...existing[0], claimed: false } : null;
    },
    async markSms(id, patch, nowIso) {
      return read(`wf_group_plan_sms?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ ...patch, updated_at: nowIso }),
      });
    },
    async smsByProviderId(provider, sid) {
      const rows = await read(`wf_group_plan_sms?provider=eq.${encodeURIComponent(provider)}&provider_message_id=eq.${encodeURIComponent(sid)}&limit=1`);
      return rows?.[0] || null;
    },
    async due(limit = 50) {
      return read(`wf_group_plans?status=eq.open&deadline=lte.${encodeURIComponent(new Date().toISOString())}&select=id&order=deadline.asc&limit=${Math.min(50, limit)}`);
    },
    async claimNotice(claim) { return rpc("wf_group_plan_claim_notice",{p_claim_token:claim}); },
    async finishNotice(id,claim,status,error) { return rpc("wf_group_plan_finish_notice",{p_id:id,p_claim_token:claim,p_status:status,p_error_code:error}); },
    async cleanup() { return rpc("wf_group_plan_cleanup",{}); },
  };
}

export async function verifiedGroupOrganizer(req, config, fetchImpl = fetch) {
  const authorization = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S{20,}$/i.test(authorization)) throw new GroupStorageError("SIGN_IN_REQUIRED", "Sign in to organize a group.", 401);
  let response;
  try { response = await fetchImpl(`${config.url}/auth/v1/user`, { cache: "no-store", signal: AbortSignal.timeout(5000), headers: { apikey: config.key, authorization } }); }
  catch { throw new GroupStorageError("AUTH_UNAVAILABLE", "We could not check your sign-in. Please retry."); }
  if (!response.ok) throw new GroupStorageError("SIGN_IN_REQUIRED", "Your sign-in expired. Please sign in again.", 401);
  const user = await response.json();
  if (!/^[0-9a-f-]{36}$/i.test(user?.id || "") || user.is_anonymous === true) throw new GroupStorageError("SIGN_IN_REQUIRED", "Sign in to organize a group.", 401);
  // Email comes only from this verified account, never from the request body.
  return { id: user.id, hasVerifiedEmail: Boolean(user.email && user.email_confirmed_at) };
}
