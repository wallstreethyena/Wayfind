// app/components/DiscoveryPaths.js — no page is a dead end.
//
// Owner: "i want the blogs to take the user to different places of the site, it
// should allow them to discover other places. everything on Wayfind should take
// the user on a discovery path."
//
// MEASURED FIRST. Every page type already carries 23-45 internal links — 9-10
// guides and 11-33 city/category links, mostly from the shared footer. So the
// pages were not dead ends in the crude sense. What was missing was specific
// and total:
//
//     INTENT LINKS: 0. On every page type. Every one.
//
// The fifteen rail intents — /tonight, /hidden-gems, /worth-the-drive,
// /date-night, /best-of and the rest — were reachable from the homepage rail
// and NOWHERE else. A reader arriving on a guide from Google could reach other
// guides and other cities, but could not reach a single one of the intents the
// product is actually built around.
//
// `guideRailIntent` looked like it covered this and does not: it feeds
// IntentPartnerPick, which is affiliate inventory, not navigation.
//
// NO ROUTE IS INVENTED HERE. Every href comes from RAILS via railHref(), the
// same builder the rail tiles and the category tabs use, so a segmented route
// can never be linked bare — the indexable soft-404 canonicalised to "/" that
// scripts/check-rail-routes.mjs exists to forbid. Rails with no href, and the
// guides rail (which would point back at the page the reader is on), are
// dropped rather than given a fallback.
//
// Server component on purpose: these are plain anchors and belong in the HTML a
// crawler reads. No "use client", no handlers, nothing to hydrate.
import { RAILS } from "../../lib/rails";
import { railHref } from "../../lib/dayparts";

export default function DiscoveryPaths({ region = "fl", citySlug = null, cityLabel = "", exclude = [] }) {
  const skip = new Set([...(exclude || []), "blog"]);
  const rows = RAILS
    .filter((r) => r && r.href && !skip.has(r.id))
    .map((r) => ({ id: r.id, title: r.title, href: railHref(r, region, citySlug) }))
    .filter((r) => !!r.href);

  if (rows.length < 3) return null;

  const where = cityLabel ? ` near ${cityLabel}` : "";
  return (
    <section className="wf-discovery-paths" aria-labelledby="wf-discovery-paths-h">
      <h2 id="wf-discovery-paths-h" style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9", margin: "0 0 4px" }}>
        Keep exploring{where}
      </h2>
      <p style={{ fontSize: 14, color: "#94A3B8", margin: "0 0 14px" }}>
        Every one of these is a ranked list, not a directory page.
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 8 }}>
        {rows.map((r) => (
          <li key={r.id}>
            <a
              href={r.href}
              style={{
                display: "inline-flex", alignItems: "center", padding: "9px 14px", borderRadius: 999,
                background: "#1C2230", border: "1px solid #2D3748", color: "#CBD5E1",
                fontSize: 13.5, fontWeight: 650, textDecoration: "none", whiteSpace: "nowrap",
              }}
            >
              {r.title}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
