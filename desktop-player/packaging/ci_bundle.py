"""Assemble native mpv dependencies on GitHub; retain provenance and licenses.
Hash inventory is integrity evidence, not a substitute for a distribution-license review.
"""
import argparse,hashlib,json,platform,shutil,subprocess,sys
from pathlib import Path
from verify_bundle import validate_directory

def run(*args):return subprocess.check_output(list(map(str,args)),text=True)
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--prefix',type=Path);args=parser.parse_args()
    root=Path(__file__).resolve().parents[1];out=root/'build/mpv-bundle'
    if out.exists():raise RuntimeError('Fresh native bundle required')
    out.mkdir(parents=True);licenses=out/'LICENSES';licenses.mkdir()
    system=platform.system()
    if system=='Windows':
        prefix=args.prefix.resolve();exe=prefix/'bin/mpv.exe'
        shutil.copy2(exe,out/'mpv.exe')
        # Full UCRT runtime inventory avoids silently missing transitive DLLs.
        for dll in (prefix/'bin').glob('*.dll'):shutil.copy2(dll,out/dll.name)
        source=prefix/'share/licenses'
        if not source.is_dir():raise RuntimeError('MSYS2 licenses missing')
        shutil.copytree(source,licenses/'MSYS2',dirs_exist_ok=True)
        sources=['https://github.com/msys2/MINGW-packages','https://repo.msys2.org/mingw/sources/']
        pacman=prefix.parent/'usr/bin/pacman.exe'
        (licenses/'package-versions.txt').write_text(run(pacman,'-Q'),encoding='utf-8')
    elif system=='Darwin':
        shutil.copy2(shutil.which('mpv'),out/'mpv');(out/'mpv').chmod(0o755)
        subprocess.run(['dylibbundler','-od','-b','-x',str(out/'mpv'),'-d',str(out/'lib'),'-p','@executable_path/lib/'],check=True)
        inventory=json.loads(run('brew','info','--json=v2','--installed'))
        sources=['https://github.com/Homebrew/homebrew-core']
        for formula in inventory['formulae']:
            for entry in formula['installed']:
                cellar=Path(run('brew','--cellar',formula['name']).strip())/entry['version']
                for candidate in cellar.rglob('*'):
                    if candidate.is_file() and any(term in candidate.name.lower() for term in ('license','copying','copyright','notice')):
                        target=licenses/formula['name']/candidate.relative_to(cellar);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(candidate,target)
            url=formula.get('urls',{}).get('stable',{}).get('url')
            if url and url.startswith('https://'):sources.append(url)
        (licenses/'homebrew-inventory.json').write_text(json.dumps(inventory,indent=2),encoding='utf-8')
        for link in list((out/'lib').glob('*')):
            if link.is_symlink():
                content=link.read_bytes();link.unlink();link.write_bytes(content);link.chmod(0o755)
        for binary in [out/'mpv',*(out/'lib').glob('*')]:
            dependencies=run('otool','-L',binary)
            if '/opt/homebrew/' in dependencies or '/usr/local/' in dependencies:raise RuntimeError('Unbundled Homebrew dependency')
    else:raise RuntimeError('Native Win/mac bundle only')
    architecture={'AMD64':'x86_64','x86_64':'x86_64','arm64':'arm64','aarch64':'arm64'}[platform.machine()]
    files={p.relative_to(out).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in out.rglob('*') if p.is_file()}
    (out/'bundle.json').write_text(json.dumps({'system':system,'architecture':architecture,'sources':sources,'files':files},indent=2),encoding='utf-8')
    validate_directory(out,system)
    exe=out/('mpv.exe' if system=='Windows' else 'mpv')
    subprocess.run([sys.executable,'packaging/build.py','--mpv-bundle',str(out),'--mpv-sha256',hashlib.sha256(exe.read_bytes()).hexdigest()],cwd=root,check=True)
if __name__=='__main__':main()
