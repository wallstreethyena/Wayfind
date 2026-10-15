// /api/cron/cc-alerts — the alerts panel that finds the OWNER. Runs on the
// Vercel cron (vercel.json), evaluates the exact same alert rules as the
// dashboard (lib/commandCenter/alertsRun.js — one source of truth), and
// emails critical/warn alerts to DIGEST_EMAIL via Resend.
//
// Fail-closed on auth (same CRON_SECRET bearer pattern as /api/cron/cwv);
// fail-soft on capability: no RESEND_API_KEY or DIGEST_EMAIL => {idle} —
// the dashboard's in-page alerts keep working regardless.
//
// Anti-noise: each alert id is re-sent at most once per cooldown (critical
// 2h, warn 6h; info never emailed). Send-state lives in wf_cc_settings
// ('cc_alerts_sent') so warm-lambda restarts can't double-send.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { gatherAlerts } from "../../../../lib/commandCenter/alertsRun.js";
import { sbAdmin } from "../../../../lib/commandCenter/supabaseAdmin.js";
import { SITE_URL } from "../../../../lib/site.js";
import { resolveOverride } from "../../../../lib/envAudit.js";
import { siteTodayStr } from "../../../../lib/siteTime.js";
import { recordPulse } from "../../../../lib/jobPulse.js";

const COOLDOWN_MS = { critical: 2 * 3600000, warn: 6 * 3600000 };
const JOB = "cc-alerts";

async function settingsGet(s, key) {
  // v6.71: an unguarded network exception here (fetch rejecting outright, not
  // just resolving !ok) used to bubble past the "fail-open" comment's intent
  // and crash the whole cron with an unlabeled 500 instead of falling back to
  // {} like a missing row does.
  let r;
  try {
    r = await fetch(`${s.url}/rest/v1/wf_cc_settings?k=eq.${encodeURIComponent(key)}&select=v`, {
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store",
    });
  } catch (e) {
    try { console.error(JSON.stringify({ tag: "cc_alerts_cron", ok: false, stage: "settings_get_exception", key, error: String(e && e.message || e).slice(0, 200) })); } catch (e2) {}
    return null;
  }
  if (!r.ok) {
    let body = ""; try { body = (await r.text()).slice(0, 500); } catch (e) {}
    try { console.error(JSON.stringify({ tag: "cc_alerts_cron", ok: false, stage: "settings_get", key, status: r.status, body })); } catch (e) {}
    return null;
  }
  const rows = await r.json().catch(() => []);
  return rows && rows[0] ? rows[0].v : null;
}

async function settingsPut(s, key, value) {
  const r = await fetch(`${s.url}/rest/v1/wf_cc_settings?on_conflict=k`, {
    method: "POST",
    cache: "no-store",
    headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ k: key, v: value }),
  }).catch((e) => { try { console.error(JSON.stringify({ tag: "cc_alerts_cron", ok: false, stage: "settings_put_exception", key, error: String(e && e.message || e).slice(0, 200) })); } catch (e2) {} return null; });
  // v6.71: this fetch had no failure visibility -- a rejected write here means
  // the next run re-sends alerts that already went out (cooldown state never
  // persisted), which looked like "duplicate emails" from the outside with
  // nothing in the logs to explain why. Log non-ok responses same as the
  // exception path above.
  if (r && !r.ok) {
    let body = ""; try { body = (await r.text()).slice(0, 500); } catch (e) {}
    try { console.error(JSON.stringify({ tag: "cc_alerts_cron", ok: false, stage: "settings_put", key, status: r.status, body })); } catch (e) {}
  }
}

const esc = (t) => String(t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function emailHtml(alerts, now) {
  const sev = { critical: "#EF4444", warn: "#FBBF24" };
  const rows = alerts.map((a) => `
    <tr>
      <td style="padding:10px 12px;border-left:3px solid ${sev[a.severity] || "#38BDF8"};background:#161B22;border-radius:8px">
        <div style="font-weight:700;color:#F1F5F9;font-size:14px">${esc(a.title)} <span style="color:#94A3B8;font-size:11px;text-transform:uppercase">· ${esc(a.severity)}</span></div>
        <div style="color:#94A3B8;font-size:12.5px;line-height:1.5;margin-top:3px">${esc(a.detail)}</div>
        ${a.current != null ? `<div style="color:#CBD5E1;font-size:12px;margin-top:3px">now: <b>${esc(a.current)}</b>${a.baseline != null ? ` · baseline: ${esc(a.baseline)}` : ""}</div>` : ""}
      </td>
    </tr><tr><td style="height:8px"></td></tr>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#0D1117;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
    <div style="max-width:560px;margin:0 auto">
      <div style="color:#F97316;font-weight:800;font-size:12px;letter-spacing:.6px;text-transform:uppercase">Wayfind · Command Center</div>
      <h1 style="color:#F1F5F9;font-size:19px;margin:6px 0 14px">${alerts.length} alert${alerts.length > 1 ? "s" : ""} need${alerts.length > 1 ? "" : "s"} your eyes</h1>
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      <a href="${SITE_URL}/command-center#alerts" style="display:inline-block;margin-top:14px;background:#F97316;color:#0D1117;font-weight:800;font-size:13px;padding:10px 16px;border-radius:10px;text-decoration:none">Open the Command Center</a>
      <div style="color:#8B98A9;font-size:11px;margin-top:14px">Sent ${esc(now.toISOString())} · cooldowns: critical 2h, warn 6h · info-level items are never emailed.</div>
    </div></body></html>`;
}

// The ONE delivery function: real alerts and the drill both go through here
// (no parallel sender). Returns { ok, r } where r is the Resend Response|null.
async function deliverAlerts({ resendKey, from, to, due, now }) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    cache: "no-store",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: [to],
      subject: `⚠ Wayfind: ${due[0].title}${due.length > 1 ? ` (+${due.length - 1} more)` : ""}`,
      html: emailHtml(due, now),
    }),
  }).catch((e) => {
    try { console.error(JSON.stringify({ tag: "cc_alerts_cron", ok: false, stage: "resend_fetch_exception", error: String(e && e.message || e).slice(0, 200) })); } catch (e2) {}
    return null;
  });

  const ok = !!(r && r.ok);
  if (!ok) {
    // v6.71: a non-network Resend failure (bad key, suspended domain, 4xx
    // payload issue) previously fell through silently -- `ok` just came back
    // false with no body captured anywhere. Log the actual response so a
    // revoked/expired RESEND_API_KEY shows up instead of alerts quietly never
    // arriving.
    let body = "";
    if (r) { try { body = (await r.text()).slice(0, 500); } catch (e) {} }
    try { console.error(JSON.stringify({ tag: "cc_alerts_cron", ok: false, stage: "resend_send", status: r ? r.status : "network_error", body, dueCount: due.length })); } catch (e) {}
  } else {
    try { console.log(JSON.stringify({ tag: "cc_alerts_cron", ok: true, sent: due.length, ids: due.map((a) => a.id) })); } catch (e) {}
  }
  return { ok, r };
}

// Alert-delivery drill (zero spend, reversible): one synthetic alert through the
// real sender. Allow-listed ids only; see scripts/test-cc-alert-drill.mjs.
const DRILL_KEY = "cc_alerts_drill_sent";   // separate from real cooldowns ("cc_alerts_sent")
const DRILL_COOLDOWN_MS = 10 * 60000;
const DRILLS = {
  photos_not_serving(now) {
    const day = siteTodayStr(now);
    return {
      id: "drill:photos_not_serving", severity: "warn",
      title: "[DRILL] Most place-photo requests are being refused",
      detail: `SYNTHETIC DRILL, nothing is actually wrong. Subsystem: photos. Failure class: ledger-denied (simulated). Count: 0 served vs 999 refused. Site day (ET): ${day}. Generated at ${now.toISOString()}. Real-alert recovery guidance: cards fall back to initials until this clears; usual cause is the photo budget (GOOGLE_PHOTOS_MONTH_CAP / WAYFIND_PHOTOS_PAID in Vercel) exhausted, invalid, or lower than this month's usage in wf_spend_ledger (sku=photos). Open ${SITE_URL}/command-center#health`,
      anchor: "health", current: "0 served / 999 refused (drill)", baseline: "photos served daily",
    };
  },
};

async function runDrill(drillId, { resendKey, to, now }) {
  const alert = DRILLS[drillId](now);
  const s = sbAdmin();
  const last = s ? Date.parse(((await settingsGet(s, DRILL_KEY)) || {})[drillId] || 0) || 0 : 0;
  const head = { drill: true, alert: { id: alert.id, title: alert.title }, at: now.toISOString() };
  if (now.getTime() - last < DRILL_COOLDOWN_MS) {
    return { body: { ...head, delivered: false, reason: "drill_cooldown_10min", provider_status: null }, pulse: { attempted: 0, succeeded: 0, failed: 0, note: "healthy idle: drill suppressed, in 10-min drill cooldown" } };
  }
  const from = resolveOverride("WF_ALERT_FROM").value;
  const { ok, r } = await deliverAlerts({ resendKey, from, to, due: [alert], now });
  if (ok && s) await settingsPut(s, DRILL_KEY, { [drillId]: now.toISOString() });
  return {
    body: { ...head, delivered: ok, provider_status: r ? r.status : "network_error" },
    pulse: { attempted: 1, succeeded: ok ? 1 : 0, note: ok ? "drill: delivered" : `drill: email send failed (status ${r ? r.status : "network_error"})`.slice(0, 200) },
  };
}

// Secretless drill trigger: the hourly run honours a wf_cc_settings request row
// (k='cc_alerts_drill_request', {id, requested_at}). Additive and fail-soft: runs
// AFTER the real alerts, same runDrill/deliverAlerts path and 10-min drill
// cooldown. Row is deleted only after a delivery attempt succeeded (or when it is
// stale/unknown/malformed); a failed send keeps it and says so in the pulse note.
const DRILL_REQUEST_KEY = "cc_alerts_drill_request";
const DRILL_REQUEST_MAX_AGE_MS = 3 * 3600000;

async function settingsDelete(s, key) {
  try {
    const r = await fetch(`${s.url}/rest/v1/wf_cc_settings?k=eq.${encodeURIComponent(key)}`, {
      method: "DELETE", cache: "no-store",
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, Prefer: "return=minimal" },
    });
    if (!r.ok) { try { console.error(JSON.stringify({ tag: "cc_alerts_cron", ok: false, stage: "drill_request_delete", status: r.status })); } catch (e) {} }
    return !!r.ok;
  } catch (e) {
    try { console.error(JSON.stringify({ tag: "cc_alerts_cron", ok: false, stage: "drill_request_delete_exception", error: String(e && e.message || e).slice(0, 200) })); } catch (e2) {}
    return false;
  }
}

async function processDrillRequest({ resendKey, to, now }) {
  try {
    const s = sbAdmin();
    if (!s) return;
    const req = await settingsGet(s, DRILL_REQUEST_KEY);
    if (!req) return;
    const id = req && typeof req === "object" ? req.id : null;
    const at = req && typeof req === "object" ? Date.parse(req.requested_at) : NaN;
    const known = typeof id === "string" && Object.prototype.hasOwnProperty.call(DRILLS, id);
    const fresh = Number.isFinite(at) && now.getTime() - at <= DRILL_REQUEST_MAX_AGE_MS && at <= now.getTime() + 5 * 60000;
    if (!known || !fresh) {
      await settingsDelete(s, DRILL_REQUEST_KEY);
      try { await recordPulse(JOB, { attempted: 0, succeeded: 0, failed: 0, note: `healthy idle: drill request discarded (${known ? "stale" : "unknown or malformed"})` }); } catch (e) {}
      return;
    }
    const d = await runDrill(id, { resendKey, to, now });
    if (d.body.delivered || d.body.reason) await settingsDelete(s, DRILL_REQUEST_KEY);   // attempt made, or satisfied by a drill <10 min ago
    try { await recordPulse(JOB, d.pulse); } catch (e) {}
  } catch (e) {
    try { console.error(JSON.stringify({ tag: "cc_alerts_cron", ok: false, stage: "drill_request", error: String(e && e.message || e).slice(0, 200) })); } catch (e2) {}
  }
}

export async function GET(req) {
  // Fail-closed cron auth (same as /api/cron/cwv).
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return new Response("unauthorized", { status: 401 });

  // Drill mode: only when ?drill= is present; no param => untouched hourly path.
  let drillId = null;
  try {
    const sp = new URL(req.url).searchParams;
    if (sp.has("drill")) {
      drillId = sp.get("drill");
      if (!Object.prototype.hasOwnProperty.call(DRILLS, drillId)) {
        try { await recordPulse(JOB, { attempted: 0, succeeded: 0, failed: 0, note: "healthy idle: rejected unknown drill id (400)" }); } catch (e2) {}
        return Response.json({ error: "unknown drill id", allowed: Object.keys(DRILLS) }, { status: 400 });
      }
    }
  } catch (e) {}

  const resendKey = String(process.env.RESEND_API_KEY || "").trim();
  const to = resolveOverride("DIGEST_EMAIL").value;
  if (!resendKey || !to) {
    try { await recordPulse(JOB, { attempted: 0, succeeded: 0, failed: 0, note: "healthy idle: RESEND_API_KEY or DIGEST_EMAIL not set" }); } catch (e) {}
    return Response.json({ idle: true, reason: "RESEND_API_KEY or DIGEST_EMAIL not set" });
  }

  const now = new Date();
  if (drillId) {
    const d = await runDrill(drillId, { resendKey, to, now });
    try { await recordPulse(JOB, d.pulse); } catch (e) {}
    return Response.json(d.body);
  }
  // v6.71: gatherAlerts() ran unguarded -- any exception inside the rule
  // engine or one of its upstream panel fetches bubbled up as a bare 500 with
  // no context, indistinguishable in Vercel's logs from every other route
  // crash. Same structured-tag convention as /api/cron/cwv so a broken source
  // shows up as "cc_alerts_cron" instead of vanishing.
  let alerts;
  try {
    ({ alerts } = await gatherAlerts(now));
  } catch (e) {
    try { console.error(JSON.stringify({ tag: "cc_alerts_cron", ok: false, stage: "gather_alerts", error: String(e && e.message || e).slice(0, 300) })); } catch (e2) {}
    try { await recordPulse(JOB, { attempted: 0, succeeded: 0, failed: 1, note: `unavailable: gather_alerts failed: ${String(e && e.message || e)}`.slice(0, 200) }); } catch (e3) {}
    // (no drill hook here: a drill pulse must not mask a real gather failure)
    return Response.json({ ok: false, stage: "gather_alerts", error: String(e && e.message || e).slice(0, 200) }, { status: 500 });
  }
  const actionable = alerts.filter((a) => a.severity === "critical" || a.severity === "warn");
  if (!actionable.length) {
    try { await recordPulse(JOB, { attempted: 0, succeeded: 0, failed: 0, note: "healthy idle: no critical/warn alerts to send" }); } catch (e) {}
    await processDrillRequest({ resendKey, to, now });
    return Response.json({ ok: true, alerts: 0, sent: false });
  }

  // Cooldown bookkeeping (fail-open: if settings are unreachable we still send).
  const s = sbAdmin();
  let sent = {};
  if (s) sent = (await settingsGet(s, "cc_alerts_sent")) || {};
  const due = actionable.filter((a) => {
    // dedupeKey (optional) lets an alert cool down per variant, e.g. per quota band; default stays the id.
    const last = Date.parse(sent[a.dedupeKey || a.id] || 0) || 0;
    return now.getTime() - last > (COOLDOWN_MS[a.severity] || COOLDOWN_MS.warn);
  });
  if (!due.length) {
    try { await recordPulse(JOB, { attempted: 0, succeeded: 0, failed: 0, note: `healthy idle: ${actionable.length} alert(s) already sent, in cooldown` }); } catch (e) {}
    await processDrillRequest({ resendKey, to, now });
    return Response.json({ ok: true, alerts: actionable.length, sent: false, reason: "all in cooldown" });
  }

  const from = resolveOverride("WF_ALERT_FROM").value;
  const { ok, r } = await deliverAlerts({ resendKey, from, to, due, now });
  if (ok && s) {
    for (const a of due) sent[a.dedupeKey || a.id] = now.toISOString();
    // prune entries older than 7 days so the blob stays tiny
    for (const [id, ts] of Object.entries(sent)) { if (now.getTime() - Date.parse(ts) > 7 * 86400000) delete sent[id]; }
    await settingsPut(s, "cc_alerts_sent", sent);
  }
  try {
    await recordPulse(JOB, {
      attempted: due.length,
      succeeded: ok ? due.length : 0,
      note: ok ? null : `email send failed (status ${r ? r.status : "network_error"})`.slice(0, 200),
    });
  } catch (e) {}
  await processDrillRequest({ resendKey, to, now });
  return Response.json({ ok, alerts: actionable.length, sent: ok ? due.length : 0, emailStatus: r ? r.status : "network_error" });
}
