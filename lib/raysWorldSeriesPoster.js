import { canonicalShareUrl } from "./site.js";
// Owner, 2026-10-22: Rays first, ahead of Fall, until the World Series ends.
// Separate campaign identity: never expires with one home game's event record.
export const RAYS_POSTER = Object.freeze({
  id: "rays-world-series-2026",
  title: "Tampa Bay Rays",
  short: "World Series",
  href: "/guides/tampa-bay-rays-game-day-tropicana-field",
  livePosterSrc: "/cards-v8/campaigns/rays-world-series-2026.webp",
  opensPage: true,
  shareIntent: Object.freeze({ title: "Tampa Bay Rays — Wayfind", text: "Rays World Series game day", url: canonicalShareUrl("/guides/tampa-bay-rays-game-day-tropicana-field") }),
});

export function raysCampaignLive(today, complete = false) {
  return typeof today === "string" && today >= "2026-10-22" && today < "2027-01-01" && !complete;
}

export function isRaysLivePoster(rail) {
  return rail?.livePosterType === "sports" && /\bTampa Bay Rays\b/i.test(rail?.title || "");
}

// Only a completed World Series game involving the Rays can close the campaign.
// No games, missing hydration, a cancelled fixture or an unavailable feed cannot.
export function raysSeriesComplete(schedule) {
  const games = (schedule?.dates || []).flatMap((day) => day.games || []);
  return games.some((game) => game.gameType === "W" && String(game.season) === "2026"
    && [game.teams?.home?.team?.id, game.teams?.away?.team?.id].includes(139)
    && game.status?.abstractGameState === "Final" && game.seriesStatus?.isOver === true);
}
