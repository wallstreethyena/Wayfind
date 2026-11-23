// In-memory store with the same shape the PostgREST store exposes. Tests use this. Nothing is shared across processes.

import { randomUUID } from "node:crypto";
import { assertTransition } from "./stateMachine.js";

const IN_PROGRESS = new Set(["opening", "selecting_slot", "form_ready", "filling", "review", "submitting", "awaiting_sms_code", "awaiting_user_action"]);
const NOT_STARTED = new Set(["queued", "refused_flag_off", "refused_kill_switch", "cancelled_by_user"]);

export function createMemoryStore(seed = {}) {
  const sites = new Map([["opentable", {
    site: "opentable",
    status: seed.status || "off",
    paused_until: seed.paused_until || null,
    last_challenge_at: seed.last_challenge_at || null,
    challenge_count_7d: seed.challenge_count_7d || 0,
  }]]);
  const runs = [];
  const events = [];
  const sms = new Map();

  return {
    runs,
    events,
    async getSite(site) {
      const row = sites.get(site);
      return row ? { ...row } : null;
    },
    async saveSite(site, patch) {
      const cur = sites.get(site) || { site, status: "off", paused_until: null, last_challenge_at: null, challenge_count_7d: 0 };
      const next = { ...cur, ...patch, site };
      sites.set(site, next);
      return { ...next };
    },
    async insertRun(row) {
      if (runs.some((r) => r.idempotency_key === row.idempotency_key)) {
        const err = new Error("duplicate");
        err.code = "DUPLICATE";
        throw err;
      }
      const now = new Date().toISOString();
      const saved = {
        confirmation_number: null, parsed_summary: null, reason: null, sms_consent: false,
        sms_code: null, sms_code_attempts: 0, sms_code_expires_at: null, live_view_url: null,
        ...row,
        id: row.id || randomUUID(),
        status: row.status || "queued",
        created_at: row.created_at || now,
        updated_at: now,
      };
      runs.push(saved);
      return { ...saved };
    },
    async getRun(id) {
      const row = runs.find((r) => r.id === id);
      return row ? { ...row } : null;
    },
    async getRunByKey(key) {
      const row = runs.find((r) => r.idempotency_key === key);
      return row ? { ...row } : null;
    },
    async updateRun(id, patch, { expect } = {}) {
      const row = runs.find((r) => r.id === id);
      if (!row) return null;
      if (expect && row.status !== expect) return null;
      if (row.status === "queued" && patch.status === "opening") {
        if (runs.some((r) => r.id !== row.id && r.site === row.site && IN_PROGRESS.has(r.status))) return null;
      }
      if (patch.status && patch.status !== row.status) assertTransition(row.status, patch.status);
      Object.assign(row, patch, { updated_at: new Date().toISOString() });
      return { ...row };
    },
    async oldestQueued(site) {
      const rows = runs.filter((r) => r.site === site && r.status === "queued").sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      return rows[0] ? { ...rows[0] } : null;
    },
    async countInProgress(site) {
      return runs.filter((r) => r.site === site && IN_PROGRESS.has(r.status)).length;
    },
    async countStartedSince(site, iso) {
      return runs.filter((r) => r.site === site && r.created_at >= iso && !NOT_STARTED.has(r.status)).length;
    },
    async listRunsForUser(userId) {
      return runs.filter((r) => r.user_id === userId).map((r) => ({ ...r }));
    },
    async addEvent(runId, ev) {
      const seq = events.filter((e) => e.run_id === runId).length + 1;
      const row = {
        run_id: runId, seq, step: ev.step, outcome: ev.outcome ?? null,
        url_path: ev.url_path ?? null, http_status: ev.http_status ?? null, ms: ev.ms ?? null,
        created_at: new Date().toISOString(),
      };
      events.push(row);
      return { ...row };
    },
    async listEvents(runId) {
      return events.filter((e) => e.run_id === runId).map((e) => ({ ...e }));
    },
    async claimSms({ runId, recipient }) {
      const existing = sms.get(runId);
      if (existing) return { claimed: false, ...existing };
      const row = { id: randomUUID(), status: "queued", attempts: 0, created_at: new Date().toISOString(), recipient, provider_message_id: null };
      sms.set(runId, row);
      await this.addEvent(runId, { step: "sms_intent", outcome: "claimed", url_path: null, http_status: null, ms: 0 });
      return { claimed: true, ...row };
    },
    async markSms(id, patch) {
      for (const row of sms.values()) {
        if (row.id !== id) continue;
        if (patch.status) row.status = patch.status;
        if (patch.attempts != null) row.attempts = patch.attempts;
        if (patch.provider_message_id) row.provider_message_id = patch.provider_message_id;
        return true;
      }
      return false;
    },
  };
}
