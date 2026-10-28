"""Desktop/software-center identity. No root GUI or install-time app launch."""
from pathlib import Path
from xml.etree import ElementTree as ET

def write_metadata(stage,version,architecture,libc):
    stage=Path(stage)
    for path in ['DEBIAN','usr/share/applications','usr/share/metainfo','usr/share/icons/hicolor/128x128/apps','usr/share/icons/hicolor/256x256/apps','usr/share/icons/hicolor/512x512/apps']:(stage/path).mkdir(parents=True,exist_ok=True)
    size=sum(f.stat().st_size for f in (stage/'opt').rglob('*') if f.is_file())//1024
    (stage/'DEBIAN/control').write_text(f'Package: kinosota-player\nVersion: {version}\nArchitecture: {architecture}\nMaintainer: KINOSOTA\nHomepage: https://watch.scenrix.com/player\nInstalled-Size: {size}\nDepends: libc6 (>= {libc}), mpv (>= 0.35), libxcb-cursor0, libxkbcommon-x11-0, libegl1, libgl1, libdbus-1-3, libxcb-icccm4, libxcb-image0, libxcb-keysyms1, libxcb-render-util0, libxcb-xinerama0, libxcb-xkb1, gnome-keyring, pkexec\nSection: video\nPriority: optional\nDescription: KINOSOTA Player - your desktop cinema\n Browse the KINOSOTA catalogue and watch through native mpv.\n Playback requires an eligible account. Graphical uninstall is available\n in Settings / About, with system authorization.\n')
    (stage/'usr/share/applications/kinosota-player.desktop').write_text('[Desktop Entry]\nVersion=1.0\nType=Application\nName=KINOSOTA Player\nGenericName=Movie Player\nGenericName[ru]=Киноплеер\nComment=Browse your KINOSOTA catalogue and watch movies\nComment[ru]=Каталог KINOSOTA и просмотр фильмов\nExec=kinosota-player\nTryExec=kinosota-player\nIcon=kinosota-player\nTerminal=false\nCategories=AudioVideo;Video;Player;\nKeywords=KINOSOTA;cinema;movies;mpv;\nStartupWMClass=kinosota-player\nActions=Uninstall;\n\n[Desktop Action Uninstall]\nName=Uninstall KINOSOTA Player\nName[ru]=Удалить KINOSOTA Player\nExec=kinosota-player --uninstall\nIcon=system-software-install\n')
    component=ET.Element('component',{'type':'desktop-application'})
    def child(name,text,attributes=None):ET.SubElement(component,name,attributes or {}).text=text
    child('id','com.kinosota.Player');child('metadata_license','CC0-1.0');child('name','KINOSOTA Player');child('summary','Your KINOSOTA catalogue and native movie playback')
    developer=ET.SubElement(component,'developer',{'id':'com.kinosota'});ET.SubElement(developer,'name').text='KINOSOTA'
    description=ET.SubElement(component,'description');ET.SubElement(description,'p').text='Browse the KINOSOTA catalogue, choose Russian or English interface and movie titles, and watch with the native mpv player. Playback requires an eligible account.'
    child('launchable','kinosota-player.desktop',{'type':'desktop-id'});child('url','https://watch.scenrix.com/player',{'type':'homepage'});child('icon','kinosota-player',{'type':'stock'});child('pkgname','kinosota-player')
    releases=ET.SubElement(component,'releases');ET.SubElement(releases,'release',{'version':version,'date':'2026-10-28','type':'development'})
    ET.indent(component);ET.ElementTree(component).write(stage/'usr/share/metainfo/com.kinosota.Player.metainfo.xml',encoding='utf-8',xml_declaration=True)
    # Refresh discovery caches only; never start a GUI as root or guess a desktop user.
    for name in ['postinst','postrm']:
        f=stage/'DEBIAN'/name;f.write_text('#!/bin/sh\nset -e\nif command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database -q /usr/share/applications || true; fi\nif command -v gtk-update-icon-cache >/dev/null 2>&1; then gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true; fi\nexit 0\n');f.chmod(0o755)
