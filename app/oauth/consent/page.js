import OAuthConsentClient from "./OAuthConsentClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Authorize AI access | Wayfind",
  robots: { index: false, follow: false },
};

function first(value) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function OAuthConsentPage({ searchParams }) {
  searchParams = await searchParams;
  const authorizationId = String(first(searchParams && searchParams.authorization_id)).slice(0, 2048);
  return <OAuthConsentClient authorizationId={authorizationId} />;
}
