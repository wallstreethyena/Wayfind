// app/preview/insider-tips/page.js — MOCKUP of an insider-tips homepage.
//
// A review surface for the owner, not a live page: noindex, not linked from
// the site, not in the sitemap, and it replaces nothing on /. The first paint
// is server-rendered from real Wayfind data (verified local tips + licensed
// vault photos, lib/insiderTipsPreview.js); the client then asks
// /api/preview/insider-tips for the witty Gemini version and swaps it in.
import InsiderTipsClient from "./InsiderTipsClient";
import { loadInsiderTips, plainAnswerFrom, quickPicks } from "../../../lib/insiderTipsPreview";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Wayfind: where are you headed?",
  description: "Insider tips from Florida locals, said simply.",
  robots: { index: false, follow: false },
};

export default async function InsiderTipsPreviewPage() {
  const rows = await loadInsiderTips().catch(() => []);
  const initial = plainAnswerFrom(rows, "", { reason: "first_paint" });
  return <InsiderTipsClient initial={initial} quickPicks={quickPicks()} tipCount={rows.length} />;
}
