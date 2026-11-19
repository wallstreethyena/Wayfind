import locations from "../../../lib/disneyChristmasFoodLocations2026.json";
import FoodPost from "./FoodPost";
import styles from "./page.module.css";

export default function FoodStop({ stop }) {
  const point = locations[stop.id];
  return <section id={stop.id} tabIndex={-1} className={styles.stop} aria-labelledby={stop.id + "-heading"}>
    <p className={styles.kicker}>{stop.venue}</p>
    <h2 id={stop.id + "-heading"}>{stop.title}</h2>
    <p className={styles.summary}>{stop.summary}</p>
    <div className={styles.foodMedia}>{stop.posts.map((post) =>
      <FoodPost key={post.url} post={post} />
    )}</div>
    <dl className={styles.stopFacts}>
      <div><dt>Find it</dt><dd>{stop.location}</dd></div>
      <div><dt>Reported price</dt><dd><strong>{stop.postedPrice}</strong> · {stop.priceDetail}</dd></div>
      <div><dt>Admission</dt><dd>{stop.admission}</dd></div>
      <div><dt>Availability</dt><dd>{stop.availability}</dd></div>
    </dl>
    {stop.planning && <p>{stop.planning}</p>}
    {stop.tip && <aside className={styles.tip}><strong>Plan it well</strong><p>{stop.tip}</p></aside>}
    {stop.address && <p>{stop.address}</p>}
    <div className={styles.stopLinks}>
      {point && <a href={"https://maps.apple.com/?ll=" + point.lat + "," + point.lng + "&q=" + encodeURIComponent(point.label)} target="_blank" rel="noopener noreferrer">Open {point.label} in Maps ↗</a>}
      {stop.source && <a href={stop.source} target="_blank" rel="noopener noreferrer">Food and availability source ↗</a>}
      {stop.placeHref && <a href={stop.placeHref}>Open place card</a>}
      <a href="#disney-food-map">Choose another park ↑</a>
    </div>
  </section>;
}
