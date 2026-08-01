"use client";
// Extracted from app/home.js (G2, July 2026 decomposition). Render-only,
// except this component owns its own focus-trap (G4 fix) — useDialogFocus
// needs the ref populated the moment its effect runs; since this whole
// component is the next/dynamic({ssr:false}) boundary, calling the hook
// here keeps the ref and the effect mounting together.
// Two independent sibling blocks: the sign-in/sign-up sheet (authOpen) and the
// password-reset-link landing sheet (recoveryOpen) — home.js renders
// introOpen between them; that stays put, unrelated to auth.
import { useRef } from "react";
import { C, sheetBg, sheet, SHEET_EASE, Grabber, useDialogFocus } from "../kit";
import { isNative } from "../../../lib/native";

export default function AuthSheet({ ctx }) {
  const { authOpen, setAuthOpen, sheetDragStart, sheetDragMove, sheetDragEnd, authMode, setAuthMode, isStandalone, signInWithProvider, authEmail, setAuthEmail, authPassword, setAuthPassword, passwordAuth, authSending, resetSending, sendPasswordReset, recoveryOpen, setRecoveryOpen, newPw, setNewPw, newPw2, setNewPw2, pwSaving, saveNewPassword } = ctx;
  const authDlgRef = useRef(null);
  const recoveryDlgRef = useRef(null);
  const nativeShell = isNative();
  useDialogFocus(authOpen, authDlgRef, () => setAuthOpen(false));
  useDialogFocus(recoveryOpen, recoveryDlgRef, () => setRecoveryOpen(false));
  return (
    <>
      {authOpen && (
        <div style={sheetBg} onClick={() => setAuthOpen(false)}>
          <div ref={authDlgRef} role="dialog" aria-modal="true" aria-labelledby="wf-auth-title" aria-describedby="wf-auth-desc" tabIndex={-1} style={{ ...sheet, outline: "none", padding: "6px 16px 32px", overscrollBehaviorY: "contain", transition: SHEET_EASE, position: "relative" }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setAuthOpen(false))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            {/* v5.61 (audit P1): a visible close button (>=44px) — the dialog
                previously only closed via tap-outside/drag. */}
            <button onClick={() => setAuthOpen(false)} aria-label="Close" style={{ position: "absolute", top: 10, right: 10, width: 44, height: 44, borderRadius: 999, background: C.card, border: `1px solid ${C.border}`, color: C.text, fontSize: 17, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>✕</button>
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 16px" }} />
            <div id="wf-auth-title" style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 6 }}>{authMode === "signup" ? "Create your Wayfind account" : "Sign in to Wayfind"}</div>
            <div id="wf-auth-desc" style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 16 }}>{authMode === "signup" ? "Free, about 20 seconds. Save your spots, sync them to every device, and Wayfind sharpens to your taste." : "Welcome back — your spots and lists are right where you left them."}</div>

            {!isStandalone && !nativeShell && (
              <button onClick={() => signInWithProvider("google")} style={{ width: "100%", padding: 13, borderRadius: 12, border: `1px solid ${C.border}`, background: "#FFFFFF", color: "#1F2937", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 800 }}>G</span> Continue with Google
            </button>
            )}

            {/* Required alongside Google per App Store guideline 4.8: any app
                offering a third-party social sign-in must offer Sign in with
                Apple as an equivalent option. Needs the "apple" provider
                enabled in Supabase Auth (Services ID + key from the Apple
                Developer portal) before this actually completes a sign-in —
                see the setup checklist. */}
            {(!isStandalone || nativeShell) && (
              <button onClick={() => signInWithProvider("apple")} style={{ width: "100%", padding: 13, borderRadius: 12, border: "1px solid #000000", background: "#000000", color: "#FFFFFF", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 170 170" aria-hidden="true" style={{ display: "block" }}>
                  <path fill="#FFFFFF" d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.2-2.12-9.98-3.17-14.36-3.17-4.6 0-9.51 1.05-14.75 3.17-5.25 2.13-9.48 3.24-12.71 3.35-4.93.21-9.84-1.96-14.75-6.52-3.13-2.73-7.05-7.41-11.75-14.04-5.04-7.08-9.18-15.29-12.41-24.65-3.46-10.11-5.2-19.9-5.2-29.38 0-10.86 2.35-20.22 7.05-28.05 3.69-6.3 8.6-11.27 14.75-14.92 6.16-3.65 12.81-5.51 19.98-5.63 3.91 0 9.04 1.21 15.42 3.59 6.36 2.39 10.45 3.6 12.23 3.6 1.33 0 5.87-1.42 13.56-4.24 7.27-2.62 13.41-3.71 18.44-3.28 13.62 1.1 23.87 6.47 30.71 16.15-12.18 7.38-18.21 17.71-18.09 30.94.11 10.31 3.86 18.88 11.22 25.66 3.34 3.17 7.06 5.63 11.19 7.38-.9 2.6-1.84 5.08-2.85 7.46zM119.11 7.24c0 8.1-2.96 15.67-8.86 22.67-7.12 8.32-15.72 13.13-25.06 12.37a25.2 25.2 0 0 1-.19-3.06c0-7.78 3.39-16.1 9.4-22.9 3-3.44 6.82-6.29 11.44-8.56 4.61-2.24 8.97-3.48 13.07-3.7.13 1.06.2 2.12.2 3.18z"/>
                </svg>
                Continue with Apple
              </button>
            )}

            {(!isStandalone || nativeShell) && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, height: 1, background: C.border }} />
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>or with email</div>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>
            )}

            {isStandalone && !nativeShell && (
              <div style={{ fontSize: 12.5, color: C.muted, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px", marginBottom: 14, lineHeight: 1.5 }}>
                You're in the home-screen app, so sign in with email below. Google sign-in only works in Safari; if you use Google, open Wayfind in Safari to sign in there.
              </div>
            )}

            {/* v5.61 (audit P1): visible labels + id/name/autocomplete on both
                inputs (were placeholder-only). */}
            <label htmlFor="wf-auth-email" style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: C.light, marginBottom: 5 }}>Email address</label>
            <input id="wf-auth-email" name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" autoCorrect="off" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@email.com"
              style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 16, marginBottom: 12, outline: "none" }} />
            <label htmlFor="wf-auth-password" style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: C.light, marginBottom: 5 }}>Password</label>
            <input id="wf-auth-password" name="password" type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="Password"
              style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 16, marginBottom: 12, outline: "none" }} />
            <button onClick={passwordAuth} disabled={authSending || !authEmail || !authPassword} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: C.accent, color: "#0D1117", fontSize: 15, fontWeight: 800, cursor: authSending || !authEmail || !authPassword ? "default" : "pointer", opacity: authSending || !authEmail || !authPassword ? 0.6 : 1 }}>
              {authSending ? "…" : authMode === "signup" ? "Create account" : "Sign in"}
            </button>
            <div style={{ textAlign: "center", marginTop: 14, fontSize: 13, color: C.muted }}>
              {authMode === "signup" ? "Already have an account? " : "New here? "}
              {/* v5.61 (audit P1): semantic <button>, not a <span> onClick. */}
              <button type="button" onClick={() => setAuthMode(authMode === "signup" ? "signin" : "signup")} style={{ background: "none", border: "none", padding: "6px 4px", color: C.light, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{authMode === "signup" ? "Sign in" : "Create one"}</button>
            </div>
            {authMode === "signin" && (
              <div style={{ textAlign: "center", marginTop: 8 }}>
                <button type="button" onClick={resetSending ? undefined : sendPasswordReset} disabled={resetSending} style={{ background: "none", border: "none", padding: "8px 4px", minHeight: 36, fontSize: 12.5, color: C.muted, textDecoration: "underline", cursor: resetSending ? "default" : "pointer", opacity: resetSending ? 0.6 : 1 }}>{resetSending ? "Sending…" : "Forgot password?"}</button>
              </div>
            )}
            <div style={{ textAlign: "center", marginTop: 10 }}><a href="/privacy" style={{ fontSize: 11, color: C.muted, textDecoration: "none" }}>Privacy &amp; disclosures</a></div>
          </div>
        </div>
      )}
      {recoveryOpen && (
        <div style={sheetBg} onClick={() => setRecoveryOpen(false)}>
          <div ref={recoveryDlgRef} role="dialog" aria-modal="true" aria-label="Set a new password" tabIndex={-1} style={{ ...sheet, outline: "none", padding: "22px 20px 30px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 6 }}>Set a new password</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>You opened a password reset link. Choose a new password for your account.</div>
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password (8+ characters)"
              style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 16, marginBottom: 10, outline: "none" }} />
            <input type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} placeholder="Repeat new password"
              style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 16, marginBottom: 12, outline: "none" }} />
            <button onClick={saveNewPassword} disabled={pwSaving || !newPw || !newPw2} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: C.accent, color: "#0D1117", fontSize: 15, fontWeight: 800, cursor: pwSaving || !newPw || !newPw2 ? "default" : "pointer", opacity: pwSaving || !newPw || !newPw2 ? 0.6 : 1 }}>{pwSaving ? "…" : "Save new password"}</button>
          </div>
        </div>
      )}
    </>
  );
}
