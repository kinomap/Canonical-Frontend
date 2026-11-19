"""Website launch of a KINOSOTA catalogue (Telegram) film: leased inside the direct player, one splash + intro."""
import os

os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')

from PySide6.QtWidgets import QApplication
from kinosota_player.direct import DirectPlayer, catalog_movie_id, lease_url

LAUNCH = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'
MEDIA = 'https://node-1.scenrix.com/stream/11111111-1111-4111-8111-111111111111?token=abc'
META = {'kind': 'movie', 'movie_id': 'film-1', 'title': 'Палмер', 'stream_url': None, 'access_token': 'grant-1'}


def sync(fn, done=None, fail=None):
    try:
        value = fn()
    except Exception as error:
        if fail:
            fail(error)
        return
    if done:
        done(value)


class Engine:
    def __init__(self):
        self.started, self.running = [], False

    def start(self, url, *, extra_args=()):
        self.started.append((url, list(extra_args)))
        self.running = True

    def stop(self):
        self.running = False

    def alive(self):
        return self.running

    def exit_code(self):
        return None if self.running else 0

    def wait_playback_started(self, timeout=30, *, cancelled=lambda: False):
        return 'playing'


class Api:
    def __init__(self, calls, launch=META, session=None):
        self.calls, self.launch, self.token = calls, launch, ''
        self.session = session if session is not None else {
            'session_id': 'lease-1', 'media_url': MEDIA, 'heartbeat_interval_seconds': 20}

    def open_launch(self, launch_id):
        self.calls.append(('open', launch_id, self.token))
        return dict(self.launch)

    def start(self, movie_id):
        self.calls.append(('start', movie_id, self.token))
        return dict(self.session)

    def heartbeat(self, session_id):
        self.calls.append(('heartbeat', session_id, self.token))

    def stop(self, session_id):
        self.calls.append(('stop', session_id, self.token))

    def close(self):
        pass


class Intro:
    def __init__(self):
        self.forced = []

    def refresh_async(self, *, force=False):
        self.forced.append(force)


class Cinema:
    """Only what DirectPlayer touches for a launch without a session grant for ads."""
    def __init__(self):
        from PySide6.QtCore import QObject, Signal

        class Signals(QObject):
            failed = Signal(str)
        self._signals = Signals()
        self.failed = self._signals.failed
        self.intro, self.targets = Intro(), []

    def set_intro_target(self, target):
        self.targets.append(target)

    def expect_preroll(self):
        return 1

    def cancel_preroll(self, _token):
        pass

    def shutdown(self):
        pass


def player(api_launch=META, session=None, cinema=None):
    QApplication.instance() or QApplication([])
    calls = []
    direct = DirectPlayer(api_factory=lambda: Api(calls, api_launch, session), engine=Engine(), worker=sync,
                          show_splash=False, cinema=cinema)
    return direct, calls


def test_only_a_granted_catalogue_launch_is_leased_here():
    assert catalog_movie_id(META) == 'film-1'
    assert catalog_movie_id({**META, 'access_token': ''}) == ''
    assert catalog_movie_id({**META, 'kind': 'tv'}) == ''
    assert catalog_movie_id({**META, 'tmdb_id': 155}) == ''  # A torrent without a stream keeps the old path.
    assert lease_url({'media_url': MEDIA}) == MEDIA
    assert lease_url({'media_url': 'http://node/stream/x'}) == '' and lease_url({}) == ''


def test_telegram_catalogue_launch_plays_in_the_direct_player_without_falling_back():
    direct, calls = player()
    fallback = []
    direct.fallback.connect(fallback.append)
    assert direct.open_link(f'kinosota://watch?launch={LAUNCH}')
    assert fallback == []  # The splash with its intro is never closed and handed to the app window.
    assert ('start', 'film-1', 'grant-1') in calls  # Leased with the launch's own single-use grant.
    assert direct.engine.started and direct.engine.started[0][0] == MEDIA
    assert direct.session_id == 'lease-1' and direct.lease_timer.isActive() and direct.lease_timer.interval() == 20000
    direct._heartbeat()
    assert ('heartbeat', 'lease-1', 'grant-1') in calls
    direct.shutdown()
    assert ('stop', 'lease-1', 'grant-1') in calls and direct.session_id == '' and not direct.lease_timer.isActive()


def test_a_lease_without_a_playable_url_is_released_and_explained():
    direct, calls = player(session={'session_id': 'lease-2', 'media_url': None, 'heartbeat_interval_seconds': 20})
    direct.open_link(f'kinosota://watch?launch={LAUNCH}')
    assert direct.engine.started == [] and ('stop', 'lease-2', 'grant-1') in calls and direct.last_error
    direct.shutdown()


def test_every_launch_forces_a_fresh_intro_config_and_names_the_telegram_environment():
    cinema = Cinema()
    direct, _calls = player(cinema=cinema)
    direct.open_link(f'kinosota://watch?launch={LAUNCH}')
    assert cinema.intro.forced and all(cinema.intro.forced)
    assert cinema.targets == ['player_telegram']
    direct.shutdown()
