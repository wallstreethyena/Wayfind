import { SITE_URL } from "../../lib/site";
import { pageShareUrl } from "../../lib/pageShareUrl";
import { CROWN_PATH } from "../../lib/crownCampaign.js";
import { WF_PLACE_CARD_CSS } from "../components/css";
import ShareButton from "../components/ShareButton";
import CrownCards from "./CrownCards";

export const metadata = {
  title: "Sarasota Halloween Crown",
  description: "Three Sarasota Halloween date nights. Fan vote, not a Wayfind Score.",
  alternates: { canonical: SITE_URL + CROWN_PATH },
  robots: { index: true, follow: true },
};

export default function SarasotaHalloweenCrownPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "28px 16px 64px", color: "#F8FAFC" }}>
      <style dangerouslySetInnerHTML={{ __html: WF_PLACE_CARD_CSS }} />
      <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#F97316" }}>Sarasota</p>
      <h1 style={{ margin: "0 0 10px", fontSize: "clamp(28px, 6vw, 40px)", lineHeight: 1.15, letterSpacing: "-0.03em" }}>
        Sarasota Halloween Crown: three date nights, you pick the winner.
      </h1>
      <p data-crown-note style={{ margin: "0 0 16px", fontSize: 16, lineHeight: 1.45, color: "#E2E8F0" }}>Fan vote, not a Wayfind Score.</p>
      <div style={{ margin: "0 0 22px" }}>
        <ShareButton
          url={pageShareUrl("/sarasota-halloween-crown")}
          title="Sarasota Halloween Crown"
          text="Three Sarasota Halloween date nights. Fan vote, not a Wayfind Score."
          label="Share"
          tone="dark"
          event="page_share"
          meta={{ surface: "sarasota_halloween_crown", placement: "header" }}
        />
      </div>
      <CrownCards />
    </main>
  );
}
