// lib/providerLabels.js — the human name for a provider key, in ONE place.
//
// Two things read this and they must never disagree, because they are the two
// halves of the same FTC disclosure:
//
//   app/components/AffiliateChip.js  the per-card "via <partner>" chip
//   lib/dealSheet.js                 dealNetwork()/dealDisclosure(), the
//                                    "Wayfind earns a commission via X" line
//
// It lives in lib/ (no "use client", no React, no browser globals) so the
// server-side disclosure path can import it without pulling a client component
// into a server module — the same reason lib/bookingResolve.js exists.
//
// A key ABSENT here is not an error: callers fall back to the raw provider key,
// which is ugly but honest. What must never happen is a monetized card whose
// network cannot be named at all — that renders with NO commission disclosure.
export const PROVIDER_LABELS = {
  viator: "Viator",
  undercover_tourist: "Undercover Tourist",
  stay22: "Stay22",
  ticketmaster: "Ticketmaster",
  ticketsmarter: "TicketSmarter",
  klook: "Klook",
  // Awin is the NETWORK; the disclosure must name the advertiser the user is
  // actually buying from, which is what the FTC line is for.
  awin_samboat: "SamBoat",
  // On-card merchant attribution is what Clipp's partner terms permit (and the
  // chip is exactly that). What they forbid is the name/domain in SEO keywords,
  // domains or misspellings — scripts/check-clipp-deals.mjs enforces that side.
  clipp: "Clipp",
  // Added 2026-08-02 with audit F5. These four became reachable through
  // /api/commerce/go, and dealNetwork() now reads the provider off that
  // redirect. Without a label the disclosure line would have read "via
  // citypass" in lowercase, or — before the redirect could be parsed at all —
  // not rendered.
  citypass: "CityPASS",
  tiqets: "Tiqets",
  gocity: "Go City",
  ticketnetwork: "TicketNetwork",
};

/** Display name for a provider key, falling back to the key itself. */
export function providerLabel(key) {
  if (!key) return null;
  return PROVIDER_LABELS[key] || String(key);
}
