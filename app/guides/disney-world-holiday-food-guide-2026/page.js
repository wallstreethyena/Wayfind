import GuideStandardShell, { GuideSection } from "../../components/GuideStandardShell";
import FoodStop from "./FoodStop";
import ShareButton from "../../components/ShareButton";
import { pageShareUrl } from "../../../lib/pageShareUrl";
import { guideHero } from "../../../lib/guideHero";
import { HERO_CARD_DESIGN_V } from "../../../lib/heroCard";
import { isGuidePast } from "../../../lib/guideLifecycle";
import { SITE_URL } from "../../../lib/site";
import { CALIFORNIA_BONUS, DISNEY_FOOD_SLUG, DISNEY_FOOD_PARKS, DISNEY_FOOD_STOPS, DISNEY_HOLIDAY_FOOD_GUIDES, EPCOT_FESTIVAL } from "../../../lib/guidesDisneyHolidayFood2026";
import { guidePickPhoto } from "../../../lib/guidePickPhotos";
import DisneyFoodMap from "./DisneyFoodMap";
import FestivalBooths from "./FestivalBooths";
import { COUPONS, couponIsLive, couponEndsLabel } from "../../../lib/coupons";
import { guideDealCommerce } from "../../../lib/guideDeals";
import { siteTodayStr } from "../../../lib/siteTime";
import styles from "./page.module.css";

const guide = DISNEY_HOLIDAY_FOOD_GUIDES[DISNEY_FOOD_SLUG];
const path = "/guides/" + DISNEY_FOOD_SLUG;
const canonical = SITE_URL + path;
const hero = guideHero(DISNEY_FOOD_SLUG);
const shareImage = SITE_URL + "/api/og/hero?kind=guide&id=" + DISNEY_FOOD_SLUG + "&t=" + encodeURIComponent("Disney Christmas food 2026, mapped") + "&cat=Guide&loc=Orlando&v=" + hero.reviewedAt + "." + HERO_CARD_DESIGN_V;

export const revalidate = 900;
const baseMetadata = {
  title: guide.title, description: guide.description,
  alternates: { canonical },
  robots: { index: true, follow: true, "max-image-preview": "large" },
  openGraph: { type: "article", title: guide.title, description: guide.description, url: path, publishedTime: guide.published, modifiedTime: guide.updated, images: [{ url: shareImage, width: 1200, height: 630, alt: "Disney World holiday food guide on Wayfind" }] },
  twitter: { card: "summary_large_image", title: guide.title, description: guide.description, images: [shareImage] },
};

export function generateMetadata() {
  return { ...baseMetadata, robots: { index: !isGuidePast(guide), follow: true, "max-image-preview": "large" } };
}

// Standard frame: GuideStandardShell emits the Article + BreadcrumbList pair;
// the guide's own questions add FAQPage, the same as template guides.
// ItemList of every treat and booth on the page, and the festival as an Event.
// Both describe only what the page shows (Google spam policy: markup matches the page).
const PARK_NAME = Object.fromEntries(DISNEY_FOOD_PARKS.map((park) => [park.id, park.name]));
const itemListLd = { "@context": "https://schema.org", "@type": "ItemList", name: "Disney World Christmas food 2026", itemListElement: [
  ...DISNEY_FOOD_STOPS.map((stop) => ({ name: stop.title + " at " + stop.venue + ", " + PARK_NAME[stop.parkId], url: canonical + "#" + stop.id })),
  ...EPCOT_FESTIVAL.booths.map((booth) => ({ name: booth.name + ", EPCOT Festival of the Holidays", url: canonical + "#booth-" + booth.id })),
].map((item, i) => ({ "@type": "ListItem", position: i + 1, ...item })) };
const festivalLd = { "@context": "https://schema.org", "@type": "Event", name: EPCOT_FESTIVAL.name + " 2026", startDate: "2026-11-27", endDate: "2026-12-30",
  eventStatus: "https://schema.org/EventScheduled", eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
  description: EPCOT_FESTIVAL.summary + " " + EPCOT_FESTIVAL.admission, url: canonical + "#" + EPCOT_FESTIVAL.id,
  location: { "@type": "Place", name: "EPCOT, Walt Disney World Resort", address: { "@type": "PostalAddress", streetAddress: "200 Epcot Center Dr", addressLocality: "Lake Buena Vista", addressRegion: "FL", postalCode: "32821", addressCountry: "US" } },
  organizer: { "@type": "Organization", name: "Walt Disney World Resort" } };

// Park tickets: the registered, tracked Orlando CityPASS row (lib/coupons), in
// the shared deal-card look. Rendered on the server with no client JS: the
// homepage first-load budget (scripts/check-bundle.mjs) tipped over when this
// route imported the client GuideDealCards island, because sharing it changed
// how webpack split chunks the homepage also loads. The click is still
// recorded by app/guides/layout.js's CommerceClickBeacon and the
// /api/commerce/go redirect. Only shown while the row is live.
function ticketDeals() {
  const today = siteTodayStr();
  return COUPONS.filter((c) => c && c.id === "cpn-citypass-orlando" && couponIsLive(c, today)).map((c) => ({
    id: c.id, business: c.business, title: c.title, details: c.details, area: c.area, badge: c.badge || null, cta: c.cta || null, image: c.image || null, category: "attractions",
    url: (guideDealCommerce(c.url) || {}).href || c.url, commerce: (guideDealCommerce(c.url) || {}).ctx || null, external: !String(c.url || "").startsWith("/"), ends: couponEndsLabel(c) || null,
  }));
}

// The answer first: every treat with its park, price and ticket, then the festival.
function TicketCards() {
  const deals = ticketDeals();
  if (!deals.length) return null;
  return <section className="wf-gd-wrap" aria-label="Park tickets">
    <h2 className="wf-gd-h">Need park tickets?</h2>
    <ul className="wf-gd-list">{deals.map((d) => <li key={d.id}>
      <a className="wf-gd-card" style={{ gridTemplateColumns: "minmax(0,1fr)" }} href={d.url} data-deal-card={d.id} data-merchant={d.business} rel="nofollow sponsored noopener" target={d.external ? "_blank" : undefined}>
        <div className="wf-gd-body">
          <div className="wf-gd-top"><span className="wf-gd-title">{d.title}</span>{d.badge ? <span className="wf-gd-badge">{d.badge}</span> : null}</div>
          <div className="wf-gd-merchant">{d.business}</div>
          <p className="wf-gd-details">{d.details}</p>
          <div className="wf-gd-foot"><span className="wf-gd-loc">{d.area}</span><span className="wf-gd-cta">{d.cta || "See the deal"}</span></div>
        </div>
      </a>
    </li>)}</ul>
  </section>;
}

function QuickAnswer() {
  return <div className={styles.quickAnswer}>
    <p className={styles.answerLead}><strong>The short answer:</strong> the 2026 Disney World Christmas food worth planning around is spread across four parks and Disney Springs, and the EPCOT International Festival of the Holidays adds 16 food spots from {EPCOT_FESTIVAL.dates}. Here is every pick, where it is and what you need to get in.</p>
    <div className={styles.answerTable}><table>
      <thead><tr><th scope="col">Treat</th><th scope="col">Where</th><th scope="col">Posted price</th><th scope="col">Ticket</th></tr></thead>
      <tbody>
        {DISNEY_FOOD_STOPS.map((stop) => <tr key={stop.id}><th scope="row"><a href={"#" + stop.id}>{stop.title}</a></th><td data-label="Where">{stop.venue}, {PARK_NAME[stop.parkId]}</td><td data-label="Posted price">{stop.postedPrice || "Not listed"}</td><td data-label="Ticket">{stop.admission}</td></tr>)}
        <tr><th scope="row"><a href={"#" + EPCOT_FESTIVAL.id}>EPCOT Festival of the Holidays (16 booths)</a></th><td data-label="Where">World Showcase and World Celebration, EPCOT</td><td data-label="Posted price">Not listed</td><td data-label="Ticket">EPCOT admission</td></tr>
      </tbody>
    </table></div>
  </div>;
}

const faqLd = guide.faq?.length ? { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: guide.faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) } : null;

// Section headings carry what people search for (owner 2026-11-23: come up
// whenever someone searches for Disney food). Every heading names its park.
const PARK_HEADINGS = {
  "animal-kingdom": "Animal Kingdom Christmas snacks",
  "epcot": "EPCOT holiday food and Festival of the Holidays booths",
  "magic-kingdom": "Magic Kingdom Christmas treats",
  "hollywood-studios": "Hollywood Studios holiday food at Jollywood Nights",
  "disney-springs": "Disney Springs holiday desserts, no park ticket",
};
// One numbered section per park, in the same order as the map's park chips.
const PARK_SECTIONS = ["animal-kingdom", "epcot", "magic-kingdom", "hollywood-studios", "disney-springs"]
  .map((id) => DISNEY_FOOD_PARKS.find((park) => park.id === id)).filter(Boolean)
  .map((park) => ({ id: "park-" + park.id, parkId: park.id, eyebrow: park.id === "disney-springs" ? "No theme park ticket" : "Theme park admission", title: PARK_HEADINGS[park.id] || park.name }));
const EPCOT_STOP_COUNT = DISNEY_FOOD_STOPS.filter((stop) => stop.parkId === "epcot").length;

const SECTIONS = [
  ...PARK_SECTIONS,
  { id: "california-bonus", eyebrow: "Downtown Disney, Anaheim", title: "California bonus" },
  { id: "plans", eyebrow: "Turn it into an outing", title: "Three plans that keep the food in perspective." },
  { id: "questions", eyebrow: "The practical questions", title: "Before you plan around a reel." },
  { id: "sources", eyebrow: "Sources and credits", title: "Menu research, with the creators credited." },
];

const stopPhotos = Object.fromEntries(DISNEY_FOOD_STOPS.flatMap((stop) => {
  const entry = guidePickPhoto(DISNEY_FOOD_SLUG, stop.venue);
  if (!entry?.src) return [];
  return [[stop.id, { src: entry.src, credit: entry.credit, creditHref: entry.creditHref, position: entry.position || "50% 50%" }]];
}));

export default function DisneyHolidayFoodGuidePage() {
  const past = isGuidePast(guide);
  return <GuideStandardShell
    slug={DISNEY_FOOD_SLUG}
    title="Disney World Christmas food guide 2026"
    description="Holiday snacks at every Walt Disney World park, with prices and the ticket you need, plus all 16 EPCOT Festival of the Holidays food booths on the map."
    image={hero}
    region="Walt Disney World"
    category="Holiday food guide 2026"
    published={guide.published}
    updated={guide.updated}
    jumpHref="#disney-food-map"
    jumpLabel="Explore the food map"
    actions={<ShareButton url={pageShareUrl("/guides/disney-world-holiday-food-guide-2026")} title={guide.title} text="Disney Christmas food 2026: every park, prices and the EPCOT festival booths on a map. On Wayfind." tone="dark" event="guide_share" meta={{ slug: DISNEY_FOOD_SLUG, placement: "hero" }} />}
    intro={past ? <p className={styles.calmNote}>This is the archived 2026 holiday guide. Its seasonal windows have ended; use current menus before planning a new visit. <a href="/guides">Browse current guides →</a></p> : <QuickAnswer />}
    contents={SECTIONS.map((s) => ({ href: "#" + s.id, label: s.title }))}
    // The shared guide map card (park chips, illustrated map, card rail) sits in
    // the shell's lead slot, above the numbered park sections it links to.
    lead={<><DisneyFoodMap parks={DISNEY_FOOD_PARKS} stops={DISNEY_FOOD_STOPS} festival={EPCOT_FESTIVAL} stopPhotos={stopPhotos} />{past ? null : <TicketCards />}</>}
    extraLd={[itemListLd, festivalLd, ...(faqLd ? [faqLd] : [])]}
  >
    <div className={styles.body}>
      {PARK_SECTIONS.map((section, i) => <GuideSection key={section.id} index={i + 1} id={section.id} eyebrow={section.eyebrow} title={section.title}>
        {DISNEY_FOOD_STOPS.filter((stop) => stop.parkId === section.parkId).map((stop) => <FoodStop key={stop.id} stop={stop} />)}
        {section.parkId === EPCOT_FESTIVAL.parkId ? <FestivalBooths festival={EPCOT_FESTIVAL} firstNumber={EPCOT_STOP_COUNT + 1} /> : null}
      </GuideSection>)}

      <GuideSection index={PARK_SECTIONS.length + 1} {...SECTIONS[PARK_SECTIONS.length]}>
        <FoodStop stop={CALIFORNIA_BONUS} />
      </GuideSection>

      <GuideSection index={PARK_SECTIONS.length + 2} {...SECTIONS[PARK_SECTIONS.length + 1]}>
        <div className={styles.plans}>
          <div><span>A park day</span><h3>Animal Kingdom, with three food stops.</h3><p>Try the reindeer sundae at Terra Treats or the gingerbread cheesecake pop at Flame Tree Barbecue on Discovery Island, then work Santa’s Holiday Grove into the part of your day near Theater in the Wild. Choose the peppermint sandwich or a croissant at the Grove rather than ordering every cold dessert at once.</p><a href="#terra-treats-sundae">Start with Animal Kingdom →</a></div>
          <div><span>An evening out</span><h3>Disney Springs, without park admission.</h3><p>Confirm the sundae at the Cookie Bar, split it if that suits your group, and leave the rest of the outing flexible. This is the simplest option in the guide when no one has a theme park ticket.</p><a href="#cookie-bar-sundae">Find the Cookie Bar →</a></div>
          <div><span>A ticketed holiday night</span><h3>Jollywood, with a beignet stop.</h3><p>If you are already going to Jollywood Nights, add Epic Eats to the evening. Fit the food around the entertainment you care about. These beignets are an event-only choice, so a daytime Hollywood Studios plan is not a substitute.</p><a href="#epic-eats-beignets">Check the beignet details →</a></div>
        </div>
        <p className={styles.smallPrint}>These are editorial planning ideas, not calculated routes or timed itineraries. Confirm your admission, visit date and the day’s park hours. For outdoor portions, check the forecast and plan a sheltered break if rain arrives.</p>
      </GuideSection>

      <GuideSection index={PARK_SECTIONS.length + 3} {...SECTIONS[PARK_SECTIONS.length + 2]}>
        <div className={styles.faq}>{guide.faq.map(({ q, a }) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
      </GuideSection>

      <GuideSection index={PARK_SECTIONS.length + 4} {...SECTIONS[PARK_SECTIONS.length + 3]}>
        <div className={styles.method}>
          <p>Researched November 17, 2026 using Disney Parks Blog’s official 2026 menus, the Summer House menu, six reels by @disneyforfoodies and posts by @disneyfoodblog. The Anaheim bonus features @eatsbynatt’s reel. This is a researched planning guide, not a claim that Wayfind personally tasted each dish.</p>
          <p>Prices come from the shared posts. Daily operating hours, current stock, the Cookie Bar sundae and the San Angel Inn special were not independently confirmed. Instagram controls post and embed availability. Only posts Instagram plays here on Wayfind are shown, and every creator is credited by name.</p>
          <ul>{guide.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label} ↗</a></li>)}</ul>
          <p>The park maps locate food counters and mark the nearest known landmark for seasonal pop-ups. Select a pin to open its food details.</p>
        </div>
      </GuideSection>

      <nav className={styles.related} aria-label="Related Wayfind guides">
        <p className={styles.kicker}>Keep planning</p><h2>Make the rest of the day easy.</h2>
        <a href="/guides/best-restaurants-disney-springs">Where to eat at Disney Springs →</a>
        <a href="/christmas-in-florida">Christmas across Florida →</a>
        <a href="/guides">Browse all Wayfind guides →</a>
      </nav>
    </div>
  </GuideStandardShell>;
}
