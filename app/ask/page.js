// app/ask/page.js — the invite landing (v7.27).
//
// Someone was texted a Wayfind invite; this is where the link goes. The page
// itself is AskClient; this file exists to give the link its preview and to
// keep it out of search.
//
// NOINDEX, and not as a formality. The URL contains one person asking another
// person out. It is unlisted by construction (the payload is the only key), and
// indexing it would put a private invitation in a search result.
import AskClient from "./AskClient";
import { SITE_URL } from "../../lib/site";
import { decodeInvite } from "../../lib/dateInvite";

function s(v) { return Array.isArray(v) ? v[0] || "" : v || ""; }

export async function generateMetadata({ searchParams }) {
  const d = s(searchParams && searchParams.d);
  const inv = decodeInvite(d);
  // THE PREVIEW MUST NOT ANSWER THE QUESTION. Neither the title nor the
  // description may name the place or the plan: if the card can be replied to
  // inside the thread, nobody opens the link, and the whole flow — the yes, the
  // activity, the night — never happens. The image says the same nothing,
  // beautifully (kind=invite in /api/og).
  const who = inv && inv.from ? inv.from : "Someone";
  const title = who + " has a question for you";
  const desc = "Open it to answer.";
  const og = SITE_URL + "/api/og?kind=invite" + (d ? "&d=" + encodeURIComponent(d) : "");
  return {
    robots: { index: false, follow: false },
    metadataBase: new URL(SITE_URL),
    title: title + " — Wayfind",
    description: desc,
    openGraph: { title, description: desc, images: [{ url: og, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description: desc, images: [og] },
  };
}

export default function AskPage({ searchParams }) {
  const inv = decodeInvite(s(searchParams && searchParams.d));
  return <AskClient inv={inv} />;
}
