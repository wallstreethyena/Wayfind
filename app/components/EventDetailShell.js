// Both event sources supply content to this shell. Reading order and action
// spacing belong here, so a new event cannot invent another page layout.
export default function EventDetailShell({ title, status, facts, story, actions, note, media, credit }) {
  return (
    <section className="wf-event-hero" aria-label="Event overview">
      <aside className="wf-event-booking" aria-label="Event details and booking">
        <div className="wf-event-eyebrow">Your next good plan</div>
        {status}
        <h1>{title}</h1>
        <dl className="wf-event-summary">
          {facts.filter((fact) => fact.value !== null && fact.value !== undefined && fact.value !== "").map((fact) => (
            <div className="wf-event-fact" key={fact.label}>
              <dt>{fact.label}</dt><dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
        {story ? <div className="wf-event-reason">{story}</div> : null}
        <div className="wf-event-actions" aria-label="Plan this event">
          {actions}
          <p className="wf-event-booking-note">{note}</p>
        </div>
      </aside>
      <section className="wf-event-media" aria-label="Event photos">
        <h2>What it looks like</h2>
        <div className="wf-event-photo-rail" role="region" aria-label="Event photo rail" tabIndex={0}>
          {media}
        </div>
        {credit}
      </section>
    </section>
  );
}
