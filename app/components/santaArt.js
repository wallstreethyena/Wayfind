// Santa: Wayfind's Christmas guide. Pure presentational artwork, the same
// character as the Christmas 2026 carousel (owner approved, 2026-10-29):
// chubby, big glossy eyes, pink blush, thick purple outline like Boo, red suit,
// green mittens and a candy cane wand with a star.
// face: happy | wink | wow | grin | blink   arm: wave | wand | both | hug | rest
// Separate groups (.s-body .s-head .s-larm .s-rarm .s-pom .s-star) so CSS can
// bob the body, swing the arm and twinkle the star.
import { useId } from "react";

const OL = "#2a1b52";

function Eyes({ face }) {
  const lid = (d, w = 5.5) => <path d={d} stroke={OL} strokeWidth={w} fill="none" strokeLinecap="round" />;
  if (face === "blink") return <>{lid("M80 128 Q92 136 104 128", 5)}{lid("M136 128 Q148 136 160 128", 5)}</>;
  const open = (cx) => (
    <>
      <ellipse cx={cx} cy="126" rx="14" ry="18" fill="#1a1033" />
      <circle cx={cx + 4.5} cy="119" r="5.8" fill="#fff" />
      <circle cx={cx - 4} cy="133" r="2.4" fill="#fff" opacity=".85" />
    </>
  );
  if (face === "grin") return <>{lid("M80 130 Q92 116 104 130")}{lid("M136 130 Q148 116 160 130")}</>;
  if (face === "wink") return <>{open(92)}{lid("M136 128 Q148 118 160 128")}</>;
  return <>{open(92)}{open(148)}</>;
}

function Mouth({ face }) {
  if (face === "wow") {
    return (
      <>
        <ellipse cx="120" cy="170" rx="8" ry="10" fill="#7a1f3d" stroke={OL} strokeWidth="3.5" />
        <ellipse cx="120" cy="174" rx="5" ry="3.5" fill="#ff7a9a" />
      </>
    );
  }
  if (face === "grin" || face === "happy") {
    return (
      <>
        <path d="M106 164 Q120 182 134 164 Z" fill="#7a1f3d" stroke={OL} strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M112 171 Q120 178 128 171" fill="#ff7a9a" />
      </>
    );
  }
  return <path d="M108 166 Q120 178 132 166" stroke={OL} strokeWidth="4.5" fill="none" strokeLinecap="round" />;
}

function Mitt({ cx, cy }) {
  return (
    <>
      <circle cx={cx} cy={cy} r="15" fill="#3fbf7f" stroke={OL} strokeWidth="4" />
      <circle cx={cx - 5} cy={cy - 5} r="4" fill="#fff" opacity=".5" />
    </>
  );
}

function Sleeve({ d }) {
  return (
    <>
      <path d={d} stroke={OL} strokeWidth="26" fill="none" strokeLinecap="round" />
      <path d={d} stroke="#e8343f" strokeWidth="18" fill="none" strokeLinecap="round" />
    </>
  );
}

const BEARD = "M58 140 C46 160 52 186 70 196 C74 214 96 222 108 214 C114 226 126 226 132 214 C144 222 166 214 170 196 C188 186 194 160 182 140 C170 156 150 160 120 160 C90 160 70 156 58 140Z";

export function SantaSvg({ face = "happy", arm = "wave", label, glow = true }) {
  const raw = useId();
  const u = "s" + String(raw).replace(/[^a-zA-Z0-9]/g, "");
  const suit = "url(#suit" + u + ")";
  const skin = "url(#skin" + u + ")";
  const fluff = "url(#fluff" + u + ")";
  const waving = arm === "wave" || arm === "both";
  const wand = arm === "wand" || arm === "both";
  return (
    <svg
      viewBox="0 0 250 330"
      width="100%"
      height="100%"
      data-face={face}
      data-arm={arm}
      role={label ? "img" : "presentation"}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <radialGradient id={"suit" + u} cx="35%" cy="25%" r="85%">
          <stop offset="0" stopColor="#ff6b6b" /><stop offset=".6" stopColor="#e8343f" /><stop offset="1" stopColor="#b81f3a" />
        </radialGradient>
        <radialGradient id={"skin" + u} cx="40%" cy="30%" r="80%">
          <stop offset="0" stopColor="#ffe9dc" /><stop offset="1" stopColor="#ffc9b0" />
        </radialGradient>
        <radialGradient id={"fluff" + u} cx="40%" cy="30%" r="80%">
          <stop offset="0" stopColor="#ffffff" /><stop offset=".75" stopColor="#f3eeff" /><stop offset="1" stopColor="#d8cbff" />
        </radialGradient>
        <filter id={"gl" + u} x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6" /></filter>
        <filter id={"bigl" + u} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16" /></filter>
      </defs>
      {glow ? <ellipse cx="120" cy="190" rx="112" ry="124" fill="#ffd9a8" opacity=".22" filter={"url(#bigl" + u + ")"} /> : null}
      <g className="s-body">
        <ellipse cx="94" cy="300" rx="22" ry="13" fill={OL} /><ellipse cx="146" cy="300" rx="22" ry="13" fill={OL} />
        <ellipse cx="90" cy="296" rx="8" ry="4" fill="#fff" opacity=".35" /><ellipse cx="142" cy="296" rx="8" ry="4" fill="#fff" opacity=".35" />
        <path d="M48 236 C48 198 78 182 120 182 C162 182 192 198 192 236 C192 276 168 298 120 298 C72 298 48 276 48 236Z" fill={suit} stroke={OL} strokeWidth="4.5" />
        <rect x="110" y="196" width="20" height="98" rx="10" fill="#fff" stroke={OL} strokeWidth="3" />
        <path d="M58 270 C70 300 170 300 182 270 C186 290 168 304 120 304 C72 304 54 290 58 270Z" fill="#fff" stroke={OL} strokeWidth="4" />
        <path d="M50 246 C80 256 160 256 190 246 L190 266 C160 276 80 276 50 266Z" fill={OL} />
        <rect x="104" y="246" width="32" height="24" rx="6" fill="#ffd34d" stroke={OL} strokeWidth="3.5" />
        <rect x="113" y="253" width="14" height="10" rx="3" fill={OL} />
      </g>
      <g className="s-larm">
        {waving
          ? <><Sleeve d="M56 222 C36 214 26 196 28 178" /><Mitt cx={28} cy={170} /></>
          : <><Sleeve d="M58 224 C40 236 36 254 44 266" /><Mitt cx={46} cy={272} /></>}
      </g>
      <g className="s-rarm">
        {wand ? (
          <>
            <path d="M206 214 L222 120" stroke={OL} strokeWidth="16" strokeLinecap="round" />
            <path d="M206 214 L222 120" stroke="#fff" strokeWidth="10" strokeLinecap="round" />
            <path d="M206 214 L222 120" stroke="#ff4d5e" strokeWidth="10" strokeLinecap="round" strokeDasharray="7 7" />
            <g className="s-star">
              <circle cx="223" cy="112" r="30" fill="#fff3a8" opacity=".75" filter={"url(#gl" + u + ")"} />
              <path d="M223 86 L231 104 L250 105 L235 117 L240 137 L223 126 L206 137 L211 117 L196 105 L215 104Z" fill="#ffd34d" stroke={OL} strokeWidth="3.5" strokeLinejoin="round" />
            </g>
            <Sleeve d="M184 222 C198 222 206 216 208 206" /><Mitt cx={208} cy={204} />
          </>
        ) : arm === "hug" ? (
          <><Sleeve d="M184 224 C204 214 214 196 212 178" /><Mitt cx={212} cy={170} /></>
        ) : (
          <><Sleeve d="M182 224 C200 236 204 254 196 266" /><Mitt cx={194} cy={272} /></>
        )}
      </g>
      <g className="s-head">
        <ellipse cx="120" cy="128" rx="66" ry="58" fill={skin} stroke={OL} strokeWidth="4.5" />
        <path d={BEARD} fill={fluff} stroke={OL} strokeWidth="4.5" strokeLinejoin="round" />
        <path d="M84 186 q6 6 12 0 M144 186 q6 6 12 0 M114 202 q6 6 12 0" stroke="#cfc4f0" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M120 156 C106 146 86 150 82 162 C94 166 110 164 120 158 C130 164 146 166 158 162 C154 150 134 146 120 156Z" fill="#fff" stroke={OL} strokeWidth="4" strokeLinejoin="round" />
        <Mouth face={face} />
        <Eyes face={face} />
        <path d="M80 102 Q92 94 104 101" stroke="#fff" strokeWidth="7" fill="none" strokeLinecap="round" />
        <path d="M136 101 Q148 94 160 102" stroke="#fff" strokeWidth="7" fill="none" strokeLinecap="round" />
        <ellipse cx="72" cy="146" rx="13" ry="8" fill="#ff9fc4" opacity=".85" /><ellipse cx="168" cy="146" rx="13" ry="8" fill="#ff9fc4" opacity=".85" />
        <circle cx="120" cy="146" r="11" fill="#ff6f7d" stroke={OL} strokeWidth="3.5" /><circle cx="116" cy="142" r="3.4" fill="#fff" opacity=".8" />
        <path d="M58 92 C56 46 92 18 132 22 C168 26 196 50 210 84 C214 96 206 104 198 96 C186 70 170 58 156 56 C170 70 178 84 182 92Z" fill={suit} stroke={OL} strokeWidth="4.5" strokeLinejoin="round" />
        <path d="M80 40 C96 28 116 26 130 28" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" opacity=".45" />
        <g className="s-pom"><circle cx="206" cy="102" r="16" fill={fluff} stroke={OL} strokeWidth="4" /></g>
        <path d="M48 96 C48 80 70 76 120 76 C170 76 192 80 192 96 C192 112 170 112 120 110 C70 112 48 112 48 96Z" fill={fluff} stroke={OL} strokeWidth="4.5" />
        <path d="M62 90 q8 -6 16 0 M98 86 q8 -6 16 0 M134 86 q8 -6 16 0 M168 90 q8 -6 16 0" stroke="#d9cff5" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

// Boo's companion states mapped onto Santa's faces and arms, so the same
// companion logic drives either character. Every key in BooCompanion's POSES
// must appear here (locked by scripts/test-santa-companion.mjs).
export const SANTA_POSES = Object.freeze({
  idle: { face: "happy", arm: "wand" },
  up: { face: "wow", arm: "wand" },
  bow: { face: "grin", arm: "hug" },
  sassy: { face: "wink", arm: "wand" },
  poke: { face: "wow", arm: "wave" },
  orb: { face: "wow", arm: "wand" },
  kids: { face: "grin", arm: "hug" },
  juggle: { face: "wink", arm: "both" },
  cheer: { face: "grin", arm: "both" },
  mega: { face: "wow", arm: "both" },
  peek: { face: "wink", arm: "rest" },
  greet: { face: "happy", arm: "wave" },
  nap: { face: "blink", arm: "rest" },
  talk: { face: "happy", arm: "wave" },
  price: { face: "wink", arm: "wand" },
  bye: { face: "grin", arm: "wave" },
  err: { face: "wow", arm: "rest" },
  panic: { face: "wow", arm: "both" },
  swipe: { face: "wink", arm: "wave" },
  sales: { face: "happy", arm: "wand" },
});

export function santaPose(key) {
  return SANTA_POSES[key] || SANTA_POSES.idle;
}

export default SantaSvg;
