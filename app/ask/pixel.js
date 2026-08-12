// app/ask/pixel.js — the cast (v7.27).
//
// Owner: "I need the characters to be super cute, and have them do cute things —
// hug one another, or the little character gets sadder and sadder and does
// something unique every time the user says no."
//
// So the cat is not one drawing with a scale on it. Every No moves it one rung
// down a mood ladder, and each rung is a DIFFERENT drawing with its own motion:
// ears drop, then a tear, then it curls up. Six rungs, and the last one holds —
// a character that keeps escalating forever stops being sweet and starts being
// manipulative, and the No button stays pressable the whole way down.
//
// THESE ARE ORIGINAL DRAWINGS IN THAT STYLE, not the reference characters. The
// board he sent is a Google Images page of Mochi Peach Cat, Bugcat Capoo and
// friends — every one of them somebody's copyrighted property, most of them
// merchandised. Tracing one onto a page Wayfind texts to strangers is how a
// feature gets taken down. The genre — round pastel cat, dot eyes, blush, no
// nose — is nobody's to own, so the cast is drawn from scratch inside it. If he
// wants those exact characters they are licensable, and that is a conversation
// with the rights holder rather than a thing to copy.
//
// Vector, not sprites: a few hundred bytes, sharp at any size, and every part
// separately animatable — which is what "moves very fast" actually needs.

const INK = "#5C4A46";

export const FUR = {
  cream: { body: "#FFFFFF", shade: "#F0E6E2", ear: "#F7C9D8", blush: "#F9A8C0" },
  grey:  { body: "#A9A19E", shade: "#948B88", ear: "#E2A8B8", blush: "#E58FA8" },
  peach: { body: "#F6D9C6", shade: "#EBC4AC", ear: "#F2A9B8", blush: "#F08FA8" },
};

// mood -> how it is drawn and how it moves. The animation class is per mood so
// each rung has its OWN rhythm: hopeful hops, worried wobbles, crying trembles.
const MOODS = {
  hopeful:     { anim: "wfc-hop",    ears: "up",    eyes: "dot",    mouth: "smile",  extra: "heart" },
  worried:     { anim: "wfc-wobble", ears: "droop", eyes: "big",    mouth: "small",  extra: "sweat" },
  teary:       { anim: "wfc-shiver", ears: "droop", eyes: "wet",    mouth: "wobble", extra: "tear" },
  crying:      { anim: "wfc-shiver", ears: "flat",  eyes: "shut",   mouth: "open",   extra: "tears" },
  heartbroken: { anim: "wfc-slump",  ears: "flat",  eyes: "shut",   mouth: "wobble", extra: "broken" },
  curled:      { anim: "wfc-tremble", ears: "flat", eyes: "shut",   mouth: "flat",   extra: "none" },
  happy:       { anim: "wfc-bounce", ears: "up",    eyes: "arc",    mouth: "smile",  extra: "none" },
  love:        { anim: "wfc-bounce", ears: "up",    eyes: "arc",    mouth: "smile",  extra: "heart" },
};
export const MOOD_NAMES = Object.keys(MOODS);

function Ears({ kind, f }) {
  if (kind === "droop") {
    return (
      <g className="wfc-ears">
        <path d="M22 34 L10 20 L36 24 Z" fill={f.body} stroke={INK} strokeWidth="4.6" strokeLinejoin="round" />
        <path d="M78 34 L90 20 L64 24 Z" fill={f.body} stroke={INK} strokeWidth="4.6" strokeLinejoin="round" />
      </g>
    );
  }
  if (kind === "flat") {
    return (
      <g className="wfc-ears">
        <path d="M20 38 L6 34 L34 28 Z" fill={f.body} stroke={INK} strokeWidth="4.6" strokeLinejoin="round" />
        <path d="M80 38 L94 34 L66 28 Z" fill={f.body} stroke={INK} strokeWidth="4.6" strokeLinejoin="round" />
      </g>
    );
  }
  return (
    <g className="wfc-ears">
      <path d="M24 30 L20 10 L40 22 Z" fill={f.body} stroke={INK} strokeWidth="4.6" strokeLinejoin="round" />
      <path d="M76 30 L80 10 L60 22 Z" fill={f.body} stroke={INK} strokeWidth="4.6" strokeLinejoin="round" />
      <path d="M25.5 27 L23.5 16 L34 22.5 Z" fill={f.ear} />
      <path d="M74.5 27 L76.5 16 L66 22.5 Z" fill={f.ear} />
    </g>
  );
}

function Eyes({ kind }) {
  if (kind === "arc") return (
    <g>
      <path d="M32 53 Q37 47 42 53" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <path d="M58 53 Q63 47 68 53" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
    </g>
  );
  if (kind === "shut") return (
    <g>
      <path d="M31 52 Q37 58 43 52" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <path d="M57 52 Q63 58 69 52" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
    </g>
  );
  if (kind === "big" || kind === "wet") {
    const r = kind === "wet" ? 7.4 : 6.6;
    return (
      <g className={kind === "wet" ? "wfc-wet" : ""}>
        <ellipse cx="36" cy="52" rx={r} ry={r * 1.12} fill={INK} />
        <ellipse cx="64" cy="52" rx={r} ry={r * 1.12} fill={INK} />
        <circle cx="38.4" cy="49" r="2.4" fill="#FFFFFF" />
        <circle cx="66.4" cy="49" r="2.4" fill="#FFFFFF" />
        <circle cx="33.6" cy="55" r="1.3" fill="#FFFFFF" opacity="0.8" />
        <circle cx="61.6" cy="55" r="1.3" fill="#FFFFFF" opacity="0.8" />
      </g>
    );
  }
  return (
    <g className="wfc-eyes">
      <ellipse cx="37" cy="52" rx="4.4" ry="5.2" fill={INK} />
      <ellipse cx="63" cy="52" rx="4.4" ry="5.2" fill={INK} />
      <circle cx="38.6" cy="50" r="1.5" fill="#FFFFFF" />
      <circle cx="64.6" cy="50" r="1.5" fill="#FFFFFF" />
    </g>
  );
}

function Mouth({ kind }) {
  if (kind === "small") return <ellipse cx="50" cy="63" rx="2.6" ry="3" fill={INK} />;
  if (kind === "open") return <ellipse cx="50" cy="64" rx="5" ry="6" fill={INK} />;
  if (kind === "wobble") return <path d="M43 64 Q47 60 50 64 Q53 68 57 64" fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />;
  if (kind === "flat") return <path d="M44 64 L56 64" fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />;
  return <path d="M45 61 Q50 66 55 61" fill="none" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />;
}

function Extra({ kind }) {
  if (kind === "heart") return (
    <g className="wfc-xheart">
      <path d="M50 6c-1.6-3-6.4-3-6.4 1.2 0 3.2 4.2 6 6.4 7.6 2.2-1.6 6.4-4.4 6.4-7.6C56.4 3 51.6 3 50 6Z" fill="#F0559E" />
    </g>
  );
  if (kind === "sweat") return (
    <g className="wfc-xsweat">
      <path d="M84 30c0 0-4 5-4 7.4a4 4 0 0 0 8 0C88 35 84 30 84 30Z" fill="#8FD3F4" stroke={INK} strokeWidth="2" />
    </g>
  );
  if (kind === "tear") return (
    <g className="wfc-tear1">
      <path d="M31 60c0 0-3.4 4.4-3.4 6.4a3.4 3.4 0 0 0 6.8 0C34.4 64.4 31 60 31 60Z" fill="#8FD3F4" stroke={INK} strokeWidth="1.8" />
    </g>
  );
  if (kind === "tears") return (
    <g>
      <g className="wfc-tear1">
        <path d="M31 60c0 0-3.4 4.4-3.4 6.4a3.4 3.4 0 0 0 6.8 0C34.4 64.4 31 60 31 60Z" fill="#8FD3F4" stroke={INK} strokeWidth="1.8" />
      </g>
      <g className="wfc-tear2">
        <path d="M69 60c0 0-3.4 4.4-3.4 6.4a3.4 3.4 0 0 0 6.8 0C72.4 64.4 69 60 69 60Z" fill="#8FD3F4" stroke={INK} strokeWidth="1.8" />
      </g>
    </g>
  );
  if (kind === "broken") return (
    <g className="wfc-xbreak">
      <path d="M47 4c-1.4-2.6-5.6-2.6-5.6 1 0 2.8 3.6 5.2 5.6 6.6l2-2.4-2.6-2.2 2.6-1.6Z" fill="#F0559E" />
      <path d="M53 4c1.4-2.6 5.6-2.6 5.6 1 0 2.8-3.6 5.2-5.6 6.6l-2-2.4 2.6-2.2L53 5.4Z" fill="#D9457F" />
    </g>
  );
  return <g />;
}

/** One cat. `mood` selects the drawing AND the motion. */
export function Cat({ tone = "cream", mood = "hopeful", size = 92, flip = false, delay = 0 }) {
  const f = FUR[tone] || FUR.cream;
  const m = MOODS[mood] || MOODS.hopeful;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={"wfc " + m.anim}
      style={{ animationDelay: delay + "s", transform: flip ? "scaleX(-1)" : "none" }} aria-hidden="true">
      {/* Tail starts OUTSIDE the silhouette. The first pass ran it from x=78
          inside a body that reaches x=88, so the body painted over the fastest
          animation in the set and the cat looked tailless. */}
      <g className="wfc-tail" style={{ animationDelay: delay + "s" }}>
        <path d="M82 76 C99 74 103 56 93 47" fill="none" stroke={INK} strokeWidth="8" strokeLinecap="round" />
        <path d="M82 76 C99 74 103 56 93 47" fill="none" stroke={f.body} strokeWidth="4" strokeLinecap="round" />
      </g>

      <Ears kind={m.ears} f={f} />

      <path d="M50 20 C74 20 88 36 88 56 C88 76 72 86 50 86 C28 86 12 76 12 56 C12 36 26 20 50 20 Z"
        fill={f.body} stroke={INK} strokeWidth="4.6" />
      <path d="M50 86 C72 86 88 76 88 56 C88 52 87.4 48.4 86.2 45 C84 66 70 78 50 78 C30 78 16 66 13.8 45 C12.6 48.4 12 52 12 56 C12 76 28 86 50 86 Z"
        fill={f.shade} opacity="0.55" />

      <Eyes kind={m.eyes} />
      <ellipse cx="27" cy="60" rx="6.4" ry="4" fill={f.blush} opacity="0.85" />
      <ellipse cx="73" cy="60" rx="6.4" ry="4" fill={f.blush} opacity="0.85" />
      <Mouth kind={m.mouth} />
      <Extra kind={m.extra} />

      <ellipse cx="34" cy="84" rx="9" ry="5.2" fill={f.body} stroke={INK} strokeWidth="4" />
      <ellipse cx="66" cy="84" rx="9" ry="5.2" fill={f.body} stroke={INK} strokeWidth="4" />
    </svg>
  );
}

export function Heart({ size = 22, fill = "#F0559E", className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 21s-8-5.1-8-10.4A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 3.6C20 15.9 12 21 12 21Z" fill={fill} />
    </svg>
  );
}

export function Portrait({ children, size = 122 }) {
  return <div className="wfx-portrait" style={{ width: size, height: size }}>{children}</div>;
}

/** The hug. They lean in, squeeze, and a heart pops between them — on a fast
 *  loop, because a hug that happens once is a picture. */
export function Couple({ size = 62 }) {
  return (
    <div className="wfc-couple">
      <div className="wfc-hugL"><Cat tone="grey" mood="happy" size={size} delay={0} /></div>
      <div className="wfc-heart"><Heart size={size * 0.34} /></div>
      <div className="wfc-hugR"><Cat tone="cream" mood="happy" size={size} flip delay={0.1} /></div>
    </div>
  );
}
