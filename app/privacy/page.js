export const metadata = { alternates: { canonical: "https://www.gowayfind.com/privacy" }, title: "Privacy & Disclosures - Wayfind" };

const S = {
  page: { background: "#0D1117", color: "#E6EDF3", minHeight: "100vh", padding: "40px 20px 80px", fontFamily: "system-ui, -apple-system, sans-serif" },
  wrap: { maxWidth: 720, margin: "0 auto", lineHeight: 1.65, fontSize: 15 },
  h1: { fontSize: 26, fontWeight: 800, marginBottom: 4 },
  date: { color: "#8B949E", fontSize: 13, marginBottom: 28 },
  h2: { fontSize: 17, fontWeight: 800, marginTop: 28, marginBottom: 8, color: "#F0883E" },
  p: { margin: "0 0 12px", color: "#C9D1D9" },
  a: { color: "#F0883E", textDecoration: "none" },
};

export default function Privacy() {
  return (
    <div style={S.page}>
      <div style={S.wrap}>
        <div style={S.h1}>Privacy &amp; Disclosures</div>
        <div style={S.date}>Wayfind &middot; Effective July 5, 2026</div>

        <div style={S.h2}>What Wayfind is</div>
        <p style={S.p}>Wayfind is a local discovery app that helps visitors find great places nearby. You can use most of it without an account.</p>

        <div style={S.h2}>What we collect</div>
        <p style={S.p}>If you create an account: your email address and an encrypted password, handled by Supabase, our authentication and database provider. If you use features: places you save, like, or write tips about. Your search location is used to find nearby places and power results; we do not sell it or build advertising profiles from it. Preferences such as saved spots for signed-out visitors are stored on your own device.</p>

        <div style={S.h2}>Analytics</div>
        <p style={S.p}>We use PostHog to understand how the app is used (screens viewed, features tapped) so we can improve it. Analytics are for product improvement only.</p>

        <div style={S.h2}>Emails</div>
        <p style={S.p}>We send account emails (confirmation, password reset) through Resend and Supabase. No marketing email without your consent.</p>

        <div style={S.h2}>Affiliate disclosure</div>
        <p style={S.p}>Some links to tickets, tours, and experiences (for example via Viator or GetYourGuide) are affiliate links. If you book through them, Wayfind may earn a commission at no extra cost to you. Commissions never influence rankings or recommendations: what we feature is chosen on merit, and paid placement, if ever introduced, will be clearly labeled.</p>

        <div style={S.h2}>Service providers</div>
        <p style={S.p}>Wayfind runs on Vercel and uses Google Maps Platform for places and maps, Supabase for accounts and data, PostHog for analytics, and Resend for email. Each processes only what is needed to provide the service.</p>

        <div style={S.h2}>Your choices</div>
        <p style={S.p}>You can use Wayfind without an account. To delete your account and associated data, email <a style={S.a} href="mailto:gabrielpereira@me.com">gabrielpereira@me.com</a> and we will handle it promptly.</p>

        <p style={{ ...S.p, marginTop: 32 }}><a style={S.a} href="/">&larr; Back to Wayfind</a></p>
      </div>
    </div>
  );
}
