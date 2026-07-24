// v5.40 (July 2026 audit, Phase 8): full privacy notice structure — data
// retention by class, legal bases, user rights, transfers, consent, and
// security practices. DRAFT FOR COUNSEL REVIEW: statements marked
// [OWNER/COUNSEL: …] are policy decisions that must be made by the owner
// or reviewed by counsel before this page is treated as final. This page
// is a disclosure document, not legal advice.
export const metadata = { alternates: { canonical: "https://www.gowayfind.com/privacy" }, title: "Privacy & Disclosures | Wayfind", description: "What Wayfind collects, what it never sells, and how affiliate links are disclosed — in plain language." };

const S = {
  page: { background: "#0D1117", color: "#E6EDF3", minHeight: "100dvh", padding: "40px 20px 80px", fontFamily: "system-ui, -apple-system, sans-serif" },
  wrap: { maxWidth: 720, margin: "0 auto", lineHeight: 1.65, fontSize: 15 },
  h1: { fontSize: 26, fontWeight: 800, marginBottom: 4 },
  date: { color: "#8B949E", fontSize: 13, marginBottom: 28 },
  h2: { fontSize: 17, fontWeight: 800, marginTop: 28, marginBottom: 8, color: "#F0883E" },
  p: { margin: "0 0 12px", color: "#C9D1D9" },
  li: { margin: "0 0 8px", color: "#C9D1D9" },
  a: { color: "#F0883E", textDecoration: "underline", textUnderlineOffset: 2 },
};

export default function Privacy() {
  return (
    <div style={S.page}>
      <div style={S.wrap}>
        <h1 style={S.h1}>Privacy &amp; Disclosures</h1>
        <div style={S.date}>Wayfind &middot; Operated by WAYFIND LLC &middot; Effective July 10, 2026</div>

        <h2 style={S.h2}>What Wayfind is</h2>
        <p style={S.p}>Wayfind is a local discovery app that helps visitors find great places nearby. You can use most of it without an account. WAYFIND LLC is the data controller for the personal information described here.</p>

        <h2 style={S.h2}>What we collect</h2>
        <p style={S.p}>If you create an account: your email address. Authentication credentials are managed by Supabase; Wayfind does not receive or store plaintext passwords. Supabase stores salted password hashes.</p>
        <p style={S.p}>If you use features: places you save, like, or write tips about, and coupons you keep. Your search location is used to find nearby places and power results; we do not sell it or build advertising profiles from it. Preferences for signed-out visitors (saved spots, likes, settings) are stored on your own device and never leave it unless you sign in.</p>

        <h2 style={S.h2}>How long we keep it</h2>
        <p style={S.li}>&bull; <b>Account data</b> (email, saved places, tips): kept while your account exists; deleted when your account is deleted. [OWNER/COUNSEL: confirm any backup retention window, e.g. &ldquo;plus up to 30 days in encrypted backups&rdquo;.]</p>
        <p style={S.li}>&bull; <b>On-device data</b> (signed-out saves and preferences): stays on your device until you clear it; we never see it.</p>
        <p style={S.li}>&bull; <b>Analytics events</b>: retained by PostHog per our project settings. [OWNER/COUNSEL: set and state the retention period, e.g. 12 months.]</p>
        <p style={S.li}>&bull; <b>Server logs</b> (Vercel): short-lived operational logs. [OWNER/COUNSEL: confirm log retention period.]</p>

        <h2 style={S.h2}>Legal bases</h2>
        <p style={S.p}>Where laws such as the GDPR apply, we process personal data on these bases: performing our service for you (accounts, saved places), our legitimate interest in understanding and improving the product (analytics, security), and your consent where required (marketing email, if ever introduced). [OWNER/COUNSEL: confirm this mapping before relying on it.]</p>

        <h2 style={S.h2}>Your rights</h2>
        <p style={S.p}>You can request access to, a copy of, or deletion of your personal data at any time. Email <a style={S.a} href="mailto:privacy@gowayfind.com">privacy@gowayfind.com</a> from the address on your account and we will verify the request and respond. Deletion removes your account, saved places, and tips from our systems. [OWNER/COUNSEL: state the response window, e.g. within 30 days, and the export format, e.g. JSON by email.]</p>
        <p style={S.p}>Signed-out data lives on your device: clearing your browser storage removes it completely.</p>

        <h2 style={S.h2}>International transfers</h2>
        <p style={S.p}>Wayfind's providers (Vercel, Supabase, PostHog, Google, Resend) process data in the United States. If you use Wayfind from outside the US, your data is transferred to and processed in the US. [OWNER/COUNSEL: confirm transfer mechanisms with each provider — e.g. Standard Contractual Clauses / Data Privacy Framework participation.]</p>

        <h2 style={S.h2}>Location data &amp; analytics</h2>
        <p style={S.p}>Your precise device location (if you grant it) is used in your browser to rank nearby places and is sent to Google's Places service to run your searches. Analytics events describe features used and screens viewed. [OWNER/COUNSEL: confirm and state whether coordinates or coarse location ever reach PostHog; if they do, either stop sending them or disclose it explicitly here.] We do not sell location data.</p>

        <h2 style={S.h2}>Analytics, consent &amp; opt-out</h2>
        <p style={S.p}>We use PostHog to understand how the app is used (screens viewed, features tapped) so we can improve it. Analytics are for product improvement only. Web performance metrics (page speed measurements) are also collected. [OWNER/COUNSEL: decide the consent posture — e.g. whether a consent banner is required for your user base (EU/UK visitors) and what the opt-out mechanism is; document it here.]</p>

        <h2 style={S.h2}>Device recognition</h2>
        <p style={S.p}>To remember your preferences and recognize a returning device, we store a random, anonymous device identifier in your browser &mdash; in local storage and a first-party cookie that can last up to two years. It contains no personal information and is <b>first-party only</b>: we never use it for cross-site or cross-app tracking, and we never use fingerprinting or &ldquo;evercookie&rdquo; techniques to recreate it after you delete it. If you sign in, that device is linked to your account so your saved spots and preferences follow you across sessions and devices. <b>Opt out:</b> turn on &ldquo;Do Not Track&rdquo; in your browser and we switch to a session-only identifier that is not kept between visits; clearing your browser&rsquo;s site data removes it entirely. [OWNER/COUNSEL: confirm the consent posture for EU/UK visitors.]</p>

        <h2 style={S.h2}>Children</h2>
        <p style={S.p}>Wayfind is not directed at children and we do not knowingly collect personal information from children under 13. If you believe a child has provided us personal information, contact <a style={S.a} href="mailto:privacy@gowayfind.com">privacy@gowayfind.com</a> and we will delete it. [OWNER/COUNSEL: confirm the age threshold appropriate to your markets, e.g. 16 in parts of the EU.]</p>

        <h2 style={S.h2}>Security practices</h2>
        <p style={S.p}>All traffic is encrypted in transit (HTTPS). Accounts and data are hosted by Supabase with row-level security policies limiting each user to their own records. Passwords are never stored by Wayfind in any form (see above). Access to production systems is limited to the operator.</p>

        <h2 style={S.h2}>Emails</h2>
        <p style={S.p}>We send account emails (confirmation, password reset) through Resend and Supabase. No marketing email without your consent.</p>

        <h2 style={S.h2}>Affiliate disclosure</h2>
        <p style={S.p}>Some links to tickets, tours, hotels, and experiences (for example via Viator, GetYourGuide, Stay22 and its booking partners, and Travelpayouts and its partner brands such as Tiqets, Klook and TicketNetwork) are affiliate links. If you book through them, Wayfind may earn a commission at no extra cost to you. Commissions never influence our merit-based Wayfind Score. Where a placement is sponsored or commercially promoted, it is clearly labeled as such.</p>

        <h2 style={S.h2}>Service providers</h2>
        <p style={S.p}>Wayfind runs on Vercel and uses Google Maps Platform for places and maps, Supabase for accounts and data, PostHog for analytics, Resend for email, and Stay22 and Travelpayouts for booking-link optimization and affiliate tracking. Stay22 and Travelpayouts are third-party scripts that may set cookies to attribute bookings. [OWNER/COUNSEL: confirm the consent posture for these trackers for EU/UK visitors and document the opt-out mechanism.] Each processes only what is needed to provide the service.</p>

        <h2 style={S.h2}>Contact</h2>
        <p style={S.p}>WAYFIND LLC &middot; <a style={S.a} href="mailto:privacy@gowayfind.com">privacy@gowayfind.com</a></p>

        <p style={{ ...S.p, marginTop: 32 }}><a style={S.a} href="/">&larr; Back to Wayfind</a></p>
      </div>
    </div>
  );
}
