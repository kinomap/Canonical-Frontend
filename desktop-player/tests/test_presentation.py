"""0.2.5: decoded frames must reach the screen, the smoke loop runs a real event loop, a quit is never vetoed.

Root cause of the 0.2.4 Wayland report: a compositor that withholds wl_surface.frame callbacks (locked or blanked
screen, minimized window) makes Qt mark the window unexposed and QOpenGLWidget stops calling paintGL. The prestart
advances on composited frames only, and the GL watchdog ended with initializeGL(), so warmup held forever silently."""
import time

import pytest
from PySide6.QtCore import QTimer
from PySide6.QtGui import QCloseEvent
from PySide6.QtWidgets import QApplication

from kinosota_player import cinema, cinema_smoke, libmpv
from kinosota_player.cinema import CinemaSurface, CinemaView
from kinosota_player.direct import DirectLaunchSplash

from test_cinema import URL, FakePlayer, FakeView, push


def app():
    return QApplication.instance() or QApplication([])


class PresentingView(FakeView):
    """FakeView with the 0.2.5 presentation API: armed layers stay uncomposited until composite()."""

    def __init__(self):
        super().__init__()
        self.state = {'visible': True, 'minimized': False, 'exposed': True}
        self.armed_at, self.kicks, self.paint_count = {}, 0, 0

    def arm(self, name):
        super().arm(name)
        self.armed_at.setdefault(name, time.monotonic())

    def disarm(self, name):
        super().disarm(name)
        self.armed_at.pop(name, None)

    def age(self, name, seconds):
        self.armed_at[name] = time.monotonic() - seconds

    def composite(self, name):
        self.armed_at.pop(name, None)

    def pending_frames(self, now=None):
        now = time.monotonic() if now is None else now
        return {name: now - at for name, at in self.armed_at.items()}

    def presentation(self):
        return {**self.state, 'paints': self.paint_count, 'last_paint_ms': None}

    def kick(self):
        self.kicks += 1


def stalled_surface():
    app()
    surface = CinemaSurface(view=PresentingView(), player_factory=FakePlayer)
    failed = []
    surface.failed.connect(failed.append)
    surface.present()
    surface.load_film(URL)
    push(surface, 'film', libmpv.EVENT_PLAYBACK_RESTART)  # Decoded, armed, never composited.
    return surface, failed


def test_frame_watch_runs_after_initialize_gl_and_stops_with_the_prestart():
    surface, failed = stalled_surface()
    assert surface.view.initialized and surface.frame_watch.isActive()
    assert cinema.FRAME_STALL_MS < cinema.FRAME_PRESENT_LIMIT_MS == cinema.GL_EXPOSE_LIMIT_MS
    surface.phase = 'film'
    surface._check_frames()
    assert not surface.frame_watch.isActive() and not failed
    surface.load_film(URL)  # A reconnect from the playing film is watched again.
    assert surface.frame_watch.isActive()
    surface.reset()
    assert not surface.frame_watch.isActive()


@pytest.mark.parametrize('state', [{'visible': False}, {'minimized': True}])
def test_a_hidden_or_minimized_window_waits_for_its_frame_without_failing(state):
    surface, failed = stalled_surface()
    surface.view.state.update(state)
    surface.view.age('film', 600)
    surface._check_frames()
    assert not failed and surface.phase == 'warmup' and surface.frame_watch.isActive()
    surface.shutdown()


def test_an_unpresented_window_waits_requests_repaints_and_says_why_once(caplog):
    surface, failed = stalled_surface()
    surface.view.state['exposed'] = False  # Locked / blanked screen: no Wayland frame callbacks.
    surface.view.age('film', 600)
    with caplog.at_level('WARNING', logger='kinosota'):
        surface._check_frames()
        surface._check_frames()
    assert not failed and surface.phase == 'warmup' and surface.view.kicks == 2
    stalls = [r for r in caplog.records if 'not on screen' in r.getMessage()]
    assert len(stalls) == 1 and 'not presenting the window' in stalls[0].getMessage()
    surface.shutdown()


def test_an_exposed_window_that_never_paints_falls_back_after_the_limit():
    surface, failed = stalled_surface()
    surface.view.age('film', cinema.FRAME_STALL_MS / 1000 + 0.5)
    surface._check_frames()
    assert not failed and surface.view.kicks == 1  # First a repaint is requested again.
    surface.view.age('film', 600)
    surface._presentable_since = time.monotonic() - cinema.FRAME_PRESENT_LIMIT_MS / 1000 - 1
    surface._check_frames()
    assert failed and 'no film frame reached the screen' in failed[0] and 'exposed True' in failed[0]
    assert surface.phase == 'unavailable' and surface.film_exit_code() == 2  # The engine falls back.


def test_the_limit_counts_from_when_the_window_became_presentable_again():
    surface, failed = stalled_surface()
    surface.view.state['exposed'] = False
    surface.view.age('film', 600)
    surface._check_frames()
    surface.view.state['exposed'] = True  # The viewer unlocks the screen after ten minutes.
    surface._check_frames()
    assert not failed and surface.phase == 'warmup'


def test_a_composited_frame_ends_the_stall():
    surface, failed = stalled_surface()
    surface.view.age('film', 5)
    surface._check_frames()
    assert surface._frame_stall is not None
    surface.view.composite('film')
    surface._check_frames()
    assert surface._frame_stall is None and not failed
    surface.shutdown()


def test_cinema_view_tracks_decoded_but_uncomposited_layers():
    app()
    view = CinemaView()
    view.attach('film', FakePlayer({}))
    assert view.pending_frames() == {} and view.paint_count == 0
    view.arm('film')
    assert set(view.pending_frames()) == {'film'}
    view.layers['film'].has_frame = True
    assert view.pending_frames() == {}
    view.disarm('film')
    assert view.layers['film'].armed_at is None
    state = view.presentation()
    assert set(state) == {'visible', 'minimized', 'exposed', 'paints', 'last_paint_ms'} and state['paints'] == 0
    view.kick()  # Never raises without a native window.


def test_smoke_pump_runs_the_event_loop_without_sleeping(monkeypatch):
    app()
    monkeypatch.setattr(cinema_smoke.time, 'sleep', lambda s: pytest.fail('blind sleep in the smoke loop'))
    fired = []
    QTimer.singleShot(30, lambda: fired.append(True))
    started = time.monotonic()
    assert cinema_smoke._pump(5.0, lambda: bool(fired)) is True
    assert time.monotonic() - started < 2.0
    assert cinema_smoke._pump(0.05, lambda: False) is False
    assert cinema_smoke._pump(0.05) is True

    def broken():
        raise ValueError('until failed')
    with pytest.raises(ValueError):
        cinema_smoke._pump(1.0, broken)


def test_smoke_pass_requires_preroll_dissolve_and_flowing_frames():
    assert cinema_smoke.MIN_FLOWING_PAINTS >= 8
    source = open(cinema_smoke.__file__, encoding='utf-8').read()
    for name in ('preroll_started', 'film_reached', 'frames_flowing'):
        assert f"'{name}'" in source.split('required = (')[1].split(')')[0]


def test_application_quit_is_not_vetoed_by_the_launch_screen():
    qt = app()
    for widget in qt.topLevelWidgets():
        widget.hide()
    splash = DirectLaunchSplash()
    stopped = []
    splash._stop_media = lambda: stopped.append(True)
    splash.show()
    cancelled = []
    splash.cancelRequested.connect(lambda: cancelled.append(True))
    QTimer.singleShot(50, qt.quit)
    QTimer.singleShot(4000, lambda: qt.exit(7))  # Safety net: 0.2.4 stayed in exec() here.
    assert qt.exec() == 0
    assert stopped and not cancelled and not splash.isVisible()
    QApplication.processEvents()  # The quit settled: Alt+F4 cancels the launch again.
    splash.show()
    event = QCloseEvent()
    splash.closeEvent(event)
    assert not event.isAccepted() and cancelled
    splash.dismiss()
