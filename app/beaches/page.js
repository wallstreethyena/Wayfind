import CategoryHub from "../components/CategoryHub";
import { BEACH_METROS } from "../../lib/beaches";
import { SITE_URL } from "../../lib/site";

export const revalidate = 86400;

const TITLE = "Florida Beaches by City";
const DESC = "Pick a Florida city and see its beaches, ranked on merit by the Wayfind Score. Rankings are never for sale.";
const _og = SITE_URL + "/api/og?t=" + encodeURIComponent(TITLE);

export const metadata = {
  title: TITLE + " | Wayfind",
  description: DESC,
  robots: { index: true, follow: true },
  openGraph: { type: "website", title: TITLE, description: DESC, url: SITE_URL + "/beaches", siteName: "Wayfind", images: [{ url: _og, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC, images: [_og] },
  alternates: { canonical: SITE_URL + "/beaches" },
};

export default function Page() {
  return (
    <CategoryHub
      path="/beaches"
      cat="beaches"
      h1={TITLE}
      intro="Pick a city to see its beaches. Every list is ranked on merit by the Wayfind Score. Rankings are never for sale."
      extras={[{ title: "Beach rankings by metro", links: Object.entries(BEACH_METROS).map(([slug, m]) => ({ href: "/best-beaches/" + slug, label: m.short })) }]}
    />
  );
}
