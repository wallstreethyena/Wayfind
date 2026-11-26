// An event that has finished keeps its page (owner, 2026-11-25). Before this
// its URL answered "page not found" (447 such URLs in Search Console), which
// throws away the ranking next year's edition needs. The page says plainly
// that it ended, offers the organizer's site for future dates, and points to
// what is on next nearby. No Event structured data: Google wants Event markup
// only for an upcoming event.
import { dateRangeLabel, eventWebsiteUrl } from "../../../lib/curatedEvents";
import { eventTitleWithYear } from "../../../lib/eventTitle.js";
import { christmasTopicForEvent, christmasTopicPath } from "../../../lib/christmasTopicPages.js";

const S = {
  page: { maxWidth: 720, margin: "0 auto", padding: "28px 18px 60px", background: "#0D1117", color: "#E6EDF3", fontFamily: "var(--wf-sans)", lineHeight: 1.65, minHeight: "70vh" },
  crumbs: { fontSize: 13, color: "#8B949E", margin: "0 0 14px" },
  crumbLink: { color: "#8B949E", textDecoration: "none" },
  h1: { fontSize: "clamp(26px,6.5vw,36px)", lineHeight: 1.2, margin: "0 0 10px", color: "#fff", fontFamily: "Georgia,serif" },
  ended: { display: "inline-block", margin: "0 0 14px", padding: "4px 10px", borderRadius: 999, background: "#2a1f12", color: "#fbbf24", fontSize: 13, fontWeight: 800 },
  p: { margin: "0 0 14px", fontSize: 15.5, color: "#cbd5df" },
  btnRow: { display: "flex", flexWrap: "wrap", gap: 10, margin: "6px 0 26px" },
  btn: { display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 16px", borderRadius: 12, border: "1px solid #2d3743", background: "#151c25", color: "#E6EDF3", fontWeight: 800, fontSize: 14.5, textDecoration: "none" },
  h2: { fontSize: 20, margin: "0 0 10px", color: "#fff" },
  list: { margin: 0, padding: 0, listStyle: "none" },
  item: { padding: "10px 0", borderBottom: "1px solid #1d2630" },
  itemLink: { color: "#fff", fontWeight: 700, textDecoration: "none" },
  itemMeta: { display: "block", fontSize: 13.5, color: "#8B949E" },
};

export function endedEventDescription(e) {
  const when = dateRangeLabel(e);
  return `${eventTitleWithYear(e.event_name, e.year)} in ${e.city || "Florida"} has ended${when ? ` (${when})` : ""}. See the organizer's site for future dates and what is on next nearby.`.slice(0, 155);
}

export default function EndedEvent({ e, upcoming = [] }) {
  const name = eventTitleWithYear(e.event_name, e.year);
  const when = dateRangeLabel(e);
  const site = eventWebsiteUrl(e) || null;
  const topic = christmasTopicForEvent(e);
  const where = [e.venue && e.venue !== e.city ? e.venue : null, e.city].filter(Boolean).join(", ");
  const summary = e.editorial_summary || e.card_hook || "";
  return <main style={S.page} data-ended-event={e.slug}>
    <nav style={S.crumbs} aria-label="Breadcrumb"><a href="/" style={S.crumbLink}>Wayfind</a> › <a href="/florida-events" style={S.crumbLink}>Florida Events</a> › {e.event_name}</nav>
    <h1 style={S.h1}>{name}</h1>
    <span style={S.ended}>This event has ended</span>
    <p style={S.p}>{name}{where ? ` at ${where}` : ""} {when ? `ran ${when}` : "has finished"}. {summary}</p>
    <p style={S.p}>When the organizer announces the next dates, Wayfind lists them here.</p>
    <div style={S.btnRow}>
      {site ? <a href={site} target="_blank" rel="nofollow noopener" style={S.btn}>Organizer's site for future dates ↗</a> : null}
      {topic ? <a href={christmasTopicPath(topic.slug)} style={S.btn}>{topic.h1}</a> : null}
      <a href="/florida-events" style={S.btn}>Upcoming Florida events</a>
    </div>
    {upcoming.length ? <section aria-label={`Upcoming events in ${e.city}`}>
      <h2 style={S.h2}>On next in {e.city}</h2>
      <ul style={S.list}>
        {upcoming.map((u) => <li key={u.slug} style={S.item}>
          <a href={"/florida-events/" + u.slug} style={S.itemLink}>{eventTitleWithYear(u.event_name, u.year)}</a>
          <span style={S.itemMeta}>{[dateRangeLabel(u), u.venue].filter(Boolean).join(" · ")}</span>
        </li>)}
      </ul>
    </section> : null}
  </main>;
}
