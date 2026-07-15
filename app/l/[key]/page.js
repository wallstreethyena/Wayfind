import { cache } from "react";
import ShareRedirect from "../../ShareRedirect";
import { SITE_URL } from "../../../lib/site";
import { getLatestSnapshot, isStale } from "../../../lib/listStore";
import { shareCardFor, wcRotation } from "../../../lib/shareCards";

const SITE = SITE_URL;
const INK = "#0A0B0D", WHITE = "#FFFFFF", ORANGE = "#FF6B1A", MUTE = "#6E757D", SOFT = "#AEB6BD", HAIR = "#1E2126";

function s(v) { return Array.isArray(v) ? v[0] || "" : v || ""; }

// One snapshot read per request, shared by generateMetadata and the page.
const latestOf = cache((key) => getLatestSnapshot(key));

function humanizeAgo(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "recently";
  const mins = Math.max(1, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return mins + (mins === 1 ? " minute" : " minutes");
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + (hrs === 1 ? " hour" : " hours");
  const days = Math.round(hrs / 24);
  return days + (days === 1 ? " day" : " days");
}

export async function generateMetadata({ params, searchParams }) {
  const snap = await latestOf(params.key);
  // A real list slug: rich, snapshot-versioned preview. Still noindex (the /l
  // space stays out of the index by policy; the value here is the share, not SEO).
  if (snap && snap.card && snap.list) {
    const title = (snap.card.hook && Array.isArray(snap.card.hook.lines) ? snap.card.hook.lines.join(" ") : snap.list.headline) || "A ranked list";
    const desc = snap.list.og_description || snap.list.subhead || "A ranked local list on Wayfind.";
    const og = `/api/og/${encodeURIComponent(snap.slug)}?v=${snap.v}`;
    return {
      robots: { index: false, follow: true },
      metadataBase: new URL(SITE),
      title: title + " — Wayfind",
      description: desc,
      openGraph: { title, description: desc, images: [{ url: og, width: 1200, height: 630 }] },
      twitter: { card: "summary_large_image", title, description: desc, images: [og] },
    };
  }
  // Otherwise the original share/app-state behavior — upgraded (v6.17) with
  // the per-category discovery card when this key has one: the preview swaps
  // to that tab's artwork and copy (lib/shareCards.js), all still live text.
  const card = shareCardFor(params.key);
  const rotN = s(searchParams.rot);
  // v6.25 — the World Cup card's copy rotates; the shared link's preview must
  // match the exact variant chosen at share time (carried in ?rot=).
  const wc = card && card.custom === "worldcup" ? wcRotation(rotN) : null;
  const t = (wc && wc.title) || s(searchParams.t) || (card && card.title) || "Top picks near you";
  const n = s(searchParams.n);
  const loc = s(searchParams.loc);
  const hk = s(searchParams.hk);
  const desc = wc
    ? wc.desc
    : card
      ? card.desc + (n ? " · " + n + " spots inside" : "") + (loc ? " · " + loc : "")
      : (n ? "Top " + n + " picks" : "A ranked list") + (loc ? " in " + loc : "") + " · Tap to open on Wayfind";
  let og = "/api/og?kind=list&t=" + encodeURIComponent(t);
  if (card) og += "&card=" + encodeURIComponent(params.key === "hol-worldcup" ? "worldcup" : params.key);
  if (wc && rotN) og += "&rot=" + encodeURIComponent(rotN);
  if (n) og += "&n=" + n;
  if (loc) og += "&loc=" + encodeURIComponent(loc);
  if (hk) og += "&hk=" + encodeURIComponent(hk);
  return {
    robots: { index: false, follow: true }, // share/app-state URLs: infinite query space, not for the index (SEO audit July 2026)
    metadataBase: new URL(SITE),
    title: t + " — Wayfind",
    description: desc,
    openGraph: { title: t, description: desc, images: [{ url: og, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: t, description: desc, images: [og] },
  };
}

function ListView({ snap, shownV }) {
  const list = snap.list || {};
  const items = Array.isArray(list.items) ? list.items : [];
  const stale = isStale(shownV, snap.v);
  const headline = (snap.card && snap.card.hook && Array.isArray(snap.card.hook.lines)) ? snap.card.hook.lines.join(" ") : (list.headline || "");
  return (
    <main style={{ minHeight: "100dvh", background: INK, color: WHITE, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", padding: "0 20px", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: "100%", maxWidth: 640, paddingBottom: 56 }}>
        {stale ? (
          // The staleness banner: the highest-value line on the page. It turns a
          // stale share into proof the product is alive.
          <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(255,107,26,.12)", border: "1px solid rgba(255,107,26,.5)", borderRadius: 12, color: "#FFD2B3", fontSize: 14, fontWeight: 600, lineHeight: 1.45 }}>
            This list changed {humanizeAgo(snap.generated_at)} ago. The #1 is different now.
          </div>
        ) : null}

        <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "26px 0 18px" }}>
          <svg width="20" height="20" viewBox="0 0 24 24"><path fill={ORANGE} d="M12 2C7.58 2 4 5.58 4 10c0 5.25 6.94 11.4 7.24 11.66a1.15 1.15 0 0 0 1.52 0C13.06 21.4 20 15.25 20 10c0-4.42-3.58-8-8-8Z" /><circle cx="12" cy="10" r="3" fill={INK} /></svg>
          <span style={{ fontWeight: 800, letterSpacing: 2.4, fontSize: 14, color: WHITE }}>WAYFIND</span>
        </div>

        <h1 style={{ fontSize: 34, lineHeight: 1.12, fontWeight: 800, letterSpacing: "-0.5px", margin: "0 0 10px" }}>{headline}</h1>
        {list.subhead ? <p style={{ fontSize: 16, color: SOFT, lineHeight: 1.5, margin: "0 0 22px" }}>{list.subhead}</p> : null}

        <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((it) => (
            <li key={it.rank} style={{ display: "flex", gap: 14, padding: "16px 0", borderTop: "1px solid " + HAIR }}>
              <span style={{ flexShrink: 0, width: 30, fontSize: 20, fontWeight: 800, color: ORANGE }}>{it.rank}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 18, fontWeight: 700, color: WHITE }}>{it.name}{it.contrarian ? <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: ORANGE, letterSpacing: 1 }}>THE ARGUMENT</span> : null}</span>
                {it.verdict ? <span style={{ display: "block", fontSize: 15, color: SOFT, marginTop: 3, lineHeight: 1.45 }}>{it.verdict}</span> : null}
                {it.reason ? <span style={{ display: "block", fontSize: 13.5, color: MUTE, marginTop: 4, lineHeight: 1.45 }}>{it.reason}</span> : null}
              </span>
            </li>
          ))}
        </ol>

        {list.method ? <p style={{ fontSize: 13, color: MUTE, lineHeight: 1.5, margin: "22px 0 0", paddingTop: 18, borderTop: "1px solid " + HAIR }}>{list.method}</p> : null}

        <a href={SITE + "/"} style={{ display: "inline-flex", alignItems: "center", marginTop: 24, padding: "13px 22px", background: ORANGE, color: INK, fontSize: 15, fontWeight: 800, borderRadius: 999, textDecoration: "none" }}>Find more on Wayfind</a>
      </div>
    </main>
  );
}

export default async function Page({ params, searchParams }) {
  const snap = await latestOf(params.key);
  if (snap && snap.list && Array.isArray(snap.list.items) && snap.list.items.length) {
    return <ListView snap={snap} shownV={s(searchParams && searchParams.v)} />;
  }
  return <ShareRedirect to={"/?exp=" + encodeURIComponent(params.key)} />;
}
