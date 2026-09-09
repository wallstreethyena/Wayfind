// Shared owner report for the dashboard and daily email. Business results use
// the last complete ET day; the synthetic checks are measured when gathered.

import { rangeFor, dayStr, SITE_TZ } from "./time.js";
import * as fp from "./sources/firstParty.js";
import { tpStats } from "./sources/travelpayouts.js";
import { selfCheck } from "./sources/synthetic.js";

const DASHBOARD_URL = "https://www.gowayfind.com/command-center";
const UNKNOWN_NOTE = "Unknown means the source was unavailable or omitted that field; it is not a measured zero.";

const number = (value) => {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const integer = (value) => value === null ? "unknown" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
const money = (value) => value === null ? "unknown" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

function errorSource(name, note, now) {
  return { name, connected: false, reason: "error", note: String(note || "collection failed").slice(0, 300), fetchedAt: now.toISOString(), confidence: "unavailable" };
}

function validResult(result, name, now) {
  return result && result.source && Object.prototype.hasOwnProperty.call(result, "data")
    ? result : { source: errorSource(name, "source returned an invalid response", now), data: null };
}

async function bounded(name, collect, timeoutMs, now) {
  let timer;
  try {
    return validResult(await Promise.race([
      Promise.resolve().then(collect),
      new Promise((resolve) => { timer = setTimeout(() => resolve({ source: errorSource(name, `collection exceeded ${timeoutMs}ms`, now), data: null }), timeoutMs); }),
    ]), name, now);
  } catch (error) {
    return { source: errorSource(name, error && error.message, now), data: null };
  } finally {
    clearTimeout(timer);
  }
}

function item(id, title, detail, nextStep, source, anchor, status = "needs_change") {
  return { id, title, detail, nextStep, status, anchor, source };
}

function sumSignups(rows) {
  if (!Array.isArray(rows)) return null;
  let sum = 0;
  for (const row of rows) {
    const value = number(row && row.signups);
    if (value === null) return null;
    sum += value;
  }
  return sum;
}

function checksFrom(data) {
  if (!data || !Array.isArray(data.checks)) return null;
  return data.checks.map((check, index) => ({
    key: String((check && check.key) || `check_${index + 1}`),
    name: String((check && (check.label || check.name)) || `Check ${index + 1}`),
    ok: !!(check && check.ok === true),
    status: number(check && check.status),
    ms: number(check && check.ms),
    error: check && check.error ? String(check.error) : null,
  }));
}

function distinct(rows) {
  const seen = new Set();
  return rows.filter((row) => !seen.has(row.id) && seen.add(row.id));
}

export function buildOwnerBriefing({ now = new Date(), period, results = {}, operations = null } = {}) {
  const window = period || rangeFor("yesterday", now);
  const generatedAt = now.toISOString();
  const dateKey = dayStr(window.from);
  const kpis = validResult(results.kpis, "Supabase (first-party events)", now);
  const signupResult = validResult(results.signups, "Supabase Auth signups", now);
  const healthResult = validResult(results.health, "Synthetic check (this server to production)", now);
  const affiliateResult = validResult(results.affiliate, "Travelpayouts", now);
  const k = kpis.data && typeof kpis.data === "object" ? kpis.data : null;
  const tp = affiliateResult.data && typeof affiliateResult.data === "object" ? affiliateResult.data : null;
  const paidFieldVerified = !!(tp && Array.isArray(tp.fields_used) && tp.fields_used.includes("paid_profit_usd"));
  const checks = healthResult.source.connected === true ? checksFrom(healthResult.data) : null;
  const signupCount = signupResult.source.connected === true ? sumSignups(signupResult.data) : null;
  const metrics = {
    traffic: { visitors: null, deviceCount: kpis.source.connected === true ? number(k && k.active_devices) : null, sessions: kpis.source.connected === true ? number(k && k.sessions) : null, label: "First-party browsers and devices", source: kpis.source, note: "One person can count more than once across browsers and devices." },
    engagement: {
      detailOpens: kpis.source.connected === true ? number(k && k.detail_opens) : null,
      saves: kpis.source.connected === true ? number(k && k.saves) : null,
      shares: kpis.source.connected === true ? number(k && k.shares) : null,
      directions: kpis.source.connected === true ? number(k && k.directions) : null,
      outClicks: kpis.source.connected === true ? number(k && k.out_clicks) : null,
      source: kpis.source,
    },
    signups: { count: signupCount, source: signupResult.source },
    affiliate: {
      confirmedBookings: affiliateResult.source.connected === true ? number(tp && tp.confirmed_bookings) : null,
      paidEarningsUsd: affiliateResult.source.connected === true && paidFieldVerified ? number(tp && tp.revenue_paid_usd) : null,
      pendingEarningsUsd: affiliateResult.source.connected === true && paidFieldVerified ? number(tp && tp.revenue_pending_usd) : null,
      source: affiliateResult.source, providerCalendarDate: dateKey,
      definition: "Bookings and earnings are provider-confirmed by Travelpayouts. Clicks are never treated as bookings or earnings.",
    },
  };
  const workingWell = [];
  const failures = [];
  const missing = [];

  if (checks && checks.length) {
    const bad = checks.filter((check) => !check.ok);
    if (!bad.length) workingWell.push(`All ${checks.length} production checks passed when checked now.`);
    for (const check of bad) failures.push(item(
      `health-${check.key}`, `${check.name} failed its current health check`,
      check.error || (check.status === null ? "No HTTP status was returned." : `HTTP ${check.status}${check.ms === null ? "." : ` in ${check.ms}ms.`}`),
      "Open Health, check the failed page or service, and restore it.", healthResult.source, "health",
    ));
  } else missing.push(item("missing-health", "Current site health is unknown", "The automatic checks did not return a result.", "Open Health and run the automatic checks again.", healthResult.source, "health", "unknown"));

  if (metrics.traffic.deviceCount === null || metrics.traffic.sessions === null) {
    missing.push(item("missing-traffic", "Yesterday's traffic is unknown", "Browser, device, or visit totals were unavailable.", "Check the traffic connection in Visitors.", kpis.source, "traffic", "unknown"));
  } else if (metrics.traffic.deviceCount > 0 || metrics.traffic.sessions > 0) {
    workingWell.push(`Wayfind measured ${integer(metrics.traffic.deviceCount)} browsers and devices and ${integer(metrics.traffic.sessions)} visits yesterday. One person can count more than once across browsers and devices.`);
  }
  const engagementValues = [metrics.engagement.detailOpens, metrics.engagement.saves, metrics.engagement.shares, metrics.engagement.directions, metrics.engagement.outClicks];
  if (engagementValues.some((value) => value === null)) missing.push(item("missing-engagement", "Yesterday's product actions are unknown", "Place pages opened, saves, shares, directions, or partner clicks were unavailable.", "Check the tracking connection in Visitors.", kpis.source, "journey", "unknown"));
  else if (engagementValues.some((value) => value > 0)) workingWell.push(`${integer(metrics.engagement.detailOpens)} place pages opened, ${integer(metrics.engagement.saves)} saves, ${integer(metrics.engagement.shares)} shares, and ${integer(metrics.engagement.outClicks)} partner clicks were measured yesterday.`);

  if (signupCount === null || signupResult.source.connected !== true) missing.push(item("missing-signups", "Yesterday's signups are unknown", "The signup total was unavailable or invalid.", "Check the signup connection in Signups.", signupResult.source, "retention", "unknown"));
  else if (signupCount > 0) workingWell.push(`${integer(signupCount)} account signup${signupCount === 1 ? "" : "s"} were recorded yesterday.`);

  if (metrics.affiliate.confirmedBookings === null || metrics.affiliate.paidEarningsUsd === null) {
    missing.push(item("missing-affiliate", "Confirmed bookings and paid earnings are unknown", paidFieldVerified ? "Travelpayouts did not provide provider-confirmed totals. Partner clicks are not used as a substitute." : "Travelpayouts did not confirm the paid commission field. Partner clicks are not used as a substitute.", "Check the earnings connection in Places & tickets.", affiliateResult.source, "places", "unknown"));
  } else if (metrics.affiliate.confirmedBookings > 0 || metrics.affiliate.paidEarningsUsd > 0) {
    workingWell.push(`Travelpayouts confirmed ${integer(metrics.affiliate.confirmedBookings)} booking${metrics.affiliate.confirmedBookings === 1 ? "" : "s"} and ${money(metrics.affiliate.paidEarningsUsd)} in paid earnings yesterday.`);
  }

  const routine = [
    item("routine-traffic", "Review yesterday's audience quality", `${integer(metrics.traffic.deviceCount)} browsers and devices created ${integer(metrics.traffic.sessions)} visits.`, "Open Visitors and compare how people arrived with what they did.", kpis.source, "traffic", "routine"),
    item("routine-conversion", "Review the path to a partner", `${integer(metrics.engagement.detailOpens)} place-page opens and ${integer(metrics.engagement.outClicks)} partner clicks were recorded.`, "Open Visitors and inspect where people stopped.", kpis.source, "journey", "routine"),
    item("routine-places", "Review the places earning intent", `${integer(metrics.engagement.saves)} saves, ${integer(metrics.engagement.shares)} shares, and ${integer(metrics.engagement.directions)} direction taps were measured.`, "Open Places & tickets and review the strongest places.", kpis.source, "places", "routine"),
  ];
  const needsChanges = distinct([...failures, ...missing]);
  const cards = distinct([...failures, ...missing, ...routine]).slice(0, 3);
  const status = failures.length ? "attention" : missing.length ? "limited" : "healthy";
  const healthPassed = checks ? checks.filter((check) => check.ok).length : null;
  const summary = {
    status,
    headline: status === "attention" ? "A measured issue needs attention" : status === "limited" ? "Some owner metrics are unavailable" : "Yesterday's report is complete",
    detail: `Yesterday: ${integer(metrics.traffic.deviceCount)} browsers and devices, ${integer(signupCount)} signups, ${integer(metrics.affiliate.confirmedBookings)} provider-confirmed bookings, and ${money(metrics.affiliate.paidEarningsUsd)} paid earnings. Health checked now: ${healthPassed === null ? "unknown" : `${healthPassed} of ${checks.length} passed`}.`,
  };
  return {
    schemaVersion: "wayfind-owner-briefing-v1", generatedAt, dateKey,
    period: { key: "yesterday", label: "Yesterday", from: window.from.toISOString(), to: window.to.toISOString(), complete: true, timeZone: SITE_TZ },
    title: `Yesterday — ${new Intl.DateTimeFormat("en-US", { timeZone: SITE_TZ, month: "long", day: "numeric", year: "numeric" }).format(window.from)} · health checked now`,
    summary, unknownNote: UNKNOWN_NOTE, workingWell, needsChanges, improvements: cards, cards, metrics,
    health: { checkedAt: generatedAt, checks, source: healthResult.source },
    sources: { firstParty: kpis.source, signups: signupResult.source, health: healthResult.source, travelpayouts: affiliateResult.source },
    operations,
  };
}

export async function gatherOwnerBriefing(now = new Date(), opts = {}) {
  const current = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(current.getTime())) throw new TypeError("gatherOwnerBriefing requires a valid date");
  const period = rangeFor("yesterday", current);
  const timeoutMs = Math.max(1, Math.min(9500, number(opts.timeoutMs) || 9000));
  const env = opts.env || process.env;
  const collectors = opts.collectors || {};
  const calls = {
    kpis: ["Supabase (first-party events)", collectors.kpis ? (() => collectors.kpis(period.from, period.to)) : (() => fp.kpis(period.from, period.to))],
    signups: ["Supabase Auth signups", collectors.signups ? (() => collectors.signups(period.from, period.to)) : (() => fp.signups(period.from, period.to))],
    health: ["Synthetic check (this server to production)", collectors.health ? (() => collectors.health(now)) : (() => selfCheck(opts.selfCheckOptions || {}))],
    affiliate: ["Travelpayouts", collectors.affiliate ? (() => {
      const providerDay = dayStr(period.from);
      return collectors.affiliate(new Date(`${providerDay}T00:00:00.000Z`), new Date(`${providerDay}T23:59:59.999Z`));
    }) : (() => {
      const providerDay = dayStr(period.from);
      return tpStats(new Date(`${providerDay}T00:00:00.000Z`), new Date(`${providerDay}T23:59:59.999Z`), { env, timeoutMs: Math.min(timeoutMs, 8500) });
    })],
  };
  const entries = await Promise.all(Object.entries(calls).map(async ([key, [name, collect]]) => [key, await bounded(name, collect, timeoutMs, current)]));
  return buildOwnerBriefing({ now: current, period, results: Object.fromEntries(entries), operations: opts.operations || null });
}

export function withBriefingOperations(briefing, operations) { return { ...briefing, operations: operations || null }; }

function sections(briefing) {
  const m = briefing.metrics;
  const out = [
    { title: "Summary", rows: [briefing.summary.headline, briefing.summary.detail] },
    { title: "Yesterday's numbers", rows: [
      `Traffic: ${integer(m.traffic.deviceCount)} browsers and devices · ${integer(m.traffic.sessions)} visits (one person can count more than once across browsers and devices)`,
      `Engagement: ${integer(m.engagement.detailOpens)} place pages opened · ${integer(m.engagement.saves)} saves · ${integer(m.engagement.shares)} shares · ${integer(m.engagement.directions)} directions · ${integer(m.engagement.outClicks)} partner clicks`,
      `Growth: ${integer(m.signups.count)} account signups`,
      `Affiliate: ${integer(m.affiliate.confirmedBookings)} provider-confirmed bookings · ${money(m.affiliate.paidEarningsUsd)} paid earnings · ${money(m.affiliate.pendingEarningsUsd)} pending earnings`,
    ] },
    { title: "Working well", rows: briefing.workingWell.length ? briefing.workingWell.slice(0, 3) : ["No positive result could be confirmed from the available sources."] },
    { title: "Needs changes", rows: briefing.needsChanges.length ? briefing.needsChanges.map((row) => row.title) : ["No measured problem or missing source needs attention."] },
    { title: "Three next actions", rows: briefing.cards },
  ];
  if (briefing.operations && briefing.operations.osmWarm) {
    const o = briefing.operations.osmWarm;
    out.push({ title: "Market data warm-up", rows: [`${integer(number(o.live))} live · ${integer(number(o.cached))} cached · ${integer(number(o.missed))} unavailable of ${integer(number(o.total))} markets`] });
  }
  if (briefing.operations && Array.isArray(briefing.operations.notes) && briefing.operations.notes.length) out.push({ title: "Today's reminders", rows: briefing.operations.notes.map(String) });
  out.push({ title: "About unknown values", rows: [briefing.unknownNote] });
  return out;
}

export function briefingText(briefing) {
  const lines = [briefing.title, `Generated ${briefing.generatedAt}`, `Dashboard: ${DASHBOARD_URL}`, ""];
  for (const section of sections(briefing)) {
    lines.push(section.title);
    section.rows.forEach((row, index) => lines.push(typeof row === "string" ? `${index + 1}. ${row}` : `${index + 1}. ${row.title}\n   ${row.detail}\n   Next: ${row.nextStep}`));
    lines.push("");
  }
  return lines.join("\n").trim();
}

const escapeHtml = (value) => String(value == null ? "unknown" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");

export function briefingHtml(briefing) {
  const rows = (items) => items.map((row) => typeof row === "string"
    ? `<li style="margin:0 0 10px">${escapeHtml(row)}</li>`
    : `<li style="margin:0 0 14px"><strong style="color:${row.status === "needs_change" ? "#ff9a52" : "#ffd2a8"}">${escapeHtml(row.title)}</strong><br><span style="color:#c8c3bb">${escapeHtml(row.detail)}</span><br><span style="color:#fff1e5">Next: ${escapeHtml(row.nextStep)}</span></li>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#0f0d0b;color:#fff8f1;font:15px/1.55 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"><main style="max-width:600px;margin:0 auto;padding:28px 18px 40px"><header style="padding:24px;border:1px solid #573018;border-radius:18px;background:#1c130e"><div style="color:#ff8a3d;font-size:12px;font-weight:800;letter-spacing:.14em">WAYFIND · OWNER BRIEFING</div><h1 style="font-size:27px;line-height:1.2;margin:8px 0">${escapeHtml(briefing.title)}</h1><p style="margin:0;color:#aaa198;font-size:13px">Generated ${escapeHtml(briefing.generatedAt)}</p></header>${sections(briefing).map((section) => `<section style="margin-top:14px;padding:18px 20px;background:#191512;border:1px solid #362419;border-radius:14px"><h2 style="margin:0 0 12px;color:#ff8a3d;font-size:17px">${escapeHtml(section.title)}</h2><ol style="margin:0;padding-left:21px">${rows(section.rows)}</ol></section>`).join("")}<a href="${DASHBOARD_URL}" style="display:block;margin-top:18px;padding:14px 18px;text-align:center;border-radius:12px;background:#f26a21;color:#160d08;text-decoration:none;font-weight:800">Open Command Center</a></main></body></html>`;
}

export async function sendOwnerBriefingEmail({ briefing, apiKey, from, to, fetchImpl = fetch, timeoutMs = 10000, idempotencyKey } = {}) {
  if (!briefing || !apiKey || !from || !to) return { ok: false, status: 503, reason: "email_not_configured", id: null };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST", cache: "no-store", signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey || `wayfind-owner-briefing-${briefing.dateKey}` },
      body: JSON.stringify({ from, to: [to], subject: `Wayfind owner briefing — Yesterday, ${briefing.dateKey}${briefing.summary.status === "healthy" ? " ✓" : " ⚠"}`, text: briefingText(briefing), html: briefingHtml(briefing) }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, status: response.status || 502, reason: response.status === 409 ? "idempotency_conflict" : "email_provider_error", conflict: response.status === 409, note: String((payload && (payload.message || payload.error)) || `Resend HTTP ${response.status}`).slice(0, 200), id: null };
    const id = payload && typeof payload.id === "string" && payload.id.trim() ? payload.id.trim() : null;
    return id ? { ok: true, status: response.status, reason: null, id } : { ok: false, status: 502, reason: "email_confirmation_missing", id: null };
  } catch (error) {
    return { ok: false, status: 502, reason: error && error.name === "AbortError" ? "email_timeout" : "email_send_failed", note: String((error && error.message) || "send failed").slice(0, 200), id: null };
  } finally { clearTimeout(timer); }
}
