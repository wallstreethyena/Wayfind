// lib/shareCard.js — THE share card. One layout, every surface (v7.26).
//
// Owner, after seeing three directions rendered at real text-message size:
// "A — The Headline." One sentence set enormous, no photograph, no ornament.
// The card IS the claim. Everything else on it is a bonus at full size, because
// at the size a person actually sees a link preview in iMessage (~258pt wide,
// a 4.6x reduction) the headline is the ONLY thing that survives.
//
// This module is JSX-free ON PURPOSE. app/api/og/_card.jsx holds the markup and
// nothing else; every decision that can be wrong — how big the type is, where
// the line breaks, which words go orange, what the card is even allowed to
// claim — lives here where scripts/check-share-card.mjs can CALL it. A guard
// that greps a route file for "fontSize" proves nothing.
//
// It is also import-safe on the edge: no node APIs, no dependencies.

// ══ REAL FONT METRICS ═══════════════════════════════════════════════════════
// Advance widths read straight out of the Archivo TTFs that ship in
// app/api/og/fonts (scripts/gen-archivo-metrics.mjs regenerates this).
//
// The card this replaces sized headlines from CHARACTER COUNT. In Archivo 900
// "W" is 1.000em and "i" is 0.319em, so a count-based rule treats "Illinois"
// and "WOMBAT" as the same width when one is more than twice the other. That is
// why headlines used to run off the right edge or float in half a card. Fitting
// from measured advances is the whole difference.
const ORDER = "0123456789 !\"#$%&'()*+,-./:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~°’‘“”–—·→éíñúáàöü";
const RAW = {
  600: "575,576,576,576,577,575,576,576,576,575,200,292,444,583,541,966,729,246,357,357,407,636,300,333,300,298,336,336,636,636,636,613,998,709,706,721,728,672,609,794,732,282,585,695,570,844,732,782,670,782,717,667,619,724,671,954,686,677,634,339,298,339,636,507,209,556,592,547,592,561,307,591,584,252,250,543,252,861,584,598,592,592,362,541,314,583,529,758,546,529,509,394,245,394,636,400,280,280,482,482,500,1000,333,1000,561,252,584,583,556,556,598,583",
  700: "595,596,596,596,597,595,596,596,596,595,196,301,456,600,556,973,764,253,364,364,407,641,307,333,307,300,335,335,641,641,641,613,1001,724,722,733,739,683,622,802,754,301,603,725,591,872,754,793,681,793,730,679,641,748,694,964,706,699,653,350,300,350,641,518,228,580,608,573,608,584,325,607,602,267,264,570,267,891,602,613,608,608,380,556,342,601,547,798,572,547,519,393,253,393,641,400,280,280,488,488,500,1000,333,1000,584,267,602,601,580,580,613,601",
  900: "667,667,667,667,667,667,667,667,667,667,180,333,497,660,611,1000,889,278,389,389,407,660,333,333,333,306,333,333,660,660,660,611,1010,778,778,778,778,722,667,833,833,369,667,833,667,972,833,833,722,833,778,722,722,833,778,1000,778,778,722,389,306,389,660,556,297,667,667,667,667,667,389,666,667,319,316,667,319,1000,667,667,667,667,444,611,444,667,611,944,667,611,556,389,282,389,660,400,278,278,508,508,500,1000,333,1000,667,319,667,667,667,667,667,667",
};
const TABLE = {};
for (const w of Object.keys(RAW)) {
  const t = Object.create(null);
  const nums = RAW[w].split(",");
  for (let i = 0; i < ORDER.length; i++) t[ORDER[i]] = Number(nums[i]) / 1000;
  TABLE[w] = t;
}
// An unmapped glyph is assumed WIDE, not average. Guessing narrow is how a
// headline with an em-dash or an accented name silently overflows; guessing
// wide only costs a font size step.
const UNKNOWN = 0.78;

export function charWidth(ch, weight) {
  const t = TABLE[String(weight)] || TABLE["900"];
  const v = t[ch];
  return typeof v === "number" ? v : UNKNOWN;
}

export function textWidth(text, size, weight) {
  const s = String(text == null ? "" : text);
  let em = 0;
  for (const ch of s) em += charWidth(ch, weight == null ? 900 : weight);
  return em * (Number(size) || 0);
}

// ══ GEOMETRY ════════════════════════════════════════════════════════════════
export const CARD = {
  w: 1200, h: 630,
  padX: 64,
  // The headline block is centred in this band so a one-line card and a
  // three-line card both sit optically level. Fixed tops made short headlines
  // hang off the top of the card.
  bandTop: 150, bandBottom: 496,
  maxWidth: 1072, maxLines: 3,
  sizes: [120, 112, 104, 96, 88, 80, 72, 64, 56, 48],
  lead: 0.95,
  ruleY: 520, footY: 556, ctaY: 534,
  footMaxWidth: 620,     // stops short of the CTA; they used to collide
  eyebrowMaxWidth: 430,
  // v8.23 — THE CTA HAD NO WIDTH BUDGET, only a 22-CHARACTER SLICE, and the
  // rail fallback card walked straight into it: "Show me what's worth it" is 23
  // characters, so the pill rendered "SHOW ME WHAT'S WORTH I" — a word cut mid
  // letter, past a green build. That is the same mistake this file's own header
  // is about (sizing by character count is not sizing); it had simply never
  // been applied to the pill.
  //
  // 372px is what is actually free: the pill is right-aligned at right:60, the
  // foot runs to padX + footMaxWidth = 684, and 24px of air between them leaves
  // the pill 432px, of which 60px is its own padding.
  ctaMaxWidth: 372,
};

// ══ TONES ═══════════════════════════════════════════════════════════════════
// One layout, two skins. "ink" is Wayfind — near-black and orange, the card
// every share gets. "blush" is the date invite ONLY, and it exists because that
// card is opened inside a private conversation by someone who has never heard
// of us. A dark product card with an orange CTA reads there as an advert
// interrupting a personal moment; the pastel one reads as the person who sent
// it. Same fitter, same metrics, same guard — a palette, not a second card.
export const TONES = {
  ink: {
    bg: "#06080D", head: "#FFFFFF", accent: "#FF9448", rule: "#F97316",
    foot: "#8B98A9", pill: "rgba(255,255,255,0.07)", pillText: "#D7E0EA",
    pillBorder: "rgba(255,255,255,0.12)", cta: "#F97316", ctaInk: "#0A0A0B",
    glow: "rgba(249,115,22,",
  },
  blush: {
    bg: "linear-gradient(180deg,#EAB9EE 0%,#E1A0E6 46%,#D083D4 100%)",
    head: "#7E2F6E", accent: "#FFFFFF", rule: "#E8479A",
    foot: "#8E5C9E", pill: "rgba(255,255,255,0.42)", pillText: "#7E2F6E",
    pillBorder: "rgba(255,255,255,0.75)", cta: "#E8347F", ctaInk: "#FFFFFF",
    glow: "rgba(255,255,255,",
  },
  // v8.82 — FALL. The owner, 2026-08-27: "these seasonal cards … when we
  // share them, they gotta have some sort of a fall theme through it as well
  // … when we share it as a text message." A fall place already wears the
  // skin in the feed; the link it produces used to arrive in the thread as
  // the ordinary near-black card, so the season stopped at the app boundary.
  //
  // A PALETTE, NOT A THIRD CARD — the same law blush is built on. Same fitter,
  // same metrics, same guard. The palette is lifted off the card skin itself
  // (app/components/css.js: #A8420A ground, #FFE9CB ink, #FFC46E edge) so the
  // thing you share looks like the thing you tapped. Only places in
  // lib/fallSkin.FALL_CARD_IDS get it, and only inside the season — the same
  // two conditions that put the skin on the card, so a link shared in
  // December arrives in the normal ink.
  fall: {
    bg: "linear-gradient(158deg,#6E2E06 0%,#A8420A 48%,#C2540C 100%)",
    head: "#FFF3E2", accent: "#FFC46E", rule: "#FF9448",
    foot: "#EFC79E", pill: "rgba(59,26,5,0.52)", pillText: "#FFE9CB",
    pillBorder: "rgba(255,196,110,0.58)", cta: "#FFB25E", ctaInk: "#3B1A05",
    glow: "rgba(255,178,94,",
  },
};
export function toneFor(name) { return TONES[name] || TONES.ink; }

export function wrapToWidth(text, size, weight, maxWidth) {
  const words = String(text == null ? "" : text).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (cur && textWidth(next, size, weight) > maxWidth) { lines.push(cur); cur = w; }
    else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function ellipsize(text, size, weight, maxWidth) {
  let s = String(text == null ? "" : text);
  if (textWidth(s, size, weight) <= maxWidth) return s;
  while (s.length > 1 && textWidth(s + "…", size, weight) > maxWidth) s = s.slice(0, -1);
  return s.replace(/[\s,;:·—–-]+$/, "") + "…";
}

// Largest size at which the sentence fits the band in at most maxLines.
// Returns fitted:false when even the smallest size overflows, so the caller can
// SEE that the copy is too long instead of shipping a clipped card.
export function layoutHeadline(text, opts) {
  const o = opts || {};
  const maxWidth = o.maxWidth || CARD.maxWidth;
  const maxLines = o.maxLines || CARD.maxLines;
  const weight = o.weight || 900;
  const sizes = o.sizes || CARD.sizes;
  const clean = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  if (!clean) return { lines: [], size: sizes[sizes.length - 1], fitted: true };
  for (const size of sizes) {
    const lines = wrapToWidth(clean, size, weight, maxWidth);
    if (lines.length <= maxLines && lines.every((l) => textWidth(l, size, weight) <= maxWidth)) {
      return { lines, size, fitted: true };
    }
  }
  const size = sizes[sizes.length - 1];
  const lines = wrapToWidth(clean, size, weight, maxWidth).slice(0, maxLines);
  const last = lines.length - 1;
  if (last >= 0) lines[last] = ellipsize(lines[last] + "…", size, weight, maxWidth);
  return { lines: lines.map((l) => ellipsize(l, size, weight, maxWidth)), size, fitted: false };
}

// Which lines go orange. The accent is a PHRASE, and a phrase can straddle a
// break — so this returns every line the phrase touches rather than one index.
// Inline coloured spans inside a flex text node are what made the first draft
// wrap into nonsense; colouring whole lines is both safer and better set.
export function accentLines(lines, accent) {
  const a = String(accent == null ? "" : accent).trim().toLowerCase();
  const ls = (lines || []).map((l) => String(l).toLowerCase());
  if (!a || !ls.length) return [];
  const whole = ls.findIndex((l) => l.includes(a));
  // ONE LINE CANNOT BE THE ACCENT. An accent is a contrast within a headline,
  // so a set covering every line is not an accent — it is a recolour, and on the
  // blush tone it turned "It's a date" entirely white. The rule was already
  // applied to the word-fallback branch below and was missing here.
  if (whole >= 0) return ls.length > 1 ? [whole] : [];
  const words = a.split(/\s+/).filter((w) => w.length >= 2);
  if (!words.length) return [];
  const hit = [];
  ls.forEach((l, i) => { if (words.some((w) => l.includes(w))) hit.push(i); });
  return hit.length === ls.length ? [] : hit; // accenting EVERY line accents nothing
}

// ══ COPY HELPERS ════════════════════════════════════════════════════════════
const str = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max || 120);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

export function eyebrowFrom(parts) {
  const bits = (parts || []).map((p) => str(p, 28)).filter(Boolean).map((p) => p.toUpperCase());
  return ellipsize(bits.join(" · "), 21, 600, CARD.eyebrowMaxWidth);
}
export function footFrom(parts) {
  const bits = (parts || []).map((p) => str(p, 70)).filter(Boolean);
  return ellipsize(bits.join(" · "), 23, 600, CARD.footMaxWidth);
}
/**
 * Fit a CTA to its pill BY MEASURE, dropping whole words before it ever cuts a
 * letter, and never appending an ellipsis — Archivo's Latin subset is the same
 * font that rendered a tofu box for U+2605, and a pill is far too small a place
 * to find out whether it has U+2026.
 *
 * 40 characters remains as a hard backstop because two routes take their CTA
 * from a query string, and an unbounded label must not be able to walk off the
 * plate before the width loop gets to it.
 *
 * check-share-card asserts that no FIRST-PARTY cta is trimmed by this at all:
 * a rail, intent page or experience card whose CTA outgrows the pill should
 * fail the build so the copy gets shortened deliberately, not silently.
 */
export function fitCta(text, maxWidth) {
  const cap = maxWidth || CARD.ctaMaxWidth;
  let out = String(text == null ? "" : text).replace(/\s+/g, " ").trim().slice(0, 40).toUpperCase();
  if (!out) return out;
  if (textWidth(out, 23, 900) <= cap + 0.5) return out;
  const words = out.split(" ");
  while (words.length > 1 && textWidth(words.join(" "), 23, 900) > cap) words.pop();
  out = words.join(" ");
  while (out.length > 1 && textWidth(out, 23, 900) > cap) out = out.slice(0, -1);
  return out.replace(/[\s,;:·—–-]+$/, "");
}

export function ctaFrom(label, fallback) {
  return fitCta(label) || fitCta(fallback) || "OPEN WAYFIND";
}
export function commas(n) {
  const v = num(n);
  return v == null ? "" : String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
export function money(n) {
  const v = num(n);
  if (v == null) return "";
  return "$" + (Number.isInteger(v) ? String(v) : v.toFixed(2));
}

// Assemble the render-ready model. Everything the JSX needs, nothing it decides.
export function buildCard(input) {
  const i = input || {};
  const h = layoutHeadline(i.headline, i.layout);
  const blockH = h.lines.length * h.size * CARD.lead;
  const top = Math.max(CARD.bandTop, Math.round((CARD.bandTop + CARD.bandBottom) / 2 - blockH / 2));
  return {
    eyebrow: i.eyebrow || "",
    lines: h.lines,
    size: h.size,
    top,
    fitted: h.fitted,
    accent: accentLines(h.lines, i.accent),
    foot: i.foot || "",
    cta: ctaFrom(i.cta, i.ctaFallback),
    tone: TONES[i.tone] ? i.tone : "ink",
    // The blush tone signs itself "an invitation" by default. A finished plan
    // is not an invitation any more, so it can say something else or nothing.
    sign: typeof i.sign === "string" ? i.sign : undefined,
  };
}
