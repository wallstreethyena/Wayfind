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
  const r = await fetch(`${s.url}/rest/v1/wf_cc_settings?k=eq.${encodeURIComponent(key)}&select=v`, {
    headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store",
  });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return rows && rows[0] ? rows[0].v : null;
}

async function settingsPut(s, key, value) {
  await fetch(`${s.url}/rest/v1/wf_cc_settings?on_conflict=k`, {
    method: "POST",
    headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ k: key, v: value }),
  }).catch(() => {});
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
  const { alerts } = await gatherAlerts(now);
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
  }).catch(() => null);

  const ok = !!(r && r.ok);
  if (ok && s) {
    for (const a of due) sent[a.id] = now.toISOString();
    // prune entries older than 7 days so the blob stays tiny
    for (const [id, ts] of Object.entries(sent)) { if (now.getTime() - Date.parse(ts) > 7 * 86400000) delete sent[id]; }
    await settingsPut(s, "cc_alerts_sent", sent);
  }
  return Response.json({ ok, alerts: actionable.length, sent: ok ? due.length : 0, emailStatus: r ? r.status : "network_error" });
}
