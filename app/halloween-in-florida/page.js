import { SITE_URL } from "../../lib/site";
import { seasonalSearchMetadata } from "../components/SeasonalSearchHub";
import ShareButton from "../components/ShareButton";
import { pageShareUrl } from "../../lib/pageShareUrl";
import BoHalloweenHaunt from "../components/BoHalloweenHaunt";
import { halloweenHauntModel, halloweenHauntSchema } from "../../lib/halloweenHauntVault";

export const revalidate = 3600;

const seasonal = seasonalSearchMetadata("halloween-in-florida");
const title = "Florida Haunted Houses and Scream Park Tickets | Wayfind";
const description = "Book Florida haunted houses and scream parks with prices, dates, and nightly hours. Wayfind may earn a commission when you book through partner links.";

export const metadata = {
  ...seasonal,
  title,
  description,
  alternates: { canonical: SITE_URL + "/halloween-in-florida" },
  openGraph: {
    title,
    description,
    url: SITE_URL + "/halloween-in-florida",
    type: "website",
    siteName: "Wayfind",
    images: [{ url: SITE_URL + "/api/og?t=" + encodeURIComponent("Halloween in Florida: Haunts, Food and Family Fun"), width: 1200, height: 630 }],
  },
  twitter: { ...seasonal.twitter, title, description, images: seasonal.twitter.images },
};

export default function Page() {
  const model = halloweenHauntModel();
  const schema = halloweenHauntSchema(model);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
      <BoHalloweenHaunt
        model={model}
        share={<ShareButton url={pageShareUrl("/halloween-in-florida")} title={title} text={description} tone="dark" label="Share" />}
      />
    </>
  );
}
