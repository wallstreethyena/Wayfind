import { SponsorPage, sponsorPageMetadata } from "../../../lib/sponsorPage";
import { sponsorSlugs } from "../../../lib/sponsoredPlaces";

// The durable, crawlable page for one paying partner. Ungated by geography —
// that is the whole point of it next to the 15-mile in-app card.
//
// dynamicParams = false, exactly as /creators/[handle] does it: the slug space
// is a closed set of paying advertisers, so anything else is a real 404 rather
// than a soft-404 200 over an infinite URL space.
export const dynamicParams = false;
export function generateStaticParams() { return sponsorSlugs().map((slug) => ({ slug })); }
export function generateMetadata(props) { return sponsorPageMetadata(props); }
export default function Page({ params }) { return SponsorPage({ slug: params.slug }); }
