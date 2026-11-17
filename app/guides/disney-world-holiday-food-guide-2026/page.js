import GuideArticleHero from "../../components/GuideArticleHero";
import CreatorVideoAction from "../../components/CreatorVideoAction";
import ShareButton from "../../components/ShareButton";
import { pageShareUrl } from "../../../lib/pageShareUrl";
import { guideHero } from "../../../lib/guideHero";
import { HERO_CARD_DESIGN_V } from "../../../lib/heroCard";
import { isGuidePast } from "../../../lib/guideLifecycle";
import { SITE_URL } from "../../../lib/site";
import { DISNEY_FOOD_SLUG, DISNEY_FOOD_PARKS, DISNEY_FOOD_STOPS, DISNEY_HOLIDAY_FOOD_GUIDES } from "../../../lib/guidesDisneyHolidayFood2026";
import DisneyFoodMap from "./DisneyFoodMap";
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

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Article", "@id": canonical + "#article", headline: guide.title, description: guide.description, mainEntityOfPage: canonical, url: canonical, image: ["https://www.gowayfind.com" + hero.src], datePublished: guide.published, dateModified: guide.updated, author: { "@type": "Person", name: "Gabriel Pereira" }, publisher: { "@type": "Organization", name: "Wayfind", url: "https://www.gowayfind.com" } },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Wayfind", item: "https://www.gowayfind.com" },
      { "@type": "ListItem", position: 2, name: "Guides", item: "https://www.gowayfind.com/guides" },
      { "@type": "ListItem", position: 3, name: "Disney World holiday food guide", item: canonical },
    ] },
  ],
};

export default function DisneyHolidayFoodGuidePage() {
  return <div className={styles.page}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    <GuideArticleHero
      title="Disney World holiday food guide 2026"
      description="Cookie butter beignets, Christmas croissants and the sweets worth planning around. Six stops, seven creator posts and the ticket details that change your day."
      image={hero} region="Walt Disney World" category="Holiday food guide 2026"
      updatedLabel="By Gabriel Pereira · Research checked November 17, 2026"
      jumpHref="#disney-food-map" jumpLabel="Explore the food map"
      actions={<ShareButton url={pageShareUrl(path)} title={guide.title} text="The Disney holiday food guide: six stops, seven creator posts and one clickable map. On Wayfind." tone="dark" event="guide_share" meta={{ slug: DISNEY_FOOD_SLUG, placement: "hero" }} />}
    >
      <nav className={styles.quickChoices} aria-label="Choose your Disney food plan">
        <a href="#cookie-bar-sundae"><small>Without a park ticket</small><strong>The Cookie Bar <span aria-hidden="true">↗</span></strong></a>
        <a href="#terra-treats-sundae"><small>Several treats in one park</small><strong>Animal Kingdom <span aria-hidden="true">↗</span></strong></a>
        <a href="#epic-eats-beignets"><small>Going to Jollywood Nights?</small><strong>Cookie butter beignets <span aria-hidden="true">↗</span></strong></a>
      </nav>
    </GuideArticleHero>

    <article id="guide" className={styles.article}>
      {isGuidePast(guide) ? <p className={styles.calmNote}>This is the archived 2026 holiday guide. Its seasonal windows have ended; use current menus before planning a new visit. <a href="/guides">Browse current guides →</a></p> : null}
      <section className={styles.lead}>
        <p className={styles.kicker}>Start with your park day</p>
        <h2>A snack plan that fits the ticket you have.</h2>
        <p>{guide.intro}</p>
        <p className={styles.calmNote}>The map is for choosing a destination. The stops are spread across Walt Disney World, so build these into separate park days. Food is an extra purchase.</p>
      </section>

      <dl className={styles.facts} aria-label="Guide at a glance">
        <div><dt>Explore</dt><dd>6 food stops</dd></div>
        <div><dt>Watch and browse</dt><dd>7 original posts</dd></div>
        <div><dt>Plan around</dt><dd>4 parks + Disney Springs</dd></div>
      </dl>

      <DisneyFoodMap parks={DISNEY_FOOD_PARKS} stops={DISNEY_FOOD_STOPS} />

      <section className={styles.section} aria-labelledby="food-budget-heading">
        <p className={styles.kicker}>Compare before you go</p>
        <h2 id="food-budget-heading">The food price is only part of the plan.</h2>
        <p>These are the prices visible in the creator posts shared for this guide. They are a planning reference, not verified current menu prices. Tax, park or event admission, parking and transport are outside these amounts.</p>
        <div className={styles.tableScroll} role="region" aria-label="Reported snack prices and admission" tabIndex={0}>
          <table className={styles.comparison}>
            <thead><tr><th scope="col">Food stop</th><th scope="col">Price in shared post</th><th scope="col">Admission to plan for</th></tr></thead>
            <tbody>{DISNEY_FOOD_STOPS.map((stop) => <tr key={stop.id}>
              <th scope="row"><a href={"#" + stop.id}>{stop.venue}</a><small>{stop.title}</small></th>
              <td><strong>{stop.postedPrice}</strong><small>{stop.priceDetail}</small></td>
              <td>{stop.admission}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className={styles.smallPrint}>The croissant carousel does not supply a verified price for this guide. Menu windows do not guarantee daily opening hours or stock.</p>
      </section>

      <section className={styles.section} aria-labelledby="treats-heading">
        <p className={styles.kicker}>The six food stops</p>
        <h2 id="treats-heading">Find the treat. See the original post.</h2>
        <p>The official seasonal menu supports four stops below. The Cookie Bar sundae and San Angel Inn margarita remain creator finds with the confirmation notes shown beside them.</p>
      </section>

      {DISNEY_FOOD_STOPS.map((stop, index) => {
        const park = DISNEY_FOOD_PARKS.find((item) => item.id === stop.parkId);
        return <section id={stop.id} key={stop.id} className={styles.stop} aria-labelledby={stop.id + "-heading"}>
          <div className={styles.stopHeading}>
            <span className={styles.stopNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <div><p className={styles.kicker}>{park.name}</p><h2 id={stop.id + "-heading"}>{stop.title}</h2><p className={styles.venue}>{stop.venue}</p></div>
          </div>
          <dl className={styles.stopFacts}>
            <div><dt>Find it</dt><dd>{stop.location}</dd></div>
            <div><dt>Best fit</dt><dd>{stop.bestFor}</dd></div>
          </dl>
          <p className={styles.admission}>{stop.admission}</p>
          <p className={styles.summary}>{stop.summary}</p>
          <p>{stop.planning}</p>
          <aside className={styles.tip}><strong>Plan it well</strong><p>{stop.tip}</p></aside>
          <div className={styles.availability}><span>{stop.evidence}</span><p>{stop.availability}</p></div>
          {stop.address ? <p className={styles.smallPrint}>{stop.address}</p> : null}
          <div className={styles.posts}>
            {stop.posts.map((post) => <div className={styles.post} key={post.url}>
              <p>{post.kind === "carousel" ? "Creator carousel" : "Creator reel"} · <a href={"https://www.instagram.com/" + post.creator + "/"} target="_blank" rel="noopener noreferrer">@{post.creator}</a></p>
              <CreatorVideoAction platform="instagram" url={post.url} label={post.label + " by @" + post.creator} className={styles.postButton}>
                <span className={styles.playMark} aria-hidden="true">{post.kind === "carousel" ? "▦" : "▶"}</span><span>{post.label}</span><span aria-hidden="true">↗</span>
              </CreatorVideoAction>
              <a className={styles.originalLink} href={post.url} target="_blank" rel="noopener noreferrer">Open the original {post.kind === "carousel" ? "carousel" : "reel"} ↗</a>
            </div>)}
          </div>
          <div className={styles.stopLinks}>
            {stop.source ? <a href={stop.source} target="_blank" rel="noopener noreferrer">{stop.id === "cookie-bar-sundae" ? "Check the current Cookie Bar menu" : "Official seasonal menu"} ↗</a> : null}
            {stop.placeHref ? <a href={stop.placeHref}>Open the Cookie Bar place card ↗</a> : null}
            <a href="#disney-food-map">Back to the food map ↑</a>
          </div>
        </section>;
      })}

      <section className={styles.section} aria-labelledby="plans-heading">
        <p className={styles.kicker}>Turn it into an outing</p>
        <h2 id="plans-heading">Three plans that keep the food in perspective.</h2>
        <div className={styles.plans}>
          <div><span>01 / A park day</span><h3>Animal Kingdom, with two food stops.</h3><p>Use Discovery Island’s Terra Treats for the reindeer sundae, then work Santa’s Holiday Grove into the part of your day near Theater in the Wild. Choose the peppermint sandwich or a croissant at the Grove rather than ordering every cold dessert at once.</p><a href="#terra-treats-sundae">Start with Animal Kingdom →</a></div>
          <div><span>02 / An evening out</span><h3>Disney Springs, without park admission.</h3><p>Confirm the sundae at the Cookie Bar, split it if that suits your group, and leave the rest of the outing flexible. This is the simplest option in the guide when no one has a theme park ticket.</p><a href="#cookie-bar-sundae">Find the Cookie Bar →</a></div>
          <div><span>03 / A ticketed holiday night</span><h3>Jollywood, with a beignet stop.</h3><p>If you are already going to Jollywood Nights, add Epic Eats to the evening. Fit the food around the entertainment you care about. These beignets are an event-only choice, so a daytime Hollywood Studios plan is not a substitute.</p><a href="#epic-eats-beignets">Check the beignet details →</a></div>
        </div>
        <p className={styles.smallPrint}>These are editorial planning ideas, not calculated routes or timed itineraries. Confirm your admission, visit date and the day’s park hours. For outdoor portions, check the forecast and plan a sheltered break if rain arrives.</p>
      </section>

      <section className={styles.section} aria-labelledby="questions-heading">
        <p className={styles.kicker}>The practical questions</p>
        <h2 id="questions-heading">Before you plan around a reel.</h2>
        <div className={styles.faq}>{guide.faq.map(({ q, a }) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
      </section>

      <section className={styles.method} aria-labelledby="sources-heading">
        <p className={styles.kicker}>Sources and credits</p>
        <h2 id="sources-heading">Menu research, with the creators credited.</h2>
        <p>Researched November 17, 2026 using Disney Parks Blog’s official 2026 menus, the Summer House menu, six reels by @disneyforfoodies and the croissant carousel by @disneyfoodblog supplied for this guide. This is a researched planning guide, not a claim that Wayfind personally tasted each dish.</p>
        <p>Prices come from the shared posts. Daily operating hours, current stock, the Cookie Bar sundae and the San Angel Inn special were not independently confirmed. Instagram controls post and embed availability; every post has a direct source link so the guide remains useful if an embed cannot play.</p>
        <ul>{guide.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label} ↗</a></li>)}</ul>
        <p>The map is an original Wayfind planning diagram with approximate destination groups. It is not an official Disney map, a walking route or a guide to vehicle entrances. Check the current park map for paths and precise counter locations.</p>
      </section>

      <nav className={styles.related} aria-label="Related Wayfind guides">
        <p className={styles.kicker}>Keep planning</p><h2>Make the rest of the day easy.</h2>
        <a href="/guides/best-restaurants-disney-springs">Where to eat at Disney Springs →</a>
        <a href="/christmas-in-florida">Christmas across Florida →</a>
        <a href="/guides">Browse all Wayfind guides →</a>
      </nav>
    </article>
  </div>;
}
