import { TrendingIndexPage, trendingIndexMetadata } from "../../lib/trending";

// Indexable index; the canonical is carried by trendingIndexMetadata().
export function generateMetadata() { return trendingIndexMetadata(); }
export default function Page() { return TrendingIndexPage(); }
