// New Year's Eve 2026 listings (lib/newYearsEve.js). Server rendered so
// crawlers read every name, time and place without running JavaScript.
// Options, not orders: every listing is shown, sorted by start time, and the
// reader picks. Ticket buttons go through /api/ticketmaster/go (or the event's
// own ticket action), never a raw seller URL.
import CommerceClickBeacon from "./CommerceClickBeacon";
import { eventClockLabel } from "../../lib/eventVisitFacts.js";
import styles from "./NewYearsEveListings.module.css";

function Card({ card }) {
  const clock = eventClockLabel(card.time);
  return <article className={styles.card} data-nye-card={card.source}>
    <div className={styles.clock} aria-hidden="true">
      <span className={styles.clockTime}>{clock || "TBA"}</span>
      <span className={styles.clockDay}>Dec 31</span>
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
        {card.ticket ? <a className={styles.buy} href={card.ticket.href} rel={card.ticket.rel} target="_blank" data-commerce-surface="nye_hub" data-nye-ticket={card.id}>
          {card.ticket.label}{card.ticket.seller ? <small>on {card.ticket.seller}</small> : null}
        </a> : null}
        {card.detailHref ? <a className={styles.more} href={card.detailHref}>Details</a> : null}
        {!card.detailHref && card.officialHref ? <a className={styles.more} href={card.officialHref} rel="noopener nofollow" target="_blank">Official site ↗</a> : null}
      </div>
    </div>
  </article>;
}

export function NyeCardGrid({ cards }) {
  return <div className={styles.grid}>{cards.map((card) => <Card key={card.key} card={card} />)}</div>;
}

/** The statewide list: one section per region, with a jump row on top. */
export default function NewYearsEveListings({ model, regionLinks = true }) {
  const regions = model.regions.filter((r) => r.count > 0);
  return <div className={styles.wrap} id="nye-listings">
    <CommerceClickBeacon surface="nye_hub" />
    <nav className={styles.jump} aria-label="Jump to a region">
      {regions.map((r) => <a key={r.id} href={"#nye-" + r.id}>{r.label}<span>{r.count}</span></a>)}
      {model.elsewhere.length ? <a href="#nye-elsewhere">Elsewhere<span>{model.elsewhere.length}</span></a> : null}
    </nav>
    {regions.map((r) => <section key={r.id} id={"nye-" + r.id} className={styles.region} aria-labelledby={"nye-h-" + r.id}>
      <div className={styles.regionHead}>
        <h2 id={"nye-h-" + r.id}>New Year&rsquo;s Eve in {r.place}</h2>
        {regionLinks && r.hasPage ? <a href={r.path}>See {r.label} New Year&rsquo;s Eve →</a> : null}
      </div>
      <NyeCardGrid cards={r.cards} />
    </section>)}
    {model.elsewhere.length ? <section id="nye-elsewhere" className={styles.region} aria-labelledby="nye-h-elsewhere">
      <div className={styles.regionHead}><h2 id="nye-h-elsewhere">Elsewhere in Florida</h2></div>
      <NyeCardGrid cards={model.elsewhere} />
    </section> : null}
    <NyeListingNote />
  </div>;
}

export function NyeListingNote() {
  return <p className={styles.note}>Times are local and come from each organizer&rsquo;s page or the ticket seller&rsquo;s listing. Organizers can change a program, so check the event page before you go. Ticket links may earn Wayfind a commission; it never changes what is listed or the order.</p>;
}

export { styles as nyeStyles };
