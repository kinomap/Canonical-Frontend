"""Release-time public poster derivatives; no backend/media-node writes or arbitrary URL proxy."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin,urlsplit
from PIL import Image,ImageOps
import hashlib,io,json,urllib.request
ROOT=Path(__file__).resolve().parents[1];ORIGIN='https://watch.scenrix.com'
def get(path):
 with urllib.request.urlopen(ORIGIN+'/api/v1'+path,timeout=25) as r:return json.load(r)
def listing(kind):
 result=[];page=1
 while True:
  data=get('/'+kind+'?page='+str(page)+'&page_size=100');result+=data['items']
  if page>=data['total_pages']:return result
  if page>=500:raise ValueError('Pagination safety bound')
  page+=1
items=listing('movies')+listing('series');sources=sorted({item.get('poster') or item.get('poster_url') for item in items if item.get('poster') or item.get('poster_url')})
out=ROOT/'frontend/public/posters/v1';out.mkdir(parents=True,exist_ok=True)
def convert(source):
 url=urljoin(ORIGIN,source);u=urlsplit(url)
 if u.scheme!='https' or u.hostname not in ('watch.scenrix.com','image.tmdb.org'):return source,None,'host_not_allowed'
 if u.hostname=='watch.scenrix.com' and not u.path.startswith('/media/posters/'):return source,None,'not_a_public_poster'
 try:
  request=urllib.request.Request(url,headers={'User-Agent':'KINOSOTA-public-poster-build/1.0'})
  with urllib.request.urlopen(request,timeout=30) as r:
   final=urlsplit(r.geturl());assert final.scheme=='https' and final.hostname in ('watch.scenrix.com','image.tmdb.org')
   data=r.read(8*1024*1024+1);assert len(data)<=8*1024*1024
  im=ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert('RGB');assert im.width*im.height<=25000000
  key=hashlib.sha256(data).hexdigest()[:20];rows=[]
  for width in (185,342,500):
   resized=im.resize((width,round(im.height*width/im.width)),Image.Resampling.LANCZOS)
   file=f'{key}-{width}.webp';resized.save(out/file,'WEBP',quality=82,method=6)
   rows.append({'src':'/posters/v1/'+file,'width':width})
  return source,rows,None
 except Exception as ex:return source,None,type(ex).__name__
results=list(ThreadPoolExecutor(max_workers=4).map(convert,sources))
manifest={source:rows for source,rows,error in results if rows}
(ROOT/'frontend/src/utils/posterManifest.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n')
report={'total_sources':len(sources),'converted':len(manifest),'failures':[{'source':source,'error':error} for source,rows,error in results if not rows],'note':'Current available-catalog snapshot; new posters fall back to original until next release build.'}
print(json.dumps(report,ensure_ascii=False))
if report['failures']:raise SystemExit(1)
