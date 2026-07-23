// lib/rankReason.js — an HONEST, compelling one-line reason a ranked card holds
// its position. Answers the owner's ask: "why was #1 picked, and what makes #1
// better than #2, #2 better than #3." It uses ONLY the real signals the ranking
// itself uses — Bayesian rating (rating + review depth) and proximity (the drive
// penalty byVisibleScore already carries as drive_deduction) — and never invents
// a superlative or a fact. Rank-aware: #1 is framed as the top pick; a card
// docked for distance says so; a loved-but-unknown place is called a find.
// Returns "" when there's no honest signal (the card shows its own editorial
// hook or blurb instead). Pure + deterministic → testable.

const fmtN = (n) => {
  n = Number(n) || 0;
  if (n >= 10000) return Math.round(n / 1000) + "k";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
};

// tolerant field access — ThingsToDoList rows use distance_mi/drive_deduction,
// place cards use distMi.
const distOf = (p) => (typeof p.distance_mi === "number" ? p.distance_mi : typeof p.distMi === "number" ? p.distMi : null);

export function rankReason(p, rank) {
  if (!p) return "";
  const rating = typeof p.rating === "number" ? p.rating : null;
  const reviews = Number(p.reviews) || 0;
  const mi = distOf(p);
  const docked = (Number(p.drive_deduction) || 0) > 0 || (mi != null && mi > 17); // ranking penalized distance
  const deep = reviews >= 500;
  const gem = rating != null && rating >= 4.6 && reviews > 0 && reviews < 150; // loved, still under the radar

  const cred = [
    rating != null ? rating.toFixed(1) + "★" : null,
    reviews > 0 ? fmtN(reviews) + " review" + (reviews === 1 ? "" : "s") : null,
  ].filter(Boolean).join(" · ");

  if (rank === 1) {
    if (gem) return "Our #1 — a " + rating.toFixed(1) + "★ favorite most people here haven't found yet.";
    if (deep) return "Our #1 pick" + (cred ? " — " + cred + ", and it holds up." : ".");
    return "Our #1 pick" + (cred ? " — " + cred + "." : ".");
  }
  if (gem) return "Rated higher (" + rating.toFixed(1) + "★) but still under the radar — " + fmtN(reviews) + " reviews.";
  if (docked && mi != null) return (cred ? cred + " — " : "") + "worth the ~" + Math.round(mi) + " mi if you've got the time.";
  if (deep) return "A consistent crowd-pleaser — " + cred + ".";
  if (cred) return cred + ".";
  return "";
}
