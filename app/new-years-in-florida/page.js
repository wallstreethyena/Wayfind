import { SITE_URL } from "../../lib/site";
import SeasonalSearchHub, { seasonalSearchMetadata } from "../components/SeasonalSearchHub";
export const revalidate = 3600;
export const metadata = { ...seasonalSearchMetadata("new-years-in-florida"), alternates: { canonical: SITE_URL + "/new-years-in-florida" } };
export default function Page() { return <SeasonalSearchHub slug="new-years-in-florida" />; }
