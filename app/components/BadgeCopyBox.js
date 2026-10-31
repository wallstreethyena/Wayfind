"use client";
// app/components/BadgeCopyBox.js — one badge style on /badge/[id]: the live
// preview, the exact code to paste, and a Copy button. The code is built on
// the server (lib/topRatedBadge.js badgeEmbedHtml) and only displayed here.
import { useState } from "react";

const S = {
  card: { background: "#161B22", border: "1px solid #26303B", borderRadius: 14, padding: 16, margin: "0 0 16px" },
  label: { fontSize: 12, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 10px" },
  previewDark: { background: "#0B0E13", borderRadius: 10, padding: 18, display: "flex", justifyContent: "center", margin: "0 0 12px" },
  previewLight: { background: "#F8FAFC", borderRadius: 10, padding: 18, display: "flex", justifyContent: "center", margin: "0 0 12px" },
  code: { display: "block", width: "100%", boxSizing: "border-box", minHeight: 96, resize: "vertical", background: "#0D1117", color: "#CBD5E1", border: "1px solid #26303B", borderRadius: 10, padding: 10, fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: 1.5 },
  btn: { marginTop: 10, padding: "11px 18px", borderRadius: 999, border: 0, background: "#F97316", color: "#0D1117", fontWeight: 800, fontSize: 14, cursor: "pointer", minHeight: 44 },
  ok: { marginLeft: 10, fontSize: 13, color: "#86EFAC" },
};

export default function BadgeCopyBox({ title, theme, imgSrc, alt, code }) {
  const [state, setState] = useState("");
  const id = "badge-code-" + theme;
  // Copies from the visible code box itself (select + copy, inside the tap).
  // Deliberately not navigator.clipboard: that transport is reserved for the
  // share chooser and coupon copy (scripts/test-unified-share-flow.mjs).
  function copy() {
    const el = document.getElementById(id);
    let copied = false;
    if (el) {
      el.focus();
      el.select();
      try { el.setSelectionRange(0, code.length); } catch { /* older iOS */ }
      try { copied = document.execCommand("copy") === true; } catch { copied = false; }
    }
    setState(copied ? "Copied! Now paste it into your website." : "Code selected. Copy it with your keyboard or long press.");
  }
  return (
    <div style={S.card}>
      <p style={S.label}>{title}</p>
      <div style={theme === "light" ? S.previewLight : S.previewDark}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imgSrc} alt={alt} width={220} height={80} style={{ maxWidth: "100%", height: "auto" }} />
      </div>
      <label htmlFor={id} style={{ ...S.label, display: "block" }}>Code to paste</label>
      <textarea id={id} readOnly value={code} style={S.code} onFocus={(e) => e.target.select()} />
      <button type="button" onClick={copy} style={S.btn}>Copy code</button>
      <span role="status" aria-live="polite" style={S.ok}>{state}</span>
    </div>
  );
}
