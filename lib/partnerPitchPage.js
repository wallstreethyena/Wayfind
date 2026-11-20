// lib/partnerPitchPage.js — the flag on /partners pitch.
// Live PARTNER_PACKAGES and their mailto text stay in lib/sponsorPage.js.
import { SITE_URL } from "./site";
import { pageShareUrl } from "./pageShareUrl";
import ShareButton from "../app/components/ShareButton";
import PhotoFallbackTile from "../app/components/PhotoFallbackTile.js";
import {
  PartnersFunnelBeacon,
  PartnerSectionJumpLink,
  PartnerInquiryLink,
} from "../app/components/PartnerInquiryControls";
import { siteTodayStr } from "./siteTime.js";
import { styleHtml } from "./styleHtml.js";
import { PARTNER_CONTACT_EMAIL } from "./sponsorPage.js";
import { audienceProofParts } from "./partnerProof.js";

export const HOLIDAY_PROMO_THROUGH = "2026-12-31";

const CARD_LINE = "A Sponsored card with a call button and directions.";

export const PITCH_PACKAGES = Object.freeze([
  Object.freeze({
    id: "starter",
    name: "Starter",
    priceUsd: 99,
    priceDisplay: "$99",
    periodLabel: "for 14 days",
    summary: "$99 for 14 days.",
    promoPriceUsd: null,
    promoPriceDisplay: null,
    promoBadge: null,
    featured: false,
  }),
  Object.freeze({
    id: "monthly",
    name: "Monthly",
    priceUsd: 199,
    priceDisplay: "$199",
    periodLabel: "a month",
    summary: "$199 a month. Cancel anytime.",
    promoPriceUsd: null,
    promoPriceDisplay: null,
    promoBadge: null,
    featured: false,
  }),
  Object.freeze({
    id: "quarterly",
    name: "Quarterly",
    priceUsd: 499,
    priceDisplay: "$499",
    periodLabel: "a quarter",
    summary: "$499 a quarter.",
    promoPriceUsd: 399,
    promoPriceDisplay: "$399",
    promoBadge: "Holiday Promo",
    featured: true,
  }),
]);

export function holidayPromoActive(today) {
  const day = today || siteTodayStr();
  return String(day) <= HOLIDAY_PROMO_THROUGH;
}

function activeOffer(pkg, promoOn) {
  const promo = promoOn && pkg.promoPriceDisplay;
  return {
    priceUsd: promo ? pkg.promoPriceUsd : pkg.priceUsd,
    priceDisplay: promo ? pkg.promoPriceDisplay : pkg.priceDisplay,
    listPriceDisplay: promo ? pkg.priceDisplay : null,
    promoBadge: promo ? pkg.promoBadge : null,
  };
}

export function pitchMailto(pkg, today) {
  const promoOn = holidayPromoActive(today);
  const quarterly = PITCH_PACKAGES.find((row) => row.id === "quarterly");
  const quarterlyOffer = activeOffer(quarterly, promoOn);
  if (!pkg) {
    const subject = "Sponsored placement on Wayfind";
    const body = [
      "Hi Wayfind team,",
      "",
      "I want to ask about a sponsored placement on Wayfind.",
      "",
      `Plan I want (Starter $99 for 14 days, Monthly $199 a month, or Quarterly ${quarterlyOffer.priceDisplay} a quarter${quarterlyOffer.promoBadge ? ", Holiday Promo" : ""}):`,
      "Business name:",
      "City:",
      "Website or booking link:",
      "Phone:",
      "",
      "Thanks!",
    ].join("\n");
    return `mailto:${PARTNER_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
  const offer = activeOffer(pkg, promoOn);
  const promoNote = offer.promoBadge ? ", Holiday Promo" : "";
  const subject = `${pkg.name} plan, ${offer.priceDisplay} ${pkg.periodLabel}${promoNote}`;
  const body = [
    "Hi Wayfind team,",
    "",
    `I want the ${pkg.name} plan. It is ${offer.priceDisplay} ${pkg.periodLabel}${promoNote}.`,
    "",
    "Business name:",
    "City:",
    "Website or booking link:",
    "Phone:",
    "",
    "Thanks!",
  ].join("\n");
  return `mailto:${PARTNER_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const HERO = "People in Florida are asking AI where to go. Make sure the answer includes you.";
const RANKINGS_LINE = "Rankings are never for sale. Paid cards are always labeled Sponsored.";
const COMMISSION_LINE = "Wayfind may earn a commission from some booking partners.";

export function partnersPitchMetadata() {
  const url = `${SITE_URL}/partners`;
  const title = "Partners on Wayfind";
  const description = HERO + " " + COMMISSION_LINE;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url } };
}

const PITCH_CSS = `
.wfp2{max-width:760px;margin:0 auto;padding:28px 18px 80px;color:#F1F5F9;font-family:var(--wf-sans),system-ui,sans-serif;box-sizing:border-box;overflow-wrap:break-word}
.wfp2 *,.wfp2 *::before,.wfp2 *::after{box-sizing:border-box}
.wfp2 a:focus-visible,.wfp2 button:focus-visible{outline:2px solid #F97316;outline-offset:2px}
.wfp2-accent{width:48px;height:3px;border-radius:999px;background:#F97316;margin:0 0 18px}
.wfp2 h1{font-size:34px;font-weight:700;line-height:1.15;letter-spacing:normal;margin:0;color:#FFFFFF}
.wfp2 h2{font-size:22px;font-weight:700;line-height:1.3;margin:0 0 12px;color:#FFFFFF}
.wfp2 p{font-size:16px;line-height:1.5;color:#CBD5E1;margin:0}
.wfp2-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px;align-items:center}
.wfp2-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 18px;border-radius:12px;background:#F97316;color:#0D1117;font-size:16px;font-weight:700;text-align:center;text-decoration:none;border:0}
.wfp2-btn:hover{background:#FB923C;color:#0D1117}
.wfp2-proof{margin-top:28px;background:#161B22;border:1px solid #2D3748;border-radius:16px;padding:18px 16px}
.wfp2-proof strong{color:#FFFFFF;font-size:28px;font-weight:700;letter-spacing:normal}
.wfp2-started{margin-top:10px;color:#FDBA74;font-weight:700}
.wfp2-section{margin-top:36px}
.wfp2-miss p+p{margin-top:12px}
.wfp2-sample{margin-top:14px;background:#161B22;border:1px solid #2D3748;border-radius:16px;padding:16px}
.wfp2-flag{display:inline-block;margin:0 0 12px;padding:4px 10px;border-radius:999px;background:rgba(249,115,22,.16);color:#F97316;font-size:13px;font-weight:700}
.wfp2-media{height:140px;border-radius:12px;overflow:hidden;background:#161B22}
.wfp2-kicker{font-size:13px;font-weight:700;color:#FDBA74;margin:12px 0 4px}
.wfp2-name{font-size:18px;font-weight:700;color:#FFFFFF;margin:0}
.wfp2-actions-row{display:flex;gap:8px;margin-top:14px}
.wfp2-actions-row span,.wfp2-mini span{flex:1;text-align:center;padding:10px 8px;border-radius:12px;border:1px solid #2D3748;background:#0D1117;color:#F1F5F9;font-size:14px;font-weight:700}
.wfp2-note{margin-top:10px;font-size:13px;color:#94A3B8}
.wfp2-plans{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:16px}
.wfp2-plan{display:flex;flex-direction:column;justify-content:space-between;gap:14px;background:#161B22;border:1px solid #2D3748;border-radius:16px;padding:18px 16px;min-width:0}
.wfp2-plan.is-on{border-color:#F97316;background:#1C2230}
.wfp2-plan h3{font-size:13px;font-weight:700;color:#94A3B8;margin:0 0 8px}
.wfp2-plan.is-on h3{color:#FDBA74}
.wfp2-price{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;margin:0 0 6px}
.wfp2-price b{font-size:32px;font-weight:700;color:#FFFFFF;line-height:1}
.wfp2-price span{font-size:15px;font-weight:700;color:#CBD5E1}
.wfp2-list{margin:0 0 4px;color:#94A3B8;font-size:15px}
.wfp2-list s{color:#94A3B8}
.wfp2-mini{margin-top:12px;padding:12px;border-radius:12px;background:#0D1117;border:1px solid #2D3748}
.wfp2-mini p{font-size:13px;font-weight:700;color:#FDBA74;margin:0 0 8px}
.wfp2-cta{display:inline-flex;align-items:center;justify-content:center;width:100%;min-height:48px;padding:12px 14px;border-radius:12px;background:#F97316;color:#0D1117;font-size:15px;font-weight:700;text-align:center;text-decoration:none}
.wfp2-cta:hover{background:#FB923C;color:#0D1117}
.wfp2-rule{margin-top:28px;font-size:16px;color:#F1F5F9}
.wfp2-close{margin-top:28px;background:#1C2230;border:1px solid #F97316;border-radius:16px;padding:18px 16px}
.wfp2-close .wfp2-btn{margin-top:16px}
.wfp2-fine{margin-top:28px;font-size:12px;line-height:1.5;color:#6E7681}
@media(max-width:800px){
  .wfp2-plans{grid-template-columns:1fr}
  .wfp2 h1{font-size:28px}
}
@media(max-width:420px){
  .wfp2{padding:20px 14px 64px}
}
`;

function jsonLd(obj) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(obj) }} />;
}

export function PartnersPitchPage({ today } = {}) {
  const day = today || siteTodayStr();
  const promoOn = holidayPromoActive(day);
  const proof = audienceProofParts();
  const generalMailto = pitchMailto(null, day);
  return (
    <div className="wfp2">
      <style dangerouslySetInnerHTML={styleHtml(PITCH_CSS)} />
      <PartnersFunnelBeacon pricingSectionId="plans" />
      {jsonLd({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Partners on Wayfind",
        url: `${SITE_URL}/partners`,
        description: HERO,
      })}
      <div className="wfp2-accent" aria-hidden="true" />
      <h1>{HERO}</h1>
      <div className="wfp2-actions">
        <PartnerSectionJumpLink
          href="#plans"
          placement="hero"
          targetSection="plans"
          className="wfp2-btn"
          ariaLabel="See plans"
        >
          See plans
        </PartnerSectionJumpLink>
        <ShareButton
          url={pageShareUrl("/partners")}
          title="People in Florida are asking AI where to go"
          text="Make sure the answer includes you."
          label="Share"
          tone="dark"
          event="page_share"
          meta={{ surface: "partners_pitch", placement: "header" }}
        />
      </div>

      <section className="wfp2-proof" aria-label="Wayfind audience">
        <p>
          About <strong>{proof.visitors}</strong> people used Wayfind in the {proof.period}. About <strong>{proof.floridaVisitors}</strong> of them were in Florida. {proof.countedLine}
        </p>
        <p className="wfp2-started">We just started.</p>
      </section>

      <section className="wfp2-section wfp2-miss" aria-labelledby="wfp2-missing">
        <h2 id="wfp2-missing">What you are missing</h2>
        <p>Right now, people near you are deciding where to go. A Sponsored card puts you in front of them with a call button and directions.</p>
        <p>Travel and discovery are moving to AI. Wayfind runs frontier AI models around the clock so a visitor in Florida gets the best of what is open today.</p>
        <p>Building this yourself would take a tech team, a lot of code and a lot of money. Here it is one plan.</p>
      </section>

      <section className="wfp2-section" aria-labelledby="wfp2-sample">
        <h2 id="wfp2-sample">Example only</h2>
        <div className="wfp2-sample" aria-label="Example only. Sample Harbor Cafe is not a real business.">
          <p className="wfp2-flag">Example only</p>
          <div className="wfp2-media">
            <PhotoFallbackTile name="Sample Harbor Cafe" category="coffee" caption="Example only" />
          </div>
          <p className="wfp2-kicker">Sponsored</p>
          <p className="wfp2-name">Sample Harbor Cafe</p>
          <div className="wfp2-actions-row">
            <span>Call</span>
            <span>Directions</span>
          </div>
        </div>
        <p className="wfp2-note">Example only. Not a real business.</p>
      </section>

      <section id="plans" className="wfp2-section" aria-labelledby="wfp2-plans">
        <h2 id="wfp2-plans">Plans</h2>
        <div className="wfp2-plans">
          {PITCH_PACKAGES.map((pkg) => {
            const offer = activeOffer(pkg, promoOn);
            const href = pitchMailto(pkg, day);
            return (
              <article key={pkg.id} className={`wfp2-plan${pkg.featured ? " is-on" : ""}`} data-pitch-plan={pkg.id}>
                <div>
                  {offer.promoBadge ? <p className="wfp2-flag">{offer.promoBadge}</p> : null}
                  <h3>{pkg.name}</h3>
                  {offer.listPriceDisplay ? (
                    <p className="wfp2-list"><s>{offer.listPriceDisplay}</s> list</p>
                  ) : null}
                  <p className="wfp2-price"><b>{offer.priceDisplay}</b> <span>{pkg.periodLabel}</span></p>
                  <p>{pkg.id === "quarterly" && offer.promoBadge ? "Holiday Promo through December 31, 2026." : pkg.summary}</p>
                  <div className="wfp2-mini">
                    <p>Sponsored</p>
                    <p style={{ color: "#CBD5E1", fontWeight: 500 }}>{CARD_LINE}</p>
                    <div className="wfp2-actions-row">
                      <span>Call</span>
                      <span>Directions</span>
                    </div>
                  </div>
                </div>
                <PartnerInquiryLink
                  href={href}
                  packageId={pkg.id}
                  packageName={pkg.name}
                  priceUsd={offer.priceUsd}
                  billingPeriod={pkg.periodLabel}
                  placement="pricing_card"
                  className="wfp2-cta"
                  ariaLabel={`Email us to start. ${pkg.name}. Opens an email to ${PARTNER_CONTACT_EMAIL}`}
                >
                  Email us to start
                </PartnerInquiryLink>
              </article>
            );
          })}
        </div>
      </section>

      <p className="wfp2-rule">{RANKINGS_LINE}</p>
      <p className="wfp2-section">The Wayfind app comes to the app store this year. Partners who join now are already in place on day one.</p>

      <section className="wfp2-close" aria-label="Email us to start">
        <p>Every week you wait, people near you pick somewhere else. Start small and see who finds you.</p>
        <PartnerInquiryLink
          href={generalMailto}
          packageId="general"
          placement="close"
          className="wfp2-btn"
          ariaLabel={`Email us to start. Opens an email to ${PARTNER_CONTACT_EMAIL}`}
        >
          Email us to start
        </PartnerInquiryLink>
      </section>

      <p className="wfp2-fine">{COMMISSION_LINE}</p>
    </div>
  );
}
