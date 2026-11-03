import CategoryHub from "../components/CategoryHub";
import { SITE_URL } from "../../lib/site";

export const revalidate = 86400;

const TITLE = "Best Things to Do in Florida by City";
const DESC = "Pick a Florida city and see the best things to do there, ranked by the Wayfind Score.";
const _og = SITE_URL + "/api/og?t=" + encodeURIComponent(TITLE);

export const metadata = {
  title: TITLE + " | Wayfind",
  description: DESC,
  robots: { index: true, follow: true },
  openGraph: { type: "website", title: TITLE, description: DESC, url: SITE_URL + "/things-to-do", siteName: "Wayfind", images: [{ url: _og, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC, images: [_og] },
  alternates: { canonical: SITE_URL + "/things-to-do" },
};

export default function Page() {
  return (
    <CategoryHub
      path="/things-to-do"
      cat="things-to-do"
      h1={TITLE}
      intro="Pick a city to see what is actually worth your time. Every list is ranked by the Wayfind Score, and payment never changes a score."
    />
  );
}
