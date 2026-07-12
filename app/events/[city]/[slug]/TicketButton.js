"use client";
// Event-detail regression fix (owner-reported, 2026-07-11): the Florida
// Railroad train ride's "Get tickets" opened Expedia. Cause: the Stay22
// LinkSwap script (root layout) rewrites outbound <a> hrefs after load, so a
// plain <a href="https://frrm.org"> gets redirected to a hotel OTA. An
// event's own official/ticket site must NEVER be affiliate-swapped. This
// button navigates to the ORIGINAL url captured in a JS closure on click, so
// Stay22's href rewrite can't touch it.
//
// v5.77: validate the url through the central safeUrl() so a malformed/empty
// ticket URL can't produce a broken open — but keep the DIRECT window.open
// (NOT the shared openExternal), because openExternal's popup-blocked fallback
// synthesizes an <a> click that Stay22 could rewrite, reintroducing this bug.
import { safeUrl } from "../../../../lib/links";
export default function TicketButton({ url, label }) {
  const A = "#2EC9A6";
  const safe = safeUrl(url);
  const go = (e) => {
    e.preventDefault();
    if (!safe) return;
    try { const w = window.open(safe, "_blank", "noopener,noreferrer"); if (w) return; } catch (er) {}
    try { location.href = safe; } catch (er) {}
  };
  if (!safe) return null; // no valid ticket URL -> no button (graceful degradation)
  return (
    <a href={safe} onClick={go} target="_blank" rel="noreferrer" data-s22-autopilot="false" style={{ display: "block", textAlign: "center", marginTop: 18, background: A, color: "#0D1117", fontWeight: 800, fontSize: 15, borderRadius: 12, padding: "13px 0", textDecoration: "none" }}>
      {label}
    </a>
  );
}
