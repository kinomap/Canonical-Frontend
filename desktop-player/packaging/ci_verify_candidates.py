"""Aggregate only verified cloud candidates; production release remains gated."""
import hashlib,json,os,sys
from pathlib import Path
root=Path(sys.argv[1]);manifests=list(root.glob('*/candidate.json'))
assert len(manifests)==3, 'Need exactly three native candidates'
seen=set()
for path in manifests:
    row=json.loads(path.read_text());artifact=path.parent/row['filename']
    assert row['system'] not in seen;seen.add(row['system'])
    assert row['commit']==os.environ['GITHUB_SHA'] and row['run_id']==os.environ['GITHUB_RUN_ID']
    assert row['published'] is False and row['install_playback_uninstall']=='PASS'
    assert artifact.stat().st_size==row['size']
    assert hashlib.sha256(artifact.read_bytes()).hexdigest()==row['sha256']
assert seen=={'Windows','Darwin','Linux'}
with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as stream:
    stream.write('### Three native cloud candidates verified\nWindows, macOS and Linux: install + HTTPS decoder playback + IPC + uninstall.\n\n**Not published.** Real Pro API E2E, distribution-license/signing review and production security/deployment checks remain separate release gates.\n')
print('THREE_NATIVE_CANDIDATES_PASS — NOT PUBLISHED')
