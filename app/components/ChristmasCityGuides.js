import { christmasCityGuides, christmasFaq } from "../../lib/christmasCityGuides.js";
import { SITE_URL } from "../../lib/site";

// Server rendered: plain <a href> links Google can crawl, and a visible
// "Good to know" block that the FAQPage markup describes word for word.
// Same dark panel as the creator posts section on this page; no new design.
const PANEL = { margin: "0 0 28px", padding: "16px", border: "1px solid #26303B", borderRadius: 14, background: "#111821" };
const GRID = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 16 };
const GROUP = { padding: "14px 14px 6px", border: "1px solid #2b3642", borderRadius: 12, background: "#0d131a" };
const LINK = { color: "#86efac", display: "flex", alignItems: "center", minHeight: 44, fontSize: 15, lineHeight: 1.35, textDecoration: "none" };
const SUMMARY = { cursor: "pointer", color: "#fff", fontWeight: 700, fontSize: 16, lineHeight: 1.4, padding: "12px 0", minHeight: 44 };

export default function ChristmasCityGuides({ today }) {
  const groups = christmasCityGuides(today);
  const faq = christmasFaq();
  const faqSchema = faq.length ? {
    "@context": "https://schema.org", "@type": "FAQPage", "@id": SITE_URL + "/christmas-in-florida#good-to-know",
    mainEntity: faq.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
  } : null;
  return <>
    {groups.length ? <section id="city-guides" data-christmas-section="City guides" style={PANEL} aria-labelledby="city-guides-title">
      <h2 id="city-guides-title" style={{ marginTop: 0 }}>Florida Christmas guides by city</h2>
      <p style={{ margin: "0 0 16px", color: "#cbbab2", fontSize: 15, lineHeight: 1.6 }}>Local picks for lights, kids, free nights, parades and date nights, written for each area.</p>
      <div style={GRID}>
        {groups.map((group) => <div key={group.id} style={GROUP}>
          <h3 style={{ margin: "0 0 4px", color: "#fff", fontSize: 18 }}>{group.title}</h3>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {group.links.map((link) => <li key={link.href} style={{ borderTop: "1px solid #1e2731" }}>
              <a href={link.href} style={LINK} data-city-guide={group.id}>{link.label}</a>
            </li>)}
          </ul>
        </div>)}
      </div>
    </section> : null}
    {faqSchema ? <section id="good-to-know" data-christmas-section="Good to know" style={PANEL} aria-labelledby="good-to-know-title">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, "\\u003c") }} />
      <h2 id="good-to-know-title" style={{ marginTop: 0 }}>Good to know</h2>
      {faq.map((item) => <details key={item.q} style={{ borderTop: "1px solid #1e2731" }}>
        <summary style={SUMMARY}>{item.q}</summary>
        <p style={{ margin: "0 0 8px", color: "#cbbab2", fontSize: 15, lineHeight: 1.6 }}>{item.a}</p>
        <p style={{ margin: "0 0 12px" }}><a href={item.href} style={{ color: "#86efac", fontSize: 14 }}>More in {item.guideTitle ? item.guideTitle.split(":")[0] : "the guide"}</a></p>
      </details>)}
    </section> : null}
  </>;
}
