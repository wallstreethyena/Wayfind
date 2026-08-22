import { CreatorPage, creatorMetadata, creatorSlugs } from "../../../lib/creatorPages";

// Indexable per-creator page; the canonical is carried by creatorMetadata().
// dynamicParams=false, the same rule /trending/[city] follows: a handle that is
// not in generateStaticParams() is a real 404, never a soft-404 "creator not
// found" 200 served over an infinite URL space — which is exactly what a
// crawler enumerating handles would otherwise mine.
export const dynamicParams = false;
export function generateStaticParams() { return creatorSlugs().map((handle) => ({ handle })); }
export function generateMetadata({ params }) { return creatorMetadata(params.handle); }
export default function Page({ params }) { return CreatorPage({ handle: params.handle }); }
