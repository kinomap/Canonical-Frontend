import {contentPath,cleanTitle} from './contentPath.ts'
type CatalogItem = { id?:string; title?:string; overview?:string|null; poster?:string|null;poster_url?:string|null; genres?:{name:string}[]; rating?:number|null; status?:string }
export type PageSeo={title:string;description:string;canonical:string;image:string;type:string;robots:string;jsonLd:Record<string,unknown>[]}
export function safeImage(source:string|undefined|null, origin:string):string {
 try {const u=new URL(source||'/cinema/v1/hero-1200.webp',origin);return ['https:','http:'].includes(u.protocol) && [new URL(origin).hostname,'image.tmdb.org'].includes(u.hostname) && /\.(?:avif|webp|png|jpe?g)$/i.test(u.pathname) && !/\/(stream|api|hls)\//i.test(u.pathname) ? u.href : new URL('/cinema/v1/hero-1200.webp',origin).href} catch{return new URL('/cinema/v1/hero-1200.webp',origin).href}
}
export function buildSeo(path:string,origin:string,item?:CatalogItem,genreName?:string):PageSeo {
 const u=new URL(path,origin), type=u.pathname.startsWith('/series/')?'TVSeries':'Movie'
 const isDetail=/^\/(movies|series)\/[^/]+/.test(u.pathname)
 const unavailable=isDetail && (!item || (type==='Movie' && item.status!=='available'))
 const torrentPage=u.pathname==='/torrents'||u.pathname.startsWith('/torrents/')
 const privatePage=/^\/(?:api|admin|auth|login|register|profile)(?:\/|$)/.test(u.pathname)
 const genre=u.pathname==='/genres' ? u.searchParams.get('genre') : null
 const canonical=origin.replace(/\/$/,'')+(isDetail&&item?.id&&item?.title?contentPath(type==='Movie'?'movie':'series',item.id,item.title):u.pathname)+(genre?`?genre=${encodeURIComponent(genre)}`:'')
 const label=torrentPage ? 'Торренты · каталог TMDB' : isDetail&&item?.title ? cleanTitle(item.title) : genreName ? `${genreName} — фильмы и сериалы` : ({'/':'Фильмы и сериалы','/movies':'Фильмы','/series':'Сериалы','/genres':'Жанры','/discover':'Подборки кино'} as Record<string,string>)[u.pathname]||'KINOSOTA'
 const description=item?.overview?.trim().slice(0,240)||`${label} на KINOSOTA. Новинки, популярные истории и удобный каталог по жанрам. Больше, чем просто просмотр.`
 const jsonLd:Record<string,unknown>[]=[]
 if(u.pathname==='/')jsonLd.push({'@context':'https://schema.org','@type':'WebSite',name:'KINOSOTA',url:origin,potentialAction:{'@type':'SearchAction',target:{'@type':'EntryPoint',urlTemplate:origin+'/movies?q={search_term_string}'},'query-input':'required name=search_term_string'}})
 const image=safeImage(item?.poster||item?.poster_url,origin)
 if(isDetail&&!unavailable){
  const schema:Record<string,unknown>={'@context':'https://schema.org','@type':type,name:cleanTitle(item!.title!),description,image,url:canonical,genre:item!.genres?.map(g=>g.name)||[]}
  if(typeof item!.rating==='number' && item!.rating!>0 && item!.rating!<=10)schema.aggregateRating={'@type':'AggregateRating',ratingValue:item!.rating,bestRating:10,worstRating:0}
  jsonLd.push(schema,{'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Главная',item:origin},{'@type':'ListItem',position:2,name:type==='Movie'?'Фильмы':'Сериалы',item:origin+(type==='Movie'?'/movies':'/series')},{'@type':'ListItem',position:3,name:cleanTitle(item!.title!),item:canonical}]})
 }
 return {title:label.includes('KINOSOTA')?label:`${label} — KINOSOTA`,description,canonical,image,type:isDetail&&!unavailable?(type==='Movie'?'video.movie':'video.tv_show'):'website',robots:torrentPage||privatePage||unavailable?'noindex, nofollow':'index, follow',jsonLd}
}
export function serializeJsonLd(value:unknown):string{return JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026')}
export function applySeo(seo:PageSeo):void {
 document.title=seo.title
 const meta=(key:string,value:string,property=false)=>{const attribute=property?'property':'name';let node=document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);if(!node){node=document.createElement('meta');node.setAttribute(attribute,key);document.head.append(node)}node.content=value}
 meta('description',seo.description);meta('robots',seo.robots)
 for(const [key,value] of Object.entries({'og:title':seo.title,'og:description':seo.description,'og:image':seo.image,'og:type':seo.type,'og:url':seo.canonical,'og:site_name':'KINOSOTA'}))meta(key,value,true)
 meta('twitter:card','summary_large_image');meta('twitter:title',seo.title);meta('twitter:description',seo.description);meta('twitter:image',seo.image)
 let canonical=document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.append(canonical)}canonical.href=seo.canonical
 document.head.querySelectorAll('script[data-showcase-seo]').forEach(node=>node.remove())
 for(const data of seo.jsonLd){const node=document.createElement('script');node.type='application/ld+json';node.dataset.showcaseSeo='true';node.textContent=serializeJsonLd(data);document.head.append(node)}
}
