"use client";
// Shared pieces of the Reserve a table family (sheet, My reservations, Booking profile, similar picks).
// One look: the site's own kit.js tokens, 44px tap targets, a sheet that scrolls. Lazy: only the Reserve chunks import this.
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { C, sheetBg, sheet, Grabber, useDialogFocus } from "./kit";
import { styleHtml } from "../../lib/styleHtml.js";

const HIDE_DOCK_CSS = "html[data-wf-reserve-open] .wf-sd{visibility:hidden}";

export const mainBtn = { width: "100%", minHeight: 48, padding: "0 16px", background: C.accent, border: "none", borderRadius: 12, color: "#0D1117", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" };
export const quietBtn = { width: "100%", minHeight: 44, padding: "0 16px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 12, color: C.light, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
export const linkBtn = { ...quietBtn, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", boxSizing: "border-box" };
export const field = { width: "100%", minHeight: 44, padding: "0 12px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 16, fontFamily: "inherit", boxSizing: "border-box" };
export const label = { display: "block", fontSize: 13, fontWeight: 700, color: C.light, margin: "12px 0 6px" };
export const stepBtn = { width: 44, height: 44, borderRadius: 12, background: C.card, border: `1px solid ${C.border}`, color: C.text, fontSize: 20, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
export const chip = { minHeight: 44, padding: "0 16px", background: C.card, border: `1px solid ${C.accent}`, borderRadius: 999, color: C.text, fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" };
// The action bar stays at the bottom of the scrolling sheet, so the keyboard never hides the main button.
export const actionBar = { position: "sticky", bottom: 0, background: C.panel, padding: "10px 0 2px", display: "grid", gap: 8, zIndex: 1 };
export const errStyle = { color: "#FCA5A5", fontSize: 14, margin: "8px 0" };
export const keepVisible = (e) => { try { const el = e.target; setTimeout(() => el && el.scrollIntoView && el.scrollIntoView({ block: "center", behavior: "smooth" }), 250); } catch (er) {} };

export function Bubble({ role, children }) {
  const mine = role === "user";
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", margin: "0 0 8px" }}>
      <div style={{ maxWidth: "86%", padding: "9px 12px", borderRadius: 14, fontSize: 15, lineHeight: 1.4, background: mine ? C.accent : C.card, color: mine ? "#0D1117" : C.text, border: mine ? "none" : `1px solid ${C.border}`, fontWeight: mine ? 700 : 500, overflowWrap: "anywhere" }}>{children}</div>
    </div>
  );
}

// The sheet frame: modal dialog, focus trap, Escape, Close button, safe area padding, scrolls inside (the kit sheet caps its height).
export function Shell({ title, sub, onClose, extra, children, titleId = "wf-reserve-title" }) {
  const ref = useRef(null);
  useDialogFocus(true, ref, onClose);
  // The fixed Santa dock (z 930) sits above every kit sheet (z 900). While a Reserve sheet is open it would cover the
  // message box and Send on a phone, so hide it for the sheet's lifetime. Counted, so nested Reserve sheets are safe.
  useEffect(() => {
    const html = typeof document !== "undefined" && document.documentElement;
    if (!html) return undefined;
    const n = Number(html.getAttribute("data-wf-reserve-open") || 0) + 1;
    html.setAttribute("data-wf-reserve-open", String(n));
    return () => {
      const left = Number(html.getAttribute("data-wf-reserve-open") || 1) - 1;
      if (left > 0) html.setAttribute("data-wf-reserve-open", String(left)); else html.removeAttribute("data-wf-reserve-open");
    };
  }, []);
  return createPortal(
    <div style={sheetBg} onClick={onClose} data-reserve-backdrop="1">
      <style dangerouslySetInnerHTML={styleHtml(HIDE_DOCK_CSS)} />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onClick={(e) => e.stopPropagation()}
        style={{ ...sheet, outline: "none", position: "relative", padding: "6px 16px calc(24px + env(safe-area-inset-bottom, 0px))", overscrollBehaviorY: "contain", overflowX: "hidden" }}>
        <Grabber />
        <button type="button" onClick={onClose} aria-label="Close" style={{ position: "absolute", top: 10, right: 10, width: 44, height: 44, borderRadius: 999, background: C.card, border: `1px solid ${C.border}`, color: C.text, fontSize: 17, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>{"✕"}</button>
        <div id={titleId} style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: "4px 52px 2px 0", lineHeight: 1.25 }}>{title}</div>
        {sub ? <div style={{ fontSize: 13, color: C.muted, marginBottom: 4, overflowWrap: "anywhere" }}>{sub}</div> : null}
        {extra}
        <div style={{ height: 8 }} />
        {children}
      </div>
    </div>,
    document.body
  );
}

// One Reserve sheet at a time, whichever kind. render(close) returns the element.
let host = null;
export function showInHost(render) {
  if (typeof document === "undefined") return;
  if (host) { try { host.root.unmount(); } catch (e) {} try { host.el.remove(); } catch (e) {} host = null; }
  const el = document.createElement("div");
  el.setAttribute("data-reserve-host", "1");
  document.body.appendChild(el);
  const root = createRoot(el);
  host = { el, root };
  const close = () => {
    if (!host || host.el !== el) return;
    try { root.unmount(); } catch (e) {}
    try { el.remove(); } catch (e) {}
    host = null;
  };
  root.render(render(close));
}
