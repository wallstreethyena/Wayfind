"use client";
// Stamps the day the SERVER rendered this page into lib/siteDayClock.js before any
// seasonal component renders, so hydration matches the HTML exactly and a stale
// (up to an hour old) page corrects itself the moment it hydrates. See that file.
import { seedSiteDay } from "../../lib/siteDayClock.js";
export default function SiteDaySeed({ day }) {
  seedSiteDay(day);
  return null;
}
