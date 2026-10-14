// Visible credit for a photo from /api/photo?fmt=json (Google, permitted, licensed).
// Google: "Photo: <author> · Google Maps". Licensed/permitted: "Photo: <name> · <license>".
//
// Owner rule (2026-10-13, global): the credit NEVER sits on top of the photo and
// NEVER has a dark pill/background behind it. It renders as a plain text line in
// normal page flow, placed directly underneath the headline (the place name).
// Colour is inherited from where it sits, so it reads on dark sheets and the
// lightbox alike; callers may pass a colour through `style`.
// Locked by scripts/check-photo-credit-under-headline.mjs.

const line = {
  display: "block", maxWidth: "100%", fontSize: 11.5, fontWeight: 600, lineHeight: 1.45,
  opacity: 0.78, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
const link = { color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 };

function safeHref(u) { return typeof u === "string" && /^https?:\/\//i.test(u) ? u : null; }

function L({ href, children }) {
  const h = safeHref(href);
  return h
    ? <a href={h} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={link}>{children}</a>
    : <>{children}</>;
}

export default function PhotoCredit({ credit, style }) {
  if (!credit) return null;
  const isGoogle = credit.source === "google" || (!credit.license && credit.mapsUri !== undefined);
  const name = credit.name || (isGoogle ? "a Google Maps contributor" : "");
  if (!name && !isGoogle) return null;
  // Layout keys a caller might pass to pin the credit over a photo are dropped:
  // the credit always flows as plain text under the headline.
  const rest = { ...(style || {}) };
  for (const k of ["position", "top", "right", "bottom", "left", "inset", "zIndex", "background", "backgroundColor"]) delete rest[k];
  return (
    <div data-photo-credit style={{ ...rest, position: "static" }}>
      <span style={line}>
        Photo: <L href={credit.uri}>{name}</L>
        {isGoogle
          ? <> · <L href={credit.mapsUri}>Google Maps</L></>
          : (credit.license ? <> · {credit.license}</> : null)}
      </span>
    </div>
  );
}
