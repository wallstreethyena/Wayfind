// Explicit editorial holds keep an information page without claiming dates.
// Never broaden DISPLAYABLE_STATUS: these rows remain outside dated discovery.
const SANTA_ID = "santas-wonderland-festival-2026";
export const SANTA_PENDING_SOURCE = "https://santaswonderlandfestival.com";
export const SANTA_PENDING_LINE = "2026 dates not confirmed yet";

export function isPendingEventPageRow(row) {
  return !!row && row.event_id === SANTA_ID && row.slug === SANTA_ID &&
    row.source_url === SANTA_PENDING_SOURCE && row.year === 2026 &&
    row.event_status === "unannounced" && row.verification_confidence === "low" &&
    row.start_date == null && row.end_date == null &&
    row.start_time == null && row.end_time == null;
}

export function pendingEventPageRow(row) {
  if (!isPendingEventPageRow(row)) return null;
  return {
    ...row,
    // Reuse the established pending-page presentation and metadata branch.
    christmas_watchlist: true,
    when_label: SANTA_PENDING_LINE,
    schedule_note: "2026 dates not confirmed yet. The organizer currently shows 2025 information. Check the official site for updates.",
    card_hook: "Santa's Wonderland Festival in Wimauma. Current 2026 dates await organizer confirmation.",
    editorial_summary: "Current 2026 dates await organizer confirmation. Wayfind is checking the official festival website for an updated announcement.",
    occurrence_dates: undefined,
    select_nights: false,
    season_undated: false,
    closing_unannounced: false,
  };
}
