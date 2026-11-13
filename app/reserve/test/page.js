import { notFound } from "next/navigation";
import TestCard from "./TestCard.js";
// Preview only: lets the owner try the whole guest booking flow on a Vercel preview against the
// demo partner "wf-test-kitchen" (scripts/reserve-seed-test-kitchen.sql). It does not exist in
// production, is never indexed, and is not in the sitemap.
export const dynamic = "force-dynamic";
export const metadata = { title: "Reserve test | Wayfind", robots: { index: false, follow: false } };
export default function ReserveTestPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <TestCard />;
}
