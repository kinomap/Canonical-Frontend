"""Seamless motion-design prestart: intro -> warm-up -> cross-dissolve -> film (fake libmpv, no GPU)."""
import os
os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')
import math
import threading
import time

import pytest
from PySide6.QtCore import QAbstractAnimation, QEvent, QPoint, QPointF, Qt, Signal
from PySide6.QtGui import QKeyEvent, QWheelEvent
from PySide6.QtWidgets import QApplication, QWidget

from kinosota_player import cinema, libmpv
from kinosota_player.cinema import (DISSOLVE_MS, FILM_VOLUME, INTRO_FIRST_FRAME, INTRO_STILL, INTRO_VIDEO, CinemaEngine,
                                    WHEEL_VOLUME_STEP, CinemaSurface, Timeline, mpv_key_name, options_from_args,
                                    wheel_volume_notches)
from kinosota_player.direct import DirectLaunchSplash, DirectPlayer, StillBackdrop
from kinosota_player.engine import Mpv

from test_deeplink import LAUNCH, Deferred, SplashApi

URL = 'https://media.example/stream/0f4c4d2e-8a59-4d7e-9a3e-3a6f1b2c4d5e'


def qt_app():
    return QApplication.instance() or QApplication([])


class FakePlayer:
    def __init__(self, options):
        self.options = dict(options)
        self.props = {'pause': self.options.get('pause') == 'yes', 'volume': float(self.options.get('volume', 100))}
        self.commands, self.events, self.observed = [], [], []
        self.terminated = False
        self.render_context = True

    def set(self, name, value):
        self.props[name] = value

    def try_set(self, name, value):
        self.set(name, value)
        return True

    def get(self, name):
        return self.props.get(name)

    def command(self, *args):
        self.commands.append(args)

    def observe(self, name, reply=0):
        self.observed.append(name)

    def set_wakeup_callback(self, fn):
        self.wake = fn

    def set_update_callback(self, fn):
        pass

    def wait_event(self, timeout=0.0):
        return self.events.pop(0) if self.events else None

    def terminate(self):
        self.terminated = True


class FakeView(QWidget):
    frameReady = Signal(str)
    glFailed = Signal(str)
    activity = Signal()
    mouseMoved = Signal(QPointF)
    mouseButton = Signal(str, bool)
    mouseDouble = Signal(str)
    volumeWheel = Signal(float)

    def __init__(self):
        super().__init__()
        self.layers, self.armed, self.posters, self.seen = {}, set(), [], set()
        self.initialized, self.failure = True, ''

    def attach(self, name, player, alpha=1.0):
        self.layers[name] = [player, alpha]

    def detach(self, name):
        self.armed.discard(name)
        layer = self.layers.pop(name, None)
        return layer[0] if layer else None

    def arm(self, name):
        self.armed.add(name)

    def disarm(self, name):
        self.armed.discard(name)

    def set_alpha(self, name, alpha):
        if name in self.layers:
            self.layers[name][1] = alpha

    def alpha(self, name):
        return self.layers[name][1] if name in self.layers else 0.0

    def set_poster(self, image):
        self.posters.append(image)

    def release(self):
        self.layers.clear()
        self.armed.clear()
        self.initialized = False


def make_surface():
    qt_app()
    surface = CinemaSurface(view=FakeView(), player_factory=FakePlayer)
    events = []
    for name in ('filmStarted', 'filmDissolved', 'failed'):
        getattr(surface, name).connect(lambda *a, name=name: events.append((name, *a)))
    surface.filmEnded.connect(lambda code: events.append(('filmEnded', code)))
    surface.fullscreenRequested.connect(lambda full: events.append(('fullscreen', full)))
    return surface, events


def push(surface, player, event_id, **fields):
    surface.handles[player].events.append(libmpv.Event(event_id, **fields))
    surface._drain()


def first_film_frame(surface, cached=0.0):
    """playback-restart of the paused film, then the view composites its first frame."""
    surface.presented_at = time.monotonic() - 5  # Past the minimum intro exposure.
    surface.handles['film'].props['demuxer-cache-duration'] = cached
    push(surface, 'film', libmpv.EVENT_PLAYBACK_RESTART)
    assert 'film' in surface.view.armed
    surface._frame_ready('film')


# Assets and timeline --------------------------------------------------------------------------------------------
def test_prepared_intro_assets_ship_with_the_package():
    assert INTRO_VIDEO.is_file() and INTRO_VIDEO.stat().st_size > 1_000_000
    assert INTRO_FIRST_FRAME.is_file() and INTRO_STILL.is_file()
    with open(INTRO_VIDEO, 'rb') as stream:
        head = stream.read(64 * 1024)
    assert b'ftyp' in head[:16] and b'moov' in head  # faststart: the intro plays without reading to the end.


def test_timeline_is_a_smooth_cross_dissolve_with_a_light_fade_shadow_and_equal_power_audio():
    line = Timeline()
    line.set_progress(0)
    assert (line.film_alpha, line.intro_alpha, line.intro_volume, line.film_volume) == (0.0, 1.0, 1.0, 0.0)
    previous = -1.0
    for step in range(0, 101):
        line.set_progress(step / 100)
        assert line.film_alpha >= previous
        previous = line.film_alpha
        assert 1.0 - cinema.SHADOW_DEPTH - 1e-9 <= line.intro_alpha <= 1.0
        assert math.isclose(line.intro_volume ** 2 + line.film_volume ** 2, 1.0, abs_tol=1e-9)
    line.set_progress(0.5)
    assert math.isclose(line.intro_alpha, 1.0 - cinema.SHADOW_DEPTH) and math.isclose(line.film_alpha, 0.5)
    line.set_progress(7)
    assert line.progress == 1.0 and line.film_alpha == 1.0 and math.isclose(line.intro_volume, 0.0, abs_tol=1e-12)


# Phases ---------------------------------------------------------------------------------------------------------
def test_present_starts_the_intro_at_once_and_prepares_a_silent_paused_film_core():
    surface, _ = make_surface()
    assert surface.present() is True
    assert surface.phase == 'intro' and surface.view.posters[-1] == INTRO_FIRST_FRAME
    intro, film = surface.handles['intro'], surface.handles['film']
    assert intro.commands == [('loadfile', str(INTRO_VIDEO))]
    assert intro.options['keep-open'] == 'always' and intro.options['panscan'] == '1.0' and intro.options['vo'] == 'libmpv'
    assert film.options['pause'] == 'yes' and film.options['volume'] == '0' and film.commands == []
    assert film.observed == ['fullscreen'] and surface.view.alpha('intro') == 1.0 and surface.view.alpha('film') == 0.0
    assert surface.present() is True and len(intro.commands) == 1  # Idempotent while on screen.
    surface.shutdown()


def test_film_warms_up_paused_and_muted_under_the_intro():
    surface, events = make_surface()
    surface.present()
    surface.load_film(URL, [('alang', 'ru,rus'), ('force-media-title', 'Дюна')])
    film = surface.handles['film']
    assert surface.phase == 'warmup' and surface.film_alive() and surface.film_exit_code() is None
    assert film.commands[-1] == ('loadfile', URL, 'replace')
    assert film.props['pause'] is True and film.props['volume'] == 0 and film.props['alang'] == 'ru,rus'
    assert film.props['force-media-title'] == 'Дюна' and surface.view.alpha('film') == 0.0
    assert not surface.started.is_set() and events == []
    surface.shutdown()


def test_smart_prestart_waits_for_the_first_frame_and_a_short_buffer_then_dissolves():
    surface, events = make_surface()
    surface.present()
    surface.load_film(URL)
    first_film_frame(surface, cached=0.4)
    assert surface.phase == 'warmup' and surface.ready_timer.isActive()  # Decoded, not buffered yet.
    surface.handles['film'].props['demuxer-cache-duration'] = 3.1
    surface._check_ready()
    film, intro = surface.handles['film'], surface.handles['intro']
    assert surface.phase == 'dissolve' and events == [('filmStarted',)] and surface.started.is_set()
    assert film.props['pause'] is False and not surface.ready_timer.isActive()
    assert surface.dissolve.duration() == DISSOLVE_MS and surface.dissolve.state() == QAbstractAnimation.State.Running
    surface.dissolve.setCurrentTime(DISSOLVE_MS // 2)
    assert 0.4 < surface.view.alpha('film') < 0.6 and surface.view.alpha('intro') < 0.9  # Fade-shadow mid-way.
    assert 60 < film.props['volume'] < 80 and 60 < intro.props['volume'] < 80  # Equal-power: ~71 each.
    surface.dissolve.setCurrentTime(DISSOLVE_MS)
    assert surface.phase == 'film' and 'intro' not in surface.handles and intro.terminated
    assert film.props['volume'] == FILM_VOLUME and film.props['osc'] is True and film.props['osd-level'] == 1
    assert events == [('filmStarted',), ('filmDissolved',)] and surface.view.posters[-1] == INTRO_STILL
    surface.shutdown()


def test_a_decoded_first_frame_never_waits_longer_than_the_hold_limit():
    surface, events = make_surface()
    surface.present()
    surface.load_film(URL)
    first_film_frame(surface, cached=0.0)
    assert surface.phase == 'warmup'
    surface.film_frame_at = time.monotonic() - cinema.PRESTART_MAX_HOLD_MS / 1000 - 0.1
    surface._check_ready()
    assert surface.phase == 'dissolve' and events[0] == ('filmStarted',)
    surface.shutdown()


def test_a_very_fast_source_still_shows_the_intro_briefly_instead_of_flashing_it():
    surface, events = make_surface()
    surface.present()
    surface.load_film(URL)
    surface.handles['film'].props['demuxer-cache-idle'] = True
    push(surface, 'film', libmpv.EVENT_PLAYBACK_RESTART)
    surface._frame_ready('film')
    assert surface.phase == 'warmup' and events == []
    surface.presented_at = time.monotonic() - cinema.MIN_INTRO_MS / 1000 - 0.05
    surface._check_ready()
    assert surface.phase == 'dissolve'
    surface.shutdown()


def test_a_stream_failing_before_its_first_frame_keeps_the_intro_on_screen():
    surface, events = make_surface()
    surface.present()
    surface.load_film(URL)
    push(surface, 'film', libmpv.EVENT_END_FILE, reason=libmpv.END_ERROR, error=-13)
    assert events == [('filmEnded', 2)] and surface.phase == 'failed'
    assert not surface.film_alive() and surface.film_exit_code() == 2 and 'intro' in surface.handles
    assert surface.view.alpha('intro') == 1.0 and 'film' not in surface.view.armed
    surface.load_film(URL)  # The caller's retry reuses the same window and intro.
    assert surface.phase == 'warmup' and surface.film_alive()
    surface.shutdown()


def test_end_of_film_quit_and_our_own_stop_are_told_apart():
    surface, events = make_surface()
    surface.present()
    surface.load_film(URL)
    first_film_frame(surface, cached=5)
    surface.dissolve.setCurrentTime(DISSOLVE_MS)
    push(surface, 'film', libmpv.EVENT_END_FILE, reason=libmpv.END_STOP)
    assert surface.film_alive()  # A replace / stop is not the end of the film.
    push(surface, 'film', libmpv.EVENT_END_FILE, reason=libmpv.END_EOF)
    assert ('filmEnded', 0) in events and surface.phase == 'ended' and surface.film_exit_code() == 0
    surface.load_film(URL)
    film = surface.handles['film']
    push(surface, 'film', libmpv.EVENT_SHUTDOWN)  # «q» inside the film.
    assert 'film' not in surface.handles and film.terminated and surface.film_exit_code() == 0
    surface.shutdown()


def test_stop_film_keeps_the_intro_and_reset_releases_every_core():
    surface, _ = make_surface()
    surface.present()
    surface.load_film(URL)
    film, intro = surface.handles['film'], surface.handles['intro']
    surface.stop_film()
    assert film.commands[-1] == ('stop',) and not surface.film_alive() and surface.film_exit_code() is None
    assert surface.phase == 'intro' and not intro.terminated
    surface.reset()
    assert surface.handles == {} and film.terminated and intro.terminated and surface.phase == 'idle'


def test_opengl_failure_disables_the_surface_and_reports_once():
    surface, events = make_surface()
    surface.present()
    surface.load_film(URL)
    surface.view.glFailed.emit('GL 2.1 without FBO')
    assert events == [('failed', 'GL 2.1 without FBO')] and surface.phase == 'unavailable'
    assert surface.handles == {} and surface.film_exit_code() == 2 and surface.present() is False
    with pytest.raises(RuntimeError):
        surface.load_film(URL)


# Input ----------------------------------------------------------------------------------------------------------
@pytest.mark.parametrize('key,text,mods,name', [
    (Qt.Key.Key_Space, ' ', Qt.KeyboardModifier.NoModifier, 'SPACE'),
    (Qt.Key.Key_Left, '', Qt.KeyboardModifier.NoModifier, 'LEFT'),
    (Qt.Key.Key_Right, '', Qt.KeyboardModifier.ShiftModifier, 'Shift+RIGHT'),
    (Qt.Key.Key_F, 'f', Qt.KeyboardModifier.NoModifier, 'f'),
    (Qt.Key.Key_F, 'F', Qt.KeyboardModifier.ShiftModifier, 'F'),
    (Qt.Key.Key_Q, '\x11', Qt.KeyboardModifier.ControlModifier, 'Ctrl+q'),
    (Qt.Key.Key_NumberSign, '#', Qt.KeyboardModifier.ShiftModifier, 'SHARP'),
    (Qt.Key.Key_Escape, '\x1b', Qt.KeyboardModifier.NoModifier, 'ESC'),
    (Qt.Key.Key_F11, '', Qt.KeyboardModifier.NoModifier, 'F11'),
    (Qt.Key.Key_Shift, '', Qt.KeyboardModifier.ShiftModifier, None),
])
def test_qt_keys_map_to_mpv_input_names(key, text, mods, name):
    assert mpv_key_name(key, text, mods) == name


def test_input_reaches_mpv_only_while_the_film_plays_and_mpv_fullscreen_drives_the_window():
    surface, events = make_surface()
    surface.present()
    surface.load_film(URL)
    film = surface.handles['film']
    surface.send_key('SPACE')
    surface.view.mouseButton.emit('MBTN_LEFT', True)
    surface.view.volumeWheel.emit(1.0)
    assert film.commands == [('loadfile', URL, 'replace')]  # The intro is not interactive.
    first_film_frame(surface, cached=5)
    surface.send_key('SPACE')
    surface.view.mouseMoved.emit(QPointF(12.6, 40.2))
    surface.view.mouseButton.emit('MBTN_LEFT', True)
    surface.view.mouseButton.emit('MBTN_LEFT', False)
    surface.view.volumeWheel.emit(1.0)
    assert film.commands[1:] == [('keypress', 'SPACE'), ('mouse', 12, 40), ('keydown', 'MBTN_LEFT'),
                                 ('keyup', 'MBTN_LEFT'), ('osd-auto', 'add', 'volume', '5')]
    surface.set_fullscreen(True)
    assert film.props['fullscreen'] is True
    push(surface, 'film', libmpv.EVENT_PROPERTY_CHANGE, name='fullscreen', value=False)  # mpv's Esc / f.
    assert events[-1] == ('fullscreen', False)
    push(surface, 'film', libmpv.EVENT_PROPERTY_CHANGE, name='fullscreen', value=False)
    assert events.count(('fullscreen', False)) == 1
    surface.shutdown()


def wheel_event(angle, inverted=False):
    return QWheelEvent(QPointF(10, 10), QPointF(10, 10), QPoint(0, 0), QPoint(*angle), Qt.MouseButton.NoButton,
                       Qt.KeyboardModifier.NoModifier, Qt.ScrollPhase.NoScrollPhase, inverted)


@pytest.mark.parametrize('angle, inverted, notches', [
    ((0, 120), False, 1.0), ((0, -120), False, -1.0), ((0, 240), False, 2.0),
    ((0, 40), False, 1 / 3),                     # High-resolution wheel / touchpad: a fraction of a notch.
    ((0, 120), True, -1.0),                      # Natural scrolling is undone for the volume.
    ((120, 0), False, 0.0), ((-120, 0), False, 0.0),  # A tilt wheel or sideways swipe never seeks.
])
def test_wheel_events_are_volume_notches_and_sideways_wheels_do_nothing(angle, inverted, notches):
    assert wheel_volume_notches(QPoint(*angle), inverted) == pytest.approx(notches)
    qt_app()
    view = cinema.CinemaView()
    emitted = []
    view.volumeWheel.connect(emitted.append)
    event = wheel_event(angle, inverted)
    view.wheelEvent(event)
    assert event.isAccepted()  # Consumed by the picture: never scrolls or seeks anything behind it.
    assert emitted == ([pytest.approx(notches)] if notches else [])
    view.deleteLater()


def test_the_mouse_wheel_only_changes_the_film_volume_and_never_seeks():
    surface, _ = make_surface()
    surface.present()
    surface.load_film(URL)
    film = surface.handles['film']
    first_film_frame(surface, cached=5)
    surface.dissolve.setCurrentTime(DISSOLVE_MS)
    assert surface.phase == 'film' and WHEEL_VOLUME_STEP == 5
    for notches in (1.0, 1.0, -1.0, 0.25, -3.0, 0.0):
        surface.view.volumeWheel.emit(notches)
    assert film.commands[1:] == [('osd-auto', 'add', 'volume', '5'), ('osd-auto', 'add', 'volume', '5'),
                                 ('osd-auto', 'add', 'volume', '-5'), ('osd-auto', 'add', 'volume', '1.25'),
                                 ('osd-auto', 'add', 'volume', '-15')]
    sent = [part for command in film.commands for part in command]
    assert not any(str(part).startswith(('WHEEL', 'seek')) or part == 'keypress' for part in sent)
    surface.stop_film()
    surface.view.volumeWheel.emit(1.0)
    assert film.commands[-1] == ('stop',)  # A stopped film takes no more wheel input.
    surface.shutdown()


def test_closing_fades_the_film_out_from_the_volume_the_viewer_chose():
    surface, _ = make_surface()
    surface.present()
    surface.load_film(URL)
    film = surface.handles['film']
    first_film_frame(surface, cached=5)
    surface.dissolve.setCurrentTime(DISSOLVE_MS)
    film.props['volume'] = 30.0  # Turned down with the wheel.
    surface.fade_audio(400)
    assert film.props['volume'] == pytest.approx(30.0)  # No jump back to full volume before the fade.
    surface.audio_fade.setCurrentTime(200)
    assert film.props['volume'] == pytest.approx(15.0, abs=0.1)
    surface.audio_fade.setCurrentTime(400)
    assert film.props['volume'] == pytest.approx(0.0)
    surface.shutdown()


# Engine adapter -------------------------------------------------------------------------------------------------
def test_engine_flags_become_mpv_options_without_window_geometry():
    assert options_from_args(['--alang=ru,rus', '--aid=11', '--force-media-title=X=Y', '--fullscreen',
                              '--geometry=+0+0', '--native-fs=no', '--no-sub', 'positional', '--tls-ca-file=/c.pem']) == [
        ('alang', 'ru,rus'), ('aid', '11'), ('force-media-title', 'X=Y'), ('sub', 'no'), ('tls-ca-file', '/c.pem')]


def test_cinema_engine_keeps_the_engine_contract_and_marshals_worker_calls_to_the_ui_thread():
    app = qt_app()
    surface, _ = make_surface()
    engine = CinemaEngine(surface)
    assert engine.executable and not engine.alive() and engine.exit_code() is None
    with pytest.raises(ValueError):
        engine.start('http://media.example/stream/1')
    surface.present()
    result = {}

    def worker():
        result['thread'] = threading.current_thread() is not threading.main_thread()
        engine.start(URL, extra_args=['--alang=en,eng', '--fullscreen'])
        result['started'] = True

    thread = threading.Thread(target=worker)
    thread.start()
    deadline = time.monotonic() + 5
    while thread.is_alive() and time.monotonic() < deadline:
        app.processEvents()
        time.sleep(0.01)
    thread.join(1)
    film = surface.handles['film']
    assert result == {'thread': True, 'started': True} and engine.alive()
    assert film.props['alang'] == 'en,eng' and 'fullscreen' not in film.props
    assert engine.command(['set_property', 'fullscreen', True]) is None and 'fullscreen' not in film.props
    film.props['time-pos'] = 1.5
    assert engine.command(['get_property', 'time-pos']) == 1.5 and engine.property('time-pos') == 1.5
    engine.command(['cycle', 'pause'])
    assert film.commands[-1] == ('cycle', 'pause')
    assert engine.wait_playback_started(0.05, interval=0.01) == 'timeout'
    assert engine.wait_playback_started(5, cancelled=lambda: True) == 'cancelled'
    first_film_frame(surface, cached=5)
    assert engine.wait_playback_started(0.05) == 'playing'
    engine.stop()
    assert not engine.alive() and surface.phase == 'intro'
    with pytest.raises(OSError):
        engine.command(['cycle', 'pause'])
    surface.shutdown()


def test_a_failed_film_is_reported_like_an_exited_mpv_process():
    surface, _ = make_surface()
    engine = CinemaEngine(surface)
    surface.present()
    engine.start(URL)
    push(surface, 'film', libmpv.EVENT_END_FILE, reason=libmpv.END_ERROR)
    assert engine.wait_playback_started(1) == 'exited' and engine.exit_code() == 2
    surface.shutdown()


# Splash and launch flow -----------------------------------------------------------------------------------------
def test_the_splash_plays_the_intro_hides_text_and_becomes_the_film_window():
    surface, _ = make_surface()
    splash = DirectLaunchSplash(cinema=surface)
    assert splash.backdrop is surface.view and splash.cinema_mode()
    splash.present()
    assert surface.phase == 'intro' and splash.windowFlags() & Qt.WindowType.WindowStaysOnTopHint
    assert not splash.status_label.isVisible() and not splash.brand_label.isVisible()  # No emblem, no text.
    assert splash.close_button.isVisible() and splash.resize_button.isVisible()
    assert surface.view.geometry() == splash.rect()
    splash.set_status('Ссылка устарела', error=True)
    assert splash.status_label.isVisible()  # Errors are always said.
    splash.set_status('Буферизация видео…')
    assert not splash.status_label.isVisible()
    splash._long_wait()
    assert splash.status_label.isVisible()  # The intro ended long ago: say what happens.
    surface.load_film(URL)
    splash.fade_out()  # A caller's early «first frame» does not drop the intro under a warming film.
    assert splash.isVisible() and not splash.fading()
    first_film_frame(surface, cached=5)
    assert splash.film_mode and not splash.status_label.isVisible() and not splash.close_button.isVisible()
    assert not splash.windowFlags() & Qt.WindowType.WindowStaysOnTopHint  # An ordinary film window now.
    assert splash.close_button.toolTip() == 'Закрыть фильм'
    splash.fade_out()
    assert splash.isVisible() and not splash.fading()  # The window stays: it shows the film.
    surface.view.activity.emit()
    assert splash.close_button.isVisible() and splash.chrome_timer.isActive()
    film = surface.handles['film']
    splash.keyPressEvent(QKeyEvent(QEvent.Type.KeyPress, Qt.Key.Key_Space, Qt.KeyboardModifier.NoModifier, ' '))
    assert film.commands[-1] == ('keypress', 'SPACE')
    asked = []
    splash.cancelRequested.connect(lambda: asked.append(True))
    splash.keyPressEvent(QKeyEvent(QEvent.Type.KeyPress, Qt.Key.Key_Escape, Qt.KeyboardModifier.NoModifier, '\x1b'))
    assert asked == [] and film.commands[-1] == ('keypress', 'ESC')  # mpv leaves fullscreen.
    splash.toggle_mode()
    assert splash.mode == 'compact' and film.props['fullscreen'] is False
    surface.fullscreenRequested.emit(True)
    assert splash.mode == 'full'
    splash.hide_now()
    assert not splash.film_mode and surface.handles == {} and surface.phase == 'idle'
    splash.dismiss()


def test_cancel_fades_the_intro_sound_with_the_window():
    surface, _ = make_surface()
    splash = DirectLaunchSplash(cinema=surface)
    splash.present()
    intro = surface.handles['intro']
    splash.fade_out(close=True)
    assert splash.fading() and surface.audio_fade.state() == QAbstractAnimation.State.Running
    surface.audio_fade.setCurrentTime(surface.audio_fade.duration() // 2)
    assert 0 < intro.props['volume'] < 100
    splash.finish_animations()
    assert not splash.isVisible() and intro.terminated and surface.handles == {}


def test_a_broken_cinema_falls_back_to_the_logo_still():
    surface, _ = make_surface()
    splash = DirectLaunchSplash(cinema=surface)
    splash.present()
    surface.view.glFailed.emit('no GL')
    assert isinstance(splash.backdrop, StillBackdrop) and not splash.cinema_mode()
    assert splash.status_label.isVisible() and splash.brand_label.isVisible()
    splash.dismiss()


def cinema_player():
    surface, events = make_surface()
    worker, api = Deferred(), SplashApi()
    direct = DirectPlayer(api_factory=lambda: api, worker=worker, cinema=surface)
    codes = []
    direct.finished.connect(codes.append)
    return direct, surface, worker, api, codes


def test_website_launch_plays_intro_then_film_in_one_window():
    direct, surface, worker, api, codes = cinema_player()
    assert isinstance(direct.engine, CinemaEngine) and direct.splash.cinema is surface
    assert direct.open_link(f'kinosota://watch?launch={LAUNCH}')
    assert surface.phase == 'intro' and direct.splash.isVisible()  # Instantly, before any network reply.
    worker.run()  # open_launch
    worker.run()  # warm_stream + start -> the film loads paused under the intro
    film = surface.handles['film']
    assert surface.phase == 'warmup' and film.commands[-1][0] == 'loadfile' and film.props['pause'] is True
    assert film.props.get('aid') == '2' and film.props.get('force-media-title') == 'Тёмный рыцарь'
    first_film_frame(surface, cached=5)
    worker.run()  # first-frame wait answers 'playing' at once
    assert direct.playing and direct.splash.isVisible() and direct.splash.film_mode
    surface.dissolve.setCurrentTime(DISSOLVE_MS)
    assert surface.phase == 'film' and 'intro' not in surface.handles
    push(surface, 'film', libmpv.EVENT_END_FILE, reason=libmpv.END_EOF)
    direct._watch()
    assert codes == [0] and not direct.splash.isVisible() and surface.handles == {}
    direct.shutdown()


def test_closing_a_playing_film_is_a_normal_exit():
    direct, surface, worker, api, codes = cinema_player()
    direct.open_link(f'kinosota://watch?launch={LAUNCH}')
    worker.run()
    worker.run()
    first_film_frame(surface, cached=5)
    worker.run()
    direct.splash.close_button.click()
    direct.splash.finish_animations()
    assert codes == [0] and surface.handles == {}


def test_a_retry_after_a_failed_stream_keeps_the_intro_and_reloads_the_film():
    direct, surface, worker, api, codes = cinema_player()
    direct.open_link(f'kinosota://watch?launch={LAUNCH}')
    worker.run()
    worker.run()
    push(surface, 'film', libmpv.EVENT_END_FILE, reason=libmpv.END_ERROR)
    worker.run()  # The first-frame wait ends with 'exited'.
    direct._watch()  # Exit code 2: reconnect.
    assert direct.attempt == 1 and 'intro' in surface.handles
    worker.run()
    assert surface.phase == 'warmup' and surface.film_alive() and codes == []
    direct.shutdown()


def test_launch_switches_to_the_external_mpv_window_when_opengl_fails():
    direct, surface, worker, api, codes = cinema_player()
    direct.open_link(f'kinosota://watch?launch={LAUNCH}')
    worker.run()  # open_launch: the stream URL is known
    jobs = len(worker.jobs)
    surface.view.glFailed.emit('no GL')
    assert isinstance(direct.engine, Mpv) and direct.cinema is None
    assert isinstance(direct.splash.backdrop, StillBackdrop)
    assert len(worker.jobs) == jobs + 1  # The start is re-queued for the external window.
    direct.shutdown()


def test_without_libmpv_the_default_player_keeps_the_external_mpv_window(monkeypatch):
    qt_app()
    monkeypatch.setattr(cinema, 'unavailable_reason', lambda: 'libmpv.so.2: cannot open shared object file')
    direct = DirectPlayer(api_factory=SplashApi, worker=Deferred())
    assert direct.cinema is None and isinstance(direct.engine, Mpv)
    assert isinstance(direct.splash.backdrop, StillBackdrop)
    direct.shutdown()


def test_offscreen_and_disabled_environments_never_try_opengl(monkeypatch):
    qt_app()
    assert cinema.unavailable_reason()  # Tests run on the offscreen platform.
    assert cinema.create_surface() is None
    monkeypatch.setenv('KINOSOTA_CINEMA', '0')
    assert cinema.unavailable_reason() == 'disabled by KINOSOTA_CINEMA'


# Track popups (right click on the OSC audio / subtitle buttons) --------------------------------------------------
TRACK_LIST = [
    {'id': 1, 'type': 'video', 'codec': 'h264', 'selected': True},
    {'id': 1, 'type': 'audio', 'lang': 'rus', 'title': 'Дубляж', 'codec': 'ac3', 'demux-channel-count': 6,
     'selected': True},
    {'id': 2, 'type': 'audio', 'lang': 'ukr', 'title': 'Пифагор', 'codec': 'eac3', 'demux-channel-count': 2},
    {'id': 3, 'type': 'audio', 'lang': 'eng', 'codec': 'dts', 'demux-channel-count': 8},
    {'id': 4, 'type': 'audio', 'lang': 'jpn', 'title': 'Original', 'codec': 'aac'},
    {'id': 1, 'type': 'sub', 'lang': 'rus', 'title': 'Full', 'codec': 'subrip'},
    {'id': 2, 'type': 'sub', 'lang': 'rus', 'title': 'Надписи', 'codec': 'ass', 'forced': True},
    {'type': 'audio', 'title': 'no id'}, 'garbage',
]


def playing_film(surface, tracks=TRACK_LIST):
    surface.present()
    surface.load_film(URL)
    surface.handles['film'].props['track-list'] = [dict(t) if isinstance(t, dict) else t for t in tracks]
    first_film_frame(surface, cached=5)
    assert surface.accepts_input()
    return surface.handles['film']


def test_client_message_args_are_read_from_the_mpv_event_struct():
    import ctypes
    values = (ctypes.c_char_p * 2)(b'kinosota-audio-menu', 'ё'.encode())
    message = libmpv.mpv_event_client_message(2, ctypes.cast(values, ctypes.POINTER(ctypes.c_char_p)))
    assert libmpv.client_message_args(ctypes.addressof(message)) == ['kinosota-audio-menu', 'ё']
    assert libmpv.client_message_args(None) == []
    assert libmpv.EVENT_CLIENT_MESSAGE == 16
    assert libmpv.Event(libmpv.EVENT_CLIENT_MESSAGE).args == []


def test_the_film_osc_right_click_sends_script_messages_instead_of_cycling_tracks():
    options = dict(cinema.FILM_OPTIONS)
    opts = dict(item.split('=', 1) for item in options['script-opts'].split(','))
    assert opts['osc-audio_track_mbtn_right_command'].startswith('script-message kinosota-audio-menu')
    assert opts['osc-sub_track_mbtn_right_command'].startswith('script-message kinosota-sub-menu')
    assert 'cycle' not in options['script-opts']
    assert 'script-opts' not in dict(cinema.INTRO_OPTIONS)


def test_osc_client_messages_become_menu_signals_only_while_the_film_plays():
    surface, _ = make_surface()
    asked = []
    surface.audioMenuRequested.connect(lambda: asked.append('audio'))
    surface.subtitlesMenuRequested.connect(lambda: asked.append('sub'))
    surface.present()
    surface.load_film(URL)
    push(surface, 'film', libmpv.EVENT_CLIENT_MESSAGE, args=['kinosota-audio-menu'])
    assert asked == []  # Still warming up under the intro.
    first_film_frame(surface, cached=5)
    push(surface, 'film', libmpv.EVENT_CLIENT_MESSAGE, args=['kinosota-audio-menu'])
    push(surface, 'film', libmpv.EVENT_CLIENT_MESSAGE, args=['kinosota-sub-menu'])
    push(surface, 'film', libmpv.EVENT_CLIENT_MESSAGE, args=['something-else'])
    push(surface, 'film', libmpv.EVENT_CLIENT_MESSAGE, args=[])
    assert asked == ['audio', 'sub']
    surface.shutdown()


def test_track_list_is_filtered_per_kind_with_flags_codecs_and_the_active_mark():
    from kinosota_player.tracks import AUDIO, SUBTITLES, row_text, track_entries
    audio = track_entries(TRACK_LIST, AUDIO)
    assert [row['id'] for row in audio] == [1, 2, 3, 4]
    assert [row['language'] for row in audio] == ['ru', 'uk', 'en', '']
    assert audio[0]['selected'] and not any(row['selected'] for row in audio[1:])
    assert audio[0]['details'] == 'AC-3 · 5.1' and audio[3]['code'] == 'JPN'
    assert audio[2]['title'] == 'Английский' and audio[2]['details'] == 'DTS · 7.1'
    assert row_text(audio[0]).endswith('✓') and not row_text(audio[1]).endswith('✓')
    assert row_text(audio[3]).startswith('JPN  Original')
    subs = track_entries(TRACK_LIST, SUBTITLES)
    assert [row['id'] for row in subs] == [0, 1, 2] and subs[0]['title'] == 'Без субтитров' and subs[0]['selected']
    assert subs[2]['details'] == 'ASS · Forced'
    assert track_entries(None, AUDIO) == [] and [row['id'] for row in track_entries(None, SUBTITLES)] == [0]
    shown = [dict(t) for t in TRACK_LIST if isinstance(t, dict)]
    shown[5]['selected'] = True
    subs = track_entries(shown, SUBTITLES)
    assert not subs[0]['selected'] and subs[1]['selected']


def test_right_click_on_audio_opens_the_popup_and_a_click_switches_aid_in_place():
    from kinosota_player.tracks import TrackSelectionDialog
    surface, _ = make_surface()
    splash = DirectLaunchSplash(cinema=surface)
    splash.present()
    assert splash.show_audio_menu() is None  # No popup over the intro.
    film = playing_film(surface)
    push(surface, 'film', libmpv.EVENT_CLIENT_MESSAGE, args=['kinosota-audio-menu'])
    dialog = splash.track_dialog
    assert isinstance(dialog, TrackSelectionDialog) and dialog.isVisible() and dialog.isModal()
    assert dialog.title_label.text() == 'Выбор аудиодорожки' and dialog.objectName() == 'trackDialog'
    assert dialog.card.objectName() == 'audioCard' and dialog.geometry() == splash.frameGeometry()
    assert list(dialog.track_buttons) == [1, 2, 3, 4] and dialog.track_buttons[1].isChecked()
    loads = [c for c in film.commands if c and c[0] == 'loadfile']
    dialog.track_buttons[3].click()
    assert film.props['aid'] == 3 and film.props['pause'] is False  # Switched on the fly, still playing.
    assert [c for c in film.commands if c and c[0] == 'loadfile'] == loads  # No reload.
    assert splash.track_dialog is None and not dialog.isVisible()
    splash.dismiss()


def test_subtitle_popup_offers_off_and_every_subtitle_and_sets_sid():
    surface, _ = make_surface()
    splash = DirectLaunchSplash(cinema=surface)
    splash.present()
    film = playing_film(surface)
    surface.subtitlesMenuRequested.emit()
    dialog = splash.track_dialog
    assert dialog.title_label.text() == 'Выбор субтитров' and list(dialog.track_buttons) == [0, 1, 2]
    assert dialog.track_buttons[0].isChecked()
    dialog.track_buttons[2].click()
    assert film.props['sid'] == 2 and splash.track_dialog is None
    surface.subtitlesMenuRequested.emit()
    splash.track_dialog.track_buttons[0].click()
    assert film.props['sid'] == 'no'  # «Без субтитров».
    splash.dismiss()


def test_esc_the_close_button_and_a_click_outside_the_card_close_the_popup_and_the_film_keeps_playing():
    from PySide6.QtGui import QMouseEvent
    surface, _ = make_surface()
    splash = DirectLaunchSplash(cinema=surface)
    splash.present()
    film = playing_film(surface)
    surface.audioMenuRequested.emit()
    dialog = splash.track_dialog
    dialog.keyPressEvent(QKeyEvent(QEvent.Type.KeyPress, Qt.Key.Key_Escape, Qt.KeyboardModifier.NoModifier, '\x1b'))
    assert splash.track_dialog is None and not dialog.isVisible()
    surface.audioMenuRequested.emit()
    dialog = splash.track_dialog
    dialog.close_button.click()
    assert splash.track_dialog is None and not dialog.isVisible()
    surface.subtitlesMenuRequested.emit()
    dialog = splash.track_dialog
    inside = QPointF(dialog.card.geometry().center())
    dialog.mousePressEvent(QMouseEvent(QEvent.Type.MouseButtonPress, inside, inside, Qt.MouseButton.LeftButton,
                                       Qt.MouseButton.LeftButton, Qt.KeyboardModifier.NoModifier))
    assert splash.track_dialog is dialog and dialog.isVisible()
    outside = QPointF(2, 2)
    dialog.mousePressEvent(QMouseEvent(QEvent.Type.MouseButtonPress, outside, outside, Qt.MouseButton.LeftButton,
                                       Qt.MouseButton.LeftButton, Qt.KeyboardModifier.NoModifier))
    assert splash.track_dialog is None and not dialog.isVisible()
    assert 'aid' not in film.props and 'sid' not in film.props and film.props['pause'] is False
    surface.audioMenuRequested.emit()
    dialog = splash.track_dialog
    splash.hide_now()  # The film window goes away: so does its popup.
    assert splash.track_dialog is None and not dialog.isVisible()
    splash.dismiss()
