// lib/reserveRepository.js - service role persistence for "Reserve a table".
// Mirrors lib/groupPlanRepository.js: config injected, fetch injected for tests.
// Service role only. Callers must verify the user or the respond token first.
// Missing configuration fails loudly with a named error (AGENTS.md section 5).

import { postgrestMetroFilter } from "./metroRegions.js";

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
  const PARTNER_COLUMNS = "place_id,name,contact_email,phone,stage,active,timezone,max_party,capacity_covers,seating_minutes,lead_minutes,window_days,booking_mode";
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
    /** Request lane: saves a 'requested' booking (no seats held). Same result shape as book. */
    async request(a) {
      need(UUID.test(a.userId) && UUID.test(a.idempotencyKey), "booking");
      return verdict(await rpc("wf_reserve_request", {
        p_place_id: a.placeId, p_user_id: a.userId, p_date: a.date, p_time: a.time, p_party: a.partySize, p_name: a.guestName,
        p_note: a.note ?? null, p_phone: a.phone ?? null, p_consent: a.phoneConsent === true, p_idem: a.idempotencyKey,
      }));
    },
    /** The restaurant answers a request: accept -> confirmed, decline -> declined. */
    async respondRequest({ bookingId, placeId, accept, reason = null }) {
      need(UUID.test(bookingId) && typeof placeId === "string" && placeId.length > 0 && typeof accept === "boolean", "answer");
      return verdict(await rpc("wf_reserve_respond_request", { p_booking_id: bookingId, p_place_id: placeId, p_accept: accept, p_reason: reason }));
    },
    async getUserBooking(userId, bookingId) {
      need(UUID.test(userId) && UUID.test(bookingId), "booking");
      return first(`wf_reserve_bookings?user_id=eq.${q(userId)}&id=eq.${q(bookingId)}&select=id,confirmation_code,status,place_id,party_size,reserve_date,reserve_time,proposed_date,proposed_time,created_at,wf_reserve_partners(name,phone)&limit=1`);
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
    // ---- Booking Profile (wf_booking_profiles). Service role; the caller verified the user. ----
    async readBookingProfile(userId) {
      need(UUID.test(userId), "user");
      return first(`wf_booking_profiles?user_id=eq.${q(userId)}&select=first_name,last_name,mobile_phone,preferred_email,default_party_size,consent_at,consent_version,updated_at&limit=1`);
    },
    /** Replace the whole profile row for this user. `value` is the validated row from lib/reserveProfile.js. */
    async writeBookingProfile(userId, value) {
      need(UUID.test(userId) && value && typeof value === "object", "profile");
      const out = await call("wf_booking_profiles?on_conflict=user_id&select=first_name,last_name,mobile_phone,preferred_email,default_party_size,consent_at,consent_version,updated_at", {
        method: "POST", headers: { prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ user_id: userId, ...value, updated_at: new Date().toISOString() }),
      });
      return Array.isArray(out) ? out[0] || null : null;
    },
    async removeBookingProfile(userId) {
      need(UUID.test(userId), "user");
      await call(`wf_booking_profiles?user_id=eq.${q(userId)}`, { method: "DELETE" });
      return true;
    },
    // ---- Platform links (wf_reserve_platform_links). Server only. ----
    /** The active, verified OpenTable link for a place, or null. */
    async getPlatformLink(placeId) {
      need(typeof placeId === "string" && placeId.length > 0, "place");
      return first(`wf_reserve_platform_links?place_id=eq.${q(placeId)}&platform=eq.opentable&active=eq.true&select=place_id,external_id,external_slug,active&limit=1`);
    },
    /** Active OpenTable links for many places at once: [{place_id, external_id}]. */
    async listPlatformLinks(placeIds) {
      need(Array.isArray(placeIds) && placeIds.length <= 200 && placeIds.every((x) => typeof x === "string" && /^[A-Za-z0-9_-]{5,200}$/.test(x)), "places");
      if (!placeIds.length) return [];
      return (await call(`wf_reserve_platform_links?platform=eq.opentable&active=eq.true&place_id=in.(${placeIds.map(q).join(",")})&select=place_id,external_id,external_slug,active`)) || [];
    },
    async listActivePlatformPlaceIds() {
      const rows = (await call(`wf_reserve_platform_links?platform=eq.opentable&active=eq.true&select=place_id&limit=2000`)) || [];
      return rows.map((r) => r.place_id).filter((x) => typeof x === "string");
    },
    // ---- Owned inventory reads (wf_inventory) ----
    async getInventoryPlace(placeId) {
      need(typeof placeId === "string" && placeId.length > 0, "place");
      return first(`wf_inventory?place_id=eq.${q(placeId)}&select=place_id,name,locality,metro,cuisines,status,lat,lng,signals&limit=1`);
    },
    /**
     * OPERATIONAL restaurants (category food), not excluded. Filters: metro (coverage key), or a box around lat/lng,
     * a cuisine (cuisines contains), a name fragment. Returns raw rows; the caller ranks.
     */
    async searchRestaurants({ metro = null, lat = null, lng = null, radiusMiles = 25, cuisine = null, nameLike = null, limit = 60 } = {}) {
      const parts = ["status=eq.OPERATIONAL", "excluded=not.is.true", "category=eq.food", "select=place_id,name,locality,metro,cuisines,status,lat,lng,signals"];
      if (metro) { need(/^[a-z0-9-]{2,40}$/.test(metro), "metro"); parts.push(`metro=${postgrestMetroFilter(metro)}`); }
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const dLat = radiusMiles / 69, dLng = radiusMiles / Math.max(5, 69 * Math.cos((lat * Math.PI) / 180));
        parts.push(`lat=gte.${(lat - dLat).toFixed(5)}`, `lat=lte.${(lat + dLat).toFixed(5)}`, `lng=gte.${(lng - dLng).toFixed(5)}`, `lng=lte.${(lng + dLng).toFixed(5)}`);
      }
      if (cuisine) { need(/^[a-z][a-z -]{1,30}$/.test(cuisine), "cuisine"); parts.push(`cuisines=cs.{${q(cuisine)}}`); }
      if (nameLike) { need(/^[\p{L}\p{N} '&.-]{2,60}$/u.test(nameLike), "name"); parts.push(`name=ilike.*${q(nameLike)}*`); }
      parts.push("order=place_id.asc", `limit=${Math.min(200, Math.max(1, limit | 0))}`);
      return (await call(`wf_inventory?${parts.join("&")}`)) || [];
    },
    /** A guest's bookings across restaurants from fromDate on (upcoming), plus recent ones, newest first. */
    async listAllUserBookings(userId, sinceDate, limit = 20) {
      need(UUID.test(userId) && /^\d{4}-\d{2}-\d{2}$/.test(sinceDate), "history query");
      return (await call(`wf_reserve_bookings?user_id=eq.${q(userId)}&reserve_date=gte.${sinceDate}&select=id,confirmation_code,status,place_id,party_size,reserve_date,reserve_time,proposed_date,proposed_time,created_at,wf_reserve_partners(name,phone)&order=reserve_date.desc,reserve_time.desc&limit=${Math.min(20, Math.max(1, limit | 0))}`)) || [];
    },
    /** Upcoming requested, confirmed and proposed bookings for one restaurant, soonest first. */
    async listPartnerBookings(placeId, fromDate, limit = 200) {
      need(typeof placeId === "string" && placeId.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(fromDate), "bookings query");
      return (await call(`wf_reserve_bookings?place_id=eq.${q(placeId)}&status=in.(requested,confirmed,proposed)&reserve_date=gte.${fromDate}&select=id,confirmation_code,status,guest_name,party_size,reserve_date,reserve_time,note,guest_phone,phone_consent_at,proposed_date,proposed_time&order=reserve_date.asc,reserve_time.asc&limit=${Math.min(500, Math.max(1, limit | 0))}`)) || [];
    },
    /** Confirmed bookings that have not had a reminder, on or between two days. */
    async listReminderCandidates(fromDate, toDate, limit = 200) {
      need(/^\d{4}-\d{2}-\d{2}$/.test(fromDate) && /^\d{4}-\d{2}-\d{2}$/.test(toDate), "reminder query");
      return (await call(`wf_reserve_bookings?status=eq.confirmed&reminder_sent_at=is.null&reserve_date=gte.${fromDate}&reserve_date=lte.${toDate}&select=id,confirmation_code,user_id,place_id,guest_name,party_size,reserve_date,reserve_time,created_at,wf_reserve_partners(name,phone,stage,timezone)&order=reserve_date.asc,reserve_time.asc&limit=${Math.min(500, Math.max(1, limit | 0))}`)) || [];
    },
    // ---- guest texts (wf_reserve_notifications, lib/reserveSms.js) ----
    /**
     * Create the one notification row for (booking, kind), or read the row that already exists.
     * { claimed: true, ...row } only for the caller whose INSERT created it, so exactly one caller sends.
     */
    async claimNotification({ bookingId, kind, recipient, consentAt, consentText }) {
      need(UUID.test(bookingId) && kind === "confirmation_sms" && /^\+[1-9][0-9]{7,14}$/.test(recipient) && typeof consentText === "string", "notification");
      const cols = "id,booking_id,kind,recipient,status,provider,provider_message_id,attempts,created_at";
      const made = await call(`wf_reserve_notifications?on_conflict=booking_id,kind&select=${cols}`, {
        method: "POST", headers: { prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify({ booking_id: bookingId, kind, recipient, consent_at: consentAt, consent_text: consentText, status: "queued", history: [{ at: consentAt, status: "queued", note: "claimed" }] }),
      });
      if (Array.isArray(made) && made.length === 1) return { claimed: true, ...made[0] };
      const existing = await first(`wf_reserve_notifications?booking_id=eq.${q(bookingId)}&kind=eq.${q(kind)}&select=${cols}&limit=1`);
      return existing ? { claimed: false, ...existing } : null;
    },
    /** Update one notification row and append a history entry (status, note, time). Never touches the booking. */
    async markNotification(id, patch, nowIso) {
      need(UUID.test(id) && patch && typeof patch === "object", "notification");
      const row = await first(`wf_reserve_notifications?id=eq.${q(id)}&select=history&limit=1`);
      const history = Array.isArray(row && row.history) ? row.history.slice(-19) : [];
      const { note, ...fields } = patch;
      const allowed = {};
      for (const k of ["status", "provider", "provider_message_id", "attempts", "last_error"]) if (fields[k] !== undefined) allowed[k] = fields[k];
      history.push({ at: nowIso, status: allowed.status || null, note: note || null });
      await call(`wf_reserve_notifications?id=eq.${q(id)}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ ...allowed, history, updated_at: nowIso }) });
      return true;
    },
    async notificationByProviderId(provider, messageId) {
      need(provider === "twilio" && /^(SM|MM)[0-9a-f]{32}$/.test(messageId), "message");
      return first(`wf_reserve_notifications?provider=eq.${provider}&provider_message_id=eq.${q(messageId)}&select=id,booking_id,status&limit=1`);
    },
    // ---- phone requests (wf_reserve_phone_*, lib/reservePhone/). No audio, no transcript. ----
    async getPhonePlace(placeId) {
      need(typeof placeId === "string" && placeId.length > 0, "place");
      return first(`wf_reserve_phone_places?place_id=eq.${q(placeId)}&select=place_id,phone,timezone,hours,verified_at&limit=1`);
    },
    async findPhoneRequestByKey(userId, idempotencyKey) {
      need(UUID.test(userId) && UUID.test(idempotencyKey), "phone request");
      const request = await first(`wf_reserve_phone_requests?user_id=eq.${q(userId)}&idempotency_key=eq.${q(idempotencyKey)}&select=id,user_id,place_id,restaurant_name,idempotency_key,guest_label,party_size,reserve_date,reserve_time,window_minutes,outcome,summary,alternative_time,accepted_within_window,confirmation_detail&limit=1`);
      if (!request) return null;
      const call = await first(`wf_reserve_phone_calls?request_id=eq.${q(request.id)}&select=id,request_id,place_id,provider,provider_call_id,status,outcome,summary&limit=1`);
      return { request, call };
    },
    async getPhoneRequestById(id) {
      need(UUID.test(id), "phone request");
      const request = await first(`wf_reserve_phone_requests?id=eq.${q(id)}&select=id,user_id,place_id,restaurant_name,idempotency_key,guest_label,party_size,reserve_date,reserve_time,window_minutes,outcome,summary,alternative_time,accepted_within_window,confirmation_detail&limit=1`);
      if (!request) return null;
      const call = await first(`wf_reserve_phone_calls?request_id=eq.${q(id)}&select=id,request_id,place_id,provider,provider_call_id,status,outcome,summary&limit=1`);
      return { request, call };
    },
    async getPhoneRequestForUser(userId, id) {
      need(UUID.test(userId) && UUID.test(id), "phone request");
      return first(`wf_reserve_phone_requests?id=eq.${q(id)}&user_id=eq.${q(userId)}&select=id,restaurant_name,party_size,reserve_date,reserve_time,outcome,summary,alternative_time,accepted_within_window&limit=1`);
    },
    async insertPhoneRequest(row) {
      need(UUID.test(row.user_id) && UUID.test(row.idempotency_key), "phone request");
      const cols = "id,user_id,place_id,restaurant_name,idempotency_key,guest_label,party_size,reserve_date,reserve_time,window_minutes,outcome,summary,alternative_time,accepted_within_window,confirmation_detail";
      const made = await call(`wf_reserve_phone_requests?on_conflict=user_id,idempotency_key&select=${cols}`, {
        method: "POST", headers: { prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(row),
      });
      if (Array.isArray(made) && made.length === 1) return { request: made[0], created: true };
      const existing = await this.findPhoneRequestByKey(row.user_id, row.idempotency_key);
      return existing ? { request: existing.request, created: false } : null;
    },
    async insertPhoneCall(requestId, placeId) {
      need(UUID.test(requestId) && typeof placeId === "string" && placeId.length > 0, "phone call");
      const cols = "id,request_id,place_id,provider,provider_call_id,status,outcome,summary";
      const made = await call(`wf_reserve_phone_calls?on_conflict=request_id&select=${cols}`, {
        method: "POST", headers: { prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify({ request_id: requestId, place_id: placeId, provider: "twilio", status: "claimed" }),
      });
      if (Array.isArray(made) && made.length === 1) return { call: made[0], created: true };
      const existing = await first(`wf_reserve_phone_calls?request_id=eq.${q(requestId)}&select=${cols}&limit=1`);
      return existing ? { call: existing, created: false } : null;
    },
    async updatePhoneRequest(id, patch) {
      need(UUID.test(id) && patch && typeof patch === "object", "phone request");
      const allowed = {};
      for (const k of ["outcome", "summary", "alternative_time", "accepted_within_window", "confirmation_detail"]) if (patch[k] !== undefined) allowed[k] = patch[k];
      allowed.updated_at = new Date().toISOString();
      const out = await call(`wf_reserve_phone_requests?id=eq.${q(id)}&select=id,user_id,place_id,restaurant_name,guest_label,party_size,reserve_date,reserve_time,window_minutes,outcome,summary,alternative_time,accepted_within_window,confirmation_detail`, {
        method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify(allowed),
      });
      return Array.isArray(out) ? out[0] : null;
    },
    async updatePhoneCall(id, patch) {
      need(UUID.test(id) && patch && typeof patch === "object", "phone call");
      const allowed = {};
      for (const k of ["status", "outcome", "summary", "provider_call_id"]) if (patch[k] !== undefined) allowed[k] = patch[k];
      allowed.updated_at = new Date().toISOString();
      await call(`wf_reserve_phone_calls?id=eq.${q(id)}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify(allowed) });
      return true;
    },
    async countPhoneCallsSince(sinceIso) {
      need(typeof sinceIso === "string" && sinceIso.length >= 10, "window");
      const rows = await call(`wf_reserve_phone_calls?created_at=gte.${q(sinceIso)}&select=id&limit=21`) || [];
      return rows.length;
    },
    async phoneCallBySid(sid) {
      need(/^CA[0-9a-f]{32}$/.test(sid), "call");
      return first(`wf_reserve_phone_calls?provider=eq.twilio&provider_call_id=eq.${q(sid)}&select=id,request_id,place_id,provider,provider_call_id,status,outcome,summary&limit=1`);
    },
    async appendPhoneAudit(entry) {
      const row = {
        request_id: entry.request_id || null,
        place_id: String(entry.place_id || "").slice(0, 200),
        event: entry.event,
        code: entry.code ? String(entry.code).slice(0, 40) : null,
        outcome: entry.outcome || null,
        summary: entry.summary ? String(entry.summary).slice(0, 180) : null,
      };
      need(row.place_id && row.event, "audit");
      await call("wf_reserve_phone_audit", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify(row) });
      return true;
    },
    /** One conditional UPDATE. true only for the single caller that set reminder_sent_at, so a reminder never sends twice. */
    // Booking agent tables may not be applied yet. A missing table must not blank My reservations.
    async listBookingAgentRuns(userId) {
      need(UUID.test(userId), "user");
      try {
        return (await call(`wf_booking_agent_runs?user_id=eq.${q(userId)}&select=id,place_id,date,time,party,status,reason,confirmation_number&order=created_at.desc&limit=20`)) || [];
      } catch { return []; }
    },
    async readBookingAgentSite(site) {
      need(site === "opentable", "site");
      try { return await first("wf_booking_agent_sites?site=eq.opentable&select=site,status,paused_until,last_challenge_at,challenge_count_7d&limit=1"); }
      catch { return null; }
    },
    async claimReminder(id, nowIso) {
      need(UUID.test(id), "booking");
      const out = await call(`wf_reserve_bookings?id=eq.${q(id)}&status=eq.confirmed&reminder_sent_at=is.null&select=id`, { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({ reminder_sent_at: nowIso }) });
      return Array.isArray(out) && out.length === 1;
    },
  };
}
