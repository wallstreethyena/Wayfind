import { SITE_URL } from "../../lib/site";
import { seasonalSearchMetadata } from "../components/SeasonalSearchHub";
import ShareButton from "../components/ShareButton";
import { pageShareUrl } from "../../lib/pageShareUrl";
import BoHalloweenHaunt from "../components/BoHalloweenHaunt";
import { halloweenHauntModel, halloweenHauntCollectionSchema } from "../../lib/halloweenHauntVault";
import { withHauntPhotos } from "../../lib/halloweenHauntPhotos";
import { halloweenToursSchema, withHalloweenTours } from "../../lib/halloweenTours";

// The haunt cut is computed at render time from the current instant
// (hauntIsLive), so a card disappears when its final night closes plus at most
// one regeneration. 600s keeps that under 15 minutes (3600 allowed a card to
// outlive its close by up to an hour). The page only reads free stored data.
export const revalidate = 600;

const seasonal = seasonalSearchMetadata("halloween-in-florida");
const title = "Florida Haunted Houses and Scream Park Tickets | Wayfind";
const description = "Book Florida haunted houses and scream parks with prices, dates, and nightly hours. Wayfind may earn a commission when you book through partner links.";

export const metadata = {
  ...seasonal,
  title,
  description,
  alternates: { canonical: SITE_URL + "/halloween-in-florida" },
  openGraph: {
    type: "website",
    title,
    description,
    url: SITE_URL + "/halloween-in-florida",
    siteName: "Wayfind",
    images: [{ url: SITE_URL + "/api/og?t=" + encodeURIComponent("Halloween in Florida: Haunts, Food and Family Fun"), width: 1200, height: 630 }],
  },
  twitter: { ...seasonal.twitter, title, description, images: seasonal.twitter.images },
};

export default async function Page() {
  const model = await withHalloweenTours(await withHauntPhotos(halloweenHauntModel()));
  const schema = halloweenHauntCollectionSchema(model);
  const toursSchema = halloweenToursSchema(model.tours, SITE_URL + "/halloween-in-florida");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
      {model.tours.length ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(toursSchema).replace(/</g, "\\u003c") }} /> : null}
      <BoHalloweenHaunt
        model={model}
        share={<ShareButton url={pageShareUrl("/halloween-in-florida")} title={title} text={description} tone="dark" label="Share" />}
      />
    </>
  );
}
