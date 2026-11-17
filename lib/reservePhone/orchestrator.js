// lib/reservePhone/orchestrator.js - one phone request, provider agnostic.
// The telephony adapter places the call. The voice seam interprets words. This file decides whether a call
// may happen at all, claims at most one call per request, and stores an outcome without a transcript.
// A guest tap is the only caller. Nothing here dials on a timer.
import { phoneGuestLine } from "./copy.js";
import { planPhoneText } from "./notify.js";
import { phoneDialSecrets, resolvePhoneConfig, spokenGuestLabel, withinBusinessHours } from "./policy.js";
import { buildCallScript, scrubSummary } from "./script.js";
import { createTwilioVoiceAdapter, validTwilioSignature, CALL_SID } from "./twilioVoice.js";
import { createConversationRelayVoice } from "./voice.js";

const MESSAGES = {
  DISABLED: "Phone requests are off.",
  KILLED: "Phone requests are paused.",
  NOT_ALLOWLISTED: "This restaurant is not on the call list.",
  NO_PHONE: "This restaurant is not on the call list.",
  OUTSIDE_HOURS: "The restaurant is closed right now, so I will not call.",
  RATE_CAPPED: "Too many calls are already in progress. Please try again later.",
  NOT_CONFIGURED: "Phone requests are not ready.",
  NEEDS_NAME: "I need a first name for the table.",
  STORAGE: "We could not save that request. Please try again.",
};

async function safeAudit(repository, entry) {
  try {
    if (repository && typeof repository.appendPhoneAudit === "function") await repository.appendPhoneAudit(entry);
  } catch { /* a missed audit line never places a second call */ }
}

function viewOf(request, call) {
  const row = request || {};
  return {
    id: row.id,
    outcome: row.outcome || null,
    line: phoneGuestLine(row),
    restaurantName: row.restaurant_name || null,
    date: row.reserve_date || null,
    time: row.reserve_time ? String(row.reserve_time).slice(0, 5) : null,
    partySize: row.party_size || null,
    alternativeTime: row.alternative_time ? String(row.alternative_time).slice(0, 5) : null,
    acceptedWithinWindow: row.accepted_within_window === true,
    replayed: false,
    callStatus: call ? call.status : null,
  };
}

function fail(code) {
  return { ok: false, code, message: MESSAGES[code] || MESSAGES.STORAGE };
}

async function storeOutcome(repository, request, call, result) {
  const summary = scrubSummary(result.summary || "");
  const patch = {
    outcome: result.outcome,
    summary,
    alternative_time: result.alternativeTime || null,
    accepted_within_window: result.acceptedWithinWindow === true,
    confirmation_detail: result.confirmationDetail || null,
  };
  const saved = await repository.updatePhoneRequest(request.id, patch);
  if (call) await repository.updatePhoneCall(call.id, { status: result.outcome === "failed" ? "failed" : "completed", outcome: result.outcome, summary, provider_call_id: call.provider_call_id || null });
  await safeAudit(repository, { request_id: request.id, place_id: request.place_id, event: "outcome", code: result.reason || result.outcome, outcome: result.outcome, summary });
  return saved || { ...request, ...patch };
}

/**
 * Start or replay one phone request. `events` is only for tests and the relay host, never from the guest's POST body.
 * Returns { ok:true, phone, text } or { ok:false, code, message }. Does not throw.
 */
export async function startPhoneRequest({ repository, env = {}, request = {}, nowMs = Date.now(), telephony = null, voice = null, events = null, fetchImpl = fetch } = {}) {
  const cfg = resolvePhoneConfig(env);
  const placeId = request.placeId;
  if (!cfg.ok) {
    await safeAudit(repository, { request_id: null, place_id: placeId || "none", event: "refused", code: cfg.code, outcome: null, summary: cfg.audit });
    return fail(cfg.code);
  }
  if (!cfg.allowlist.includes(placeId)) {
    await safeAudit(repository, { request_id: null, place_id: placeId || "none", event: "refused", code: "NOT_ALLOWLISTED", outcome: null, summary: "Not on the call list." });
    return fail("NOT_ALLOWLISTED");
  }
  let place = request.phonePlace || null;
  if (!place || !place.phone) {
    try { place = await repository.getPhonePlace(placeId); } catch { return fail("STORAGE"); }
  }
  if (!place || !place.verified_at || !place.phone) {
    await safeAudit(repository, { request_id: null, place_id: placeId, event: "refused", code: "NO_PHONE", outcome: null, summary: "No verified phone." });
    return fail("NO_PHONE");
  }
  const label = spokenGuestLabel(request.guestName);
  if (!label) return fail("NEEDS_NAME");

  let existing = null;
  try { existing = await repository.findPhoneRequestByKey(request.userId, request.idempotencyKey); } catch { return fail("STORAGE"); }
  if (existing && existing.request) {
    return { ok: true, replayed: true, phone: { ...viewOf(existing.request, existing.call), replayed: true }, text: { sent: false, reason: "replayed", kind: null } };
  }
  if (!withinBusinessHours(place.hours, place.timezone, nowMs)) {
    await safeAudit(repository, { request_id: null, place_id: placeId, event: "refused", code: "OUTSIDE_HOURS", outcome: null, summary: "Outside business hours." });
    return fail("OUTSIDE_HOURS");
  }

  let recent = 0;
  try { recent = await repository.countPhoneCallsSince(new Date(nowMs - 3600000).toISOString()); } catch { return fail("STORAGE"); }
  if (recent >= cfg.maxPerHour) {
    await safeAudit(repository, { request_id: null, place_id: placeId, event: "refused", code: "RATE_CAPPED", outcome: null, summary: "Hourly call cap reached." });
    return fail("RATE_CAPPED");
  }

  const script = buildCallScript({
    restaurantName: request.restaurantName || place.name || "the restaurant",
    date: request.date, time: request.time, partySize: request.partySize, guestLabel: label, windowMinutes: request.windowMinutes,
  });
  let inserted;
  try {
    inserted = await repository.insertPhoneRequest({
      user_id: request.userId,
      place_id: placeId,
      restaurant_name: String(request.restaurantName || place.name || "the restaurant").slice(0, 80),
      idempotency_key: request.idempotencyKey,
      guest_label: label,
      party_size: request.partySize,
      reserve_date: request.date,
      reserve_time: request.time,
      window_minutes: request.windowMinutes,
    });
  } catch { return fail("STORAGE"); }
  if (!inserted || !inserted.request) return fail("STORAGE");
  if (!inserted.created) {
    let again = null;
    try { again = await repository.findPhoneRequestByKey(request.userId, request.idempotencyKey); } catch { again = null; }
    const row = (again && again.request) || inserted.request;
    return { ok: true, replayed: true, phone: { ...viewOf(row, again && again.call), replayed: true }, text: { sent: false, reason: "replayed", kind: null } };
  }

  let callIns;
  try { callIns = await repository.insertPhoneCall(inserted.request.id, placeId); } catch { return fail("STORAGE"); }
  if (!callIns || !callIns.created) {
    return { ok: true, replayed: true, phone: { ...viewOf(inserted.request, callIns && callIns.call), replayed: true }, text: { sent: false, reason: "replayed", kind: null } };
  }

  const dial = telephony || createTwilioVoiceAdapter({ config: cfg, fetchImpl });
  let placed;
  try { placed = await dial.placeCall({ to: place.phone, script }); } catch { placed = { ok: false, code: "PROVIDER" }; }
  if (!placed || !placed.ok) {
    const failed = { outcome: "failed", summary: "The call did not start.", reason: "FAILED" };
    let saved = inserted.request;
    try { saved = await storeOutcome(repository, inserted.request, { ...callIns.call, provider_call_id: null }, failed); } catch { saved = { ...inserted.request, outcome: "failed" }; }
    return { ok: true, replayed: false, phone: viewOf(saved, callIns.call), text: planPhoneText({ env, phase: "failed" }) };
  }
  const placedCall = { ...callIns.call, status: "placed", provider_call_id: placed.callId };
  try { await repository.updatePhoneCall(callIns.call.id, { status: "placed", provider_call_id: placed.callId }); } catch { /* the sid is also on the provider */ }
  await safeAudit(repository, { request_id: inserted.request.id, place_id: placeId, event: "placed", code: "PLACED", outcome: null, summary: "Call placed." });
  const placedText = planPhoneText({ env, phase: "placed" });

  if (Array.isArray(events)) {
    const voiceImpl = voice || createConversationRelayVoice({ holdLimit: cfg.holdSeconds });
    const result = voiceImpl.reduce(script, events);
    let saved;
    try { saved = await storeOutcome(repository, inserted.request, placedCall, result); } catch { return fail("STORAGE"); }
    const phase = result.outcome === "confirmed" ? "confirmed" : result.outcome === "declined" ? "declined" : null;
    return { ok: true, replayed: false, phone: viewOf(saved, placedCall), text: phase ? planPhoneText({ env, phase }) : placedText };
  }
  return { ok: true, replayed: false, phone: viewOf(inserted.request, placedCall), text: placedText };
}

/** Apply an interpreter result to a request that does not have one yet. The first outcome wins. */
export async function applyVoiceOutcome({ repository, env = {}, requestId, events, voice = null, holdLimit = null } = {}) {
  let found;
  try { found = await repository.getPhoneRequestById(requestId); } catch { return fail("STORAGE"); }
  if (!found || !found.request) return fail("NO_PHONE");
  if (found.request.outcome) return { ok: true, replayed: true, phone: { ...viewOf(found.request, found.call), replayed: true }, text: { sent: false, reason: "replayed", kind: null } };
  const cfg = resolvePhoneConfig(env);
  const limit = holdLimit || (cfg.ok ? cfg.holdSeconds : 45);
  const script = buildCallScript({
    restaurantName: found.request.restaurant_name,
    date: found.request.reserve_date,
    time: String(found.request.reserve_time).slice(0, 5),
    partySize: found.request.party_size,
    guestLabel: found.request.guest_label,
    windowMinutes: found.request.window_minutes,
  });
  const voiceImpl = voice || createConversationRelayVoice({ holdLimit: limit });
  const result = voiceImpl.reduce(script, events || []);
  let saved;
  try { saved = await storeOutcome(repository, found.request, found.call, result); } catch { return fail("STORAGE"); }
  const phase = result.outcome === "confirmed" ? "confirmed" : result.outcome === "declined" ? "declined" : null;
  return { ok: true, replayed: false, phone: viewOf(saved, found.call), text: phase ? planPhoneText({ env, phase }) : planPhoneText({ env, phase: "placed" }) };
}

const TERMINAL_STATUS = { busy: "failed", "no-answer": "failed", failed: "failed", canceled: "failed", completed: "failed" };

/**
 * Twilio status callback. A bad signature writes nothing. A completed call with no interpreter result
 * is failed, never confirmed. An outcome already stored is left alone.
 */
export async function applyPhoneStatusCallback({ repository, env = {}, params = {}, signature, url }) {
  const secrets = phoneDialSecrets(env);
  if (!secrets) return { ok: false, code: "DISABLED" };
  if (!validTwilioSignature(secrets.authToken, url, params, signature)) return { ok: false, code: "BAD_SIGNATURE" };
  if (params.AccountSid !== secrets.accountSid) return { ok: false, code: "WRONG_ACCOUNT" };
  const sid = String(params.CallSid || "");
  const status = String(params.CallStatus || "").toLowerCase();
  if (!CALL_SID.test(sid) || !status) return { ok: false, code: "BAD_PAYLOAD" };
  let call;
  try { call = await repository.phoneCallBySid(sid); } catch { return { ok: false, code: "STORAGE" }; }
  if (!call) return { ok: true, code: "UNKNOWN_CALL" };
  let found;
  try { found = await repository.getPhoneRequestById(call.request_id); } catch { return { ok: false, code: "STORAGE" }; }
  if (found && found.request && found.request.outcome) return { ok: true, unchanged: true, outcome: found.request.outcome };
  const next = TERMINAL_STATUS[status];
  if (!next) return { ok: true, unchanged: true };
  const summary = status === "completed" ? "The call ended without an answer we could use." : "The call did not connect.";
  try {
    await storeOutcome(repository, found.request, call, { outcome: "failed", summary, reason: status.toUpperCase() });
  } catch { return { ok: false, code: "STORAGE" }; }
  return { ok: true, outcome: "failed" };
}
