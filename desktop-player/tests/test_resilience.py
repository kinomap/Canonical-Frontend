"""0.2.4: intro and Pre-roll survive the auto-update restart (clean environment, PID wait, socket release) and a
transient CinemaSurface failure (rebuilt before the next launch instead of being lost for the session)."""
import os
import subprocess
import sys
import threading
import time
import uuid

import pytest
from PySide6.QtWidgets import QApplication

from kinosota_player import app as app_module, cinema, deeplink, direct, engine, installation, updater as updates
from kinosota_player.cinema import CinemaEngine, CinemaRecovery, CinemaSurface
from kinosota_player.direct import DirectLaunchSplash
from kinosota_player.engine import Mpv, child_environment, restart_environment

from test_cinema import FakePlayer, FakeView
from test_filters import CatalogApi, Engine, Vault, sync

INJECTED = {
    'QT_PLUGIN_PATH': '/opt/kinosota-player/_internal/PySide6/Qt/plugins',
    'QT_QPA_PLATFORM_PLUGIN_PATH': '/opt/kinosota-player/_internal/PySide6/Qt/plugins/platforms',
    'QML2_IMPORT_PATH': '/opt/kinosota-player/_internal/PySide6/Qt/qml',
    'QML_IMPORT_PATH': '/opt/kinosota-player/_internal/PySide6/Qt/qml',
    'QT_DATA_DIRS': '/opt/kinosota-player/_internal/share', 'TCL_LIBRARY': '/opt/kinosota-player/_internal/tcl',
    'TK_LIBRARY': '/opt/kinosota-player/_internal/tk', '_MEIPASS': '/opt/kinosota-player/_internal',
    '_MEIPASS2': '/opt/kinosota-player/_internal', '_PYI_ARCHIVE_FILE': '/opt/kinosota-player/kinosota-player',
    '_PYI_LINUX_PROCESS_NAME': 'kinosota-player', '_PYI_PARENT_PROCESS_LEVEL': '1', '_PYI_SOMETHING_NEW': 'x',
    'SSL_CERT_FILE': '/opt/kinosota-player/_internal/certifi/cacert.pem',
    'LD_LIBRARY_PATH': '/opt/kinosota-player/_internal', 'LD_LIBRARY_PATH_ORIG': '/usr/local/lib',
}
USER = {'HOME': '/home/kos', 'WAYLAND_DISPLAY': 'wayland-0', 'XDG_SESSION_TYPE': 'wayland', 'QT_QPA_PLATFORM': 'wayland',
        'PATH': '/usr/bin:/bin', 'DBUS_SESSION_BUS_ADDRESS': 'unix:path=/run/user/1000/bus'}


def app():
    return QApplication.instance() or QApplication([])


def frozen(monkeypatch, executable='/opt/kinosota-player/kinosota-player'):
    monkeypatch.setattr(sys, 'frozen', True, raising=False)
    monkeypatch.setattr(sys, 'executable', executable)
    monkeypatch.setattr(sys, '_MEIPASS', '/opt/kinosota-player/_internal', raising=False)


# ---------- Block 1: clean restart ----------
def test_restart_environment_drops_every_pyinstaller_and_qt_injection(monkeypatch):
    frozen(monkeypatch)
    env = restart_environment({**USER, **INJECTED})
    for key in INJECTED:
        if key != 'LD_LIBRARY_PATH':
            assert key not in env, key
    assert env['LD_LIBRARY_PATH'] == '/usr/local/lib'  # Restored from LD_LIBRARY_PATH_ORIG.
    assert {k: env[k] for k in USER} == USER  # The desktop session itself is kept (Wayland, D-Bus, platform).
    without_orig = dict(INJECTED)
    del without_orig['LD_LIBRARY_PATH_ORIG']
    assert 'LD_LIBRARY_PATH' not in restart_environment({**USER, **without_orig})


def test_restart_environment_keeps_user_certificates_outside_the_bundle(monkeypatch):
    frozen(monkeypatch)
    env = restart_environment({**USER, 'SSL_CERT_FILE': '/etc/ssl/certs/ca-certificates.crt'})
    assert env['SSL_CERT_FILE'] == '/etc/ssl/certs/ca-certificates.crt'


def test_child_environment_contract_for_mpv_and_dpkg_is_unchanged(monkeypatch):
    frozen(monkeypatch)
    monkeypatch.setattr(engine.sys, 'platform', 'linux')
    monkeypatch.setattr(os, 'environ', {**USER, **INJECTED})
    env = child_environment()
    assert env['LD_LIBRARY_PATH'] == '/usr/local/lib' and 'LD_LIBRARY_PATH_ORIG' not in env
    assert env['QT_PLUGIN_PATH'] == INJECTED['QT_PLUGIN_PATH']  # Only the loader path is child_environment's job.


def test_linux_cinema_options_avoid_multi_core_sdl_audio_deadlock():
    linux_opts = dict(cinema.default_audio_options('linux'))
    backends = linux_opts['ao'].split(',')
    assert 'pipewire' in backends and 'pulse' in backends and 'alsa' in backends and 'null' in backends
    assert 'sdl' not in backends
    assert dict(cinema.COMMON_OPTIONS)['ao'] == linux_opts['ao'] if sys.platform.startswith('linux') else True
    assert cinema.default_audio_options('darwin') == []
    assert cinema.default_audio_options('win32') == []


def test_updater_restart_process_gets_the_clean_environment(monkeypatch):
    app()
    frozen(monkeypatch)
    monkeypatch.setattr(os, 'environ', {**USER, **INJECTED})
    u = updates.Updater(api=None, system='Linux')
    process = u._restart_process(['/bin/true'])
    keys = set(process.processEnvironment().keys())
    assert not keys & (set(INJECTED) - {'LD_LIBRARY_PATH'})
    assert process.processEnvironment().value('LD_LIBRARY_PATH') == '/usr/local/lib'
    assert process.processEnvironment().value('WAYLAND_DISPLAY') == 'wayland-0'
    plain = u._process(['/bin/true'])  # apt / pkexec keep the child_environment contract.
    assert plain.processEnvironment().value('QT_PLUGIN_PATH') == INJECTED['QT_PLUGIN_PATH']


def test_restart_command_takes_only_an_integer_pid_as_a_positional_argument(monkeypatch):
    frozen(monkeypatch)
    command = installation.restart_command('Linux', wait_pid=4242)
    assert command[:2] == ['/bin/sh', '-c'] and command[3:] == ['kinosota-player-restart', installation.INSTALLED_LINUX, '4242']
    assert installation.INSTALLED_LINUX not in command[2] and '4242' not in command[2]  # Constant script.
    assert 'kill -0 "$2"' in command[2] and 'exec "$1"' in command[2] and 'sleep 1;' not in command[2]
    for bad in ('1; touch /tmp/pwned', '42', True, 0, -7, 3.5, None.__class__):
        with pytest.raises(ValueError):
            installation.restart_command('Linux', wait_pid=bad)
    assert installation.restart_command('Windows', wait_pid=4242) is None
    monkeypatch.setattr(sys, 'frozen', False)
    assert installation.restart_command('Linux', wait_pid=4242) is None  # Source run: never restarts.


@pytest.mark.skipif(not os.path.exists('/bin/sh'), reason='POSIX shell')
def test_restart_script_waits_for_the_old_process_and_never_evaluates_its_arguments(tmp_path):
    marker = tmp_path / 'started'
    pwned = tmp_path / 'pwned'
    binary = tmp_path / 'kinosota player;$(touch pwned)'
    binary.write_text(f'#!/bin/sh\necho "$$" > "{marker}"\n')
    binary.chmod(0o755)
    old = subprocess.Popen(['sleep', '1.2'])
    threading.Thread(target=old.wait, daemon=True).start()  # Reaped at exit: kill -0 then fails like for a real exit.
    begun = time.monotonic()
    restart = subprocess.run(['/bin/sh', '-c', installation.RESTART_SCRIPT, 'kinosota-player-restart', str(binary),
                              str(old.pid)], timeout=30, cwd=tmp_path)
    waited = time.monotonic() - begun
    assert restart.returncode == 0 and marker.exists() and not pwned.exists()
    assert waited >= 1.0  # Started only after the old PID was gone.
    begun = time.monotonic()
    subprocess.run(['/bin/sh', '-c', installation.RESTART_SCRIPT, 'r', str(binary), '999999999'], timeout=30, cwd=tmp_path)
    assert not pwned.exists()
    assert time.monotonic() - begun < 2  # Nothing to wait for.


def test_instance_close_frees_the_socket_at_once_and_is_idempotent(monkeypatch):
    app()
    name = 'kinosota-test-' + uuid.uuid4().hex[:12]
    monkeypatch.setattr(deeplink, 'server_name', lambda: name)
    first = deeplink.Instance()
    assert first.listen()
    second = deeplink.Instance()
    assert not second.listen()  # The open window keeps its links.
    first.close()
    first.close()
    assert not first.server.isListening()
    assert second.listen()  # The restarted player gets the single-instance socket.
    second.close()


def test_main_closes_the_instance_on_quit_and_after_run(monkeypatch):
    closed, quit_slots = [], []

    class Signal:
        def connect(self, slot): quit_slots.append(slot)

    class FakeApp:
        aboutToQuit = Signal()
        def __init__(self, argv): pass
        def setApplicationName(self, *_): pass
        def setOrganizationName(self, *_): pass
        def setDesktopFileName(self, *_): pass

    class Instance:
        def __init__(self, _app=None): pass
        def listen(self): return True
        def close(self): closed.append(True)

    monkeypatch.setattr(app_module, 'QApplication', FakeApp)
    monkeypatch.setattr(app_module, 'configure_high_dpi', lambda: None)
    monkeypatch.setattr(deeplink, 'Instance', Instance)
    monkeypatch.setattr(app_module, 'run', lambda application, instance, link: 0)
    monkeypatch.setattr(sys, 'argv', ['kinosota-player'])
    assert app_module.main() == 0
    assert closed == [True]  # finally: instance.close()
    assert any(getattr(slot, '__func__', None) is Instance.close for slot in quit_slots)  # aboutToQuit as well.


# ---------- Block 2: CinemaSurface watchdog and recovery ----------
def fake_surface():
    return CinemaSurface(view=FakeView(), player_factory=FakePlayer)


def test_watchdog_waits_for_a_compositor_that_has_not_exposed_the_window(monkeypatch):
    app()
    surface = fake_surface()
    assert cinema.GL_WATCHDOG_MS >= 4000  # 2 s was shorter than a cold Wayland map after a restart.
    surface.present()
    surface.view.initialized = False
    monkeypatch.setattr(surface.view, 'isVisible', lambda: True)
    monkeypatch.setattr(surface, '_exposed', lambda: False)
    failed = []
    surface.failed.connect(failed.append)
    surface._check_gl()
    assert not failed and surface.watchdog.isActive() and surface.phase != 'unavailable'
    surface.presented_at = time.monotonic() - cinema.GL_EXPOSE_LIMIT_MS / 1000 - 1
    surface._check_gl()
    assert failed and 'OpenGL context was not created' in failed[0] and 'exposed False' in failed[0]
    surface.shutdown()


def test_watchdog_never_fails_a_window_that_was_hidden_meanwhile(monkeypatch):
    app()
    surface = fake_surface()
    surface.present()
    surface.view.initialized = False
    monkeypatch.setattr(surface.view, 'isVisible', lambda: False)
    surface._check_gl()
    assert surface.phase != 'unavailable'
    surface.shutdown()


def test_cinema_failure_is_logged(caplog):
    app()
    surface = fake_surface()
    surface.present()
    with caplog.at_level('WARNING', logger='kinosota'):
        surface._fail('OpenGL context was not created after 5000 ms')
    assert any('OpenGL context was not created' in record.getMessage() for record in caplog.records)
    surface.shutdown()


def test_recovery_policy_rebuilds_after_a_transient_failure_and_slows_down_on_a_broken_driver():
    now = [100.0]
    recovery = CinemaRecovery(clock=lambda: now[0])
    assert not recovery.may_rebuild()
    for _ in range(cinema.CINEMA_REBUILD_LIMIT - 1):
        recovery.failed('watchdog')
        assert recovery.may_rebuild()
        recovery.rebuilt()
    recovery.failed('watchdog')
    assert not recovery.may_rebuild()  # Never composited a frame: no rebuild loop on a broken driver.
    now[0] += cinema.CINEMA_REBUILD_COOLDOWN_S
    assert recovery.may_rebuild()
    recovery.healthy()
    assert recovery.failures == 0


def test_cinema_engine_hands_a_start_on_its_way_to_the_external_fallback():
    app()
    surface = fake_surface()
    eng = CinemaEngine(surface)
    surface.present()
    surface._fail('libmpv: render context')
    external = Engine()
    eng.fallback = external
    eng.start('https://watch.scenrix.com/stream/1.mp4', extra_args=('--geometry=1280x720',))
    assert external.started == ['https://watch.scenrix.com/stream/1.mp4']
    assert eng.alive() and eng.exit_code() == 0
    surface.shutdown()


def recovering_window(monkeypatch):
    app()
    made = []

    def create(parent=None, intro=None, **_kw):
        surface = fake_surface()
        made.append(surface)
        return surface

    monkeypatch.setattr(app_module, 'create_surface', create)
    monkeypatch.setattr(cinema, 'unavailable_reason', lambda: None)
    w = app_module.Window(api=CatalogApi(), engine=None, vault=Vault(), restore=False)
    w.work = sync
    return w, made


def test_window_rebuilds_the_surface_after_a_transient_failure(monkeypatch):
    w, made = recovering_window(monkeypatch)
    first = w.cinema
    assert first is made[0] and isinstance(w.engine, CinemaEngine)
    first.present()
    first._fail('OpenGL context was not created after 5000 ms (platform wayland, exposed False)')
    assert w.cinema is None and isinstance(w.engine, Mpv)  # This launch: external window.
    assert w.cinema_recovery.pending
    assert w._ensure_cinema()
    second = w.cinema
    assert second is made[1] and second is not first and w.splash.cinema is second
    assert isinstance(w.engine, CinemaEngine) and w.engine.surface is second
    assert w.splash.backdrop is second.view and first.handles == {}
    assert not w._ensure_cinema()  # A healthy surface is kept.
    w._ensure_cinema = lambda: None
    w.close()


def test_a_retired_surface_never_disturbs_the_new_one(monkeypatch):
    w, made = recovering_window(monkeypatch)
    first = w.cinema
    first.present()
    first._fail('watchdog')
    w._ensure_cinema()
    second = w.cinema
    first.failed.emit('late signal from the old surface')
    assert w.cinema is second and isinstance(w.engine, CinemaEngine)
    w.close()


@pytest.mark.parametrize('path', ['start_movie', 'play_torrent', 'play_episode', 'play_stream'])
def test_every_playback_path_recovers_the_surface_then_targets_the_intro_and_the_preroll(monkeypatch, path):
    app()
    w = app_module.Window(api=CatalogApi(), engine=Engine(), vault=Vault(), restore=False)
    calls = []
    w._ensure_cinema = lambda: calls.append('ensure')
    w._target_intro = lambda meta: calls.append('intro')
    w._prepare_preroll = lambda meta: calls.append('preroll')
    w._present_playback_splash = lambda status: calls.append('splash') or []
    w.work = lambda fn, done=None, fail=None: calls.append('work')
    stream = 'https://watch.scenrix.com/stream/ticket.mp4'
    if path == 'start_movie':
        w.start_movie({'id': 'm1', 'title': 'Film'})
    elif path == 'play_torrent':
        w.play_torrent({'title': 'Film', 'tmdb_id': 1, 'magnet': 'magnet:?xt=urn:btih:' + 'a' * 40})
    elif path == 'play_episode':
        w.play_episode({'series': {'title': 'Show'}, 'season': 1, 'episode': {'id': 'e1', 'episode_number': 1}})
    else:
        monkeypatch.setattr(app_module, 'stream_of', lambda meta: stream)
        w.play_stream({'title': 'Film', 'stream_url': stream})
    assert calls[0] == 'ensure' and 'intro' in calls and 'preroll' in calls
    assert calls.index('intro') < calls.index('preroll')
    w.close()


def test_a_reconnect_never_rebuilds_the_surface(monkeypatch):
    app()
    w = app_module.Window(api=CatalogApi(), engine=Engine(), vault=Vault(), restore=False)
    calls = []
    w._ensure_cinema = lambda: calls.append('ensure')
    w._target_intro = lambda meta: None
    w._prepare_preroll = lambda meta: calls.append('preroll')
    w._present_playback_splash = lambda status: []
    w.work = lambda fn, done=None, fail=None: None
    monkeypatch.setattr(app_module, 'stream_of', lambda meta: 'https://watch.scenrix.com/s.mp4')
    w.play_stream({'title': 'Film'}, attempt=1)
    assert calls == []
    w.close()


# ---------- Block 2: Wayland-safe splash ----------
def test_wayland_fade_hides_at_once_without_an_opacity_animation(monkeypatch):
    app()
    monkeypatch.setattr(direct, 'window_opacity_supported', lambda: False)
    splash = DirectLaunchSplash()
    splash.show()
    faded = []
    splash.faded.connect(lambda: faded.append(True))
    opacity = []
    monkeypatch.setattr(splash, 'setWindowOpacity', opacity.append)
    splash.fade_out()
    assert faded == [True] and not splash.isVisible() and not splash.fading() and opacity == []
    splash.dismiss()


def test_hiding_the_splash_frees_the_cinema_before_the_window_goes(monkeypatch):
    app()
    surface = fake_surface()
    splash = DirectLaunchSplash(cinema=surface)
    splash.present()
    order = []
    reset = surface.reset
    monkeypatch.setattr(surface, 'reset', lambda: (order.append('reset'), reset())[1])
    hide = splash.hide
    monkeypatch.setattr(splash, 'hide', lambda: (order.append('hide'), hide())[1])
    splash.hide_now()
    assert order and order[0] == 'reset' and 'hide' in order and surface.handles == {}
    splash.dismiss()
    surface.shutdown()


def test_set_cinema_replaces_a_still_backdrop_with_the_rebuilt_view():
    app()
    first = fake_surface()
    splash = DirectLaunchSplash(cinema=first)
    first.present()
    first._fail('watchdog')
    assert splash.backdrop is not first.view
    second = fake_surface()
    splash.set_cinema(second)
    assert splash.cinema is second and splash.backdrop is second.view and not splash.film_mode
    splash.dismiss()
    second.shutdown()
