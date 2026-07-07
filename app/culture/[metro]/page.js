// v4.16 — Indexable culture pages. Same editorial content the in-app culture
// cards render, served as real HTML so search engines can read it. These are
// the trust-and-authority pages in the middleman structure: they earn links
// and pass authority to the guides and the app through internal links.
import { CULTURE } from "../../../lib/culture";
import { SITE_URL } from "../../../lib/site";
import { experienceSearchUrl, viatorDirectUrl, experienceGoUrl } from "../../../lib/affiliates";

export function generateStaticParams() {
  return Object.keys(CULTURE).map((metro) => ({ metro }));
}

export function generateMetadata({ params }) {
  const c = CULTURE[params.metro];
  if (!c) return { title: "Not found" };
  const url = `${SITE_URL}/culture/${params.metro}`;
  const title = `What ${c.title} Is Known For: Food, Sayings & Must-Do Experiences`;
  const description = `What to eat in ${c.title}, the experiences not to miss, how locals talk, and the one etiquette rule visitors should know.`;
  return { title: `${title} | Wayfind`, description, alternates: { canonical: url }, openGraph: { title, description, url, siteName: "Wayfind", type: "article" } };
}

const S = {
  page: { maxWidth: 760, margin: "0 auto", padding: "28px 18px 60px", background: "#0D1117", color: "#E6EDF3", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", lineHeight: 1.6 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#2EC9A6" },
  h1: { fontSize: 30, lineHeight: 1.2, margin: "10px 0 8px", fontWeight: 800, color: "#FFFFFF" },
  sub: { fontSize: 16, color: "#8B949E", marginBottom: 22 },
  h2: { fontSize: 21, fontWeight: 800, color: "#FFFFFF", margin: "26px 0 10px" },
  item: { margin: "0 0 14px" },
  name: { fontSize: 16.5, fontWeight: 800, color: "#FFFFFF", margin: 0 },
  story: { fontSize: 15, color: "#C9D1D9", margin: "2px 0 0" },
  book: { display: "inline-block", marginTop: 6, padding: "6px 13px", borderRadius: 999, background: "#2EC9A6", color: "#0D1117", fontWeight: 800, fontSize: 13, textDecoration: "none" },
  phrase: { fontSize: 15.5, fontWeight: 800, color: "#FFFFFF" },
  meaning: { fontSize: 15, color: "#C9D1D9" },
  disclosure: { fontSize: 12, color: "#8B949E", margin: "22px 0 0", padding: "10px 14px", background: "#161B22", borderRadius: 10 },
  footerLink: { color: "#2EC9A6", textDecoration: "none", fontWeight: 700 },
};

export default function CulturePage({ params }) {
  const c = CULTURE[params.metro];
  if (!c) return <main style={S.page}><h1 style={S.h1}>Not found</h1><p><a href="/" style={S.footerLink}>Back to Wayfind</a></p></main>;
  return (
    <main style={S.page}>
      <div style={S.kicker}>Know before you go · {c.tag}</div>
      <h1 style={S.h1}>What {c.title} Is Known For</h1>
      <p style={S.sub}>The local food, the experiences you shouldn&apos;t leave without, the sights worth your eyes, and how the locals actually talk.</p>
      <h2 style={S.h2}>Eat like a local</h2>
      {c.eat.map((x, i) => (<div key={i} style={S.item}><p style={S.name}>{x.name}</p><p style={S.story}>{x.story}</p></div>))}
      <h2 style={S.h2}>Don&apos;t leave without</h2>
      {c.do.map((x, i) => {
        const url = x.viatorUrl ? viatorDirectUrl(x.viatorUrl) : (x.query ? experienceGoUrl(x.query, c.title) : null);
        return (<div key={i} style={S.item}><p style={S.name}>{x.name}</p><p style={S.story}>{x.story}</p>{url ? <a href={url} target="_blank" rel="noreferrer sponsored" style={S.book}>Book this experience ↗</a> : null}</div>);
      })}
      <h2 style={S.h2}>Worth your eyes</h2>
      {c.see.map((x, i) => (<div key={i} style={S.item}><p style={S.name}>{x.name}</p><p style={S.story}>{x.story}</p></div>))}
      <h2 style={S.h2}>Talk like a local</h2>
      {c.say.map((x, i) => (<p key={i} style={S.item}><span style={S.phrase}>{x.phrase}</span><span style={S.meaning}> — {x.meaning}</span></p>))}
      <h2 style={S.h2}>Good to know</h2>
      <p style={S.story}>{c.know}</p>
      <div style={S.disclosure}>Wayfind may earn a commission from partner links on this page.</div>
      <p style={{ fontSize: 15, color: "#C9D1D9", marginTop: 26 }}>
        Visiting {c.title}? <a href="/" style={S.footerLink}>Wayfind</a> ranks every restaurant, attraction, and hotel near you with live hours and honest scores{params.metro === "orlando" ? <>, and our <a href="/guides/things-to-do-orlando-not-theme-parks" style={S.footerLink}>non-theme-park Orlando guide</a> covers the days between parks</> : null}.
      </p>
    </main>
  );
}
