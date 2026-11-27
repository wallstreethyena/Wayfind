// /leaderboard — this month's top Wayfind explorers. Opted in members by the
// public name they chose; nothing else about them is shown. Points come from
// verified trip logs and published guides, both capped (lib/leaderboard.js).
import Link from "next/link";
import { SITE_URL } from "../../lib/site";
import { siteTodayStr } from "../../lib/siteTime";
import { tripLogEnv } from "../../lib/tripLogServer";
import { readLeaderboard } from "../../lib/leaderboard";
import { TIERS } from "../../lib/rewards";

export const revalidate = 300;

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Top explorers this month | Wayfind leaderboard",
  description: "Wayfind members who logged the most verified visits and shared the most trips this month.",
  alternates: { canonical: "/leaderboard" },
};

const tierName = (id) => (TIERS.find((t) => t.id === id) || TIERS[0]).name;

export default async function LeaderboardPage() {
  const today = siteTodayStr();
  let rows = [];
  try { rows = (await readLeaderboard(tripLogEnv(), today)) || []; } catch { rows = []; }
  const monthName = new Date(Date.parse(today + "T12:00:00Z")).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return (
    <main style={{ minHeight: "100vh", background: "#0D1117", color: "#F1F5F9", fontFamily: "var(--wf-sans, system-ui, -apple-system, sans-serif)" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 16px 64px", boxSizing: "border-box" }}>
        <h1 style={{ fontSize: "clamp(26px, 6vw, 34px)", fontWeight: 800, margin: "0 0 8px" }}>Top explorers in {monthName}</h1>
        <p style={{ fontSize: 15, color: "#CBD5E1", lineHeight: 1.55, margin: "0 0 18px" }}>Points for visits logged on the spot, local tips and trips shared as guides. Join from Rewards and badges in your account.</p>
        {rows.length ? (
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }} data-leaderboard="1">
            {rows.map((r) => (
              <li key={r.rank + r.name} style={{ display: "flex", alignItems: "center", gap: 12, background: "#1C2230", border: `1px solid ${r.rank <= 3 ? "rgba(251,191,36,.45)" : "#2D3748"}`, borderRadius: 14, padding: "10px 14px", minWidth: 0 }}>
                <span style={{ width: 28, flexShrink: 0, fontWeight: 800, color: r.rank <= 3 ? "#FBBF24" : "#94A3B8", fontSize: 16 }}>{r.rank}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 800, fontSize: 15, overflowWrap: "anywhere" }}>{r.name}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: "#94A3B8" }}>{tierName(r.tier)} · {r.verified} on the spot{r.guides ? ` · ${r.guides} guide${r.guides === 1 ? "" : "s"}` : ""}</span>
                </span>
                <span style={{ fontWeight: 800, fontSize: 15, flexShrink: 0 }}>{r.points} pts</span>
              </li>
            ))}
          </ol>
        ) : (
          <p style={{ color: "#94A3B8", fontSize: 15, lineHeight: 1.5 }}>No one is on the board yet this month. Log a visit while you are there and join from Rewards and badges to take the first spot.</p>
        )}
        <p style={{ marginTop: 22 }}><Link href="/community" style={{ color: "#FBBF24", fontWeight: 700, textDecoration: "none" }}>Community trip guides ›</Link></p>
      </div>
    </main>
  );
}
