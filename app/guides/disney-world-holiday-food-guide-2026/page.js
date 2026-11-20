import GuideStandardShell, { GuideSection } from "../../components/GuideStandardShell";
import FoodStop from "./FoodStop";
import ShareButton from "../../components/ShareButton";
import { pageShareUrl } from "../../../lib/pageShareUrl";
import { guideHero } from "../../../lib/guideHero";
import { HERO_CARD_DESIGN_V } from "../../../lib/heroCard";
import { isGuidePast } from "../../../lib/guideLifecycle";
import { SITE_URL } from "../../../lib/site";
import { CALIFORNIA_BONUS, DISNEY_FOOD_SLUG, DISNEY_FOOD_PARKS, DISNEY_FOOD_STOPS, DISNEY_HOLIDAY_FOOD_GUIDES, EPCOT_FESTIVAL } from "../../../lib/guidesDisneyHolidayFood2026";
import DisneyFoodMap from "./DisneyFoodMap";
import FestivalBooths from "./FestivalBooths";
import styles from "./page.module.css";

const guide = DISNEY_HOLIDAY_FOOD_GUIDES[DISNEY_FOOD_SLUG];
const path = "/guides/" + DISNEY_FOOD_SLUG;
const canonical = SITE_URL + path;
const hero = guideHero(DISNEY_FOOD_SLUG);
const shareImage = SITE_URL + "/api/og/hero?kind=guide&id=" + DISNEY_FOOD_SLUG + "&t=" + encodeURIComponent("Disney holiday food, mapped") + "&cat=Guide&loc=Orlando&v=" + hero.reviewedAt + "." + HERO_CARD_DESIGN_V;

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
const faqLd = guide.faq?.length ? { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: guide.faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) } : null;

// One numbered section per park, in the same order as the map's park chips.
const PARK_SECTIONS = ["animal-kingdom", "epcot", "magic-kingdom", "hollywood-studios", "disney-springs"]
  .map((id) => DISNEY_FOOD_PARKS.find((park) => park.id === id)).filter(Boolean)
  .map((park) => ({ id: "park-" + park.id, parkId: park.id, eyebrow: park.id === "disney-springs" ? "No theme park ticket" : "Theme park admission", title: park.name }));
const EPCOT_STOP_COUNT = DISNEY_FOOD_STOPS.filter((stop) => stop.parkId === "epcot").length;

const SECTIONS = [
  ...PARK_SECTIONS,
  { id: "california-bonus", eyebrow: "Downtown Disney, Anaheim", title: "California bonus" },
  { id: "plans", eyebrow: "Turn it into an outing", title: "Three plans that keep the food in perspective." },
  { id: "questions", eyebrow: "The practical questions", title: "Before you plan around a reel." },
  { id: "sources", eyebrow: "Sources and credits", title: "Menu research, with the creators credited." },
];

export default function DisneyHolidayFoodGuidePage() {
  const past = isGuidePast(guide);
  return <GuideStandardShell
    slug={DISNEY_FOOD_SLUG}
    title="Disney World holiday food guide 2026"
    description="Cookie butter beignets, Christmas croissants and the sweets worth planning around. Choose your park to find the counter, see the treat and check which ticket you need."
    image={hero}
    region="Walt Disney World"
    category="Holiday food guide 2026"
    published={guide.published}
    updated={guide.updated}
    jumpHref="#disney-food-map"
    jumpLabel="Explore the food map"
    actions={<ShareButton url={pageShareUrl("/guides/disney-world-holiday-food-guide-2026")} title={guide.title} text="The Disney holiday food guide: park maps and creator videos. On Wayfind." tone="dark" event="guide_share" meta={{ slug: DISNEY_FOOD_SLUG, placement: "hero" }} />}
    intro={past ? <p className={styles.calmNote}>This is the archived 2026 holiday guide. Its seasonal windows have ended; use current menus before planning a new visit. <a href="/guides">Browse current guides →</a></p> : null}
    contents={SECTIONS.map((s) => ({ href: "#" + s.id, label: s.title }))}
    // The shared guide map card (park chips, illustrated map, card rail) sits in
    // the shell's lead slot, above the numbered park sections it links to.
    lead={<DisneyFoodMap parks={DISNEY_FOOD_PARKS} stops={DISNEY_FOOD_STOPS} festival={EPCOT_FESTIVAL} />}
    extraLd={faqLd ? [faqLd] : []}
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
          <p>Prices come from the shared posts. Daily operating hours, current stock, the Cookie Bar sundae and the San Angel Inn special were not independently confirmed. Instagram controls post and embed availability; every post has a direct source link so the guide remains useful if an embed cannot play.</p>
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
