// New Year's Eve 2026 listings (lib/newYearsEve.js). Server rendered so
// crawlers read every name, time and place without running JavaScript.
// Options, not orders: every listing is shown, sorted by start time, and the
// reader picks. Ticket buttons go through /api/ticketmaster/go (or the event's
// own ticket action), never a raw seller URL.
import CommerceClickBeacon from "./CommerceClickBeacon";
import { eventClockLabel } from "../../lib/eventVisitFacts.js";
import styles from "./NewYearsEveListings.module.css";

// A card's date block: its own badge (spring break: "Mar 14" / "to Mar 22"),
// else the New Year's Eve clock ("9pm" / "Dec 31").
function Card({ card, surface }) {
  const clock = eventClockLabel(card.time);
  const top = card.badge ? card.badge.top : (clock || "TBA");
  const bottom = card.badge ? card.badge.bottom : "Dec 31";
  return <article className={styles.card} data-nye-card={card.source}>
    <div className={styles.clock} aria-hidden="true">
      <span className={styles.clockTime}>{top}</span>
      <span className={styles.clockDay}>{bottom}</span>
    </div>
    <div className={styles.body}>
      <h3 className={styles.name}>{card.name}</h3>
      <p className={styles.where}>{card.when}{card.centralTime ? " Central" : ""}<br />{[card.venue, card.city].filter(Boolean).join(", ")}</p>
      {card.hook ? <p className={styles.hook}>{card.hook}</p> : null}
      {(card.price || card.fireworks || card.centralTime) ? <div className={styles.chips}>
        {card.price ? <span className={card.price === "Free" ? `${styles.chip} ${styles.chipFree}` : styles.chip}>{card.price}</span> : null}
        {card.fireworks ? <span className={`${styles.chip} ${styles.chipFire}`}>Fireworks</span> : null}
        {card.centralTime ? <span className={styles.chip}>Central Time</span> : null}
      </div> : null}
      <div className={styles.actions}>
        {card.ticket ? <a className={styles.buy} href={card.ticket.href} rel={card.ticket.rel} target="_blank" data-commerce-surface={surface} data-nye-ticket={card.id}>
          {card.ticket.label}{card.ticket.seller ? <small>on {card.ticket.seller}</small> : null}
        </a> : null}
        {card.detailHref ? <a className={styles.more} href={card.detailHref}>Details</a> : null}
        {!card.detailHref && card.officialHref ? <a className={styles.more} href={card.officialHref} rel="noopener nofollow" target="_blank">Official site ↗</a> : null}
      </div>
    </div>
  </article>;
}

export function NyeCardGrid({ cards, surface = "nye_hub" }) {
  return <div className={styles.grid}>{cards.map((card) => <Card key={card.key} card={card} surface={surface} />)}</div>;
}

const NYE_HEADING = (r) => <>New Year&rsquo;s Eve in {r.place}</>;
const NYE_SEE_ALL = (r) => <>See {r.label} New Year&rsquo;s Eve →</>;

/** The statewide list: one section per region, with a jump row on top. Spring break reuses it with its own headings. */
export default function NewYearsEveListings({ model, regionLinks = true, surface = "nye_hub", id = "nye-listings", heading = NYE_HEADING, seeAll = NYE_SEE_ALL, note = true }) {
  const regions = model.regions.filter((r) => r.count > 0);
  return <div className={styles.wrap} id={id}>
    <CommerceClickBeacon surface={surface} />
    <nav className={styles.jump} aria-label="Jump to a region">
      {regions.map((r) => <a key={r.id} href={"#nye-" + r.id}>{r.label}<span>{r.count}</span></a>)}
      {model.elsewhere.length ? <a href="#nye-elsewhere">Elsewhere<span>{model.elsewhere.length}</span></a> : null}
    </nav>
    {regions.map((r) => <section key={r.id} id={"nye-" + r.id} className={styles.region} aria-labelledby={"nye-h-" + r.id}>
      <div className={styles.regionHead}>
        <h2 id={"nye-h-" + r.id}>{heading(r)}</h2>
        {regionLinks && r.hasPage ? <a href={r.path}>{seeAll(r)}</a> : null}
      </div>
      <NyeCardGrid cards={r.cards} surface={surface} />
    </section>)}
    {model.elsewhere.length ? <section id="nye-elsewhere" className={styles.region} aria-labelledby="nye-h-elsewhere">
      <div className={styles.regionHead}><h2 id="nye-h-elsewhere">Elsewhere in Florida</h2></div>
      <NyeCardGrid cards={model.elsewhere} surface={surface} />
    </section> : null}
    {note ? <NyeListingNote /> : null}
  </div>;
}

export function NyeListingNote() {
  return <p className={styles.note}>Times are local and come from each organizer&rsquo;s page or the ticket seller&rsquo;s listing. Organizers can change a program, so check the event page before you go. Ticket links may earn Wayfind a commission; it never changes what is listed or the order.</p>;
}

export { styles as nyeStyles };
