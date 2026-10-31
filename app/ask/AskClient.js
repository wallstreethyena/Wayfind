"use client";
import { shareOut } from "../../lib/shareOut.js";
import { concreteSharePlaceId } from "../../lib/shareContext.js";
import { track } from "../../lib/track.js";
import { useState, useMemo, useEffect, useRef } from "react";
import { Cat, Heart, Portrait, Couple } from "./pixel.js";
import { ASK_CSS } from "./style.js";
import {
  ACTIVITIES, activityFor, activityHref, activityLinkLabel, askHeadline, yayLine,
  pleaAt, moodAt, yesScale, noScale, yesText, noText, needsName, planFitsPlace, datedCardPath,
  inviteKinds,
} from "../../lib/dateInvite.js";

// app/ask/AskClient.js — Wayfind Chibi Elf invitation flow.
//
//   1 ASK       "Will you go out with me?" + proposed plan summary + YES / No
//   2 YAY       warm celebration with the Elf couple
//   3 ACTIVITY  what would you like to do
//   4 WHEN      pick or confirm a date
//   5 DONE      proposed plan summary, share your answer, save card, open venue
//   6 DECLINED  kind acknowledgment when the visitor answers No

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

/**
 * Parse an explicit date-only string ("YYYY-MM-DD") in local calendar time
 * so UTC midnight never shifts the calendar day backward, and preserve human
 * date labels ("Friday", "Sat, Oct 31") verbatim without replacing past dates.
 */
export function parseInviteWhen(raw) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return { iso: "", label: "", date: null };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const da = Number(m[3]);
    const d = new Date(y, mo, da);
    if (!isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === mo && d.getDate() === da) {
      const nowYear = new Date().getFullYear();
      const opts = { weekday: "short", month: "long", day: "numeric" };
      if (y !== nowYear) opts.year = "numeric";
      return { iso: s, label: d.toLocaleDateString(undefined, opts), date: d };
    }
  }
  return { iso: s, label: s, date: null };
}

const CLOUDS = [
  ["wfx-sky3", -6, 46, 46, 3], ["wfx-sky3", 44, 52, 52, 3],
  ["wfx-sky2", 8, 26, 44, 4], ["wfx-sky2", 56, 30, 50, 4],
  ["wfx-sky1", -10, 8, 52, 5], ["wfx-sky1", 40, 4, 62, 5],
];
function Cloud({ cls, left, bottom, width, rows }) {
  const bars = [];
  for (let i = 0; i < rows; i++) {
    const inset = i * 12;
    bars.push(
      <i key={i} style={{ left: inset + "%", right: inset + "%", bottom: (i * 9) + "px", height: "10px" }} />
    );
  }
  return (
    <div className={"wfx-cloud " + cls}
      style={{ left: left + "%", bottom: bottom + "%", width: width + "%", height: (rows * 9 + 10) + "px" }}>
      {bars}
    </div>
  );
}

function Decor() {
  const sparkles = [[7, 16], [24, 58], [80, 22], [91, 50], [42, 9], [64, 74], [13, 80], [88, 86]];
  const hearts = [[14, 5.2], [32, 7.8], [60, 6.4], [78, 9.1], [47, 11.5]];
  return (
    <>
      <div className="wfx-dither" aria-hidden="true" />
      <div className="wfx-scene" aria-hidden="true">
        {CLOUDS.map((c, i) => <Cloud key={i} cls={c[0]} left={c[1]} bottom={c[2]} width={c[3]} rows={c[4]} />)}
        <div className="wfx-skyline" />
        <div className="wfx-ground" />
      </div>
      {sparkles.map(([l, t], i) => (
        <div key={"s" + i} className="wfx-sparkle" aria-hidden="true"
          style={{ left: l + "%", top: t + "%", animationDelay: (i * 0.21) + "s" }} />
      ))}
      {hearts.map(([l, d], i) => (
        <div key={"h" + i} className="wfx-heart" aria-hidden="true"
          style={{ left: l + "%", bottom: "16%", animationDelay: d + "s" }}>
          <Heart size={18} tone="cream" />
        </div>
      ))}
    </>
  );
}

function Calendar({ value, onPick }) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [offset, setOffset] = useState(0);
  const view = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const first = view.getDay();
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d));
  const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

  return (
    <div className="wfx-cal">
      <div className="wfx-calhead">
        <button className="wfx-calnav" onClick={() => setOffset((o) => Math.max(0, o - 1))}
          disabled={offset === 0} aria-label="Previous month">{"<"}</button>
        <span>{MONTHS[view.getMonth()]} {view.getFullYear()}</span>
        <button className="wfx-calnav" onClick={() => setOffset((o) => Math.min(2, o + 1))}
          disabled={offset === 2} aria-label="Next month">{">"}</button>
      </div>
      <div className="wfx-caldays" aria-hidden="true">{DAYS.map((d, i) => <div key={i}>{d}</div>)}</div>
      <div className="wfx-calgrid">
        {cells.map((d, i) => d === null
          ? <div key={"e" + i} />
          : (
            <button key={iso(d)} className="wfx-day" disabled={d < today}
              aria-pressed={value === iso(d)} onClick={() => onPick(iso(d), d)}>
              {d.getDate()}
            </button>
          ))}
      </div>
    </div>
  );
}

export default function AskClient({ inv, bad = false }) {
  const proposedWhen = useMemo(() => parseInviteWhen(inv && inv.when), [inv && inv.when]);
  const suggested = useMemo(() => inviteKinds(inv), [inv]);

  const [step, setStep] = useState("ask");
  const [nos, setNos] = useState(0);
  const [activity, setActivity] = useState(() => suggested[0] || "");
  const [dayIso, setDayIso] = useState(() => proposedWhen.iso);
  const [dayLabel, setDayLabel] = useState(() => proposedWhen.label);
  // "" | "options" | "copied" | "failed"
  const [sent, setSent] = useState("");
  const [paused, setPaused] = useState(false);

  const [look, setLook] = useState({ x: 0, y: 0 });
  const [eager, setEager] = useState(0);

  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    track("ask_invite_loaded", { has_invite: Boolean(inv), bad_link: Boolean(bad) });
  }, [inv, bad]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => setPaused(Boolean(document.hidden));
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (step !== "activity" && step !== "when") { setEager(0); return; }
    setEager(1);
    const a = setTimeout(() => setEager(2), 4200);
    const b = setTimeout(() => setEager(3), 9000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [step]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fine = !!(window.matchMedia && window.matchMedia("(pointer: fine)").matches);
    if (!fine) return;
    let raf = 0, next = null;
    const apply = () => { raf = 0; if (next) setLook(next); };
    const onMove = (e) => {
      const w = window.innerWidth || 1, h = window.innerHeight || 1;
      next = { x: (e.clientX / w) * 2 - 1, y: (e.clientY / h) * 2 - 1 };
      if (!raf) raf = window.requestAnimationFrame(apply);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  const [who, setWho] = useState("");
  const [note, setNote] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setHydrated(true); }, []);

  const memKey = inv && inv.key ? "wf_ask_" + inv.key : "";
  useEffect(() => {
    setStep("ask");
    setNos(0);
    setSent("");
    setActivity(suggested[0] || "");
    setDayIso(proposedWhen.iso);
    setDayLabel(proposedWhen.label);
    setWho("");
    setNote("");
    if (!memKey) return;
    try {
      const raw = window.localStorage.getItem(memKey);
      if (!raw) return;
      const m = JSON.parse(raw);
      if (!m || typeof m !== "object") return;
      if (m.step && m.step !== "ask" && m.step !== "yay" && m.step !== "declined") setStep(m.step);
      if (m.activity) setActivity(m.activity);
      if (m.dayIso) setDayIso(m.dayIso);
      if (m.dayLabel) setDayLabel(m.dayLabel);
      if (m.who) setWho(m.who);
      if (m.note) setNote(m.note);
    } catch (e) {}
  }, [memKey]);

  useEffect(() => {
    if (!memKey || step === "ask" || step === "declined") return;
    try { window.localStorage.setItem(memKey, JSON.stringify({ step, activity, dayIso, dayLabel, who, note })); } catch (e) {}
  }, [memKey, step, activity, dayIso, dayLabel, who, note]);

  const from = (inv && inv.from) || "";
  const city = (inv && inv.city) || "";
  const placeId = concreteSharePlaceId(inv && inv.id);

  useEffect(() => {
    if (step === "yay") { const t = setTimeout(() => setStep("activity"), 2600); return () => clearTimeout(t); }
  }, [step]);

  const burst = (e) => {
    if (typeof document === "undefined") return;
    try {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const r = e.currentTarget.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const host = document.createElement("div");
      host.className = "wfx-burst";
      host.style.transform = "translate(" + x + "px," + y + "px)";
      for (let i = 0; i < 14; i++) {
        const a = (Math.PI * 2 * i) / 14 + (i % 2 ? 0.22 : 0);
        const d = 90 + (i % 4) * 34;
        const h = document.createElement("i");
        h.style.setProperty("--dx", Math.round(Math.cos(a) * d) + "px");
        h.style.setProperty("--dy", Math.round(Math.sin(a) * d - 40) + "px");
        h.style.setProperty("--rot", (i % 2 ? 1 : -1) * (20 + i * 7) + "deg");
        h.style.animationDelay = (i % 5) * 22 + "ms";
        const sz = 16 + (i % 3) * 6;
        h.innerHTML = (i % 3 === 0)
          ? '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24">'
            + '<path d="M12 2 L14.8 9.2 L22 12 L14.8 14.8 L12 22 L9.2 14.8 L2 12 L9.2 9.2 Z" fill="' + (i % 2 ? "#FFD166" : "#00F5D4") + '"/></svg>'
          : '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 48 40">'
            + '<path d="M 24 36 C 10 26 3 17 3 9.5 C 3 4 7.5 0 13 0 C 17.5 0 21.5 2.8 24 6.8 C 26.5 2.8 30.5 0 35 0 C 40.5 0 45 4 45 9.5 C 45 17 38 26 24 36 Z" fill="#FF2A85" stroke="#23143B" stroke-width="3.5" stroke-linejoin="round"/>'
            + '<ellipse cx="14" cy="8.5" rx="4.5" ry="2.5" transform="rotate(-25 14 8.5)" fill="#FFFFFF" opacity="0.88"/></svg>';
        host.appendChild(h);
      }
      document.body.appendChild(host);
      setTimeout(() => { try { host.remove(); } catch (er) {} }, 1100);
    } catch (er) {}
  };

  const replyText = () => yesText(inv, activity, dayLabel, { name: who, note });
  const declineReplyText = () => noText(inv, { name: who, note });

  const ordered = (() => {
    const k = suggested[0];
    if (!k) return ACTIVITIES;
    const hit = ACTIVITIES.filter((a) => a.id === k);
    return hit.length ? hit.concat(ACTIVITIES.filter((a) => a.id !== k)) : ACTIVITIES;
  })();

  const [saving, setSaving] = useState(false);
  const cardUrl = () => datedCardPath(activity, dayLabel,
    inv && inv.place && planFitsPlace(inv, activity) ? inv.place : "");

  const saveCard = async () => {
    if (saving) return;
    track("ask_invite_action", { action: "save_card" });
    const url = cardUrl();
    setSaving(true);
    let file = null;
    try {
      const r = await fetch(url);
      const blob = await r.blob();
      file = new File([blob], "its-a-date.png", { type: "image/png" });
    } catch (e) {}
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
      } catch (e) {
        if (!(e && e.name === "AbortError")) { setSaving(false); try { window.open(url, "_blank", "noopener"); } catch (er) {} return; }
      }
      setSaving(false);
      return;
    }
    setSaving(false);
    try { window.open(url, "_blank", "noopener"); } catch (e) {}
  };

  const sendReplyText = (text) => {
    track("ask_invite_action", { action: "share_reply" });
    const how = shareOut({ title: "Your reply", text }, () => setSent("copied"), { textOnly: true });
    setSent(how === "failed" ? "failed" : "options");
  };

  const tellThem = () => sendReplyText(replyText());
  const tellThemDeclined = () => sendReplyText(declineReplyText());

  const suggestedActivityLabel = suggested[0] && activityFor(suggested[0]) ? activityFor(suggested[0]).label : "";
  const BUBBLES = [
    "Wait—your finger slipped, right?! 👀",
    "Deploying emergency puppy eyes 🥺",
    "EMOTIONAL DAMAGE: 999% 😭",
    "Even my hat bell stopped jingling 💔",
    "Plot twist: “No” is purely decorative ✨",
  ];

  return (
    <div className={"wfx" + (paused ? " wfx-paused" : "")} data-hydrated={hydrated ? "1" : undefined}>
      <style dangerouslySetInnerHTML={{ __html: ASK_CSS }} />
      <Decor />
      <div className="wfx-stage">

        {bad && !inv ? (
          <div className="wfx-alert" role="alert">
            This invitation link looks incomplete or damaged, so the venue details could not be read. You can still respond below or explore Wayfind.
          </div>
        ) : null}

        {step === "ask" && (
          <>
            {nos > 0 ? (
              <div className="wfx-bubble" key={"b" + nos} role="status" aria-live="polite">
                {BUBBLES[Math.min(nos - 1, BUBBLES.length - 1)]}
              </div>
            ) : null}
            <Portrait><Cat tone="cream" mood={moodAt(nos)} size={104} key={nos} look={look} /></Portrait>
            <h1 className="wfx-h1" key={step}>{askHeadline(inv)}</h1>
            {from ? <p className="wfx-sub">from {from}</p> : null}
            {inv && (inv.place || suggestedActivityLabel || proposedWhen.label || inv.note) ? (
              <div className="wfx-plan-preview" aria-label="Proposed plan">
                {inv.place ? (
                  <div>
                    <strong>{from ? from + "’s idea" : "Proposed spot"}</strong>
                    {" · "}
                    <span>{inv.place}{city ? " (" + city + ")" : ""}</span>
                  </div>
                ) : null}
                {(suggestedActivityLabel || proposedWhen.label) ? (
                  <div>
                    <strong>Plan</strong>
                    {" · "}
                    <span>{[suggestedActivityLabel, proposedWhen.label].filter(Boolean).join(" · ")}</span>
                  </div>
                ) : null}
                {inv.note ? <div className="wfx-plan-note">“{inv.note}”</div> : null}
              </div>
            ) : null}
            <div className="wfx-row">
              <button className="wfx-yes" style={{ "--s": yesScale(nos) }}
                onClick={(e) => {
                  burst(e);
                  setSent("");
                  track("ask_invite_choice", { choice: "yes", has_place: Boolean(inv && inv.place) });
                  setStep("yay");
                }}>YES</button>
              <button className="wfx-no" style={{ "--n": noScale(nos) }}
                onClick={() => {
                  setNos((n) => n + 1);
                  track("ask_invite_choice", { choice: "no", has_place: Boolean(inv && inv.place) });
                }}>No</button>
            </div>
            {nos > 0 ? <p className="wfx-plea" key={nos}>{pleaAt(nos)}</p> : null}
          </>
        )}

        {step === "declined" && (
          <>
            <Portrait><Cat tone="cream" mood={moodAt(nos || 1)} size={104} look={look} /></Portrait>
            <h1 className="wfx-h1" key={step}>No worries. Thanks for letting me know.</h1>
            <p className="wfx-sub">
              {from
                ? "You can share a quick reply with " + from + " below, or head out whenever you’re ready."
                : "You can share a quick reply below, or head out whenever you’re ready."}
            </p>
            {needsName(inv) ? (
              <input className="wfx-field" value={who} maxLength={24} enterKeyHint="done"
                onChange={(e) => setWho(e.target.value)}
                aria-label="Your name (optional)"
                placeholder="Your name (optional)" />
            ) : null}
            <input className="wfx-field" value={note} maxLength={120} enterKeyHint="done"
              onChange={(e) => setNote(e.target.value)}
              aria-label="Add a message, optional"
              placeholder="Say something back (optional)" />
            <button className="wfx-go" onClick={tellThemDeclined}>
              {sent === "copied" ? "LINK COPIED ✓" : "SHARE YOUR ANSWER"}
            </button>
            {sent ? (
              <p className="wfx-sub" role="status" aria-live="polite">
                {sent === "options" ? "Share your answer — choose your message app and press Send there." :
                 sent === "copied" ? "Link copied. Paste your reply into your chat with " + (from || "them") + "." :
                 "Could not open share options — copy your reply above and text it to " + (from || "them") + "."}
              </p>
            ) : null}
            <button className="wfx-go wfx-go2" onClick={() => { setSent(""); setNos(0); setStep("yay"); }}>
              Changed my mind — say YES
            </button>
            <a className="wfx-quiet" href={city ? "/best-of?city=" + encodeURIComponent(city) : "/"}>
              Explore Wayfind
            </a>
          </>
        )}

        {step === "yay" && (
          <>
            <Portrait size={138}><Couple size={64} /></Portrait>
            <h1 className="wfx-h1" key={step}>· YAY! ·</h1>
            <p className="wfx-sub">{yayLine(inv)}</p>
            <button className="wfx-quiet" onClick={() => setStep("activity")}>Continue →</button>
          </>
        )}

        {step === "activity" && (
          <>
            <Portrait><Cat tone="cream" mood="love" size={104} look={look} fidget={eager} /></Portrait>
            <h1 className="wfx-h1" key={step}>What would you like to do?</h1>
            <div className="wfx-grid">
              {ordered.map((a) => (
                <button key={a.id} className="wfx-chip" aria-pressed={activity === a.id}
                  onClick={() => setActivity(a.id)}>
                  {a.label}
                  {suggested.indexOf(a.id) === 0
                    ? <span className="wfx-tag">{from ? from + "’s idea" : "their idea"}</span>
                    : null}
                </button>
              ))}
            </div>
            <button className="wfx-go" disabled={!activity} onClick={() => setStep("when")}>LOCK IT IN</button>
          </>
        )}

        {step === "when" && (
          <>
            <Portrait><Cat tone="panda" mood="happy" size={104} look={look} fidget={eager} /></Portrait>
            <h1 className="wfx-h1" key={step}>Pick a date</h1>
            <p className="wfx-sub">Choose the day for our cute little plans</p>
            {proposedWhen.label ? (
              <button
                className="wfx-chip"
                style={{ width: "100%", marginTop: "14px", minHeight: "48px" }}
                aria-pressed={dayIso === proposedWhen.iso && dayLabel === proposedWhen.label}
                onClick={() => {
                  setDayIso(proposedWhen.iso);
                  setDayLabel(proposedWhen.label);
                }}>
                <span>{from ? from + "’s proposed date: " : "Proposed date: "}{proposedWhen.label}</span>
              </button>
            ) : null}
            <Calendar value={dayIso} onPick={(iso, d) => {
              setDayIso(iso);
              setDayLabel(d.toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric" }));
            }} />
            <button className="wfx-go" disabled={!dayIso} onClick={() => setStep("done")}>IT'S A DATE</button>
          </>
        )}

        {step === "done" && (
          <>
            <Portrait size={138}><Couple size={64} /></Portrait>
            <h1 className="wfx-h1" key={step}>It's a date</h1>
            <p className="wfx-sub">Proposed plan — no table or tickets are booked yet.</p>
            <div className="wfx-card">
              <div><b>When</b> · {dayLabel}</div>
              <div><b>What</b> · {(activityFor(activity) || {}).label}</div>
              {inv && inv.place && planFitsPlace(inv, activity)
                ? <div><b>{from ? from + "'s idea" : "Their idea"}</b> · {inv.place}{city ? " (" + city + ")" : ""}</div>
                : (inv && inv.place
                    ? <div><b>New plan</b> · not {inv.place} then — pick the spot below</div>
                    : null)}
              {inv && inv.note ? <div><b>Note</b> · “{inv.note}”</div> : null}
              {from ? <div><b>With</b> · {from}</div> : null}
              {(who || (inv && inv.to)) ? <div><b>From</b> · {who || inv.to}</div> : null}
            </div>
            {needsName(inv) ? (
              <input className="wfx-field" value={who} maxLength={24} enterKeyHint="done"
                onChange={(e) => setWho(e.target.value)}
                aria-label="Your name, so they know who said yes"
                placeholder="Your name" />
            ) : null}
            <input className="wfx-field" value={note} maxLength={120} enterKeyHint="done"
              onChange={(e) => setNote(e.target.value)}
              aria-label="Add a message, optional"
              placeholder="Say something back (optional)" />

            <button className="wfx-go" onClick={tellThem}>
              {sent === "copied"
                ? "LINK COPIED ✓"
                : sent === "options"
                  ? "SHARE YOUR ANSWER"
                  : ("TELL " + (from ? from.toUpperCase() : "THEM") + " · SHARE YOUR ANSWER")}
            </button>
            {sent ? (
              <p className="wfx-sub" role="status" aria-live="polite">
                {sent === "options" ? "Share your answer — choose your message app and press Send there." :
                 sent === "copied" ? "Link copied. Paste your reply into your chat with " + (from || "them") + "." :
                 "Could not open share options — copy the plan above and text it to " + (from || "them") + "."}
              </p>
            ) : null}
            <button className="wfx-go wfx-go2" onClick={saveCard} disabled={saving}>
              {saving ? "MAKING IT…" : "SAVE THE CARD"}
            </button>
            {placeId && inv && inv.place && planFitsPlace(inv, activity) ? (
              <a className="wfx-quiet" href={"/p/" + encodeURIComponent(placeId)}
                onClick={() => track("ask_invite_action", { action: "open_place" })}>
                {"Open " + inv.place + " on Wayfind"}
              </a>
            ) : null}
            <a className="wfx-quiet" href={activityHref(activity, city, inv && inv.geo)}
              onClick={() => track("ask_invite_action", { action: "explore_activity" })}>
              {activityLinkLabel(activity, city)}
            </a>
            <div className="wfx-mark">
              <span>arranged with</span>
              <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2.6c-4.1 0-7.4 3.3-7.4 7.4 0 5 6.4 10.7 6.9 11.1a.8.8 0 0 0 1 0c.5-.4 6.9-6.1 6.9-11.1 0-4.1-3.3-7.4-7.4-7.4Z"
                  fill="none" stroke="#9B6BA8" strokeWidth="2.1" />
                <circle cx="12" cy="9.8" r="2.6" fill="#9B6BA8" />
              </svg>
              <span>wayfind</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

