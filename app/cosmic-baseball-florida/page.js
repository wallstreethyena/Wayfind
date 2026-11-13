// /cosmic-baseball-florida — the Florida Cosmic Baseball 2027 hub (owner
// mission, 2026-11-12). One page to understand the event, choose a Florida
// date, know how the lottery really works and plan the night. The dates are
// live wf_events rows (lib/cosmicBaseballFlorida.js cosmicFloridaRows), so a
// change to any night reaches this page on the next hourly refresh; each date
// links to its own event page, where nearby food, stays and the map live.
import { cachedCuratedEventList } from "../../lib/curatedEventsCache";
import { isEligible, dateRangeLabel } from "../../lib/curatedEvents";
import { isSsgBuild } from "../../lib/landingInventory";
import { SITE_URL } from "../../lib/site";
import { socialMeta } from "../../lib/socialMeta";
import { pageShareUrl } from "../../lib/pageShareUrl";
import { unstable_noStore as noStore } from "next/cache";
import ReturnToWayfind from "../components/ReturnToWayfind";
import ShareButton from "../components/ShareButton";
import { cachedEventPairings } from "../../lib/eventPairingsCache.js";
import { cachedEventStays } from "../../lib/eventStaysCached.js";
import { pairingHref } from "../../lib/eventPairings.js";
import { WF_PLACE_CARD_CSS } from "../components/css";
import EventStayCards from "../components/EventStayCards";
import {
  cosmicFloridaRows, COSMIC_VENUES, COSMIC_TICKET_STEPS, COSMIC_UNKNOWN,
  COSMIC_LOTTERY_URL, COSMIC_SCHEDULE_URL, COSMIC_FACTS_CHECKED,
  COSMIC_WHAT_IS, COSMIC_LOTTERY_WINDOW, COSMIC_DO_NOW,
} from "../../lib/cosmicBaseballFlorida.js";
import { styleHtml } from "../../lib/styleHtml.js";

export const revalidate = 3600;

// Same cache entry as /florida-events (same label + key), so this page adds no read.
const fetchHubEvents = cachedCuratedEventList("fetchHubEvents", ["florida-events-hub-packed-v3-holiday-discovery"]);

const PATH = "/cosmic-baseball-florida";
const COSMIC_SERIES_PREFIX_ANCHOR = "cosmic-baseball-";
const TITLE = "Cosmic Baseball Florida 2027: Jacksonville, Miami and Tampa Bay Tickets Guide";
const DESC = "Every Florida Cosmic Baseball night in 2027, how the ticket lottery really works (selection is not a ticket), which date fits you, parking, bag rules, food and hotels near each ballpark.";

export const metadata = {
  title: TITLE + " | Wayfind",
  description: DESC,
  ...socialMeta({ title: TITLE, description: DESC, url: SITE_URL + PATH }),
  alternates: { canonical: SITE_URL + PATH },
};

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function weekday(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return "";
  return DAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

const S = {
  page: { maxWidth: 760, margin: "0 auto", padding: "28px 18px 60px", background: "#0D1117", color: "#E6EDF3", fontFamily: "var(--wf-sans)", lineHeight: 1.6 },
  back: { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, background: "#161B22", border: "1px solid #21262D", color: "#FF8A3D", fontSize: 13.5, fontWeight: 800, textDecoration: "none", marginBottom: 18 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#C4A7FF" },
  h1: { fontSize: 30, lineHeight: 1.2, margin: "10px 0 8px", fontWeight: 800, color: "#FFFFFF" },
  sub: { fontSize: 16, color: "#C9D1D9", margin: "0 0 14px" },
  h2: { fontSize: 20, fontWeight: 800, color: "#FFFFFF", margin: "30px 0 10px" },
  h3: { fontSize: 16, fontWeight: 800, color: "#FFFFFF", margin: "16px 0 4px" },
  p: { fontSize: 15, color: "#C9D1D9", margin: "0 0 10px" },
  box: { background: "#161B22", border: "1px solid #30363D", borderRadius: 14, padding: "14px 16px", margin: "0 0 12px" },
  ol: { margin: "6px 0 10px", paddingLeft: 20, fontSize: 15, color: "#C9D1D9" },
  card: { display: "block", background: "#161B22", border: "1px solid #21262D", borderRadius: 14, padding: "13px 15px", marginBottom: 10, textDecoration: "none" },
  when: { fontSize: 12, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: "#FF8A3D", margin: 0 },
  t: { fontSize: 16.5, fontWeight: 800, color: "#FFFFFF", margin: "3px 0 0" },
  meta: { fontSize: 13.5, color: "#8B949E", margin: "4px 0 0" },
  label: { fontWeight: 800, color: "#E6EDF3" },
  link: { color: "#FF8A3D", textDecoration: "none", fontWeight: 700 },
  cta: { display: "inline-block", padding: "11px 18px", borderRadius: 999, background: "#FF8A3D", color: "#0D1117", fontWeight: 800, textDecoration: "none", fontSize: 15, margin: "4px 0 6px" },
  small: { fontSize: 12.5, color: "#8B949E", margin: "6px 0 0" },
  foot: { fontSize: 13.5, color: "#8B949E", marginTop: 34, borderTop: "1px solid #21262D", paddingTop: 16 },
};

export default async function CosmicBaseballFlorida() {
  noStore();
  const now = new Date();
  // Throws on an outage (do not catch): an empty-success page must never be cached.
  const all = isSsgBuild() ? [] : await fetchHubEvents();
  const rows = cosmicFloridaRows(all).filter((e) => isEligible(e, { now }));
  const bySeries = new Map();
  for (const e of rows) {
    const k = e.event_series_id;
    if (!bySeries.has(k)) bySeries.set(k, []);
    bySeries.get(k).push(e);
  }

  // Food and stays per ballpark: the same cached, inventory-only reads the
  // event pages use (no paid lookup). One read per venue, keyed by its first
  // night, so Jacksonville's two nights share one result.
  const nearby = new Map();
  await Promise.all([...bySeries.entries()].map(async ([k, list]) => {
    const first = list[0];
    const ok = Number.isFinite(Number(first.lat)) && Number.isFinite(Number(first.lng));
    const [eat, stay] = ok
      ? await Promise.all([cachedEventPairings(first), cachedEventStays(Number(first.lat), Number(first.lng))])
      : [{ places: [] }, { places: [] }];
    nearby.set(k, {
      eat: (eat?.places || []).slice(0, 4).map((p) => ({ ...p, href: pairingHref(p) })),
      stay: (stay?.places || []).slice(0, 6),
    });
  }));

  const jsonLd = rows.length ? {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: TITLE,
    numberOfItems: rows.length,
    itemListElement: rows.map((e, i) => ({ "@type": "ListItem", position: i + 1, name: `${e.event_name}, ${dateRangeLabel(e)}, ${e.year}`, url: `${SITE_URL}/florida-events/${e.slug}` })),
  } : null;
  const crumbs = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Florida Events", item: `${SITE_URL}/florida-events` },
      { "@type": "ListItem", position: 2, name: "Cosmic Baseball Florida 2027", item: `${SITE_URL}${PATH}` },
    ],
  };

  return (
    <main style={S.page}>
      <style dangerouslySetInnerHTML={styleHtml(WF_PLACE_CARD_CSS + ".wf-cosmic-stays{margin:12px -4px 0;min-width:0}.wf-cosmic-stays:not(:has(.wf-event-place-rail)){display:none}")} />
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} /> : null}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs) }} />
      <ReturnToWayfind style={S.back} />{" "}
      <a style={S.back} href="/florida-events">&lsaquo; Florida Events</a>
      <div style={S.kicker}>Wayfind planner</div>
      <h1 style={S.h1}>Cosmic Baseball in Florida, 2027</h1>
      <p style={S.sub}>{COSMIC_WHAT_IS}</p>
      <ShareButton url={pageShareUrl("/cosmic-baseball-florida")} title={TITLE} text="Every Florida Cosmic Baseball date for 2027, and how the ticket lottery works" label="Share this guide" event="series_hub_share" meta={{ hub: "cosmic-baseball-florida" }} />

      <section style={{ ...S.box, marginTop: 16 }} aria-label="Quick answers">
        <p style={S.p}><span style={S.label}>Where in Florida: </span>{rows.length ? [...bySeries.values()].map((l) => `${l[0].city} (${l.map((e) => dateRangeLabel(e)).join(" and ")})`).join(", ") : "no Florida date is confirmed right now"}.</p>
        <p style={S.p}><span style={S.label}>How to get tickets: </span>only through the organiser&rsquo;s Cosmic Lottery.</p>
        <p style={S.p}><span style={S.label}>Does being selected guarantee a ticket? </span>No. Selection gives you a chance to buy, and only until the game sells out.</p>
        <p style={S.p}><span style={S.label}>When does the lottery open and close? </span>{COSMIC_LOTTERY_WINDOW}</p>
        <p style={{ ...S.p, marginBottom: 0 }}><span style={S.label}>Not announced yet: </span>first pitch, prices, gate times and each night&rsquo;s teams.</p>
      </section>

      <h2 style={S.h2}>The Florida dates</h2>
      {rows.length ? rows.map((e) => (
        <a key={e.event_id} style={S.card} href={`/florida-events/${e.slug}`} data-wf-series-date="1">
          <p style={S.when}>{weekday(e.start_date)}, {dateRangeLabel(e)}, {e.year}</p>
          <p style={S.t}>{e.venue}, {e.city}</p>
          <p style={S.meta}>Tickets by lottery · first pitch not announced · map, food and stays &rsaquo;</p>
        </a>
      )) : <p style={S.p}>No Florida date is currently confirmed. Check the organiser&rsquo;s <a style={S.link} href={COSMIC_SCHEDULE_URL} rel="nofollow noopener" target="_blank">schedule</a>.</p>}

      <h2 style={S.h2}>How tickets actually work</h2>
      <div style={S.box}>
        <ol style={S.ol}>{COSMIC_TICKET_STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
        <a style={S.cta} href={COSMIC_LOTTERY_URL} rel="nofollow noopener" target="_blank" data-wf-outbound-ticket="organizer" data-wf-content-id="cosmic-baseball-florida">Enter the ticket lottery ↗</a>
        <p style={S.small}>Wayfind does not sell Cosmic Baseball tickets. This button opens the organiser&rsquo;s own lottery page.</p>
      </div>

      <h2 style={S.h2}>What to do now</h2>
      <ol style={S.ol}>{COSMIC_DO_NOW.map((s) => <li key={s}>{s}</li>)}</ol>

      <h2 style={S.h2}>Which Florida date is best for you</h2>
      {[...bySeries.keys()].map((k) => {
        const v = COSMIC_VENUES[k];
        if (!v) return null;
        const list = bySeries.get(k);
        const dates = list.map((e) => `${weekday(e.start_date)} ${dateRangeLabel(e)}`).join(" and ");
        const nb = nearby.get(k) || { eat: [], stay: [] };
        return (
          <section key={k} style={S.box} id={`venue-${k.replace(COSMIC_SERIES_PREFIX_ANCHOR, "")}`}>
            <p style={S.when}>{dates}</p>
            <h3 style={{ ...S.h3, marginTop: 2 }}>Cosmic Baseball {v.city === "St. Petersburg" ? "Tampa Bay" : v.city}: {v.venue}</h3>
            <p style={S.p}>{v.pick}</p>
            <p style={S.p}><span style={S.label}>Parking and transit: </span>{v.getThere}</p>
            <p style={S.p}><span style={S.label}>Bag rules: </span>{v.bring}</p>
            <p style={S.p}><span style={S.label}>Gates: </span>{v.gates} Cosmic night gate times are not announced.</p>
            <p style={S.p}><span style={S.label}>Accessibility and sensory: </span>{v.access} The show itself is black lights, loud music and effects.</p>
            {nb.eat.length ? (<>
              <p style={{ ...S.p, marginBottom: 4 }}><span style={S.label}>Eat and drink nearby</span> (ranked by Wayfind):</p>
              <ul style={{ ...S.ol, listStyle: "disc" }}>
                {nb.eat.map((p) => <li key={p.id}><a style={S.link} href={p.href}>{p.name}</a>{p.outing?.slotLabel ? ` · ${p.outing.slotLabel}` : ""}{Number.isFinite(p.distMi) ? ` · ${p.distMi < 0.1 ? "next door" : p.distMi.toFixed(1) + " mi"}` : ""}</li>)}
              </ul>
            </>) : null}
            <p style={S.p}>
              {list.map((e, i) => (
                <span key={e.event_id}>{i ? " · " : ""}<a style={S.link} href={`/florida-events/${e.slug}`}>Plan {weekday(e.start_date)}: map and more nearby &rsaquo;</a></span>
              ))}
            </p>
            <p style={S.small}>
              Sources: {v.sources.map((u, i) => <span key={u}>{i ? ", " : ""}<a style={{ ...S.link, fontWeight: 600 }} href={u} rel="nofollow noopener" target="_blank">{new URL(u).hostname.replace(/^www\./, "")}</a></span>)}
            </p>
            {nb.stay.length ? (
              <div className="wf-cosmic-stays">
                <EventStayCards places={nb.stay} title={`Where to stay near ${v.venue}`} description="Top stays within 12 miles, ranked by Wayfind." label={`Hotels near ${v.venue}`} />
              </div>
            ) : null}
          </section>
        );
      })}

      <h2 style={S.h2}>Not announced yet</h2>
      <p style={S.p}>{COSMIC_UNKNOWN} Wayfind rechecks these dates and updates this page when the organiser or the ballpark publishes them.</p>

      <p style={S.small}>Venue rules above are each ballpark&rsquo;s normal game day rules and can change for a special event; check again closer to your date.</p>

      <p style={S.foot}>
        Dates checked against the organiser&rsquo;s <a style={S.link} href={COSMIC_SCHEDULE_URL} rel="nofollow noopener" target="_blank">schedule</a> and <a style={S.link} href={COSMIC_LOTTERY_URL} rel="nofollow noopener" target="_blank">lottery page</a>; venue details checked {COSMIC_FACTS_CHECKED} on each ballpark&rsquo;s own site. More in <a style={S.link} href="/florida-events">Florida Events</a>.
      </p>
    </main>
  );
}
