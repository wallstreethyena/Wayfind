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
      return read(`wf_group_plans?owner_id=eq.${encodeURIComponent(ownerId)}&select=id,status,deadline,created_at,updated_at&order=updated_at.desc&limit=30`);
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
