import { SITE_URL } from "../../../lib/site";
import { styleHtml } from "../../../lib/styleHtml.js";
import CommerceClickBeacon from "../../components/CommerceClickBeacon";
import ShareButton from "../../components/ShareButton";
import { browseTicketFields } from "../../../lib/christmasTickets.js";
import { christmasTopicData } from "../../../lib/christmasTopicData.js";
import {
  CHRISTMAS_TOPIC_SLUGS, christmasTopicPage, christmasTopicPath, christmasTopicCards, christmasTopicRows,
  groupChristmasTopicCards, christmasTopicSchema, christmasTopicLinks, christmasTopicMap, christmasTopicLongDate,
} from "../../../lib/christmasTopicPages.js";
import { FLORIDA_MAP_PATH, FLORIDA_MAP_W, FLORIDA_MAP_H } from "../../../lib/floridaMap.js";

// Christmas overview pages (owner, 2026-11-25): one page per search people
// type ("florida christmas parades 2026", "zoo lights 2026", "nutcracker
// florida"), listing every matching listing from the statewide Christmas
// directory with a link to its own event page. lib/christmasTopicPages.js has
// the why and the Search Console numbers.
//
// One cached copy per topic, refreshed in the background like the hub
// (/christmas-in-florida). The page reads nothing from the request.
export const revalidate = 900;
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return CHRISTMAS_TOPIC_SLUGS.map((topic) => ({ topic }));
}

export function generateMetadata({ params }) {
  const topic = christmasTopicPage(params.topic);
  if (!topic) return {};
  const url = SITE_URL + christmasTopicPath(topic.slug);
  const imageUrl = SITE_URL + "/christmas/share-christmas-v1.png";
  const imageAlt = topic.h1 + " on Wayfind";
  return {
    title: topic.title + " | Wayfind",
    description: topic.description,
    keywords: topic.keywords,
    alternates: { canonical: url },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
    openGraph: { title: topic.title, description: topic.description, url, siteName: "Wayfind", type: "website", images: [{ url: imageUrl, alt: imageAlt, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: topic.title, description: topic.description, images: [{ url: imageUrl, alt: imageAlt }] },
  };
}

const CSS = `
.xt{max-width:780px;margin:0 auto;padding:22px 16px 64px;color:#E6EDF3;font-family:var(--wf-sans,system-ui,sans-serif);line-height:1.6}
.xt a{color:#efd0a6}
.xt-crumbs{font-size:13px;color:#9aa4ae;margin:0 0 14px}
.xt-crumbs a{color:#9aa4ae;text-decoration:none}
.xt h1{font-family:Georgia,serif;font-size:clamp(28px,7vw,40px);line-height:1.15;margin:0 0 12px;color:#fff}
.xt-intro{font-size:16px;color:#cbd5df;margin:0 0 16px}
.xt-count{font-size:14px;color:#9aa4ae;margin:0 0 18px}
.xt-jump{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 26px;padding:0;list-style:none}
.xt-jump a{display:inline-block;padding:7px 12px;border:1px solid #2d3743;border-radius:999px;font-size:13.5px;text-decoration:none;color:#E6EDF3;background:#151c25}
.xt-region{margin:0 0 30px;scroll-margin-top:72px}
.xt-region h2{font-size:21px;margin:0 0 10px;color:#fff;border-bottom:1px solid #26303B;padding-bottom:6px}
.xt-row{padding:14px 0;border-bottom:1px solid #1d2630}
.xt-row h3{margin:0 0 4px;font-size:17px;line-height:1.35}
.xt-row h3 a{color:#fff;text-decoration:none}
.xt-where{margin:0;font-size:14px;color:#9aa4ae}
.xt-when{margin:4px 0 0;font-size:14.5px;color:#E6EDF3}
.xt-price{color:#86efac;font-weight:700}
.xt-acts{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}
.xt-btn{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:12px;font-size:14.5px;font-weight:800;text-decoration:none}
.xt-btn-tix{background:#FACC15;color:#111 !important}
.xt-btn-more{border:1px solid #2d3743;color:#E6EDF3 !important;background:#151c25}
.xt-empty{padding:18px;border:1px solid #26303B;border-radius:14px;background:#111821}
.xt-more{margin:34px 0 0;padding:18px;border:1px solid #26303B;border-radius:14px;background:#111821}
.xt-more h2,.xt-faq h2{font-size:20px;margin:0 0 10px;color:#fff}
.xt-more ul{margin:0;padding-left:18px}
.xt-more li{margin:6px 0}
.xt-faq{margin:30px 0 0}
.xt-faq h3{font-size:16px;margin:14px 0 4px;color:#fff}
.xt-faq p{margin:0;color:#cbd5df;font-size:15px}
.xt-note{margin:26px 0 0;font-size:13px;color:#8b95a0}
.xt-map{margin:0 0 26px;padding:12px;border:1px solid #26303B;border-radius:14px;background:#0f151d}
.xt-map svg{display:block;width:100%;max-width:560px;height:auto;margin:0 auto}
.xt-map figcaption{display:flex;flex-wrap:wrap;gap:6px 16px;justify-content:center;margin-top:8px;font-size:13px;color:#9aa4ae}
.xt-key{display:inline-flex;align-items:center;gap:6px}
.xt-key i{display:inline-block;width:10px;height:10px;border-radius:50%}
.xt-key-note{flex-basis:100%;text-align:center;font-size:12px;color:#7d8792}
`;

const label = (n, word) => (n === 1 ? word : word + "s");

function TicketButton({ cta, name }) {
  if (!cta || !cta.href) return null;
  const affiliate = cta.kind === "affiliate";
  return <a className="xt-btn xt-btn-tix" href={cta.href} target="_blank"
    rel={affiliate ? "sponsored nofollow noopener" : "nofollow noopener"}
    aria-label={(cta.label || "Get tickets") + " for " + name}>{cta.label || "Get tickets"} ↗</a>;
}

// The parades map (owner, 2026-11-25): one dot per listing with a real venue
// coordinate, each linking to its event page. Plain server SVG, no map library.
function TopicMap({ map, label }) {
  if (!map || !map.points.length) return null;
  const dot = (p) => {
    const title = [p.name, p.city, p.date ? christmasTopicLongDate(p.date) : null].filter(Boolean).join(", ");
    const c = <circle cx={p.x} cy={p.y} r="4.2" fill={p.boat ? "#60a5fa" : "#f87171"} stroke="#0D1117" strokeWidth="1"><title>{title}</title></circle>;
    return p.href ? <a key={p.id} href={p.href} aria-label={title}>{c}</a> : <g key={p.id}>{c}</g>;
  };
  return <figure className="xt-map">
    <svg viewBox={`0 0 ${FLORIDA_MAP_W} ${FLORIDA_MAP_H}`} role="img" aria-label={`Map of ${map.points.length} ${label.toLowerCase()} across Florida`}>
      <path d={FLORIDA_MAP_PATH} fill="#18212c" stroke="#3a4655" strokeWidth="1" />
      {map.points.filter((p) => !p.boat).map(dot)}
      {map.points.filter((p) => p.boat).map(dot)}
    </svg>
    <figcaption><span className="xt-key"><i style={{ background: "#f87171" }} />Street parade</span><span className="xt-key"><i style={{ background: "#60a5fa" }} />Boat parade</span><span className="xt-key-note">Tap a dot for its page. Map outline: US Census.</span></figcaption>
  </figure>;
}

function TopicRow({ card }) {
  const name = card.name || card.title;
  const t = card.ticketRow || {};
  const where = [card.venue && card.venue !== card.city ? card.venue : null, card.city].filter(Boolean).join(", ");
  const price = t.price && t.price.text && t.price.kind !== "note" ? t.price.text : (t.price && t.price.kind === "free" ? "Free" : null);
  return <article className="xt-row">
    <h3>{card.detailHref ? <a href={card.detailHref}>{name}</a> : name}</h3>
    {where ? <p className="xt-where">{where}</p> : null}
    {t.when || price ? <p className="xt-when">{t.when || null}{t.when && price ? " · " : null}{price ? <span className="xt-price">{price}</span> : null}</p> : null}
    {card.detailHref || (t.cta && t.cta.href) ? <div className="xt-acts">
      <TicketButton cta={t.cta} name={name} />
      {card.detailHref ? <a className="xt-btn xt-btn-more" href={card.detailHref}>Times, parking and details</a> : null}
    </div> : null}
  </article>;
}

export default async function ChristmasTopicPage({ params }) {
  const topic = christmasTopicPage(params.topic);
  // dynamicParams = false: an unknown topic is a 404 before this runs.
  if (!topic) return null;
  const { today, listings, dealsById } = await christmasTopicData();
  const cards = christmasTopicRows(christmasTopicCards(listings, topic.slug, today), today, dealsById, browseTicketFields);
  const groups = groupChristmasTopicCards(cards, today);
  const map = topic.map ? christmasTopicMap(cards, today) : null;
  const schema = christmasTopicSchema(topic, groups, SITE_URL);
  const others = christmasTopicLinks().filter((l) => l.href !== christmasTopicPath(topic.slug));
  const shareUrl = SITE_URL + christmasTopicPath(topic.slug);
  return <main className="xt" data-christmas-topic={topic.slug}>
    <style dangerouslySetInnerHTML={styleHtml(CSS)} />
    <CommerceClickBeacon surface="christmas_topic_page" />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    <nav className="xt-crumbs" aria-label="Breadcrumb"><a href="/">Wayfind</a> › <a href="/christmas-in-florida">Christmas in Florida</a> › {topic.label}</nav>
    <h1>{topic.h1}</h1>
    <p className="xt-intro">{topic.intro}</p>
    <div style={{ margin: "0 0 18px" }}><ShareButton url={shareUrl} title={topic.title} text={topic.description} tone="dark" label="Share" event="page_share" meta={{ surface: "christmas_topic", slug: topic.slug }} /></div>
    {cards.length ? <>
      {map ? <p className="xt-count" data-topic-stats>{map.total} {label(map.total, "parade")} in {map.cities} Florida {map.cities === 1 ? "city" : "cities"}: {map.street} on the street and {map.boats} on the water.{map.busiest ? ` The busiest night is ${christmasTopicLongDate(map.busiest.date)}, with ${map.busiest.n}.` : ""}</p>
        : <p className="xt-count">{cards.length} {cards.length === 1 ? "listing" : "listings"} across {groups.length} {groups.length === 1 ? "region" : "regions"}, soonest first in each region.</p>}
      <TopicMap map={map} label={topic.label} />
      {groups.length > 1 ? <ul className="xt-jump" aria-label="Jump to a region">
        {groups.map((g) => <li key={g.id}><a href={"#" + g.id}>{g.region} ({g.cards.length})</a></li>)}
      </ul> : null}
      {groups.map((g) => <section key={g.id} id={g.id} className="xt-region" aria-label={topic.label + " in " + g.region}>
        <h2>{topic.label} in {g.region}</h2>
        {g.cards.map((card) => <TopicRow key={card.id} card={card} />)}
      </section>)}
    </> : <p className="xt-empty">No {topic.label.toLowerCase()} are listed right now. See <a href="/christmas-in-florida">everything on for Christmas in Florida</a>.</p>}
    <section className="xt-more" aria-label="More Christmas in Florida">
      <h2>More Christmas in Florida</h2>
      <ul>
        <li><a href="/christmas-in-florida">Christmas events in Florida 2026: everything in one place</a></li>
        {others.map((l) => <li key={l.href}><a href={l.href}>{l.label}</a></li>)}
      </ul>
    </section>
    <section className="xt-faq" aria-label="Questions">
      <h2>Good to know</h2>
      {topic.faq.map(([q, a]) => <div key={q}><h3>{q}</h3><p>{a}</p></div>)}
    </section>
    <p className="xt-note">Dates, times and prices come from each organizer and are checked through the season. Confirm on the event's own page before you go.</p>
  </main>;
}
