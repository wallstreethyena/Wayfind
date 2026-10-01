// lib/landingShare.js — the Share action for the four city landing pages
// (/things-to-do, /restaurants, /beaches, /nightlife + /[city]).
//
// It lives apart from lib/landing.js on purpose. lib/landing.js is on the
// homepage's server import path (app/page.js -> lib/railsData.js), and in the
// App Router every client component such a module imports is shipped in the
// homepage bundle, rendered or not. Only the four landing routes import this
// file, so ShareButton stays off the homepage. The title mirrors LandingPage's
// visible H1, and the URL is the route's own (scripts/check-destination-share).
// tone="hero": it renders on PremiumIntentHero's cream panel.
import ShareButton from "../app/components/ShareButton";
import { pageShareUrl } from "./pageShareUrl";
import { LANDING_CATS, landingPair } from "./landing";

export function landingShareAction(catSlug, citySlug) {
  // landingPair: LANDING_CITIES, or a published evergreen pair (lib/evergreenCities.js).
  const pair = landingPair(catSlug, citySlug);
  const cat = LANDING_CATS[catSlug], city = pair && pair.city;
  if (!cat || !city) return null;
  return (
    <ShareButton
      url={pageShareUrl(`/${catSlug}/${citySlug}`)}
      title={`The best ${cat.label.toLowerCase()} in ${city.name}, ${city.state}`}
      text={`The best ${cat.label.toLowerCase()} in ${city.name}, ranked on Wayfind.`}
      tone="hero"
      event="page_share"
      meta={{ surface: "landing", cat: catSlug, city: citySlug, placement: "hero" }}
    />
  );
}
