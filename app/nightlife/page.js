import CategoryHub from "../components/CategoryHub";
import { SITE_URL } from "../../lib/site";

export const revalidate = 86400;

const TITLE = "Best Nightlife in Florida by City";
const DESC = "Pick a Florida city and see its best bars and night spots, ranked by the Wayfind Score.";
const _og = SITE_URL + "/api/og?t=" + encodeURIComponent(TITLE);

export const metadata = {
  title: TITLE + " | Wayfind",
  description: DESC,
  robots: { index: true, follow: true },
  openGraph: { type: "website", title: TITLE, description: DESC, url: SITE_URL + "/nightlife", siteName: "Wayfind", images: [{ url: _og, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC, images: [_og] },
  alternates: { canonical: SITE_URL + "/nightlife" },
};

export default function Page() {
  return (
    <CategoryHub
      path="/nightlife"
      cat="nightlife"
      h1={TITLE}
      intro="Pick a city to see where the night is worth going out for. Every list is ranked by the Wayfind Score, and payment never changes a score."
    />
  );
}
