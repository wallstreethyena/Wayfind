import GroupPlanClient from "../GroupPlanClient.js";
import { groupPlanPreview } from "../../../lib/groupPlanPreview.js";
// Invitation secrets stay in the fragment. Public crawlers receive no names,
// roster, availability, vote result or bearer credentials.
export const dynamic="force-dynamic";
export async function generateMetadata({params}){const {id}=await params,preview=await groupPlanPreview(id);const title=preview?.finalized?`The plan: ${preview.title}`:preview?`Let’s go to ${preview.title}`:"Pick a place. Find a time.";const description="Choose where to go and when. Make a plan together on Wayfind.";return {title:`${title} | Wayfind`,description,robots: { index: false, follow: false },referrer:"no-referrer",openGraph:{title,description,...(preview?{images:[{url:preview.image,width:1200,height:630,alt:preview.title}]}:{})},twitter:{card:"summary_large_image",title,description,...(preview?{images:[preview.image]}:{})}};}
export default async function GroupPlanPage({params}){const {id}=await params;return <GroupPlanClient planId={id} enabled={process.env.NEXT_PUBLIC_GROUP_PLANS_ENABLED==="1"&&process.env.WF_GROUP_PLANS_ENABLED==="1"}/>;}
