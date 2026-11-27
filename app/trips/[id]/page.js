import LiveTripClient from "./LiveTripClient.js";
// Wayfind Live Trips: a shared itinerary. Invite codes stay in the URL
// fragment, so crawlers, logs and link previews never see them; the page itself
// shows nothing until a member signs in.
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Plan this trip together | Wayfind",
  description: "Add places, move stops between days and leave notes. Everyone on the trip sees changes instantly.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function LiveTripPage({ params }) {
  const { id } = await params;
  return <LiveTripClient tripId={id} />;
}
