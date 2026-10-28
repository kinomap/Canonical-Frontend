"""Record Linux cloud candidate only after both fresh-distro checks passed."""
import hashlib,json,os
from pathlib import Path
out=Path('dist');artifact=out/'kinosota-player.deb'
for name in ['debian-12','ubuntu-24.04']:
    assert json.loads((out/f'playback-smoke-{name}.json').read_text())['status']=='PASS'
digest=hashlib.sha256(artifact.read_bytes()).hexdigest()
(out/'SHA256SUMS').write_text(digest+'  '+artifact.name+'\n')
(out/'candidate.json').write_text(json.dumps({'published':False,'version':'0.1.3','commit':os.environ['GITHUB_SHA'],'run_id':os.environ['GITHUB_RUN_ID'],'system':'Linux','architecture':'x86_64','filename':artifact.name,'size':artifact.stat().st_size,'sha256':digest,'install_playback_uninstall':'PASS','signing':'not-verified'},indent=2))
