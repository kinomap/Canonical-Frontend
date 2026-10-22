#!/usr/bin/env python3
"""Exercise actual Nginx delivery from a built image without exposing host ports."""
import argparse,subprocess,time,uuid
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--image',required=True);a=p.parse_args()
name='kinosota-static-check-'+uuid.uuid4().hex[:10]
def run(*args):return subprocess.check_output(['docker',*args],stderr=subprocess.STDOUT)
try:
 run('run','-d','--network','none','--name',name,a.image)
 for attempt in range(30):
  try:
   run('exec',name,'wget','-q','-O-','http://127.0.0.1/healthz');break
  except subprocess.CalledProcessError:time.sleep(0.2)
 else:raise RuntimeError('Nginx did not become healthy')
 root=Path(__file__).resolve().parents[1]/'frontend/public'
 files=sorted((root/'avatars').glob('*.svg'))+sorted((root/'genres').rglob('*.jpg'))
 assert len(files)>=26
 for file in files:
  body=run('exec',name,'wget','-q','-O-','http://127.0.0.1/'+str(file.relative_to(root)))
  assert body==file.read_bytes(),str(file)+' not served byte-for-byte (403/SPA fallback?)'
 font_root=Path(__file__).resolve().parents[1]/'design-system/fonts'
 fonts=run('exec',name,'find','/usr/share/nginx/html','-name','Manrope-*.ttf').decode().splitlines()
 assert fonts,'Self-hosted Manrope missing from image'
 for asset in fonts:
  relative=str(Path(asset).relative_to('/usr/share/nginx/html/public'))
  body=run('exec',name,'wget','-q','-O-','http://127.0.0.1/'+relative)
  assert body==(font_root/'Manrope-Variable.ttf').read_bytes(),'Font not served byte-for-byte'
 print('PASS: actual Nginx delivered',len(files),'avatar/genre assets and',len(fonts),'Manrope asset(s) byte-for-byte; no host port opened')
finally:subprocess.run(['docker','rm','-f',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
