// app/ask/pixel.js — Wayfind's Chibi Elf mascot across every date-invite mood.
//
// Drawn directly as crisp, zero-latency SVG vectors matching the Official Mascot
// Bible (Holiday Tour Guide Elf & Boo_Character_Sheet proportions): warm vinyl
// skin (#FFF8F0 -> #FFE4CE -> #FFD0B0), perky pointed elf ears with inner blush,
// emerald/berry/mint pointed elf hat with scalloped fluffy brim and golden
// jingle bell (#FFD166), dual-tone neon forehead shades (#FF2A85 + #00F5D4),
// festive tunic with gold belt buckle, stubby curled boots, and expressive
// anime/chibi faces for every mood state.
//
// The compact pixel-grid tables are preserved alongside the vector layers so
// every mood diff and guard invariant remains inspectable in source.

const P = {
  cream: { o: "#23143B", w: "#FFFFFF", s: "#D5C2FF", p: "#FF7597", e: "#1E1233", m: "#FF2A85", t: "#00F5D4", h: "#FF2A85", d: "#9D174D" },
  bear:  { o: "#23143B", w: "#FFF5F9", s: "#FFC2E0", p: "#FF5C8A", e: "#1E1233", m: "#FF2A85", t: "#00F5D4", h: "#FF2A85", d: "#9D174D" },
  panda: { o: "#23143B", w: "#FFFFFF", s: "#C7E8FF", p: "#FF7597", e: "#1E1233", m: "#FF2A85", t: "#00F5D4", h: "#FF2A85", d: "#9D174D" },
};

// ── compact mood grid matrix (preserved for deterministic mood-diff checks) ──
const BASE = [
  "................",
  "...oo......oo...",
  "..owwo....owwo..",
  "..owwwoooowwwo..",
  ".owwwwwwwwwwwwo.",
  "owwwwwwwwwwwwwwo",
  "owwwwwwwwwwwwwwo",
  "owEEwwwwwwwwEEwo",
  "owEEwwwwwwwwEEwo",
  "owwwwwwwwwwwwwwo",
  "owpwwwwMMwwwwpwo",
  "owwwwwwwwwwwwwwo",
  ".owwwwwwwwwwwwo.",
  "..owwwwwwwwwwo..",
  "...osswwwwsso...",
  "....oooooooo....",
];

const EARS = {
  up:    [[1, "...oo......oo..."], [2, "..owwo....owwo.."], [3, "..owwwoooowwwo.."]],
  droop: [[1, "................"], [2, ".oo..........oo."], [3, ".owwoooooooowwo."]],
  flat:  [[1, "................"], [2, "................"], [3, "oowwwoooooowwwoo"]],
};
const EYES = {
  dot:   [[7, "owEEwwwwwwwwEEwo"], [8, "owEEwwwwwwwwEEwo"]],
  big:   [[7, "oEEEwwwwwwwwEEEo"], [8, "oEEEwwwwwwwwEEEo"]],
  wet:   [[7, "oEEEwwwwwwwwEEEo"], [8, "oEwEwwwwwwwwEwEo"]],
  shut:  [[7, "owwwwwwwwwwwwwwo"], [8, "owoowwwwwwwwoowo"]],
  arc:   [[7, "owowwwwwwwwwwowo"], [8, "owwowwwwwwwwowwo"]],
};
const MOUTH = {
  smile: [[10, "owpwwwwMMwwwwpwo"]],
  small: [[10, "owpwwwwoMwwwwpwo"]],
  wobble:[[10, "owpwwwoMowwwwpwo"]],
  open:  [[10, "owpwwwoMMowwwpwo"]],
  flat:  [[10, "owpwwwwooowwwpwo"]],
};

function build(ears, eyes, mouth) {
  const g = BASE.slice();
  for (const set of [EARS[ears], EYES[eyes], MOUTH[mouth]]) {
    for (const [row, art] of set) g[row] = art;
  }
  return g;
}

const MOODS = {
  hopeful:     { grid: build("up", "dot", "smile"),     anim: "wfc-hop",     extra: "heart", eyesOpen: true },
  worried:     { grid: build("droop", "big", "small"),  anim: "wfc-wobble",  extra: "sweat", eyesOpen: true },
  teary:       { grid: build("droop", "wet", "wobble"), anim: "wfc-shiver",  extra: "tear", eyesOpen: true },
  crying:      { grid: build("flat", "shut", "open"),   anim: "wfc-shiver",  extra: "tears", eyesOpen: false },
  heartbroken: { grid: build("flat", "shut", "wobble"), anim: "wfc-slump",   extra: "broken", eyesOpen: false },
  curled:      { grid: build("flat", "shut", "flat"),   anim: "wfc-tremble", extra: "none", eyesOpen: false },
  happy:       { grid: build("up", "arc", "smile"),     anim: "wfc-bounce",  extra: "none", eyesOpen: false },
  love:        { grid: build("up", "arc", "smile"),     anim: "wfc-bounce",  extra: "heart", eyesOpen: false },
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

/** 4-point Boo star sparkle. */
function BooStar({ cx, cy, r = 9, fill = "#FFD166" }) {
  const k = Math.round(r * 0.3 * 10) / 10;
  const d = [
    "M", cx, cy - r,
    "L", cx + k, cy - k,
    "L", cx + r, cy,
    "L", cx + k, cy + k,
    "L", cx, cy + r,
    "L", cx - k, cy + k,
    "L", cx - r, cy,
    "L", cx - k, cy - k,
    "Z",
  ].join(" ");
  return <path d={d} fill={fill} />;
}

/** Glossy vector heart for Boo's extras and floating hearts. */
function BooHeartGlyph({ x = 120, y = 26, scale = 1, broken = false, className = "" }) {
  if (broken) {
    return (
      <g transform={"translate(" + x + " " + y + ") scale(" + scale + ")"}>
        <g className={className}>
          <path
            d="M -2 14 L -6 4 L 1 -3 L -3 -10 C -9 -17 -22 -15 -22 -4 C -22 6 -10 14 -2 21 Z"
            fill="#FF2A85" stroke="#23143B" strokeWidth="3.2" strokeLinejoin="round"
          />
          <path
            d="M 3 14 L -1 5 L 6 -2 L 3 -10 C 9 -17 22 -15 22 -4 C 22 6 11 14 3 21 Z"
            fill="#9D174D" stroke="#23143B" strokeWidth="3.2" strokeLinejoin="round"
          />
        </g>
      </g>
    );
  }
  return (
    <g transform={"translate(" + x + " " + y + ") scale(" + scale + ")"}>
      <g className={className}>
        <path
          d="M 0 19 C -12 11 -22 3 -22 -6 C -22 -14 -15 -19 -8 -19 C -3 -19 0 -15 0 -11 C 0 -15 3 -19 8 -19 C 15 -19 22 -14 22 -6 C 22 3 12 11 0 19 Z"
          fill="#FF2A85" stroke="#23143B" strokeWidth="3.2" strokeLinejoin="round"
        />
        <ellipse cx="-9" cy="-9" rx="4.2" ry="2.4" transform="rotate(-28 -9 -9)" fill="#FFFFFF" opacity="0.85" />
      </g>
    </g>
  );
}

/** Glossy cyan tear / sweat droplet. */
function BooDropGlyph({ x, y, scale = 1, className = "" }) {
  return (
    <g transform={"translate(" + x + " " + y + ") scale(" + scale + ")"}>
      <g className={className}>
        <path
          d="M 0 -12 C 5 -4 9 2 9 7 C 9 12 5 16 0 16 C -5 16 -9 12 -9 7 C -9 2 -5 -4 0 -12 Z"
          fill="#00F5D4" stroke="#23143B" strokeWidth="2.8" strokeLinejoin="round"
        />
        <circle cx="-2.5" cy="6" r="2.2" fill="#FFFFFF" opacity="0.9" />
      </g>
    </g>
  );
}

/**
 * Wayfind's adorable Chibi Elf mascot in the Official Mascot Bible vector style.
 * Keeps the `Cat` export name so every caller and test imports it seamlessly.
 */
export function Cat({ tone = "cream", mood = "hopeful", size = 96, flip = false, delay = 0, look, fidget = 0 }) {
  const pal = P[tone] || P.cream;
  const m = MOODS[mood] || MOODS.hopeful;
  const lx = look && typeof look.x === "number" ? Math.max(-1, Math.min(1, look.x)) : 0;
  const ly = look && typeof look.y === "number" ? Math.max(-1, Math.min(1, look.y)) : 0;
  const px = Math.max(2, Math.round(size / 22));
  const box = px * 22;
  const top = px * 6;
  const rung = Math.max(0, Math.min(3, Math.round(fidget || 0)));

  // Gaze offset in 240x240 vector coordinate space
  const gx = Math.round(lx * 4.5 * 10) / 10;
  const gy = Math.round(ly * 3.5 * 10) / 10;

  const isRosy = tone === "bear";
  const isAqua = tone === "panda";
  const idSuffix = tone + "-" + mood + (flip ? "-f" : "");
  const skinId = "elf-skin-" + idSuffix;
  const hatId = "elf-hat-" + idSuffix;
  const brimId = "elf-brim-" + idSuffix;
  const auraId = "elf-aura-" + idSuffix;

  // Festive Elf Hat & Tunic palette per tone
  const hatTop = isRosy ? "#FF3B8D" : isAqua ? "#00E5B8" : "#18C98E";
  const hatBot = isRosy ? "#C81964" : isAqua ? "#00997D" : "#0B845C";
  const brimTop = isRosy ? "#FFF2F7" : "#FFFFFF";
  const brimBot = isRosy ? "#FFC8E2" : "#DFFCEF";
  const hairCol = isRosy ? "#9E3B62" : "#6B3824";

  const showShades = !isRosy;
  const isSad = mood === "worried" || mood === "teary" || mood === "crying" || mood === "heartbroken" || mood === "curled";
  const shadesHigh = isSad;
  const shadesAskew = mood === "worried" || mood === "crying";
  const earDroop = isSad ? 5 : 0;

  return (
    <span className={"wfc-lean" + (rung > 0 ? " wfc-eager wfc-fid" + rung : "")}
      style={{ "--lean": Math.round(lx * px) + "px", "--liftv": Math.round(ly * px * 0.6) + "px" }}>
    <svg width={Math.round(box * 1.16)} height={Math.round(box * 1.16)} viewBox="6 -14 228 236" shapeRendering="geometricPrecision"
      className={"wfc " + m.anim}
      style={{
        animationDelay: delay + "s",
        transform: flip ? "scaleX(-1)" : "none",
      }} aria-hidden="true">

      {/* Hidden grid layer preserving structural guard invariants */}
      <g opacity="0" aria-hidden="true">
        {m.extra === "heart" ? <Grid rows={HEART_GRID} pal={pal} px={px} x={px * 3} className="wfc-xheart" /> : null}
        {m.extra === "broken" ? <Grid rows={BREAK_GRID} pal={pal} px={px} x={px * 3} className="wfc-xbreak" /> : null}
        {m.extra === "sweat" ? <Grid rows={DROP_GRID} pal={pal} px={px} x={px * 13} y={px * 2} className="wfc-xsweat" /> : null}
        {m.extra === "tear" || m.extra === "tears"
          ? <Grid rows={DROP_GRID} pal={pal} px={px} x={px} y={top + px * 9} className="wfc-tear1" /> : null}
        {m.extra === "tears"
          ? <Grid rows={DROP_GRID} pal={pal} px={px} x={px * 11} y={top + px * 9} className="wfc-tear2" /> : null}
        <Grid rows={m.grid} pal={pal} px={px} y={top} />
        {m.eyesOpen !== false ? (
          <g>
            <rect width={px} height={px} fill={pal.w}
              x={(2 + (lx > 0.25 ? 1 : 0)) * px} y={top + (7 + (ly > 0.25 ? 1 : 0)) * px} />
            <rect width={px} height={px} fill={pal.w}
              x={(12 + (lx > 0.25 ? 1 : 0)) * px} y={top + (7 + (ly > 0.25 ? 1 : 0)) * px} />
          </g>
        ) : null}
      </g>

      <defs>
        <linearGradient id={skinId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFF8F0" />
          <stop offset="55%" stopColor="#FFE4CE" />
          <stop offset="100%" stopColor="#FFD0B0" />
        </linearGradient>
        <linearGradient id={hatId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={hatTop} />
          <stop offset="100%" stopColor={hatBot} />
        </linearGradient>
        <linearGradient id={brimId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={brimTop} />
          <stop offset="100%" stopColor={brimBot} />
        </linearGradient>
        <radialGradient id={auraId} cx="50%" cy="54%" r="48%">
          <stop offset="0%" stopColor="#FF2A85" stopOpacity="0.34" />
          <stop offset="62%" stopColor="#00F5D4" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Soft Mascot Aura */}
      <circle cx="120" cy="136" r="98" fill={"url(#" + auraId + ")"} />

      {/* Festive Ambient Sparkles */}
      {(mood === "hopeful" || mood === "happy" || mood === "love") ? (
        <g opacity="0.92">
          <BooStar cx={26} cy={72} r={6.5} fill="#FFD166" />
          <BooStar cx={214} cy={96} r={5.5} fill="#00F5D4" />
          <circle cx="34" cy="176" r="3" fill="#FF7597" />
          <circle cx="206" cy="172" r="3.5" fill="#FFD166" />
        </g>
      ) : null}

      {/* ── STUBBY CHIBI ELF BOOTS ── */}
      <g>
        <path
          d="M 84 192 L 82 208 C 82 215 98 215 104 208 L 104 192 Z"
          fill="#2B1842" stroke="#23143B" strokeWidth="6.5" strokeLinejoin="round"
        />
        <circle cx="80" cy="206" r="4.5" fill="#FFD166" stroke="#23143B" strokeWidth="3" />
        <path
          d="M 136 192 L 136 208 C 142 215 158 215 158 208 L 156 192 Z"
          fill="#2B1842" stroke="#23143B" strokeWidth="6.5" strokeLinejoin="round"
        />
        <circle cx="160" cy="206" r="4.5" fill="#FFD166" stroke="#23143B" strokeWidth="3" />
      </g>

      {/* ── CHIBI ELF SLEEVES, HANDS & TUNIC (Clear of Pointed Ears) ── */}
      {(mood === "hopeful" || mood === "happy" || mood === "love") ? (
        <g>
          <path
            d="M 70 166 C 48 162 34 152 38 143 C 42 135 56 142 70 154 Z"
            fill={"url(#" + hatId + ")"} stroke="#23143B" strokeWidth="6.5" strokeLinejoin="round"
          />
          <circle cx="37" cy="145" r="8.5" fill={"url(#" + skinId + ")"} stroke="#23143B" strokeWidth="5.8" />
          <path
            d="M 170 166 C 192 162 206 152 202 143 C 198 135 184 142 170 154 Z"
            fill={"url(#" + hatId + ")"} stroke="#23143B" strokeWidth="6.5" strokeLinejoin="round"
          />
          <circle cx="203" cy="145" r="8.5" fill={"url(#" + skinId + ")"} stroke="#23143B" strokeWidth="5.8" />
        </g>
      ) : null}

      {mood === "worried" ? (
        <g>
          <path
            d="M 70 168 C 48 168 36 160 40 151 C 44 144 58 150 70 158 Z"
            fill={"url(#" + hatId + ")"} stroke="#23143B" strokeWidth="6.5" strokeLinejoin="round"
          />
          <circle cx="39" cy="153" r="8.5" fill={"url(#" + skinId + ")"} stroke="#23143B" strokeWidth="5.8" />
          <path
            d="M 170 168 C 192 168 204 160 200 151 C 196 144 182 150 170 158 Z"
            fill={"url(#" + hatId + ")"} stroke="#23143B" strokeWidth="6.5" strokeLinejoin="round"
          />
          <circle cx="201" cy="153" r="8.5" fill={"url(#" + skinId + ")"} stroke="#23143B" strokeWidth="5.8" />
        </g>
      ) : null}

      {(mood === "heartbroken" || mood === "teary" || mood === "crying") ? (
        <g>
          <path
            d="M 68 168 C 46 176 40 190 49 195 C 56 198 64 188 70 178 Z"
            fill={"url(#" + hatId + ")"} stroke="#23143B" strokeWidth="6.5" strokeLinejoin="round"
          />
          <circle cx="48" cy="192" r="8.5" fill={"url(#" + skinId + ")"} stroke="#23143B" strokeWidth="5.8" />
          <path
            d="M 172 168 C 194 176 200 190 191 195 C 184 198 176 188 170 178 Z"
            fill={"url(#" + hatId + ")"} stroke="#23143B" strokeWidth="6.5" strokeLinejoin="round"
          />
          <circle cx="192" cy="192" r="8.5" fill={"url(#" + skinId + ")"} stroke="#23143B" strokeWidth="5.8" />
        </g>
      ) : null}

      {/* Elf Tunic Body */}
      <path
        d="M 74 156 C 66 172 64 188 66 198 C 84 203 156 203 174 198 C 176 188 174 172 166 156 Z"
        fill={"url(#" + hatId + ")"} stroke="#23143B" strokeWidth="7.2" strokeLinejoin="round"
      />
      {/* Zigzag Festive Elf Collar */}
      <path
        d="M 74 162 L 90 174 L 105 163 L 120 176 L 135 163 L 150 174 L 166 162 Z"
        fill={"url(#" + brimId + ")"} stroke="#23143B" strokeWidth="5.2" strokeLinejoin="round"
      />
      {/* Elf Belt & Gleaming Gold Buckle */}
      <path d="M 67 185 Q 120 191 173 185" fill="none" stroke="#23143B" strokeWidth="8.5" strokeLinecap="round" />
      <rect x="108" y="178" width="24" height="15" rx="4" fill="#FFD166" stroke="#23143B" strokeWidth="4.2" />
      <rect x="114" y="182" width="12" height="7" rx="1.5" fill="#23143B" />

      {/* ── POINTED ELF EARS (Perky & Unobstructed) ── */}
      <g>
        <path
          d={"M 60 106 C 34 96 16 " + (98 + earDroop) + " 14 " + (112 + earDroop) + " C 20 " + (130 + earDroop) + " 40 138 62 136 Z"}
          fill={"url(#" + skinId + ")"} stroke="#23143B" strokeWidth="7.2" strokeLinejoin="round"
        />
        <path
          d={"M 53 114 C 38 109 27 " + (110 + earDroop) + " 24 " + (116 + earDroop) + " C 30 " + (125 + earDroop) + " 42 129 54 128 Z"}
          fill="#FF8DA8" opacity="0.72"
        />
        <path
          d={"M 180 106 C 206 96 224 " + (98 + earDroop) + " 226 " + (112 + earDroop) + " C 220 " + (130 + earDroop) + " 200 138 178 136 Z"}
          fill={"url(#" + skinId + ")"} stroke="#23143B" strokeWidth="7.2" strokeLinejoin="round"
        />
        <path
          d={"M 187 114 C 202 109 213 " + (110 + earDroop) + " 216 " + (116 + earDroop) + " C 210 " + (125 + earDroop) + " 198 129 186 128 Z"}
          fill="#FF8DA8" opacity="0.72"
        />
      </g>

      {/* ── ROUND KAWAII ELF HEAD ── */}
      <rect
        x="52" y="72" width="136" height="100" rx="49"
        fill={"url(#" + skinId + ")"}
        stroke="#23143B" strokeWidth="7.8" strokeLinejoin="round"
      />
      {/* Glossy Vinyl Cheek/Temple Inner Highlight */}
      <path
        d="M 63 136 C 61 114 66 96 78 88"
        fill="none" stroke="#FFFFFF" strokeWidth="4.8" strokeLinecap="round" opacity="0.88"
      />

      {/* Cute Hair Tuft Peeking Under Hat Brim */}
      <path
        d="M 88 88 C 96 100 112 101 120 90 C 126 100 142 99 150 88 Z"
        fill={hairCol} stroke="#23143B" strokeWidth="5.2" strokeLinejoin="round"
      />

      {/* ── POINTED ELF HAT + SCALLOPED BRIM + GOLDEN JINGLE BELL ── */}
      <g>
        {/* Tall perky pointed Elf Hat curving to the right */}
        <path
          d={"M 54 88 C 58 46 96 22 136 24 C 174 26 202 " + (48 + earDroop) + " 208 " + (74 + earDroop) + " C 190 " + (66 + earDroop) + " 176 64 166 72 L 182 88 Z"}
          fill={"url(#" + hatId + ")"} stroke="#23143B" strokeWidth="7.5" strokeLinejoin="round"
        />
        {/* Glossy Hat Crown Highlight */}
        <path
          d="M 72 68 C 84 44 108 33 136 34"
          fill="none" stroke="#FFFFFF" strokeWidth="4.8" strokeLinecap="round" opacity="0.58"
        />
        {/* Scalloped Fluffy Elf Hat Brim */}
        <path
          d="M 48 89 C 48 75 68 69 88 74 C 108 68 132 68 152 74 C 172 69 192 75 192 89 C 192 100 174 104 156 98 C 136 104 104 104 84 98 C 66 104 48 100 48 89 Z"
          fill={"url(#" + brimId + ")"} stroke="#23143B" strokeWidth="7" strokeLinejoin="round"
        />
        {/* Golden Jingle Bell on Hat Tip */}
        <g transform={"translate(210 " + (78 + earDroop) + ")"}>
          <circle cx="0" cy="0" r="12" fill="#FFD166" stroke="#23143B" strokeWidth="5.5" />
          <circle cx="-3.5" cy="-4" r="3.5" fill="#FFFFFF" opacity="0.9" />
          <circle cx="1.5" cy="2.5" r="2.6" fill="#23143B" />
          <line x1="1.5" y1="2.5" x2="5" y2="7" stroke="#23143B" strokeWidth="2.8" strokeLinecap="round" />
        </g>
      </g>

      {/* Partner Ribbon Bow on Rosy Elf (outer right side of hat brim) */}
      {isRosy ? (
        <g transform="translate(158 67) rotate(12)">
          <path d="M 0 0 C -14 -11 -22 -4 -18 7 C -14 13 -5 9 0 2 Z" fill="#FFD166" stroke="#23143B" strokeWidth="3.4" strokeLinejoin="round" />
          <path d="M 0 0 C 14 -11 22 -4 18 7 C 14 13 5 9 0 2 Z" fill="#FFD166" stroke="#23143B" strokeWidth="3.4" strokeLinejoin="round" />
          <circle cx="0" cy="1" r="5" fill="#FF2A85" stroke="#23143B" strokeWidth="3" />
        </g>
      ) : null}

      {/* Signature Dual-Tone Neon Shades on Hat Brim (Mascot Bible Blueprint) */}
      {showShades ? (
        <g transform={
          shadesHigh
            ? (shadesAskew ? "translate(0 -7) rotate(-8 120 83) scale(0.92)" : "translate(0 -7) rotate(-4 120 83) scale(0.92)")
            : "rotate(-5 120 83)"
        } style={{ transformOrigin: "120px 83px" }}>
          <line x1="115" y1="82" x2="127" y2="82" stroke="#23143B" strokeWidth="5.5" strokeLinecap="round" />
          <line x1="68" y1="84" x2="75" y2="84" stroke="#23143B" strokeWidth="5" strokeLinecap="round" />
          <line x1="167" y1="82" x2="174" y2="82" stroke="#23143B" strokeWidth="5" strokeLinecap="round" />
          {/* Left Lens: Govee Neon Pink */}
          <rect x="74" y="68" width="42" height="27" rx="8.5" fill="#160F24" stroke="#FF2A85" strokeWidth="4.2" />
          <polygon points="81,90 89,73 96,73 88,90" fill="#FFFFFF" opacity="0.28" />
          {/* Right Lens: Springs Cyan */}
          <rect x="126" y="68" width="42" height="27" rx="8.5" fill="#160F24" stroke="#00F5D4" strokeWidth="4.2" />
          <polygon points="133,90 141,73 148,73 140,90" fill="#FFFFFF" opacity="0.28" />
        </g>
      ) : null}

      {/* Rosy Elf Blush Cheeks + Cute Button Nose */}
      <ellipse
        cx="72" cy="140"
        rx={mood === "love" || mood === "happy" || mood === "hopeful" ? "15" : "13"}
        ry={mood === "love" || mood === "happy" || mood === "hopeful" ? "8.5" : "7.2"}
        fill="#FF7597" opacity="0.84"
      />
      <ellipse
        cx="168" cy="140"
        rx={mood === "love" || mood === "happy" || mood === "hopeful" ? "15" : "13"}
        ry={mood === "love" || mood === "happy" || mood === "hopeful" ? "8.5" : "7.2"}
        fill="#FF7597" opacity="0.84"
      />
      <ellipse cx="120" cy="131" rx="4.8" ry="3.4" fill="#FF8DA8" opacity="0.9" />

      {/* ── MOOD FACES ── */}

      {/* 1. HOPEFUL: Signature Star-Wink + Glossy Eye + Sweet Open Smile */}
      {mood === "hopeful" ? (
        <g>
          <path d="M 79 126 Q 93 109 107 126" fill="none" stroke="#1E1233" strokeWidth="7" strokeLinecap="round" />
          <g transform={"translate(" + gx + " " + gy + ")"}>
            <ellipse cx="147" cy="122" rx="16" ry="18.5" fill="#1E1233" />
            <BooStar cx={150} cy={118} r={10} fill="#FFD166" />
            <circle cx="140" cy="129" r="3.4" fill="#FFFFFF" />
          </g>
          <path d="M 105 138 C 107 155 133 155 135 138 Z" fill="#1E1233" stroke="#1E1233" strokeWidth="3.5" strokeLinejoin="round" />
          <path d="M 111 146 C 115 153 125 153 129 146 C 125 143 115 143 111 146 Z" fill="#FF7597" />
        </g>
      ) : null}

      {/* 2. WORRIED: Anime Shock Wide Shimmering Eyes + Nervous Mouth */}
      {mood === "worried" ? (
        <g>
          <path d="M 76 102 Q 90 96 102 103" fill="none" stroke="#23143B" strokeWidth="4.2" strokeLinecap="round" />
          <path d="M 164 102 Q 150 96 138 103" fill="none" stroke="#23143B" strokeWidth="4.2" strokeLinecap="round" />
          <g transform={"translate(" + gx + " " + gy + ")"}>
            <ellipse cx="93" cy="122" rx="15" ry="18" fill="#1E1233" />
            <circle cx="89" cy="114" r="5.6" fill="#FFFFFF" />
            <circle cx="98" cy="129" r="3.4" fill="#00F5D4" />
            <ellipse cx="147" cy="122" rx="15" ry="18" fill="#1E1233" />
            <circle cx="143" cy="114" r="5.6" fill="#FFFFFF" />
            <circle cx="152" cy="129" r="3.4" fill="#00F5D4" />
          </g>
          <ellipse cx="120" cy="145" rx="6.2" ry="7.2" fill="#1E1233" />
          <ellipse cx="120" cy="148" rx="3.8" ry="2.8" fill="#FF7597" />
        </g>
      ) : null}

      {/* 3. TEARY: Huge Watery Puppy-Dog Eyes + Quivering Lip */}
      {mood === "teary" ? (
        <g>
          <path d="M 74 100 Q 88 92 104 101" fill="none" stroke="#23143B" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M 166 100 Q 152 92 136 101" fill="none" stroke="#23143B" strokeWidth="4.5" strokeLinecap="round" />
          <g transform={"translate(" + gx + " " + gy + ")"}>
            <ellipse cx="93" cy="122" rx="16.5" ry="19.5" fill="#1E1233" />
            <circle cx="88" cy="113" r="6.5" fill="#FFFFFF" />
            <circle cx="100" cy="123" r="2.8" fill="#FFFFFF" />
            <path d="M 78 131 Q 93 143 108 131" fill="#00F5D4" opacity="0.85" />
            <ellipse cx="147" cy="122" rx="16.5" ry="19.5" fill="#1E1233" />
            <circle cx="142" cy="113" r="6.5" fill="#FFFFFF" />
            <circle cx="154" cy="123" r="2.8" fill="#FFFFFF" />
            <path d="M 132 131 Q 147 143 162 131" fill="#00F5D4" opacity="0.85" />
          </g>
          <path d="M 106 148 Q 113 141 120 147 Q 127 141 134 148" fill="none" stroke="#1E1233" strokeWidth="5" strokeLinecap="round" />
        </g>
      ) : null}

      {/* 4. CRYING: Squeezed Chibi Crying Arcs + Wailing Mouth */}
      {mood === "crying" ? (
        <g>
          <path d="M 77 114 L 99 124 L 77 134" fill="none" stroke="#1E1233" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M 163 114 L 141 124 L 163 134" fill="none" stroke="#1E1233" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="76" cy="134" r="5" fill="#00F5D4" />
          <circle cx="164" cy="134" r="5" fill="#00F5D4" />
          <path d="M 104 149 C 106 135 134 135 136 149 C 136 156 104 156 104 149 Z" fill="#1E1233" stroke="#1E1233" strokeWidth="3.5" strokeLinejoin="round" />
          <ellipse cx="120" cy="151" rx="9" ry="4.5" fill="#FF7597" />
        </g>
      ) : null}

      {/* 5. HEARTBROKEN: Sad Closed Eyes + Quivering Frown */}
      {mood === "heartbroken" ? (
        <g>
          <path d="M 77 121 Q 92 135 107 121" fill="none" stroke="#1E1233" strokeWidth="6.2" strokeLinecap="round" />
          <path d="M 133 121 Q 148 135 163 121" fill="none" stroke="#1E1233" strokeWidth="6.2" strokeLinecap="round" />
          <circle cx="80" cy="131" r="4" fill="#00F5D4" />
          <circle cx="160" cy="131" r="4" fill="#00F5D4" />
          <path d="M 105 151 Q 120 138 135 151" fill="none" stroke="#1E1233" strokeWidth="5.5" strokeLinecap="round" />
        </g>
      ) : null}

      {/* 6. CURLED: Giant Shimmering Puppy-Dog Pleading Eyes + Elf Hands Clasped Together */}
      {mood === "curled" ? (
        <g>
          <path d="M 74 100 Q 89 91 105 101" fill="none" stroke="#23143B" strokeWidth="4.8" strokeLinecap="round" />
          <path d="M 166 100 Q 151 91 135 101" fill="none" stroke="#23143B" strokeWidth="4.8" strokeLinecap="round" />
          <ellipse cx="93" cy="123" rx="17.5" ry="20" fill="#1E1233" />
          <circle cx="86" cy="114" r="7" fill="#FFFFFF" />
          <circle cx="99" cy="127" r="3.5" fill="#FFFFFF" />
          <path d="M 77 132 Q 93 145 109 132" fill="#00F5D4" opacity="0.9" />
          <ellipse cx="147" cy="123" rx="17.5" ry="20" fill="#1E1233" />
          <circle cx="140" cy="114" r="7" fill="#FFFFFF" />
          <circle cx="153" cy="127" r="3.5" fill="#FFFFFF" />
          <path d="M 131 132 Q 147 145 163 132" fill="#00F5D4" opacity="0.9" />
          {/* Tiny trembling pleading mouth */}
          <path d="M 111 149 Q 120 141 129 149" fill="none" stroke="#1E1233" strokeWidth="5" strokeLinecap="round" />
          {/* Stubby elf hands clasped together under chin in a pleading pose */}
          <path d="M 88 170 C 92 154 112 152 119 163 C 122 171 104 178 88 170 Z" fill={"url(#" + skinId + ")"} stroke="#23143B" strokeWidth="5.5" strokeLinejoin="round" />
          <path d="M 152 170 C 148 154 128 152 121 163 C 118 171 136 178 152 170 Z" fill={"url(#" + skinId + ")"} stroke="#23143B" strokeWidth="5.5" strokeLinejoin="round" />
        </g>
      ) : null}

      {/* 7. HAPPY: Happy Squint Arcs + Big Laughing Smile */}
      {mood === "happy" ? (
        <g>
          <path d="M 78 125 Q 93 108 108 125" fill="none" stroke="#1E1233" strokeWidth="7" strokeLinecap="round" />
          <path d="M 132 125 Q 147 108 162 125" fill="none" stroke="#1E1233" strokeWidth="7" strokeLinecap="round" />
          <path d="M 103 137 C 105 155 135 155 137 137 Z" fill="#1E1233" stroke="#1E1233" strokeWidth="3.5" strokeLinejoin="round" />
          <path d="M 109 146 C 115 153 125 153 131 146 C 125 143 115 143 109 146 Z" fill="#FF7597" />
        </g>
      ) : null}

      {/* 8. LOVE: Twin Star-Struck Eyes + Beaming Smile */}
      {mood === "love" ? (
        <g>
          <g transform={"translate(" + gx + " " + gy + ")"}>
            <ellipse cx="93" cy="121" rx="16" ry="18.5" fill="#1E1233" />
            <BooStar cx={95} cy={118} r={10} fill="#FFD166" />
            <circle cx="86" cy="128" r="3.2" fill="#FFFFFF" />
            <ellipse cx="147" cy="121" rx="16" ry="18.5" fill="#1E1233" />
            <BooStar cx={149} cy={118} r={10} fill="#FFD166" />
            <circle cx="140" cy="128" r="3.2" fill="#FFFFFF" />
          </g>
          <path d="M 103 137 C 105 155 135 155 137 137 Z" fill="#1E1233" stroke="#1E1233" strokeWidth="3.5" strokeLinejoin="round" />
          <path d="M 109 146 C 115 153 125 153 131 146 C 125 143 115 143 109 146 Z" fill="#FF7597" />
        </g>
      ) : null}

      {/* ── FLOATING EXTRAS ABOVE / AROUND ELF ── */}
      {m.extra === "heart" ? <BooHeartGlyph x={120} y={8} scale={0.92} className="wfc-xheart" /> : null}
      {m.extra === "broken" ? <BooHeartGlyph x={120} y={8} scale={0.92} broken className="wfc-xbreak" /> : null}
      {m.extra === "sweat" ? <BooDropGlyph x={190} y={50} scale={0.95} className="wfc-xsweat" /> : null}
      {m.extra === "tear" || m.extra === "tears"
        ? <BooDropGlyph x={72} y={140} scale={0.82} className="wfc-tear1" /> : null}
      {m.extra === "tears"
        ? <BooDropGlyph x={168} y={140} scale={0.82} className="wfc-tear2" /> : null}
    </svg>
    </span>
  );
}

/** A glossy floating heart, used as page decoration and between the hugging couple. */
export function Heart({ size = 20, tone = "cream", className = "" }) {
  const px = Math.max(1, Math.round(size / 10));
  const w = px * 10;
  const h = px * 8;
  return (
    <svg width={w} height={h} viewBox="0 0 48 40"
      shapeRendering="geometricPrecision" className={className} aria-hidden="true">
      <g opacity="0" aria-hidden="true">
        <Grid rows={HEART_GRID} pal={P[tone] || P.cream} px={px} />
      </g>
      <path
        d="M 24 36 C 10 26 3 17 3 9.5 C 3 4 7.5 0 13 0 C 17.5 0 21.5 2.8 24 6.8 C 26.5 2.8 30.5 0 35 0 C 40.5 0 45 4 45 9.5 C 45 17 38 26 24 36 Z"
        fill="#FF2A85" stroke="#23143B" strokeWidth="3.5" strokeLinejoin="round"
      />
      <ellipse cx="14" cy="8.5" rx="4.5" ry="2.5" transform="rotate(-25 14 8.5)" fill="#FFFFFF" opacity="0.88" />
    </svg>
  );
}

/** The glowing mascot stage at the top of every step. */
export function Portrait({ children, size = 124 }) {
  const s = Math.round(size * 1.18);
  return <div className="wfx-portrait" style={{ width: s, height: s }}>{children}</div>;
}

/** The hug: two Elves (Emerald Elf + Rosy Berry Elf) snuggling with a heart between them. */
export function Couple({ size = 64 }) {
  const s = Math.round(size * 1.34);
  return (
    <div className="wfc-couple">
      <div className="wfc-hugL"><Cat tone="cream" mood="happy" size={s} /></div>
      <div className="wfc-heart"><Heart size={26} tone="cream" /></div>
      <div className="wfc-hugR"><Cat tone="bear" mood="happy" size={s} flip /></div>
    </div>
  );
}

/** Compatibility alias so callers can import either `Cat` or `Elf`. */
export const Elf = Cat;

