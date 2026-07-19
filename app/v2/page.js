// app/v2/page.js — the Discovery v2 preview surface.
//
// Gated on NEXT_PUBLIC_DISCOVERY_V2. With the flag absent or off this route
// 404s, so merging this to main changes nothing a visitor can reach; the live
// app keeps serving app/home.js untouched. Turn it on in a Vercel preview to
// review the new design against real inventory.

import { notFound } from "next/navigation";
import { DISCOVERY_V2_ENABLED } from "../../lib/discoveryV2";
import CategoryScreenV2 from "./CategoryScreenV2";

export const metadata = {
  title: "Discovery v2 preview — Wayfind",
  // Never let an in-progress design surface into search results.
  robots: { index: false, follow: false },
};

export default function DiscoveryV2Page() {
  if (!DISCOVERY_V2_ENABLED) notFound();
  return <CategoryScreenV2 initialCat="attractions" />;
}
