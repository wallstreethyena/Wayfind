// Visible credit for a photo from /api/photo?fmt=json (Google, permitted, licensed).
// Google: "Photo: <author> · Google Maps". Licensed/permitted: "Photo: <name> · <license>".

const pill = {
  display: "inline-block", maxWidth: "100%", padding: "3px 9px", borderRadius: 999,
  background: "rgba(13,17,23,.72)", color: "#fff", fontSize: 11.5, fontWeight: 600, lineHeight: 1.45,
  border: "1px solid rgba(255,255,255,.16)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
const link = { color: "#fff", textDecoration: "underline", textUnderlineOffset: 2 };

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
  return (
    <div data-photo-credit style={{ position: "absolute", left: 10, bottom: 10, right: 10, zIndex: 7, pointerEvents: "auto", ...style }}>
      <span style={pill}>
        Photo: <L href={credit.uri}>{name}</L>
        {isGoogle
          ? <> · <L href={credit.mapsUri}>Google Maps</L></>
          : (credit.license ? <> · {credit.license}</> : null)}
      </span>
    </div>
  );
}
