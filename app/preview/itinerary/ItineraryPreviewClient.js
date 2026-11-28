"use client";
// Seeds one sample trip, then opens the real Itinerary screen. Every stop is a
// real Tampa place: rating and review counts read from wf_inventory on
// 2026-11-28, photos are the licensed picks of the things-to-do-in-tampa
// guide (lib/guidePickPhotoManifest.js). On gowayfind.com it never touches a
// visitor's saved trips; it only runs on preview hosts.
import { useEffect, useState } from "react";
import { commitProposedPlanToTrips } from "../../../lib/plannerActions";

const D = "/guides/picks/things-to-do-in-tampa-florida/";
const STOPS = [
  { id: "ChIJL_dfJozEwogRF_55TezQpYo", name: "Tampa Riverwalk", type: "Park", rating: 4.7, reviews: 5606, lat: 27.9447, lng: -82.4587, photo: D + "tampa-riverwalk.webp" },
  { id: "ChIJJboiAY3EwogRJCLbox7T-70", name: "Tampa Bay History Center", type: "History museum", rating: 4.7, reviews: 2121, lat: 27.9423, lng: -82.4489, photo: D + "tampa-bay-history-center.webp" },
  { id: "ChIJz8e7TVLEwogRBeybvscHnD4", name: "Columbia Restaurant", type: "Spanish restaurant", rating: 4.6, reviews: 22179, price: "$$", lat: 27.9600, lng: -82.4368, photo: D + "columbia-restaurant.webp" },
  { id: "ChIJCXAq5_DEwogRjTPE2xlsZtE", name: "The Florida Aquarium", type: "Aquarium", rating: 4.5, reviews: 21970, lat: 27.9441, lng: -82.4451, photo: D + "florida-aquarium.webp" },
  { id: "ChIJJb8wlVHEwogRywROz8FsuZM", name: "Ybor City Museum State Park", type: "State park", rating: 4.6, reviews: 1138, lat: 27.9616, lng: -82.4377, photo: D + "ybor-city-museum-state-park.webp" },
  { id: "ChIJ98cKiInEwogRfyDonUPi2bc", name: "Tampa Theatre", type: "Movie theater", rating: 4.8, reviews: 3240, lat: 27.9496, lng: -82.4590, photo: D + "tampa-theatre.webp" },
  { id: "ChIJBQ5SjLHGwogRL4X19g4J5tI", name: "ZooTampa at Lowry Park", type: "Zoo", rating: 4.6, reviews: 28317, lat: 28.0122, lng: -82.4697, photo: D + "zootampa-lowry-park-sign.webp" },
  { id: "ChIJKQXHdmfDwogRJFCLuT7eJ6I", name: "Bern's Steak House", type: "Steak house", rating: 4.6, reviews: 9833, lat: 27.9333, lng: -82.4834, photo: D + "berns-dessert-room.webp" },
].map((p) => ({ ...p, city: "Tampa", state: "FL", itemType: "place" }));

const stop = (i, slotLabel, note) => ({ id: STOPS[i].id, slotLabel, ...(note ? { note } : {}) });
const PLAN = {
  city: "Tampa",
  state: "FL",
  title: "Tampa Itinerary",
  startDate: "2026-12-04",
  endDate: "2026-12-06",
  days: [
    { date: "2026-12-04", stops: [stop(0, "11:00 AM", "Ease into the trip with a waterfront stroll on the Tampa Riverwalk."), stop(1, "1:30 PM"), stop(2, "7:00 PM")] },
    { date: "2026-12-05", stops: [stop(3, "10:00 AM"), stop(4, "1:30 PM"), stop(5, "7:30 PM")] },
    { date: "2026-12-06", stops: [stop(6, "10:00 AM"), stop(7, "6:30 PM")] },
  ],
};

export function isProductionHost(host) {
  return /(^|\.)gowayfind\.com$/i.test(String(host || ""));
}

export default function ItineraryPreviewClient() {
  const [msg, setMsg] = useState("Loading the preview…");
  useEffect(() => {
    try {
      if (isProductionHost(window.location.hostname)) {
        setMsg("This preview only runs on a preview link.");
        return;
      }
      const res = commitProposedPlanToTrips({}, PLAN, Object.fromEntries(STOPS.map((p) => [p.id, p])), { now: Date.now() });
      if (!res || !res.ok) { setMsg("The sample trip could not be built."); return; }
      window.localStorage.removeItem("wayfind_trips_owner");
      window.localStorage.setItem("wayfind_trips", JSON.stringify(res.nextTrips));
      window.location.replace("/?go=itinerary&city=Tampa");
    } catch (e) {
      setMsg("The preview could not load in this browser.");
    }
  }, []);
  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#040810", color: "#CBD5E1", fontFamily: "var(--wf-sans)", fontSize: 15 }}>
      {msg}
    </div>
  );
}
