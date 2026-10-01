// v5.02 — SSR landing pages (launch prompt 5). All logic lives in
// lib/landing.js (one module, all four categories); this route only binds
// the "nightlife" slug. ISR: rendered on demand with server keys, cached a day.
import { LandingPage, landingMetadata, landingCityParams } from "../../../lib/landing";
import { landingShareAction } from "../../../lib/landingShare";

export const revalidate = 86400;
export const dynamicParams = false;
// LANDING_CITIES plus the evergreen towns that publish nightlife (lib/evergreenCities.js).
// A withheld pair is absent here, so dynamicParams=false 404s it.
export function generateStaticParams() { return landingCityParams("nightlife"); }
export function generateMetadata({ params }) { return landingMetadata("nightlife", params.city); }
export default function Page({ params }) { return LandingPage({ catSlug: "nightlife", citySlug: params.city, shareAction: landingShareAction("nightlife", params.city) }); }
