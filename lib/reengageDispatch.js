// lib/reengageDispatch.js — SERVER-ONLY. The sender for wf_reengage_queue. Run by
// /api/cron/reengage-dispatch every 5 minutes. The queue is the ONLY scheduler:
// nothing is handed to Resend with scheduled_at, so every binding check below runs at
// the moment of the send.
//
// ORDER PER RUN
//   reap     a `sending` row (not the immediate itinerary_email) older than 25 h -> failed
//            stuck_sending. NEVER back to pending: a push has no idempotency key.
//   sweep    pending rows past their lateness limit -> cancelled stale (set based)
//   select   due pending rows, oldest first, paged. A non 2xx is a FAILED run. Rows of
//            contacts who have not confirmed are skipped here, so they never consume the
//            budget or block a later row. Unsubscribed, bounced and complained contacts are NOT
//            skipped here: their rows are claimed and settled skipped_suppressed after the claim.
//   per row  (sequential, one message per recipient and channel per run, budget bound)
//            defer   no write: quiet hours, a member daily pick today, a drip email <20 h ago
//            claim   PATCH status=eq.pending -> sending. Zero rows back: another run has it.
//            check   AFTER the claim: contact still subscribed AND confirmed, address not
//                    suppressed, plan date not past, then the cap. RESERVE THEN COUNT: rows
//                    for this recipient and channel that are sending (own claim included) or
//                    were sent in the last 7 days must be <= 2. Push also 1 per local day.
//            send    email through Resend (Idempotency-Key reengage/drip/<id>, no scheduled_at)
//                    or push through sendWebPush to at most 3 newest subscriptions
//            settle  sent, or the status map (see settle())
//   retention  signals older than 90 days, in the first run after 09:00 UTC
//
// WHY RESERVE THEN COUNT. withinWeeklyCap (reengageServer.js) counts `sent` rows only, so
// two overlapping runs would both read 1 and both send. Claiming first and counting rows
// that are sending OR sent means a concurrent claim is visible to the count.
//
// PII: the address is read from wf_reengage_contacts by id at send time, goes only into the
// Resend request body, and is never logged, never in a URL, never in a result. Push
// endpoints are opened in memory only, with openField, and never logged.
import { sbEnv } from "./serverCache.js";
import { SITE_URL } from "./site.js";
import { siteTodayStr } from "./siteTime.js";
import { NEWSLETTER_REPLY_TO } from "./newsletter.js";
import { sendWebPush, vapidFromEnv } from "./webPush.js";
import { isQuietHours, localDayKey } from "./alertPolicy.js";
import { endpointHash, openField } from "./reengagePushCrypto.js";
import {
  REENGAGE_FROM, TRIGGER_ITINERARY_EMAIL, itineraryEmailMessage, reengageConfigured, sanitizePlan, unsubscribeUrl,
} from "./reengageServer.js";
import {
  T_CONTACTS, T_PUSH_SUBS, T_QUEUE, T_SIGNALS, T_SUPPRESS, emailStepFor, pushMessageFor, sbRest,
} from "./reengageOrchestrate.js";

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
export const WEEKLY_MAX = 2;
export const EMAIL_SPACING_MS = 20 * HOUR;
export const STUCK_AFTER_MS = 25 * HOUR;
export const STALE_EMAIL_MS = 24 * HOUR;
export const STALE_ITINERARY_PUSH_MS = 3 * HOUR;
export const STALE_OTHER_PUSH_MS = 14 * HOUR;
export const SIGNAL_RETENTION_MS = 90 * DAY;
export const MAX_PUSH_SUBS = 3;
const MAX_PAGES = 10;
const DEFAULT_TZ = "America/New_York";
const iso = (ms) => encodeURIComponent(new Date(ms).toISOString());

/** Contact may be emailed: subscribed AND confirmed by their own click. The one predicate used before and after the claim. */
export function isSendableContact(c) {
  return !!c && c.status === "subscribed" && !!c.confirmed_at;
}

/** A subscribed contact who has not clicked "Open my plan" yet: their rows wait (and age out) rather than being claimed. */
const isWaitingForConfirm = (c) => !!c && c.status === "subscribed" && !isSendableContact(c);

async function getRows(sb, path, fetchImpl) {
  try {
    const r = await sbRest(sb, path, {}, fetchImpl);
    if (!r.ok) return null;
    const rows = await r.json().catch(() => null);
    return Array.isArray(rows) ? rows : null;
  } catch { return null; }
}

async function patchRows(sb, path, body, fetchImpl, representation = false) {
  try {
    const r = await sbRest(sb, path, { method: "PATCH", headers: { Prefer: representation ? "return=representation" : "return=minimal" }, body: JSON.stringify(body) }, fetchImpl);
    if (!r.ok) return null;
    if (!representation) return [];
    const rows = await r.json().catch(() => null);
    return Array.isArray(rows) ? rows : null;
  } catch { return null; }
}

function newCounts() {
  return {
    ok: true, selectFailed: false, attempted: 0, sent: 0, failed: 0, skippedCap: 0, skippedSuppressed: 0, cancelled: 0,
    deferred: 0, lostClaim: 0, reaped: 0, stale: 0, retention: false, errors: 0, examined: 0,
  };
}

/** Settle a claimed row. The filter keeps a late settle from clobbering a row another run reaped. */
async function settle(sb, id, patch, fetchImpl, c) {
  const rows = await patchRows(sb, `${T_QUEUE}?id=eq.${id}&status=eq.sending&select=id`, patch, fetchImpl, true);
  if (!rows) c.errors += 1; // the row stays `sending`: it keeps counting toward the cap and the reaper ends it
  if (patch.status === "sent") c.sent += 1;
  else if (patch.status === "failed") c.failed += 1;
  else if (patch.status === "skipped_cap") c.skippedCap += 1;
  else if (patch.status === "skipped_suppressed") c.skippedSuppressed += 1;
  else if (patch.status === "cancelled") c.cancelled += 1;
}

async function loadMemberEndpointHashes(sb, fetchImpl, todayStr) {
  const rows = await getRows(sb, `wf_web_push_subscriptions?last_sent_on=eq.${todayStr}&select=endpoint`, fetchImpl);
  if (!rows) return null;
  return new Set(rows.map((r) => (r && typeof r.endpoint === "string" ? endpointHash(r.endpoint) : null)).filter(Boolean));
}

const activeSubsPath = (anonId) => `${T_PUSH_SUBS}?anon_id=eq.${anonId}&revoked_at=is.null&order=created_at.desc&limit=${MAX_PUSH_SUBS}&select=id,endpoint_hash,endpoint_enc,keys_enc,tz`;

async function sendEmailRow({ sb, env, fetchImpl, now, row, c }) {
  const contactRows = await getRows(sb, `${T_CONTACTS}?id=eq.${Number(row.contact_id)}&select=id,email,email_hash,status,confirmed_at,unsubscribe_token&limit=1`, fetchImpl);
  if (!contactRows) return settle(sb, row.id, { status: "failed", cancelled_reason: "check_failed" }, fetchImpl, c);
  const contact = contactRows[0] || null;
  if (!contact) return settle(sb, row.id, { status: "skipped_suppressed", cancelled_reason: "contact_missing" }, fetchImpl, c);
  if (!isSendableContact(contact)) {
    return settle(sb, row.id, { status: "skipped_suppressed", cancelled_reason: contact.status !== "subscribed" ? `contact_${String(contact.status).slice(0, 20)}` : "contact_unconfirmed" }, fetchImpl, c);
  }
  const sup = await getRows(sb, `${T_SUPPRESS}?email_hash=eq.${contact.email_hash}&select=id&limit=1`, fetchImpl);
  if (!sup) return settle(sb, row.id, { status: "failed", cancelled_reason: "check_failed" }, fetchImpl, c);
  if (sup.length) return settle(sb, row.id, { status: "skipped_suppressed", cancelled_reason: "suppressed" }, fetchImpl, c);

  const plan = sanitizePlan(row.payload && row.payload.plan);
  const stepInfo = emailStepFor(row.step, plan && plan.areaName);
  if (!plan || !stepInfo) return settle(sb, row.id, { status: "failed", cancelled_reason: "bad_payload" }, fetchImpl, c);
  if (plan.when && plan.when < siteTodayStr(new Date(now))) return settle(sb, row.id, { status: "cancelled", cancelled_reason: "plan_past" }, fetchImpl, c);

  // Reserve then count: this row is already `sending`, so it is part of the count.
  // Read `sending` BEFORE `sent`: a row moves sending -> sent, so this order can double count it (safe) but can never miss it.
  const sending = await getRows(sb, `${T_QUEUE}?contact_id=eq.${Number(row.contact_id)}&channel=eq.email&trigger_type=neq.${TRIGGER_ITINERARY_EMAIL}&status=eq.sending&select=id&limit=10`, fetchImpl);
  const sent7 = await getRows(sb, `${T_QUEUE}?contact_id=eq.${Number(row.contact_id)}&channel=eq.email&trigger_type=neq.${TRIGGER_ITINERARY_EMAIL}&status=eq.sent&sent_at=gte.${iso(now - 7 * DAY)}&select=id&limit=10`, fetchImpl);
  if (!sent7 || !sending) return settle(sb, row.id, { status: "failed", cancelled_reason: "check_failed" }, fetchImpl, c);
  if (sent7.length + sending.length > WEEKLY_MAX) return settle(sb, row.id, { status: "skipped_cap", cancelled_reason: "weekly" }, fetchImpl, c);

  const key = String(env.RESEND_API_KEY || "").trim();
  const msg = itineraryEmailMessage(plan, { unsubscribeToken: contact.unsubscribe_token, env, siteUrl: SITE_URL, ...stepInfo });
  if (!key || !msg) return settle(sb, row.id, { status: "failed", cancelled_reason: "bad_payload" }, fetchImpl, c);
  const from = String(env.WF_REENGAGE_FROM || "").trim() || REENGAGE_FROM;
  let res = null;
  try {
    res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", "Idempotency-Key": `reengage/drip/${row.id}` },
      body: JSON.stringify({
        from, to: [contact.email], reply_to: NEWSLETTER_REPLY_TO, subject: msg.subject, text: msg.text, html: msg.html,
        headers: { "List-Unsubscribe": `<${unsubscribeUrl(contact.unsubscribe_token, SITE_URL)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        tags: [{ name: "kind", value: "itinerary_drip" }],
      }),
    });
  } catch { res = null; }
  if (!res || !res.ok) return settle(sb, row.id, { status: "failed", cancelled_reason: "send_failed" }, fetchImpl, c);
  const j = await res.json().catch(() => null);
  return settle(sb, row.id, { status: "sent", sent_at: new Date(now).toISOString(), ...(j && typeof j.id === "string" ? { resend_email_id: j.id.slice(0, 120) } : {}) }, fetchImpl, c);
}

async function revokeSub(sb, id, fetchImpl, now, c) {
  const rows = await patchRows(sb, `${T_PUSH_SUBS}?id=eq.${Number(id)}`, { revoked_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString() }, fetchImpl);
  if (!rows) c.errors += 1;
}

async function sendPushRow({ sb, env, fetchImpl, now, row, c, send, vapid }) {
  const msg = pushMessageFor(row);
  if (!msg) return settle(sb, row.id, { status: "failed", cancelled_reason: "bad_payload" }, fetchImpl, c);
  const when = row.payload && row.payload.when;
  if (typeof when === "string" && when < siteTodayStr(new Date(now))) return settle(sb, row.id, { status: "cancelled", cancelled_reason: "plan_past" }, fetchImpl, c);

  const subs = await getRows(sb, activeSubsPath(row.anon_id), fetchImpl);
  if (!subs) return settle(sb, row.id, { status: "failed", cancelled_reason: "check_failed" }, fetchImpl, c);
  if (!subs.length) return settle(sb, row.id, { status: "cancelled", cancelled_reason: "no_push_sub" }, fetchImpl, c);

  const tz = subs[0].tz || DEFAULT_TZ;
  // `sending` first, then `sent` (see the email path): a row moving between the two reads is double counted, never missed.
  const sending = await getRows(sb, `${T_QUEUE}?anon_id=eq.${row.anon_id}&channel=eq.push&status=eq.sending&select=id&limit=20`, fetchImpl);
  const mine = await getRows(sb, `${T_QUEUE}?anon_id=eq.${row.anon_id}&channel=eq.push&status=eq.sent&sent_at=gte.${iso(now - 7 * DAY)}&select=id,sent_at&limit=20`, fetchImpl);
  if (!mine || !sending) return settle(sb, row.id, { status: "failed", cancelled_reason: "check_failed" }, fetchImpl, c);
  if (mine.length + sending.length > WEEKLY_MAX) return settle(sb, row.id, { status: "skipped_cap", cancelled_reason: "weekly" }, fetchImpl, c);
  const today = localDayKey(now, tz);
  const sentToday = mine.filter((r) => r && r.sent_at && localDayKey(Date.parse(r.sent_at), tz) === today).length;
  const othersSending = sending.filter((r) => r && Number(r.id) !== Number(row.id)).length;
  if (sentToday + othersSending >= 1) return settle(sb, row.id, { status: "skipped_cap", cancelled_reason: "daily" }, fetchImpl, c);

  const ttl = row.trigger_type === "itinerary_abandoned" ? 3600 : 21600;
  const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url, tag: msg.tag });
  let usable = 0; let delivered = 0;
  for (const sub of subs.slice(0, MAX_PUSH_SUBS)) {
    const endpoint = openField(sub.endpoint_enc, "endpoint", { env });
    let keys = null;
    try { keys = JSON.parse(openField(sub.keys_enc, "keys", { env }) || "null"); } catch { keys = null; }
    if (!endpoint || !keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") { await revokeSub(sb, sub.id, fetchImpl, now, c); continue; }
    usable += 1;
    const r = await send({ subscription: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, payload, vapid, ttl, urgency: "normal", fetchImpl });
    if (r && r.ok) delivered += 1;
    else if (r && r.gone) { usable -= 1; await revokeSub(sb, sub.id, fetchImpl, now, c); }
  }
  if (delivered > 0) return settle(sb, row.id, { status: "sent", sent_at: new Date(now).toISOString() }, fetchImpl, c);
  if (usable === 0) return settle(sb, row.id, { status: "cancelled", cancelled_reason: "no_push_sub" }, fetchImpl, c);
  return settle(sb, row.id, { status: "failed", cancelled_reason: "send_failed" }, fetchImpl, c);
}

/**
 * One dispatch run. Returns counts; `selectFailed: true` means the due select itself failed (the
 * caller must treat that as a FAILED run, never as "nothing due").
 */
export async function runReengageDispatch({ sb = sbEnv(), env = process.env, now = Date.now(), fetchImpl = fetch, send = sendWebPush, budgetMs = 40000, limit = 50 } = {}) {
  const c = newCounts();
  if (!sb || !reengageConfigured({ env, sb })) return { ...c, ok: false, reason: "unconfigured" };
  const started = Date.now();
  const nowIso = iso(now);

  // 1. reap
  const reaped = await patchRows(sb, `${T_QUEUE}?status=eq.sending&trigger_type=neq.${TRIGGER_ITINERARY_EMAIL}&scheduled_for=lt.${iso(now - STUCK_AFTER_MS)}&select=id`, { status: "failed", cancelled_reason: "stuck_sending" }, fetchImpl, true);
  if (reaped) c.reaped = reaped.length; else c.errors += 1;
  // 2. stale sweep
  for (const f of [
    `channel=eq.email&trigger_type=neq.${TRIGGER_ITINERARY_EMAIL}&scheduled_for=lt.${iso(now - STALE_EMAIL_MS)}`,
    `channel=eq.push&trigger_type=eq.itinerary_abandoned&scheduled_for=lt.${iso(now - STALE_ITINERARY_PUSH_MS)}`,
    `channel=eq.push&trigger_type=neq.itinerary_abandoned&scheduled_for=lt.${iso(now - STALE_OTHER_PUSH_MS)}`,
  ]) {
    const rows = await patchRows(sb, `${T_QUEUE}?status=eq.pending&${f}&select=id`, { status: "cancelled", cancelled_reason: "stale" }, fetchImpl, true);
    if (rows) c.stale += rows.length; else c.errors += 1;
  }

  // 3. select due rows, paged; unconfirmed contacts are skipped here
  const pageSize = Math.max(1, Math.floor(limit));
  const candidates = [];
  for (let page = 0; page < MAX_PAGES && candidates.length < pageSize; page += 1) {
    const rows = await getRows(sb, `${T_QUEUE}?status=eq.pending&trigger_type=neq.${TRIGGER_ITINERARY_EMAIL}&scheduled_for=lte.${nowIso}&order=scheduled_for.asc,id.asc&limit=${pageSize}&offset=${page * pageSize}&select=id,anon_id,contact_id,trigger_type,channel,step,payload,attempts`, fetchImpl);
    if (!rows) { c.selectFailed = true; c.ok = false; return c; }
    c.examined += rows.length;
    const ids = [...new Set(rows.filter((r) => r.channel === "email" && r.contact_id != null).map((r) => Number(r.contact_id)))];
    let waiting = new Set();
    if (ids.length) {
      const contacts = await getRows(sb, `${T_CONTACTS}?id=in.(${ids.join(",")})&select=id,status,confirmed_at`, fetchImpl);
      if (!contacts) { c.selectFailed = true; c.ok = false; return c; }
      waiting = new Set(contacts.filter(isWaitingForConfirm).map((x) => Number(x.id)));
    }
    for (const r of rows) {
      if (candidates.length >= pageSize) break;
      if (r.channel === "email" && waiting.has(Number(r.contact_id))) continue;
      candidates.push(r);
    }
    if (rows.length < pageSize) break;
  }

  // 4. per row
  const vapid = vapidFromEnv(env);
  const today = siteTodayStr(new Date(now));
  let memberHashes; // undefined = not read yet, null = read failed
  const seen = new Set();
  const lastEmailCache = new Map();
  for (const row of candidates) {
    if (Date.now() - started >= budgetMs) break;
    const who = row.channel === "email" ? `email:${row.contact_id}` : `push:${row.anon_id}`;
    if (seen.has(who)) continue;
    seen.add(who);

    // defer (no write)
    if (row.channel === "push") {
      if (!vapid) { c.deferred += 1; continue; }
      const subs = await getRows(sb, activeSubsPath(row.anon_id), fetchImpl);
      if (!subs) { c.errors += 1; continue; }
      if (!subs.length) {
        const rows = await patchRows(sb, `${T_QUEUE}?id=eq.${row.id}&status=eq.pending&select=id`, { status: "cancelled", cancelled_reason: "no_push_sub" }, fetchImpl, true);
        if (rows && rows.length) { c.attempted += 1; c.cancelled += 1; } else if (!rows) c.errors += 1;
        continue;
      }
      if (isQuietHours(now, subs[0].tz || DEFAULT_TZ)) { c.deferred += 1; continue; }
      if (memberHashes === undefined) memberHashes = await loadMemberEndpointHashes(sb, fetchImpl, today);
      if (!memberHashes) { c.errors += 1; continue; }
      if (subs.some((s) => memberHashes.has(s.endpoint_hash))) { c.deferred += 1; continue; }
    } else {
      if (!lastEmailCache.has(row.contact_id)) {
        lastEmailCache.set(row.contact_id, await getRows(sb, `${T_QUEUE}?contact_id=eq.${Number(row.contact_id)}&channel=eq.email&trigger_type=neq.${TRIGGER_ITINERARY_EMAIL}&status=eq.sent&sent_at=gte.${iso(now - EMAIL_SPACING_MS)}&select=id&limit=1`, fetchImpl));
      }
      const recent = lastEmailCache.get(row.contact_id);
      if (!recent) { c.errors += 1; continue; }
      if (recent.length) { c.deferred += 1; continue; }
    }

    // claim
    const claimed = await patchRows(sb, `${T_QUEUE}?id=eq.${row.id}&status=eq.pending&select=id`, { status: "sending", attempts: (Number(row.attempts) || 0) + 1 }, fetchImpl, true);
    if (!claimed) { c.errors += 1; continue; }
    if (!claimed.length) { c.lostClaim += 1; continue; }
    c.attempted += 1;
    try {
      if (row.channel === "email") await sendEmailRow({ sb, env, fetchImpl, now, row, c });
      else await sendPushRow({ sb, env, fetchImpl, now, row, c, send, vapid });
    } catch {
      c.errors += 1;
      await settle(sb, row.id, { status: "failed", cancelled_reason: "send_failed" }, fetchImpl, c);
    }
  }

  // 5. retention: the first run after 09:00 UTC (the 5 minute cron runs once in 09:00 to 09:04)
  const d = new Date(now);
  if (d.getUTCHours() === 9 && d.getUTCMinutes() < 5) {
    try {
      const r = await sbRest(sb, `${T_SIGNALS}?created_at=lt.${iso(now - SIGNAL_RETENTION_MS)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }, fetchImpl);
      c.retention = !!r.ok;
      if (!r.ok) c.errors += 1;
    } catch { c.errors += 1; }
  }
  return c;
}
