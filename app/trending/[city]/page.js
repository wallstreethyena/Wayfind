import { TrendingCityPage, trendingMetadata, trendingCitySlugs } from "../../../lib/trending";

// Indexable per-city page; the canonical is carried by trendingMetadata().
// dynamicParams=false: a slug not in generateStaticParams() is a real 404, NOT a
// soft-404 "city not found" 200 over an infinite URL space (same rule the SEO gate
// enforces for share/app-state routes).
export const dynamicParams = false;
export function generateStaticParams() { return trendingCitySlugs().map((city) => ({ city })); }
export function generateMetadata({ params }) { return trendingMetadata(params.city); }
export default function Page({ params }) { return TrendingCityPage({ slug: params.city }); }
