// Valentine's Day 2027 listings (lib/valentines.js). Server rendered so
// crawlers read every name, price, place and date without running JavaScript.
// Options, not orders: every experience and event Wayfind holds for an area is
// shown (experiences by rating, events by start date) and the reader picks.
// Book buttons go through /api/commerce/go by product code, never a raw
// partner URL; event buttons use each event's own ticket action.
import CommerceClickBeacon from "./CommerceClickBeacon";
import GuidePhoto from "./GuidePhoto.js";
import { NyeCardGrid } from "./NewYearsEveListings";
import styles from "./ValentinesListings.module.css";

function ExperienceCard({ card, surface }) {
  const meta = [card.place, card.duration, card.rating && card.reviews ? `${card.rating.toFixed(1)} ★ (${card.reviews.toLocaleString("en-US")} reviews on Viator)` : ""].filter(Boolean).join(" · ");
  return <article className={styles.xcard} data-vday-experience={card.id}>
    <div className={styles.photo}>
      <GuidePhoto src={card.image ? card.image.src : null} alt={card.image ? card.image.alt : ""} width={400} height={300} loading="lazy"
        fallbackClassName={styles.noPhoto} fallbackText="Photos on Viator" />
    </div>
    <div className={styles.xbody}>
      <h4 className={styles.xname}>{card.name}</h4>
      <p className={styles.xmeta}>{meta}</p>
      {card.pitch ? <p className={styles.xpitch}>{card.pitch}</p> : null}
      <div className={styles.xfoot}>
        <span className={styles.xprice}>{card.price}</span>
        <a className={styles.buy} href={card.href} rel="sponsored noopener" target="_blank" data-commerce-surface={surface} data-vday-book={card.id}>{card.cta}</a>
      </div>
    </div>
  </article>;
}

export function ValentinesExperienceRail({ cards, surface }) {
  return <div className={styles.rail}>{cards.map((c) => <ExperienceCard key={c.key} card={c} surface={surface} />)}</div>;
}

export function ValentinesDinnerLinks({ region }) {
  if (!region.dinner || !region.dinner.length) return null;
  return <ul className={styles.dinner}>
    {region.dinner.map((d) => <li key={d.key}><a href={d.href}>{d.label}</a></li>)}
  </ul>;
}

/** One area's block: what to book, what is on that weekend, where to eat. */
export function ValentinesRegionBlock({ region, surface, headingLevel = 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return <>
    {region.experiences.length ? <>
      <H className={styles.sub}>Book a date</H>
      <ValentinesExperienceRail cards={region.experiences} surface={surface} />
    </> : null}
    {region.events.length ? <>
      <H className={styles.sub}>On Valentine&rsquo;s weekend, Feb 12 to 15</H>
      <NyeCardGrid cards={region.events} surface={surface} />
    </> : null}
    {region.dinner && region.dinner.length ? <>
      <H className={styles.sub}>Dinner for two</H>
      <ValentinesDinnerLinks region={region} />
    </> : null}
  </>;
}

/** The statewide list: one section per area, with a jump row on top. */
export default function ValentinesListings({ model, surface, id = "vday-listings" }) {
  const regions = model.regions.filter((r) => r.count > 0);
  return <div className={styles.wrap} id={id}>
    <CommerceClickBeacon surface={surface} />
    <nav className={styles.jump} aria-label="Jump to an area">
      {regions.map((r) => <a key={r.id} href={"#vday-" + r.id}>{r.label}<span>{r.count}</span></a>)}
      {model.elsewhere.length ? <a href="#vday-elsewhere">Elsewhere<span>{model.elsewhere.length}</span></a> : null}
    </nav>
    {regions.map((r) => <section key={r.id} id={"vday-" + r.id} className={styles.region} aria-labelledby={"vday-h-" + r.id}>
      <div className={styles.regionHead}>
        <h2 id={"vday-h-" + r.id}>Valentine&rsquo;s Day in {r.place}</h2>
        {r.hasPage ? <a href={r.path}>See all {r.label} plans →</a> : null}
      </div>
      <ValentinesRegionBlock region={r} surface={surface} />
    </section>)}
    {model.elsewhere.length ? <section id="vday-elsewhere" className={styles.region} aria-labelledby="vday-h-elsewhere">
      <div className={styles.regionHead}><h2 id="vday-h-elsewhere">Elsewhere in Florida on Valentine&rsquo;s weekend</h2></div>
      <NyeCardGrid cards={model.elsewhere} surface={surface} />
    </section> : null}
    <ValentinesListingNote />
  </div>;
}

export function ValentinesListingNote() {
  return <p className={styles.note}>Event dates come from each organizer&rsquo;s own site; tour prices, lengths and ratings come from Viator and can change. Check the listing before you go. Book and ticket links may earn Wayfind a commission; it never changes what is listed or the order.</p>;
}

export function ValentinesFaq({ faq }) {
  return <div className={styles.faq}>
    {faq.map((f) => <div key={f.q}><h3>{f.q}</h3><p>{f.a}</p></div>)}
  </div>;
}
