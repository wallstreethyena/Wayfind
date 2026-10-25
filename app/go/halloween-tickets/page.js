import { permanentRedirect } from "next/navigation";

// /go/halloween-tickets is reserved in lib/goShortlinks.js so it cannot also
// become an event affiliate shortlink. This static page wins the route.
export const metadata = { robots: { index: false, follow: true } };

export default function GoHalloweenTicketsShortlink() {
  permanentRedirect("/halloween-in-florida");
}
