import { PartnersIndexPage, partnersIndexMetadata } from "../../lib/sponsorPage";
import { PartnersPitchPage, partnersPitchMetadata } from "../../lib/partnerPitchPage";
import { partnerFlagOn } from "../../lib/partnerFlags";

// Hourly ISR stays. scripts/test-partner-revenue-engine.mjs locks this export
// at 3600. The pitch flag is read inside that window and fails closed to the
// page below.
export const revalidate = 3600;

export async function generateMetadata() {
  const on = await partnerFlagOn("partners_pitch_v2");
  return on ? partnersPitchMetadata() : partnersIndexMetadata();
}

export default async function Page() {
  const on = await partnerFlagOn("partners_pitch_v2");
  return on ? PartnersPitchPage() : PartnersIndexPage();
}
