import ReturnToWayfind from "../../components/ReturnToWayfind";
import ShareButton from "../../components/ShareButton";
import PhotoCreditLink from "../../components/PhotoCreditLink";
// Past guides (owner, 2026-09-23): guides for events that already happened, or
// dated editions that will not come back, are kept here instead of crowding
// the live /guides hub. Every article URL stays live; this page only changes
// where they are promoted. Membership is lib/guideLifecycle.js (a guide's own
// `endsOn`), so nothing here is hand-maintained.
import { GUIDES } from "../../../lib/guides";
import { guideHero } from "../../../lib/guideHero";
import { pastGuides } from "../../../lib/guideLifecycle";
import styles from "../guides.module.css";
import { SITE_URL } from "../../../lib/site";
import { pageShareUrl } from "../../../lib/pageShareUrl";
import { experienceGoUrl } from "../../../lib/affiliates";
import HubConversion from "../../components/HubConversion";
import GuideFigure from "../../components/GuideFigure";

export const revalidate = 3600;

const TITLE = "Past Florida Guides";
const DESCRIPTION = "Wayfind guides for Florida events and seasonal editions that already happened, kept for reference. For what is on now, see the current guides and upcoming events.";
const _og = SITE_URL + "/api/og?t=" + encodeURIComponent("Past Florida guides");
export const metadata = {
  title: TITLE + " | Wayfind",
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, url: SITE_URL + "/guides/past", siteName: "Wayfind", images: [{ url: _og, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, images: [_og] },
  alternates: { canonical: SITE_URL + "/guides/past" },
};

const chip = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, background: "#161B22", border: "1px solid #21262D", color: "#FF8A3D", fontSize: 13.5, fontWeight: 800, textDecoration: "none" };
const link = { color: "#FF8A3D", textDecoration: "none", fontWeight: 700 };

export default function PastGuides() {
  const past = pastGuides(GUIDES);
  // The one monetized next step points at the city of the most recently
  // ended guide: that reader came for a plan there, so show what is bookable
  // there now. Same redirect the hub uses; the partner URL is never in the DOM.
  const city = (past[0] && past[0].region) || "Orlando";
  return (
    <div className={styles.page}>
      <nav aria-label="Breadcrumb" style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        <ReturnToWayfind style={chip} />
        <a href="/guides" style={chip}>Current guides</a>
      </nav>
      <header className={styles.header}>
        <p className={styles.eyebrow}>The Wayfind journal</p>
        <h1>Already happened.</h1>
        <p className={styles.lead}>Event weekends and seasonal editions that have wrapped. Dates, prices and schedules on these pages were true when published and are not being updated.</p>
        {/* Same standard page share as the /guides hub (check-destination-share). */}
        <div style={{ margin: "0 0 18px" }}>
          <ShareButton
            url={pageShareUrl("/guides/past")}
            title="Past Florida guides from Wayfind"
            text="Florida event weekends and seasonal guides that already happened, kept for reference. On Wayfind."
            label="Share"
            tone="dark"
            event="page_share"
            meta={{ surface: "guides_past", placement: "header" }}
          />
        </div>
      </header>
      {past.length ? (
        <section className={styles.section} aria-labelledby="past-list-title">
          <div className={styles.sectionHead}>
            <h2 id="past-list-title">Past guides</h2><span>{past.length} {past.length === 1 ? "guide" : "guides"}</span>
          </div>
          <div className={styles.grid}>
            {past.map((g) => {
              const art = guideHero(g.slug);
              const hasImage = Boolean(art?.src);
              return <article key={g.slug} className={`${styles.card} ${hasImage ? "" : styles.cardWithoutMedia}`} data-past-guide-card={g.slug}><a href={"/guides/" + g.slug} className={styles.cardLink}>
                {hasImage ? <GuideFigure role="card" image={{ ...art, position: art.position || "center" }} showCaption={false} /> : null}
                <div className={styles.cardBody}>
                  <p className={styles.cardRegion}>{g.region || "Florida"} · Ended {g.endedLabel}</p>
                  <h3>{g.title}</h3>
                  <p className={styles.description}>{g.description}</p>
                  <span className={styles.read}>Read the archive <span aria-hidden="true">↗</span></span>
                </div>
              </a>
                {art?.credit || art?.license ? <div className={styles.imageNote}>
                  <p className={styles.credit}>
                    {art.credit ? <a href={art.source}>Image: {art.credit}</a> : null}
                    {art.credit && art.license ? " · " : ""}
                    {art.license ? <PhotoCreditLink href={art.licenseUrl || art.source}>{art.license}</PhotoCreditLink> : null}
                  </p>
                </div> : null}
              </article>;
            })}
          </div>
        </section>
      ) : (
        <p className={styles.description}>Nothing has wrapped yet. <a href="/guides" style={link}>Browse the current guides</a>.</p>
      )}
      <HubConversion
        surface="guides_past"
        slugKey="guide_slug"
        slug="guides-past"
        city={city}
        category="tours"
        cta={{
          label: `See tours & tickets in ${city}`,
          href: experienceGoUrl("things to do", city, "guides_past"),
          provider: "viator",
          offerId: "guides_past:" + city.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          monetized: true,
          variant: "past_tours_v1",
          position: 1,
        }}
        next={{ label: "See upcoming Florida events", href: "/florida-events" }}
      />
      <p style={{ fontSize: 15, color: "#C9D1D9", marginTop: 30 }}>Looking for something this weekend? <a href="/guides" style={link}>Current guides</a> or <a href="/florida-events" style={link}>upcoming Florida events</a>.</p>
    </div>
  );
}
