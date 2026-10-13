import { SITE_URL } from "../../lib/site";
import SeasonalSearchHub, { seasonalSearchMetadata } from "../components/SeasonalSearchHub";
export const revalidate = 3600;
export const metadata = { ...seasonalSearchMetadata("halloween-in-florida"), alternates: { canonical: SITE_URL + "/halloween-in-florida" } };
export default function Page() { return <SeasonalSearchHub slug="halloween-in-florida" />; }
