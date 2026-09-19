import { serveExperiences } from '../../../lib/experiencesServe.js';
import { catalogQuery } from '../../../lib/floridaCatalog.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  const query = catalogQuery(new URL(request.url).searchParams);
  if (!query) return Response.json({error:'Invalid category, city or page'}, {status:400});
  try {
    let data;
    if (process.env.WAYFIND_PREVIEW_PUBLIC_EVENTS === '1' && !process.env.VERCEL) {
      const params = new URLSearchParams({cat:query.cat,page:String(query.page),limit:String(query.limit)});
      if(query.city) params.set('city',query.city);
      const response = await fetch('https://www.gowayfind.com/api/experiences?'+params, {
        headers:{Origin:'https://www.gowayfind.com',Referer:'https://www.gowayfind.com/go/florida'},
        signal:AbortSignal.timeout(12000),cache:'no-store',
      });
      if(!response.ok) throw new Error('Preview catalog unavailable');
      data = await response.json();
    } else data = await serveExperiences(query);
    if(data.dark || !Array.isArray(data.items)) throw new Error('Catalog unavailable');
    // Raw partner URLs never leave this endpoint. Clicks use our tracked redirect.
    return Response.json({...data,items:data.items.map(({url,...item})=>item)}, {headers:{'Cache-Control':'public, s-maxage=300, stale-while-revalidate=600'}});
  } catch {
    return Response.json({unavailable:true,error:'Experiences are temporarily unavailable.'}, {status:503,headers:{'Cache-Control':'no-store'}});
  }
}
