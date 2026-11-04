import { unstable_cache } from "next/cache";
import GoScreen from "../components/GoScreen";
import CardPhoto from "../components/CardPhoto.js";
import ShareButton from "../components/ShareButton";
import { pageShareUrl } from "../../lib/pageShareUrl";
import { SITE_URL } from "../../lib/site";
import { siteTodayStr } from "../../lib/siteTime";
import { EVENT_WINDOWS } from "../../lib/eventsList";
import { LANDING_CITIES } from "../../lib/landingCities";
import { eventVenueImageSrc } from "../../lib/eventPageImage.js";
import { packForCache, unpackFromCache } from "../../lib/cachePack.js";
import {
  fetchCuratedEvents,
  isEligible,
  isFloridaEvent,
  dateRangeLabel,
} from "../../lib/curatedEvents";

// /events is a real, indexable page: the next 14 days of verified Florida
// events from the curated layer (wf_events), server-rendered so a crawler reads
// every card without running JavaScript. The GoScreen handoff and the
// "Open in Wayfind" link keep the in-app events screen exactly as it was.
export const revalidate = 900;

const TITLE = "Florida Events This Week and This Weekend | Wayfind";
const DESC = "Verified Florida events for the next 14 days, grouped by day: concerts, festivals, markets and family outings with the venue, city and date.";

const _og = SITE_URL + "/api/og?t=" + encodeURIComponent("Florida events this week and this weekend");

export const metadata = {
  title: TITLE,
  description: DESC,
  robots: { index: true, follow: true },
  alternates: { canonical: "https://www.gowayfind.com/events" },
  openGraph: { title: TITLE, description: DESC, url: SITE_URL + "/events", siteName: "Wayfind", type: "website", images: [{ url: _og, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC, images: [_og] },
};

const WINDOW_DAYS = 14;
// A run longer than this is a season, not an event for this week.
const MAX_RUN_DAYS = 30;
const PER_GROUP_CAP = 24;
// Only cities that actually have an /events/<city>/this-weekend page.
const WEEKEND_CITIES = ["tampa", "sarasota", "orlando", "bradenton"].filter((c) => LANDING_CITIES[c]);

// Packed + scrubbed like /florida-events (lib/cachePack.js): never hand the
// data cache a raw row list. The key carries the day, so the window rolls at
// midnight ET instead of waiting out the lifetime.
function upcomingReader(today) {
  const read = unstable_cache(
    async () => packForCache("events-hub", await fetchCuratedEvents({ fresh: true, upcomingFrom: today })),
    ["events-hub-14d-v1", today],
    { revalidate: 900, tags: ["curated-events"] },
  );
  return async () => unpackFromCache(await read());
}

function addDays(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  // Pure calendar arithmetic on a date string already in ET; no clock is read here.
  const p2 = (n) => String(n).padStart(2, "0");
  return t.getUTCFullYear() + "-" + p2(t.getUTCMonth() + 1) + "-" + p2(t.getUTCDate());
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function dayLabel(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] + ", " + MONTHS[m - 1] + " " + d;
}
function dowOf(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Today, tomorrow, the rest of this week (through the coming Sunday), then next week.
function groupFor(day, today) {
  if (day === today) return "today";
  if (day === addDays(today, 1)) return "tomorrow";
  const untilSunday = (7 - dowOf(today)) % 7; // days from today to this week's Sunday
  return day <= addDays(today, untilSunday) ? "week" : "next";
}
const GROUPS = [
  { key: "today", title: "Today" },
  { key: "tomorrow", title: "Tomorrow" },
  { key: "week", title: "Later this week" },
  { key: "next", title: "Next week" },
];

function eventsForWindow(rows, today) {
  const last = addDays(today, WINDOW_DAYS - 1);
  const out = [];
  for (const e of rows) {
    if (!isFloridaEvent(e) || !isEligible(e, { now: new Date() })) continue;
    const start = e.start_date;
    const end = e.end_date || e.start_date;
    if (!start || start > last || end < today) continue;
    if (start < today && Date.parse(end) - Date.parse(start) > MAX_RUN_DAYS * 86400000) continue;
    out.push({ e, day: start < today ? today : start });
  }
  out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : (b.e.editorial_score || 0) - (a.e.editorial_score || 0)));
  return out;
}

const S = {
  page: { maxWidth: 760, margin: "0 auto", padding: "28px 18px 60px", background: "#0D1117", color: "#E6EDF3", fontFamily: "var(--wf-sans)", lineHeight: 1.6 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#FF8A3D" },
  h1: { fontSize: 30, lineHeight: 1.2, margin: "10px 0 8px", fontWeight: 800, color: "#FFFFFF" },
  sub: { fontSize: 16, color: "#8B949E", marginBottom: 14 },
  open: { color: "#FF8A3D", fontWeight: 800, textDecoration: "none" },
  group: { fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#8ED6C4", margin: "30px 0 10px" },
  day: { fontSize: 13.5, fontWeight: 700, color: "#C9D1D9", margin: "14px 0 8px" },
  card: { display: "block", borderRadius: 14, background: "#161B22", border: "1px solid #21262D", marginBottom: 12, textDecoration: "none", overflow: "hidden" },
  imgWrap: { position: "relative", width: "100%", aspectRatio: "16 / 9", background: "#0D1117" },
  img: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  badge: { position: "absolute", top: 10, left: 10, background: "rgba(4,8,16,.74)", color: "#FF8A3D", fontSize: 12, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", borderRadius: 999, padding: "5px 11px" },
  cbody: { padding: "12px 15px 14px" },
  textOnly: { display: "block", borderRadius: 14, background: "#161B22", border: "1px solid #21262D", marginBottom: 12, textDecoration: "none", padding: "12px 15px 14px" },
  when: { fontSize: 12, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: "#FF8A3D", margin: 0 },
  t: { fontSize: 16.5, fontWeight: 800, color: "#FFFFFF", margin: "3px 0 0" },
  meta: { fontSize: 13, color: "#8B949E", margin: "4px 0 0" },
  foot: { fontSize: 14.5, color: "#8B949E", marginTop: 34, borderTop: "1px solid #21262D", paddingTop: 16 },
  link: { color: "#FF8A3D", textDecoration: "none", fontWeight: 700 },
};

function Card({ e }) {
  const img = e.hero_image || eventVenueImageSrc(e) || "";
  const where = [e.venue, e.city].filter(Boolean).join(", ");
  const body = (
    <>
      <p style={S.when}>{dateRangeLabel(e)}</p>
      <p style={S.t}>{e.event_name}</p>
      {where ? <p style={S.meta}>{where}</p> : null}
    </>
  );
  return (
    <a href={"/florida-events/" + e.slug} style={img ? S.card : S.textOnly}>
      {img ? (
        <>
          <div style={S.imgWrap}>
            <CardPhoto inLink src={img} alt="" style={S.img} fallbackCategory="events" />
            <span style={S.badge}>{dateRangeLabel(e)}</span>
          </div>
          <div style={S.cbody}>
            <p style={S.t}>{e.event_name}</p>
            {where ? <p style={S.meta}>{where}</p> : null}
          </div>
        </>
      ) : body}
    </a>
  );
}

export default async function Page() {
  const today = siteTodayStr();
  // Throws CuratedEventsUnavailableError on an outage: a failed read must not
  // render (or ISR-cache) an empty-success page.
  const rows = await upcomingReader(today)();
  const list = eventsForWindow(rows, today);
  const grouped = new Map(GROUPS.map((g) => [g.key, new Map()]));
  for (const { e, day } of list) {
    const byDay = grouped.get(groupFor(day, today));
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(e);
  }
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Florida events in the next 14 days",
    numberOfItems: list.length,
    itemListElement: list.slice(0, 30).map(({ e }, i) => ({
      "@type": "ListItem", position: i + 1, name: e.event_name, url: `${SITE_URL}/florida-events/${e.slug}`,
    })),
  };
  return (
    <div style={S.page}>
      <GoScreen screen="events" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div style={S.kicker}>Wayfind Events</div>
      <h1 style={S.h1}>Florida Events This Week and This Weekend</h1>
      <p style={S.sub}>
        The next 14 days of verified events across Florida, grouped by day. Every card links to the full event page.{" "}
        <a href="/?go=events" style={S.open}>Open in Wayfind ›</a>
      </p>

      <div style={{ margin: "0 0 18px" }}>
        <ShareButton
          url={pageShareUrl("/events")}
          title="Florida events this week"
          text="Verified Florida events for the next 14 days. Found on Wayfind."
          label="Share"
          tone="dark"
          event="page_share"
          meta={{ surface: "events_hub", placement: "header" }}
        />
      </div>

      {list.length === 0 ? <p style={S.sub}>Nothing verified is coming up in the next 14 days. Check the full calendar on the <a style={S.link} href="/florida-events">Florida events page</a>.</p> : null}

      {GROUPS.map((g) => {
        const days = [...grouped.get(g.key).entries()];
        if (!days.length) return null;
        let shown = 0;
        return (
          <section key={g.key}>
            <h2 style={S.group}>{g.title}</h2>
            {days.map(([day, evs]) => {
              const room = Math.max(0, PER_GROUP_CAP - shown);
              const take = evs.slice(0, room);
              shown += take.length;
              if (!take.length) return null;
              return (
                <div key={day}>
                  {g.key === "week" || g.key === "next" ? <h3 style={S.day}>{dayLabel(day)}</h3> : null}
                  {take.map((e) => <Card key={e.event_id} e={e} />)}
                </div>
              );
            })}
          </section>
        );
      })}

      <p style={S.foot}>
        {EVENT_WINDOWS["this-weekend"].label} by city:{" "}
        {WEEKEND_CITIES.map((c, i) => (
          <span key={c}>
            {i ? ", " : ""}
            <a style={S.link} href={`/events/${c}/this-weekend`}>{LANDING_CITIES[c].name}</a>
          </span>
        ))}
        . Looking further out? See the full <a style={S.link} href="/florida-events">Florida events calendar</a> or browse <a style={S.link} href="/guides">local guides</a>.
      </p>
    </div>
  );
}
