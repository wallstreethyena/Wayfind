import VideoFacade from "../../components/VideoFacade";
import CreatorPlaybackDetails from "../../components/CreatorPlaybackDetails";
import styles from "./page.module.css";

export default function FoodStop({ stop, destination }) {
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
    <div className={styles.foodMedia}>{stop.posts.map((post) => {
      const shortcode = new URL(post.url).pathname.split("/")[2];
      return <CreatorPlaybackDetails key={post.url} details={<p className={styles.mediaCredit}>
        {post.kind === "carousel" ? "Post" : "Reel"} by <a href={post.url} target="_blank" rel="noopener noreferrer">@{post.creator}</a>
      </p>}>
        <VideoFacade platform="instagram" url={post.url} label={post.label}
          poster={"/guides/disney-christmas-maps/covers/" + shortcode + ".webp"} coverCity={destination}
          posterCredit="Food illustration" coverTitle={post.coverTitle || stop.title} coverEyebrow={"@" + post.creator} />
      </CreatorPlaybackDetails>;
    })}</div>
    {stop.planning && <p>{stop.planning}</p>}
    {stop.tip && <aside className={styles.tip}><strong>Plan it well</strong><p>{stop.tip}</p></aside>}
    {stop.address && <p>{stop.address}</p>}
    <div className={styles.stopLinks}>
      {stop.source && <a href={stop.source} target="_blank" rel="noopener noreferrer">Food and availability source ↗</a>}
      {stop.placeHref && <a href={stop.placeHref}>Open place card</a>}
      <a href="#disney-food-map">Choose another park ↑</a>
    </div>
  </section>;
}
