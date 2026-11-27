// In-memory stand-in for the parts of Supabase that Wayfind Live Trips uses:
// Auth's /auth/v1/user, PostgREST on wf_live_trips / wf_live_trip_members, the
// wf_live_trip_commit RPC (compare-and-swap + same-transaction broadcast) and
// the Realtime REST broadcast. Used by scripts/test-live-trip-route.mjs and
// scripts/test-live-trip-e2e.mjs. No network.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { applyOps, formatHlc } from "../../lib/liveTrip.js";

export function createFakeSupabase({ serviceKey, onBroadcast = () => {}, onCheck = () => {} }) {
  const users = new Map(); // token -> user json
  const db = { trips: [], members: [], commits: 0, broadcasts: [], rest: [], raceOnce: false };

  const parse = (qs) => {
    const filters = [];
    for (const part of qs.split("&").filter(Boolean)) {
      const i = part.indexOf("=");
      const k = decodeURIComponent(part.slice(0, i));
      const v = decodeURIComponent(part.slice(i + 1));
      if (k === "select" || k === "limit" || k === "order") continue;
      const m = v.match(/^(eq|neq|in)\.(.*)$/);
      if (m) filters.push([k, m[1], m[2]]);
    }
    return filters;
  };
  const match = (row, filters) => filters.every(([k, op, v]) => {
    const val = String(row[k]);
    if (op === "eq") return val === v;
    if (op === "neq") return val !== v;
    if (op === "in") return v.replace(/^\(|\)$/g, "").split(",").includes(val);
    return false;
  });
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? "" : JSON.stringify(body)), json: async () => body });
  const emit = (msg) => { db.broadcasts.push(msg); onBroadcast(msg); };

  async function fetchImpl(url, init = {}) {
    const u = new URL(url);
    const method = init.method || "GET";
    const headers = init.headers || {};
    if (u.pathname === "/auth/v1/user") {
      const tok = String(headers.Authorization || "").replace(/^Bearer /, "");
      return users.has(tok) ? json(200, users.get(tok)) : json(401, { msg: "bad jwt" });
    }
    if (u.pathname === "/realtime/v1/api/broadcast") {
      const b = JSON.parse(init.body);
      for (const m of b.messages || []) emit({ topic: m.topic, event: m.event, payload: m.payload, private: m.private });
      return json(202, {});
    }
    assert.equal(headers.apikey, serviceKey, "every PostgREST call uses the service role");
    const table = u.pathname.replace("/rest/v1/", "");
    const filters = parse(u.search.slice(1));
    db.rest.push(method + " " + table);
    if (table === "rpc/wf_live_trip_commit") {
      const b = JSON.parse(init.body);
      const row = db.trips.find((t) => t.id === b.p_id);
      if (!row) return json(200, { error: "not_found" });
      if (row.status !== "live") return json(200, { error: "ended" });
      if (db.raceOnce) {
        db.raceOnce = false;
        const theirs = { id: "op-race-other-1", hlc: formatHlc(Date.now() - 1000, 0, "zzz"), type: "set", itemId: "a", field: "visited", value: true, by: row.owner_id };
        row.state = applyOps(row.state, [theirs]).state; row.revision += 1; row.recent_op_ids.push(theirs.id);
      }
      if (row.revision !== b.p_expected_revision) return json(200, { error: "conflict", revision: row.revision });
      row.state = JSON.parse(JSON.stringify(b.p_state));
      row.revision += 1;
      row.recent_op_ids = row.recent_op_ids.concat(b.p_op_ids).slice(-500);
      db.commits += 1;
      emit({ topic: "live-trip:" + row.id, event: "ops", payload: { ...b.p_payload, revision: row.revision }, private: true });
      return json(200, { revision: row.revision });
    }
    const rows = table === "wf_live_trips" ? db.trips : table === "wf_live_trip_members" ? db.members : null;
    assert.ok(rows, "unexpected table " + table);
    if (method === "GET") return json(200, JSON.parse(JSON.stringify(rows.filter((r) => match(r, filters)))));
    if (method === "POST") {
      const b = JSON.parse(init.body);
      if (table === "wf_live_trips") {
        onCheck(/^[0-9a-f]{64}$/.test(b.invite_secret) && !("invite_code" in b), "only a random secret is stored, never the invite code");
        const row = { id: randomUUID(), status: "live", recent_op_ids: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...b };
        rows.push(row);
        return json(201, [{ id: row.id }]);
      }
      if (rows.some((r) => r.trip_id === b.trip_id && r.user_id === b.user_id)) return json(201, undefined);
      rows.push({ ...b, joined_at: new Date().toISOString() });
      return json(201, undefined);
    }
    if (method === "PATCH") { for (const r of rows.filter((r) => match(r, filters))) Object.assign(r, JSON.parse(init.body)); return json(204, undefined); }
    if (method === "DELETE") { for (let i = rows.length - 1; i >= 0; i -= 1) if (match(rows[i], filters)) rows.splice(i, 1); return json(204, undefined); }
    return json(405, {});
  }

  return { users, db, fetchImpl };
}
