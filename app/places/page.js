import { PlacesIndexPage, placesIndexMetadata } from "../../lib/placePage";

// The /places directory hub; canonical carried by placesIndexMetadata().
export const revalidate = 86400;
export function generateMetadata() { return placesIndexMetadata(); }
export default function Page() { return PlacesIndexPage(); }
