// collectionTheme — the ONE palette + type scale for every "collection"
// surface: the shareable hero-card destination pages (RankedExperiencePage /
// CollectionHero) and anything that is a front door into one of them (the
// home discovery menu, hero card rails, etc.).
//
// Phase 0 of the "one technology everywhere" rollout (owner directive,
// 2026-07-31): this file existed only as an unapplied patch handed to the
// owner in a prior session and was never merged, which is why
// RankedExperiencePage.js, CollectionHero.js, and app/components/sheets/
// Intro.js each still carry their OWN small locally-redeclared palette — the
// exact "four palettes, four different answers" root cause documented in
// wayfind-one-design-system-rollout-prompt.md. Values below are lifted
// VERBATIM from RankedExperiencePage.js's local `C`, which is the palette
// already live across the nine shipped ranked routes (/best-beaches,
// /date-night, /family, /trending-now, /hidden-gems, ...) — i.e. this is
// canonicalizing the value that's already correct in production, not
// inventing a new one.
//
// kit.js's `C` is a SEPARATE palette (app chrome: sheets, topbar, dark shell)
// and must not be folded into this one — conflating the two is the fastest
// way to turn this rollout into a regression (see the rollout doc, §2).
export const COLLECTION = {
  bg: "#040810",
  card: "#0B0E15",
  border: "rgba(255,255,255,.08)",
  text: "#F1F5F9",
  muted: "#8b93a1",
  accent: "#F97316",
  gold: "#E8C97A",
  green: "#3ee08a",
};

// The gradient every full-bleed collection photo ends on, so white type
// always sits on flat, solid canvas at the bottom regardless of the photo —
// never a translucent gradient an eyebrow can go illegible against (the
// welcome-popup defect that started this rollout).
export const COLLECTION_SCRIM =
  "linear-gradient(180deg, rgba(4,8,16,.25) 0%, rgba(4,8,16,.55) 55%, " +
  COLLECTION.bg +
  " 100%)";

export const COLLECTION_TYPE = {
  eyebrow: { fontSize: 11, fontWeight: 800, letterSpacing: "1.4px", textTransform: "uppercase" },
  display: { fontSize: 34, fontWeight: 800, letterSpacing: "-0.8px", lineHeight: 1.05 },
  rowTitle: { fontSize: 17, fontWeight: 750 },
  rowMeta: { fontSize: 12.5 },
};
