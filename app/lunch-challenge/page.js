import LunchChallengeOpen from "./LunchChallengeOpen";
import { SITE_URL } from "../../lib/site";

const title = "You’ve been challenged: Lunch in My City";
const description = "Tap the question block and let Wayfind choose one standout lunch near you.";
const image = `${SITE_URL}/api/og/rail?id=lunchcity`;

export const metadata = {
  robots: { index: false, follow: true },
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: `${SITE_URL}/lunch-challenge` },
  title: `${title} · Wayfind`,
  description,
  openGraph: { title, description, type: "website", siteName: "Wayfind", images: [{ url: image, width: 1200, height: 630, alt: "Lunch in My City challenge" }] },
  twitter: { card: "summary_large_image", title, description, images: [image] },
};

export default function LunchChallengePage() {
  return <LunchChallengeOpen />;
}
