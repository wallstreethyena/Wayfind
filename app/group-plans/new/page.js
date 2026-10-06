import GroupPlanClient from "../GroupPlanClient.js";
export const metadata={title:"Pick a place. Find a time. | Wayfind",robots: { index: false, follow: false },referrer:"no-referrer"};
export default async function NewGroupPlanPage({searchParams}){const params=await searchParams;return <GroupPlanClient mode="new" placeId={String(params?.place||"")} enabled={process.env.NEXT_PUBLIC_GROUP_PLANS_ENABLED==="1"&&process.env.WF_GROUP_PLANS_ENABLED==="1"}/>;}
