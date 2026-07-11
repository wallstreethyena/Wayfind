"use client";
// Extracted from app/home.js (G2, July 2026 decomposition). Render-only.
// Two independent sibling blocks: the sign-in/sign-up sheet (authOpen) and the
// password-reset-link landing sheet (recoveryOpen) — home.js renders
// introOpen between them; that stays put, unrelated to auth.
import { C, sheetBg, sheet, SHEET_EASE, Grabber } from "../kit";

export default function AuthSheet({ ctx }) {
  const { authOpen, setAuthOpen, authDlgRef, sheetDragStart, sheetDragMove, sheetDragEnd, authMode, setAuthMode, isStandalone, signInWithProvider, authEmail, setAuthEmail, authPassword, setAuthPassword, passwordAuth, authSending, resetSending, sendPasswordReset, recoveryOpen, setRecoveryOpen, recoveryDlgRef, newPw, setNewPw, newPw2, setNewPw2, pwSaving, saveNewPassword } = ctx;
  return (
    <>
      {authOpen && (
        <div style={sheetBg} onClick={() => setAuthOpen(false)}>
          <div ref={authDlgRef} role="dialog" aria-modal="true" aria-label="Sign in or create your account" tabIndex={-1} style={{ ...sheet, outline: "none", padding: "6px 16px 32px", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setAuthOpen(false))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 6 }}>{authMode === "signup" ? "Create your Wayfind account" : "Sign in to Wayfind"}</div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 16 }}>Save your spots so they follow you across devices.</div>

            {!isStandalone && (
              <button onClick={() => signInWithProvider("google")} style={{ width: "100%", padding: 13, borderRadius: 12, border: `1px solid ${C.border}`, background: "#FFFFFF", color: "#1F2937", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 800 }}>G</span> Continue with Google
            </button>
            )}

            {!isStandalone && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, height: 1, background: C.border }} />
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>or with email</div>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>
            )}

            {isStandalone && (
              <div style={{ fontSize: 12.5, color: C.muted, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px", marginBottom: 14, lineHeight: 1.5 }}>
                You're in the home-screen app, so sign in with email below. Google sign-in only works in Safari; if you use Google, open Wayfind in Safari to sign in there.
              </div>
            )}

            <input type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@email.com"
              style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 15, marginBottom: 10, outline: "none" }} />
            <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="Password"
              style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 15, marginBottom: 12, outline: "none" }} />
            <button onClick={passwordAuth} disabled={authSending || !authEmail || !authPassword} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: C.accent, color: "#0D1117", fontSize: 15, fontWeight: 800, cursor: authSending || !authEmail || !authPassword ? "default" : "pointer", opacity: authSending || !authEmail || !authPassword ? 0.6 : 1 }}>
              {authSending ? "…" : authMode === "signup" ? "Create account" : "Sign in"}
            </button>
            <div style={{ textAlign: "center", marginTop: 14, fontSize: 13, color: C.muted }}>
              {authMode === "signup" ? "Already have an account? " : "New here? "}
              <span onClick={() => setAuthMode(authMode === "signup" ? "signin" : "signup")} style={{ color: C.accent, fontWeight: 700, cursor: "pointer" }}>{authMode === "signup" ? "Sign in" : "Create one"}</span>
            </div>
            {authMode === "signin" && (
              <div style={{ textAlign: "center", marginTop: 8 }}>
                <span onClick={resetSending ? undefined : sendPasswordReset} style={{ fontSize: 12.5, color: C.muted, textDecoration: "underline", cursor: "pointer", opacity: resetSending ? 0.6 : 1 }}>{resetSending ? "Sending…" : "Forgot password?"}</span>
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
              style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 15, marginBottom: 10, outline: "none" }} />
            <input type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} placeholder="Repeat new password"
              style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 15, marginBottom: 12, outline: "none" }} />
            <button onClick={saveNewPassword} disabled={pwSaving || !newPw || !newPw2} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: C.accent, color: "#0D1117", fontSize: 15, fontWeight: 800, cursor: pwSaving || !newPw || !newPw2 ? "default" : "pointer", opacity: pwSaving || !newPw || !newPw2 ? 0.6 : 1 }}>{pwSaving ? "…" : "Save new password"}</button>
          </div>
        </div>
      )}
    </>
  );
}
