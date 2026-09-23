"use client";
// app/components/native/PushPrompt.js — the contextual push opt-in card.
//
// Loaded ONLY through next/dynamic from ../NativeShellInit.js, and only when
// that component has already decided (launch count / post-sign-in, never at
// cold boot) that this is worth showing, so this markup never ships to a
// visitor who never sees it (bundle budget: see CLAUDE.md). Colors match the
// rest of the native shell (app/components/native/OfflineOverlay.js): the
// app's dark background and orange accent, not app/components/kit.js's C
// tokens, which this native-only surface does not otherwise depend on.
//
// requestPushPermission() (lib/native.js) is the ONLY function in this app
// that triggers the OS permission sheet, and this card is its only caller.
import { useEffect, useRef, useState } from "react";
import { requestPushPermission } from "../../../lib/native";

const BG = "#0D1117";
const ACCENT = "#F97316";
const TEXT = "#F3F4F6";
const MUTED = "#9CA3AF";

export default function PushPrompt({ onClose }) {
  const [busy, setBusy] = useState(false);
  const turnOnRef = useRef(null);

  useEffect(() => {
    try { turnOnRef.current && turnOnRef.current.focus(); } catch (e) {}
  }, []);

  const close = () => { try { onClose && onClose(); } catch (e) {} };

  const handleTurnOn = async () => {
    if (busy) return;
    setBusy(true);
    try { await requestPushPermission(); } catch (e) {}
    setBusy(false);
    close();
  };

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999997,
        display: "flex",
        justifyContent: "center",
        padding: "0 16px max(16px, env(safe-area-inset-bottom))",
        pointerEvents: "none",
      }}
    >
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="wf-push-prompt-heading"
        aria-describedby="wf-push-prompt-body"
        style={{
          pointerEvents: "auto",
          width: "100%",
          maxWidth: 420,
          background: BG,
          border: "1px solid rgba(249,115,22,.28)",
          borderRadius: 18,
          padding: 20,
          boxShadow: "0 12px 40px rgba(0,0,0,.5)",
        }}
      >
        <h2 id="wf-push-prompt-heading" style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 800, color: TEXT }}>
          Get Weekend Picks near you
        </h2>
        <p id="wf-push-prompt-body" style={{ margin: "0 0 18px", fontSize: 14, lineHeight: 1.5, color: MUTED }}>
          One short note on Fridays with the best things to do near you this weekend.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            ref={turnOnRef}
            type="button"
            onClick={handleTurnOn}
            disabled={busy}
            style={{
              flex: 1,
              appearance: "none",
              WebkitAppearance: "none",
              border: "none",
              outline: "none",
              background: ACCENT,
              color: BG,
              fontSize: 15,
              fontWeight: 800,
              minHeight: 46,
              minWidth: 44,
              borderRadius: 999,
              cursor: "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            Turn on
          </button>
          <button
            type="button"
            onClick={close}
            style={{
              flex: 1,
              appearance: "none",
              WebkitAppearance: "none",
              border: "1px solid rgba(255,255,255,.16)",
              outline: "none",
              background: "transparent",
              color: MUTED,
              fontSize: 15,
              fontWeight: 700,
              minHeight: 46,
              minWidth: 44,
              borderRadius: 999,
              cursor: "pointer",
            }}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
