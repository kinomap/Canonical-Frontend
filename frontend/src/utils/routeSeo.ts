import {apiClient} from '@/api/client'
import {applySeo,buildSeo} from './seo'
let generation=0
export async function updateRouteSeo(path:string):Promise<void>{
 const version=++generation, origin=window.location.origin, url=new URL(path,origin)
 applySeo(buildSeo(path,origin))
 const match=url.pathname.match(/^\/(movies|series)\/([^/]+)(?:\/[^/]+)?$/)
 try{
  if(match){const item=match[1]==='movies'?await apiClient.getMovie(match[2]!):await apiClient.getSeriesDetail(match[2]!);if(version===generation)applySeo(buildSeo(path,origin,item))}
  else if(url.pathname==='/genres' && url.searchParams.get('genre')){const genres=await apiClient.listGenres();const genre=genres.find(g=>g.slug===url.searchParams.get('genre'));if(version===generation)applySeo(buildSeo(path,origin,undefined,genre?.name))}
 }catch{/* Failed/unavailable detail remains noindex; never synthesize available media. */}
}
