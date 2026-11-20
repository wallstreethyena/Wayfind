import CreatorPostRail from "../../components/CreatorPostRail";
import styles from "./page.module.css";

// EPCOT International Festival of the Holidays: the creator post in the shared
// rail, then every booth from that post with the number its pin has on the
// EPCOT map (pins are numbered after EPCOT's other food stops).
export default function FestivalBooths({ festival, firstNumber = 1 }) {
  return <section id={festival.id} tabIndex={-1} className={styles.stop} aria-labelledby={festival.id + "-heading"}>
    <p className={styles.kicker}>EPCOT · {festival.dates}</p>
    <h3 id={festival.id + "-heading"}>{festival.name}</h3>
    <p className={styles.summary}>{festival.summary}</p>
    <dl className={styles.stopFacts}>
      <div><dt>Dates</dt><dd>{festival.dates}</dd></div>
      <div><dt>Admission</dt><dd>{festival.admission}</dd></div>
    </dl>
    <CreatorPostRail posts={[festival.post]} label={"creator post about the " + festival.name} kicker="EPCOT" headingLevel={4} />
    <ol className={styles.booths} start={firstNumber}>
      {festival.booths.map((booth) => <li key={booth.id} id={"booth-" + booth.id} tabIndex={-1}>
        <p className={styles.boothName}><strong>{booth.name}</strong>{booth.isNew ? <span>New in 2026</span> : booth.kind === "stop" ? <span data-kind="stop">Year-round counter</span> : null}</p>
        <p className={styles.boothWhere}>{booth.where}</p>
        <p className={styles.boothItems}>{booth.items.join(" · ")}</p>
      </li>)}
    </ol>
    <p className={styles.smallPrint}>Booths and menu items are the ones shown in @{festival.post.creator}’s post. Prices were not listed, so none are shown here. Menus can change during the festival; check the official festival map in the park. Sources: {festival.sources.map((s, i) => <span key={s.url}>{i ? " · " : ""}<a href={s.url} target="_blank" rel="noopener noreferrer">{s.label} ↗</a></span>)}</p>
    <div className={styles.stopLinks}><a href="#disney-food-map">Back to the food map ↑</a></div>
  </section>;
}
