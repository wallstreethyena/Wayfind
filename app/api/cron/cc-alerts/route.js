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

const COOLDOWN_MS = { critical: 2 * 3600000, warn: 6 * 3600000 };

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

export async function GET(req) {
  // Fail-closed cron auth (same as /api/cron/cwv).
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return new Response("unauthorized", { status: 401 });

  const resendKey = String(process.env.RESEND_API_KEY || "").trim();
  const to = String(process.env.DIGEST_EMAIL || "").trim();
  if (!resendKey || !to) return Response.json({ idle: true, reason: "RESEND_API_KEY or DIGEST_EMAIL not set" });

  const now = new Date();
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
    return Response.json({ ok: false, stage: "gather_alerts", error: String(e && e.message || e).slice(0, 200) }, { status: 500 });
  }
  const actionable = alerts.filter((a) => a.severity === "critical" || a.severity === "warn");
  if (!actionable.length) return Response.json({ ok: true, alerts: 0, sent: false });

  // Cooldown bookkeeping (fail-open: if settings are unreachable we still send).
  const s = sbAdmin();
  let sent = {};
  if (s) sent = (await settingsGet(s, "cc_alerts_sent")) || {};
  const due = actionable.filter((a) => {
    const last = Date.parse(sent[a.id] || 0) || 0;
    return now.getTime() - last > (COOLDOWN_MS[a.severity] || COOLDOWN_MS.warn);
  });
  if (!due.length) return Response.json({ ok: true, alerts: actionable.length, sent: false, reason: "all in cooldown" });

  const from = String(process.env.WF_ALERT_FROM || "Wayfind Alerts <onboarding@resend.dev>").trim();
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
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
  if (ok && s) {
    for (const a of due) sent[a.id] = now.toISOString();
    // prune entries older than 7 days so the blob stays tiny
    for (const [id, ts] of Object.entries(sent)) { if (now.getTime() - Date.parse(ts) > 7 * 86400000) delete sent[id]; }
    await settingsPut(s, "cc_alerts_sent", sent);
  }
  return Response.json({ ok, alerts: actionable.length, sent: ok ? due.length : 0, emailStatus: r ? r.status : "network_error" });
}
