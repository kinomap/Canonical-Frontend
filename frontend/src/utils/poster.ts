import manifest from './posterManifest.json'
const posters = manifest as Record<string, {src:string;width:number}[]>
export function posterUrl(source: string | null | undefined): string | undefined { return source ? posters[source]?.at(-1)?.src || source : undefined }
/** Only resize a provider whose size-path contract is known. Never rewrite signed URLs. */
export function posterSrcset(source: string | null | undefined): string | undefined {
 if (!source) return undefined
 if (posters[source]) return posters[source]!.map(row => `${row.src} ${row.width}w`).join(', ')
 try {
  const url = new URL(source)
  if (url.hostname !== 'image.tmdb.org' || !/^\/t\/p\/(?:original|w\d+)\//.test(url.pathname) || url.search) return undefined
  return [185,342,500].map(width => `${url.origin}${url.pathname.replace(/^\/t\/p\/[^/]+\//, `/t/p/w${width}/`)} ${width}w`).join(', ')
 } catch { return undefined }
}
