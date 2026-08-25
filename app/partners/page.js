import { PartnersIndexPage, partnersIndexMetadata } from "../../lib/sponsorPage";

// The entry point every /partners/<slug> needs so it is not an orphan, and the
// page that states plainly what a paid placement on Wayfind is. Static: the
// partner book is code, not a query.
export const dynamic = "force-static";
export function generateMetadata() { return partnersIndexMetadata(); }
export default function Page() { return PartnersIndexPage(); }
