// v5.29 — E-E-A-T foundation (SEO audit July 2026): a real, named "who is
// behind this" page. Every claim here must stay true; nothing aspirational.
//
// v6.90 — owner: "our about us is really weak, don't you think? it is not
// selling Wayfind at all, and what we bring to the table — what we are
// about. i think we need to also enhance that and make it look premium
// also." Root cause was less about missing facts (the old copy was already
// honest) and more that it read like a legal disclosure page — one visual
// register, no hierarchy, the differentiators buried mid-paragraph instead
// of stated up front. Rewritten with the same true claims, structured so the
// three things that actually make Wayfind different (no ads ever, ranked for
// this exact moment, one public method) are the first thing a reader sees,
// not the third paragraph. No new facts were invented — every sentence here
// still has to be true the way the original comment above demands.
const _t = "About Wayfind · Who we are and how we work";
const _d = "Wayfind is a local discovery engine built in Florida by Gabriel Pereira and WAYFIND LLC. Every rank is decided by real reviews and what's actually true right now — no ads, no paid placement, ever.";
const _og = "https://www.gowayfind.com/api/og?t=" + encodeURIComponent("Who is behind Wayfind");
export const metadata = {
  title: _t,
  description: _d,
  alternates: { canonical: "https://www.gowayfind.com/about" },
  openGraph: { title: _t, description: _d, url: "https://www.gowayfind.com/about", siteName: "Wayfind", images: [{ url: _og, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: _t, description: _d, images: [_og] },
};

const ACCENT = "#F97316";
const S = {
  page: { maxWidth: 760, margin: "0 auto", padding: "28px 20px 70px", background: "#0D1117", color: "#E6EDF3", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", lineHeight: 1.65 },
  back: { display: "inline-block", fontSize: 13, fontWeight: 700, color: "#8b93a1", textDecoration: "none", marginBottom: 18 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1.6, textTransform: "uppercase", color: ACCENT },
  h1: { fontSize: 36, lineHeight: 1.14, margin: "12px 0 16px", fontWeight: 850, letterSpacing: "-0.6px", color: "#FFFFFF" },
  lede: { fontSize: 17, color: "#C9D1D9", margin: "0 0 8px", lineHeight: 1.6, maxWidth: 620 },
  h2: { fontSize: 21, fontWeight: 800, color: "#FFFFFF", margin: "40px 0 10px", letterSpacing: "-0.2px" },
  p: { fontSize: 15, color: "#C9D1D9", margin: "0 0 12px" },
  a: { color: "#F0B98A", fontWeight: 700, textDecoration: "none", borderBottom: "1px solid rgba(240,185,138,.4)" },
  cardGrid: { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", margin: "22px 0 6px" },
  card: { background: "#131b27", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: "16px 16px 14px" },
  cardTitle: { fontSize: 14.5, fontWeight: 800, color: "#FFFFFF", margin: "9px 0 5px" },
  cardBody: { fontSize: 13, color: "#9aa5b5", lineHeight: 1.5, margin: 0 },
  founder: { display: "flex", gap: 14, alignItems: "flex-start", background: "#131b27", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: "18px 18px 16px", margin: "14px 0" },
  founderBadge: { flexShrink: 0, width: 42, height: 42, borderRadius: "50%", background: "rgba(249,115,22,.14)", border: `1px solid rgba(249,115,22,.4)`, display: "grid", placeItems: "center", fontSize: 18 },
};

const DIFFERENTIATORS = [
  { icon: "🚫", title: "No ads, no paid placement — ever", body: "A business cannot buy its way up a Wayfind list. There is no product for that, and there never will be." },
  { icon: "⏱️", title: "Ranked for right now, not just nearby", body: "Distance, open-now status, weather, and the time of day all shape the order — a great spot that's closed tonight shouldn't win tonight." },
  { icon: "📖", title: "One public method, no black box", body: "Every ranked list traces back to the same documented Wayfind Score. You can go read exactly how it's calculated." },
];

export default function Page() {
  return (
    <main style={S.page}>
      <a style={S.back} href="/">‹ Back to Wayfind</a>
      <div style={S.kicker}>About Wayfind</div>
      <h1 style={S.h1}>Built to answer one question honestly: what&apos;s actually worth your time, right now?</h1>
      <p style={S.lede}>Wayfind is a local discovery engine operated by WAYFIND LLC and founded by <b>Gabriel Pereira</b>, based in the Sarasota–Bradenton area of Florida. It ranks restaurants, beaches, attractions, nightlife, events, and hidden gems near you using live data — real ratings, real review volumes, current hours, distance, and the weather at this moment.</p>

      <div style={S.cardGrid}>
        {DIFFERENTIATORS.map((d) => (
          <div key={d.title} style={S.card}>
            <div aria-hidden="true" style={{ fontSize: 20 }}>{d.icon}</div>
            <div style={S.cardTitle}>{d.title}</div>
            <p style={S.cardBody}>{d.body}</p>
          </div>
        ))}
      </div>

      <h2 style={S.h2}>How Wayfind decides</h2>
      <p style={S.p}>Every ranked list starts from the same place: a review-weighted method we call the Wayfind Score, built so a place with thousands of consistent reviews isn&apos;t beaten by five perfect ones. From there, what&apos;s true right now takes over — how far you&apos;d have to go, whether the place is actually open, and whether the weather makes an outdoor pick a good idea or a bad one. Affiliate partnerships never change any of it: when we link to a booking partner we say so, and the pick was already ranked on merit before that link ever existed. The full method, unedited, is public at <a style={S.a} href="/how-wayfind-ranks">how Wayfind ranks</a>.</p>

      <h2 style={S.h2}>Who&apos;s behind it</h2>
      <div style={S.founder}>
        <div aria-hidden="true" style={S.founderBadge}>🧭</div>
        <div>
          <p style={{ ...S.p, marginBottom: 6 }}><b>Gabriel Pereira</b> founded Wayfind and leads the team, working out of the Sarasota–Bradenton area of Florida.</p>
          <p style={{ ...S.p, marginBottom: 0 }}>We started with the Gulf Coast — the towns we actually live in and know — and go deep before we go wide. The app works anywhere, but our editorial coverage is strongest where we can stand behind every pick, and we say so rather than pretend otherwise as we expand into new markets like Orlando.</p>
        </div>
      </div>

      <h2 style={S.h2}>How our content is made</h2>
      <p style={S.p}>Guides and destination pages are researched from local sources, official venue information, and verified visitor data from major review platforms, then reviewed by the Wayfind team, led by Gabriel Pereira. We don&apos;t claim first-hand visits unless we say so on the page. Details are in our <a style={S.a} href="/editorial-policy">editorial policy</a>.</p>

      <h2 style={S.h2}>Corrections and contact</h2>
      <p style={S.p}>Found something wrong — hours, a closed venue, a bad pick? Email <a style={S.a} href="mailto:hello@gowayfind.com">hello@gowayfind.com</a> and we&apos;ll fix it promptly. We&apos;d rather lose a listing than mislead a reader.</p>
    </main>
  );
}
