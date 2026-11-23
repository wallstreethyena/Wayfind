import GroupPlanClient from "./GroupPlanClient.js";
import { SITE_URL } from "../../lib/site";
const OG_IMAGE=`${SITE_URL}/api/og?kind=group`;
export const metadata={title:"Your group votes | Wayfind",description:"Start a quick group vote, pick the spot, and lock in a day together on Wayfind.",robots: { index: false, follow: false },referrer:"no-referrer",openGraph:{title:"Group Vote on Wayfind",description:"Pick your favorite spot and the days you can make it.",images:[{url:OG_IMAGE,width:1200,height:630,alt:"Wayfind Group Vote"}]},twitter:{card:"summary_large_image",title:"Group Vote on Wayfind",description:"Pick your favorite spot and the days you can make it.",images:[OG_IMAGE]}};
export default function GroupPlansPage(){return <GroupPlanClient mode="list" enabled={process.env.NEXT_PUBLIC_GROUP_PLANS_ENABLED==="1"&&process.env.WF_GROUP_PLANS_ENABLED==="1"}/>;}
