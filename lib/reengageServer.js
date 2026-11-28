// lib/reengageServer.js — SERVER-ONLY. The server half of Wayfind re-engagement:
// "email me this plan" now, plus up to three follow ups for the same trip.
//
//   planSnapshot / sanitizePlan   the plan as the SERVER built it, kept small
//   itineraryEmailMessage         the email, built ONLY from that snapshot
//   dripSchedule / enqueueDrip    the three follow up rows (+2h, +24h, +72h)
//   upsertContact                 one row per address, with the consent given
//   sendItineraryEmail            the immediate email, through Resend
//   withinWeeklyCap               the 7 day frequency cap
//   cancelPendingFor              stop queued messages (converted, unsubscribed)
//   unsubscribeContactByToken     one click opt out (idempotent)
//
// RULES THIS FILE KEEPS
//   * The address lives only in Supabase (service role) and in the Resend call.
//     It is never logged, never put in a URL we hand to a browser, never echoed.
//   * The message is built from the server held snapshot (reengage-plan:<ref> in
//     lib/serverCache). Nothing the visitor typed except the address and the
//     consent flag reaches the message, and sanitizePlan rebuilds the snapshot
//     from known fields only, so a stray field can never ride into an inbox.
//   * Every email carries a visible unsubscribe link, the RFC 8058 one click
//     header, and the postal line (CAN-SPAM).
//   * Every function takes its env and fetch as arguments so a test can call it
//     with stubs and assert on the result.
import { createHash, randomBytes } from "node:crypto";
import { sbEnv } from "./serverCache.js";
import { newToken } from "./newsletterServer.js";
import { NEWSLETTER_POSTAL, NEWSLETTER_REPLY_TO, isValidEmail, noDashes, normalizeEmail } from "./newsletter.js";
import { SITE_URL } from "./site.js";

export { isValidEmail, normalizeEmail };

export const CONSENT_VERSION = "trip-v1";
export const CONSENT_TEXT = "Email me this plan, plus up to 3 follow ups for this trip with directions and backup picks. Unsubscribe anytime.";
export const REENGAGE_FROM = "Wayfind <trips@gowayfind.com>";
export const TRIGGER_ITINERARY = "itinerary_abandoned";

export const PLAN_REF_RX = /^[a-f0-9]{32}$/;
export const ANON_ID_RX = /^[0-9a-f-]{36}$/;
export const TOKEN_RX = /^[a-f0-9]{64}$/;
export const PLAN_SNAPSHOT_TTL_MS = 7 * 24 * 3600 * 1000;
export const DRIP_OFFSETS_MS = Object.freeze([2 * 3600 * 1000, 24 * 3600 * 1000, 72 * 3600 * 1000]);
export const WEEK_MS = 7 * 24 * 3600 * 1000;

const T_CONTACTS = "wf_reengage_contacts";
const T_QUEUE = "wf_reengage_queue";
const T_SUPPRESS = "wf_reengage_suppressions";
const UTM = Object.freeze({ utm_source: "resend_lifecycle", utm_medium: "email", utm_campaign: "itinerary_email" });
// Same rule as lib/itineraryBuilderServer.js: only our own detail pages.
const HREF_RX = /^\/(?:p|places|florida-events|events)\/[A-Za-z0-9%._~:/-]+$/;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 7;
const MAX_STOPS_PER_DAY = 12;
const MAX_STOPS = 30;
const PAYLOAD_BUDGET = 12000; // table CHECK is 16000 bytes; keep headroom

export function newPlanRef() {
  return randomBytes(16).toString("hex");
}
export function planSnapshotKey(planRef) {
  return `reengage-plan:${planRef}`;
}

export function emailHash(email) {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

/** On only when the owner switched it on AND the stores it needs exist. */
export function reengageConfigured({ env = process.env, sb = sbEnv() } = {}) {
  return env.WF_REENGAGE_ENABLED === "1" && !!sb && !!String(env.RESEND_API_KEY || "").trim();
}

// ── the snapshot ────────────────────────────────────────────────────────────

const clean = (v, max) => (typeof v === "string"
  ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
  : "");
const inRange = (v, lo, hi) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

/**
 * Rebuild a plan from KNOWN fields only. Returns null when there is no stop to
 * show. Used on the way into the cache, the queue payload and the email, so the
 * shape is the same everywhere and an unknown field never survives.
 */
export function sanitizePlan(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.days)) return null;
  const area = clean(input.area, 60).toLowerCase();
  let total = 0;
  const days = [];
  for (const d of input.days.slice(0, MAX_DAYS)) {
    if (!d || typeof d !== "object" || !Array.isArray(d.stops)) continue;
    const stops = [];
    for (const s of d.stops.slice(0, MAX_STOPS_PER_DAY)) {
      if (total >= MAX_STOPS) break;
      if (!s || typeof s !== "object") continue;
      const id = clean(s.id == null ? "" : String(s.id), 80);
      const name = clean(s.name, 100);
      if (!id || !name) continue;
      const stop = { id, name };
      const address = clean(s.address, 160);
      if (address) stop.address = address;
      const city = clean(s.city, 60);
      if (city) stop.city = city;
      const lat = inRange(s.lat, -90, 90);
      const lng = inRange(s.lng, -180, 180);
      if (lat != null && lng != null && !(lat === 0 && lng === 0)) { stop.lat = lat; stop.lng = lng; }
      const url = typeof s.url === "string" ? s.url.trim() : "";
      if (url && url.length <= 200 && HREF_RX.test(url)) stop.url = url;
      stops.push(stop);
      total += 1;
    }
    if (stops.length) days.push({ label: clean(d.label, 40) || `Day ${days.length + 1}`, stops });
  }
  if (!days.length) return null;
  const plan = {
    area: /^[a-z0-9][a-z0-9-]*$/.test(area) ? area : "",
    areaName: clean(input.areaName, 80),
    when: typeof input.when === "string" && DATE_RX.test(input.when) ? input.when : null,
    days,
  };
  // Keep the whole thing inside the queue payload budget by dropping the tail.
  while (JSON.stringify(plan).length > PAYLOAD_BUDGET) {
    const last = plan.days[plan.days.length - 1];
    last.stops.pop();
    if (!last.stops.length) plan.days.pop();
    if (!plan.days.length) return null;
  }
  return plan;
}

const slugify = (s) => clean(s, 60).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * The snapshot of a successful /api/plan-my-day answer. PURE. `opts.area` and
 * `opts.areaName` come from the quick picks path; the notes path derives them
 * from the itinerary's own city. `when` is the resolved start date, never the
 * word "today" (a follow up three days later would read wrong).
 */
export function planSnapshot(out, opts = {}) {
  const it = out && out.ok !== false && out.itinerary;
  if (!it || !Array.isArray(it.days)) return null;
  const areaName = clean(opts.areaName || it.city, 80);
  return sanitizePlan({
    area: opts.area || slugify(areaName),
    areaName,
    when: typeof it.startDate === "string" ? it.startDate : null,
    days: it.days.map((d) => ({
      label: (d && (d.label || d.date)) || "",
      stops: ((d && d.stops) || []).map((s) => ({ id: s && s.id, name: s && s.name, address: s && s.address, city: s && s.city, lat: s && s.lat, lng: s && s.lng, url: s && s.href })),
    })),
  });
}

// ── the email ───────────────────────────────────────────────────────────────

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function tagged(base, path) {
  const u = new URL(path, base + "/");
  for (const [k, v] of Object.entries(UTM)) u.searchParams.set(k, v);
  return u.toString();
}

export function directionsUrl(stop) {
  const dest = typeof stop.lat === "number" && typeof stop.lng === "number"
    ? `${stop.lat},${stop.lng}`
    : encodeURIComponent([stop.name, stop.address || stop.city].filter(Boolean).join(", "));
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

export function unsubscribeUrl(token, siteUrl = SITE_URL) {
  return `${String(siteUrl).replace(/\/+$/, "")}/api/reengage/unsubscribe?t=${token}`;
}

function fmtDay(ymd) {
  if (!ymd) return "";
  const d = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Pure. Builds { subject, text, html } from the server snapshot, or returns null
 * when there is no plan to show or no valid unsubscribe token (we never build a
 * message that could not be opted out of).
 */
export function itineraryEmailMessage(planIn, { unsubscribeToken, env = process.env, siteUrl = SITE_URL } = {}) {
  const plan = sanitizePlan(planIn);
  if (!plan || !TOKEN_RX.test(String(unsubscribeToken || ""))) return null;
  const base = String(siteUrl || "https://www.gowayfind.com").replace(/\/+$/, "");
  const postal = String(env.NEWSLETTER_POSTAL || "").trim() || NEWSLETTER_POSTAL;
  const where = noDashes(plan.areaName);
  const when = fmtDay(plan.when);
  const subject = where ? `Your ${where} plan` : "Your Wayfind plan";
  const openUrl = tagged(base, "/plan-my-day");
  const unsubUrl = tagged(base, `/api/reengage/unsubscribe?t=${unsubscribeToken}`);
  const multi = plan.days.length > 1;
  let n = 0;
  const stopView = (s) => ({
    n: (n += 1),
    name: noDashes(s.name),
    place: noDashes(s.address || s.city || ""),
    dir: directionsUrl(s),
    page: s.url ? tagged(base, s.url) : "",
  });
  const days = plan.days.map((d) => ({ label: noDashes(d.label), stops: d.stops.map(stopView) }));
  const why = "You got this email because you asked for this plan on gowayfind.com. We may send up to 3 follow ups for this trip with directions and backup picks.";

  const text = [
    subject,
    when,
    "",
    ...days.flatMap((d) => [
      ...(multi ? [d.label, ""] : []),
      ...d.stops.flatMap((s) => [
        `${s.n}. ${s.name}`,
        ...(s.place ? [`   ${s.place}`] : []),
        `   Directions: ${s.dir}`,
        ...(s.page ? [`   Details: ${s.page}`] : []),
      ]),
      "",
    ]),
    `Open Wayfind: ${openUrl}`,
    "",
    why,
    `Unsubscribe: ${unsubUrl}`,
    postal,
  ].filter((l, i, a) => !(l === "" && (a[i - 1] === "" || i === 0))).join("\n");

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
<div style="max-width:560px;margin:0 auto;padding:24px 18px">
<div style="font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#F97316">Your Wayfind plan</div>
<h1 style="font-size:22px;line-height:1.25;margin:8px 0 6px">${esc(subject)}</h1>
${when ? `<p style="font-size:15px;line-height:1.5;color:#444;margin:0 0 18px">${esc(when)}</p>` : ""}
${days.map((d) => `${multi ? `<h2 style="font-size:16px;margin:18px 0 8px">${esc(d.label)}</h2>` : ""}${d.stops.map((s) => `<div style="background:#fff;border-radius:12px;padding:14px 16px;margin:0 0 10px;border:1px solid #e6e8ec">
<div style="font-size:16px;font-weight:800;color:#111">${s.page ? `<a href="${esc(s.page)}" style="color:#111;text-decoration:none">${s.n}. ${esc(s.name)}</a>` : `${s.n}. ${esc(s.name)}`}</div>
${s.place ? `<div style="font-size:14px;line-height:1.5;color:#444;margin-top:4px">${esc(s.place)}</div>` : ""}
<div style="margin-top:8px"><a href="${esc(s.dir)}" style="font-size:14px;font-weight:700;color:#F97316">Get directions</a></div>
</div>`).join("\n")}`).join("\n")}
<div style="text-align:center;margin:22px 0 14px"><a href="${esc(openUrl)}" style="display:inline-block;background:#F97316;color:#fff;font-weight:800;font-size:15px;padding:13px 22px;border-radius:12px;text-decoration:none">Open Wayfind</a></div>
<p style="font-size:12px;line-height:1.5;color:#888;margin:0 0 8px">${esc(why)}</p>
<p style="font-size:12px;line-height:1.5;color:#888;margin:0 0 8px"><a href="${esc(unsubUrl)}" style="color:#888">Unsubscribe</a></p>
<p style="font-size:12px;line-height:1.5;color:#888;margin:0">${esc(postal)}</p>
</div></body></html>`;

  return { subject, text, html };
}

/**
 * Sends the immediate email (what the reader asked for). Never throws.
 * Returns { sent, reason?, id? }. Resend's Idempotency-Key makes a double
 * submit of the same address and plan one message.
 */
export async function sendItineraryEmail({ to, plan, unsubscribeToken, planRef }, {
  env = process.env, fetchImpl = fetch, siteUrl = SITE_URL,
  report = (reason) => console.error("[reengage-email] " + reason),
} = {}) {
  try {
    const key = String(env.RESEND_API_KEY || "").trim();
    if (!key) { report("RESEND_API_KEY missing"); return { sent: false, reason: "unconfigured" }; }
    const addr = normalizeEmail(to);
    if (!isValidEmail(addr)) return { sent: false, reason: "bad_address" };
    const msg = itineraryEmailMessage(plan, { unsubscribeToken, env, siteUrl });
    if (!msg) return { sent: false, reason: "bad_plan" };
    const from = String(env.WF_REENGAGE_FROM || "").trim() || REENGAGE_FROM;
    const idem = "reengage/itinerary/" + createHash("sha256").update(addr + "|" + String(planRef || "")).digest("hex").slice(0, 40);
    const r = await fetchImpl("https://api.resend.com/emails", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", "Idempotency-Key": idem },
      body: JSON.stringify({
        from, to: [addr], reply_to: NEWSLETTER_REPLY_TO, subject: msg.subject, text: msg.text, html: msg.html,
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl(unsubscribeToken, siteUrl)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        tags: [{ name: "kind", value: "itinerary_email" }],
      }),
    });
    if (!r || !r.ok) { report("send refused: HTTP " + (r ? r.status : "none")); return { sent: false, reason: "send_failed" }; }
    const j = await r.json().catch(() => null);
    return { sent: true, id: j && typeof j.id === "string" ? j.id.slice(0, 120) : null };
  } catch (e) {
    report("send error: " + (e && e.message));
    return { sent: false, reason: "send_failed" };
  }
}

// ── the drip ────────────────────────────────────────────────────────────────

/** The three follow ups: +2h, +24h, +72h from `now` (a Date, ms or ISO string). */
export function dripSchedule(now = Date.now()) {
  const t0 = now instanceof Date ? now.getTime() : typeof now === "number" ? now : Date.parse(now);
  return DRIP_OFFSETS_MS.map((offsetMs, i) => ({ step: i + 1, offsetMs, scheduled_for: new Date(t0 + offsetMs).toISOString() }));
}

function rest(sb, path, init = {}, fetchImpl = fetch) {
  return fetchImpl(`${sb.url}/rest/v1/${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
    ...init,
    headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

/**
 * Queue the three follow ups for one trip. Idempotent: the table's unique key
 * (anon_id, trigger_type, channel, step, dedupe_key) plus ignore-duplicates
 * means a second call for the same plan adds nothing. The sanitized plan rides
 * in the payload so the follow ups outlive the 7 day cache snapshot.
 * Returns { ok, rows }. Never throws.
 */
export async function enqueueDrip({ anonId, contactId, planRef, plan }, { sb = sbEnv(), fetchImpl = fetch, now = Date.now() } = {}) {
  try {
    if (!sb) return { ok: false, rows: 0, reason: "unconfigured" };
    if (!ANON_ID_RX.test(String(anonId || "")) || !PLAN_REF_RX.test(String(planRef || ""))) return { ok: false, rows: 0, reason: "bad_input" };
    const snap = sanitizePlan(plan);
    if (!snap) return { ok: false, rows: 0, reason: "bad_plan" };
    const rows = dripSchedule(now).map((s) => ({
      anon_id: anonId,
      contact_id: Number.isFinite(Number(contactId)) ? Number(contactId) : null,
      trigger_type: TRIGGER_ITINERARY,
      channel: "email",
      step: s.step,
      dedupe_key: planRef,
      payload: { planRef, area: snap.area, plan: snap },
      scheduled_for: s.scheduled_for,
      status: "pending",
    }));
    const r = await rest(sb, `${T_QUEUE}?on_conflict=anon_id,trigger_type,channel,step,dedupe_key`, {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    }, fetchImpl);
    return r.ok ? { ok: true, rows: rows.length } : { ok: false, rows: 0, reason: "write_failed" };
  } catch (e) {
    console.error("[reengage] enqueue error", e && e.message);
    return { ok: false, rows: 0, reason: "error" };
  }
}

/**
 * True when this visitor may still be messaged on `channel`: fewer than `max`
 * messages SENT in the last 7 days. Fails CLOSED (false) on bad input or a read
 * error, because "could not check" must never mean "send".
 */
export async function withinWeeklyCap(anonId, channel, { max = 2, sb = sbEnv(), fetchImpl = fetch, now = Date.now() } = {}) {
  try {
    if (!sb || !ANON_ID_RX.test(String(anonId || "")) || !(channel === "email" || channel === "push") || !(max > 0)) return false;
    const since = new Date(now - WEEK_MS).toISOString();
    const r = await rest(sb, `${T_QUEUE}?anon_id=eq.${anonId}&channel=eq.${channel}&status=eq.sent&sent_at=gte.${encodeURIComponent(since)}&select=id&limit=${Math.floor(max)}`, {}, fetchImpl);
    if (!r.ok) return false;
    const rows = await r.json().catch(() => null);
    return Array.isArray(rows) && rows.length < max;
  } catch {
    return false;
  }
}

/**
 * Stop every PENDING message for a visitor (or, with opts.contactId, for one
 * contact). reason "converted" marks them suppressed_converted (the reader
 * already did the thing); anything else marks them cancelled. Never throws.
 */
export async function cancelPendingFor(anonId, reason, { contactId = null, sb = sbEnv(), fetchImpl = fetch } = {}) {
  try {
    if (!sb) return { ok: false };
    const why = clean(String(reason || "cancelled"), 80) || "cancelled";
    let filter;
    if (contactId != null && Number.isFinite(Number(contactId))) filter = `contact_id=eq.${Number(contactId)}`;
    else if (ANON_ID_RX.test(String(anonId || ""))) filter = `anon_id=eq.${anonId}`;
    else return { ok: false };
    const r = await rest(sb, `${T_QUEUE}?${filter}&status=eq.pending`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: why === "converted" ? "suppressed_converted" : "cancelled", cancelled_reason: why }),
    }, fetchImpl);
    return { ok: r.ok };
  } catch {
    return { ok: false };
  }
}

// ── contacts and suppression ────────────────────────────────────────────────

/** Is this address on the suppression list? { ok, suppressed }. ok:false on a read error. */
export async function isEmailSuppressed(email, { sb = sbEnv(), fetchImpl = fetch } = {}) {
  try {
    if (!sb) return { ok: false, suppressed: false };
    const r = await rest(sb, `${T_SUPPRESS}?email_hash=eq.${emailHash(email)}&select=id&limit=1`, {}, fetchImpl);
    if (!r.ok) return { ok: false, suppressed: false };
    const rows = await r.json().catch(() => null);
    return Array.isArray(rows) ? { ok: true, suppressed: rows.length > 0 } : { ok: false, suppressed: false };
  } catch {
    return { ok: false, suppressed: false };
  }
}

/**
 * Save the address with the consent it gave. A NEW row mints the unsubscribe
 * token. An existing subscribed row has its consent refreshed and keeps its
 * token. An existing unsubscribed, bounced or complained row is left exactly as
 * it is: asking for a plan again does not undo an opt out.
 * Returns { ok, created, contact: { id, status, unsubscribe_token } }. Never throws.
 */
export async function upsertContact({ email, anonId, page = null }, { sb = sbEnv(), fetchImpl = fetch, now = Date.now() } = {}) {
  try {
    const e = normalizeEmail(email);
    if (!isValidEmail(e)) return { ok: false, reason: "bad_email" };
    if (!sb) return { ok: false, reason: "unconfigured" };
    const anon = ANON_ID_RX.test(String(anonId || "")) ? anonId : null;
    const pg = typeof page === "string" && page.startsWith("/") && !page.startsWith("//") ? page.slice(0, 200) : null;
    const at = new Date(now).toISOString();
    const sel = "id,status,unsubscribe_token";
    const find = async () => {
      const r = await rest(sb, `${T_CONTACTS}?select=${sel}&email=eq.${encodeURIComponent(e)}&limit=1`, {}, fetchImpl);
      if (!r.ok) return { err: true };
      const rows = await r.json().catch(() => null);
      return Array.isArray(rows) ? { row: rows[0] || null } : { err: true };
    };
    const consent = { anon_id: anon, consent_text: CONSENT_TEXT, consent_version: CONSENT_VERSION, consent_page: pg, consented_at: at, updated_at: at };

    const first = await find();
    if (first.err) return { ok: false, reason: "read_failed" };
    if (first.row) {
      if (first.row.status === "subscribed") {
        const up = await rest(sb, `${T_CONTACTS}?id=eq.${Number(first.row.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(consent) }, fetchImpl);
        if (!up.ok) return { ok: false, reason: "write_failed" };
      }
      return { ok: true, created: false, contact: first.row };
    }
    const ins = await rest(sb, `${T_CONTACTS}?on_conflict=email&select=${sel}`, {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ email: e, unsubscribe_token: newToken(), status: "subscribed", ...consent }),
    }, fetchImpl);
    if (!ins.ok) return { ok: false, reason: "write_failed" };
    const made = await ins.json().catch(() => null);
    if (Array.isArray(made) && made[0]) return { ok: true, created: true, contact: made[0] };
    // A parallel request created it first: read theirs.
    const again = await find();
    if (again.err || !again.row) return { ok: false, reason: "read_failed" };
    return { ok: true, created: false, contact: again.row };
  } catch (err) {
    console.error("[reengage] contact error", err && err.message);
    return { ok: false, reason: "error" };
  }
}

/**
 * One click opt out by token. Flips the contact to unsubscribed, records a
 * suppression (idempotent), and cancels that contact's pending messages. The
 * sender must still re-check the contact's status at send time. Returns
 * { ok, found }; ok:false only when the database could not be reached. Never throws.
 */
export async function unsubscribeContactByToken(token, { sb = sbEnv(), fetchImpl = fetch, now = Date.now() } = {}) {
  try {
    if (!TOKEN_RX.test(String(token || ""))) return { ok: false, found: false };
    if (!sb) return { ok: false, found: false };
    const at = new Date(now).toISOString();
    const r = await rest(sb, `${T_CONTACTS}?unsubscribe_token=eq.${token}&select=id,email,anon_id`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "unsubscribed", unsubscribed_at: at, updated_at: at }),
    }, fetchImpl);
    if (!r.ok) return { ok: false, found: false };
    const rows = await r.json().catch(() => null);
    if (!Array.isArray(rows)) return { ok: false, found: false };
    if (!rows.length) return { ok: true, found: false };
    const c = rows[0];
    await cancelPendingFor(c.anon_id, "unsubscribed", { contactId: c.id, sb, fetchImpl });
    await rest(sb, `${T_SUPPRESS}?on_conflict=provider_event_id`, {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ contact_id: c.id, email_hash: emailHash(c.email), anon_id: ANON_ID_RX.test(String(c.anon_id || "")) ? c.anon_id : null, kind: "unsubscribe", source: "one_click", provider_event_id: `unsub:${c.id}` }),
    }, fetchImpl);
    return { ok: true, found: true };
  } catch (err) {
    console.error("[reengage] unsubscribe error", err && err.message);
    return { ok: false, found: false };
  }
}
