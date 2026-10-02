// v5.02 — SSR landing pages (launch prompt 5). All logic lives in
// lib/landing.js (one module, all four categories); this route only binds
// the "things-to-do" slug. ISR: rendered on demand with server keys, cached a day.
import { landingMetadata, landingCityParams } from "../../../lib/landing";
import { LandingPage } from "../../../lib/landingPage";
import { landingShareAction } from "../../../lib/landingShare";

export const revalidate = 86400;
export const dynamicParams = false;
// LANDING_CITIES plus the evergreen towns that publish things-to-do (lib/evergreenCities.js).
// A withheld pair is absent here, so dynamicParams=false 404s it.
export function generateStaticParams() { return landingCityParams("things-to-do"); }
export function generateMetadata({ params }) { return landingMetadata("things-to-do", params.city); }
export default function Page({ params }) { return LandingPage({ catSlug: "things-to-do", citySlug: params.city, shareAction: landingShareAction("things-to-do", params.city) }); }
