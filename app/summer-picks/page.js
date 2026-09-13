import { Suspense } from "react";
import Client from "./client";
import { SITE_URL } from "../../lib/site.js";

export const metadata = {
  title: "Florida Summer Picks | Wayfind",
  description: "Ranked Florida summer rails for water, sports, kids, rain, food, nightlife, nature and local finds.",
  robots: { index: false, follow: false },
  openGraph: { title: "Florida Summer Picks | Wayfind", images: [{ url: `${SITE_URL}/cards/best-summer-ever.jpg`, width: 760, height: 1350 }] },
};

export default function SummerPicksPage() {
  return <Suspense fallback={null}><Client /></Suspense>;
}
