// Boo the ghost: pure presentational artwork shared by the site wide companion.
// Same sticker as the Halloween page (white ghost, sunglasses, pink cheeks, GO
// sign), hype costume only. Faces: wink (the artwork as drawn), shock, grin, plus sleep for the nap antic.
// Shock and grin paint a small patch over the mouth and eye, so the sticker
// still reads as one drawing.
const STICKER = "/images/boo/boo_v1_hype_guide.png";
const FACE = "#F3EDFB";
const INK = "#23143B";

export function BooGhostSvg({ face = "wink", label }) {
  return (
    <svg
      viewBox="0 0 512 512"
      width="100%"
      height="100%"
      data-face={face}
      role={label ? "img" : "presentation"}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      style={{ display: "block", overflow: "visible" }}
    >
      <image href={STICKER} x="0" y="0" width="512" height="512" preserveAspectRatio="xMidYMid meet" />
      {face === "shock" ? (
        <g>
          <ellipse cx="250" cy="268" rx="40" ry="22" fill={FACE} />
          <ellipse cx="251" cy="272" rx="13" ry="17" fill={INK} />
          <path d="M 180 236 L 232 236" stroke={FACE} strokeWidth="26" strokeLinecap="round" />
          <circle cx="206" cy="238" r="12" fill="#fff" stroke={INK} strokeWidth="5" />
          <circle cx="206" cy="240" r="5" fill={INK} />
        </g>
      ) : null}
      {face === "sleep" ? (
        <g>
          <path d="M 180 236 L 232 236" stroke={FACE} strokeWidth="28" strokeLinecap="round" />
          <path d="M 184 236 Q 206 250 228 236" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
          <path d="M 270 236 Q 300 252 326 236" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
          <ellipse cx="250" cy="268" rx="40" ry="22" fill={FACE} />
          <path d="M 232 270 Q 250 282 268 270" fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" />
        </g>
      ) : null}
      {face === "grin" ? (
        <g>
          <ellipse cx="250" cy="268" rx="40" ry="22" fill={FACE} />
          <path d="M 214 260 Q 250 300 286 260 Z" fill={INK} stroke={INK} strokeWidth="5" strokeLinejoin="round" />
          <path d="M 226 268 Q 250 278 274 268 L 272 262 L 228 262 Z" fill="#fff" />
        </g>
      ) : null}
    </svg>
  );
}

export default BooGhostSvg;
