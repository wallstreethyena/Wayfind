import { permanentRedirect } from "next/navigation";

// Reel sticker alias. Not a second indexable destination.
export const metadata = { robots: { index: false, follow: true } };

export default function HalloweenTicketsShortlink() {
  permanentRedirect("/halloween-in-florida");
}
