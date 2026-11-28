import GuideStandardShell, { GuideSection } from "../../components/GuideStandardShell";
import ShareButton from "../../components/ShareButton";
import { pageShareUrl } from "../../../lib/pageShareUrl";
import GuideFigure, { GuideFigureCredit } from "../../components/GuideFigure";
import CreatorPostRail from "../../components/CreatorPostRail";
import UniversalHolidayMap from "./UniversalHolidayMap";
import { FoodFilters } from "./GuideInteractions";
import content from "../../../data/universal-orlando-christmas-2026.json";
import { SITE_URL } from "../../../lib/site";
import { UNIVERSAL_HOLIDAY_FOOD_2026 } from "../../../lib/universalHolidayFood2026";
import { UNIVERSAL_HOLIDAY_MAP_MEDIA } from "../../../lib/universalHolidayMapMedia";
import { UNIVERSAL_HOLIDAY_CREATOR_POSTS } from "../../../lib/universalHolidayCreatorPosts";
import styles from "./page.module.css";

const SLUG = "universal-orlando-christmas-2026";
const CANONICAL = SITE_URL + "/guides/" + SLUG;
const hero = content.photos["nintendo-night"];
const share = SITE_URL + hero.src;
export const metadata = {
  title: "Universal Orlando Christmas 2026: Food, Grinchmas & Park Map | Wayfind",
  description: "Plan Universal Orlando Christmas 2026 with holiday food picks, photo maps, creator reels and four itineraries for the three theme parks and CityWalk.",
  alternates: { canonical: "/guides/" + SLUG },
  robots: { index: true, follow: true, "max-image-preview": "large" },
  openGraph: { title: content.title, description: content.description, url: CANONICAL, type: "article", images: [{ url: share, width: hero.width, height: hero.height, alt: hero.alt }] },
  twitter: { card: "summary_large_image", title: content.title, description: content.description, images: [share] },
};

// Each content section opens with its own <h2 id> in the authored HTML. The
// standard frame renders that heading as the numbered GuideSection title, so
// the leading <h2> (and the hand-numbered "01" span some carried) is lifted
// out of the first block here. Source is our own checked-in JSON.
const LEAD_H2 = /^\s*<h2\b[^>]*>([\s\S]*?)<\/h2>\s*/;
const plain = (html) => html.replace(/<span class="wf-number"[^>]*>[\s\S]*?<\/span>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const SECTIONS = content.sections.map((section) => {
  const [first, ...rest] = section.blocks;
  const m = first?.kind === "html" ? LEAD_H2.exec(first.html) : null;
  if (!m) throw new Error("Universal guide section " + section.id + " must open with its <h2>");
  const body = first.html.slice(m[0].length);
  return { id: section.id, title: plain(m[1]), blocks: body.trim() ? [{ ...first, html: body }, ...rest] : rest };
});
const EYEBROWS = { "islands-of-adventure": "Grinchmas", "universal-studios-florida": "The parade", "epic-universe": "Mario and dragons", "universal-citywalk": "An evening out" };
const PARKS = {
  islands: { section: "islands-of-adventure", label: "Islands" },
  studios: { section: "universal-studios-florida", label: "Studios" },
  epic: { section: "epic-universe", label: "Epic" },
  citywalk: { section: "universal-citywalk", label: "CityWalk" },
};
const foodPicks = UNIVERSAL_HOLIDAY_FOOD_2026;
const foodParks = Object.fromEntries(foodPicks.map((pick) => [pick.id, pick.park]));
const additionalStops = foodPicks
  .filter((pick) => !pick.mapGroup && Number.isFinite(pick.x) && Number.isFinite(pick.y))
  .map((pick) => ({ target: pick.id, park: pick.park, family: pick.family || "food", x: pick.x, y: pick.y, title: pick.mapTitle || pick.name, venue: pick.venue, detail: pick.description }));
const stopPhotos = {
  ...Object.fromEntries(Object.entries(UNIVERSAL_HOLIDAY_MAP_MEDIA).map(([target, { photo, photoKey, caption, modificationNotice }]) => [
    target, { ...(photo || content.photos[photoKey]), caption, ...(modificationNotice ? { modificationNotice } : {}) },
  ])),
  ...Object.fromEntries(foodPicks.filter((pick) => pick.photo).map((pick) => [pick.id, pick.photo])),
};

function Picture({ image, photoKey, role = "pick" }) {
  image = image || content.photos[photoKey];
  if (!image) return null;
  return <div className={styles.photo} data-universal-photo={photoKey}>
    <GuideFigure role={role} image={image} showCaption={false} imgClassName={image.preserveFraming ? styles.uncroppedFood : undefined} />
    <GuideFigureCredit image={image} part="credit" as="small" className={styles.photoCredit} />
  </div>;
}

function FoodTable({ rows }) {
  const allRows = [
    ...rows,
    ...foodPicks.filter((pick) => !rows.some((row) => row.href === pick.id)).map((pick) => ({
      park: pick.park, name: pick.name, venue: pick.venue, note: pick.shortDescription || pick.description, href: pick.id,
    })),
  ];
  return <div className={styles.richText}>
    <div className="table-wrap" data-universal-food-table="">
      <table>
        <thead><tr><th scope="col">Park</th><th scope="col">Food or drink</th><th scope="col">Where to look</th><th scope="col">What to expect</th></tr></thead>
        <tbody>{allRows.map((row) => <tr key={row.id || row.href || row.name} id={row.id} tabIndex={row.id ? -1 : undefined} data-park={row.park}>
          <td>{PARKS[row.park].label}</td>
          <td>{row.href ? <a href={"#" + row.href}>{row.name}</a> : row.name}</td>
          <td>{row.venue}</td>
          <td>{row.note}{row.refs?.length ? <sup className="refs">{row.refs.map((ref) => <a key={ref} className="ref" href={"#source-" + ref} aria-label={"Source " + ref}>{ref}</a>)}</sup> : null}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}

function FoodPick({ pick }) {
  return <article className={styles.foodStop} id={pick.id} tabIndex={-1} data-universal-food-pick={pick.park}>
    <p className={styles.kicker}>{pick.venue} · {pick.land}</p>
    <h3>{pick.name}</h3>
    {pick.photo ? <Picture image={pick.photo} photoKey={pick.id} /> : null}
    <p>{pick.description}</p>
    <p className={styles.pickPractical}>{pick.admission}{pick.price ? " " + pick.price : ""}</p>
    <ul className={styles.links}>
      <li><a href={pick.sourceHref} target="_blank" rel="noopener noreferrer">{pick.sourceLabel}</a></li>
      {pick.directionsHref ? <li><a href={pick.directionsHref} target="_blank" rel="noopener noreferrer">Find the venue</a></li> : null}
      {pick.supportingHref ? <li><a href={pick.supportingHref} target="_blank" rel="noopener noreferrer">{pick.supportingLabel || "Menu details"}</a></li> : null}
      {!pick.mapGroup && Number.isFinite(pick.x) ? <li><a href="#explore-the-park">Back to map</a></li> : null}
    </ul>
  </article>;
}

function ParkFood({ sectionId }) {
  const picks = foodPicks.filter((pick) => PARKS[pick.park].section === sectionId);
  return picks.map((pick) => <FoodPick key={pick.id} pick={pick} />);
}

function CreatorClips({ sectionId, sectionTitle }) {
  const posts = UNIVERSAL_HOLIDAY_CREATOR_POSTS[sectionId]?.map((post) => {
    const photo = content.photos[post.photoKey] || stopPhotos[post.mapPhotoKey];
    const cover = photo?.src ? { src: photo.src, alt: photo.alt, credit: photo.credit, preserveFraming: photo.preserveFraming } : undefined;
    return { ...post, cover };
  });
  return <CreatorPostRail posts={posts} label={sectionTitle + " creator videos"} id={sectionId + "-creator-clips"} />;
}

function Itineraries({ routes }) {
  return <div className={styles.itineraries}>{routes.map((route) => <article key={route.id} id={route.id} data-universal-itinerary="">
    <h3>{route.title}</h3>
    <p>{route.admission}</p>
    <ol>{route.steps.map(({ time, target, stop, detail }) => <li key={time}>
      <strong>{time}</strong>{" · "}<a href={"#" + target}>{stop}</a>{" "}{detail}
    </li>)}</ol>
    <p className={styles.routeAlternative}><strong>{route.alternative.label}</strong>{" "}{route.alternative.detail}</p>
  </article>)}</div>;
}

function Block({ block }) {
  if (block.kind === "photo") return <Picture photoKey={block.key} role={block.role} />;
  if (block.kind === "photoPair") return <div className={styles.photoPair}>{block.photos.map(item => <Block key={item.key} block={item} />)}</div>;
  if (block.kind === "foodStop") return <div className={styles.foodStop} id={block.id} tabIndex={-1}>{block.blocks.map((item, index) => <Block key={index} block={item} />)}</div>;
  if (block.kind === "foodFilters") return <FoodFilters />;
  if (block.kind === "foodTable") return <FoodTable rows={block.rows} />;
  if (block.kind === "foodLinks") return <ul className={styles.links}>{foodPicks.filter((pick) => pick.mapGroup === block.group).map((pick) => <li key={pick.id}><a href={"#" + pick.id}>{block.group === "new-york-holiday-kiosks" ? pick.venue : pick.name}</a></li>)}</ul>;
  if (block.kind === "itineraries") return <Itineraries routes={block.routes} />;
  return <div className={styles.richText} dangerouslySetInnerHTML={{ __html: block.html }} />;
}
export default function UniversalChristmasGuide() {
  return <GuideStandardShell
    slug={SLUG}
    title={content.title}
    description={content.description}
    image={hero}
    region="Orlando"
    category="Christmas guide"
    published="2026-11-17"
    updated={content.researchChecked}
    jumpHref="#explore-the-park"
    jumpLabel="Explore the map"
    actions={<ShareButton url={pageShareUrl("/guides/universal-orlando-christmas-2026")} title={content.title} text="Let’s pick our Universal holiday day." label="Share guide" tone="dark" meta={{ page: "guide", slug: SLUG }} />}
    quick={<div className={styles.quickChoices}>{[["#islands-of-adventure", "The Grinch", "Islands of Adventure"], ["#universal-studios-florida", "The parade", "Universal Studios Florida"], ["#epic-universe", "Mario & dragons", "Epic Universe"], ["#universal-citywalk", "An evening out", "CityWalk"]].map(([href, title, text]) => <a href={href} key={href}><strong>{title}</strong><span>{text}</span></a>)}</div>}
    intro={<div className="wf-guide-intro" dangerouslySetInnerHTML={{ __html: content.intro }} />}
    contents={SECTIONS.map((s) => ({ href: "#" + s.id, label: s.title }))}
    lead={<div className={styles.reading}><UniversalHolidayMap additionalStops={additionalStops} stopPhotos={stopPhotos} foodParks={foodParks} /></div>}
  >
    {SECTIONS.map((section, i) => <GuideSection key={section.id} index={i + 1} id={section.id} eyebrow={EYEBROWS[section.id] || null} title={section.title}>
      <div className={styles.reading}>
        {section.blocks.map((block, index) => <Block key={index} block={block} />)}
      </div>
      {EYEBROWS[section.id] ? <><CreatorClips sectionId={section.id} sectionTitle={section.title} /><div className={styles.reading}><ParkFood sectionId={section.id} /></div></> : null}
    </GuideSection>)}
    <section className={`${styles.sources} ${styles.reading}`}><div dangerouslySetInnerHTML={{ __html: content.closingCredits }} /><details><summary>Food photography and illustrated map</summary><p>Universal Orlando supplies the editorial photos credited to the resort. ©2026 Universal Orlando. All Rights Reserved. The provider-prepared photos are displayed uncropped. <a href="https://media.universalparksusa.com/usage-policy/" target="_blank" rel="noopener noreferrer">Usage policy</a>.</p><p>Map and reel cover photos show a dish, venue or area as labeled. The illustrated map is based on official park layouts. For walking directions and current operations, use Universal’s official maps and app.</p><ul>{Object.entries(stopPhotos).filter(([target]) => UNIVERSAL_HOLIDAY_MAP_MEDIA[target]?.photo || foodPicks.some((pick) => pick.id === target && pick.photo)).map(([target, image]) => <li key={target}><strong>{image.caption || image.alt}</strong><GuideFigureCredit image={image} part="credit" as="div" />{image.modificationNotice ? <span>{image.modificationNotice}</span> : null}</li>)}</ul></details></section>
  </GuideStandardShell>;
}
