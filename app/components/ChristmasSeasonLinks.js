// "Christmas in Florida this season" links (owner, 2026-11-25): Wayfind's
// busiest Google pages (the Sarasota and Orlando guides, the city things to do
// pages) point readers and Google to the Christmas hub and its overview pages
// while the season runs. Plain server HTML; renders nothing after the season.
import { siteTodayStr } from "../../lib/siteTime";
import { christmasTopicLinks } from "../../lib/christmasTopicPages.js";

const BOX = { margin: "26px 0", padding: "16px 18px", border: "1px solid #3a2b2c", borderRadius: 14, background: "#1b1415" };
const H = { margin: "0 0 8px", fontSize: 19, fontWeight: 800, color: "#fff" };
const P = { margin: "0 0 10px", fontSize: 14.5, color: "#d6c6bd", lineHeight: 1.5 };
const LIST = { display: "flex", flexWrap: "wrap", gap: 8, margin: 0, padding: 0, listStyle: "none" };
const LINK = { display: "inline-flex", alignItems: "center", minHeight: 40, padding: "0 13px", border: "1px solid #4a3536", borderRadius: 999, color: "#efd0a6", fontSize: 14, fontWeight: 700, textDecoration: "none" };

export default function ChristmasSeasonLinks({ today = siteTodayStr(), place = "" }) {
  const topics = christmasTopicLinks(today);
  if (!topics.length) return null;
  return <aside style={BOX} aria-label="Christmas in Florida this season" data-christmas-season-links>
    <h2 style={H}>Christmas in Florida this season</h2>
    <p style={P}>{place ? `Visiting ${place} in December? ` : ""}See every Christmas event in Florida for 2026, with dates, times and tickets.</p>
    <ul style={LIST}>
      <li><a href="/christmas-in-florida" style={LINK}>Christmas events in Florida 2026</a></li>
      {topics.map((l) => <li key={l.href}><a href={l.href} style={LINK}>{l.label.replace(/ 2026$/, "")}</a></li>)}
    </ul>
  </aside>;
}
