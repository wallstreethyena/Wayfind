"use client";
// "Log your visit" on a place detail. One tap opens a short form: when you went,
// four optional pick lists (crowd, vibe, best time, wait) and "I'm here now",
// which checks the device position against the place once (never stored).
// Signed out: the button opens sign in. Every state is handled in place:
// sending, offline, duplicate, rate limited, closed place, and success with the
// points earned and the way to the badges drawer. Lazy chunk; the detail sheet
// reserves its collapsed height so nothing below it jumps.
import { useEffect, useRef, useState } from "react";
import { C } from "./kit";
import { CROWD, VIBE, BEST_TIME, WAIT, LABELS, MAX_BACKDATE_DAYS } from "../../lib/rewards.js";
import { submitTripLog, devicePosition } from "../../lib/tripLogClient.js";
import { siteTodayStr, utcCalendarDateKey } from "../../lib/siteTime";
import { shareLink } from "../../lib/communityClient.js";
import { DailyPicksOffer } from "./CommunitySettings.js";

export const LOG_VISIT_MIN_HEIGHT = 92;

// Civil calendar arithmetic on a YYYY-MM-DD that is already the Eastern day.
function shiftDay(dateStr, delta) {
  const t = Date.parse(dateStr + "T12:00:00Z");
  if (!Number.isFinite(t)) return dateStr;
  return utcCalendarDateKey(t + delta * 86400000);
}

const chipStyle = (on) => ({
  minHeight: 40, padding: "0 13px", borderRadius: 999, fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  border: `1px solid ${on ? C.gold : C.border}`, background: on ? "rgba(251,191,36,.14)" : C.card, color: on ? C.gold : C.light,
});

function ChipRow({ label, field, options, value, onPick }) {
  const id = "wf-lv-" + field;
  return (
    <fieldset style={{ border: 0, margin: "10px 0 0", padding: 0, minWidth: 0 }}>
      <legend id={id} style={{ fontSize: 12.5, fontWeight: 800, color: C.muted, marginBottom: 6, padding: 0 }}>{label} <span style={{ fontWeight: 600 }}>(optional)</span></legend>
      <div role="group" aria-labelledby={id} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {options.map((o) => (
          <button key={o} type="button" aria-pressed={value === o} onClick={() => onPick(value === o ? null : o)} style={chipStyle(value === o)}>{LABELS[field][o]}</button>
        ))}
      </div>
    </fieldset>
  );
}

export default function LogVisitCard({ refKind = "place", refId, placeName = "", user, onSignIn, logEvent }) {
  const today = siteTodayStr();
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState("today");
  const [earlier, setEarlier] = useState(shiftDay(today, -2));
  const [hereNow, setHereNow] = useState(false);
  const [intel, setIntel] = useState({ crowd: null, vibe: null, best_time: null, wait: null });
  const [status, setStatus] = useState({ phase: "idle", msg: "", result: null });
  const [shared, setShared] = useState("");
  const firstRef = useRef(null);

  // A new place resets the card.
  useEffect(() => {
    setOpen(false); setWhen("today"); setHereNow(false);
    setIntel({ crowd: null, vibe: null, best_time: null, wait: null });
    setStatus({ phase: "idle", msg: "", result: null });
  }, [refKind, refId]);

  useEffect(() => { if (open && firstRef.current) { try { firstRef.current.focus({ preventScroll: true }); } catch {} } }, [open]);

  if (!refId) return null;
  const minDate = shiftDay(today, -MAX_BACKDATE_DAYS);
  const visitedOn = when === "today" ? today : when === "yesterday" ? shiftDay(today, -1) : earlier;
  const busy = status.phase === "sending" || status.phase === "locating";

  const start = () => {
    if (!user) { try { logEvent && logEvent("trip_log_signin_prompt", { ref_kind: refKind }); } catch {} if (onSignIn) onSignIn(); return; }
    setOpen(true);
    try { logEvent && logEvent("trip_log_open", { ref_kind: refKind }); } catch {}
  };

  const submit = async (e) => {
    if (e) e.preventDefault();
    if (busy) return;
    if (when === "earlier" && (!earlier || earlier < minDate || earlier > today)) {
      setStatus({ phase: "error", msg: "Pick a date from the last 14 days.", result: null });
      return;
    }
    let device = null;
    if (hereNow && when === "today") {
      setStatus({ phase: "locating", msg: "Checking that you are here", result: null });
      device = await devicePosition();
    }
    setStatus({ phase: "sending", msg: "Saving your visit", result: null });
    const res = await submitTripLog({
      refKind, refId, visitedOn,
      crowd: intel.crowd, vibe: intel.vibe, bestTime: intel.best_time, wait: intel.wait,
      device: device || undefined,
    });
    if (res && res.ok) {
      setStatus({ phase: "done", msg: "", result: res });
      try { logEvent && logEvent("trip_log_saved", { ref_kind: refKind, verification: res.verification, points: res.pointsAwarded }); } catch {}
    } else {
      setStatus({ phase: "error", msg: (res && res.error) || "We could not save that visit. Please try again.", result: res || null, code: res && res.code });
      try { logEvent && logEvent("trip_log_failed", { ref_kind: refKind, code: (res && res.code) || "unknown" }); } catch {}
    }
  };

  const openDrawer = () => {
    import("./RewardsDrawer.js").then((m) => m.showRewardsDrawer({ onSignIn })).catch(() => {});
  };

  const card = { background: "rgba(251,191,36,.06)", border: "1.5px solid rgba(251,191,36,.30)", borderRadius: 16, padding: "14px 14px", marginBottom: 14, minHeight: LOG_VISIT_MIN_HEIGHT, boxSizing: "border-box" };

  if (status.phase === "done" && status.result) {
    const r = status.result;
    const rw = r.rewards || {};
    return (
      <div style={card} data-log-visit="done" role="status" aria-live="polite">
        <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Visit logged. +{r.pointsAwarded} points</div>
        <div style={{ fontSize: 13, color: C.light, marginTop: 4, lineHeight: 1.4 }}>
          {r.verification === "nearby" ? "Logged on the spot, so it counts as a verified visit. " : ""}
          {rw.tier ? `You are a ${rw.tier.name}${rw.next ? `, ${rw.next.pointsToGo} points from ${rw.next.name}.` : "."}` : ""}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          <button type="button" onClick={openDrawer} style={{ minHeight: 44, padding: "0 14px", borderRadius: 12, border: `1px solid ${C.gold}`, background: "transparent", color: C.gold, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>See your badges</button>
          <button type="button" data-log-visit-share="1" onClick={() => {
            const path = refKind === "event" ? (typeof window !== "undefined" ? window.location.pathname : "/") : "/p/" + encodeURIComponent(refId);
            const url = (typeof window !== "undefined" ? window.location.origin : "https://www.gowayfind.com") + path;
            const res = shareLink({ url, title: placeName || "Wayfind", text: placeName ? `I just went to ${placeName}. Found it on Wayfind.` : "Found this on Wayfind." }, () => setShared("Link copied"));
            try { logEvent && logEvent("trip_log_share", { ref_kind: refKind, how: res.how }); } catch {}
          }} style={{ minHeight: 44, padding: "0 14px", borderRadius: 12, border: "none", background: C.gold, color: "#0D1117", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Share it</button>
        </div>
        {shared ? <p role="status" style={{ fontSize: 13, color: C.light, margin: "8px 0 0" }}>{shared}</p> : null}
        <DailyPicksOffer logEvent={logEvent} />
      </div>
    );
  }

  if (!open) {
    return (
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 12 }} data-log-visit="collapsed">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Been here?</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2, lineHeight: 1.35 }}>{user ? "Log your visit to earn points and badges." : "Sign in to log visits and earn badges."}</div>
        </div>
        <button type="button" onClick={start} data-log-visit-start="1" style={{ flexShrink: 0, minHeight: 44, padding: "0 16px", borderRadius: 12, border: "none", background: C.gold, color: "#0D1117", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{user ? "Log your visit" : "Sign in"}</button>
      </div>
    );
  }

  return (
    <form style={card} data-log-visit="open" onSubmit={submit} aria-labelledby="wf-lv-title" noValidate>
      <div id="wf-lv-title" style={{ fontSize: 15, fontWeight: 800, color: C.text, overflowWrap: "anywhere" }}>Log your visit{placeName ? ` to ${placeName}` : ""}</div>
      <fieldset style={{ border: 0, margin: "10px 0 0", padding: 0, minWidth: 0 }}>
        <legend style={{ fontSize: 12.5, fontWeight: 800, color: C.muted, marginBottom: 6, padding: 0 }}>When did you go?</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button ref={firstRef} type="button" aria-pressed={when === "today"} onClick={() => setWhen("today")} style={chipStyle(when === "today")}>Today</button>
          <button type="button" aria-pressed={when === "yesterday"} onClick={() => { setWhen("yesterday"); setHereNow(false); }} style={chipStyle(when === "yesterday")}>Yesterday</button>
          <button type="button" aria-pressed={when === "earlier"} onClick={() => { setWhen("earlier"); setHereNow(false); }} style={chipStyle(when === "earlier")}>Earlier</button>
        </div>
        {when === "earlier" ? (
          <label style={{ display: "block", marginTop: 8, fontSize: 13, color: C.light }}>
            Date
            <input type="date" value={earlier} min={minDate} max={today} onChange={(e) => setEarlier(e.target.value)}
              style={{ display: "block", marginTop: 4, minHeight: 44, width: "100%", maxWidth: 220, padding: "0 10px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 16, fontFamily: "inherit", boxSizing: "border-box" }} />
          </label>
        ) : null}
      </fieldset>
      {when === "today" ? (
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, minHeight: 44, cursor: "pointer", fontSize: 13.5, color: C.light }}>
          <input type="checkbox" checked={hereNow} onChange={(e) => setHereNow(e.target.checked)} style={{ width: 20, height: 20, accentColor: C.gold }} />
          <span>I'm here now. Use my location once to verify (more points, location not saved).</span>
        </label>
      ) : null}
      <ChipRow label="How busy" field="crowd" options={CROWD} value={intel.crowd} onPick={(v) => setIntel((s) => ({ ...s, crowd: v }))} />
      <ChipRow label="Vibe" field="vibe" options={VIBE} value={intel.vibe} onPick={(v) => setIntel((s) => ({ ...s, vibe: v }))} />
      <ChipRow label="Best time to go" field="best_time" options={BEST_TIME} value={intel.best_time} onPick={(v) => setIntel((s) => ({ ...s, best_time: v }))} />
      <ChipRow label="Wait" field="wait" options={WAIT} value={intel.wait} onPick={(v) => setIntel((s) => ({ ...s, wait: v }))} />
      {status.phase === "error" ? <p role="alert" data-log-visit-error={status.code || "error"} style={{ color: "#FCA5A5", fontSize: 13.5, margin: "10px 0 0" }}>{status.msg}</p> : null}
      {busy ? <p role="status" aria-live="polite" style={{ color: C.muted, fontSize: 13, margin: "10px 0 0" }}>{status.msg}</p> : null}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button type="submit" disabled={busy} style={{ flex: 1, minHeight: 48, borderRadius: 12, border: "none", background: C.gold, color: "#0D1117", fontSize: 15, fontWeight: 800, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1, fontFamily: "inherit" }}>{busy ? "Saving" : "Save visit"}</button>
        <button type="button" disabled={busy} onClick={() => { setOpen(false); setStatus({ phase: "idle", msg: "", result: null }); }} style={{ minHeight: 48, padding: "0 16px", borderRadius: 12, border: `1px solid ${C.border}`, background: "transparent", color: C.light, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
      </div>
    </form>
  );
}
