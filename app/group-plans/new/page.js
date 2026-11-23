import GroupPlanClient from "../GroupPlanClient.js";
import { SITE_URL } from "../../../lib/site";
const OG_IMAGE=`${SITE_URL}/api/og?kind=group`;
export const metadata={title:"Group Vote | Wayfind",description:"Pick a few spots, drop one link in your group text, and lock in the plan.",robots: { index: false, follow: false },referrer:"no-referrer",openGraph:{title:"Start a Group Vote on Wayfind",description:"Pick the spot and find your day together.",images:[{url:OG_IMAGE,width:1200,height:630,alt:"Wayfind Group Vote"}]},twitter:{card:"summary_large_image",title:"Start a Group Vote on Wayfind",description:"Pick the spot and find your day together.",images:[OG_IMAGE]}};
export default async function NewGroupPlanPage({searchParams}){const params=await searchParams;return <GroupPlanClient mode="new" placeId={String(params?.place||"")} placeName={String(params?.name||"").slice(0,60)} enabled={process.env.NEXT_PUBLIC_GROUP_PLANS_ENABLED==="1"&&process.env.WF_GROUP_PLANS_ENABLED==="1"}/>;}
