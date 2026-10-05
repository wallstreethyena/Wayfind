import GroupPlanClient from "./GroupPlanClient.js";
export const metadata={title:"Your group plans | Wayfind",robots: { index: false, follow: false },referrer:"no-referrer"};
export default function GroupPlansPage(){return <GroupPlanClient mode="list" enabled={process.env.NEXT_PUBLIC_GROUP_PLANS_ENABLED==="1"&&process.env.WF_GROUP_PLANS_ENABLED==="1"}/>;}
