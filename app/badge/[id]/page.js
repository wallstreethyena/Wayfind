// app/badge/[id]/page.js — where a business gets its free "Top rated on
// Wayfind" badge code. Reached from the "Own this place?" link at the foot of
// an eligible /places/{id} page (lib/placePage.js).
//
// noindex: this is a tool page for owners, not content for searchers, so it
// stays out of the sitemap and out of search results. The badge itself is what
// earns the link (lib/topRatedBadge.js).
//
// Eligibility (merit score + indexable place page) is decided HERE, before any
// code is handed out. Never spends Google: loadPlaceNoSpend reads our own
// tables and the existing details cache only.
import { notFound } from "next/navigation";
import { SITE_URL } from "../../../lib/site";
import { loadPlaceNoSpend, isIndexable } from "../../../lib/placeData";
import { badgeEligible, badgeEmbedHtml, validBadgeId } from "../../../lib/topRatedBadge";
import BadgeCopyBox from "../../components/BadgeCopyBox";

export const revalidate = 86400;

const S = {
  wrap: { maxWidth: 640, margin: "0 auto", padding: "28px 18px 64px", color: "#F1F5F9", fontFamily: "system-ui, -apple-system, sans-serif" },
  crumb: { fontSize: 12.5, color: "#94A3B8", marginBottom: 14 },
  crumbLink: { color: "#94A3B8", textDecoration: "none" },
  h1: { fontSize: 26, fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.4px", margin: "0 0 10px" },
  p: { fontSize: 15, color: "#E2E8F0", lineHeight: 1.6, margin: "0 0 14px" },
  hh: { fontSize: 13, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.5px", margin: "24px 0 10px" },
  ol: { fontSize: 14.5, color: "#E2E8F0", lineHeight: 1.7, margin: "0 0 18px", paddingLeft: 20 },
  link: { color: "#F97316", fontWeight: 700, textDecoration: "none" },
  small: { fontSize: 12.5, color: "#8B949E", lineHeight: 1.6, marginTop: 24 },
};

async function load(id) {
  if (!validBadgeId(id)) return null;
  try { return await loadPlaceNoSpend(id); } catch { return null; }
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const p = await load(id);
  const title = p && p.name ? `Get the Top Rated badge for ${p.name} | Wayfind` : "Top Rated badge | Wayfind";
  return { title, robots: { index: false, follow: true } };
}

export default async function Page({ params }) {
  const { id } = await params;
  const p = await load(id);
  if (!p || !p.name) notFound();
  const placeHref = `/places/${encodeURIComponent(id)}`;
  const eligible = badgeEligible({ indexable: isIndexable(p), rating: p.rating, reviews: p.reviews });

  if (!eligible) {
    return (
      <div style={S.wrap}>
        <div style={S.crumb}><a href={placeHref} style={S.crumbLink}>‹ {p.name}</a></div>
        <h1 style={S.h1}>The Top Rated badge isn&apos;t available for this place yet</h1>
        <p style={S.p}>The badge goes to places with a top Wayfind score. Scores update as new reviews come in, so check back later.</p>
        <p style={S.p}><a href={placeHref} style={S.link}>See {p.name} on Wayfind ›</a></p>
      </div>
    );
  }

  const alt = `${p.name} is top rated on Wayfind`;
  const styles = [
    { theme: "dark", title: "Dark style (for dark websites)" },
    { theme: "light", title: "Light style (for white or light websites)" },
  ];
  return (
    <div style={S.wrap}>
      <div style={S.crumb}><a href={placeHref} style={S.crumbLink}>‹ {p.name}</a></div>
      <h1 style={S.h1}>{p.name} is top rated on Wayfind</h1>
      <p style={S.p}>Congrats! Show it off with a free badge on your website. It tells customers you&apos;re one of the highest rated spots around, and it links to your Wayfind page.</p>
      <div style={S.hh}>How to add it</div>
      <ol style={S.ol}>
        <li>Pick the style that matches your website.</li>
        <li>Tap <strong>Copy code</strong>.</li>
        <li>Paste it into your website where you want the badge. On Wix, Squarespace, WordPress and most site builders, add an &quot;Embed&quot; or &quot;HTML&quot; block and paste it there.</li>
      </ol>
      {styles.map((s) => (
        <BadgeCopyBox
          key={s.theme}
          title={s.title}
          theme={s.theme}
          imgSrc={`/api/badge/${encodeURIComponent(id)}?theme=${s.theme}`}
          alt={alt}
          code={badgeEmbedHtml({ siteUrl: SITE_URL, id, name: p.name, theme: s.theme })}
        />
      ))}
      <p style={S.small}>Free, no sign up. The badge always shows your current business name. Wayfind ranks places on real reviews, and nobody can pay to be listed or to rank higher.</p>
    </div>
  );
}
