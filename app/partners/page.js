import { PartnersIndexPage, partnersIndexMetadata } from "../../lib/sponsorPage";

// The entry point every /partners/<slug> needs so it is not an orphan, and the
// page that states plainly what a paid placement on Wayfind is. Prerendered
// statically at build time and revalidated hourly so siteTodayStr() flight
// expiry and 30-day scoreSnapshotOn freshness advance without redeploying.
export const revalidate = 3600;
export function generateMetadata() { return partnersIndexMetadata(); }
export default function Page() { return PartnersIndexPage(); }
