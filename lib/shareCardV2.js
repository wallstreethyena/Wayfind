// lib/shareCardV2.js — the Share Card v2 system, as pure data + pure functions.
//
// THE SPLIT THAT MAKES THIS ONE ROUTE (owner, 2026-07-31): "Pages supply DATA,
// never layout. No page defines its own OG design. Adding a new intent page must
// never require new OG design work. If it does, you built it wrong."
//
// So every constant, every measurement and every decision lives here, where it
// can be imported by a guard and CALLED. app/api/og/route.js contains only JSX
// that reads from this file. Nothing in here imports React, next/og, or touches
// the network — that is what lets the guards assert the layout without rendering.
//
// MERGED STANDARD. docs/share-card-standard.md and the v2 spec conflicted on
// three rules; the owner ruled on each (2026-08-01):
//   rule 3 (gold CTA)      DOC WINS  — reinstated, bottom-right, #E8C97A
//   rule 4 (brand row)     v2 WINS   — logo top-left (56,40), no baked band
//   rule 5 ("nothing else") v2 WINS  — pick cards + footer deal count are the point
//   rule 1 (#040810)       v2 WINS   — #05070E scrim / #070A12 panel
// docs/share-card-standard.md has been rewritten to this merged standard. There
// is ONE standard on disk. Do not add a second.

export const CARD = { w: 1200, h: 630 };

export const COLOR = {
  scrim: "#05070E",       // the global vertical scrim base
  panel: "#070A12",       // what the glass panel blends 80% toward
  accent: "#FF7A32",      // deal count, deal rule
  cta: "#E8C97A",         // THE gold CTA pill — doc rule 3, owner-conceded
  ctaInk: "#0B0B0C",
  headline: "#FFFFFF",
  subline: "#CBD3E6",
  rank: "#929DB6",
  meta: "#9AA4BC",
  score: "#5EE8B4",
  footMuted: "rgba(203,211,230,0.62)",
};

// ── Geometry ────────────────────────────────────────────────────────────────
// Every number the spec fixes. Named so a guard can assert them by value rather
// than by scraping magic numbers out of JSX.
export const GEO = {
  logo: { x: 56, y: 40, h: 34, w: 146 }, // 640x149 source => 34px tall is 146 wide
  pill: { y: 40, right: 56, fontSize: 18, padX: 18, padY: 10 },
  headline: { y: 232, size: 62, minSize: 40, step: 2, maxWidth: 1088 },
  subline: { y: 318, size: 24 },
  panel: { top: 384, bottom: 630, blur: 22, blend: 0.8, hairline: 0.18 },
  picks: { w: 352, h: 150, gap: 20, radius: 22, y: 402, fill: 0.066, border: 0.15 },
  footer: { y: 588 },
};

// Three 352-wide cards with two 20px gaps = 1096; centred in 1200 leaves 52.
export const PICK_X = [52, 52 + 372, 52 + 744];

// ── VERTICAL FOCUS — REQUIRED, NEVER DEFAULTED ──────────────────────────────
// The v1 card put the hero art in a 1200x352 band (3.4:1) and decapitated every
// subject. v2 renders the photo full-bleed, which only works if we know WHERE in
// the frame the subject sits.
//
// A hardcoded 0.5 is exactly what produced the cut-off look, so there is NO
// DEFAULT. focusFor() returns null for an unregistered image and the caller must
// fall back to a photo-less card rather than guess and crop a face off.
// 0 = top of the frame, 1 = bottom.
//
// REGISTERED ART ONLY. An earlier draft of this file listed "/cards/swing-ride.jpg"
// and "/cards/fireworks.jpg" — neither exists in public/. They were invented from
// the prose describing the focus values, which is precisely the fabrication this
// registry is supposed to prevent. Every path below was verified present on disk;
// anything unverified is deliberately ABSENT, so it renders photo-less and visibly
// asks to be registered rather than silently cropping a subject's head off.
export const VERTICAL_FOCUS = {
  // Owner-specified: 0.30 for the coaster. The only one of the three named
  // subjects that exists as a file today.
  "/brand/orlando-roller-coaster-portrait.jpg": 0.30,
};

export function focusFor(art) {
  if (!art) return null;
  const key = String(art);
  return Object.prototype.hasOwnProperty.call(VERTICAL_FOCUS, key) ? VERTICAL_FOCUS[key] : null;
}

// Satori honours object-position on a cover-fit image. Horizontal is always
// centred (0.5); vertical is the registered focus.
export function objectPosition(focus) {
  // null/undefined must NOT coerce. Number(null) === 0 is finite, so an earlier
  // version returned "50% 0%" for an unregistered image — silently pinning the
  // crop to the TOP of the frame, which is the same class of silent-wrong-crop
  // this registry exists to prevent. Caught by the guard, not by reading it.
  if (focus === null || focus === undefined || focus === "") return null;
  const f = Number(focus);
  if (!Number.isFinite(f)) return null;
  return `50% ${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`;
}

// ── The scrim ───────────────────────────────────────────────────────────────
// Multi-stop, over #05070E. The dip at 28% keeps the photo alive; the 52->62%
// ramp is what makes the headline legible over ANY image, which is the whole
// requirement — legibility cannot depend on which photo landed there.
export const SCRIM_STOPS = [
  [0, 0.34], [28, 0.24], [52, 0.55], [62, 0.90], [100, 0.96],
];
export function scrimGradient() {
  const rgb = "5,7,14"; // #05070E
  return "linear-gradient(180deg," + SCRIM_STOPS.map(([p, a]) => `rgba(${rgb},${a}) ${p}%`).join(",") + ")";
}

// ── Headline fitting ────────────────────────────────────────────────────────
// Satori exposes no text-measurement API, so this ESTIMATES advance width and
// steps down 62 -> 40 in 2px increments until it fits 1088px on one line.
//
// The estimate is deliberately conservative (it over-estimates slightly) because
// the failure modes are asymmetric: a headline 3% smaller than it could be is
// invisible, a headline that overflows 1088px is a broken card. K is the mean
// advance as a fraction of font size for a bold humanist sans across mixed-case
// English; wide caps and narrow punctuation are corrected per character class.
const NARROW = new Set([..."iljftIrt.,:;'\"!|()[]{} "]);
const WIDE = new Set([..."MWmw@%"]);
export function estimateTextWidth(text, size) {
  let units = 0;
  for (const ch of String(text || "")) {
    if (NARROW.has(ch)) units += 0.30;
    else if (WIDE.has(ch)) units += 0.92;
    else if (ch >= "A" && ch <= "Z") units += 0.68;
    else units += 0.55;
  }
  return units * size;
}

/**
 * The size the headline renders at, and whether it still had to be truncated.
 * Never returns a size below GEO.headline.minSize — past that the card stops
 * looking like a headline, so we ellipsise instead of shrinking into noise.
 */
export function fitHeadline(text, maxWidth = GEO.headline.maxWidth) {
  const t = String(text || "").trim();
  const { size: start, minSize, step } = GEO.headline;
  for (let s = start; s >= minSize; s -= step) {
    if (estimateTextWidth(t, s) <= maxWidth) return { size: s, text: t, truncated: false };
  }
  // Still too wide at the floor: cut to what fits and ellipsise.
  let cut = t;
  while (cut.length > 8 && estimateTextWidth(cut + "…", minSize) > maxWidth) cut = cut.slice(0, -1);
  return { size: minSize, text: cut.trimEnd() + "…", truncated: true };
}

// Pick-card name ellipsis at cardWidth - 44, per spec.
export function fitPickName(name, size = 27, maxWidth = GEO.picks.w - 44) {
  let t = String(name || "").trim();
  if (estimateTextWidth(t, size) <= maxWidth) return t;
  while (t.length > 4 && estimateTextWidth(t + "…", size) > maxWidth) t = t.slice(0, -1);
  return t.trimEnd() + "…";
}

// ── Hard rules ──────────────────────────────────────────────────────────────
// "Never render fewer than 3 picks — fall back to headline+photo, never ship
// empty slots." A card with two cards and a hole reads as broken software; a
// card with none reads as a designed poster.
export const MIN_PICKS = 3;
export function picksToRender(picks) {
  const list = (Array.isArray(picks) ? picks : []).filter((p) => p && p.name);
  return list.length >= MIN_PICKS ? list.slice(0, 3) : [];
}

// "Never render '0 local deals' — omit the right footer entirely at zero."
export function dealLabel(n) {
  const c = Number(n);
  if (!Number.isFinite(c) || c <= 0) return null;
  return c === 1 ? "1 local deal" : `${c} local deals`;
}

// The context pill. nowContext supplies bucket + city + weather; this only
// formats. Returns null when there is nothing true to say — an empty pill is
// worse than none.
export function contextPill(ctx, city) {
  if (!ctx) return null;
  const parts = [];
  parts.push(ctx.timeBucket === "night" ? "TONIGHT" : ctx.timeBucket === "morning" ? "THIS MORNING" : "TODAY");
  if (city) parts.push(String(city).toUpperCase().slice(0, 22));
  const w = ctx.weather || {};
  if (w.known && w.tempF != null) parts.push(`${Math.round(w.tempF)}°`);
  if (w.known && ctx.outdoorOK === false) parts.push("INDOORS");
  return parts.length > 1 ? parts.join(" · ") : null;
}

// s-maxage must never outlive the list the card describes, or the preview shows
// picks the page no longer ranks — the card is a promise.
export function cacheControl(revalidateSeconds) {
  const s = Number.isFinite(Number(revalidateSeconds)) ? Math.max(60, Math.min(86400, Number(revalidateSeconds))) : 600;
  return `public, max-age=0, s-maxage=${s}, stale-while-revalidate=${s}`;
}
