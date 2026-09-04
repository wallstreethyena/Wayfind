// Backward compatibility for the one bad Lunch in My City poster link that
// shipped on 2026-09-04. Old mobile tabs can keep that anchor in memory after
// the rail metadata is fixed. The server therefore recognizes only the exact
// retired homepage -> Gatorland hop and sends it to the real lunch launcher.
// Genuine Gatorland links from guides, search, Summer Picks, or shares remain
// untouched because their referrer is not the homepage.
export const RETIRED_LUNCH_PLACE_ID = "ChIJ9RHZGx6H3YgRnWVYIWsHNPM";
export const LUNCH_LAUNCH_RECOVERY = "/?go=lunch&recovered=1";

export function retiredLunchLaunchTarget({ placeId, referrer, siteUrl = "https://www.gowayfind.com" } = {}) {
  if (String(placeId || "") !== RETIRED_LUNCH_PLACE_ID || !referrer) return null;
  try {
    const from = new URL(String(referrer));
    const site = new URL(String(siteUrl));
    if (from.origin !== site.origin || from.pathname !== "/") return null;
    return LUNCH_LAUNCH_RECOVERY;
  } catch {
    return null;
  }
}
