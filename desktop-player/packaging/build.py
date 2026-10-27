"""Native build only. Does not upload, publish or mark a release ready."""
import argparse,hashlib,json,os,platform,shutil,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def run(*args):subprocess.run([str(a) for a in args],cwd=ROOT,check=True)
def main():
    p=argparse.ArgumentParser();p.add_argument('--mpv-bundle',type=Path);p.add_argument('--mpv-sha256');args=p.parse_args()
    system=platform.system();out=ROOT/'dist';name='kinosota-player'
    cmd=[sys.executable,'-m','PyInstaller','--noconfirm','--clean','--onedir','--windowed','--name',name,'--add-data',str(ROOT/'kinosota_player/assets')+os.pathsep+'kinosota_player/assets','--collect-all','keyring']
    # Generate the OS icon from our existing bee asset, not from a stock executable.
    if system in ('Windows','Darwin'):
        from PySide6.QtGui import QImage
        from PySide6.QtCore import Qt
        image=QImage(str(ROOT/'kinosota_player/assets/drone.png'))
        icon_root=ROOT/'build/icons';icon_root.mkdir(parents=True,exist_ok=True)
        if system=='Windows':
            icon=icon_root/'kinosota.ico'
            if not image.scaled(256,256,Qt.AspectRatioMode.KeepAspectRatio,Qt.TransformationMode.SmoothTransformation).save(str(icon),'ICO'):raise RuntimeError('Cannot generate Windows icon')
        else:
            iconset=icon_root/'KINOSOTA.iconset';iconset.mkdir(exist_ok=True)
            for size in (16,32,128,256,512):
                for scale in (1,2):
                    image.scaled(size*scale,size*scale,Qt.AspectRatioMode.KeepAspectRatio,Qt.TransformationMode.SmoothTransformation).save(str(iconset/f'icon_{size}x{size}{"@2x" if scale==2 else ""}.png'))
            icon=icon_root/'kinosota.icns';run('iconutil','-c','icns',iconset,'-o',icon)
        cmd+=['--icon',str(icon)]
    if system!='Linux':
        if not args.mpv_bundle or not args.mpv_sha256:p.error('Reviewed native mpv bundle and SHA256 required; never use MSX_Player.exe')
        bundle=args.mpv_bundle.resolve();exe=bundle/('mpv.exe' if system=='Windows' else 'mpv')
        if not exe.is_file() or hashlib.sha256(exe.read_bytes()).hexdigest()!=args.mpv_sha256:p.error('mpv digest does not match')
        if not (bundle/'LICENSES').is_dir():p.error('mpv bundle must include LICENSES, source/source-offer and dependency notices')
        cmd+=['--add-data',str(bundle)+os.pathsep+'mpv']
    if system=='Darwin':
        cmd+=['--osx-bundle-identifier','com.kinosota.player']
    run(*cmd,'launcher.py')
    # Keep dynamic Qt libraries external for LGPL replacement. Include license texts.
    qt=Path(__import__('PySide6').__file__).parent
    license_out=(out/(name+'.app')/'Contents/Resources' if system=='Darwin' else out/name)/'THIRD_PARTY_LICENSES';license_out.mkdir(parents=True,exist_ok=True)
    for folder in [qt/'Qt/licenses',qt/'doc/licenses',qt/'licenses']:
        if folder.is_dir():shutil.copytree(folder,license_out/'PySide6-Qt',dirs_exist_ok=True)
    import importlib.metadata as md
    inventory=[]
    for package in ['PySide6','PySide6_Essentials','PySide6_Addons','shiboken6','httpx','keyring','SecretStorage']:
        try:
            d=md.distribution(package);inventory.append({'name':package,'version':d.version})
            for f in d.files or []:
                if '.dist-info/' in str(f) and any(s in str(f).lower() for s in ['license','copying','notice']):
                    source=Path(d.locate_file(f))
                    if source.is_file():target=license_out/package/str(f).split('.dist-info/',1)[1];target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
        except md.PackageNotFoundError:pass
    (license_out/'inventory.json').write_text(json.dumps(inventory,indent=2))
    shutil.copy2(ROOT/'packaging/THIRD_PARTY.md',license_out/'NOTICE.md')
    if system=='Linux':
        assert shutil.which('mpv'),'Linux package depends on reviewed distro mpv'
        stage=ROOT/'build/deb';shutil.rmtree(stage,ignore_errors=True)
        app=stage/'opt/kinosota-player';app.parent.mkdir(parents=True,exist_ok=True);shutil.copytree(out/name,app)
        for path in ['DEBIAN','usr/bin','usr/share/applications','usr/share/icons/hicolor/512x512/apps']:(stage/path).mkdir(parents=True,exist_ok=True)
        arch=subprocess.check_output(['dpkg','--print-architecture'],text=True).strip()
        libc=platform.libc_ver()[1]
        if not libc:raise RuntimeError('Cannot determine minimum glibc version')
        (stage/'DEBIAN/control').write_text(f'Package: kinosota-player\nVersion: 0.1.0\nArchitecture: {arch}\nMaintainer: KINOSOTA\nDepends: libc6 (>= {libc}), mpv (>= 0.35), libxcb-cursor0, libxkbcommon-x11-0, libegl1, libgl1, libdbus-1-3, gnome-keyring\nSection: video\nPriority: optional\nDescription: KINOSOTA desktop catalogue and authenticated mpv player\n Paid subscription required for playback.\n')
        wrapper=stage/'usr/bin/kinosota-player';wrapper.write_text('#!/bin/sh\nexec /opt/kinosota-player/kinosota-player "$@"\n');wrapper.chmod(0o755)
        (stage/'usr/share/applications/kinosota-player.desktop').write_text('[Desktop Entry]\nType=Application\nName=KINOSOTA Player\nComment=KINOSOTA catalogue and playback\nExec=kinosota-player\nIcon=kinosota-player\nTerminal=false\nCategories=AudioVideo;Video;Player;\nStartupWMClass=kinosota-player\n')
        shutil.copy2(ROOT/'kinosota_player/assets/drone.png',stage/'usr/share/icons/hicolor/512x512/apps/kinosota-player.png')
        run('dpkg-deb','--root-owner-group','--build',stage,out/'kinosota-player.deb')
    elif system=='Windows':
        run('ISCC.exe',ROOT/'packaging/windows.iss')
    elif system=='Darwin':
        # Signing and notarization remain release gates, never fabricate them here.
        app=out/(name+'.app')
        run('hdiutil','create','-volname','KINOSOTA Player','-srcfolder',app,'-ov','-format','UDZO',out/'KINOSOTA-Player.dmg')
    else:p.error('Unsupported native build OS')
    print('Candidate built. NOT published; native installation, playback and release checks are still required.')
if __name__=='__main__':main()
