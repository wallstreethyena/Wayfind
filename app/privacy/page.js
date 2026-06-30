// Privacy Policy — standard template for a location-discovery app. Review before
// launch and set CONTACT_EMAIL to a real inbox you monitor.
const CONTACT_EMAIL = "your-email@example.com"; // TODO: set your real contact email
const EFFECTIVE = "June 30, 2026";

export const metadata = {
  title: "Privacy Policy · Wayfind",
  description: "How Wayfind handles your data.",
};

const wrap = { maxWidth: 760, margin: "0 auto", padding: "40px 22px 80px", color: "#CBD5E1", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", lineHeight: 1.65, fontSize: 15 };
const h1 = { color: "#F1F5F9", fontSize: 28, fontWeight: 800, margin: "0 0 6px", letterSpacing: "-0.4px" };
const h2 = { color: "#F1F5F9", fontSize: 18, fontWeight: 800, margin: "28px 0 8px" };
const muted = { color: "#94A3B8", fontSize: 13 };
const a = { color: "#F97316", textDecoration: "none", fontWeight: 700 };

export default function Privacy() {
  return (
    <div style={{ background: "#0D1117", minHeight: "100vh" }}>
      <div style={wrap}>
        <a href="/" style={{ ...a, fontSize: 13 }}>‹ Back to Wayfind</a>
        <h1 style={{ ...h1, marginTop: 18 }}>Privacy Policy</h1>
        <div style={muted}>Effective {EFFECTIVE}</div>

        <p style={{ marginTop: 18 }}>Wayfind ("Wayfind", "we", "us") is a local discovery app that helps you find places and events nearby. This policy explains what we collect, how we use it, and the choices you have. We built Wayfind to work without an account, and we keep data collection to what the app actually needs.</p>

        <h2 style={h2}>Information we collect</h2>
        <p><strong style={{ color: "#F1F5F9" }}>Location.</strong> If you allow it, we use your device location to show places and events near you and to estimate distances. You can use the app without location by searching for a place or city instead. We do not sell your location, and we do not continuously track you in the background.</p>
        <p style={{ marginTop: 10 }}><strong style={{ color: "#F1F5F9" }}>Saved places and preferences.</strong> Your saved spots, lists, and likes are stored locally on your device. They stay on your device unless you choose to sign up or share a list, in which case the items needed for that feature are sent to our service.</p>
        <p style={{ marginTop: 10 }}><strong style={{ color: "#F1F5F9" }}>Usage data.</strong> We log basic, non identifying app events, such as which screens are used and whether results loaded, so we can fix problems and improve the app.</p>
        <p style={{ marginTop: 10 }}><strong style={{ color: "#F1F5F9" }}>Sign up details.</strong> If you choose to sign up, we collect the email or contact details you provide so we can save your information across devices.</p>

        <h2 style={h2}>How we use information</h2>
        <p>We use the information above to show relevant nearby results, estimate distances and travel context, remember your saved places when you ask us to, diagnose and fix technical issues, and improve the quality of recommendations. We do not use it to build advertising profiles, and Wayfind does not show paid ads inside the app.</p>

        <h2 style={h2}>Third party services</h2>
        <p>Wayfind relies on a few third party services to function. Place information and maps come from Google. Weather comes from a public weather service. Event information comes from event providers such as ticketing platforms. When you tap a link to one of these services, or to an affiliate partner, that service receives the request and applies its own privacy policy. We encourage you to review the policies of services you visit.</p>

        <h2 style={h2}>Affiliate links and cookies</h2>
        <p>Some links in Wayfind, including links to tickets and to tours and experiences, are affiliate links. If you book or buy through one of these links, we may earn a commission at no extra cost to you. These partners may set a cookie in your browser to attribute the referral. This does not change the price you pay. See our <a href="/terms" style={a}>Terms</a> for more.</p>

        <h2 style={h2}>Data storage and retention</h2>
        <p>Most of your activity, including saved places and preferences, lives on your device and is removed when you clear it. Any data you send us by signing up or sharing a list is retained only as long as needed to provide that feature, and you can ask us to delete it using the contact below.</p>

        <h2 style={h2}>Children</h2>
        <p>Wayfind is not directed to children under 13, and we do not knowingly collect personal information from them. If you believe a child has provided us information, contact us and we will remove it.</p>

        <h2 style={h2}>Your choices</h2>
        <p>You control location permission in your device settings and can turn it off at any time. You can clear your saved places and preferences by clearing the app's local data. If you signed up, you can request access to or deletion of your data using the contact below.</p>

        <h2 style={h2}>Changes to this policy</h2>
        <p>We may update this policy as the app evolves. When we do, we will revise the effective date above. Continued use of Wayfind after a change means you accept the updated policy.</p>

        <h2 style={h2}>Contact</h2>
        <p>Questions about this policy or your data? Reach us at <a href={"mailto:" + CONTACT_EMAIL} style={a}>{CONTACT_EMAIL}</a>.</p>

        <div style={{ ...muted, marginTop: 36, paddingTop: 16, borderTop: "1px solid #2D3748" }}>This document is a general template and not legal advice. Consider having a professional review it for your jurisdiction before launch.</div>
      </div>
    </div>
  );
}
