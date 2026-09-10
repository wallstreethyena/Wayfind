// Every published guide must remain discoverable as coverage expands.
// The preferred order is editorial; it must never act as a region allowlist.
export function guideRegions(guides) {
  const groups = new Map();
  for (const [slug, guide] of Object.entries(guides)) {
    const region = guide.region || "Florida";
    if (!groups.has(region)) groups.set(region, []);
    groups.get(region).push({ ...guide, slug });
  }
  const preferred = ["Sarasota", "Bradenton", "Parrish", "Orlando", "Tampa", "St. Petersburg"];
  const names = [...preferred.filter((region) => groups.has(region)),
    ...[...groups.keys()].filter((region) => !preferred.includes(region)).sort()];
  return names.map((region) => ({ region, guides: groups.get(region) }));
}
