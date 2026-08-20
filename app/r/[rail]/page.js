// app/r/[rail]/page.js — where a shared rail card lands.
//
// Owner, v8.23: "whoever clicks on will go on the page and see all of the items
// based on their current location?"
//
// THIS PAGE IS A DOORWAY, NOT A DESTINATION, and that is a deliberate call.
//
// The obvious build is a full second homepage per rail. It is the wrong one:
// seventeen prerendered copies of a 10,000-line client tree, each duplicating a
// geolocation stack that already exists and works, and each one a page Google
// would read as a near-duplicate of "/". What the share actually needs from a
// route is TWO things — the right link preview, and the right first screen.
//
// So this route owns the preview (generateMetadata, per rail, with the card's
// own artwork through /api/og/rail) and then hands the reader to /?rail=<id>,
// where app/home.js opens that rail's drop and DaypartRail's center effect
// re-ranks every card in it from the reader's own coordinates via /api/rails.
// Exactly the pattern /l/[key] already uses for a shared list.
//
// NOINDEX, FOLLOW. Same policy as /l: a share URL space has no business
// competing in the index with the real ranked pages it points at, and the SEO
// audit (July 2026) has already been round this loop once with unbounded
// query-space URLs canonicalising to "/". The <a> below is a real link, so the
// crawl equity flows on to the rail's own route instead of stopping here.
import ShareRedirect from "../../ShareRedirect";
import { SITE_URL } from "../../../lib/site";
import { RAIL_IDS, railById } from "../../../lib/rails";
import { railOgUrl, railSharePath, railShareTitle, railShareDescription } from "../../../lib/railShare";
import { railHref } from "../../../lib/dayparts";

// Seventeen known ids and nothing else: dynamicParams:false turns a typo'd or
// probed /r/<anything> into a 404 rather than a 200 that renders a doorway to
// nowhere. A shared link is the one URL shape strangers paste into things.
export const dynamicParams = false;
export function generateStaticParams() {
  return RAIL_IDS.map((rail) => ({ rail }));
}

export async function generateMetadata({ params }) {
  const r = railById(params.rail);
  if (!r) return { robots: { index: false, follow: true }, title: "Wayfind" };
  const title = railShareTitle(r);
  const description = railShareDescription(r);
  const image = railOgUrl(r.id);
  const url = SITE_URL + railSharePath(r.id);
  return {
    robots: { index: false, follow: true },
    metadataBase: new URL(SITE_URL),
    title,
    description,
    // Both blocks carry images explicitly. Next REPLACES an inherited
    // openGraph rather than merging it, which is how every route except "/"
    // silently lost its preview image once before (lib/socialMeta.js).
    openGraph: { title, description, url, siteName: "Wayfind", type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: r.title }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

const S = {
  main: { minHeight: "100dvh", background: "#0A0E1A", color: "#F4F7FF",
    fontFamily: "var(--wf-sans)", display: "flex", alignItems: "center",
    justifyContent: "center", padding: "48px 22px", textAlign: "center" },
  wrap: { maxWidth: 520 },
  eyebrow: { fontSize: 12, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: "#FF8A3D", margin: 0 },
  h1: { fontSize: 30, lineHeight: 1.18, fontWeight: 700, margin: "12px 0 10px" },
  sub: { fontSize: 16, lineHeight: 1.5, color: "#A9B5CD", margin: "0 0 26px" },
  cta: { display: "inline-flex", alignItems: "center", padding: "14px 26px", borderRadius: 999,
    background: "#FF6A2B", color: "#0A0A0B", fontSize: 15, fontWeight: 700, textDecoration: "none" },
  alt: { display: "block", marginTop: 18, fontSize: 14, fontWeight: 700, color: "#A9B5CD", textDecoration: "none" },
};

export default function Page({ params }) {
  const r = railById(params.rail);
  if (!r) return <ShareRedirect to="/" />;
  // The rail's own route, resolved for Florida — the honest default when a
  // shared link carries no location, and never a bare /things-to-do (which is
  // a segment-only route and would be an indexable soft-404: see railHref).
  const onward = railHref(r, "fl", null) || "/";
  return (
    <main style={S.main}>
      <ShareRedirect to={"/?rail=" + encodeURIComponent(r.id)} />
      {/* Everything below is what a crawler, a no-JS reader, or anyone whose
          redirect is slower than their eyes actually gets. It is a real page
          with real links, not a spinner: a doorway that renders nothing is a
          doorway that looks broken for the 50ms it exists. */}
      <div style={S.wrap}>
        <p style={S.eyebrow}>Wayfind</p>
        <h1 style={S.h1}>{r.title}</h1>
        <p style={S.sub}>{r.short}. {r.sub} — ranked from wherever you open it.</p>
        <a style={S.cta} href={"/?rail=" + encodeURIComponent(r.id)}>{r.cta}</a>
        <a style={S.alt} href={onward}>Or browse {r.title.toLowerCase()} →</a>
      </div>
    </main>
  );
}
