import ShareRedirect from "../ShareRedirect";
import { searchAppTarget, searchShareState } from "../../lib/searchShareUrl";

// The shareable search URL. /search?q=coffee used to 404: search lived
// only as in-page state, so a result set could never be linked. This is
// a bridge in the /events + /map shape, not a second search page — it
// hands off to /?q=..., the form app/home.js already restores (query,
// intent=place, near=<City, FL>) and runs through submitSearch, with the
// reader's own wf_center/GPS center deciding "near" when near= is
// absent. lib/searchShareUrl.js owns the supported parameter set.
//
// SEO: never indexable. q/intent/near combinations are an infinite
// app-state space (the /l, /s share-page class in check-seo.mjs), so
// the route is noindex and canonicalizes to the homepage — the search
// IS homepage app state, the same reason layout.js gives / its
// canonical "/". The raw query is never reflected into the title or
// description: the metadata is static, so no combination can mint a
// distinct preview page either. Kept out of app/sitemap.js.
export const metadata = {
  title: "Search · Wayfind",
  description: "Search Wayfind for the best things to do, places to eat, and events near you, ranked by real reviews, not ads.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/" },
};

export default async function SearchPage({ searchParams }) {
  const sp = (await searchParams) || {};
  const state = searchShareState(sp);
  const target = searchAppTarget(sp);
  const label = state.q || (state.intent && state.intent !== "place" ? state.intent : "");
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#0D1117",
        color: "#F1F5F9",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--wf-sans)",
        textAlign: "center",
        padding: "24px",
      }}
    >
      <ShareRedirect to={target} />
      <div style={{ fontSize: 28, fontWeight: 800, color: "#CBD5E1", letterSpacing: "1px", marginBottom: 14 }}>
        📍 WAYFIND
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9", margin: "0 0 8px" }}>
        {label ? `Searching for “${label}”` : "Search Wayfind"}
      </h1>
      <p style={{ fontSize: 14, color: "#94A3B8", maxWidth: 460, margin: "0 auto 18px", lineHeight: 1.6 }}>
        Opening your search in Wayfind — the best things to do, places to eat, and events near you, ranked by real reviews, not ads.
      </p>
      <a
        href={target}
        style={{
          display: "inline-block",
          padding: "12px 22px",
          borderRadius: 999,
          background: "#F97316",
          color: "#0D1117",
          fontWeight: 800,
          fontSize: 15,
          textDecoration: "none",
        }}
      >
        Open in Wayfind
      </a>
    </div>
  );
}
