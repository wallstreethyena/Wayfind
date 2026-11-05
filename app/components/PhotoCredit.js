// Visible credit for a photo from /api/photo?fmt=json (Google, permitted, licensed).
// Google: "Photo: <author> · Google Maps". Licensed/permitted: "Photo: <name> · <license>".
//
// Owner rule (2026-11-04, global): a credit on a card, hero, or gallery sits ON
// the photo, bottom left, one truncated line, white at about 60% with a soft
// shadow, and never a pill, badge, or background. Pass `onPhoto` for that.
// The lightbox and the full photo viewer keep the readable static line (no
// pill there either). Layout keys a caller passes cannot pin or box that line.
// Locked by scripts/check-photo-credit-under-headline.mjs.

const line = {
  display: "block", maxWidth: "100%", fontSize: 11.5, fontWeight: 600, lineHeight: 1.45,
  opacity: 0.78, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
const onPhotoLine = {
  display: "block", maxWidth: "100%", fontSize: 9.5, fontWeight: 500, lineHeight: "12px",
  color: "rgba(255,255,255,.6)", textShadow: "0 1px 2px rgba(0,0,0,.65)",
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
const link = { color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 };
const quietLink = { color: "inherit", textDecoration: "none" };

function safeHref(u) { return typeof u === "string" && /^https?:\/\//i.test(u) ? u : null; }

function L({ href, children, quiet }) {
  const h = safeHref(href);
  return h
    ? <a href={h} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={quiet ? quietLink : link}>{children}</a>
    : <>{children}</>;
}

export default function PhotoCredit({ credit, style, onPhoto = false }) {
  if (!credit) return null;
  const isGoogle = credit.source === "google" || (!credit.license && credit.mapsUri !== undefined);
  const name = credit.name || (isGoogle ? "a Google Maps contributor" : "");
  if (!name && !isGoogle) return null;
  const body = (
    <>
      Photo: <L href={credit.uri} quiet={onPhoto}>{name}</L>
      {isGoogle
        ? <> · <L href={credit.mapsUri} quiet={onPhoto}>Google Maps</L></>
        : (credit.license ? <> · {credit.license}</> : null)}
    </>
  );
  if (onPhoto) {
    return (
      <div data-photo-credit style={{ position: "absolute", left: 6, right: 8, bottom: 6, zIndex: 2, margin: 0, padding: 0, border: 0, background: "transparent", pointerEvents: "auto", maxWidth: "calc(100% - 14px)" }}>
        <span style={onPhotoLine}>{body}</span>
      </div>
    );
  }
  // Viewer caption. Layout keys cannot pin this line or put a box behind it.
  const rest = { ...(style || {}) };
  for (const k of ["position", "top", "right", "bottom", "left", "inset", "zIndex", "background", "backgroundColor"]) delete rest[k];
  return (
    <div data-photo-credit style={{ ...rest, position: "static" }}>
      <span style={line}>{body}</span>
    </div>
  );
}
