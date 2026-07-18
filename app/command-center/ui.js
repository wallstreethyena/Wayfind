"use client";
// app/command-center/ui.js — the owner-only Wayfind Command Center client.
//
// Trust model: this component is UX ONLY. It renders whatever
// /api/command-center/* returns after the SERVER verifies the Supabase session
// against WF_OWNER_USER_ID (lib/commandCenter/auth.js). A non-owner session
// gets 403 no matter what this file does; the lock screen here is a courtesy,
// not the boundary. The optional access-key fallback is kept in
// sessionStorage (cleared when the tab closes) and sent as a header, never a
// query param.
//
// Layout: filters in ONE row above everything (they scope every panel);
// refetch holds the previous render at reduced opacity (no skeleton jumps);
// every chart has a table view; every KPI a definition tooltip; every section
// a per-source freshness badge. Anchors: #alerts #overview #traffic #journey
// #places #retention #health #ops #sources.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, hasSupabase } from "../../lib/supabase";
import { C, TYPE, RADII, MOTION } from "../components/kit";
import {
  CAT, STATUS, Delta, DefTip, SourceBadge, NotConnected, Frame, DataTable, EmptyNote,
  StatTile, Sparkline, LineChart, Columns, StackedColumns, HBarList, Funnel, CohortGrid, StatusPill,
  fmtNum, fmtPct, fmtMs, fmtUsd,
} from "./charts";

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const RANGES = [
  ["today", "Today"], ["yesterday", "Yesterday"], ["7d", "7 days"], ["30d", "30 days"],
  ["month", "This month"], ["last_month", "Last month"], ["custom", "Custom"],
];
const SECTIONS = [
  ["alerts", "Alerts"], ["overview", "Overview"], ["traffic", "Traffic"], ["journey", "Journey"],
  ["places", "Places & affiliate"], ["retention", "Signups"], ["health", "Health"], ["ops", "Code & ops"],
];

// ── data plumbing ───────────────────────────────────────────────────────────
function useAuthState() {
  const [state, setState] = useState({ status: "loading", token: null, email: null });
  useEffect(() => {
    let dead = false;
    async function init() {
      const secret = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("wf_cc_key") : null;
      if (!hasSupabase) { setState({ status: secret ? "ready" : "nosupabase", token: null, email: null, secret }); return; }
      const { data } = await supabase.auth.getSession();
      const sess = data && data.session;
      if (!dead) setState({ status: sess || secret ? "ready" : "signedout", token: sess ? sess.access_token : null, email: sess && sess.user ? sess.user.email : null, secret });
      const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
        if (!dead) setState((prev) => ({ ...prev, status: s || prev.secret ? "ready" : "signedout", token: s ? s.access_token : null, email: s && s.user ? s.user.email : null }));
      });
      return () => { try { sub.subscription.unsubscribe(); } catch {} };
    }
    const cleanup = init();
    return () => { dead = true; if (cleanup && cleanup.then) cleanup.then((fn) => fn && fn()); };
  }, []);
  return [state, setState];
}

function authHeaders(auth) {
  const h = {};
  if (auth.token) h.Authorization = `Bearer ${auth.token}`;
  if (auth.secret) h["x-wf-cc-key"] = auth.secret;
  return h;
}

function usePanel(panel, auth, range, { refreshMs = 0, enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: true, error: null, status: null, fetchedAt: null });
  const timer = useRef(null);
  const load = useCallback(async () => {
    if (!enabled || auth.status !== "ready") return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const qs = new URLSearchParams({ range: range.key });
      if (range.key === "custom" && range.from && range.to) { qs.set("from", range.from); qs.set("to", range.to); }
      const r = await fetch(`/api/command-center/${panel}?${qs}`, { headers: authHeaders(auth), cache: "no-store" });
      const body = await r.json().catch(() => null);
      setState({ data: r.ok ? body : null, loading: false, error: r.ok ? null : (body && body.reason) || `http_${r.status}`, status: r.status, fetchedAt: new Date() });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: "network", status: 0, fetchedAt: new Date() }));
    }
  }, [panel, auth, range.key, range.from, range.to, enabled]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!refreshMs) return;
    function tick() { if (typeof document === "undefined" || document.visibilityState === "visible") load(); }
    timer.current = setInterval(tick, refreshMs);
    return () => clearInterval(timer.current);
  }, [refreshMs, load]);
  return { ...state, reload: load };
}

const dget = (obj, path, fb = null) => { try { return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj) ?? fb; } catch { return fb; } };
function deltaOf(cur, prev) {
  const c = Number(cur), p = Number(prev);
  if (!isFinite(c) || !isFinite(p)) return { pct: null, dir: "flat", abs: null };
  if (p === 0) return { pct: null, dir: c > 0 ? "up" : "flat", abs: c };
  const pct = ((c - p) / p) * 100;
  return { pct, dir: Math.abs(pct) < 0.5 ? "flat" : pct > 0 ? "up" : "down", abs: c - p };
}
const COMP_SHORT = { yesterday: "vs yesterday", last_week: "vs last week", last_month: "vs last month", prior_period: "vs prior period", prev_month_to_date: "vs last month" };

// ── shell pieces ────────────────────────────────────────────────────────────
function Card({ children, style }) {
  return <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: RADII.card, padding: 16, minWidth: 0, ...style }}>{children}</div>;
}
function Section({ id, title, sub, children, loading }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} style={{ margin: "26px 0", opacity: loading ? 0.55 : 1, transition: `opacity ${MOTION.base} ${MOTION.ease}` }}>
      <h2 id={`${id}-h`} style={{ ...TYPE.display, color: C.text, margin: "0 0 2px" }}>{title}</h2>
      {sub ? <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 12px", lineHeight: 1.5 }}>{sub}</p> : <div style={{ height: 12 }} />}
      {children}
    </section>
  );
}
function Grid({ min = 170, children, gap = 10 }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap }}>{children}</div>;
}
function Two({ children, min = 320 }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 12 }}>{children}</div>;
}

function PanelError({ error, status, reload }) {
  const msg = status === 403 ? "This account is signed in but is not the owner account." :
    status === 401 ? "Session expired — sign in again on the main app." :
    status === 503 ? "Server not configured: set WF_OWNER_USER_ID (and/or METRICS_SECRET) in the environment." :
    `Panel failed to load (${error || "unknown"}).`;
  return (
    <div role="alert" style={{ border: `1px solid ${STATUS.serious}`, borderRadius: RADII.control, padding: 12, fontSize: 12.5, color: C.light, display: "flex", gap: 10, alignItems: "center" }}>
      <span aria-hidden="true" style={{ color: STATUS.serious, fontWeight: 800 }}>✕</span>
      <span style={{ flex: 1 }}>{msg}</span>
      <button type="button" onClick={reload} style={{ background: C.adim, color: C.accent, border: `1px solid ${C.accent}`, borderRadius: 8, fontSize: 11, fontWeight: 800, padding: "4px 10px", cursor: "pointer" }}>Retry</button>
    </div>
  );
}

// ── lock screen ─────────────────────────────────────────────────────────────
function LockScreen({ auth, setAuth, denied, notConfigured }) {
  const [key, setKey] = useState("");
  return (
    <div style={{ maxWidth: 460, margin: "10vh auto", padding: 20 }}>
      <Card>
        <div style={{ ...TYPE.eyebrow, color: C.accent, marginBottom: 8 }}>Wayfind · owner only</div>
        <h1 style={{ ...TYPE.display, color: C.text, margin: "0 0 8px" }}>Command Center is locked</h1>
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.55 }}>
          {notConfigured
            ? "The server has no owner configured. Set WF_OWNER_USER_ID (your Supabase auth user id) and/or METRICS_SECRET in the Vercel environment, then redeploy."
            : denied
              ? "You're signed in, but not with the owner account. Authorization is checked on the server for every request."
              : "Sign in with the owner account on the main app (this page reuses that session), or paste the access key."}
        </p>
        {!notConfigured && (
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <a href="/" style={{ background: C.accent, color: "#0D1117", borderRadius: 10, fontSize: 13, fontWeight: 800, padding: "10px 14px", textDecoration: "none" }}>Open Wayfind to sign in</a>
          </div>
        )}
        {!notConfigured && (
          <form onSubmit={(e) => { e.preventDefault(); if (key.trim()) { try { sessionStorage.setItem("wf_cc_key", key.trim()); } catch {} setAuth((s) => ({ ...s, secret: key.trim(), status: "ready" })); } }}
            style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <label style={{ position: "absolute", left: -9999 }} htmlFor="cc-key">Access key</label>
            <input id="cc-key" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Access key (METRICS_SECRET)"
              style={{ flex: 1, background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 16, fontFamily: FONT }} />
            <button type="submit" style={{ background: C.card, color: C.light, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, fontWeight: 800, padding: "9px 14px", cursor: "pointer" }}>Unlock</button>
          </form>
        )}
        <p style={{ fontSize: 11, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>The key is held for this tab only and sent as a header. All data endpoints re-verify on the server.</p>
      </Card>
    </div>
  );
}

// ── sections ────────────────────────────────────────────────────────────────
function AlertsSection({ auth, range }) {
  const p = usePanel("alerts", auth, { key: "today" }, { refreshMs: 120000 });
  const alerts = dget(p.data, "data.alerts", []);
  if (p.error) return <Section id="alerts" title="Alerts"><PanelError {...p} reload={p.reload} /></Section>;
  return (
    <Section id="alerts" title="Alerts" loading={p.loading && !p.data}
      sub={dget(p.data, "data.baselineNote", "")}>
      {alerts.length === 0 && p.data ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.light }}>
          <span aria-hidden="true" style={{ color: STATUS.good, fontWeight: 800 }}>✓</span> No active alerts — all monitored baselines are within range.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {alerts.map((a) => (
            <a key={a.id} href={`#${a.anchor || "overview"}`} style={{
              display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "start", textDecoration: "none",
              border: `1px solid ${a.severity === "critical" ? STATUS.critical : a.severity === "warn" ? C.border : C.border}`,
              borderLeft: `3px solid ${a.severity === "critical" ? STATUS.critical : a.severity === "warn" ? STATUS.warn : C.blue}`,
              borderRadius: RADII.control, padding: "10px 12px", background: C.panel,
            }}>
              <span aria-hidden="true" style={{ fontWeight: 800, color: a.severity === "critical" ? STATUS.critical : a.severity === "warn" ? STATUS.warn : C.blue }}>
                {a.severity === "critical" ? "✕" : a.severity === "warn" ? "▲" : "ⓘ"}
              </span>
              <span>
                <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: C.text }}>{a.title} <span style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>· {a.severity}</span></span>
                <span style={{ display: "block", fontSize: 12, color: C.muted, lineHeight: 1.45, marginTop: 2 }}>{a.detail}</span>
              </span>
              <span style={{ fontSize: 11, color: C.light, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {a.current != null && <span style={{ display: "block", fontWeight: 800 }}>{a.current}</span>}
                {a.baseline != null && <span style={{ display: "block", color: C.muted }}>{a.baseline}</span>}
              </span>
            </a>
          ))}
        </div>
      )}
    </Section>
  );
}

function OverviewSection({ auth, range }) {
  const p = usePanel("overview", auth, range, { refreshMs: 60000 });
  const d = dget(p.data, "data", null);
  if (p.error) return <Section id="overview" title="Executive overview"><PanelError {...p} reload={p.reload} /></Section>;

  const fpK = dget(d, "firstParty.kpis", {}) || {};
  const fpComps = dget(d, "firstParty.comparisons", []) || [];
  const phC = dget(d, "posthog.counts", null);
  const phComps = dget(d, "posthog.comparisons", []) || [];
  const defs = dget(d, "definitions", {}) || {};
  const compDeltas = (key) => fpComps.map((c) => ({ delta: deltaOf(fpK[key], dget(c, `kpis.${key}`)), label: COMP_SHORT[c.key] || c.label }));
  const phDeltas = (key) => phComps.map((c) => ({ delta: deltaOf(phC && phC[key], dget(c, `counts.${key}`)), label: COMP_SHORT[c.key] || c.label }));
  const tp = dget(d, "affiliate.travelpayouts", null);
  const err = dget(d, "errors.posthog24h", null);
  const sentry = dget(d, "errors.sentry", null);
  const errTotal = err && err.data ? (Number(err.data.exceptions) || 0) + (Number(err.data.app_errors) || 0) : null;
  const signupComps = (dget(d, "signups.comparisons", []) || []).map((c) => ({ delta: deltaOf(dget(d, "signups.current"), c.value), label: COMP_SHORT[c.key] || c.label }));
  const healthOk = dget(d, "health.ok", null);

  return (
    <Section id="overview" title="Executive overview" loading={p.loading && !p.data}
      sub={`Window: ${dget(p.data, "range.label", "Today")} · comparisons use equivalent elapsed time (ET days).`}>
      <Grid min={185}>
        <StatTile hero label="Live now" def={defs.live_now}
          value={fmtNum(dget(d, "live.firstParty.devices"))}
          sub={dget(d, "live.posthog.visitors") != null ? `PostHog: ${fmtNum(dget(d, "live.posthog.visitors"))}` : undefined}
          source={dget(d, "live.firstParty.source")} />
        <StatTile label="Sessions" def={defs.sessions} value={fmtNum(phC ? phC.sessions : fpK.sessions)}
          sub={phC ? undefined : "first-party"} deltas={phC ? phDeltas("sessions") : compDeltas("sessions")}
          source={phC ? dget(d, "posthog.source") : dget(d, "firstParty.source")} />
        <StatTile label="Unique visitors" def={defs.visitors} value={fmtNum(phC ? phC.visitors : fpK.active_devices)}
          sub={phC ? undefined : "devices (first-party)"} deltas={phC ? phDeltas("visitors") : compDeltas("active_devices")}
          source={phC ? dget(d, "posthog.source") : dget(d, "firstParty.source")} />
        <StatTile label="Page views" def={defs.page_views} value={phC ? fmtNum(phC.pageviews) : "–"}
          deltas={phC ? phDeltas("pageviews") : undefined}
          source={phC ? dget(d, "posthog.source") : dget(d, "posthog.source") || undefined} />
        <StatTile label="Screen views" def={defs.screen_views} value={fmtNum(fpK.screen_views)} deltas={compDeltas("screen_views")} source={dget(d, "firstParty.source")} />
        <StatTile label="Signups" def={defs.signups} value={fmtNum(dget(d, "signups.current"))} deltas={signupComps}
          sub={`total ${fmtNum(dget(d, "signups.totals.data.total_users"))}`} source={dget(d, "signups.source")} />
        <StatTile label="Partner clicks" def={defs.affiliate_clicks} value={fmtNum(fpK.out_clicks)} deltas={compDeltas("out_clicks")} source={dget(d, "firstParty.source")} />
        <StatTile label="Confirmed revenue" def={defs.revenue} goodWhenUp
          value={tp && tp.data ? fmtUsd(tp.data.revenue_paid_usd) : "–"}
          sub={tp && tp.data ? `${fmtNum(tp.data.confirmed_bookings)} bookings · ${fmtUsd(tp.data.revenue_pending_usd)} pending` : "not connected"}
          source={tp && tp.source} />
        <StatTile label="Errors (24h)" def={defs.errors_24h} goodWhenUp={false}
          value={errTotal != null ? fmtNum(errTotal) : "–"}
          sub={sentry && sentry.data ? `Sentry unresolved: ${sentry.data.unresolved_24h}` : "Sentry not connected"}
          source={err && err.source} />
        <StatTile label="Site health" def="Live self-check from the server to production (homepage + key APIs)."
          value={healthOk === true ? "✓ OK" : healthOk === false ? "✕ FAIL" : "…"}
          sub={healthOk === false ? (dget(d, "health.failing", []) || []).join(", ") : "all checks passing"}
          source={dget(d, "health.source")} />
      </Grid>
    </Section>
  );
}

function TrafficSection({ auth, range }) {
  // HOOKS RULE: every hook in this component runs before ANY conditional
  // return — an early error-return above a useMemo changes the hook count
  // between renders and crashes React ("Rendered fewer hooks than expected").
  // Locked by test-command-center.mjs (hooks-before-guard grep).
  const p = usePanel("traffic", auth, range, { refreshMs: 60000 });
  const d = dget(p.data, "data", null);

  const phDaily = dget(d, "daily.posthog.data", null);
  const fpDaily = dget(d, "daily.firstParty.data", null) || [];
  const phMin = dget(d, "liveMinutes.posthog.data", null);
  const fpMin = dget(d, "liveMinutes.firstParty.data", null) || [];
  const geo = dget(d, "geo.data", null);
  const channels = dget(d, "channels.data", null);
  const nvr = dget(d, "newVsReturning.data", null);
  const entryExit = dget(d, "entryExit.data", null) || [];

  const entries = useMemo(() => {
    const m = new Map();
    for (const r of entryExit) m.set(r.entry, (m.get(r.entry) || 0) + Number(r.sessions || 0));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }));
  }, [entryExit]);
  const exits = useMemo(() => {
    const m = new Map();
    for (const r of entryExit) m.set(r.exit, (m.get(r.exit) || 0) + Number(r.sessions || 0));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }));
  }, [entryExit]);
  const deviceRows = useMemo(() => {
    const rows = dget(d, "devices.data", null) || [];
    const by = (k) => { const m = new Map(); for (const r of rows) m.set(r[k], (m.get(r[k]) || 0) + Number(r.visitors || 0)); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value })); };
    return { device: by("device"), browser: by("browser"), os: by("os") };
  }, [d]);

  const minuteLabels = (phMin || fpMin).map((r) => String(r.minute || "").slice(11, 16));

  if (p.error) return <Section id="traffic" title="Traffic & acquisition"><PanelError {...p} reload={p.reload} /></Section>;

  return (
    <Section id="traffic" title="Traffic & acquisition" loading={p.loading && !p.data}
      sub="PostHog is the traffic source of truth; first-party events fill in where it isn't connected. Geography is aggregated with a ≥3-visitor floor.">
      <Two>
        <Card>
          <Frame title="Live visitors — last 60 minutes" def="Unique visitors per minute. PostHog persons where connected; distinct first-party devices otherwise."
            source={phMin ? dget(d, "liveMinutes.posthog.source") : dget(d, "liveMinutes.firstParty.source")}
            columns={["Minute", "Visitors"]} rows={(phMin || fpMin).map((r) => [String(r.minute || "").slice(11, 16), r.visitors ?? r.devices])}>
            {minuteLabels.length ? (
              <LineChart height={140} xLabels={minuteLabels}
                series={[{ name: "visitors", color: CAT[0], values: (phMin || fpMin).map((r) => Number(r.visitors ?? r.devices) || 0) }]} />
            ) : <EmptyNote>No visitors in the last hour.</EmptyNote>}
          </Frame>
        </Card>
        <Card>
          <Frame title="Daily visitors · sessions · page views" def="Per site-local day over the selected window."
            source={phDaily ? dget(d, "daily.posthog.source") : dget(d, "daily.firstParty.source")}
            columns={phDaily ? ["Day", "Visitors", "Sessions", "Page views"] : ["Day", "Devices", "Sessions", "Screen views"]}
            rows={(phDaily || fpDaily).map((r) => phDaily ? [String(r.day).slice(0, 10), r.visitors, r.sessions, r.pageviews] : [r.day, r.devices, r.sessions, r.screen_views])}>
            {(phDaily || fpDaily).length ? (
              <LineChart height={170}
                xLabels={(phDaily || fpDaily).map((r) => String(r.day).slice(0, 10))}
                series={phDaily ? [
                  { name: "visitors", color: CAT[0], values: phDaily.map((r) => Number(r.visitors) || 0) },
                  { name: "sessions", color: CAT[1], values: phDaily.map((r) => Number(r.sessions) || 0) },
                  { name: "page views", color: CAT[2], values: phDaily.map((r) => Number(r.pageviews) || 0) },
                ] : [
                  { name: "devices", color: CAT[0], values: fpDaily.map((r) => Number(r.devices) || 0) },
                  { name: "sessions", color: CAT[1], values: fpDaily.map((r) => Number(r.sessions) || 0) },
                ]} />
            ) : <EmptyNote>No traffic in this window.</EmptyNote>}
          </Frame>
        </Card>
      </Two>
      <div style={{ height: 12 }} />
      <Two min={280}>
        <Card>
          <Frame title="Acquisition channels" def="PostHog session channel type (direct, organic search/social, referral, email, paid) with bounce + duration."
            source={dget(d, "channels.source")}
            columns={["Channel", "Sessions", "Visitors", "Bounces", "Avg duration"]}
            rows={(channels || []).map((r) => [r.channel, r.sessions, r.visitors, r.bounces, r.avg_duration_s != null ? `${r.avg_duration_s}s` : "–"])}>
            {channels ? <HBarList color={CAT[0]} items={(channels || []).map((r) => ({ label: r.channel, value: r.sessions, secondary: `${fmtNum(r.visitors)} visitors` }))} /> : <NotConnected source={dget(d, "channels.source")} compact />}
          </Frame>
        </Card>
        <Card>
          <Frame title="Top referrers" def="Referring domains of session entries ($direct = typed/bookmark). First-party 'session.ref' shown when PostHog is absent."
            source={channels ? dget(d, "referrers.source") : dget(d, "firstPartyReferrers.source")}
            columns={["Referrer", "Sessions"]}
            rows={((dget(d, "referrers.data", null) || dget(d, "firstPartyReferrers.data", null)) || []).map((r) => [r.referrer || r.k, r.sessions || r.n])}>
            <HBarList color={CAT[2]} items={((dget(d, "referrers.data", null) || dget(d, "firstPartyReferrers.data", null)) || []).map((r) => ({ label: r.referrer || r.k, value: r.sessions || r.n }))} />
          </Frame>
        </Card>
        <Card>
          <Frame title="Campaigns (UTM)" def="Sessions whose entry carried utm_source / utm_campaign."
            source={dget(d, "utms.source")}
            columns={["Source", "Campaign", "Sessions"]}
            rows={(dget(d, "utms.data", null) || []).map((r) => [r.utm_source, r.utm_campaign, r.sessions])}>
            {dget(d, "utms.data", null) && dget(d, "utms.data", []).length
              ? <HBarList color={CAT[3]} items={dget(d, "utms.data", []).map((r) => ({ label: `${r.utm_source} / ${r.utm_campaign}`, value: r.sessions }))} />
              : dget(d, "utms.source.connected") === false ? <NotConnected source={dget(d, "utms.source")} compact /> : <EmptyNote>No UTM-tagged sessions in this window.</EmptyNote>}
          </Frame>
        </Card>
        <Card>
          <Frame title="New vs returning visitors" def="PostHog person first-seen inside vs before the window."
            source={dget(d, "newVsReturning.source")}
            columns={["Day", "New", "Returning"]}
            rows={(nvr || []).map((r) => [String(r.day).slice(0, 10), r.new_visitors, r.returning_visitors])}>
            {nvr && nvr.length ? (
              <StackedColumns height={150} labels={nvr.map((r) => String(r.day).slice(0, 10))}
                seriesA={{ name: "returning", color: CAT[0], values: nvr.map((r) => Number(r.returning_visitors) || 0) }}
                seriesB={{ name: "new", color: CAT[1], values: nvr.map((r) => Number(r.new_visitors) || 0) }} />
            ) : dget(d, "newVsReturning.source.connected") === false ? <NotConnected source={dget(d, "newVsReturning.source")} compact /> : <EmptyNote>No visitor data in this window.</EmptyNote>}
          </Frame>
        </Card>
      </Two>
      <div style={{ height: 12 }} />
      <Two min={280}>
        <Card>
          <Frame title="Where visitors are" def={dget(d, "geo.privacyNote", "")}
            source={dget(d, "geo.source")}
            columns={["Country", "Region", "Visitors"]}
            rows={(geo || []).map((r) => [r.country, r.region || "—", r.visitors])}>
            {geo ? <HBarList color={CAT[0]} items={(geo || []).map((r) => ({ label: r.region ? `${r.country} · ${r.region}` : r.country, value: r.visitors }))} maxRows={12} secondary="Rows under 3 visitors are withheld for privacy." /> : <NotConnected source={dget(d, "geo.source")} compact />}
          </Frame>
        </Card>
        <Card>
          <Frame title="Top pages" def="Page views by path across all routes." source={dget(d, "pages.source")}
            columns={["Path", "Page views", "Visitors"]}
            rows={(dget(d, "pages.data", null) || []).map((r) => [r.path, r.pageviews, r.visitors])}>
            {dget(d, "pages.data", null) ? <HBarList color={CAT[1]} items={dget(d, "pages.data", []).map((r) => ({ label: r.path, value: r.pageviews, secondary: `${fmtNum(r.visitors)} visitors` }))} /> : <NotConnected source={dget(d, "pages.source")} compact />}
          </Frame>
        </Card>
        <Card>
          <Frame title="Devices · browsers · OS" def="Unique visitors by device class, browser, and operating system." source={dget(d, "devices.source")}
            columns={["Type", "Name", "Visitors"]}
            rows={[...deviceRows.device.map((r) => ["Device", r.label, r.value]), ...deviceRows.browser.map((r) => ["Browser", r.label, r.value]), ...deviceRows.os.map((r) => ["OS", r.label, r.value])]}>
            {dget(d, "devices.data", null) ? (
              <div style={{ display: "grid", gap: 10 }}>
                <HBarList color={CAT[0]} items={deviceRows.device} maxRows={4} />
                <HBarList color={CAT[2]} items={deviceRows.browser} maxRows={4} />
              </div>
            ) : <NotConnected source={dget(d, "devices.source")} compact />}
          </Frame>
        </Card>
        <Card>
          <Frame title="Entry & exit pages" def="Where sessions start and end (PostHog sessions)." source={dget(d, "entryExit.source")}
            columns={["Entry page", "Sessions"]} rows={entries.map((r) => [r.label, r.value])}>
            {entries.length ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div><div style={{ ...TYPE.eyebrow, color: C.muted, marginBottom: 4 }}>Top entries</div><HBarList color={CAT[0]} items={entries} maxRows={5} /></div>
                <div><div style={{ ...TYPE.eyebrow, color: C.muted, marginBottom: 4 }}>Top exits</div><HBarList color={CAT[3]} items={exits} maxRows={5} /></div>
              </div>
            ) : dget(d, "entryExit.source.connected") === false ? <NotConnected source={dget(d, "entryExit.source")} compact /> : <EmptyNote>No session data in this window.</EmptyNote>}
          </Frame>
        </Card>
      </Two>
      <div style={{ height: 8 }} />
      <Frame title="Viewport widths" def="Unique visitors bucketed by browser viewport width." source={dget(d, "viewports.source")}
        columns={["Bucket", "Visitors"]} rows={(dget(d, "viewports.data", null) || []).map((r) => [r.bucket, r.visitors])}>
        {dget(d, "viewports.data", null) ? <HBarList color={CAT[2]} items={dget(d, "viewports.data", []).map((r) => ({ label: r.bucket + "px", value: r.visitors }))} maxRows={6} /> : <NotConnected source={dget(d, "viewports.source")} compact />}
      </Frame>
    </Section>
  );
}

function JourneySection({ auth, range }) {
  const p = usePanel("journey", auth, range);
  const d = dget(p.data, "data", null);
  if (p.error) return <Section id="journey" title="User journey & engagement"><PanelError {...p} reload={p.reload} /></Section>;
  const rates = dget(d, "rates.data", {}) || {};
  const den = rates.denominators || {};
  return (
    <Section id="journey" title="User journey & engagement" loading={p.loading && !p.data}
      sub="The real Wayfind journey from first-party events (distinct devices per step; a device can enter mid-funnel).">
      <Two>
        <Card>
          <Frame title="Journey funnel" def="Distinct devices reaching each stage within the window: visit → browse/search → open a place → engage → partner click. Steps are computed per stage (not strictly ordered per user)."
            source={dget(d, "funnel.source")}
            columns={["Step", "Devices"]} rows={(dget(d, "funnel.data", null) || []).map((r) => [r.step, r.devices])}>
            <Funnel steps={dget(d, "funnel.data", null) || []} />
          </Frame>
        </Card>
        <Card>
          <div style={{ ...TYPE.eyebrow, color: C.muted, marginBottom: 8 }}>Engagement rates <DefTip text="Rates against their honest denominators, shown beside each. Small denominators mean noisy rates — judge with the count." /></div>
          <Grid min={130}>
            <StatTile label="Save rate" value={fmtPct(rates.save_rate, 1)} sub={`of ${fmtNum(den.detail_opens)} opens`} def="Saves ÷ place-detail opens in window." />
            <StatTile label="Share rate" value={fmtPct(rates.share_rate, 1)} sub={`of ${fmtNum(den.detail_opens)} opens`} def="Shares ÷ place-detail opens." />
            <StatTile label="Directions rate" value={fmtPct(rates.directions_rate, 1)} sub={`of ${fmtNum(den.detail_opens)} opens`} def="Directions clicks ÷ place-detail opens." />
            <StatTile label="Partner-click rate" value={fmtPct(rates.out_click_rate, 1)} sub={`of ${fmtNum(den.detail_opens)} opens`} def="Outbound partner clicks ÷ place-detail opens." />
            <StatTile label="Engaged visitors" value={fmtPct(rates.engage_rate, 1)} sub={`of ${fmtNum(den.active_devices)} devices`} def="Devices with any meaningful action ÷ active devices." />
            <StatTile label="No-result rate" goodWhenUp={false} value={fmtPct(rates.no_result_rate, 1)} sub={`of ${fmtNum(den.searches)} searches`} def="Empty-result searches ÷ (searches + empty results)." />
          </Grid>
          <div style={{ marginTop: 8 }}><SourceBadge source={dget(d, "rates.source")} /></div>
        </Card>
      </Two>
      <div style={{ height: 12 }} />
      <Two min={260}>
        <Card>
          <Frame title="Top searches" def="Search queries submitted in-app (lowercased; queries containing an email are masked)." source={dget(d, "searches.source")}
            columns={["Query", "Count", "Devices"]} rows={(dget(d, "searches.data", null) || []).map((r) => [r.k, r.n, r.devices])}>
            <HBarList color={CAT[0]} items={(dget(d, "searches.data", null) || []).map((r) => ({ label: r.k, value: r.n, secondary: `${r.devices} devices` }))} />
          </Frame>
        </Card>
        <Card>
          <Frame title="Searches with no useful result" def="Category · location combos that hit the empty state (places_none) — the sharpest coverage-gap signal." source={dget(d, "noResults.source")}
            columns={["Category · area", "Count"]} rows={(dget(d, "noResults.data", null) || []).map((r) => [r.k, r.n])}>
            <HBarList color={STATUS.serious} items={(dget(d, "noResults.data", null) || []).map((r) => ({ label: r.k, value: r.n }))} />
          </Frame>
        </Card>
        <Card>
          <Frame title="Most-used screens" def="In-app screen views by screen name." source={dget(d, "screens.source")}
            columns={["Screen", "Views", "Devices"]} rows={(dget(d, "screens.data", null) || []).map((r) => [r.k, r.n, r.devices])}>
            <HBarList color={CAT[2]} items={(dget(d, "screens.data", null) || []).map((r) => ({ label: r.k, value: r.n }))} />
          </Frame>
        </Card>
        <Card>
          <Frame title="Categories browsed" def="Category browses (result_count_shown.cat) — which shelves people open." source={dget(d, "categories.source")}
            columns={["Category", "Browses", "Devices"]} rows={(dget(d, "categories.data", null) || []).map((r) => [r.k, r.n, r.devices])}>
            <HBarList color={CAT[1]} items={(dget(d, "categories.data", null) || []).map((r) => ({ label: r.k, value: r.n, secondary: `${r.devices} devices` }))} />
          </Frame>
        </Card>
      </Two>
    </Section>
  );
}

function PlacesSection({ auth, range }) {
  const p = usePanel("places", auth, range);
  const d = dget(p.data, "data", null);
  if (p.error) return <Section id="places" title="Places, content & affiliate"><PanelError {...p} reload={p.reload} /></Section>;
  const top = dget(d, "top", {}) || {};
  const tp = dget(d, "affiliate.travelpayouts", null);
  const conv = dget(d, "conversion.data", {}) || {};
  const list = (block, color, fmt = fmtNum) => (
    <Frame title={block.title} def={block.def} source={dget(top, `${block.key}.source`)}
      columns={["Place", "Events", "Devices"]}
      rows={(dget(top, `${block.key}.data`, null) || []).map((r) => [r.place_name, r.n, r.devices])}>
      <HBarList color={color} items={(dget(top, `${block.key}.data`, null) || []).map((r) => ({ label: r.place_name, value: r.n, secondary: `${r.devices} devices` }))} maxRows={5} />
    </Frame>
  );
  return (
    <Section id="places" title="Places, content & affiliate performance" loading={p.loading && !p.data}
      sub={dget(d, "affiliate.integrityNote", "")}>
      <Two min={260}>
        <Card>{list({ key: "views", title: "Top 5 most-opened places", def: "Place-detail opens per place (tracked detail_open/event_open events — not guessed popularity)." }, CAT[0])}</Card>
        <Card>{list({ key: "outs", title: "Top 5 partner-clicked places", def: "Outbound partner clicks per place (tickets/hotels/coupons/food/Tripadvisor/tours)." }, CAT[1])}</Card>
        <Card>{list({ key: "saves", title: "Top 5 most-saved places", def: "Save events per place." }, CAT[2])}</Card>
        <Card>{list({ key: "shares", title: "Top 5 most-shared places", def: "Share events per place." }, CAT[3])}</Card>
        <Card>{list({ key: "likes", title: "Top 5 most-liked places", def: "Like events per place." }, CAT[4])}</Card>
        <Card>{list({ key: "directions", title: "Top 5 directions-clicked places", def: "Directions clicks per place." }, CAT[5])}</Card>
      </Two>
      <div style={{ height: 12 }} />
      <Two min={280}>
        <Card>
          <Frame title="Partner clicks by provider type" def="Outbound clicks grouped by which partner action fired (tickets_out=tours/tickets, hotel_out=stays, coupon_out=deals, eats_out=food delivery, ta_out=Tripadvisor, tour_card_out=tour cards, maps_list=Google Maps list)."
            source={dget(d, "affiliate.providers.source")}
            columns={["Action", "Clicks", "Devices"]} rows={(dget(d, "affiliate.providers.data", null) || []).map((r) => [r.k, r.n, r.devices])}>
            <HBarList color={CAT[1]} items={(dget(d, "affiliate.providers.data", null) || []).map((r) => ({ label: r.k, value: r.n, secondary: `${r.devices} devices` }))} />
          </Frame>
        </Card>
        <Card>
          <div style={{ ...TYPE.eyebrow, color: C.muted, marginBottom: 8 }}>Provider-confirmed results (Travelpayouts)</div>
          {tp && tp.data ? (
            <Grid min={140}>
              <StatTile label="Confirmed bookings" value={fmtNum(tp.data.confirmed_bookings)} def="Provider-confirmed actions (state processing or paid). Never inferred from clicks." source={tp.source} />
              <StatTile label="Paid commission" value={fmtUsd(tp.data.revenue_paid_usd)} def="Commission in state=paid — the only number shown as revenue." />
              <StatTile label="Pending commission" value={fmtUsd(tp.data.revenue_pending_usd)} def="Commission still in processing — shown separately, never merged into revenue." />
              <StatTile label="Cancellation rate" goodWhenUp={false} value={tp.data.cancellation_rate != null ? fmtPct(tp.data.cancellation_rate, 1) : "–"} def="Canceled ÷ all provider actions in window." />
            </Grid>
          ) : <NotConnected source={tp && tp.source} />}
          <p style={{ fontSize: 11, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>Stay22, Impact (Ticketmaster) and direct Viator have no reporting API connected — their clicks are tracked first-party above; bookings/revenue for them are “Not connected”, not zero.</p>
        </Card>
      </Two>
      <div style={{ height: 12 }} />
      <Grid min={170}>
        <StatTile label="Place opens" value={fmtNum(conv.detail_opens)} def="Place-detail opens in window." source={dget(d, "conversion.source")} />
        <StatTile label="Engaged devices" value={fmtNum(conv.engaged_devices)} def="Devices with a meaningful action (save/like/share/directions/comment/partner click)." />
        <StatTile label="Open → engage" value={conv.view_to_engage != null ? fmtPct(conv.view_to_engage, 1) : "–"} def="Engaged devices ÷ place opens. Denominators shown on the tiles to the left." />
        <StatTile label="Partner clicks" value={fmtNum(conv.out_clicks)} def="All outbound partner clicks in window." />
      </Grid>
    </Section>
  );
}

function RetentionSection({ auth, range }) {
  // HOOKS RULE: all hooks before any conditional return (see TrafficSection).
  const p = usePanel("retention", auth, range);
  const d = dget(p.data, "data", null);
  const totals = dget(d, "totals.data", {}) || {};
  const signups = dget(d, "signups.data", null) || [];
  const ret = dget(d, "retention.data", null) || [];
  const agg = ret.reduce((a, r) => ({ n: a.n + (+r.new_devices || 0), d1: a.d1 + (+r.d1 || 0), d7: a.d7 + (+r.d7 || 0), d30: a.d30 + (+r.d30 || 0) }), { n: 0, d1: 0, d7: 0, d30: 0 });
  const cohortRows = useMemo(() => {
    const rows = dget(d, "cohorts.data", null) || [];
    const by = new Map();
    for (const r of rows) {
      if (!by.has(r.week_start)) by.set(r.week_start, { week_start: r.week_start, new_users: Number(r.new_users) || 0, cells: [] });
      if (r.week_offset != null) by.get(r.week_start).cells.push({ offset: Number(r.week_offset), active: Number(r.active_users) || 0 });
    }
    return [...by.values()].sort((a, b) => String(a.week_start).localeCompare(String(b.week_start)));
  }, [d]);
  if (p.error) return <Section id="retention" title="Signups & retention"><PanelError {...p} reload={p.reload} /></Section>;
  return (
    <Section id="retention" title="Signups & retention" loading={p.loading && !p.data} sub={dget(d, "definitionNote", "")}>
      <Grid min={160}>
        <StatTile label="Total accounts" value={fmtNum(totals.total_users)} def="Non-anonymous Supabase Auth accounts (all time)." source={dget(d, "totals.source")} />
        <StatTile label="Save-active users" value={fmtNum(totals.users_with_saves)} def="Accounts with at least one saved place." />
        <StatTile label="Like-active users" value={fmtNum(totals.users_with_likes)} def="Accounts with at least one like." />
        <StatTile label="Ever-active users" value={fmtNum(totals.users_active_ever)} def="Accounts with any signed-in tracked activity." />
        <StatTile label="Saved places" value={fmtNum(totals.saved_places_total)} def="Total saved-place rows across all accounts." />
        <StatTile label="Shared lists" value={fmtNum(totals.shared_lists_total)} def="Share-by-code lists created." />
      </Grid>
      <div style={{ height: 12 }} />
      <Two>
        <Card>
          <Frame title="Signups per day" def="Accounts created per site-local day in the selected window." source={dget(d, "signups.source")}
            columns={["Day", "Signups"]} rows={signups.map((r) => [r.day, r.signups])}>
            {signups.length ? <Columns labels={signups.map((r) => r.day)} values={signups.map((r) => Number(r.signups) || 0)} color={CAT[1]} /> : <EmptyNote>No signups in this window.</EmptyNote>}
          </Frame>
        </Card>
        <Card>
          <div style={{ ...TYPE.eyebrow, color: C.muted, marginBottom: 8 }}>Return rates — devices first seen in the last 30 days <DefTip text="Of devices whose first visit was in the last 30 days: how many came back the next day (D1), within 7 days (D7), within 30 (D30). Recent cohorts haven't had time to mature — D7/D30 for them are floors, not finals." /></div>
          <Grid min={120}>
            <StatTile label="New devices" value={fmtNum(agg.n)} def="Devices first seen in the last 30 days." source={dget(d, "retention.source")} />
            <StatTile label="D1 return" value={agg.n ? fmtPct(agg.d1 / agg.n, 1) : "–"} sub={`${fmtNum(agg.d1)} devices`} def="Returned the day after first visit." />
            <StatTile label="D7 return" value={agg.n ? fmtPct(agg.d7 / agg.n, 1) : "–"} sub={`${fmtNum(agg.d7)} devices`} def="Returned within 7 days of first visit." />
            <StatTile label="D30 return" value={agg.n ? fmtPct(agg.d30 / agg.n, 1) : "–"} sub={`${fmtNum(agg.d30)} devices`} def="Returned within 30 days (young cohorts still maturing)." />
          </Grid>
        </Card>
      </Two>
      <div style={{ height: 12 }} />
      <Card>
        <Frame title="Weekly signup cohorts" def="Each row is a signup week; cells show the share of those accounts with signed-in activity N weeks later." source={dget(d, "cohorts.source")}
          columns={["Week", "Size"]} rows={cohortRows.map((r) => [r.week_start, r.new_users])}>
          <CohortGrid rows={cohortRows} />
        </Frame>
      </Card>
      <div style={{ height: 12 }} />
      <Two>
        <Card>
          <Frame title="Recent signups — owner eyes only" def={dget(d, "piiNote", "Contains account emails.")}
            source={dget(d, "recentSignups.source")}>
            <DataTable caption="Recent signups"
              columns={["Email", "Signed up", "Confirmed", "Last active"]}
              rows={(dget(d, "recentSignups.data", null) || []).map((r) => [r.email, String(r.created_at || "").slice(0, 16).replace("T", " "), r.confirmed ? "✓" : "—", r.last_active ? String(r.last_active).slice(0, 16).replace("T", " ") : "never"])} />
          </Frame>
        </Card>
        <Card>
          <Frame title="Recent shares — who shared what" def="Sharer attribution: account email when the sharer was signed in, otherwise a truncated anonymous device prefix. Share DESTINATION (which app was picked) is never revealed by the OS share sheet — per-channel share buttons are the phase-2 path to that."
            source={dget(d, "recentShares.source")}>
            <DataTable caption="Recent shares"
              columns={["When", "Who", "Shared", "Kind"]}
              rows={(dget(d, "recentShares.data", null) || []).map((r) => [String(r.created_at || "").slice(5, 16).replace("T", " "), r.who, r.shared_what, r.kind || "—"])} />
          </Frame>
        </Card>
      </Two>
    </Section>
  );
}

function HealthSection({ auth, range }) {
  const p = usePanel("health", auth, range, { refreshMs: 120000 });
  const d = dget(p.data, "data", null);
  if (p.error) return <Section id="health" title="Site speed, reliability & quality"><PanelError {...p} reload={p.reload} /></Section>;
  const checks = dget(d, "synthetic.data.checks", null) || [];
  const sec = dget(d, "synthetic.data.security", null) || [];
  const field = dget(d, "webVitals.field.data", null);
  const lab = dget(d, "webVitals.lab.data", null);
  const th = dget(d, "webVitals.thresholds", { LCP: 2500, INP: 200, CLS: 0.1 });
  const errDaily = dget(d, "errors.daily.data", null);
  const sentry = dget(d, "errors.sentry", null);
  const integ = dget(d, "integrations.data", null) || [];
  const cwvFmt = (m, v) => (m === "CLS" ? String(v) : fmtMs(v));
  return (
    <Section id="health" title="Site speed, reliability & quality" loading={p.loading && !p.data}
      sub={dget(d, "webVitals.note", "")}>
      <Card>
        <div style={{ ...TYPE.eyebrow, color: C.muted, marginBottom: 8 }}>Live self-check <DefTip text="This server fetched production just now and reports what it measured — status, latency, and served security headers. Single region; not uptime history." /></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {checks.length ? checks.map((c) => <StatusPill key={c.key} ok={c.ok} label={c.label} detail={c.ok ? `${c.status} · ${c.ms}ms` : c.error || `HTTP ${c.status}`} />) : <EmptyNote>Self-check unavailable from this environment.</EmptyNote>}
        </div>
        {sec.length ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {sec.map((h) => <StatusPill key={h.header} ok={h.present} label={h.header} detail={h.present ? "served" : "missing"} />)}
          </div>
        ) : null}
        <div style={{ marginTop: 8 }}><SourceBadge source={dget(d, "synthetic.source")} /></div>
      </Card>
      <div style={{ height: 12 }} />
      <Two>
        <Card>
          <Frame title="Core Web Vitals — field (real visits, p75)" def="p75 of real-visitor measurements from the web_vitals event, split by device. Pass thresholds: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1."
            source={dget(d, "webVitals.field.source")}
            columns={["Metric", "Device", "p75", "Samples", "Status"]}
            rows={(field || []).map((r) => [r.metric, r.device, cwvFmt(r.metric, r.p75), r.samples, th[r.metric] != null ? (Number(r.p75) <= th[r.metric] ? "pass" : "FAIL") : "info"])}>
            {field ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(field || []).filter((r) => ["LCP", "INP", "CLS", "TTFB", "FCP"].includes(r.metric)).map((r) => {
                  const pass = th[r.metric] != null ? Number(r.p75) <= th[r.metric] : null;
                  return <StatusPill key={r.metric + r.device} ok={pass} label={`${r.metric} · ${r.device}`} detail={`${cwvFmt(r.metric, r.p75)} · n=${r.samples}`} />;
                })}
              </div>
            ) : <NotConnected source={dget(d, "webVitals.field.source")} compact />}
          </Frame>
        </Card>
        <Card>
          <Frame title="Core Web Vitals — lab (PageSpeed cron)" def="Hourly Lighthouse runs stored in cwv_runs (mobile). Latest run per URL, with 7-day averages."
            source={dget(d, "webVitals.lab.source")}
            columns={["URL", "Perf", "LCP", "CLS", "TBT", "Last run"]}
            rows={(lab || []).map((r) => [String(r.url || "").replace(/^https?:\/\/[^/]+/, "") || "/", r.perf_score, fmtMs(r.lcp_ms), r.cls, fmtMs(r.tbt_ms), String(r.last_run || "").slice(0, 16).replace("T", " ")])}>
            {lab && lab.length ? (
              <HBarList color={CAT[0]} valueFmt={(v) => fmtMs(v)} items={lab.slice(0, 8).map((r) => ({ label: String(r.url || "").replace(/^https?:\/\/[^/]+/, "") || "/", value: r.lcp_ms, secondary: `perf ${r.perf_score ?? "–"}` }))} secondary="Bar = LCP (lab, mobile)." />
            ) : (
              <EmptyNote>The hourly PageSpeed cron is configured but has no stored runs yet — verify CRON_SECRET and PAGESPEED_API_KEY are set in Vercel, then check /api/cron/cwv logs.</EmptyNote>
            )}
          </Frame>
        </Card>
      </Two>
      <div style={{ height: 12 }} />
      <Two>
        <Card>
          <Frame title="Errors & friction per day" def="PostHog-captured exceptions, in-app app_error events, rage clicks and dead clicks by day."
            source={dget(d, "errors.daily.source")}
            columns={["Day", "Exceptions", "App errors", "Rage clicks", "Dead clicks"]}
            rows={(errDaily || []).map((r) => [String(r.day).slice(0, 10), r.exceptions, r.app_errors, r.rage_clicks, r.dead_clicks])}>
            {errDaily && errDaily.length ? (
              <LineChart height={150}
                xLabels={errDaily.map((r) => String(r.day).slice(0, 10))}
                series={[
                  { name: "exceptions", color: STATUS.critical, values: errDaily.map((r) => Number(r.exceptions) || 0) },
                  { name: "app errors", color: STATUS.serious, values: errDaily.map((r) => Number(r.app_errors) || 0) },
                  { name: "rage clicks", color: CAT[3], values: errDaily.map((r) => Number(r.rage_clicks) || 0) },
                ]} />
            ) : dget(d, "errors.daily.source.connected") === false ? <NotConnected source={dget(d, "errors.daily.source")} compact /> : <EmptyNote>No errors captured in this window.</EmptyNote>}
          </Frame>
        </Card>
        <Card>
          <div style={{ ...TYPE.eyebrow, color: C.muted, marginBottom: 8 }}>Error monitor (Sentry)</div>
          {sentry && sentry.data ? (
            <div>
              <StatTile label="Unresolved issues (24h)" goodWhenUp={false} value={fmtNum(sentry.data.unresolved_24h)} source={sentry.source} def="Sentry issues unresolved with events in the last 24 hours." />
              {(sentry.data.issues || []).map((i) => (
                <a key={i.link} href={i.link} target="_blank" rel="noreferrer" style={{ display: "block", fontSize: 12, color: C.light, textDecoration: "none", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                  {i.title} <span style={{ color: C.muted }}>· {i.count}× · {i.users} users</span>
                </a>
              ))}
            </div>
          ) : <NotConnected source={sentry && sentry.source} />}
          <div style={{ height: 12 }} />
          {dget(d, "uptime.source") ? <NotConnected source={dget(d, "uptime.source")} compact /> : null}
        </Card>
      </Two>
      <div style={{ height: 12 }} />
      <Card>
        <div style={{ ...TYPE.eyebrow, color: C.muted, marginBottom: 8 }}>Third-party integrations <DefTip text="Presence of server configuration per integration (not a liveness probe). Sourced from the server environment only — no key values are ever sent to the browser." /></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {integ.map((i) => <StatusPill key={i.key} ok={i.configured ? true : null} label={i.label} detail={i.configured ? (i.note || "configured") : "not configured"} />)}
        </div>
        <div style={{ marginTop: 8 }}><SourceBadge source={dget(d, "integrations.source")} /></div>
      </Card>
    </Section>
  );
}

function OpsSection({ auth }) {
  const p = usePanel("ops", auth, { key: "today" });
  const d = dget(p.data, "data", null);
  if (p.error) return <Section id="ops" title="Code & operations"><PanelError {...p} reload={p.reload} /></Section>;
  const rt = dget(d, "runtime.data", {}) || {};
  const repo = dget(d, "repo.data", null);
  const deploys = dget(d, "deployments.data", null);
  const build = dget(d, "build.data", null);
  return (
    <Section id="ops" title="Code & operations" loading={p.loading && !p.data}
      sub="Operational context — the running build, recent code motion, and repo shape. Counts are context, not product success.">
      <Grid min={190}>
        <StatTile label="Serving commit" value={rt.commit_sha ? rt.commit_sha.slice(0, 7) : "–"} sub={rt.commit_ref ? `branch ${rt.commit_ref}` : "not on Vercel"} def="The commit this running deployment was built from (Vercel system env)." source={dget(d, "runtime.source")} />
        <StatTile label="Environment" value={rt.env || "–"} sub={rt.built_at ? `built ${String(rt.built_at).slice(0, 16).replace("T", " ")}` : undefined} def="VERCEL_ENV of the serving deployment + the build timestamp stamped at build time." />
        <StatTile label="Repo head (main)" value={repo && repo.head_sha ? repo.head_sha.slice(0, 7) : "–"} sub={repo && repo.pushed_at ? `pushed ${String(repo.pushed_at).slice(0, 16).replace("T", " ")}` : undefined} def="Latest commit on main from the GitHub API. If it differs from the serving commit, a deploy is pending or failed." source={dget(d, "repo.source")} />
        <StatTile label="Tracked files" value={build ? fmtNum(build.files) : "–"} sub={build ? `${fmtNum(build.lines)} lines in app/lib/scripts` : "after next deploy"} def={dget(d, "build.note", "")} source={dget(d, "build.source")} />
      </Grid>
      <div style={{ height: 12 }} />
      <Two>
        <Card>
          <Frame title="Recent commits (main)" def="Last 10 commits on the default branch, from the public GitHub API." source={dget(d, "repo.source")}
            columns={["SHA", "Message", "When"]}
            rows={(repo && repo.commits || []).map((c) => [c.sha, c.message, String(c.date || "").slice(0, 16).replace("T", " ")])}>
            {repo ? (
              <div>
                {(repo.commits || []).map((c) => (
                  <div key={c.sha} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                    <code style={{ color: C.accent, fontSize: 11 }}>{c.sha}</code>
                    <span style={{ color: C.light, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.message}</span>
                    <span style={{ color: C.muted, fontSize: 11, whiteSpace: "nowrap" }}>{String(c.date || "").slice(5, 16).replace("T", " ")}</span>
                  </div>
                ))}
              </div>
            ) : <NotConnected source={dget(d, "repo.source")} compact />}
          </Frame>
        </Card>
        <Card>
          <Frame title="Language breakdown" def="Bytes per language from GitHub linguist — shown as bytes, not lines, because that is what is actually measured." source={dget(d, "repo.source")}
            columns={["Language", "Bytes", "%"]}
            rows={(repo && repo.languages || []).map((l) => [l.lang, fmtNum(l.bytes), l.pct + "%"])}>
            {repo ? <HBarList color={CAT[0]} valueFmt={fmtNum} items={(repo.languages || []).map((l) => ({ label: l.lang, value: l.bytes, secondary: l.pct + "%" }))} maxRows={6} /> : <NotConnected source={dget(d, "repo.source")} compact />}
          </Frame>
          <div style={{ height: 12 }} />
          <Frame title="Recent deployments" def="Latest Vercel deployments with build state." source={dget(d, "deployments.source")}
            columns={["State", "Target", "Branch", "Commit"]}
            rows={(deploys || []).map((x) => [x.state, x.target, x.ref, x.sha])}>
            {deploys ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {deploys.slice(0, 6).map((x, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                    <StatusPill ok={String(x.state).toUpperCase() === "READY" ? true : String(x.state).toUpperCase() === "ERROR" ? false : null} label={x.target} detail={x.state} />
                    <span style={{ color: C.light, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.ref} {x.sha ? `@ ${x.sha}` : ""}</span>
                  </div>
                ))}
              </div>
            ) : <NotConnected source={dget(d, "deployments.source")} compact />}
          </Frame>
        </Card>
      </Two>
      <div style={{ height: 12 }} />
      <Two min={280}>
        <Card><NotConnected source={dget(d, "quality.coverage.source")} compact /></Card>
        <Card><NotConnected source={dget(d, "quality.vulnerabilities.source")} compact /></Card>
      </Two>
    </Section>
  );
}

function SourcesFooter({ auth }) {
  const p = usePanel("meta", auth, { key: "today" });
  const em = dget(p.data, "data.eventMap", null);
  if (!em) return null;
  return (
    <Section id="sources" title="Event dictionary & definitions"
      sub="Canonical metric vocabulary → the real tracked signal each number is computed from. Existing production event names are preserved; nothing is double-fired or renamed.">
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
          {Object.entries(em).map(([name, spec]) => (
            <div key={name} style={{ border: `1px solid ${C.border}`, borderRadius: RADII.control, padding: "10px 12px" }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                <code style={{ fontSize: 12, color: C.text, fontWeight: 700 }}>{name}</code>
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase", color: spec.tracked ? STATUS.good : C.muted, border: `1px solid ${spec.tracked ? STATUS.good : C.border}`, borderRadius: 99, padding: "1px 7px" }}>
                  {spec.tracked ? "tracked" : "not tracked"}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.45 }}>{spec.definition}</div>
              {(spec.sources || []).map((s, i) => <div key={i} style={{ fontSize: 10.5, color: C.light, marginTop: 3 }}><span style={{ color: C.muted }}>{s.store}:</span> <code>{s.match}</code></div>)}
            </div>
          ))}
        </div>
      </Card>
    </Section>
  );
}

// ── main ────────────────────────────────────────────────────────────────────
export default function CommandCenter() {
  const [auth, setAuth] = useAuthState();
  const [rangeKey, setRangeKey] = useState("today");
  const [custom, setCustom] = useState({ from: "", to: "" });
  // Custom range ships the raw local dates; the SERVER resolves them to ET day
  // boundaries (DST-correct) in lib/commandCenter/time.js — never a client guess.
  const range = useMemo(() => rangeKey === "custom"
    ? { key: "custom", from: custom.from || "", to: custom.to || "" }
    : { key: rangeKey }, [rangeKey, custom]);

  // Gate probe: ask the server who we are (403 => signed in but not owner).
  const meta = usePanel("meta", auth, { key: "today" }, { enabled: auth.status === "ready" });

  if (auth.status === "loading") {
    return <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: C.muted, fontFamily: FONT }}>Checking session…</div>;
  }
  if (auth.status !== "ready" || meta.status === 401 || meta.status === 403 || meta.status === 503) {
    return (
      <div style={{ fontFamily: FONT }}>
        <LockScreen auth={auth} setAuth={setAuth} denied={meta.status === 403} notConfigured={meta.status === 503} />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: FONT, color: C.text, maxWidth: 1180, margin: "0 auto", padding: "0 16px 60px" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(13,17,23,.94)", backdropFilter: "blur(6px)", borderBottom: `1px solid ${C.border}`, margin: "0 -16px", padding: "10px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.3px" }}>Wayfind <span style={{ color: C.accent }}>Command Center</span></span>
          <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 99, padding: "2px 8px" }}>Owner only</span>
          <span style={{ flex: 1 }} />
          <nav aria-label="Sections" style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`} style={{ fontSize: 11, fontWeight: 700, color: C.muted, textDecoration: "none", padding: "4px 7px", borderRadius: 7 }}>{label}</a>
            ))}
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          <span style={{ ...TYPE.eyebrow, color: C.muted, marginRight: 2 }}>Range</span>
          {RANGES.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setRangeKey(k)} aria-pressed={rangeKey === k}
              style={{
                background: rangeKey === k ? C.adim : "transparent", color: rangeKey === k ? C.accent : C.light,
                border: `1px solid ${rangeKey === k ? C.accent : C.border}`, borderRadius: 999, fontSize: 11.5, fontWeight: 800,
                padding: "5px 11px", cursor: "pointer", transition: `all ${MOTION.fast} ${MOTION.ease}`, minHeight: 30,
              }}>{label}</button>
          ))}
          {rangeKey === "custom" && (
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <label style={{ position: "absolute", left: -9999 }} htmlFor="cc-from">From</label>
              <input id="cc-from" type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                style={{ background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 8px", fontSize: 16, colorScheme: "dark" }} />
              <span style={{ color: C.muted, fontSize: 11 }}>→</span>
              <label style={{ position: "absolute", left: -9999 }} htmlFor="cc-to">To</label>
              <input id="cc-to" type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                style={{ background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 8px", fontSize: 16, colorScheme: "dark" }} />
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10.5, color: C.muted }}>{auth.email ? `Signed in: ${auth.email}` : "Access-key mode"} · auto-refresh 60s</span>
        </div>
      </header>

      <AlertsSection auth={auth} range={range} />
      <OverviewSection auth={auth} range={range} />
      <TrafficSection auth={auth} range={range} />
      <JourneySection auth={auth} range={range} />
      <PlacesSection auth={auth} range={range} />
      <RetentionSection auth={auth} range={range} />
      <HealthSection auth={auth} range={range} />
      <OpsSection auth={auth} />
      <SourcesFooter auth={auth} />
    </div>
  );
}
