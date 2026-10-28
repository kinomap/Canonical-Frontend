"""Install, exercise and uninstall the actual native candidate on GitHub only."""
import hashlib,json,os,platform,shutil,subprocess,tempfile
from pathlib import Path
from make_smoke_fixture import generate
ROOT=Path(__file__).resolve().parents[1]
def run(*args,**kwargs):
    try:subprocess.run(list(map(str,args)),check=True,timeout=180,**kwargs)
    except subprocess.CalledProcessError:
        report=ROOT/'dist/playback-smoke.json'
        if report.exists():print(report.read_text(),flush=True)
        raise
def main():
    if os.environ.get('GITHUB_ACTIONS')!='true':raise RuntimeError('Cloud runner required')
    system=platform.system();out=ROOT/'dist';receipt=out/'playback-smoke.json'
    with tempfile.TemporaryDirectory(prefix='kinosota-qa-') as temp:
        temp=Path(temp);fixture=temp/'fixture';generate(fixture)
        env=os.environ.copy();env['QT_QPA_PLATFORM']='offscreen'
        if system=='Windows':
            installer=out/'KINOSOTA-Player-Setup.exe';install=temp/'installed'
            run(installer,'/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-','/DIR='+str(install))
            executable=install/'kinosota-player.exe'
            env['PATH']=os.pathsep.join([str(Path(os.environ['SystemRoot'])/'System32'),os.environ['SystemRoot']])
            try:
                run(executable,'--playback-smoke-fixture',fixture,'--playback-smoke-report',receipt,env=env)
                assert json.loads(receipt.read_text())['status']=='PASS'
            finally:run(install/'unins000.exe','/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART')
            assert not executable.exists(), 'Uninstall left the app installed'
        elif system=='Darwin':
            installer=out/'KINOSOTA-Player.dmg';mount=temp/'mounted';installed=temp/'Applications/kinosota-player.app';installed.parent.mkdir()
            run('hdiutil','attach',installer,'-nobrowse','-readonly','-mountpoint',mount)
            try:shutil.copytree(mount/'kinosota-player.app',installed,symlinks=True)
            finally:run('hdiutil','detach',mount)
            env['PATH']='/usr/bin:/bin:/usr/sbin:/sbin'
            try:
                run(installed/'Contents/MacOS/kinosota-player','--playback-smoke-fixture',fixture,'--playback-smoke-report',receipt,env=env)
                assert json.loads(receipt.read_text())['status']=='PASS'
            finally:shutil.rmtree(installed)
            assert not installed.exists()
        else:raise RuntimeError('Linux uses disposable distro installation checks')
    digest=hashlib.sha256(installer.read_bytes()).hexdigest()
    (out/'SHA256SUMS').write_text(digest+'  '+installer.name+'\n',encoding='utf-8')
    (out/'candidate.json').write_text(json.dumps({'published':False,'version':'0.1.4','commit':os.environ['GITHUB_SHA'],'run_id':os.environ['GITHUB_RUN_ID'],'system':system,'architecture':platform.machine(),'filename':installer.name,'size':installer.stat().st_size,'sha256':digest,'install_playback_uninstall':'PASS','signing':'not-verified'},indent=2),encoding='utf-8')
if __name__=='__main__':main()
