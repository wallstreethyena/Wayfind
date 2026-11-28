import { guideMapsUrl } from "../../lib/guidePlaceAddress.js";
import plans from "../../data/guides/visit-plans.json";
import styles from "./GuideVisitPlan.module.css";

export function guideVisitPlan(slug) {
  return Object.hasOwn(plans, slug) ? plans[slug] : null;
}

function PlanStops({ stops, heading: Heading }) {
  return (
    <ul className={styles.stops}>
      {stops.map((stop) => {
        const href = stop.officialEntrance ? stop.source : guideMapsUrl(stop);
        return (
          <li key={stop.name}>
            <Heading>{stop.name}</Heading>
            {stop.arrival ? <p>{stop.arrival}</p> : null}
            <p className={styles.address}>
              <span>{stop.address}</span>
              <a href={href} data-visit-directions="" aria-label={`Directions to ${stop.name}`}>{stop.officialEntrance ? "Current directions" : "Directions"}</a>
            </p>
            <p>{stop.why}</p>
            {stop.tip ? <p><strong>Tip</strong> · {stop.tip}</p> : null}
            {stop.officialEntrance ? null : <p className={styles.reference}><a href={stop.source} aria-label={`Visitor information for ${stop.name}`}>Visitor information</a></p>}
          </li>
        );
      })}
    </ul>
  );
}

export default function GuideVisitPlan({ plan }) {
  if (!plan) return null;
  return (
    <section className={styles.plan} id="visit-plan" aria-labelledby="visit-plan-title" data-guide-visit-plan="">
      <h2 id="visit-plan-title">Plan your visit</h2>
      <PlanStops stops={plan.stops} heading="h3" />
      {plan.sections.map(({ title, text }) => (
        <div key={title} className={styles.section}>
          <h3>{title}</h3>
          {text.split(/\n\n+/).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
      ))}
      <div className={styles.nearby}>
        <h3>Worth adding nearby</h3>
        <PlanStops stops={plan.nearby} heading="h4" />
      </div>
      {plan.sources.length ? (
        <details className={styles.sources}>
          <summary>Sources and updates</summary>
          <ul>{plan.sources.map(({ label, url }) => <li key={url}><a href={url}>{label}</a></li>)}</ul>
        </details>
      ) : null}
    </section>
  );
}
