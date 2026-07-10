// v5.02 — SSR landing pages (launch prompt 5). All logic lives in
// lib/landing.js (one module, all four categories); this route only binds
// the "nightlife" slug. ISR: rendered on demand with server keys, cached a day.
import { LandingPage, landingMetadata, LANDING_CITIES } from "../../../lib/landing";

export const revalidate = 86400;
export const dynamicParams = false;
export function generateStaticParams() { return Object.keys(LANDING_CITIES).map((city) => ({ city })); }
export function generateMetadata({ params }) { return landingMetadata("nightlife", params.city); }
export default function Page({ params }) { return LandingPage({ catSlug: "nightlife", citySlug: params.city }); }
