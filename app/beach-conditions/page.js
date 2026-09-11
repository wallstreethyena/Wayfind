import Conditions from './Conditions';
import { BEACH_PILOT } from '../../lib/beachPlanning';
import './style.css';
export const metadata = { title: 'Beach conditions | Wayfind', alternates: { canonical: 'https://www.gowayfind.com/beach-conditions' }, description: 'Separate, timestamped weather, swimming reports and red-tide evidence for five Manatee and Sarasota beaches.' };
export default async function BeachConditionsPage({ searchParams }) {
  const params = await searchParams;
  const initialSlug = BEACH_PILOT.find(b => b.slug === params?.beach)?.slug || "coquina";
  return <main className="beach-planner"><a className="back" href="/best-beaches/manatee-sarasota">← Sarasota & Anna Maria beaches</a><p className="eyebrow">WAYFIND · FIVE-BEACH PILOT</p><h1>Know before<br />your toes hit the sand.</h1><p className="intro">Beach conditions, with the evidence in view. Five local beaches. Official sources. No safety score.</p><Conditions initialSlug={initialSlug} /></main>;
}
