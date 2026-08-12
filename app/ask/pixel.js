// app/ask/pixel.js — the cast, drawn pixel by pixel (v7.27).
//
// Owner: "I don't want to use any AI generated image, it looks fake." So none of
// this is generated. Every character is a hand-authored grid — you can read the
// drawing in the source, change one pixel, and see exactly what changed. That is
// the opposite of an asset nobody can edit.
//
// Owner: "the little character gets sadder and sadder and does something unique
// every time the user says no." Six rungs, each a different GRID with its own
// motion: ears drop, then a tear, then it curls up. The last rung holds — a
// character that escalates forever stops being sweet and starts being
// manipulative, and the No button stays pressable the whole way down.
//
// THESE ARE ORIGINAL CHARACTERS. The reference is a Valentine's page built with
// Mochi Peach Cat and Bubu-Dudu art — copyrighted, merchandised characters.
// Tracing them onto a page Wayfind texts to strangers is how the whole feature
// gets pulled. The genre — round pastel cat, dot eyes, blush, no nose — is
// nobody's to own, so the cast is drawn from scratch inside it.
//
// Read a grid like a picture. Each character is one pixel:
//   .  transparent   o  outline   w  body   s  shade   p  blush
//   e  eye           m  mouth     t  tear/sweat        h  heart   d  dark heart

const P = {
  cream: { o: "#4A3A46", w: "#FFFFFF", s: "#E8DCE6", p: "#F79AC0", e: "#3A2A38", m: "#C97BA0", t: "#7FD0F0", h: "#F0407E", d: "#B82A5E" },
  bear:  { o: "#4A3226", w: "#B98363", s: "#A06E52", p: "#E8899E", e: "#33221A", m: "#7A4E38", t: "#7FD0F0", h: "#F0407E", d: "#B82A5E" },
  panda: { o: "#4A3A46", w: "#FFFFFF", s: "#EADEE8", p: "#F79AC0", e: "#2A1E28", m: "#C97BA0", t: "#7FD0F0", h: "#F0407E", d: "#B82A5E" },
};

// ── the base cat: big head, small body, two paws, sitting ──────────────────
const BASE = [
  "................",
  "..oo........oo..",
  ".owwo......owwo.",
  ".owwwoooooowwwo.",
  ".owwwwwwwwwwwwo.",
  ".owwwwwwwwwwwwo.",
  ".owEEwwwwwwEEwo.",
  ".owEEwwwwwwEEwo.",
  ".owwwwwwwwwwwwo.",
  ".owpwwwMMwwwpwo.",
  ".owwwwwwwwwwwwo.",
  "..owwwwwwwwwwo..",
  "...owwwwwwwwo...",
  "..oswwwwwwwwso..",
  "..osswoooowsso..",
  "...oooo..oooo...",
];

// A rung is the base with rows swapped in. Writing them as PATCHES rather than
// six full grids means a change to the body shape reaches every mood, and the
// diff between two moods is exactly the difference you can see.
const EARS = {
  up:    [[1, "..oo........oo.."], [2, ".owwo......owwo."], [3, ".owwwoooooowwwo."]],
  droop: [[1, "................"], [2, "oo............oo"], [3, ".owwoooooooowwo."]],
  flat:  [[1, "................"], [2, "................"], [3, "ooowwoooooowwooo"]],
};
const EYES = {
  dot:   [[6, ".owEEwwwwwwEEwo."], [7, ".owEEwwwwwwEEwo."]],
  big:   [[6, ".oEEEwwwwwwEEEo."], [7, ".oEEEwwwwwwEEEo."]],
  wet:   [[6, ".oEEEwwwwwwEEEo."], [7, ".oEwEwwwwwwEwEo."]],
  shut:  [[6, ".owwwwwwwwwwwwo."], [7, ".owoowwwwwwoowo."]],
  arc:   [[6, ".owowwwwwwwwowo."], [7, ".owwowwwwwwowwo."]],
};
const MOUTH = {
  smile: [[9, ".owpwwwMMwwwpwo."]],
  small: [[9, ".owpwwwoMwwwpwo."]],
  wobble:[[9, ".owpwwoMowwwpwo."]],
  open:  [[9, ".owpwwoMMowwpwo."]],
  flat:  [[9, ".owpwwwooowwpwo."]],
};

function build(ears, eyes, mouth) {
  const g = BASE.slice();
  for (const set of [EARS[ears], EYES[eyes], MOUTH[mouth]]) {
    for (const [row, art] of set) g[row] = art;
  }
  return g;
}

// mood -> drawing + motion + the thing floating above it.
const MOODS = {
  hopeful:     { grid: build("up", "dot", "smile"),     anim: "wfc-hop",     extra: "heart" },
  worried:     { grid: build("droop", "big", "small"),  anim: "wfc-wobble",  extra: "sweat" },
  teary:       { grid: build("droop", "wet", "wobble"), anim: "wfc-shiver",  extra: "tear" },
  crying:      { grid: build("flat", "shut", "open"),   anim: "wfc-shiver",  extra: "tears" },
  heartbroken: { grid: build("flat", "shut", "wobble"), anim: "wfc-slump",   extra: "broken" },
  curled:      { grid: build("flat", "shut", "flat"),   anim: "wfc-tremble", extra: "none" },
  happy:       { grid: build("up", "arc", "smile"),     anim: "wfc-bounce",  extra: "none" },
  love:        { grid: build("up", "arc", "smile"),     anim: "wfc-bounce",  extra: "heart" },
};
export const MOOD_KEYS = Object.keys(MOODS);

const HEART_GRID = [
  "..hh..hh..",
  ".hhhhhhhh.",
  ".hhhhhhhh.",
  "..hhhhhh..",
  "...hhhh...",
  "....hh....",
];
const BREAK_GRID = [
  "..hh..dd..",
  ".hhh..ddd.",
  ".hhhh.ddd.",
  "..hhh.dd..",
  "...hh.d...",
  "....h.....",
];
const DROP_GRID = ["..t..", ".ttt.", "ttttt", ".ttt."];

/** Paint a grid as SVG rects, one rect per horizontal run of the same colour. */
function Grid({ rows, pal, px, x = 0, y = 0, className, style }) {
  const out = [];
  rows.forEach((row, ry) => {
    let cx = 0;
    while (cx < row.length) {
      const ch = row[cx];
      const key = ch === "E" ? "e" : ch === "M" ? "m" : ch;
      if (ch === "." || !pal[key]) { cx++; continue; }
      let run = 1;
      while (cx + run < row.length && row[cx + run] === ch) run++;
      out.push(<rect key={ry + ":" + cx} x={x + cx * px} y={y + ry * px} width={run * px} height={px} fill={pal[key]} />);
      cx += run;
    }
  });
  return <g className={className} style={style}>{out}</g>;
}

/** One cat. `mood` selects the drawing AND the motion. */
export function Cat({ tone = "cream", mood = "hopeful", size = 96, flip = false, delay = 0 }) {
  const pal = P[tone] || P.cream;
  const m = MOODS[mood] || MOODS.hopeful;
  // A WHOLE number of pixels per cell. size/22 gave a fractional cell, and the
  // browser then antialiased every rect edge — the cat rendered with scan lines
  // through it. crispEdges finishes the job: no smoothing on a pixel grid.
  const px = Math.max(2, Math.round(size / 22));
  const box = px * 22;
  const top = px * 6;                          // the cat sits below the floating extra
  return (
    <svg width={box} height={box} viewBox={"0 0 " + box + " " + box} shapeRendering="crispEdges"
      className={"wfc " + m.anim}
      style={{ animationDelay: delay + "s", transform: flip ? "scaleX(-1)" : "none" }} aria-hidden="true">
      {m.extra === "heart" ? <Grid rows={HEART_GRID} pal={pal} px={px} x={px * 3} className="wfc-xheart" /> : null}
      {m.extra === "broken" ? <Grid rows={BREAK_GRID} pal={pal} px={px} x={px * 3} className="wfc-xbreak" /> : null}
      {m.extra === "sweat" ? <Grid rows={DROP_GRID} pal={pal} px={px} x={px * 13} y={px * 2} className="wfc-xsweat" /> : null}
      {m.extra === "tear" || m.extra === "tears"
        ? <Grid rows={DROP_GRID} pal={pal} px={px} x={px * 2} y={top + px * 8} className="wfc-tear1" /> : null}
      {m.extra === "tears"
        ? <Grid rows={DROP_GRID} pal={pal} px={px} x={px * 12} y={top + px * 8} className="wfc-tear2" /> : null}
      <Grid rows={m.grid} pal={pal} px={px} y={top} />
    </svg>
  );
}

/** A floating heart, used as page decoration. */
export function Heart({ size = 20, tone = "cream", className = "" }) {
  const px = Math.max(1, Math.round(size / 10));
  return (
    <svg width={px * 10} height={px * 6} viewBox={"0 0 " + px * 10 + " " + px * 6}
      shapeRendering="crispEdges" className={className} aria-hidden="true">
      <Grid rows={HEART_GRID} pal={P[tone] || P.cream} px={px} />
    </svg>
  );
}

/** The framed portrait at the top of every step. */
export function Portrait({ children, size = 124 }) {
  return <div className="wfx-portrait" style={{ width: size, height: size }}>{children}</div>;
}

/** The hug: a bear and a panda leaning into each other, heart between them. */
export function Couple({ size = 64 }) {
  return (
    <div className="wfc-couple">
      <div className="wfc-hugL"><Cat tone="bear" mood="happy" size={size} /></div>
      <div className="wfc-heart"><Heart size={16} tone="cream" /></div>
      <div className="wfc-hugR"><Cat tone="panda" mood="happy" size={size} flip /></div>
    </div>
  );
}
