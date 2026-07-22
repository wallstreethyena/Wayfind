// v5.29 — E-E-A-T foundation (SEO audit July 2026): a real, named "who is
// behind this" page. Every claim here must stay true; nothing aspirational.
const _t = "About Wayfind · Who we are and how we work";
const _d = "Wayfind is a local discovery engine built in Florida by Gabriel Pereira and WAYFIND LLC. Live rankings from real review data — no ads, no paid placement.";
const _og = "https://www.gowayfind.com/api/og?t=" + encodeURIComponent("Who is behind Wayfind");
export const metadata = {
  title: _t,
  description: _d,
  alternates: { canonical: "https://www.gowayfind.com/about" },
  openGraph: { title: _t, description: _d, url: "https://www.gowayfind.com/about", siteName: "Wayfind", images: [{ url: _og, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: _t, description: _d, images: [_og] },
};

const S = {
  page: { maxWidth: 720, margin: "0 auto", padding: "28px 18px 60px", background: "#0D1117", color: "#E6EDF3", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", lineHeight: 1.65 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#F97316" },
  h1: { fontSize: 30, lineHeight: 1.2, margin: "10px 0 14px", fontWeight: 800, color: "#FFFFFF" },
  h2: { fontSize: 20, fontWeight: 800, color: "#FFFFFF", margin: "26px 0 8px" },
  p: { fontSize: 15, color: "#C9D1D9", margin: "0 0 12px" },
  a: { color: "#F97316", fontWeight: 700, textDecoration: "none" },
};

export default function Page() {
  return (
    <main style={S.page}>
      <div style={S.kicker}>About Wayfind</div>
      <h1 style={S.h1}>Built in Florida to answer one question: what&apos;s actually worth your time, right now?</h1>
      <p style={S.p}>Wayfind is a local discovery engine operated by WAYFIND LLC and founded by <b>Gabriel Pereira</b>, based in the Sarasota–Bradenton area of Florida. It ranks restaurants, beaches, attractions, nightlife, events, and hidden gems near you using live data — real ratings, real review volumes, current hours, distance, and the weather at this moment.</p>
      <p style={S.p}>We started with the Florida Gulf Coast — the towns we live in and know — and we go deep before we go wide. The app works anywhere, but our editorial coverage is strongest where we can stand behind it.</p>
      <h2 style={S.h2}>What makes Wayfind different</h2>
      <p style={S.p}>No ads. No paid placement. A business cannot buy its way up a Wayfind list, and affiliate partnerships never change a ranking — when we link to a booking partner we say so, and the pick was already ranked on merit. The full method is public: <a style={S.a} href="/how-wayfind-ranks">how Wayfind ranks</a>.</p>
      <h2 style={S.h2}>How our content is made</h2>
      <p style={S.p}>Guides and destination pages are researched from local sources, official venue information, and verified visitor data from major review platforms, then reviewed by the Wayfind team, led by Gabriel Pereira, a Sarasota–Bradenton-area resident. We don&apos;t claim first-hand visits unless we say so on the page. Details are in our <a style={S.a} href="/editorial-policy">editorial policy</a>.</p>
      <h2 style={S.h2}>Corrections and contact</h2>
      <p style={S.p}>Found something wrong — hours, a closed venue, a bad pick? Email <a style={S.a} href="mailto:hello@gowayfind.com">hello@gowayfind.com</a> and we&apos;ll fix it promptly. We&apos;d rather lose a listing than mislead a reader.</p>
    </main>
  );
}
