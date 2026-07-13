// Terms of Service for Wayfind, operated by WAYFIND LLC (Florida).
const CONTACT_EMAIL = "hello@gowayfind.com";
const EFFECTIVE = "June 30, 2026";

export const metadata = { alternates: { canonical: "https://www.gowayfind.com/terms" },
  title: "Terms of Service · Wayfind",
  description: "The terms for using Wayfind.",
};

const wrap = { maxWidth: 760, margin: "0 auto", padding: "40px 22px 80px", color: "#CBD5E1", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", lineHeight: 1.65, fontSize: 15 };
const h1 = { color: "#F1F5F9", fontSize: 28, fontWeight: 800, margin: "0 0 6px", letterSpacing: "-0.4px" };
const h2 = { color: "#F1F5F9", fontSize: 18, fontWeight: 800, margin: "28px 0 8px" };
const muted = { color: "#94A3B8", fontSize: 13 };
const a = { color: "#F97316", textDecoration: "none", fontWeight: 700 };

export default function Terms() {
  return (
    <div style={{ background: "#0D1117", minHeight: "100dvh" }}>
      <div style={wrap}>
        <a href="/" style={{ ...a, fontSize: 13 }}>‹ Back to Wayfind</a>
        <h1 style={{ ...h1, marginTop: 18 }}>Terms of Service</h1>
        <div style={muted}>Effective {EFFECTIVE}</div>

        <p style={{ marginTop: 18 }}>These terms govern your use of Wayfind, operated by WAYFIND LLC, a Florida limited liability company ("Wayfind", "we", "us"). By using the app, you agree to them. If you do not agree, please do not use Wayfind.</p>

        <h2 style={h2}>The service</h2>
        <p>Wayfind helps you discover places and events nearby and surfaces ratings, distances, hours, and suggestions to help you decide where to go. Much of this information, including place details, hours, prices, and event listings, comes from third party sources. We work to present it accurately, but we cannot guarantee it is always current or correct. Always confirm critical details, such as hours, prices, availability, and reservations, directly with the venue or provider before you rely on them.</p>

        <h2 style={h2}>Affiliate links and third party transactions</h2>
        <p>Some links in Wayfind, including links to tickets and to tours and experiences, are affiliate links. If you book or buy through them, we may earn a commission at no extra cost to you. Any purchase, booking, or ticket you obtain is a transaction between you and that third party provider, such as a ticketing platform or a tours marketplace, under their terms and policies. Wayfind is not a party to that transaction and is not responsible for the products, services, pricing, fulfillment, cancellations, or refunds of those providers.</p>

        <h2 style={h2}>Acceptable use</h2>
        <p>Use Wayfind only for lawful, personal, non commercial purposes. Do not misuse the app, attempt to disrupt or reverse engineer it, scrape or harvest data from it, or use it in any way that violates applicable law or the rights of others.</p>

        <h2 style={h2}>Intellectual property</h2>
        <p>The Wayfind name, design, and original content are owned by us and may not be copied or used without permission. Place data, images, and event information belong to their respective owners and are shown under the terms of the sources we use.</p>

        <h2 style={h2}>Disclaimers and limitation of liability</h2>
        <p>Wayfind is provided "as is" and "as available", without warranties of any kind, whether express or implied, including accuracy, fitness for a particular purpose, or non infringement. To the fullest extent permitted by law, Wayfind and its operators are not liable for any indirect, incidental, or consequential damages, or for any loss arising from your reliance on information in the app or from transactions with third party providers.</p>

        <h2 style={h2}>Changes to these terms</h2>
        <p>We may update these terms as the app evolves. When we do, we will revise the effective date above. Continued use of Wayfind after a change means you accept the updated terms.</p>

        <h2 style={h2}>Contact</h2>
        <p>Questions about these terms? Reach us at <a href={"mailto:" + CONTACT_EMAIL} style={a}>{CONTACT_EMAIL}</a>.</p>

      </div>
    </div>
  );
}
