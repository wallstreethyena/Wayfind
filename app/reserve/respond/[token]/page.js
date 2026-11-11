import RespondClient from "./RespondClient.js";
// A restaurant opens this from one emailed link. The token is a secret in the
// path: keep it out of search, out of referrers, and out of the sitemap.
export const dynamic = "force-dynamic";
export const metadata = { title: "Table request | Wayfind", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function ReserveRespondPage({ params }) {
  const { token } = await params;
  return <RespondClient token={String(token || "")} />;
}
