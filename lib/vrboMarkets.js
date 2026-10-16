// Client-safe market IDs only. Destinations and CJ tracking stay on the server.
// These exact Florida markets were verified on Vrbo on 2026-10-15.
const MARKETS = Object.freeze({
  orlando: "vrbo-orlando",
  tampa: "vrbo-tampa",
  sarasota: "vrbo-sarasota",
  "siesta key": "vrbo-siesta-key",
  miami: "vrbo-miami",
});

export function vrboMarketOfferId(city) {
  const parts = String(city || "").trim().toLowerCase().split(",").map((p) => p.trim());
  // Reject an explicitly conflicting region rather than sending a visitor to
  // a same-name Florida city. A bare city uses the site's Florida market.
  if (parts.slice(1).some((p) => !/^(?:fl|florida|us|usa|united states)(?:\s+\d{5}(?:-\d{4})?)?$/.test(p))) return null;
  return Object.hasOwn(MARKETS, parts[0]) ? MARKETS[parts[0]] : null;
}
