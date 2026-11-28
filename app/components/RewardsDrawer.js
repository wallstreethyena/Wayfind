"use client";
// Rewards and badges: the member's tier, progress to the next tier, every badge
// (earned or how to earn it) and recent visits. Opened from "Log your visit"
// and from the account sheet. Reads only the member's own rows (the route
// passes their token, row level security does the rest). Lazy chunk.
import { useEffect, useState } from "react";
import { C } from "./kit";
import { Shell, showInHost, quietBtn, mainBtn, errStyle } from "./reserveUi.js";
import { fetchRewards } from "../../lib/tripLogClient.js";
import { LeaderboardSettings, DailyPicksToggle } from "./CommunitySettings.js";
import { heartStatus, soundOn, setSoundOn } from "../../lib/heartPop.js";

// Heart level (lib/heartPop.js): the hearts earned on this device for saving,
// sharing, coming back and more, plus the one switch for the reward sound.
export function HeartLevelCard() {
  const [h, setH] = useState(null);
  const [snd, setSnd] = useState(true);
  useEffect(() => { setH(heartStatus()); setSnd(soundOn()); }, []);
  if (!h) return null;
  const pct = Math.round(h.progress * 100);
  const toggle = () => { const next = !snd; setSoundOn(next); setSnd(next); };
  return (
    <div data-heart-level={h.level} style={{ background: "rgba(244,114,182,.07)", border: "1px solid rgba(244,114,182,.35)", borderRadius: 14, padding: 14, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, letterSpacing: ".5px", textTransform: "uppercase" }}>Hearts</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: "2px 0 0" }}>Heart level {h.level}</div>
        </div>
        <button type="button" data-heart-sound={snd ? "on" : "off"} aria-pressed={!snd} onClick={toggle} style={{ minHeight: 44, padding: "0 12px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.card, color: C.light, fontSize: 13, fontWeight: 700, cursor: "pointer", flex: "0 0 auto" }}>{snd ? "Sound on" : "Sound off"}</button>
      </div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progress to next heart level" style={{ height: 8, background: C.border, borderRadius: 999, overflow: "hidden", margin: "10px 0 8px" }}>
        <div style={{ height: "100%", width: pct + "%", background: `linear-gradient(90deg, ${C.pink}, ${C.accent})`, borderRadius: 999 }} />
      </div>
      <div style={{ fontSize: 13, color: C.light }}>{h.xp} hearts. {h.toGo} more for level {h.level + 1}. Earn them by saving, sharing, exploring the map and coming back.</div>
    </div>
  );
}

function ProgressBar({ value }) {
  const pct = Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100);
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progress to next tier" style={{ height: 10, background: C.border, borderRadius: 999, overflow: "hidden" }}>
      <div style={{ height: "100%", width: pct + "%", background: C.gold, borderRadius: 999 }} />
    </div>
  );
}

export function RewardsBody({ state, onRetry, onSignIn }) {
  if (state.loading) {
    return (
      <div aria-busy="true" aria-live="polite" data-rewards-loading="1">
        <div style={{ height: 64, borderRadius: 14, background: C.card, marginBottom: 10 }} />
        <div style={{ height: 120, borderRadius: 14, background: C.card }} />
        <span style={{ position: "absolute", left: -9999 }}>Loading your rewards</span>
      </div>
    );
  }
  const r = state.data;
  if (!r || !r.ok) {
    const code = r && r.code;
    return (
      <div data-rewards-error={code || "unknown"}>
        <p role="alert" style={errStyle}>{(r && r.error) || "We could not load your rewards. Please try again."}</p>
        {code === "sign_in" ? (onSignIn ? <button type="button" style={mainBtn} onClick={onSignIn}>Sign in</button> : null)
          : <button type="button" style={quietBtn} onClick={onRetry}>Try again</button>}
      </div>
    );
  }
  const rw = r.rewards;
  const earned = rw.badges.filter((b) => b.earned);
  const locked = rw.badges.filter((b) => !b.earned);
  return (
    <div data-rewards-ready="1">
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, letterSpacing: ".5px", textTransform: "uppercase" }}>Your tier</div>
        <div data-rewards-tier={rw.tier.id} style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: "2px 0 8px" }}>{rw.tier.name}</div>
        <ProgressBar value={rw.progress} />
        <div style={{ fontSize: 13, color: C.light, marginTop: 8 }}>
          {rw.points} points{rw.next ? `. ${rw.next.pointsToGo} more to reach ${rw.next.name}.` : ". You reached the top tier."}
        </div>
        {typeof rw.giveawayEntries === "number" ? <div data-rewards-entries="1" style={{ fontSize: 13, color: C.light, marginTop: 4 }}>Entries this month: {rw.giveawayEntries}</div> : null}
      </div>
      {rw.visits === 0 ? (
        <div data-rewards-empty="1" style={{ fontSize: 14, color: C.light, lineHeight: 1.45, marginBottom: 12 }}>
          No visits yet. Open any place you have been to and tap Log your visit. Logging while you are there earns the most points.
        </div>
      ) : null}
      <div style={{ fontSize: 14, fontWeight: 800, color: C.text, margin: "4px 0 8px" }}>Badges</div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
        {[...earned, ...locked].map((b) => (
          <li key={b.id} data-badge={b.id} data-earned={b.earned ? "1" : "0"} style={{ background: b.earned ? "rgba(251,191,36,.10)" : C.card, border: `1px solid ${b.earned ? "rgba(251,191,36,.45)" : C.border}`, borderRadius: 12, padding: "10px 12px", minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: b.earned ? C.gold : C.light, overflowWrap: "anywhere" }}>{b.earned ? "★ " : ""}{b.name}</div>
            <div data-badge-level={b.level || ""} style={{ fontSize: 12, color: C.muted, marginTop: 2, overflowWrap: "anywhere" }}>{b.earned ? (b.levelName ? b.levelName : "Earned") + (b.next ? `. ${b.next.toGo} more for ${b.next.levelName}` : "") : b.how}</div>
          </li>
        ))}
      </ul>
      {Array.isArray(r.recent) && r.recent.length ? (
        <div style={{ fontSize: 13, color: C.muted, marginTop: 12 }}>
          {r.recent.length === 1 ? "1 recent visit" : `${r.recent.length} recent visits`}, {r.recent.filter((x) => x.verified).length} logged on the spot.
        </div>
      ) : null}
      <LeaderboardSettings />
      <DailyPicksToggle />
      <p style={{ fontSize: 13, color: C.muted, margin: "12px 0 0" }}><a href="/community" style={{ color: C.gold }}>Community guides</a> · <a href="/leaderboard" style={{ color: C.gold }}>Leaderboard</a></p>
    </div>
  );
}

export default function RewardsDrawer({ onClose, onSignIn }) {
  const [state, setState] = useState({ loading: true, data: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let dead = false;
    setState({ loading: true, data: null });
    fetchRewards().then((data) => { if (!dead) setState({ loading: false, data }); });
    return () => { dead = true; };
  }, [tick]);
  return (
    <Shell title="Rewards and badges" sub="Log visits to earn points, move up tiers and unlock badges." onClose={onClose} titleId="wf-rewards-title">
      <HeartLevelCard />
      <RewardsBody state={state} onRetry={() => setTick((n) => n + 1)} onSignIn={onSignIn ? () => { onClose(); onSignIn(); } : null} />
    </Shell>
  );
}

export function showRewardsDrawer(opts = {}) {
  showInHost((close) => <RewardsDrawer onClose={close} onSignIn={opts.onSignIn || null} />);
}
