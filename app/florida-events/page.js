// v7.45 — The Florida Events hub. Server-rendered so crawlers read every card
// and every date without executing JavaScript.
//
// This is the CURATED layer (wf_events), not the live aggregator. Every row
// here is hand-verified against a Tier 1 source and carries an editorial hook,
// which is the whole difference between this page and a municipal calendar.
import { SITE_URL } from "../../lib/site";
import { fetchCuratedEvents, buildRail, dateRangeLabel, isEligible } from "../../lib/curatedEvents";

export const revalidate = 3600;

const TITLE = "Florida Events 2026: What's Actually Worth Going To";
const DESC = "Verified dates for Florida's best festivals and events — Halloween Horror Nights, Fantasy Fest, Hulaween, EDC Orlando, Gasparilla and more. Checked against official sources, never rolled forward from last year.";
const _og = SITE_URL + "/api/og?t=" + encodeURIComponent("Florida events, with dates we actually checked");

export const metadata = {
  title: TITLE + " | Wayfind",
  description: DESC,
  openGraph: { title: TITLE, description: DESC, url: SITE_URL + "/florida-events", siteName: "Wayfind", images: [{ url: _og, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, images: [_og] },
  alternates: { canonical: SITE_URL + "/florida-events" },
};

const S = {
  page: { maxWidth: 760, margin: "0 auto", padding: "28px 18px 60px", background: "#0D1117", color: "#E6EDF3", fontFamily: "var(--wf-sans)", lineHeight: 1.6 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#FF8A3D" },
  h1: { fontSize: 30, lineHeight: 1.2, margin: "10px 0 8px", fontWeight: 800, color: "#FFFFFF" },
  sub: { fontSize: 16, color: "#8B949E", marginBottom: 26 },
  railTitle: { fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#8ED6C4", margin: "30px 0 4px" },
  railSub: { fontSize: 13.5, color: "#8B949E", margin: "0 0 12px" },
  // v8.42 — image-forward place cards. The hero photo is the venue's own
  // Google photo (hero_image → /api/photo?place=…); the badge over it is the
  // DATE, never a Wayfind Score — an event is dated, not quality-ranked, and
  // the place-card score slot would be a claim the app is forbidden to make on
  // an event (see the events-card rule / test-event-rail-images).
  card: { display: "block", borderRadius: 14, background: "#161B22", border: "1px solid #21262D", marginBottom: 12, textDecoration: "none", overflow: "hidden" },
  imgWrap: { position: "relative", width: "100%", aspectRatio: "16 / 9", background: "#0D1117" },
  img: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  imgFallback: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(145deg,#1B2433,#0E1520)", color: "#8ED6C4", fontSize: 34, fontWeight: 800 },
  badge: { position: "absolute", top: 10, left: 10, background: "rgba(4,8,16,.74)", color: "#FF8A3D", fontSize: 12, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", borderRadius: 999, padding: "5px 11px" },
  cbody: { padding: "12px 15px 14px" },
  when: { fontSize: 12, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: "#FF8A3D", margin: 0 },
  t: { fontSize: 16.5, fontWeight: 800, color: "#FFFFFF", margin: "3px 0 0" },
  hook: { fontSize: 13.5, color: "#C9D1D9", margin: "4px 0 0" },
  meta: { fontSize: 12.5, color: "#8B949E", margin: "5px 0 0" },
  foot: { fontSize: 14.5, color: "#8B949E", marginTop: 34, borderTop: "1px solid #21262D", paddingTop: 16 },
  link: { color: "#FF8A3D", textDecoration: "none", fontWeight: 700 },
  // v8.88 — the hub was a dead end too. Same pill as /guides and every event
  // page, so the way out of any Wayfind content surface looks identical.
  back: {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px",
    borderRadius: 999, background: "#161B22", border: "1px solid #21262D",
    color: "#FF8A3D", fontSize: 13.5, fontWeight: 800, textDecoration: "none",
    marginBottom: 18,
  },
};

// v8.40 — "major-music-festivals" sits BELOW the three time-driven shelves and
// above the evergreen ones, which is what it is: not this weekend, not the next
// six weeks, but the set a reader plans a year around. Placing it any higher
// would push a June-2027 festival above a Halloween event six weeks out.
const RAILS = ["this-weekend", "spooky-season", "coming-up", "florida-icons", "major-music-festivals", "only-in-florida", "live-music", "bring-the-kids", "food-festivals"];

export default async function FloridaEventsHub() {
  const all = await fetchCuratedEvents();
  const now = new Date();
  const ctx = { now, size: 8 };

  const rails = RAILS.map((k) => buildRail(k, all, ctx)).filter(Boolean);
  const eligible = all.filter((e) => isEligible(e, { now }));

  // ItemList on the hub; the individual Event schema lives on each event page,
  // which is what Google asks for.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: TITLE,
    numberOfItems: eligible.length,
    itemListElement: eligible.slice(0, 30).map((e, i) => ({
      "@type": "ListItem", position: i + 1, name: e.event_name,
      url: `${SITE_URL}/florida-events/${e.slug}`,
    })),
  };

  return (
    <main style={S.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <a style={S.back} href="/">&lsaquo; Back to Wayfind</a>
      <div style={S.kicker}>Wayfind Events</div>
      <h1 style={S.h1}>Florida Events</h1>
      <p style={S.sub}>
        Every date here was checked against the organiser&rsquo;s own site. When an event has not
        announced its next edition, we say so rather than moving last year&rsquo;s date forward twelve months.
      </p>

      {rails.length === 0 ? (
        <p style={S.sub}>Nothing verified is coming up right now. Rather than pad this page, we have left it empty.</p>
      ) : null}

      {rails.map((rail) => (
        <section key={rail.key}>
          <div style={S.railTitle}>{rail.title}</div>
          {rail.subtitle ? <p style={S.railSub}>{rail.subtitle}</p> : null}
          {rail.cards.map((e) => (
            <a key={e.event_id} href={"/florida-events/" + e.slug} style={S.card}>
              <div style={S.imgWrap}>
                {e.hero_image
                  ? <img src={e.hero_image} alt="" loading="lazy" style={S.img} />
                  : <div style={S.imgFallback} aria-hidden="true">{(e.short_title || e.event_name || "?").trim().charAt(0)}</div>}
                <span style={S.badge}>{dateRangeLabel(e)}</span>
              </div>
              <div style={S.cbody}>
                <p style={S.when}>{e.city}</p>
                <p style={S.t}>{e.event_name}</p>
                <p style={S.hook}>{e.card_hook}</p>
                <p style={S.meta}>
                  {e.is_free ? "Free" : e.price_band || ""}
                  {e.wayfind_verdict ? (e.is_free || e.price_band ? " · " : "") + e.wayfind_verdict : ""}
                </p>
              </div>
            </a>
          ))}
        </section>
      ))}

      <p style={S.foot}>
        Planning around one of these? Our city guides cover what else to do while you are there —{" "}
        <a style={S.link} href="/guides/things-to-do-in-tampa-florida">Tampa</a>,{" "}
        <a style={S.link} href="/guides/things-to-do-in-sarasota-florida">Sarasota</a> and{" "}
        <a style={S.link} href="/guides/things-to-do-in-parrish-florida">Parrish</a>.
      </p>
    </main>
  );
}
