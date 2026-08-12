"use client";
import { useState, useMemo, useEffect } from "react";
import { Cat, Heart, Portrait, Couple } from "./pixel.js";
import { ASK_CSS } from "./style.js";
import {
  ACTIVITIES, activityFor, activityHref, activityLinkLabel, askHeadline, yayLine,
  pleaAt, moodAt, yesScale, noScale, yesText, needsName, planFitsPlace, datedCardPath,
  inviteKinds,
} from "../../lib/dateInvite.js";

// app/ask/AskClient.js — the five frames (v7.27).
//
//   1 ASK      "Will you go out with me?"  YES / No
//   2 YAY      the celebration
//   3 ACTIVITY what would you like to do
//   4 WHEN     pick a date
//   5 DONE     it's a date — and only NOW does Wayfind appear
//
// THE ORDER IS THE PRODUCT. Every instinct says put the place, the ranking and
// the booking link on the first screen, because that is what we sell. It would
// kill this. Someone opening a text from a person they like is answering one
// question, and an app that interrupts to recommend a restaurant before they
// have answered is a stranger talking over a private moment. Two people who
// have just agreed on a night and a kind of evening are the highest-intent pair
// on the site — so the ranking waits for frame 5, where it is help rather than
// an ad.
//
// The no-count only ever grows the YES button; it never disables No. The joke
// is that saying no gets harder, not that it becomes impossible — the moment
// the answer stops being really theirs, the yes is worth nothing.

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

// The world: a dithered magenta sky, three banks of stepped pixel cloud, a
// skyline on the horizon, sparkles and floating hearts. Not one image — the
// owner's note was "no AI generated image, it looks fake", and a scene built
// from boxes is also what lets this page paint instantly in a text thread.
//
// Every position is FIXED, not random. A random scatter re-rolls on each render,
// so the sparkles visibly jumped every time the person pressed No.
const CLOUDS = [
  // [class, left%, bottom%, width%, height, rows of the stepped silhouette]
  ["wfx-sky3", -6, 46, 46, 3], ["wfx-sky3", 44, 52, 52, 3],
  ["wfx-sky2", 8, 26, 44, 4], ["wfx-sky2", 56, 30, 50, 4],
  ["wfx-sky1", -10, 8, 52, 5], ["wfx-sky1", 40, 4, 62, 5],
];
function Cloud({ cls, left, bottom, width, rows }) {
  // A stepped mound: each row is narrower and higher than the one below it.
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

export default function AskClient({ inv }) {
  const [step, setStep] = useState("ask");
  const [nos, setNos] = useState(0);
  const [activity, setActivity] = useState("");
  const [dayIso, setDayIso] = useState("");
  const [dayLabel, setDayLabel] = useState("");
  // "" | "sent" | "copied" | "failed" — what really happened.
  const [sent, setSent] = useState("");

  // WHERE THEY ARE LOOKING, AND HOW LONG THEY HAVE BEEN THINKING.
  //
  // OWNER, 2026-08-12: "the menu part is very jumpy, it's jumping all over the
  // place… I asked you to have the little character look, but then I realized
  // it's a phone. There's no way the character can look at where the finger is
  // hovering from. Maybe that's something it's looking for and it just can't."
  //
  // That diagnosis was right, and the cost was worse than a missing effect.
  // touchstart and touchmove were wired to the same handler as mousemove, so:
  //   · every tap LURCHED the cat toward wherever the thumb landed, and the eye
  //     highlights popped into existence on first touch and never before it;
  //   · every scroll of this container re-rendered the entire page at 60Hz —
  //     nineteen animated decoration nodes and ~150 run-length-encoded SVG
  //     rects rebuilt per frame, on a phone.
  //
  // A pointer is a desktop object. There is nothing to track here, so we do not
  // pretend: no listeners at all on a coarse pointer, and the fidget carries the
  // performance on its own.
  const [look, setLook] = useState({ x: 0, y: 0 });

  // THREE RUNGS, NOT A FLOAT — and this is the other half of the jumping.
  // This used to tick every 900ms and feed the result into animation-duration
  // through a custom property. Changing a RUNNING animation's duration makes the
  // engine restart it, so the cat snapped roughly thirteen times per screen, and
  // every one of those ticks also re-rendered the whole page. Three rungs means
  // at most two changes, at the moments the speed genuinely changes.
  const [eager, setEager] = useState(0);
  useEffect(() => {
    // Anxiety builds while they deliberate, and RESETS when they move on — a cat
    // that stays frantic after the decision is just a broken animation.
    if (step !== "activity" && step !== "when") { setEager(0); return; }
    setEager(1);
    const a = setTimeout(() => setEager(2), 4200);
    const b = setTimeout(() => setEager(3), 9000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [step]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fine = !!(window.matchMedia && window.matchMedia("(pointer: fine)").matches);
    if (!fine) return; // a phone: nothing to follow, and no listeners to pay for
    let raf = 0, next = null;
    const apply = () => { raf = 0; if (next) setLook(next); };
    const onMove = (e) => {
      const w = window.innerWidth || 1, h = window.innerHeight || 1;
      // Relative to the middle of the screen, which is roughly where the cat is.
      next = { x: (e.clientX / w) * 2 - 1, y: (e.clientY / h) * 2 - 1 };
      // One state update per frame. Setting state on every mousemove re-renders
      // the whole pixel scene dozens of times a second and the page starts to
      // stutter — on the screen where we are asking someone to feel something.
      if (!raf) raf = window.requestAnimationFrame(apply);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  // WHO IS ANSWERING. The sender may have asked several people, and a reply
  // reading 'Yes! Dinner out on Friday' tells them a date is happening without
  // telling them with whom. If the sender named them at share time we already
  // know; if not, the last screen asks — optionally, because a required field
  // between a yes and telling them is a place to lose the yes.
  const [who, setWho] = useState("");
  const [note, setNote] = useState("");

  // MOVED BELOW THE STATE IT READS. This block sat above `who` and `note`, and
  // a dependency array is evaluated DURING render — so it touched two consts
  // in their temporal dead zone and threw a ReferenceError that took the whole
  // page down the instant anyone pressed YES. Guards cannot see this; opening
  // the page did.
  // COMING BACK. The worst thing this page can do is lose a yes: they say yes,
  // get distracted halfway through picking a night, come back, and are asked to
  // go out with someone all over again from a blank screen. The progress is kept
  // on THEIR device against this invite's key — nothing leaves the phone, and a
  // different invite is a different key, so two invites never collide.
  const memKey = inv && inv.key ? "wf_ask_" + inv.key : "";
  useEffect(() => {
    if (!memKey) return;
    try {
      const raw = window.localStorage.getItem(memKey);
      if (!raw) return;
      const m = JSON.parse(raw);
      if (!m || typeof m !== "object") return;
      // Never restore straight back into the celebration — it is a 2.6s frame
      // that auto-advances, and landing on it cold is confusing.
      if (m.step && m.step !== "ask" && m.step !== "yay") setStep(m.step);
      if (m.activity) setActivity(m.activity);
      if (m.dayIso) setDayIso(m.dayIso);
      if (m.dayLabel) setDayLabel(m.dayLabel);
      if (m.who) setWho(m.who);
      if (m.note) setNote(m.note);
    } catch (e) {}
  }, [memKey]);
  useEffect(() => {
    if (!memKey || step === "ask") return;
    try { window.localStorage.setItem(memKey, JSON.stringify({ step, activity, dayIso, dayLabel, who, note })); } catch (e) {}
  }, [memKey, step, activity, dayIso, dayLabel, who, note]);

  // A share that lands here with no payload still works: it becomes a plain ask
  // rather than an error page. Someone forwarding the link to a third person is
  // a feature, not a bug to catch.
  const from = (inv && inv.from) || "";
  const city = (inv && inv.city) || "";

  useEffect(() => {
    if (step === "yay") { const t = setTimeout(() => setStep("activity"), 2600); return () => clearTimeout(t); }
  }, [step]);

  // OWNER: "when the user clicks sent it needs to show that it hit sent."
  //
  // It did not. The first version flipped to SENT the instant the button was
  // pressed — before the share sheet had even appeared, and it stayed SENT if
  // they cancelled it. That is the worst possible lie to tell on this screen:
  // the person believes their yes has gone and it has not, and they will not
  // check, because the button said so.
  //
  // So the state is only set by what ACTUALLY happened. navigator.share()
  // resolves when the message went, rejects with AbortError when they backed
  // out, and rejects otherwise when it failed — three different truths, told
  // three different ways.
  // Fired from the button's real position so the hearts come out of the thing
  // they pressed, not out of the middle of the screen.
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
        h.innerHTML = '<svg width="' + (12 + (i % 3) * 6) + '" height="' + (12 + (i % 3) * 6) + '" viewBox="0 0 10 6" shape-rendering="crispEdges">'
          + '<rect x="2" y="0" width="2" height="1" fill="#FF4E96"/><rect x="6" y="0" width="2" height="1" fill="#FF4E96"/>'
          + '<rect x="1" y="1" width="8" height="2" fill="#FF4E96"/><rect x="2" y="3" width="6" height="1" fill="#FF4E96"/>'
          + '<rect x="3" y="4" width="4" height="1" fill="#FF4E96"/><rect x="4" y="5" width="2" height="1" fill="#FF4E96"/></svg>';
        host.appendChild(h);
      }
      document.body.appendChild(host);
      setTimeout(() => { try { host.remove(); } catch (er) {} }, 1100);
    } catch (er) {}
  };

  const replyText = () => yesText(inv, activity, dayLabel, { name: who, note });

  const copyIt = (text) => {
    try {
      navigator.clipboard.writeText(text).then(() => setSent("copied"), () => setSent("failed"));
    } catch (e) { setSent("failed"); }
  };

  // Their suggestion first, everything else in its usual order.
  // Resolved the same way the fit check resolves it — from the payload when it
  // has one, from the place name when it does not. Reading inv.kind directly
  // marked the wrong chip on every link made before kinds existed.
  const suggested = inviteKinds(inv);
  const ordered = (() => {
    const k = suggested[0];
    if (!k) return ACTIVITIES;
    const hit = ACTIVITIES.filter((a) => a.id === k);
    return hit.length ? hit.concat(ACTIVITIES.filter((a) => a.id !== k)) : ACTIVITIES;
  })();

  // SAVE THE CARD. Web Share Level 2 hands the PNG itself to the share sheet,
  // which is what puts it on a story rather than in a chat as a link. If files
  // are unsupported we open the image instead — a long-press saves it, which is
  // how most people save an image anyway.
  const [saving, setSaving] = useState(false);
  const cardUrl = () => datedCardPath(activity, dayLabel,
    inv && inv.place && planFitsPlace(inv, activity) ? inv.place : "");

  const saveCard = async () => {
    if (saving) return;
    const url = cardUrl();
    // The fetch has to happen BEFORE the share, and that costs the tap's
    // activation on iOS — so the fallback is a plain open, never a silent fail.
    setSaving(true);
    try {
      const r = await fetch(url);
      const blob = await r.blob();
      const file = new File([blob], "its-a-date.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        setSaving(false);
        return;
      }
    } catch (e) {}
    setSaving(false);
    try { window.open(url, "_blank", "noopener"); } catch (e) {}
  };

  const tellThem = () => {
    const text = replyText();
    setSent("");
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        const pr = navigator.share({ text });
        if (pr && pr.then) {
          pr.then(() => setSent("sent"), (e) => {
            // Backing out of the sheet is not a failure and must not be dressed
            // up as one — they are still on the screen and can press it again.
            if (e && e.name === "AbortError") return;
            copyIt(text);
          });
        } else { setSent("sent"); }
        return;
      }
    } catch (e) {}
    copyIt(text);
  };

  // NO sms: ESCAPE HATCH. A previous pass added an "Open Messages instead"
  // button, and the owner killed it on sight — correctly. This page spends five
  // frames building something, and a raw sms: link throws the person out of it
  // into a grey compose window mid-moment. The native share sheet already lists
  // Messages, it appears OVER this page instead of replacing it, and it also
  // covers the half of the world that answers in WhatsApp or Instagram. One
  // button, one path.

  return (
    <div className="wfx">
      <style dangerouslySetInnerHTML={{ __html: ASK_CSS }} />
      <Decor />
      <div className="wfx-stage">

        {step === "ask" && (
          <>
            <Portrait><Cat tone="cream" mood={moodAt(nos)} size={104} key={nos} look={look} /></Portrait>
            <h1 className="wfx-h1" key={step}>{askHeadline(inv)}</h1>
            {from ? <p className="wfx-sub">from {from}</p> : null}
            <div className="wfx-row">
              <button className="wfx-yes" style={{ "--s": yesScale(nos) }}
                onClick={(e) => { burst(e); setStep("yay"); }}>YES</button>
              <button className="wfx-no" style={{ "--n": noScale(nos) }}
                onClick={() => setNos((n) => n + 1)}>No</button>
            </div>
            <p className="wfx-plea" key={nos}>{nos > 0 ? pleaAt(nos) : ""}</p>
          </>
        )}

        {step === "yay" && (
          <>
            <Portrait size={138}><Couple size={64} /></Portrait>
            <h1 className="wfx-h1" key={step}>· YAY! ·</h1>
            <p className="wfx-sub">{yayLine(inv)}</p>
          </>
        )}

        {step === "activity" && (
          <>
            <Portrait><Cat tone="cream" mood="love" size={104} look={look} fidget={eager} /></Portrait>
            <h1 className="wfx-h1" key={step}>What would you like to do?</h1>
            {/* The sender's own suggestion goes FIRST and is labelled. It is the
                only option on this screen that somebody actually chose, and
                burying it in reading order made the two halves of the plan feel
                unrelated — which is how "Drinks tonight" ended up paired with a
                breakfast cafe. */}
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
            {/* The sender's place goes back on the card, labelled as an IDEA
                rather than a decision. Frame 3 lets the recipient choose the
                kind of evening, and the first build then dropped the place the
                sender had actually picked — so the person who sent the invite
                watched their own suggestion vanish from their own date. */}
            <div className="wfx-card">
              <div><b>When</b> · {dayLabel}</div>
              <div><b>What</b> · {(activityFor(activity) || {}).label}</div>
              {/* ONLY WHEN IT STILL FITS. This printed the sender's place
                  unconditionally, so a plan reading "Drinks tonight" would sit
                  directly above "Their idea · Keke's Breakfast Cafe" — two
                  people arriving at a closed cafe at 9pm holding our screenshot.
                  When the plan has moved on, the card says so and points at the
                  ranking instead of at a contradiction. */}
              {inv && inv.place && planFitsPlace(inv, activity)
                ? <div><b>{from ? from + "'s idea" : "Their idea"}</b> · {inv.place}</div>
                : (inv && inv.place
                    ? <div><b>New plan</b> · not {inv.place} then — pick the spot below</div>
                    : null)}
              {from ? <div><b>With</b> · {from}</div> : null}
              {(who || (inv && inv.to)) ? <div><b>From</b> · {who || inv.to}</div> : null}
            </div>
            {/* Their half of the conversation. Both optional, both one line —
                the point is that the answer arrives sounding like a person and
                the sender can tell which person it is. */}
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
              {sent === "sent" ? "SENT ♥" : "TELL " + (from ? from.toUpperCase() : "THEM")}
            </button>
            {sent ? (
              <p className="wfx-sub" role="status" aria-live="polite">
                {sent === "sent" ? "Sent — they know." :
                 sent === "copied" ? "Copied. Paste it into your chat with " + (from || "them") + "." :
                 "Could not send it — copy the plan above and text it to " + (from || "them") + "."}
              </p>
            ) : null}
            {/* Only here, after the yes and the plan, does Wayfind say anything.
                Two people who have just agreed on a night are the best possible
                audience for a ranking — and the worst possible audience for one
                thirty seconds ago. */}
            <button className="wfx-go wfx-go2" onClick={saveCard} disabled={saving}>
              {saving ? "MAKING IT…" : "SAVE THE CARD"}
            </button>
            <a className="wfx-quiet" href={activityHref(activity, city)}>{activityLinkLabel(activity, city)}</a>
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
