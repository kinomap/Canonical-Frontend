"""kinosota:// links from the website: strict parsing and single-window hand-off."""
import os
os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')
import json, socket, subprocess, sys, tempfile, threading, time, uuid
from pathlib import Path
import pytest
from PySide6.QtCore import QAbstractAnimation, QEvent, QRect, Qt, QUrl
from PySide6.QtGui import QCloseEvent, QFileOpenEvent, QKeyEvent
from PySide6.QtWidgets import QApplication
from kinosota_player import deeplink
from kinosota_player.deeplink import LinkEvents, find_link, parse_launch
from kinosota_player.direct import (BUFFERING, CONNECTING, FADE_MS, STARTING, DirectLaunchSplash, DirectPlayer,
                                    geometry_args, geometry_text, launch_args)
from kinosota_player.engine import Mpv

LAUNCH = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'
ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize('link', [
    f'kinosota://watch?launch={LAUNCH}',
    f'kinosota://watch/?launch={LAUNCH}',
    f'KINOSOTA://WATCH?launch={LAUNCH.upper()}',
    f'kinosota://watch?launch={LAUNCH}&audio_track=11&source_id=release-1',
])
def test_launch_uuid_is_extracted_with_optional_non_secret_queries(link):
    assert parse_launch(link) == LAUNCH


@pytest.mark.parametrize('link', [
    None, '', 42, 'kinosota:', 'kinosota://watch', f'https://watch?launch={LAUNCH}',
    f'kinosota://evil?launch={LAUNCH}', f'kinosota://watch:80?launch={LAUNCH}',
    f'kinosota://user@watch?launch={LAUNCH}', f'kinosota://watch/play?launch={LAUNCH}',
    f'kinosota://watch?launch={LAUNCH}&token=secret', f'kinosota://watch?launch={LAUNCH}&launch={LAUNCH}',
    f'kinosota://watch?launch={LAUNCH}#x', 'kinosota://watch?launch=not-a-uuid',
    f'kinosota://watch?launch={LAUNCH.replace("-", "")}', f'kinosota://watch?launch=%20{LAUNCH}',
    f'kinosota://watch?launch={LAUNCH}\u044f', f'kinosota://watch?launch={LAUNCH}&x=' + 'a' * 300,
    f'kinosota://watch?launch={LAUNCH} --script=evil.lua',
])
def test_forged_or_foreign_links_are_rejected(link):
    assert parse_launch(link) is None


def test_argv_link_detection_skips_program_and_caps_length():
    assert find_link(['kinosota-player']) is None
    assert find_link([f'kinosota://watch?launch={LAUNCH}']) is None  # argv[0] is the program.
    assert find_link(['app', '--flag', f'KINOSOTA://watch?launch={LAUNCH}']) == f'KINOSOTA://watch?launch={LAUNCH}'
    long = find_link(['app', 'kinosota://' + 'x' * 1000])
    assert len(long) == deeplink.MAX_LINK + 1 and parse_launch(long) is None


def test_macos_file_open_event_is_routed_to_the_window():
    app = QApplication.instance() or QApplication([])
    seen = []
    events = LinkEvents(seen.append)
    assert events.eventFilter(app, QFileOpenEvent(QUrl(f'kinosota://watch?launch={LAUNCH}')))
    assert seen == [f'kinosota://watch?launch={LAUNCH}']
    assert not events.eventFilter(app, QFileOpenEvent(QUrl('file:///tmp/movie.mkv')))
    assert len(seen) == 1


def test_second_process_forwards_the_link_to_the_open_window(monkeypatch):
    app = QApplication.instance() or QApplication([])
    name = 'kinosota-test-' + uuid.uuid4().hex[:12]
    monkeypatch.setattr(deeplink, 'server_name', lambda: name)
    instance = deeplink.Instance()
    assert instance.listen()
    received = []
    instance.linkReceived.connect(received.append)
    link = f'kinosota://watch?launch={LAUNCH}'
    code = ('import sys\nfrom PySide6.QtCore import QCoreApplication\nfrom kinosota_player import deeplink\n'
            f'app = QCoreApplication([])\ndeeplink.server_name = lambda: {name!r}\n'
            'sys.exit(0 if deeplink.forward(sys.argv[1]) else 3)\n')
    env = dict(os.environ, PYTHONPATH=str(ROOT) + os.pathsep + os.environ.get('PYTHONPATH', ''))
    child = subprocess.Popen([sys.executable, '-c', code, link], cwd=str(ROOT), env=env)
    deadline = time.monotonic() + 30
    while child.poll() is None and time.monotonic() < deadline:
        app.processEvents()
        time.sleep(0.01)
    assert child.poll() == 0, 'the running window must acknowledge the link'
    for _ in range(20):
        app.processEvents()
    assert received == [link]
    # A later window must not steal links from the one that is already open.
    other = deeplink.Instance()
    assert not other.listen()
    instance.close()
    assert not deeplink.forward(link, timeout=300)  # Nobody listens any more.


@pytest.mark.skipif(sys.platform.startswith('win'), reason='Unix socket files only')
def test_stale_socket_from_a_crashed_run_is_replaced(monkeypatch):
    name = 'kinosota-test-' + uuid.uuid4().hex[:12]
    monkeypatch.setattr(deeplink, 'server_name', lambda: name)
    path = os.path.join(tempfile.gettempdir(), name)
    stale = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    stale.bind(path)
    stale.close()  # The file stays behind, nobody accepts connections.
    assert os.path.exists(path)
    app = QApplication.instance() or QApplication([])
    instance = deeplink.Instance()
    try:
        assert instance.listen()
        assert oct(os.stat(path).st_mode & 0o777) == '0o700'  # Only this user may hand over links.
    finally:
        instance.close()
        if os.path.exists(path):
            os.unlink(path)


SPLASH_META = {  # Cinema launch splash: offscreen Qt, fake mpv and API, no network.
               'kind': 'movie', 'tmdb_id': 155, 'title': 'Тёмный рыцарь', 'audio_lang': 'ru', 'audio_track': 2,
               'stream_url': 'https://torrent-01.scenrix.com/stream/88888888-8888-4888-8888-888888888888'}


def qt_app():
    return QApplication.instance() or QApplication([])


def run_now(fn, done=None, fail=None):
    try:
        value = fn()
    except Exception as error:
        if fail:
            fail(error)
        return
    if done:
        done(value)


class Deferred:
    """Worker that queues jobs so a test can stop between open_launch, warm-up/start and the first frame."""

    def __init__(self):
        self.jobs = []

    def __call__(self, fn, done, fail):
        self.jobs.append((fn, done, fail))

    def run(self):
        run_now(*self.jobs.pop(0))


class SplashApi:
    token = ''

    def __init__(self, meta=None):
        self.meta = dict(meta or SPLASH_META)
        self.calls, self.closed = [], False

    def open_launch(self, launch_id):
        self.calls.append(('open', launch_id))
        return self.meta

    def warm_stream(self, url, cancelled=lambda: False):
        self.calls.append(('warm', url, cancelled()))
        return 65536

    def close(self):
        self.closed = True


class SplashEngine:
    def __init__(self, result='playing'):
        self.result, self.running = result, False
        self.started, self.waits, self.commands, self.stopped = [], [], [], 0

    def start(self, url, *, extra_args=()):
        self.started.append((url, list(extra_args)))
        self.running = True

    def stop(self):
        self.stopped += 1
        self.running = False

    def alive(self):
        return self.running

    def exit_code(self):
        return None if self.running else 0

    def wait_playback_started(self, timeout=30, *, cancelled=lambda: False):
        self.waits.append((timeout, cancelled()))
        return self.result

    def command(self, command):
        self.commands.append(command)


def splash_player(engine=None, api=None):
    qt_app()
    worker, api, engine = Deferred(), api or SplashApi(), engine or SplashEngine()
    direct = DirectPlayer(api_factory=lambda: api, engine=engine, worker=worker)
    codes = []
    direct.finished.connect(codes.append)
    return direct, worker, api, engine, codes


def test_mpv_geometry_args_follow_the_splash_mode_and_screen_scale():
    assert geometry_args('full', (0, 0, 1920, 1080), 1.0, 'linux') == ['--fullscreen', '--geometry=+0+0']
    assert geometry_args('full', (1920, 0, 1920, 1080), 1.0, 'darwin') == [
        '--fullscreen', '--geometry=+1920+0', '--native-fs=no']
    assert geometry_args('compact', (480, 270, 960, 540), 1.0, 'win32') == ['--geometry=960x540+480+270']
    # Windows / Linux: Qt logical pixels -> physical pixels; macOS: mpv also works in points.
    assert geometry_args('compact', (480, 270, 960, 540), 1.25, 'win32') == ['--geometry=1200x675+600+338']
    assert geometry_args('compact', (480, 270, 960, 540), 2.0, 'darwin') == ['--geometry=960x540+480+270']
    assert geometry_args('compact', (-1440, 135, 720, 405), 1.0, 'linux') == ['--geometry=720x405+-1440+135']
    assert geometry_args('compact', QRect(10, 20, 300, 200), 0, 'linux') == ['--geometry=300x200+10+20']
    assert geometry_text((480, 270, 960, 540), 1.0, 'linux') == '960x540+480+270'


def test_splash_opens_full_screen_and_toggles_to_a_centred_quarter_and_back():
    qt_app()
    splash = DirectLaunchSplash()
    flags = splash.windowFlags()
    assert flags & Qt.WindowType.FramelessWindowHint and flags & Qt.WindowType.WindowStaysOnTopHint
    splash.present()
    area = splash.screen_area()
    assert splash.isVisible() and splash.mode == 'full' and splash.geometry() == area
    assert splash.resize_button.text() == '□' and splash.close_button.text() == '✕'
    assert splash.resize_button.toolTip() == 'Уменьшить окно' and splash.status_label.text() == STARTING
    modes = []
    splash.modeChanged.connect(modes.append)
    splash.resize_button.click()
    assert splash.geometry_animation.state() == QAbstractAnimation.State.Running  # Smooth, not a jump.
    splash.finish_animations()
    rect = splash.geometry()
    assert (rect.width(), rect.height()) == (area.width() // 2, area.height() // 2)  # 25 % of the area.
    assert abs(rect.center().x() - area.center().x()) <= 1 and abs(rect.center().y() - area.center().y()) <= 1
    assert modes == ['compact'] and splash.resize_button.toolTip() == 'Развернуть на весь экран'
    assert splash.mpv_args() == geometry_args('compact', rect, splash.device_ratio())
    splash.resize_button.click()
    splash.finish_animations()
    assert splash.geometry() == area and modes == ['compact', 'full'] and splash.mpv_args()[0] == '--fullscreen'
    assert not splash.reel.grab().isNull() and not splash.grab().isNull()  # paintEvent works offscreen.
    splash.dismiss()


def test_reels_animate_at_60_fps_and_freeze_on_errors_while_the_text_fades_in():
    qt_app()
    splash = DirectLaunchSplash()
    splash.present()
    reel = splash.reel
    assert reel.running() and reel.timer.interval() == 16
    angle, offset = reel.angle, reel.film_offset
    reel.advance(0.05)
    assert reel.angle != angle and reel.film_offset != offset
    reel.advance(10)  # A stalled loop moves the reels by at most 0.1 s.
    splash.set_status(CONNECTING)
    assert splash.status_label.text() == CONNECTING
    assert splash.text_fade.state() == QAbstractAnimation.State.Running and splash.text_fade.startValue() == 0.0
    splash.set_status('Ссылка устарела', error=True)
    assert not reel.running() and splash.status_label.property('tone') == 'error'
    assert splash.hint_label.text() == 'Нажмите ✕, чтобы закрыть'
    splash.set_status(BUFFERING)
    assert reel.running() and splash.status_label.property('tone') == 'normal'
    splash.hide()
    assert not reel.running()  # No timer while hidden.
    splash.dismiss()


def test_fade_out_animates_window_opacity_then_hides_and_reports():
    qt_app()
    splash = DirectLaunchSplash()
    splash.present()
    faded = []
    splash.faded.connect(lambda: faded.append(True))
    splash.fade_out()
    animation = splash.fade_animation
    assert animation.targetObject() is splash and bytes(animation.propertyName()) == b'windowOpacity'
    assert 300 <= animation.duration() <= 400 and animation.duration() == FADE_MS
    assert animation.endValue() == 0.0 and animation.state() == QAbstractAnimation.State.Running
    assert splash.fading() and splash.isVisible() and faded == []
    animation.setCurrentTime(animation.duration() // 2)
    assert 0.0 < splash.windowOpacity() < 1.0
    splash.fade_out()  # A second request does not restart the fade.
    animation.setCurrentTime(animation.duration())
    assert faded == [True] and not splash.isVisible() and not splash.fading()
    assert splash.windowOpacity() == 1.0  # Ready for the next launch.
    splash.dismiss()


def test_escape_and_window_close_cancel_the_launch_instead_of_closing():
    qt_app()
    splash = DirectLaunchSplash()
    splash.present()
    asked = []
    splash.cancelRequested.connect(lambda: asked.append(True))
    splash.keyPressEvent(QKeyEvent(QEvent.Type.KeyPress, Qt.Key.Key_Escape, Qt.KeyboardModifier.NoModifier))
    event = QCloseEvent()
    splash.closeEvent(event)
    assert asked == [True, True] and not event.isAccepted() and splash.isVisible()
    splash.close_button.click()
    assert asked == [True, True, True]
    splash.dismiss()
    assert not splash.isVisible()


def test_splash_stays_until_the_first_frame_and_mpv_gets_its_geometry():
    direct, worker, api, engine, codes = splash_player()
    splash = direct.splash
    assert direct.open_link(f'kinosota://watch?launch={LAUNCH}')
    assert splash.isVisible() and splash.status_label.text() == STARTING and splash.geometry() == splash.screen_area()
    worker.run()  # open_launch
    assert splash.status_label.text() == CONNECTING and api.calls == [('open', LAUNCH)]
    worker.run()  # warm_stream + mpv start
    assert engine.started == [(SPLASH_META['stream_url'], launch_args(SPLASH_META) + splash.mpv_args())]
    assert engine.started[0][1][-2:] == geometry_args('full', splash.screen_area(), splash.device_ratio())[-2:]
    assert splash.isVisible() and not splash.fading() and splash.status_label.text() == BUFFERING
    assert direct.timer.isActive()
    worker.run()  # Mpv.wait_playback_started
    assert engine.waits == [(30, False)] and splash.fading()
    splash.finish_animations()
    assert not splash.isVisible() and direct.playing and codes == []
    direct.shutdown()


@pytest.mark.parametrize('result,revealed', [('playing', True), ('eof', True), ('timeout', True),
                                             ('exited', False), ('cancelled', False)])
def test_first_frame_wait_results(result, revealed):
    direct, worker, api, engine, codes = splash_player(SplashEngine(result))
    direct.open_link(f'kinosota://watch?launch={LAUNCH}')
    worker.run(); worker.run(); worker.run()
    # On timeout mpv takes over with its own buffering OSD; a dead mpv is left to _watch (retry or error).
    assert direct.splash.fading() is revealed and direct.splash.isVisible()
    direct.shutdown()


def test_compact_mode_is_passed_to_mpv_and_applied_to_a_running_mpv():
    direct, worker, api, engine, codes = splash_player()
    splash = direct.splash
    direct.open_link(f'kinosota://watch?launch={LAUNCH}')
    worker.run()  # open_launch; warm-up is pending
    splash.resize_button.click()  # □ while the stream is still warming up.
    splash.finish_animations()
    worker.run()
    compact = geometry_args('compact', splash.target_geometry(), splash.device_ratio())
    assert engine.started[0][1] == launch_args(SPLASH_META) + compact and compact[0].startswith('--geometry=')
    splash.resize_button.click()  # mpv is already running: move its window over IPC.
    worker.jobs = [job for job in worker.jobs if job[0].__name__ == 'apply']  # Drop the pending first-frame wait.
    worker.run()
    assert engine.commands == [['set_property', 'fullscreen', True]]
    splash.resize_button.click()
    worker.run()
    assert engine.commands[1:] == [['set_property', 'fullscreen', False],
                                   ['set_property', 'geometry',
                                    geometry_text(splash.target_geometry('compact'), splash.device_ratio())]]
    direct.shutdown()


def test_close_button_aborts_the_launch_stops_mpv_fades_and_quits():
    direct, worker, api, engine, codes = splash_player()
    splash = direct.splash
    direct.open_link(f'kinosota://watch?launch={LAUNCH}')
    worker.run()  # open_launch done, warm_stream + start pending
    generation, stopped = direct.generation, engine.stopped
    splash.close_button.click()
    assert direct.generation > generation and engine.stopped == stopped + 1 and api.closed and direct.api is None
    assert splash.fading() and codes == []  # The app quits after the fade, not before.
    splash.close_button.click()  # Double click: still one cancel.
    splash.finish_animations()
    assert codes == [1] and not splash.isVisible()
    worker.run()  # The late warm-up sees the cancel and never starts mpv.
    assert api.calls[-1] == ('warm', SPLASH_META['stream_url'], True) and engine.started == []
    assert direct.open_link(f'kinosota://watch?launch={LAUNCH}') is False and codes == [1]
    direct.shutdown()


def test_cancel_while_buffering_stops_mpv_and_ignores_the_late_first_frame():
    direct, worker, api, engine, codes = splash_player()
    splash = direct.splash
    direct.open_link(f'kinosota://watch?launch={LAUNCH}')
    worker.run(); worker.run()
    assert engine.running and splash.status_label.text() == BUFFERING
    splash.keyPressEvent(QKeyEvent(QEvent.Type.KeyPress, Qt.Key.Key_Escape, Qt.KeyboardModifier.NoModifier))
    assert not engine.running and not direct.timer.isActive()
    worker.run()  # The first-frame wait was cancelled: it must not reveal anything or restart.
    assert engine.waits == [(30, True)] and not direct.playing
    splash.finish_animations()
    assert codes == [1] and not splash.isVisible()
    direct.shutdown()


def test_cancel_during_mpv_spawn_does_not_leave_mpv_running():
    class SpawnRace(SplashEngine):
        def start(self, url, *, extra_args=()):
            super().start(url, extra_args=extra_args)
            direct.generation += 1  # ✕ pressed while mpv was starting.

    engine = SpawnRace()
    direct, worker, api, engine, codes = splash_player(engine)
    direct.open_link(f'kinosota://watch?launch={LAUNCH}')
    worker.run(); worker.run()
    assert len(engine.started) == 1 and not engine.running and engine.waits == []
    direct.shutdown()


def fake_mpv(values, alive=lambda: True):
    mpv = Mpv(executable='mpv')
    mpv.property = values if callable(values) else values.get
    mpv.alive = alive
    return mpv


def test_wait_playback_started_reads_playback_time_video_params_and_eof():
    nap = lambda seconds: None
    assert fake_mpv({'playback-time': 0.04}).wait_playback_started(5, sleep=nap) == 'playing'
    params = {'w': 1920, 'h': 1080, 'dw': 1920, 'dh': 800}
    assert fake_mpv({'playback-time': 0.0, 'video-out-params': params}).wait_playback_started(5, sleep=nap) == 'playing'
    assert fake_mpv({'video-out-params': {'dw': 0, 'dh': 0}, 'eof-reached': True}).wait_playback_started(
        5, sleep=nap) == 'eof'
    assert not Mpv.frame_ready(True, None) and not Mpv.frame_ready(-1, {'w': 1.5, 'h': 2})
    assert not Mpv.frame_ready(None, 'x') and Mpv.frame_ready(None, {'w': 640, 'h': 360})


def test_wait_playback_started_times_out_cancels_and_detects_a_dead_mpv():
    now, slept = [0.0], []

    def sleep(seconds):
        slept.append(seconds)
        now[0] += seconds

    mpv = fake_mpv({'playback-time': None})
    assert mpv.wait_playback_started(1, sleep=sleep, clock=lambda: now[0], interval=0.25) == 'timeout'
    assert slept == [0.25] * 4
    assert fake_mpv({}).wait_playback_started(5, cancelled=lambda: True) == 'cancelled'
    assert fake_mpv({}, alive=lambda: False).wait_playback_started(5) == 'exited'
    seen = []

    def flaky(name):  # IPC socket not ready yet, then the clock runs.
        seen.append(name)
        if len(seen) < 3:
            raise OSError('ipc not ready')
        return 1.5 if name == 'playback-time' else None

    assert fake_mpv(flaky).wait_playback_started(5, sleep=lambda s: None) == 'playing'
    states = [True, False]

    def broken(name):
        raise TimeoutError('mpv IPC response timed out')

    assert fake_mpv(broken, alive=lambda: states.pop(0)).wait_playback_started(5, sleep=lambda s: None) == 'exited'


@pytest.mark.skipif(sys.platform.startswith('win'), reason='Unix socket IPC only')
def test_mpv_property_over_json_ipc_treats_unavailable_as_none():
    folder = tempfile.mkdtemp(prefix='kinosota-ipc-')
    path = os.path.join(folder, 'mpv.sock')
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(path)
    server.listen(2)
    values = {'playback-time': 2.5}

    def serve():
        for _ in range(2):
            connection, _ = server.accept()
            with connection:
                request = json.loads(connection.recv(65536).split(b'\n')[0])
                name = request['command'][1]
                reply = ({'request_id': request['request_id'], 'error': 'success', 'data': values[name]}
                         if name in values else {'request_id': request['request_id'], 'error': 'property unavailable'})
                connection.sendall(b'{"event":"idle"}\n' + json.dumps(reply).encode() + b'\n')

    thread = threading.Thread(target=serve, daemon=True)
    thread.start()
    mpv = Mpv(executable='mpv')
    mpv.endpoint = path
    try:
        assert mpv.property('playback-time') == 2.5
        assert mpv.property('video-out-params') is None
    finally:
        thread.join(5)
        server.close()
        os.unlink(path)
        os.rmdir(folder)
