// PhotoCreditLink — the ONE anchor for an EXTERNAL photo attribution
// (photographer, source page, licence, "Google Maps"). Issue #1601: these used
// to be bare <a href> and replaced the reader's Wayfind page, losing their
// place. Now they open in a new tab.
//
// Contract (locked by scripts/test-photo-credit-new-tab.mjs):
//   - target="_blank" + rel containing "noopener". Extra rel tokens a call site
//     already had (e.g. "nofollow") are passed through `rel` and kept.
//     noreferrer is NOT added here: referral behaviour is unchanged.
//   - href and the visible children are rendered exactly as given.
//   - a visually-hidden "(opens in a new tab)" tells screen readers. It is a
//     child span, so the visible credit text is never replaced by an aria-label.
//   - server-safe: no hooks, no handlers. A credit that sits inside a clickable
//     card is the card's concern (cards ignore taps that start inside an <a>).
//
// Photo attribution ONLY. Never use this for booking, navigation or /api/*/go
// links.
const SR_ONLY = { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 };

export default function PhotoCreditLink({ href, rel, children, ...rest }) {
  const tokens = String(rel || "").split(/\s+/).filter(Boolean);
  if (!tokens.includes("noopener")) tokens.push("noopener");
  return (
    <a {...rest} style={{ position: "relative", ...(rest.style || {}) }} href={href} target="_blank" rel={tokens.join(" ")}>
      {children}
      <span style={SR_ONLY}> (opens in a new tab)</span>
    </a>
  );
}
