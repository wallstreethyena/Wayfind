"use client";
// app/components/ShareButton.js — the share control for pages OUTSIDE the app
// shell: guides, culture pages, and anything else server-rendered.
//
// Owner, 2026-08-19: "why is it that none of these blog has a share button ...
// i want a share button on all of them."
//
// He is right that it was missing and right that it matters. Guides are ~46% of
// external entries (AUDIT F2) and every one of them was a terminal page: a
// reader who wanted to send "23 Birthday Freebies in Bradenton" to the person
// whose birthday it is had to select the address bar. The share that never
// happened is the cheapest acquisition channel this product has.
//
// TWO THINGS THIS DOES THAT A MAILTO LINK WOULD NOT:
//
//   1. It uses the OS sheet on a phone, where the reader already is. The link
//      lands in the thread they were going to paste it into anyway, with the
//      page's own OG card (each guide has one — see the guide's
//      generateMetadata) rather than a bare blue URL.
//   2. It SAYS SO when it copies instead. On a desktop there is no sheet, so
//      the tap writes to the clipboard, and a clipboard write with no feedback
//      is indistinguishable from a broken button. That is the whole reason this
//      is a client component and not an <a>.
//
// The ordering rule it depends on — sheet BEFORE clipboard, because on iOS the
// clipboard consumes the tap's activation — lives in lib/shareOut.js.
import { useEffect, useRef, useState } from "react";
import { shareOut } from "../../lib/shareOut";
import { track } from "../../lib/track";

const Glyph = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ display: "block", flex: "0 0 auto" }}>
    <path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" />
  </svg>
);

const TONES = {
  // On the hero's cream panel, beside the orange primary and the outlined
  // secondary. Quiet third action — it must not compete with the CTA that earns.
  hero: {
    background: "transparent", color: "#1F2937", border: "1.5px solid rgba(31,41,55,.28)",
    hover: "rgba(31,41,55,.06)",
  },
  // On the dark article body.
  dark: {
    background: "transparent", color: "#F1F5F9", border: "1.5px solid #2D3748",
    hover: "rgba(249,115,22,.12)",
  },
  // The end-of-article prompt, where sharing IS the action being asked for.
  solid: {
    background: "#F97316", color: "#0D1117", border: "1.5px solid #F97316",
    hover: "#FB8A3C",
  },
};

/**
 * @param {string} url    ABSOLUTE, and resolved on the SERVER. Never built from
 *                        window.location: on a preview deploy that is a host the
 *                        recipient cannot reach (lib/site.js canonicalShareUrl).
 * @param {string} title  what the OS sheet titles the share
 * @param {string} text   the message body, in the SENDER's voice
 * @param {string} label  button copy
 * @param {string} tone   hero | dark | solid
 * @param {string} event  analytics event name
 * @param {object} meta   extra analytics props
 */
export default function ShareButton({
  url, title, text, label = "Share", tone = "dark", event = "page_share", meta,
  full = false,
}) {
  const [said, setSaid] = useState("");
  const timer = useRef(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!url) return null;
  const t = TONES[tone] || TONES.dark;

  const onClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const how = shareOut({ url, title, text }, () => {
      setSaid("Link copied");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setSaid(""), 2400);
    });
    // Logged with WHICH PATH ran. "shares are flat" and "the sheet never opens
    // on iOS" look identical in a single counter, and the second one is a bug.
    try { track(event, { ...(meta || {}), path: how, url }); } catch (err) {}
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={said || (title ? "Share: " + title : "Share this page")}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
        padding: "11px 18px", borderRadius: 999, cursor: "pointer",
        font: "inherit", fontSize: 14, fontWeight: 800, lineHeight: 1,
        background: t.background, color: t.color, border: t.border,
        width: full ? "100%" : undefined,
        transition: "background .18s ease, transform .18s ease",
        WebkitTapHighlightColor: "transparent",
      }}
      onMouseEnter={(ev) => { ev.currentTarget.style.background = t.hover; }}
      onMouseLeave={(ev) => { ev.currentTarget.style.background = t.background; }}
    >
      <Glyph />
      {/* aria-live so the confirmation is announced, not just drawn — the whole
          point of this state is that the user cannot otherwise tell it worked. */}
      <span aria-live="polite">{said || label}</span>
    </button>
  );
}
