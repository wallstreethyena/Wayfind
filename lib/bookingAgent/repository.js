// PostgREST persistence for the booking agent. Service role only. Callers verified the guest first.
// Missing configuration throws. A missing table is an error here (the routes are dark until the switches are on).

import { ReserveStorageError } from "../reserveRepository.js";

const q = encodeURIComponent;

export function createBookingAgentStore(config, fetchImpl = fetch) {
  if (!config || !config.url || !config.key) throw new ReserveStorageError("RESERVE_STORAGE_UNCONFIGURED", "Booking help is unavailable right now.");
  const headers = { apikey: config.key, authorization: `Bearer ${config.key}`, "content-type": "application/json" };
  const call = async (resource, init = {}) => {
    let response;
    try {
      response = await fetchImpl(`${config.url}/rest/v1/${resource}`, { ...init, headers: { ...headers, ...init.headers }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    } catch {
      throw new ReserveStorageError("RESERVE_STORAGE_UNAVAILABLE", "We could not reach the reservation service. Please retry.");
    }
    if (response.status === 409) {
      const err = new Error("duplicate");
      err.code = "DUPLICATE";
      throw err;
    }
    if (!response.ok) throw new ReserveStorageError("RESERVE_STORAGE_UNAVAILABLE", "We could not complete that. Please retry.");
    return response.status === 204 ? null : response.json();
  };
  const RUN = "id,user_id,place_id,site,external_id,date,time,party,idempotency_key,status,reason,consent_version,consent_at,confirmation_number,parsed_summary,selector_map_version,sms_consent,sms_code,created_at,updated_at";
  return {
    async getSite(site) {
      if (site !== "opentable") return null;
      const rows = await call("wf_booking_agent_sites?site=eq.opentable&select=site,status,paused_until,last_challenge_at,challenge_count_7d&limit=1");
      return rows && rows[0] ? rows[0] : null;
    },
    async saveSite(site, patch) {
      if (site !== "opentable") throw new ReserveStorageError("RESERVE_BAD_ARGUMENT", "Invalid site.", 400);
      const body = {};
      for (const k of ["status", "paused_until", "last_challenge_at", "challenge_count_7d"]) if (patch[k] !== undefined) body[k] = patch[k];
      const rows = await call(`wf_booking_agent_sites?site=eq.${q(site)}&select=site,status,paused_until,last_challenge_at,challenge_count_7d`, {
        method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify(body),
      });
      return rows && rows[0] ? rows[0] : null;
    },
    async insertRun(row) {
      const rows = await call(`wf_booking_agent_runs?select=${RUN}`, {
        method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify(row),
      });
      return rows && rows[0] ? rows[0] : null;
    },
    async getRun(id) {
      const rows = await call(`wf_booking_agent_runs?id=eq.${q(id)}&select=${RUN}&limit=1`);
      return rows && rows[0] ? rows[0] : null;
    },
    async getRunByKey(key) {
      const rows = await call(`wf_booking_agent_runs?idempotency_key=eq.${q(key)}&select=${RUN}&limit=1`);
      return rows && rows[0] ? rows[0] : null;
    },
    async updateRun(id, patch, { expect } = {}) {
      const body = {};
      for (const k of ["status", "reason", "confirmation_number", "parsed_summary", "selector_map_version", "sms_code"]) if (patch[k] !== undefined) body[k] = patch[k];
      body.updated_at = new Date().toISOString();
      const filter = expect ? `id=eq.${q(id)}&status=eq.${q(expect)}` : `id=eq.${q(id)}`;
      const rows = await call(`wf_booking_agent_runs?${filter}&select=${RUN}`, {
        method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify(body),
      });
      return rows && rows[0] ? rows[0] : null;
    },
    async oldestQueued(site) {
      const rows = await call(`wf_booking_agent_runs?site=eq.${q(site)}&status=eq.queued&select=${RUN}&order=created_at.asc&limit=1`);
      return rows && rows[0] ? rows[0] : null;
    },
    async countInProgress(site) {
      const rows = await call(`wf_booking_agent_runs?site=eq.${q(site)}&status=in.(opening,selecting_slot,form_ready,filling,review,submitting,awaiting_sms_code)&select=id&limit=5`);
      return Array.isArray(rows) ? rows.length : 0;
    },
    async countStartedSince(site, iso) {
      const rows = await call(`wf_booking_agent_runs?site=eq.${q(site)}&created_at=gte.${q(iso)}&select=id,status&limit=50`);
      const skip = new Set(["queued", "refused_flag_off", "refused_kill_switch", "cancelled_by_user"]);
      return (rows || []).filter((r) => !skip.has(r.status)).length;
    },
    async listRunsForUser(userId) {
      const rows = await call(`wf_booking_agent_runs?user_id=eq.${q(userId)}&select=${RUN}&order=created_at.desc&limit=20`);
      return rows || [];
    },
    async addEvent(runId, ev) {
      const prior = await call(`wf_booking_agent_events?run_id=eq.${q(runId)}&select=seq&order=seq.desc&limit=1`);
      const seq = prior && prior[0] ? prior[0].seq + 1 : 1;
      const rows = await call("wf_booking_agent_events?select=run_id,seq,step,outcome,url_path,http_status,ms,created_at", {
        method: "POST", headers: { prefer: "return=representation" },
        body: JSON.stringify({ run_id: runId, seq, step: ev.step, outcome: ev.outcome, url_path: ev.url_path, http_status: ev.http_status, ms: ev.ms }),
      });
      return rows && rows[0] ? rows[0] : null;
    },
    async listEvents(runId) {
      const rows = await call(`wf_booking_agent_events?run_id=eq.${q(runId)}&select=run_id,seq,step,outcome,url_path,http_status,ms,created_at&order=seq.asc`);
      return rows || [];
    },
    async claimSms({ runId }) {
      try {
        await this.addEvent(runId, { step: "sms_intent", outcome: "claimed", url_path: null, http_status: null, ms: 0 });
        return { claimed: true, id: runId, status: "queued", attempts: 0, created_at: new Date().toISOString(), recipient: null };
      } catch (error) {
        if (error && error.code === "DUPLICATE") return { claimed: false, id: runId, status: "unknown", attempts: 1, created_at: new Date().toISOString(), recipient: null };
        throw error;
      }
    },
    async markSms() {
      return true;
    },
  };
}
