// app/preview/insider-tips/page.js — MOCKUP of an insider-tips homepage.
//
// A review surface for the owner, not a live page: noindex, not linked from
// the site, not in the sitemap, and it replaces nothing on /. The first paint
// is server-rendered from real Wayfind data (verified local tips + licensed
// vault photos, lib/insiderTipsPreview.js); the client then asks
// /api/preview/insider-tips for the witty Gemini version and swaps it in.
// Owner 2026-11-28 ("not very converting"): the first screen now sells. It
// leads with this weekend's top rated bookable events (real photo, rating,
// price, ticket button), then the weekly email, then the insider tips, then
// the Christmas events with tickets (lib/insiderSellPreview.js).
import InsiderTipsClient from "./InsiderTipsClient";
import NewsletterSignup from "../../components/NewsletterSignup";
import { loadInsiderTips, plainAnswerFrom, quickPicks } from "../../../lib/insiderTipsPreview";
import { loadSellModel } from "../../../lib/insiderSellPreview";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Wayfind: where are you headed?",
  description: "Insider tips from Florida locals, said simply.",
  robots: { index: false, follow: false },
};

export default async function InsiderTipsPreviewPage() {
  const [rows, sell] = await Promise.all([loadInsiderTips().catch(() => []), loadSellModel()]);
  const initial = plainAnswerFrom(rows, "", { reason: "first_paint" });
  const signup = <NewsletterSignup source="home-preview" back="/preview/insider-tips" heading="Get the best of each weekend, free" />;
  return <InsiderTipsClient initial={initial} quickPicks={quickPicks()} tipCount={rows.length} sell={sell} signup={signup} />;
}
