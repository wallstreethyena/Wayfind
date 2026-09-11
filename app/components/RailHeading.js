// Shared heading for every discovery rail. Content varies; geometry does not.
export default function RailHeading({ title, description, id, children }) {
  return <header className="wf-rail-heading">
    <div className="wf-rail-heading-copy">
      <h2 id={id}>{title}</h2>
      {description ? <p className="wf-rail-deck">{description}</p> : null}
    </div>
    {children ? <div className="wf-rail-heading-controls">{children}</div> : null}
  </header>;
}
