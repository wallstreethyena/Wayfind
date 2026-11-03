// Shared article for the linkable best-of routes. Renders nothing when the
// list is empty — the route turns that into a 404 before it gets here.
import { SITE_URL } from "../../lib/site";
import ShareButton from "../components/ShareButton";

export default function BestOfArticle({ model }) {
  if (!model || !Array.isArray(model.items) || model.items.length === 0) return null;
  const ld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: model.title,
    numberOfItems: model.items.length,
    itemListElement: model.items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      url: SITE_URL + item.href,
    })),
  };
  const shareUrl = SITE_URL + model.path;
  return (
    <article style={{ maxWidth: 720, margin: "0 auto", padding: "28px 18px 64px", color: "#F1F5F9", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <ShareButton url={shareUrl} title={model.title} text={model.intro || model.title} label="Share" tone="dark" event="page_share" meta={{ surface: "best_of", path: model.path }} />
      <h1 style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.4px", margin: "12px 0" }}>{model.title}</h1>
      {model.intro ? <p style={{ fontSize: 15, color: "#E2E8F0", lineHeight: 1.6, margin: "0 0 18px" }}>{model.intro}</p> : null}
      <ol style={{ margin: 0, paddingLeft: 20 }}>
        {model.items.map((item, i) => (
          <li key={item.href + ":" + i} style={{ margin: "0 0 16px" }}>
            <a href={item.href} style={{ color: "#F97316", fontWeight: 800, fontSize: 17, textDecoration: "none" }}>{item.name}</a>
            {item.when ? <p style={{ margin: "4px 0 0", color: "#94A3B8", fontSize: 13 }}>{item.when}</p> : null}
            {item.venue ? <p style={{ margin: "4px 0 0", color: "#CBD5E1", fontSize: 14 }}>{item.venue}</p> : null}
            {item.detail ? <p style={{ margin: "6px 0 0", color: "#E2E8F0", fontSize: 15, lineHeight: 1.55 }}>{item.detail}</p> : null}
          </li>
        ))}
      </ol>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
    </article>
  );
}
