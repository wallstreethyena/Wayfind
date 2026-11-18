import locations from "../../../lib/disneyChristmasFoodLocations2026.json";
import CreatorCoverFacade from "../../components/CreatorCoverFacade";
import CreatorPlaybackDetails from "../../components/CreatorPlaybackDetails";
import styles from "./page.module.css";

export default function FoodStop({ stop, destination, placeId = null }) {
  const point = locations[stop.id];
  return <section id={stop.id} className={styles.stop} aria-labelledby={stop.id + "-heading"}>
    <p className={styles.kicker}>{stop.venue}</p>
    <h2 id={stop.id + "-heading"}>{stop.title}</h2>
    <p className={styles.summary}>{stop.summary}</p>
    <dl className={styles.stopFacts}>
      <div><dt>Find it</dt><dd>{stop.location}</dd></div>
      <div><dt>Reported price</dt><dd><strong>{stop.postedPrice}</strong> · {stop.priceDetail}</dd></div>
      <div><dt>Admission</dt><dd>{stop.admission}</dd></div>
      <div><dt>Availability</dt><dd>{stop.availability}</dd></div>
    </dl>
    <div className={styles.foodMedia}>{(placeId ? stop.posts : []).map((post) => {
      return <CreatorPlaybackDetails key={post.url} details={<p className={styles.mediaCredit}>
        {post.kind === "carousel" ? "Post" : "Reel"} by <a href={post.url} target="_blank" rel="noopener noreferrer">@{post.creator}</a>
      </p>}>
        {/* The cover is Wayfind's own credited photo of the park where this food is sold (never an
            illustration and never creator media). A stop with no park row shows no video tile. */}
        <CreatorCoverFacade placeId={placeId} platform="instagram" url={post.url} label={post.label}
          coverCity={destination} coverTitle={post.coverTitle || stop.title} coverEyebrow={"@" + post.creator} />
      </CreatorPlaybackDetails>;
    })}</div>
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
