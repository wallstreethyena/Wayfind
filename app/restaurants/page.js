import CategoryHub from "../components/CategoryHub";
import { SITE_URL } from "../../lib/site";

export const revalidate = 86400;

const TITLE = "Florida Restaurants by City";
const DESC = "Pick a Florida city and see its restaurants, ranked on merit by the Wayfind Score. Rankings are never for sale.";
const _og = SITE_URL + "/api/og?t=" + encodeURIComponent(TITLE);

export const metadata = {
  title: TITLE + " | Wayfind",
  description: DESC,
  robots: { index: true, follow: true },
  openGraph: { type: "website", title: TITLE, description: DESC, url: SITE_URL + "/restaurants", siteName: "Wayfind", images: [{ url: _og, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC, images: [_og] },
  alternates: { canonical: SITE_URL + "/restaurants" },
};

export default function Page() {
  return (
    <CategoryHub
      path="/restaurants"
      cat="restaurants"
      h1={TITLE}
      intro="Pick a city to see where locals actually eat. Every list is ranked on merit by the Wayfind Score. Rankings are never for sale."
      extras={[{ title: "Eat by cuisine", links: [
        { href: "/eat/orlando", label: "Orlando" },
        { href: "/eat/tampa", label: "Tampa Bay" },
        { href: "/eat/manatee-sarasota", label: "Sarasota and Bradenton" },
      ] }]}
    />
  );
}
