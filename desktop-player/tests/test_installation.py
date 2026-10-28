import sys,importlib.util
from pathlib import Path
from xml.etree import ElementTree as ET
from PySide6.QtWidgets import QApplication,QMessageBox
from kinosota_player.installation import uninstall_command,show_uninstall

def test_portable_and_source_preview_cannot_uninstall_system_package(monkeypatch):
    monkeypatch.setattr(sys,'frozen',False,raising=False)
    assert uninstall_command('Linux') is None
    assert uninstall_command('Windows') is None
    assert uninstall_command('Darwin') is None

def test_linux_removal_is_fixed_package_and_not_shell(monkeypatch):
    monkeypatch.setattr(sys,'frozen',True,raising=False);monkeypatch.setattr(sys,'executable','/opt/kinosota-player/kinosota-player')
    # Simulate a resolved Linux install path even when this source test runs on Windows.
    monkeypatch.setattr(Path,'resolve',lambda p:p)
    monkeypatch.setattr(Path,'is_file',lambda p:True)
    assert uninstall_command('Linux')==['/usr/bin/pkexec','/usr/bin/dpkg','--remove','kinosota-player']

def test_graphical_removal_cancellation_never_starts_process(monkeypatch):
    from kinosota_player import installation
    app=QApplication.instance() or QApplication([])
    monkeypatch.setattr(installation,'uninstall_command',lambda:['/usr/bin/pkexec','/usr/bin/dpkg','--remove','kinosota-player'])
    monkeypatch.setattr(QMessageBox,'question',lambda *a:QMessageBox.StandardButton.No)
    monkeypatch.setattr(installation,'QProcess',lambda *a:(_ for _ in ()).throw(AssertionError('Must not run')))
    show_uninstall()

def test_linux_metadata_maps_installed_package_to_desktop_and_graphical_removal(tmp_path):
    module=Path(__file__).parents[1]/'packaging/linux_metadata.py';spec=importlib.util.spec_from_file_location('linux_metadata',module);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    (tmp_path/'opt/player').mkdir(parents=True);(tmp_path/'opt/player/app').write_bytes(b'fixture')
    m.write_metadata(tmp_path,'0.1.5','amd64','2.36')
    root=ET.parse(tmp_path/'usr/share/metainfo/com.kinosota.Player.metainfo.xml').getroot()
    assert root.findtext('launchable')=='kinosota-player.desktop' and root.findtext('pkgname')=='kinosota-player'
    assert root.findtext('developer/name')=='KINOSOTA'
    assert [c.text for c in root.findall('categories/category')]==['AudioVideo','Video','Player']
    desktop=(tmp_path/'usr/share/applications/kinosota-player.desktop').read_text()
    assert 'Exec=kinosota-player --uninstall' in desktop and 'Actions=Uninstall;' in desktop
    for script in ['postinst','postrm']:
        s=(tmp_path/'DEBIAN'/script).read_text();assert 'pkexec' not in s and 'sudo' not in s and 'kinosota-player' not in s
    control=(tmp_path/'DEBIAN/control').read_text();assert 'Installed-Size:' in control and 'Homepage: https://watch.scenrix.com/player' in control

def test_settings_navigation_and_copy_actual_plain_account(tmp_path):
    from PySide6.QtCore import QSettings
    from kinosota_player.settings import SettingsDrawer
    from kinosota_player.preferences import Preferences
    from PySide6.QtWidgets import QWidget
    app=QApplication.instance() or QApplication([]);parent=QWidget();parent.resize(760,600);parent.show()
    drawer=SettingsDrawer(parent,Preferences(QSettings(str(tmp_path/'prefs'),QSettings.Format.IniFormat)));drawer.present();drawer.animation.setCurrentTime(180)
    for i in range(4):
        drawer.select_page(i);app.processEvents();assert drawer.stack.currentIndex()==i and drawer.nav[i].isChecked()
        assert parent.rect().contains(drawer.panel.geometry())
    drawer.update_account({'username':'<b>not markup</b>','email':'viewer@example.test','subscription_status':'free'})
    drawer.copy_buttons['email'].click();assert app.clipboard().text()=='viewer@example.test'
    assert drawer.fields['username'].text()=='<b>not markup</b>'
    drawer.retranslate('en');assert drawer.nav[1].text()=='My account'
    drawer.dismiss();parent.close()
