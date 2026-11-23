import GroupPlanClient from "../GroupPlanClient.js";
import { groupPlanPreview } from "../../../lib/groupPlanPreview.js";
import { SITE_URL } from "../../../lib/site";
// Invitation secrets stay in the fragment. Public crawlers receive no names,
// roster, availability, vote result or bearer credentials.
export const dynamic="force-dynamic";
export async function generateMetadata({params}){const {id}=await params,preview=await groupPlanPreview(id);const title=preview?.finalized?`The plan: ${preview.title}`:preview?`Let’s vote on ${preview.title}`:"Group Vote — Pick the spot & day";const description="Tap once to pick your favorite spot and the days you can make it. No account needed.";const imageUrl=preview?.image||`${SITE_URL}/api/og?kind=group`;const imageAlt=preview?.title||"Wayfind Group Vote";return {title:`${title} | Wayfind`,description,robots: { index: false, follow: false },referrer:"no-referrer",openGraph:{title,description,images:[{url:imageUrl,width:1200,height:630,alt:imageAlt}]},twitter:{card:"summary_large_image",title,description,images:[imageUrl]}};}
export default async function GroupPlanPage({params}){const {id}=await params;return <GroupPlanClient planId={id} enabled={process.env.NEXT_PUBLIC_GROUP_PLANS_ENABLED==="1"&&process.env.WF_GROUP_PLANS_ENABLED==="1"}/>;}
