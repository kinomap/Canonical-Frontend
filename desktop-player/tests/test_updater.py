"""0.1.9: updating the installed player from Settings → «О приложении», over the current copy."""
import os
os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')
import hashlib, sys
from pathlib import Path
import httpx
import pytest
from PySide6.QtCore import QSettings
from PySide6.QtWidgets import QApplication, QWidget
from kinosota_player import __version__, installation, updater as updates
from kinosota_player.api import Api, ApiError
from kinosota_player.installation import install_command, restart_command
from kinosota_player.updater import Updater, evaluate, fits_machine, is_newer, version_tuple

SHA = 'ab' * 32


def releases(version='0.2.0', paid=True, ready=True, sha=SHA, architecture='amd64', os_name='linux'):
    item = {'os': os_name, 'ready': ready, 'version': version if ready else None, 'sha256': sha if ready else None,
            'channel': 'stable', 'architecture': architecture, 'signing': 'not-verified',
            'download_url': f'/api/v1/desktop/download/{os_name}' if ready and paid else None}
    others = [{'os': name, 'ready': False, 'version': None, 'sha256': None, 'download_url': None}
              for name in ('windows', 'macos', 'linux') if name != os_name]
    return {'name': 'KINOSOTA Player', 'requires_paid_subscription': True, 'can_download': paid,
            'access_basis': 'subscription' if paid else None, 'items': [item] + others}


def test_versions_compare_numerically_and_only_this_computer_build_counts():
    assert __version__ == '0.1.9' and version_tuple('0.1.10') == (0, 1, 10) and version_tuple('v1.0') is None
    assert is_newer('0.1.10', '0.1.9') and not is_newer('0.1.9', '0.1.9') and not is_newer('0.1.8', '0.1.9')
    assert not is_newer(None) and not is_newer('0.2', 'garbage')
    assert fits_machine('amd64', 'x86_64') and fits_machine('arm64', 'aarch64') and not fits_machine('arm64', 'x86_64')
    assert fits_machine(None, 'x86_64') and fits_machine('universal2', 'arm64')  # Unknown labels: the installer decides.
    state, item = evaluate(releases(), 'Linux', 'x86_64')
    assert state == 'available' and item['version'] == '0.2.0'
    assert evaluate(releases(version=__version__), 'Linux', 'x86_64')[0] == 'latest'
    assert evaluate(releases(version='0.1.7'), 'Linux', 'x86_64')[0] == 'latest'
    assert evaluate(releases(paid=False), 'Linux', 'x86_64')[0] == 'locked'
    assert evaluate(releases(ready=False), 'Linux', 'x86_64') == ('unpublished', None)
    assert evaluate(releases(architecture='arm64'), 'Linux', 'x86_64') == ('unpublished', None)
    assert evaluate(releases(sha='not-a-checksum'), 'Linux', 'x86_64') == ('unpublished', None)
    assert evaluate(releases(), 'Windows', 'AMD64') == ('unpublished', None)  # Only the Linux build is out.
    assert evaluate(releases(os_name='windows', architecture='x64'), 'Windows', 'AMD64')[0] == 'available'
    for broken in (None, [], {'items': 'x'}, {'items': [None, 7]}):
        assert evaluate(broken, 'Linux', 'x86_64') == ('unpublished', None)
    assert evaluate(releases(), 'FreeBSD', 'amd64') == ('unpublished', None)


def api_with(handler):
    api = Api(transport=httpx.MockTransport(handler))
    api.token = 'session-token'
    return api


def test_download_streams_the_build_checks_its_checksum_and_never_leaves_a_partial_file(tmp_path):
    body = b'debian-package' * 5000
    sha = hashlib.sha256(body).hexdigest()
    seen = []

    def serve(request):
        seen.append(request)
        if request.url.path == '/api/v1/desktop/releases':
            return httpx.Response(200, json=releases(sha=sha))
        return httpx.Response(200, content=body, headers={'Content-Length': str(len(body))})

    api = api_with(serve)
    assert api.releases()['items'][0]['sha256'] == sha
    progress = []
    path = api.download_release('linux', tmp_path, sha, progress=lambda got, total: progress.append((got, total)))
    assert path == str(tmp_path / 'kinosota-player.deb') and Path(path).read_bytes() == body
    assert sorted(p.name for p in tmp_path.iterdir()) == ['kinosota-player.deb']
    assert progress[-1] == (len(body), len(body))
    request = seen[-1]
    assert request.url == 'https://watch.scenrix.com/api/v1/desktop/download/linux'
    assert request.headers['Authorization'] == 'Bearer session-token'
    assert request.headers['User-Agent'] == 'KINOSOTA-Player/0.1.9'
    # A different file than the manifest promises is thrown away.
    other = tmp_path / 'other'
    other.mkdir()
    with pytest.raises(ApiError) as error:
        api.download_release('linux', other, 'cd' * 32)
    assert error.value.code == 'PLAYER_BUILD_INTEGRITY_ERROR' and str(error.value) == 'Файл обновления повреждён. Повторите попытку.'
    assert list(other.iterdir()) == []
    with pytest.raises(ApiError):
        api.download_release('linux', other, 'not-a-checksum')
    # Cancelled: nothing is kept; oversized: refused.
    assert api.download_release('linux', other, sha, cancelled=lambda: True) is None and list(other.iterdir()) == []
    with pytest.raises(ApiError) as error:
        api.download_release('linux', other, sha, limit=1024)
    assert error.value.code == 'PLAYER_BUILD_TOO_LARGE' and list(other.iterdir()) == []
    with pytest.raises(ValueError):
        api.download_release('../etc', other, sha)
    api.close()


@pytest.mark.parametrize('status,detail,message', [
    (503, 'PLAYER_BUILD_NOT_PUBLISHED', 'Сборка для этой системы пока не опубликована'),
    (403, {'code': 'SUBSCRIPTION_REQUIRED'}, 'Для приложения нужна действующая платная подписка.'),
    (302, None, 'Не удалось выполнить запрос.'),
])
def test_download_errors_are_explained_and_redirects_are_not_followed(tmp_path, status, detail, message):
    def serve(request):
        if status == 302:
            return httpx.Response(302, headers={'Location': 'https://evil.example/kinosota-player.deb'})
        return httpx.Response(status, json={'detail': detail})

    api = api_with(serve)
    with pytest.raises(ApiError) as error:
        api.download_release('linux', tmp_path, SHA)
    assert error.value.status == status and str(error.value) == message and list(tmp_path.iterdir()) == []
    api.close()


def frozen_at(monkeypatch, executable, files):
    monkeypatch.setattr(sys, 'frozen', True, raising=False)
    monkeypatch.setattr(sys, 'executable', executable)
    monkeypatch.setattr(Path, 'resolve', lambda p, strict=False: p)
    monkeypatch.setattr(Path, 'is_file', lambda p: str(p).replace('\\', '/') in files)


def test_the_installed_package_is_updated_by_the_system_installer_only(monkeypatch):
    deb = '/tmp/kinosota-update-x/kinosota-player.deb'
    monkeypatch.setattr(sys, 'frozen', False, raising=False)
    assert install_command(deb, 'Linux') is None and restart_command('Linux') is None  # Source run: website only.
    frozen_at(monkeypatch, '/opt/kinosota-player/kinosota-player', {'/usr/bin/pkexec', '/usr/bin/apt-get', '/usr/bin/dpkg'})
    assert install_command(deb, 'Linux') == ['/usr/bin/pkexec', '/usr/bin/apt-get', 'install', '-y', '-o',
                                             'DPkg::Lock::Timeout=120', deb]
    assert install_command('kinosota-player.deb', 'Linux') is None  # Never a relative path.
    assert install_command('/tmp/x/kinosota-player.sh', 'Linux') is None
    assert restart_command('Linux') == ['/bin/sh', '-c', 'sleep 1; exec "$0"', '/opt/kinosota-player/kinosota-player']
    frozen_at(monkeypatch, '/opt/kinosota-player/kinosota-player', {'/usr/bin/pkexec', '/usr/bin/dpkg'})
    assert install_command(deb, 'Linux') == ['/usr/bin/pkexec', '/usr/bin/dpkg', '-i', deb]
    frozen_at(monkeypatch, '/home/user/portable/kinosota-player', {'/usr/bin/pkexec', '/usr/bin/apt-get'})
    assert install_command(deb, 'Linux') is None  # A portable copy is not the package apt would replace.
    frozen_at(monkeypatch, '/opt/kinosota-player/kinosota-player', {'/usr/bin/apt-get'})
    assert install_command(deb, 'Linux') is None  # No graphical password prompt available.
    setup = '/c/Users/viewer/AppData/Local/Temp/kinosota-update-x/KINOSOTA-Player-Setup.exe'
    frozen_at(monkeypatch, '/c/Programs/KINOSOTA Player/kinosota-player.exe', {'/c/Programs/KINOSOTA Player/unins000.exe'})
    assert install_command(setup, 'Windows') == [setup, '/SILENT', '/SP-', '/NORESTART', '/CLOSEAPPLICATIONS']
    assert restart_command('Windows') is None  # Inno Setup starts the new version itself.
    frozen_at(monkeypatch, '/c/portable/kinosota-player.exe', set())
    assert install_command(setup, 'Windows') is None
    frozen_at(monkeypatch, '/Applications/KINOSOTA Player.app/Contents/MacOS/kinosota-player', {'/usr/bin/open'})
    assert install_command('/tmp/u/KINOSOTA-Player.dmg', 'Darwin') == ['/usr/bin/open', '/tmp/u/KINOSOTA-Player.dmg']


class ReleaseApi:
    def __init__(self, data=None, error=None, download_error=None):
        self.data, self.error, self.download_error = data or releases(), error, download_error
        self.calls = []

    def releases(self):
        self.calls.append('releases')
        if self.error:
            raise self.error
        return self.data

    def download_release(self, os_name, folder, sha256, progress, cancelled):
        self.calls.append(('download', os_name, sha256))
        if self.download_error:
            raise self.download_error
        if cancelled():
            return None
        progress(50, 100)
        path = Path(folder) / 'kinosota-player.deb'
        path.write_bytes(b'deb')
        return str(path)


def sync(fn, done, fail):
    try:
        value = fn()
    except Exception as error:
        fail(error)
        return
    done(value)


def make(api, monkeypatch, installable=True):
    QApplication.instance() or QApplication([])
    u = Updater(api, work=sync, system='Linux', machine='x86_64')
    monkeypatch.setattr(u, 'can_install', lambda: installable)
    return u


def test_check_download_install_and_restart(monkeypatch, tmp_path):
    api = ReleaseApi()
    u = make(api, monkeypatch)
    assert u.text() == 'Текущая версия: 0.1.9' and u.actions()['check'] and not u.actions()['update']
    u.check()
    assert u.state == 'available' and u.text() == 'Доступна версия 0.2.0' and u.text('en') == 'Version available 0.2.0'
    assert u.actions() == {'check': False, 'update': True, 'cancel': False, 'website': False}
    installed = []
    monkeypatch.setattr(updates.tempfile, 'mkdtemp', lambda prefix: str(tmp_path))
    monkeypatch.setattr(u, 'install', lambda path, folder=None: installed.append((Path(path).read_bytes(), folder)))
    u.start()
    assert api.calls[-1] == ('download', 'linux', SHA) and installed == [(b'deb', str(tmp_path))]
    assert (u.received, u.total, u.percent()) == (50, 100, 50)
    # pkexec finished: 0 restarts the new version, 126/127 (dialog closed) keep this one, others fail.
    started, quit = [], []
    u.quitRequested.connect(lambda: quit.append(True))

    class Process:
        def __init__(self, command):
            self.command = command

        def startDetached(self):
            started.append(self.command)
            return True

    monkeypatch.setattr(u, '_process', Process)
    monkeypatch.setattr(updates, 'restart_command', lambda system=None: ['/bin/sh', '-c', 'sleep 1; exec "$0"', '/opt/x'])
    u.installed(0)
    assert quit == [True] and started == [['/bin/sh', '-c', 'sleep 1; exec "$0"', '/opt/x']]
    u.installed(126)
    assert u.state == 'available' and u.text() == 'Установка отменена. Текущая версия продолжает работать.'
    assert u.actions()['update']  # Try again without another check.
    u.installed(100)
    assert u.state == 'failed' and u.text() == 'Не удалось установить обновление. Скачайте пакет на сайте.'
    assert u.actions()['website'] and u.actions()['check']


def test_cancel_quiet_failures_locked_and_manual_states(monkeypatch, tmp_path):
    api = ReleaseApi()
    u = make(api, monkeypatch)
    u.check()
    jobs = []
    u.work = lambda fn, done, fail: jobs.append((fn, done, fail))
    folder = tmp_path / 'update'
    folder.mkdir()
    monkeypatch.setattr(updates.tempfile, 'mkdtemp', lambda prefix: str(folder))
    u.start()
    assert u.state == 'downloading' and u.actions()['cancel'] and u.text() == 'Скачиваем обновление…'
    u.cancel()
    assert u.state == 'available' and u.text() == 'Обновление отменено'
    fn, done, fail = jobs.pop()
    done(fn())  # The worker notices the cancel, returns nothing; its folder goes away.
    assert not folder.exists() and u.state == 'available'
    # The quiet check after sign-in never reports its own failure.
    quiet = make(ReleaseApi(error=ApiError(0)), monkeypatch)
    quiet.check(quiet=True)
    assert quiet.state == 'idle' and quiet.text() == 'Текущая версия: 0.1.9'
    quiet.check()
    assert quiet.state == 'failed' and quiet.text() == 'Не удалось проверить обновления' and not quiet.actions()['website']
    # Without paid access the card explains and links to the website.
    locked = make(ReleaseApi(data=releases(paid=False)), monkeypatch)
    locked.check()
    assert locked.state == 'locked' and locked.text() == 'Войдите, чтобы скачать обновление' and locked.actions()['website']
    locked.signed_in = True
    assert locked.text() == 'Обновления доступны с подпиской PRO'
    expired = make(ReleaseApi(download_error=ApiError(403)), monkeypatch)
    expired.check()
    monkeypatch.setattr(updates.tempfile, 'mkdtemp', lambda prefix: str(tmp_path / 'expired'))
    (tmp_path / 'expired').mkdir()
    expired.start()
    assert expired.state == 'locked' and not (tmp_path / 'expired').exists()
    manual = make(ReleaseApi(), monkeypatch, installable=False)
    manual.check()
    assert manual.state == 'manual' and manual.actions()['website'] and not manual.actions()['update']
    latest = make(ReleaseApi(data=releases(version='0.1.9')), monkeypatch)
    latest.check()
    assert latest.state == 'latest' and latest.text('en') == 'You have the latest version'


def test_settings_card_follows_the_updater(monkeypatch, tmp_path):
    from kinosota_player.preferences import Preferences
    from kinosota_player.settings import SettingsDrawer
    app = QApplication.instance() or QApplication([])
    parent = QWidget()
    parent.resize(900, 640)
    parent.show()
    drawer = SettingsDrawer(parent, Preferences(QSettings(str(tmp_path / 'prefs'), QSettings.Format.IniFormat)))
    assert drawer.update_status.text() == 'Текущая версия: 0.1.9'
    u = make(ReleaseApi(), monkeypatch)
    drawer.set_updater(u)
    drawer.present()
    drawer.select_page(2)
    app.processEvents()
    assert drawer.update_check.isVisibleTo(drawer) and not drawer.update_now.isVisibleTo(drawer)
    drawer.update_check.click()
    assert drawer.update_status.text() == 'Доступна версия 0.2.0' and drawer.update_now.text() == 'Обновить до 0.2.0'
    assert drawer.update_now.isVisibleTo(drawer) and not drawer.update_check.isVisibleTo(drawer)
    u.work = lambda fn, done, fail: None  # The download keeps running.
    monkeypatch.setattr(updates.tempfile, 'mkdtemp', lambda prefix: str(tmp_path))
    drawer.update_now.click()
    assert drawer.update_bar.isVisibleTo(drawer) and drawer.update_cancel.isVisibleTo(drawer)
    drawer.retranslate('en')
    assert drawer.update_cancel.text() == 'Cancel' and drawer.update_status.text() == 'Downloading the update…'
    drawer.update_cancel.click()
    assert drawer.update_status.text() == 'Update cancelled' and drawer.update_now.text() == 'Update to 0.2.0'
    assert not drawer.update_bar.isVisibleTo(drawer)
    drawer.dismiss()
    parent.close()


def test_the_window_announces_a_newer_build_once(monkeypatch):
    from test_torrents import FakeApi, FakeEngine, window_for
    app = QApplication.instance() or QApplication([])
    w = window_for(FakeApi(), FakeEngine())
    w.signed_in({'username': 'viewer'})
    assert w.updater.signed_in and w.drawer.updater is w.updater
    w.updater.item = {'version': '0.2.0'}
    w.updater._set('available')
    assert w.message.text() == 'Доступно обновление KINOSOTA Player — откройте настройки, раздел «О приложении».'
    w.message.setText('')
    w.updater._set('available')
    assert w.message.text() == ''  # Once per version.
    w.api.logout = lambda: None
    w.logout()
    assert not w.updater.signed_in
    w.close()
    app.processEvents()
