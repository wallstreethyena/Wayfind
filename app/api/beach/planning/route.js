import { getBeachPlanning } from '../../../../lib/beachPlanningServer';
export const runtime = 'nodejs';
export const maxDuration = 30;
export async function GET(req) {
  const slug = new URL(req.url).searchParams.get('beach');
  const result = await getBeachPlanning(slug);
  return Response.json(result || { error: 'Unknown pilot beach' }, { status: result ? 200 : 404, headers: { 'Cache-Control': 'no-store' } });
}
