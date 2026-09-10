// v4.18 — Guides hub. A browsable index so humans and crawlers reach every
// guide from one internally linked page, strengthening the authority flow.
import { GUIDES } from "../../lib/guides";
import { guideHero } from "../../lib/guideHero";
import { guideRegions } from "../../lib/guideIndex";
import styles from "./guides.module.css";
import { SITE_URL } from "../../lib/site";
import { experienceGoUrl } from "../../lib/affiliates";
import HubConversion from "../components/HubConversion";

const _ogGuides = SITE_URL + "/api/og?t=" + encodeURIComponent("Florida travel guides, written by a local");
export const metadata = {
  title: "Florida Travel Guides | Wayfind",
  description: "Honest, local-written guides to Orlando, Sarasota, and Tampa Bay: where to eat, what's worth booking, and the mistakes to skip.",
  openGraph: { title: "Florida Travel Guides", description: "Honest, local-written guides to Orlando, Sarasota, and Tampa Bay: where to eat, what's worth booking, and the mistakes to skip.", url: SITE_URL + "/guides", siteName: "Wayfind", images: [{ url: _ogGuides, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: "Florida Travel Guides", images: [_ogGuides] },
  alternates: { canonical: SITE_URL + "/guides" },
};

const S = {
  page: { maxWidth: 760, margin: "0 auto", padding: "28px 18px 60px", background: "#0D1117", color: "#E6EDF3", fontFamily: "var(--wf-sans)", lineHeight: 1.6 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#FF8A3D" },
  h1: { fontSize: 30, lineHeight: 1.2, margin: "10px 0 8px", fontWeight: 800, color: "#FFFFFF" },
  sub: { fontSize: 16, color: "#8B949E", marginBottom: 24 },
  region: { fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#8ED6C4", margin: "26px 0 10px" },
  card: { display: "block", padding: "14px 16px", borderRadius: 14, background: "#161B22", border: "1px solid #21262D", marginBottom: 10, textDecoration: "none" },
  t: { fontSize: 16.5, fontWeight: 800, color: "#FFFFFF", margin: 0 },
  d: { fontSize: 13.5, color: "#8B949E", margin: "3px 0 0" },
  foot: { fontSize: 15, color: "#C9D1D9", marginTop: 30 },
  link: { color: "#FF8A3D", textDecoration: "none", fontWeight: 700 },
};

export default function GuidesHub() {
  const regions = guideRegions(GUIDES);
  return (
    <div className={styles.page}>
      {/* v8.22 (owner, live /guides: "there is nothing on this page that makes
          it easy to go back to the main page"). This hub renders OUTSIDE the
          app shell — no nav, no logo — so a reader who landed here from search
          or a card had no visible door home. Same chip language the app's
          standalone screens use. */}
      <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, background: "#161B22", border: "1px solid #21262D", color: "#FF8A3D", fontSize: 13.5, fontWeight: 800, textDecoration: "none", marginBottom: 18 }}>‹ Back to Wayfind</a>
      <header className={styles.header}>
        <p className={styles.eyebrow}>The Wayfind journal</p>
        <h1>Florida guides.<br />Better days out.</h1>
        <p className={styles.lead}>Florida travel guides for the way you want to spend your day. Find a beach, compare a night out, or plan a weekend around something worth going to.</p>
        <nav className={styles.regions} aria-label="Browse guides by destination">
          {regions.map(({ region }, i) => <a key={region} href={"#destination-" + i}>{region}</a>)}
        </nav>
      </header>
      {regions.map(({ region, guides }, i) => (
        <section key={region} id={"destination-" + i} className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>{region}</h2><span>{guides.length} {guides.length === 1 ? "guide" : "guides"}</span>
          </div>
          <div className={styles.grid}>
          {guides.map((g) => {
            const art = guideHero(g.slug);
            return <article key={g.slug} className={styles.card} data-guide-card={g.slug}><a href={"/guides/" + g.slug} className={styles.cardLink}>
              {art?.src ? <div className={styles.image}><img src={art.src} alt={art.alt || ""} width={art.width || 1600} height={art.height || 1000} loading="lazy" decoding="async" style={{ objectPosition: art.position || "center" }} /></div> : null}
              <div className={styles.cardBody}>
                <p className={styles.cardRegion}>{region}</p>
                <h3>{g.title}</h3>
                <p className={styles.description}>{g.description}</p>
                <span className={styles.read}>Explore the guide <span aria-hidden="true">↗</span></span>
              </div>
            </a>
              {art?.credit || art?.license ? <p className={styles.credit}>
                {art.credit ? <a href={art.source}>Image: {art.credit}</a> : null}
                {art.credit && art.license ? " · " : ""}
                {art.license ? <a href={art.licenseUrl || art.source}>{art.license}</a> : null}
              </p> : null}
            </article>;
          })}
          </div>
        </section>
      ))}
      {/* The hub's one primary CTA. Orlando is not an arbitrary pick: it is the
          hub's dominant demand — /guides/things-to-do-orlando-not-theme-parks
          (40 people/30d) and /things-to-do/orlando (30) are the top two entry
          pages into this section, and the hub itself measured 12 sessions at
          100% dead with zero engagement events before this block existed.
          The href is our own /api/viator/go, never a partner domain. */}
      <HubConversion
        surface="guides_hub"
        slugKey="guide_slug"
        slug="guides-hub"
        city="Orlando"
        category="tours"
        cta={{
          label: "See tours & tickets in Orlando",
          href: experienceGoUrl("things to do", "Orlando", "guides_hub"),
          provider: "viator",
          offerId: "guides_hub:orlando",
          monetized: true,
          variant: "hub_tours_v1",
          position: 1,
        }}
        next={{ label: "Read the Orlando guide", href: "/guides/things-to-do-orlando-not-theme-parks" }}
      />
      <p style={S.foot}>Planning around a specific spot? <a href="/" style={S.link}>Open Wayfind</a> and search it, or start with what each city is known for: <a href="/culture/orlando" style={S.link}>Orlando</a>, <a href="/culture/sarasota" style={S.link}>Sarasota</a>, <a href="/culture/tampa" style={S.link}>Tampa</a>.</p>
    </div>
  );
}
