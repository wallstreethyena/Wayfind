// v4.64 — Smart-radius model. Small markets like Parrish cannot honestly
// fill a Top 10 from town limits alone, and padding with weak picks is a
// trust leak. Instead: rank wide, then LABEL distance honestly with radius
// buckets, and say plainly when the list is "best near" rather than "best
// in". Buckets are generic (derived from the user's town) so this works in
// every market, not just Parrish.

export const BUCKETS = [
  { max: 10, label: (town) => town ? "In " + town : "Right nearby" },
  { max: 18, label: () => "A short drive away" },
  { max: 30, label: () => "Nearby cities" },
  { max: 60, label: () => "Worth the drive" },
];

// Splits an ordered place list into radius-bucket sections. Returns the
// sheet-ready shape: places re-ordered bucket by bucket (each bucket keeps
// the incoming ranking) plus section descriptors. Places with unknown
// distance sink into the last non-empty bucket so nothing is hidden.
export function bucketize(places, town) {
  const groups = BUCKETS.map(() => []);
  const unknown = [];
  for (const p of places || []) {
    if (p == null) continue;
    const d = p.distMi;
    if (d == null) { unknown.push(p); continue; }
    const ix = BUCKETS.findIndex((b) => d <= b.max);
    (ix === -1 ? groups[groups.length - 1] : groups[ix]).push(p);
  }
  if (unknown.length) {
    const lastFilled = groups.map((g, i) => (g.length ? i : -1)).reduce((a, b) => Math.max(a, b), 0);
    groups[lastFilled].push(...unknown);
  }
  const out = []; const sections = [];
  groups.forEach((g, i) => {
    if (!g.length) return;
    sections.push({ label: BUCKETS[i].label(town), count: g.length });
    out.push(...g);
  });
  return { places: out, sections };
}

// Quality floor: what counts as a strong local result. Used to decide
// whether a market can honestly claim a "Top 10 in {town}" or must widen.
export function strongWithin(places, miles, minRating = 4.2, minReviews = 50) {
  return (places || []).filter((p) => p && p.distMi != null && p.distMi <= miles && (p.rating || 0) >= minRating && (p.reviews || 0) >= minReviews).length;
}
