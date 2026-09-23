"use client";
// Extracted from app/home.js (G2, July 2026 decomposition). Render-only,
// except this component owns its own focus-trap (G4 fix) — useDialogFocus
// needs the ref populated the moment its effect runs; since this whole
// component is the next/dynamic({ssr:false}) boundary, calling the hook
// here keeps the ref and the effect mounting together.
//
// Delete account (2026-09-23, Apple guideline 5.1.1(v)): an inline confirm
// panel, not a second modal — this whole file is already the sheet's lazy
// chunk, so the extra state below costs nothing outside it. The actual
// deletion call lives in ctx.deleteAccountUser (app/home.js), which lazily
// imports lib/accountDelete.js; this component only owns the confirmation
// UI and its own busy/error state.
import { useEffect, useRef, useState } from "react";
import { C, sheetBg, sheet, SHEET_EASE, Grabber, useDialogFocus } from "../kit";

export default function AccountSheet({ ctx }) {
  const { accountOpen, setAccountOpen, user, setScreen, signOutUser, deleteAccountUser, wfShowDiag, BUILD_ID, sheetDragStart, sheetDragMove, sheetDragEnd } = ctx;
  const accountDlgRef = useRef(null);
  useDialogFocus(accountOpen, accountDlgRef, () => setAccountOpen(false));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const confirmInputRef = useRef(null);

  // Move focus to the confirm input the moment the panel opens, so a keyboard
  // or screen reader user lands straight on the one control the panel exists
  // for, instead of on the dialog's own outer focus trap.
  useEffect(() => {
    if (!confirmOpen) return;
    try { confirmInputRef.current && confirmInputRef.current.focus(); } catch (e) {}
  }, [confirmOpen]);

  // While a delete request is in flight, a swipe-to-close must not be able to
  // dismiss the sheet out from under it — closeConfirm() already refuses while
  // deleting, but the drag gesture bypasses that by calling setAccountOpen
  // directly through sheetDragStart's onClose callback.
  function guardedSheetDragStart(e, onClose) {
    if (deleting) return;
    sheetDragStart(e, onClose);
  }

  function openConfirm() {
    setConfirmText("");
    setDeleteError("");
    setConfirmOpen(true);
  }
  function closeConfirm() {
    if (deleting) return;
    setConfirmOpen(false);
    setConfirmText("");
    setDeleteError("");
  }
  const canDelete = confirmText.trim().toLowerCase() === "delete";
  async function handleDelete() {
    if (!canDelete || deleting) return;
    setDeleting(true);
    setDeleteError("");
    const result = await deleteAccountUser();
    // On success ctx.deleteAccountUser already closes this whole sheet, so
    // there is nothing left to unset here except the busy flag on failure.
    if (!result || !result.ok) {
      setDeleting(false);
      setDeleteError((result && result.error) || "Could not delete your account. Please try again.");
    }
  }

  return (
        <div style={sheetBg} onClick={() => { if (!deleting) setAccountOpen(false); }}>
          <div ref={accountDlgRef} role="dialog" aria-modal="true" aria-label="Your account" tabIndex={-1} style={{ ...sheet, outline: "none", padding: "6px 16px 28px", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => guardedSheetDragStart(e, () => setAccountOpen(false))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: C.adim, border: `1px solid ${C.border}`, color: C.light, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, textTransform: "uppercase", flexShrink: 0 }}>{(user.email || "?").slice(0, 1)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Signed in</div>
                <div style={{ fontSize: 13, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.email || ""}</div>
              </div>
            </div>
            {!confirmOpen ? (
              <>
                <div style={{ fontSize: 13, color: C.light, lineHeight: 1.5, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
                  <span style={{ color: C.light }}>✓ </span>Your favorites and likes are saved to your account and follow you to any device you sign in on.
                </div>
                <button onClick={() => { setAccountOpen(false); setScreen("saved"); }} style={{ width: "100%", padding: 13, borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 10, textAlign: "left" }}>❤️ Your saved spots</button>
                <button onClick={() => { setAccountOpen(false); signOutUser(); }} style={{ width: "100%", padding: 13, borderRadius: 12, border: `1px solid ${C.red}`, background: "transparent", color: C.red, fontSize: 14, fontWeight: 800, cursor: "pointer", marginBottom: 14 }}>Sign out</button>
                <button onClick={openConfirm} aria-label="Delete account" style={{ width: "100%", padding: 8, borderRadius: 10, border: "none", background: "transparent", color: C.muted, fontSize: 12.5, fontWeight: 600, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}>Delete account</button>
                <div style={{ textAlign: "center", marginTop: 12 }}><a href="/privacy" style={{ fontSize: 11.5, color: C.muted, textDecoration: "none" }}>Privacy &amp; disclosures</a></div>
                <div onClick={() => { try { window.__wfv = (window.__wfv || 0) + 1; clearTimeout(window.__wfvT); window.__wfvT = setTimeout(() => { window.__wfv = 0; }, 2200); if (window.__wfv >= 5) { window.__wfv = 0; wfShowDiag(); } } catch (e) {} }} style={{ textAlign: "center", fontSize: 11, color: C.muted, opacity: 0.5, marginTop: 16 }}>Wayfind · {BUILD_ID}</div>
                <div style={{ fontSize: 10.5, color: C.muted, opacity: 0.7, marginTop: 4 }}>© 2026 Wayfind. All rights reserved.</div>
              </>
            ) : (
              <div role="group" aria-labelledby="deleteAccountTitle">
                <div id="deleteAccountTitle" style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 8 }}>Delete your Wayfind account?</div>
                <div style={{ fontSize: 13, color: C.light, lineHeight: 1.6, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
                  <div style={{ marginBottom: 8 }}>This permanently removes:</div>
                  <ul style={{ margin: "0 0 8px", paddingLeft: 18 }}>
                    <li>Your account</li>
                    <li>Saved spots and lists</li>
                    <li>Likes</li>
                    <li>Photos and reviews you posted</li>
                    <li>Notification settings</li>
                  </ul>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>This cannot be undone.</div>
                  <div>If you signed in with Apple, Apple will ask you to confirm first.</div>
                </div>
                <label htmlFor="deleteConfirmInput" style={{ display: "block", fontSize: 12.5, color: C.muted, fontWeight: 700, marginBottom: 6 }}>Type delete to confirm</label>
                <input
                  id="deleteConfirmInput"
                  ref={confirmInputRef}
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  disabled={deleting}
                  aria-label="Type delete to confirm account deletion"
                  style={{ width: "100%", padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 15, marginBottom: 10, boxSizing: "border-box" }}
                />
                {deleteError ? <div role="alert" style={{ fontSize: 12.5, color: C.red, marginBottom: 10 }}>{deleteError}</div> : null}
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={!canDelete || deleting}
                  aria-disabled={!canDelete || deleting}
                  style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: C.red, color: "#fff", fontSize: 14, fontWeight: 800, cursor: (!canDelete || deleting) ? "default" : "pointer", opacity: (!canDelete || deleting) ? 0.5 : 1, marginBottom: 10 }}
                >{deleting ? "Deleting…" : "Delete my account"}</button>
                <button type="button" onClick={closeConfirm} disabled={deleting} style={{ width: "100%", padding: 12, borderRadius: 12, border: `1px solid ${C.border}`, background: "transparent", color: C.text, fontSize: 14, fontWeight: 700, cursor: deleting ? "default" : "pointer", opacity: deleting ? 0.6 : 1 }}>Cancel</button>
              </div>
            )}
          </div>
        </div>
  );
}
