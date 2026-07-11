"use client";
// Event-detail regression fix (owner-reported, 2026-07-11): the Florida
// Railroad train ride's "Get tickets" opened Expedia. Cause: the Stay22
// LinkSwap script (root layout) rewrites outbound <a> hrefs after load, so a
// plain <a href="https://frrm.org"> gets redirected to a hotel OTA. An
// event's own official/ticket site must NEVER be affiliate-swapped. This
// button navigates to the ORIGINAL url captured in a JS closure on click, so
// Stay22's href rewrite can't touch it.
export default function TicketButton({ url, label }) {
  const A = "#2EC9A6";
  const go = (e) => {
    e.preventDefault();
    try { const w = window.open(url, "_blank", "noopener,noreferrer"); if (w) return; } catch (er) {}
    try { location.href = url; } catch (er) {}
  };
  return (
    <a href={url} onClick={go} target="_blank" rel="noreferrer" data-s22-autopilot="false" style={{ display: "block", textAlign: "center", marginTop: 18, background: A, color: "#0D1117", fontWeight: 800, fontSize: 15, borderRadius: 12, padding: "13px 0", textDecoration: "none" }}>
      {label}
    </a>
  );
}
