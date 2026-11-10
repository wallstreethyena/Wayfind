// Client-safe presentation gate. The server supplies the reviewed official URL;
// a stale secondary action cannot accompany an unrelated affiliate primary.
export function officialTicketIdentity(raw) {
  try {
    const u = new URL(String(raw || ""));
    if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash) return null;
    for (const key of ["brand", "camefrom", "webview"]) u.searchParams.delete(key);
    u.pathname = u.pathname.replace(/\/$/, "");
    return u.toString();
  } catch { return null; }
}

export function secondaryTicketPrimaryMatches(primary, secondary) {
  if (!primary || !secondary || secondary.kind !== "affiliate" || secondary.provider !== "ticketsmarter") return false;
  const official = officialTicketIdentity(secondary.officialTicketUrl);
  if (!official) return false;
  if (primary.kind === "organizer") return officialTicketIdentity(primary.href) === official;
  if (primary.kind !== "affiliate" || primary.provider !== "ticketmaster" || !String(primary.href || "").startsWith("/api/ticketmaster/go?")) return false;
  try {
    const go = new URL(primary.href, "https://www.gowayfind.com");
    if (go.pathname !== "/api/ticketmaster/go" || go.searchParams.getAll("url").length !== 1 ||
        go.searchParams.get("content") !== secondary.eventId || go.searchParams.get("offer") !== secondary.eventId) return false;
    const target = new URL(go.searchParams.get("url"));
    return ["ticketmaster.com", "www.ticketmaster.com"].includes(target.hostname) && officialTicketIdentity(target.href) === official;
  } catch { return false; }
}
