"use client";
// Extracted from app/home.js (G2, July 2026 decomposition). Render-only,
// except this component owns its own focus-trap (G4 fix) — useDialogFocus
// needs the ref populated the moment its effect runs; since this whole
// component is the next/dynamic({ssr:false}) boundary, calling the hook
// here keeps the ref and the effect mounting together.
import { useRef } from "react";
import { C, sheetBg, sheet, SHEET_EASE, Grabber, useDialogFocus } from "../kit";

export default function AccountSheet({ ctx }) {
  const { accountOpen, setAccountOpen, user, setScreen, signOutUser, wfShowDiag, BUILD_ID, sheetDragStart, sheetDragMove, sheetDragEnd } = ctx;
  const accountDlgRef = useRef(null);
  useDialogFocus(accountOpen, accountDlgRef, () => setAccountOpen(false));
  return (
        <div style={sheetBg} onClick={() => setAccountOpen(false)}>
          <div ref={accountDlgRef} role="dialog" aria-modal="true" aria-label="Your account" tabIndex={-1} style={{ ...sheet, outline: "none", padding: "6px 16px 28px", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setAccountOpen(false))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: C.adim, border: `1px solid ${C.border}`, color: C.light, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, textTransform: "uppercase", flexShrink: 0 }}>{(user.email || "?").slice(0, 1)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Signed in</div>
                <div style={{ fontSize: 13, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.email || ""}</div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: C.light, lineHeight: 1.5, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
              <span style={{ color: C.light }}>✓ </span>Your favorites and likes are saved to your account and follow you to any device you sign in on.
            </div>
            <button onClick={() => { setAccountOpen(false); setScreen("saved"); }} style={{ width: "100%", padding: 13, borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 10, textAlign: "left" }}>❤️ Your saved spots</button>
            <button onClick={() => { setAccountOpen(false); signOutUser(); }} style={{ width: "100%", padding: 13, borderRadius: 12, border: `1px solid ${C.red}`, background: "transparent", color: C.red, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Sign out</button>
            <div style={{ textAlign: "center", marginTop: 12 }}><a href="/privacy" style={{ fontSize: 11.5, color: C.muted, textDecoration: "none" }}>Privacy &amp; disclosures</a></div>
            <div onClick={() => { try { window.__wfv = (window.__wfv || 0) + 1; clearTimeout(window.__wfvT); window.__wfvT = setTimeout(() => { window.__wfv = 0; }, 2200); if (window.__wfv >= 5) { window.__wfv = 0; wfShowDiag(); } } catch (e) {} }} style={{ textAlign: "center", fontSize: 10.5, color: C.muted, opacity: 0.5, marginTop: 16 }}>Wayfind beta · {BUILD_ID}</div>
            <div style={{ fontSize: 10.5, color: C.muted, opacity: 0.7, marginTop: 4 }}>© 2026 Wayfind. All rights reserved.</div>
          </div>
        </div>
  );
}
