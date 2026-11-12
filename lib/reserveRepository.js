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
    throw new ReserveStorageError("RESERVE_STORAGE_UNCONFIGURED", "Table booking is unavailable right now.");
  }
  return { url, key };
}

const q = encodeURIComponent;
const UUID = /^[0-9a-f-]{36}$/i;
const need = (cond, what) => { if (!cond) throw new ReserveStorageError("RESERVE_BAD_ARGUMENT", `Invalid ${what}.`, 400); };

export function createReserveRepository(config, fetchImpl = fetch) {
  if (!config || !config.url || !config.key) throw new ReserveStorageError("RESERVE_STORAGE_UNCONFIGURED", "Table booking is unavailable right now.");
  const headers = { apikey: config.key, authorization: `Bearer ${config.key}`, "content-type": "application/json" };
  const call = async (resource, init = {}) => {
    let response;
    try { response = await fetchImpl(`${config.url}/rest/v1/${resource}`, { ...init, headers: { ...headers, ...init.headers }, cache: "no-store", signal: AbortSignal.timeout(8000) }); }
    catch { throw new ReserveStorageError("RESERVE_STORAGE_UNAVAILABLE", "We could not reach the reservation service. Please retry."); }
    if (!response.ok) throw new ReserveStorageError("RESERVE_STORAGE_UNAVAILABLE", "We could not complete that. Please retry.");
    return response.status === 204 ? null : response.json();
  };
  const first = async (resource) => (await call(resource))?.[0] || null;
  // Database functions (wf_reserve_*). A failed call is a thrown storage error, never a pretend answer.
  const rpc = async (fn, args) => {
    const out = await call(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
    return out;
  };
  const verdict = (out) => {
    if (!out || typeof out !== "object" || typeof out.ok !== "boolean") throw new ReserveStorageError("RESERVE_STORAGE_UNAVAILABLE", "We could not reach the reservation service. Please retry.");
    return out;
  };
  const PARTNER_COLUMNS = "place_id,name,contact_email,phone,stage,active,timezone,max_party,capacity_covers,seating_minutes,lead_minutes,window_days";
  return {
    /** Active partners in the given stages. No contact email is selected. */
    async listVisiblePartners(stages = ["live"]) {
      need(Array.isArray(stages) && stages.length && stages.every((s) => s === "live" || s === "demo"), "stages");
      return (await call(`wf_reserve_partners?active=eq.true&stage=in.(${stages.join(",")})&select=place_id,name,stage,active,max_party&order=name.asc&limit=500`)) || [];
    },
    async getPartner(placeId) {
      need(typeof placeId === "string" && placeId.length > 0, "place");
      return first(`wf_reserve_partners?place_id=eq.${q(placeId)}&select=${PARTNER_COLUMNS}&limit=1`);
    },
    /** The restaurant dashboard lookup. Returns the stored hash so the caller can compare it in constant time. */
    async getPartnerByManageHash(hash) {
      need(/^[a-f0-9]{64}$/.test(hash), "token");
      return first(`wf_reserve_partners?manage_token_hash=eq.${hash}&active=eq.true&select=${PARTNER_COLUMNS},manage_token_hash&limit=1`);
    },
    /** Open start times as ["18:00", ...] for a day and party size. exclude ignores one booking's own seats. */
    async slots(placeId, date, party, exclude = null) {
      need(typeof placeId === "string" && placeId.length > 0, "place");
      need(/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isInteger(party), "slot query");
      const args = { p_place_id: placeId, p_date: date, p_party: party };
      if (exclude) { need(UUID.test(exclude), "booking"); args.p_exclude = exclude; }
      const rows = await rpc("wf_reserve_slots", args);
      if (!Array.isArray(rows)) throw new ReserveStorageError("RESERVE_STORAGE_UNAVAILABLE", "We could not reach the reservation service. Please retry.");
      return rows.map((r) => String(r && r.slot).slice(0, 5)).filter((t) => /^\d{2}:\d{2}$/.test(t));
    },
    /** Book a table. Returns { ok:true, booking } or { ok:false, code }. Throws when the database cannot be reached. */
    async book(a) {
      need(UUID.test(a.userId) && UUID.test(a.idempotencyKey), "booking");
      return verdict(await rpc("wf_reserve_book", {
        p_place_id: a.placeId, p_user_id: a.userId, p_date: a.date, p_time: a.time, p_party: a.partySize, p_name: a.guestName,
        p_note: a.note ?? null, p_phone: a.phone ?? null, p_consent: a.phoneConsent === true, p_idem: a.idempotencyKey,
      }));
    },
    async cancel({ bookingId, actor, userId = null, placeId = null, reason = null }) {
      need(UUID.test(bookingId) && (actor === "guest" || actor === "restaurant"), "cancel");
      return verdict(await rpc("wf_reserve_cancel", { p_booking_id: bookingId, p_actor: actor, p_user_id: userId, p_place_id: placeId, p_reason: reason }));
    },
    async propose({ bookingId, placeId, date, time }) {
      need(UUID.test(bookingId), "booking");
      return verdict(await rpc("wf_reserve_propose", { p_booking_id: bookingId, p_place_id: placeId, p_date: date, p_time: time }));
    },
    async respondProposal({ bookingId, userId, accept }) {
      need(UUID.test(bookingId) && UUID.test(userId) && typeof accept === "boolean", "answer");
      return verdict(await rpc("wf_reserve_respond_proposal", { p_booking_id: bookingId, p_user_id: userId, p_accept: accept }));
    },
    async listUserBookings(userId, placeId, limit = 5) {
      need(UUID.test(userId), "user");
      return (await call(`wf_reserve_bookings?user_id=eq.${q(userId)}&place_id=eq.${q(placeId)}&select=id,confirmation_code,status,party_size,reserve_date,reserve_time,proposed_date,proposed_time,created_at,wf_reserve_partners(name,phone)&order=created_at.desc&limit=${Math.min(5, Math.max(1, limit | 0))}`)) || [];
    },
    /** Upcoming confirmed and proposed bookings for one restaurant, soonest first. */
    async listPartnerBookings(placeId, fromDate, limit = 200) {
      need(typeof placeId === "string" && placeId.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(fromDate), "bookings query");
      return (await call(`wf_reserve_bookings?place_id=eq.${q(placeId)}&status=in.(confirmed,proposed)&reserve_date=gte.${fromDate}&select=id,confirmation_code,status,guest_name,party_size,reserve_date,reserve_time,note,guest_phone,phone_consent_at,proposed_date,proposed_time&order=reserve_date.asc,reserve_time.asc&limit=${Math.min(500, Math.max(1, limit | 0))}`)) || [];
    },
    /** Confirmed bookings that have not had a reminder, on or between two days. */
    async listReminderCandidates(fromDate, toDate, limit = 200) {
      need(/^\d{4}-\d{2}-\d{2}$/.test(fromDate) && /^\d{4}-\d{2}-\d{2}$/.test(toDate), "reminder query");
      return (await call(`wf_reserve_bookings?status=eq.confirmed&reminder_sent_at=is.null&reserve_date=gte.${fromDate}&reserve_date=lte.${toDate}&select=id,confirmation_code,user_id,place_id,guest_name,party_size,reserve_date,reserve_time,created_at,wf_reserve_partners(name,phone,stage,timezone)&order=reserve_date.asc,reserve_time.asc&limit=${Math.min(500, Math.max(1, limit | 0))}`)) || [];
    },
    /** One conditional UPDATE. true only for the single caller that set reminder_sent_at, so a reminder never sends twice. */
    async claimReminder(id, nowIso) {
      need(UUID.test(id), "booking");
      const out = await call(`wf_reserve_bookings?id=eq.${q(id)}&status=eq.confirmed&reminder_sent_at=is.null&select=id`, { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({ reminder_sent_at: nowIso }) });
      return Array.isArray(out) && out.length === 1;
    },
  };
}
