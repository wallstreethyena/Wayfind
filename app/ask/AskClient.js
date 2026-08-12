"use client";
import { useState, useMemo, useEffect } from "react";
import { Cat, Heart, Portrait, Couple } from "./pixel.js";
import { ASK_CSS } from "./style.js";
import {
  ACTIVITIES, activityFor, activityHref, activityLinkLabel, askHeadline, yayLine,
  pleaAt, moodAt, yesScale, noScale, yesText,
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

function Decor() {
  // Deterministic positions: a random scatter re-rolls on every re-render and
  // the sparkles visibly jump every time the person taps No.
  const sparkles = [[8, 14], [22, 62], [78, 20], [90, 54], [40, 8], [62, 78], [14, 84], [86, 88]];
  const hearts = [[12, 5.2], [30, 7.8], [58, 6.4], [76, 9.1], [46, 11.5]];
  return (
    <>
      <div className="wfx-clouds" aria-hidden="true">
        <div className="wfx-cloud wfx-c1" style={{ left: "-14%", bottom: "-16%", width: "62%", height: "58%" }} />
        <div className="wfx-cloud wfx-c1" style={{ left: "42%", bottom: "-20%", width: "72%", height: "62%" }} />
        <div className="wfx-cloud wfx-c2" style={{ left: "8%", bottom: "-24%", width: "56%", height: "50%" }} />
        <div className="wfx-cloud wfx-c2" style={{ left: "58%", bottom: "-26%", width: "58%", height: "46%" }} />
        <div className="wfx-cloud wfx-c3" style={{ left: "26%", bottom: "-30%", width: "60%", height: "40%" }} />
      </div>
      {sparkles.map(([l, t], i) => (
        <div key={"s" + i} className="wfx-sparkle" aria-hidden="true"
          style={{ left: l + "%", top: t + "%", animationDelay: (i * 0.34) + "s" }} />
      ))}
      {hearts.map(([l, d], i) => (
        <div key={"h" + i} className="wfx-heart" aria-hidden="true"
          style={{ left: l + "%", bottom: "12%", animationDelay: d + "s" }}>
          <Heart size={20} fill="#F784C6" />
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
  const [told, setTold] = useState(false);

  // A share that lands here with no payload still works: it becomes a plain ask
  // rather than an error page. Someone forwarding the link to a third person is
  // a feature, not a bug to catch.
  const from = (inv && inv.from) || "";
  const city = (inv && inv.city) || "";

  useEffect(() => {
    if (step === "yay") { const t = setTimeout(() => setStep("activity"), 2600); return () => clearTimeout(t); }
  }, [step]);

  const tellThem = () => {
    const text = yesText(inv, activity, dayLabel);
    setTold(true);
    try {
      if (typeof navigator !== "undefined" && navigator.share) { navigator.share({ text }).catch(() => {}); return; }
      if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
    } catch (e) {}
  };

  return (
    <div className="wfx">
      <style dangerouslySetInnerHTML={{ __html: ASK_CSS }} />
      <Decor />
      <div className="wfx-stage">

        {step === "ask" && (
          <>
            <Portrait><Cat tone="cream" mood={moodAt(nos)} size={100} key={nos} /></Portrait>
            <h1 className="wfx-h1" key={step}>{askHeadline()}</h1>
            {from ? <p className="wfx-sub">from {from}</p> : null}
            <div className="wfx-row">
              <button className="wfx-yes" style={{ "--s": yesScale(nos) }}
                onClick={() => setStep("yay")}>YES</button>
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
            <Portrait><Cat tone="grey" mood="love" size={100} /></Portrait>
            <h1 className="wfx-h1" key={step}>What would you like to do?</h1>
            <div className="wfx-grid">
              {ACTIVITIES.map((a) => (
                <button key={a.id} className="wfx-chip" aria-pressed={activity === a.id}
                  onClick={() => setActivity(a.id)}>{a.label}</button>
              ))}
            </div>
            <button className="wfx-go" disabled={!activity} onClick={() => setStep("when")}>LOCK IT IN</button>
          </>
        )}

        {step === "when" && (
          <>
            <Portrait><Cat tone="peach" mood="happy" size={100} /></Portrait>
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
              {inv && inv.place ? <div><b>{from ? from + "'s idea" : "Their idea"}</b> · {inv.place}</div> : null}
              {from ? <div><b>With</b> · {from}</div> : null}
            </div>
            <button className="wfx-go" onClick={tellThem}>{told ? "SENT ♥" : "TELL " + (from ? from.toUpperCase() : "THEM")}</button>
            {/* Only here, after the yes and the plan, does Wayfind say anything.
                Two people who have just agreed on a night are the best possible
                audience for a ranking — and the worst possible audience for one
                thirty seconds ago. */}
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
