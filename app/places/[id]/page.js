import { PlacePage, placePageMetadata } from "../../../lib/placePage";
import { listIndexedIds } from "../../../lib/placeIndex";

// Indexable per-place page; the canonical is carried by placePageMetadata().
// The wf_place_ids allowlist (checked inside PlacePage -> loadPlace) is the real
// gate: an id NOT in the index calls notFound() BEFORE any Google call, so a crawler
// enumerating Place-ID space costs one Supabase read, never quota. dynamicParams=true
// lets allowlisted-but-not-prerendered ids render at runtime; unknown ids 404 cleanly.
export const dynamicParams = true;
export const revalidate = 86400; // refresh daily (details fetch is cache-first, mostly free)
export async function generateStaticParams() { return (await listIndexedIds(500)).map((id) => ({ id })); }
export function generateMetadata(props) { return placePageMetadata(props); }
export default function Page({ params }) { return PlacePage({ id: params.id }); }
