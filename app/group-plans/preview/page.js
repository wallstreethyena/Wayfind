// Preview-build only demo of the Group Vote redesign (owner asked to see it
// before it goes live). Never served in production. Uses real Wayfind places
// for the rail; nothing it does writes anything or sends anything.
import { notFound } from "next/navigation";
import { GroupFrame, GroupVoteIntro } from "../GroupFrame.js";
import { GroupQuickCreate } from "../GroupPlanClient.js";
import PreviewBallot from "./PreviewBallot.js";
import { createGroupPlaceData } from "../../../lib/groupPlanPlaceData.js";
import { createGroupPlan, applyGroupPlanCommand, groupPlanView } from "../../../lib/groupPlan.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Group Vote preview | Wayfind", robots: { index: false, follow: false } };
const SEED = "ChIJ9_YnI8k_w4gRRiuNIcvA5y8"; // The Mall at University Town Center (the vote Gabe made)

async function demoPool() {
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, ""), key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  if (!url || !key) return [];
  try {
    const res = await createGroupPlaceData({ url, key }).suggest(SEED, Date.now());
    return [res.seed, ...(res.places || []), ...(res.experiences || [])].filter(Boolean);
  } catch { return []; }
}

export default async function GroupVotePreview({ searchParams }) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const params = await searchParams;
  const pool = await demoPool();
  if (params?.view === "ballot") {
    const now = new Date().toISOString(), day = 86400000;
    const places = (pool.length ? pool.slice(0, 3) : [{ id: SEED, name: "The Mall at University Town Center" }]).map((p) => ({ id: p.id, name: p.name }));
    const start = new Date(Date.now() + 3 * day).toISOString(), deadline = new Date(Date.now() + 2 * day).toISOString();
    const plan = applyGroupPlanCommand(createGroupPlan({ ownerId: "preview", organizerName: "Gabe", originalPlaceId: places[0].id, places, shareMode: "group", openGroup: true, invitees: [], times: [{ startsAt: start, endsAt: null }], deadline, timeZone: "America/New_York" }, { now, id: "preview", slotIds: [], timeIds: ["t1"] }), { id: "s1", type: "start" }, { now });
    const view = { ...groupPlanView(plan, { now }), role: "group", places: pool.length ? pool.slice(0, 3) : places };
    return <GroupFrame><PreviewBallot plan={view} /></GroupFrame>;
  }
  return <GroupFrame>
    <GroupVoteIntro title="Group Vote"><p className="gp-lede">Pick a few spots and a time. Your group votes from one link.</p></GroupVoteIntro>
    <GroupQuickCreate placeId={SEED} placeName="The Mall at University Town Center" session={null} initialPool={pool} demo />
  </GroupFrame>;
}
