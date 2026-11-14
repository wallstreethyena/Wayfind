import ManageClient from "./ManageClient.js";
// A restaurant opens this from its private dashboard link. The token is a secret in the
// path: keep it out of search, out of referrers, and out of the sitemap.
export const dynamic = "force-dynamic";
export const metadata = { title: "Bookings | Wayfind", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function ReserveManagePage({ params }) {
  const { token } = await params;
  return <ManageClient token={String(token || "")} />;
}
