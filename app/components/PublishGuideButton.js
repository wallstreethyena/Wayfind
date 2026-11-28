"use client";
// "Publish as a guide" on an open trip (owner order 2026-11-27). Nothing goes
// public until the member reads what will be shared and ticks the box. After
// publishing they get the link, a one tap share, and an Unpublish button.
// Nothing is ever posted to anyone's social accounts: sharing is the member's
// own tap on their own share sheet.
import { useEffect, useState } from "react";
import { C } from "./kit";
import { listMyGuides, publishMyGuide, unpublishMyGuide, shareLink } from "../../lib/communityClient.js";
import { rewardMoment } from "../../lib/heartRewards.js";

const pill = { background: "transparent", border: "1px solid rgba(251,191,36,.55)", color: C.gold, fontSize: 13, fontWeight: 800, padding: "8px 14px", minHeight: 44, borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" };
const btn = (primary) => ({ minHeight: 46, padding: "0 16px", borderRadius: 12, border: primary ? "none" : `1px solid ${C.border}`, background: primary ? C.gold : "transparent", color: primary ? "#0D1117" : C.light, fontSize: 14.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" });

// triggerClassName/triggerIcon/triggerHint: the itinerary shows this as a row
// in its trip menu (owner, 2026-11-28) instead of a standalone gold pill.
export default function PublishGuideButton({ trip, user, requireAuth, logEvent, triggerClassName, triggerIcon, triggerHint }) {
  const key = trip && trip.key;
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState(null);
  const [consent, setConsent] = useState(false);
  const [showName, setShowName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: "", bad: false });

  useEffect(() => {
    let dead = false;
    if (!user || !key) { setMine(null); return undefined; }
    listMyGuides().then((r) => { if (!dead && r && r.ok) setMine((r.guides || []).find((g) => g.localKey === key) || null); });
    return () => { dead = true; };
  }, [user, key]);

  if (!key) return null;
  const live = mine && mine.status === "published";
  const url = live && typeof window !== "undefined" ? window.location.origin + "/community/" + mine.slug : "";

  const start = () => {
    if (!user) { if (requireAuth) requireAuth("Sign up free to publish your trip as a community guide."); return; }
    setOpen(true); setMsg({ text: "", bad: false });
    try { logEvent && logEvent("community_guide_open", null, { key }); } catch {}
  };
  const publish = async (confirmed = consent) => {
    if (!confirmed || busy) return;
    setBusy(true); setMsg({ text: "", bad: false });
    const r = await publishMyGuide(key, live ? Boolean(mine && mine.showAuthor) : showName);
    setBusy(false);
    if (r && r.ok) {
      setMine({ slug: r.slug, localKey: key, status: r.status, showAuthor: showName });
      setMsg({ text: r.status === "published" ? (r.pointsAwarded ? `Your guide is live. +${r.pointsAwarded} points` : "Your guide is live.") : "Your guide is waiting for a quick review.", bad: false });
      try { logEvent && logEvent("community_guide_published", null, { key, cached: r.cached === true }); } catch {}
      if (r.status === "published" && r.cached !== true) rewardMoment("guide");
    } else setMsg({ text: (r && r.error) || "Please try again.", bad: true });
  };
  const unpublish = async () => {
    if (!mine || busy) return;
    setBusy(true);
    const r = await unpublishMyGuide(mine.slug);
    setBusy(false);
    if (r && r.ok) { setMine({ ...mine, status: "unpublished" }); setMsg({ text: "Your guide is no longer public.", bad: false }); }
    else setMsg({ text: (r && r.error) || "Please try again.", bad: true });
  };
  const share = () => {
    const res = shareLink({ url, title: trip.title || "My Wayfind trip", text: "My trip on Wayfind" }, () => setMsg({ text: "Link copied", bad: false }));
    try { logEvent && logEvent("community_guide_share", null, { how: res.how }); } catch {}
  };

  return (
    <>
      {triggerClassName ? (
        <button type="button" data-publish-guide={live ? "live" : "off"} onClick={live ? () => setOpen(true) : start} className={triggerClassName}>
          {triggerIcon ? <span className="wf-itin-sheet-ico" aria-hidden="true">{triggerIcon}</span> : null}
          <span className="wf-itin-sheet-text">
            <span className="wf-itin-sheet-label">{live ? "Your guide ✓" : "Publish as a guide"}</span>
            {triggerHint ? <span className="wf-itin-sheet-hint">{triggerHint}</span> : null}
          </span>
        </button>
      ) : (
        <button type="button" data-publish-guide={live ? "live" : "off"} onClick={live ? () => setOpen(true) : start} style={pill}>{live ? "Your guide ✓" : "Publish as a guide"}</button>
      )}
      {open ? (
        <div role="dialog" aria-modal="true" aria-labelledby="wf-pg-title" style={{ position: "fixed", inset: 0, zIndex: 950, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false); }}>
          <div style={{ width: "100%", maxWidth: 520, background: C.panel, borderRadius: "18px 18px 0 0", padding: "18px 16px calc(18px + env(safe-area-inset-bottom))", boxSizing: "border-box", maxHeight: "88vh", overflowY: "auto" }}>
            <div id="wf-pg-title" style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{live ? "Your community guide" : "Publish as a community guide"}</div>
            {live ? (
              <>
                <p style={{ fontSize: 14, color: C.light, lineHeight: 1.5 }}>Anyone with the link, and anyone browsing Community guides, can see it. It updates when you publish again after changing the trip.</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <a href={"/community/" + mine.slug} style={{ ...btn(true), display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Open guide</a>
                  <button type="button" style={btn(false)} onClick={share}>Share</button>
                  <button type="button" style={btn(false)} onClick={() => publish(true)} disabled={busy}>Update</button>
                  <button type="button" style={{ ...btn(false), color: "#FCA5A5" }} onClick={unpublish} disabled={busy}>Unpublish</button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize: 14, color: C.light, lineHeight: 1.5, margin: "8px 0" }}>Wayfind writes a short public guide from your stops so other people can use your plan.</p>
                <ul style={{ fontSize: 13.5, color: C.light, lineHeight: 1.55, paddingLeft: 18, margin: "0 0 10px" }}>
                  <li>Shared: the places and events, their order, and how many days.</li>
                  <li>Never shared: your notes, your dates, your trip name or your account.</li>
                  <li>You can unpublish any time.</li>
                </ul>
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", minHeight: 44, fontSize: 14, color: C.text, cursor: "pointer" }}>
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2, accentColor: C.gold }} />
                  <span>I want this trip public as a community guide.</span>
                </label>
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", minHeight: 44, fontSize: 13.5, color: C.light, cursor: "pointer" }}>
                  <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2, accentColor: C.gold }} />
                  <span>Show my public name on it (set it in Rewards and badges). Otherwise it says A Wayfind local.</span>
                </label>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button type="button" disabled={!consent || busy} onClick={() => publish(consent)} style={{ ...btn(true), flex: 1, opacity: !consent ? 0.6 : 1 }}>{busy ? "Publishing" : "Publish"}</button>
                  <button type="button" disabled={busy} onClick={() => setOpen(false)} style={btn(false)}>Cancel</button>
                </div>
              </>
            )}
            {msg.text ? <p role="status" style={{ fontSize: 13.5, color: msg.bad ? "#FCA5A5" : C.light, margin: "12px 0 0" }}>{msg.text}</p> : null}
            {live ? <button type="button" onClick={() => setOpen(false)} style={{ ...btn(false), marginTop: 12, width: "100%" }}>Close</button> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
