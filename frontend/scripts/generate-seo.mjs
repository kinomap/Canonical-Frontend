/** Public metadata snapshot. No credentials, admin APIs, playback APIs or Media Node URLs. */
import fs from 'node:fs/promises'
import path from 'node:path'
import {buildSeo,serializeJsonLd} from '../src/utils/seo.ts'
import {contentPath} from '../src/utils/contentPath.ts'
const origin=(process.env.SEO_PUBLIC_ORIGIN||'https://watch.scenrix.com').replace(/\/$/,'')
if(!/^https:\/\/[a-zA-Z0-9.-]+$/.test(origin))throw Error('An explicit HTTPS public origin is required')
const root=path.resolve('dist'), shell=(await fs.readFile(path.join(root,'index.html'),'utf8')).replace(/<script[^>]*data-showcase-seo[^>]*>[\s\S]*?<\/script>/g,'').replace(/<meta[^>]*(?:name|property)="(?:robots|og:[^"]+|twitter:[^"]+)"[^>]*>/g,'').replace(/<link[^>]*rel="canonical"[^>]*>/g,'').replace(/<link[^>]*rel="preload"[^>]*href="\/cinema\/[^"]+"[^>]*>/g,'')
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')
async function get(endpoint){const r=await fetch(origin+'/api/v1'+endpoint,{signal:AbortSignal.timeout(20000),headers:{Accept:'application/json'}});if(!r.ok)throw Error(`Public catalog ${endpoint}: ${r.status}`);return r.json()}
async function pages(kind){const all=[];let totalPages=1;for(let page=1;page<=totalPages;page++){const r=await get(`/${kind}?page=${page}&page_size=100`);totalPages=r.total_pages;if(!Number.isInteger(totalPages)||totalPages>500)throw Error('Catalog page bound invalid');all.push(...r.items)}return all}
function render(url,item,genre){const seo=buildSeo(url,origin,item,genre);const head=`<title>${esc(seo.title)}</title><meta name="description" content="${esc(seo.description)}"><meta name="robots" content="${seo.robots}"><link rel="canonical" href="${esc(seo.canonical)}">`+Object.entries({'og:title':seo.title,'og:description':seo.description,'og:image':seo.image,'og:type':seo.type,'og:url':seo.canonical,'twitter:card':'summary_large_image'}).map(([key,value])=>`<meta ${key.startsWith('og:')?'property':'name'}="${key}" content="${esc(value)}">`).join('')+seo.jsonLd.map(value=>`<script type="application/ld+json" data-showcase-seo="true">${serializeJsonLd(value)}</script>`).join('');return shell.replace('</head>',url==='/'?'<link rel="preload" as="image" href="/cinema/v1/hero-1200.webp" imagesrcset="/cinema/v1/hero-640.webp 640w, /cinema/v1/hero-1200.webp 1200w, /cinema/v1/hero-1740.webp 1740w" imagesizes="100vw" fetchpriority="high"></head>':'</head>').replace(/<title>[^<]*<\/title>/,'').replace(/<meta name="description"[^>]*>/,'').replace('</head>',head+'</head>')}
const movies=(await pages('movies')).filter(item=>item.status==='available'),series=await pages('series'),genres=await get('/genres')
const validId=id=>{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw Error('Unexpected catalog ID');return id}
const entries=[['/',undefined],['/movies',undefined],['/series',undefined],['/genres',undefined]]
for(const item of movies){validId(item.id);const detail=await get(`/movies/${item.id}`);if(detail.status==='available')entries.push([contentPath('movie',item.id,item.title),detail])}
for(const item of series){validId(item.id);const detail=await get(`/series/${item.id}`);if(detail.seasons?.some(season=>season.episodes?.some(episode=>episode.is_playable===true)))entries.push([contentPath('series',item.id,item.title),detail])}
const genreEntries=[]
for(const genre of genres){if(!/^[a-z0-9-]+$/.test(genre.slug))throw Error('Unsafe genre slug');const result=await get(`/genres/${encodeURIComponent(genre.slug)}?page_size=1`);if(result.total>0)genreEntries.push([`/genres?genre=${encodeURIComponent(genre.slug)}`,undefined,genre.name])}
for(const [url,item] of entries){if(item?.id)validId(item.id);const destination=path.join(root,url==='/'?'index.html':url+'/index.html');await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,render(url,item));if(item?.id){const legacy=path.join(root,url.startsWith('/series/')?'series':'movies',item.id,'index.html');await fs.mkdir(path.dirname(legacy),{recursive:true});await fs.writeFile(legacy,render(url,item))}}
// Nginx exact query route map can use these snapshots without changing API or routing semantics.
await fs.mkdir(path.join(root,'seo-genres'),{recursive:true})
for(const [url,,name] of genreEntries){const slug=new URL(url,origin).searchParams.get('genre');await fs.writeFile(path.join(root,'seo-genres',slug+'.html'),render(url,undefined,name))}
const urls=[...entries,...genreEntries].map(([url])=>origin+url)
await fs.writeFile(path.join(root,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(url=>`<url><loc>${esc(url)}</loc></url>`).join('')+'</urlset>')
await fs.writeFile(path.join(root,'robots.txt'),`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\nDisallow: /login\nDisallow: /auth/\nDisallow: /register\nDisallow: /profile\nDisallow: /media/\nDisallow: /stream/\nDisallow: /seo-genres/\nSitemap: ${origin}/sitemap.xml\n`)
await fs.writeFile(path.join(root,'seo-snapshot.json'),JSON.stringify({origin,generatedAt:new Date().toISOString(),movies:movies.length,series:entries.filter(([url])=>url.startsWith('/series/')).length,genres:genreEntries.length,refresh:'Regenerated at every public frontend image build; no background backend mutations.'},null,2))
console.log(JSON.stringify({seoGenerated:true,urls:urls.length,movies:movies.length,genres:genreEntries.length}))
