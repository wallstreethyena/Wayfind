"use client";
// Two small settings blocks for the Rewards drawer (owner order 2026-11-27):
//   LeaderboardSettings  join or leave the monthly leaderboard with a public
//                        name the member picks (checked and moderated server side);
//   DailyPicksToggle     one personalized pick a day as a browser notification.
//                        Permission is asked ONLY when the member taps Turn on.
// DailyPicksOffer is the one line prompt shown at a useful moment (right after
// a visit is logged); it hides for 21 days when dismissed.
import { useEffect, useState } from "react";
import { C } from "./kit";
import { readLeaderboardMe, saveLeaderboard } from "../../lib/communityClient.js";
import { memberBearer } from "../../lib/tripLogClient.js";
import { webPushSupported, pushPermission, currentSubscription, enableDailyPicks, disableDailyPicks, shouldOfferDailyPicks, noteDailyPicksOfferDismissed } from "../../lib/webPushClient.js";

const box = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginTop: 12 };
const h = { fontSize: 14, fontWeight: 800, color: C.text, margin: "0 0 4px" };
const sub = { fontSize: 12.5, color: C.muted, lineHeight: 1.45, margin: "0 0 10px" };
const btn = (primary) => ({ minHeight: 44, padding: "0 14px", borderRadius: 12, border: primary ? "none" : `1px solid ${C.border}`, background: primary ? C.gold : "transparent", color: primary ? "#0D1117" : C.light, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" });
const msgStyle = (bad) => ({ fontSize: 13, color: bad ? "#FCA5A5" : C.light, margin: "8px 0 0" });

function storage() { try { return window.localStorage; } catch { return null; } }

export function LeaderboardSettings() {
  const [state, setState] = useState({ loading: true, optIn: false, name: "", saved: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: "", bad: false });
  useEffect(() => {
    let dead = false;
    readLeaderboardMe().then((r) => {
      if (dead) return;
      const me = r && r.me;
      setState({ loading: false, optIn: Boolean(me && me.optIn), name: (me && me.publicName) || "", saved: (me && me.publicName) || "" });
    });
    return () => { dead = true; };
  }, []);
  if (state.loading) return <div style={{ ...box, minHeight: 92 }} aria-busy="true" />;
  const save = async (optIn) => {
    if (busy) return;
    setBusy(true); setMsg({ text: "", bad: false });
    const nameChanged = state.name.trim() !== state.saved;
    const r = await saveLeaderboard(optIn, nameChanged ? state.name.trim() : undefined);
    setBusy(false);
    if (r && r.ok) {
      setState((s) => ({ ...s, optIn: r.optIn, saved: r.publicName || "", name: r.publicName || "" }));
      setMsg({ text: r.optIn ? "You are on the leaderboard." : "You are off the leaderboard.", bad: false });
    } else setMsg({ text: (r && r.error) || "Please try again.", bad: true });
  };
  return (
    <div style={box} data-leaderboard-settings={state.optIn ? "on" : "off"}>
      <div style={h}>Leaderboard</div>
      <p style={sub}>Show your public name and this month's points on the <a href="/leaderboard" style={{ color: C.gold }}>leaderboard</a>. Nothing else about you is shown.</p>
      <label style={{ display: "block", fontSize: 13, color: C.light }}>
        Public name
        <input value={state.name} maxLength={24} onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))} autoComplete="nickname"
          style={{ display: "block", marginTop: 4, minHeight: 44, width: "100%", padding: "0 10px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.panel, color: C.text, fontSize: 16, fontFamily: "inherit", boxSizing: "border-box" }} />
      </label>
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        {state.optIn
          ? <><button type="button" disabled={busy} style={btn(true)} onClick={() => save(true)}>Save name</button><button type="button" disabled={busy} style={btn(false)} onClick={() => save(false)}>Leave leaderboard</button></>
          : <button type="button" disabled={busy || state.name.trim().length < 2} style={{ ...btn(true), opacity: state.name.trim().length < 2 ? 0.6 : 1 }} onClick={() => save(true)}>Join leaderboard</button>}
      </div>
      {msg.text ? <p role="status" style={msgStyle(msg.bad)}>{msg.text}</p> : null}
    </div>
  );
}

export function DailyPicksToggle() {
  const [st, setSt] = useState({ ready: false, supported: false, on: false, perm: "default" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: "", bad: false });
  useEffect(() => {
    let dead = false;
    const supported = webPushSupported();
    if (!supported) { setSt({ ready: true, supported: false, on: false, perm: "unsupported" }); return; }
    currentSubscription().then((s) => { if (!dead) setSt({ ready: true, supported: true, on: Boolean(s), perm: pushPermission() }); }).catch(() => { if (!dead) setSt({ ready: true, supported: true, on: false, perm: pushPermission() }); });
    return () => { dead = true; };
  }, []);
  if (!st.ready) return <div style={{ ...box, minHeight: 92 }} aria-busy="true" />;
  if (!st.supported) {
    return (
      <div style={box} data-daily-picks="unsupported">
        <div style={h}>Daily pick</div>
        <p style={{ ...sub, margin: 0 }}>This browser cannot show Wayfind notifications. On iPhone, add Wayfind to your Home Screen first.</p>
      </div>
    );
  }
  const toggle = async () => {
    if (busy) return;
    setBusy(true); setMsg({ text: "", bad: false });
    const r = st.on ? await disableDailyPicks(memberBearer) : await enableDailyPicks(memberBearer);
    setBusy(false);
    if (r && r.ok) {
      setSt((s) => ({ ...s, on: !s.on, perm: pushPermission() }));
      setMsg({ text: st.on ? "Daily picks are off." : "Done. One pick a day, never at night.", bad: false });
    } else setMsg({ text: (r && r.error) || "Please try again.", bad: true });
  };
  return (
    <div style={box} data-daily-picks={st.on ? "on" : "off"}>
      <div style={h}>Daily pick</div>
      <p style={sub}>One place a day picked from the spots you log and plan. Never more than one a day, never between 8 PM and 9 AM. Turn it off here any time.</p>
      {st.perm === "denied" && !st.on
        ? <p style={{ ...sub, margin: 0 }}>Notifications are blocked for Wayfind in your browser settings.</p>
        : <button type="button" disabled={busy} style={btn(!st.on)} onClick={toggle} aria-pressed={st.on}>{busy ? "Saving" : st.on ? "Turn off daily picks" : "Turn on daily picks"}</button>}
      {msg.text ? <p role="status" style={msgStyle(msg.bad)}>{msg.text}</p> : null}
    </div>
  );
}

/** One line offer after a visit is logged. Renders nothing unless it makes sense. */
export function DailyPicksOffer({ logEvent }) {
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { try { setShow(shouldOfferDailyPicks(storage())); } catch { setShow(false); } }, []);
  if (!show && !msg) return null;
  if (msg) return <p role="status" style={{ fontSize: 13, color: C.light, margin: "10px 0 0" }}>{msg}</p>;
  const yes = async () => {
    if (busy) return;
    setBusy(true);
    const r = await enableDailyPicks(memberBearer);
    setBusy(false);
    try { logEvent && logEvent("daily_picks_offer", { result: (r && r.code) || "error" }); } catch {}
    setShow(false);
    setMsg(r && r.ok ? "Done. One pick a day, never at night." : (r && r.error) || "Please try again later.");
  };
  const no = () => { noteDailyPicksOfferDismissed(storage()); setShow(false); try { logEvent && logEvent("daily_picks_offer", { result: "dismissed" }); } catch {} };
  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }} data-daily-picks-offer="1">
      <div style={{ fontSize: 13.5, color: C.light, lineHeight: 1.4 }}>Want one pick a day based on spots like this one?</div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" disabled={busy} style={btn(true)} onClick={yes}>{busy ? "Turning on" : "Yes, turn on"}</button>
        <button type="button" disabled={busy} style={btn(false)} onClick={no}>Not now</button>
      </div>
    </div>
  );
}
