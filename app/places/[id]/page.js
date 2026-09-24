import { PlacePage, placePageMetadata } from "../../../lib/placePage";
import { listPrerenderIds } from "../../../lib/placeIndex";

// Indexable per-place page; the canonical is carried by placePageMetadata().
// Three allowlists (checked inside PlacePage -> loadPlace): wf_place_ids, a
// publish-ready Atlas card, and a GUIDES pick with a real placeId
// (lib/guidePlaceIndex.js). An id on none of the three calls notFound() BEFORE
// any Google call. Atlas-card and guide-pick ids never spend Places.
// dynamicParams=true lets allowlisted-but-not-prerendered ids render at
// runtime; unknown ids 404 cleanly.
export const dynamicParams = true;
export const revalidate = 86400; // refresh daily (details fetch is cache-first, mostly free)
export function generateStaticParams() { return listPrerenderIds().map((id) => ({ id })); }
export function generateMetadata(props) { return placePageMetadata(props); }
export default function Page({ params }) { return PlacePage({ id: params.id }); }
