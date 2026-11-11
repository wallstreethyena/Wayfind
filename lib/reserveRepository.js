// lib/reserveRepository.js - service role persistence for "Reserve a table".
// Mirrors lib/groupPlanRepository.js: config injected, fetch injected for tests.
// Service role only. Callers must verify the user or the respond token first.
// Missing configuration fails loudly with a named error (AGENTS.md section 5).

export class ReserveStorageError extends Error {
  constructor(code, message, status = 503) { super(message); this.code = code; this.status = status; }
}

export function reserveConfiguration(env = process.env) {
  const url = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!/^https:\/\/[^\s/]+$/.test(url) || !key) {
    throw new ReserveStorageError("RESERVE_STORAGE_UNCONFIGURED", "Table requests are unavailable right now.");
  }
  return { url, key };
}

const q = encodeURIComponent;
const UUID = /^[0-9a-f-]{36}$/i;
const need = (cond, what) => { if (!cond) throw new ReserveStorageError("RESERVE_BAD_ARGUMENT", `Invalid ${what}.`, 400); };

export function createReserveRepository(config, fetchImpl = fetch) {
  if (!config || !config.url || !config.key) throw new ReserveStorageError("RESERVE_STORAGE_UNCONFIGURED", "Table requests are unavailable right now.");
  const headers = { apikey: config.key, authorization: `Bearer ${config.key}`, "content-type": "application/json" };
  const call = async (resource, init = {}) => {
    let response;
    try { response = await fetchImpl(`${config.url}/rest/v1/${resource}`, { ...init, headers: { ...headers, ...init.headers }, cache: "no-store", signal: AbortSignal.timeout(8000) }); }
    catch { throw new ReserveStorageError("RESERVE_STORAGE_UNAVAILABLE", "We could not reach the reservation service. Please retry."); }
    if (!response.ok) throw new ReserveStorageError("RESERVE_STORAGE_UNAVAILABLE", "We could not save your request. Please retry.");
    return response.status === 204 ? null : response.json();
  };
  const first = async (resource) => (await call(resource))?.[0] || null;
  const flatten = (row) => {
    if (!row) return null;
    const { wf_reserve_partners: partner, ...rest } = row;
    return { ...rest, restaurant_name: partner?.name ?? null };
  };
  return {
    /** Active partners in the given stages. No contact email is selected. */
    async listVisiblePartners(stages = ["live"]) {
      need(Array.isArray(stages) && stages.length && stages.every((s) => s === "live" || s === "demo"), "stages");
      return (await call(`wf_reserve_partners?active=eq.true&stage=in.(${stages.join(",")})&select=place_id,name,stage,active,max_party&order=name.asc&limit=500`)) || [];
    },
    async getPartner(placeId) {
      need(typeof placeId === "string" && placeId.length > 0, "place");
      return first(`wf_reserve_partners?place_id=eq.${q(placeId)}&select=*&limit=1`);
    },
    async insertRequest(row) {
      const out = await call("wf_reserve_requests", { method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify(row) });
      if (!out?.[0]) throw new ReserveStorageError("RESERVE_STORAGE_UNAVAILABLE", "We could not save your request. Please retry.");
      return out[0];
    },
    /** Pending, not yet expired requests for one user (capped at 4 rows; callers compare to 3). */
    async countUserPending(userId, nowIso) {
      need(UUID.test(userId), "user");
      return ((await call(`wf_reserve_requests?user_id=eq.${q(userId)}&status=eq.pending&expires_at=gt.${q(nowIso)}&select=id&limit=4`)) || []).length;
    },
    async findUserPendingForPlaceDate(userId, placeId, date, nowIso) {
      need(UUID.test(userId), "user");
      return first(`wf_reserve_requests?user_id=eq.${q(userId)}&place_id=eq.${q(placeId)}&reserve_date=eq.${q(date)}&status=eq.pending&expires_at=gt.${q(nowIso)}&select=id&limit=1`);
    },
    async getRequestByTokenHash(hash) {
      need(/^[a-f0-9]{64}$/.test(hash), "token");
      return flatten(await first(`wf_reserve_requests?respond_token_hash=eq.${hash}&select=*,wf_reserve_partners(name)&limit=1`));
    },
    async getRequestById(id) {
      need(UUID.test(id), "request");
      return flatten(await first(`wf_reserve_requests?id=eq.${q(id)}&select=*,wf_reserve_partners(name)&limit=1`));
    },
    /**
     * One conditional UPDATE: only a row that is still pending and not expired
     * changes. Returns { changed, row } where row is the resulting row either way.
     */
    async respondOnce(id, status, nowIso) {
      need(UUID.test(id), "request");
      need(status === "confirmed" || status === "declined", "status");
      const updated = await call(`wf_reserve_requests?id=eq.${q(id)}&status=eq.pending&expires_at=gt.${q(nowIso)}&select=*,wf_reserve_partners(name)`, { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({ status, responded_at: nowIso }) });
      if (updated?.[0]) return { changed: true, row: flatten(updated[0]) };
      return { changed: false, row: await this.getRequestById(id) };
    },
    async listUserRequests(userId, placeId, limit = 5) {
      need(UUID.test(userId), "user");
      return (await call(`wf_reserve_requests?user_id=eq.${q(userId)}&place_id=eq.${q(placeId)}&select=id,status,party_size,reserve_date,reserve_time,created_at,responded_at,expires_at&order=created_at.desc&limit=${Math.min(5, Math.max(1, limit | 0))}`)) || [];
    },
  };
}
