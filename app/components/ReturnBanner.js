"use client";
// One compact "pick up where you left off" bar for a returning visitor.
// Loaded only by ReengageMount, after load and idle, and only when
// lib/reengageClient.shouldShowBanner said yes. position:fixed at the bottom, so
// it adds no layout shift. z-index 890 sits under the app's sheets (kit.js
// sheetBg is 900, detail pages 950, planner 960) so any sheet covers it.
// Copy rules: plain words, no dashes, no pressure, no countdowns.
import { useEffect, useRef, useState } from "react";
import {
  readState, readFlags, bannerKind, freshDraft, cityLabel, markDismissed, reengageEvent,
} from "../../lib/reengageClient.js";
import { activeHolidayPromos } from "../../lib/holidayPromos.js";
import { siteTodayStr } from "../../lib/siteTime.js";

const T = { card: "#161B22", border: "#2D3748", text: "#F1F5F9", muted: "#94A3B8", accent: "#F97316", gold: "#FBBF24" };
const BAR = {
  position: "fixed", left: 12, right: 12, margin: "0 auto", maxWidth: 520, boxSizing: "border-box",
  bottom: "calc(12px + env(safe-area-inset-bottom, 0px))", zIndex: 890,
  background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: "8px 52px 8px 14px",
  color: T.text, boxShadow: "0 10px 30px rgba(0,0,0,.45)", maxHeight: 124, overflow: "hidden", fontFamily: "var(--wf-sans, system-ui, sans-serif)",
};
const TITLE = { margin: 0, fontSize: 15, fontWeight: 800, lineHeight: "20px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const ROW = { display: "flex", gap: 8, marginTop: 4, flexWrap: "nowrap" };
const BTN = { minHeight: 44, padding: "0 14px", borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", cursor: "pointer", boxSizing: "border-box", whiteSpace: "nowrap", font: "inherit", fontSize: 14, fontWeight: 800 };
const PRIMARY = { ...BTN, background: T.accent, color: "#111827", border: `1px solid ${T.accent}` };
const SECONDARY = { ...BTN, background: "transparent", color: T.text, border: `1px solid ${T.border}` };
const CLOSE = { position: "absolute", top: 0, right: 0, width: 44, height: 44, background: "transparent", border: "none", color: T.muted, fontSize: 22, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
const OFFER = { display: "block", margin: "2px 0 0", color: T.gold, fontSize: 13, fontWeight: 700, lineHeight: "18px", textDecoration: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

function surfaceOf(pathname) {
  const seg = String(pathname || "/").split("/").filter(Boolean)[0];
  return seg ? seg.toLowerCase() : "home";
}

export default function ReturnBanner() {
  const [model, setModel] = useState(null);
  const [gone, setGone] = useState(false);
  const [drawer, setDrawer] = useState(null); // null | { Drawer }
  const shown = useRef(false);
  const emailBtn = useRef(null);

  useEffect(() => {
    const now = Date.now();
    const state = readState(window);
    const flags = readFlags(window);
    const kind = bannerKind(state, now);
    if (!kind) return;
    const surface = surfaceOf(window.location.pathname);
    let offer = null;
    try { offer = activeHolidayPromos(surface, siteTodayStr())[0] || null; } catch (e) { offer = null; }
    setModel({ kind, state, flags, surface, offer, draft: freshDraft(state, now), now });
  }, []);

  useEffect(() => {
    if (!model || shown.current) return;
    shown.current = true;
    reengageEvent(window, "reengage_banner_shown", { kind: model.kind });
  }, [model]);

  if (!model || gone) return null;
  const { kind, state, flags, offer, draft } = model;

  const openDrawer = () => {
    reengageEvent(window, "reengage_banner_click", { kind: "email" });
    import("./EmailItineraryDrawer").then((m) => setDrawer({ Drawer: m.default }), () => {});
  };
  const dismiss = () => {
    markDismissed(window);
    reengageEvent(window, "reengage_banner_dismissed", { kind });
    setGone(true);
  };

  // The drawer replaces the bar while it is open.
  if (drawer) {
    const { Drawer } = drawer;
    // The bar is unmounted while the sheet is open, so its button is gone when the
    // sheet closes: put focus back on the new button once the bar returns.
    return <Drawer planRef={draft ? draft.planRef : ""} areaName={draft ? draft.areaName : ""} surface="banner"
      onClose={() => { setDrawer(null); setTimeout(() => { try { emailBtn.current && emailBtn.current.focus(); } catch (e) { /* ignore */ } }, 0); }} />;
  }

  const newest = state.recent[0];
  const city = cityLabel(state) || "Florida";
  const title = kind === "draft"
    ? (draft.areaName ? `Your ${draft.areaName} plan is still here` : "Your plan is still here")
    : `Back for more ${city}?`;
  const href = kind === "draft" ? "/plan-my-day" : "/p/" + encodeURIComponent(newest.id);
  const label = kind === "draft" ? "Pick it back up" : "See what you looked at";
  const outbound = offer && offer.href.startsWith("/api/");

  return (
    <div role="region" aria-label="Pick up where you left off" data-reengage-banner={kind} style={BAR}>
      <p style={TITLE}>{title}</p>
      <div style={ROW}>
        <a href={href} style={PRIMARY} onClick={() => reengageEvent(window, "reengage_banner_click", { kind })}>{label}</a>
        {kind === "draft" && !flags.hasSavedEmail ? <button type="button" ref={emailBtn} style={SECONDARY} onClick={openDrawer}>Email it to me</button> : null}
      </div>
      {offer ? <a href={offer.href} style={OFFER} rel={outbound ? "sponsored nofollow" : undefined} data-holiday-promo={offer.id}>{offer.claim || offer.title}</a> : null}
      <button type="button" aria-label="Dismiss this reminder" style={CLOSE} onClick={dismiss}><span aria-hidden="true">×</span></button>
    </div>
  );
}
