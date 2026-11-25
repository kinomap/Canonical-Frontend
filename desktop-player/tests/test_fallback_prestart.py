"""0.2.6: external mpv fallback still enforces Intro -> Pre-roll -> film on initial launches."""
import os
os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')
from pathlib import Path
from types import SimpleNamespace

from PySide6.QtWidgets import QApplication

import kinosota_player.app as app_module
import kinosota_player.direct as direct_module
import kinosota_player.fallback as fallback_module
from kinosota_player.ads import Preroll
from kinosota_player.engine import Mpv
from kinosota_player.intro_source import IntroChoice


def _app():
    return QApplication.instance() or QApplication([])


class FakeMpv(Mpv):
    """Mpv subclass that records local/stream loads, IPC property updates, and simulated EOF."""
    def __init__(self, *, exit_after_start=None, eof_after_polls=2):
        super().__init__(executable='mpv')
        self.events = []
        self.props = {}
        self.is_alive = False
        self._exit_code = None
        self.eof_after_polls = eof_after_polls
        self.exit_after_start = exit_after_start
        self._ad_polls = 0
        self._loaded_url = ''

    def alive(self):
        return self.is_alive

    def exit_code(self):
        return self._exit_code

    def start_local(self, path, *, extra_args=(), idle='yes'):
        self.is_alive = True
        self._loaded_url = str(path)
        self.events.append(('start_local', Path(path).name, idle, tuple(extra_args)))

    def start(self, url, *, extra_args=()):
        self.is_alive = True
        self._loaded_url = url
        self.events.append(('start', url, tuple(extra_args)))

    def set_property(self, name, value):
        self.props[name] = value
        self.events.append(('set_property', name, value))

    def command(self, cmd):
        self.events.append(('command', list(cmd)))
        if cmd[:1] == ['loadfile']:
            self._loaded_url = cmd[1]
            self._ad_polls = 0

    def enable_osc(self):
        self.events.append(('enable_osc',))

    def wait_playback_started(self, timeout=30, *, cancelled=lambda: False, interval=0.1, sleep=lambda _s: None, clock=lambda: 0.0, show_osc=True):
        self.events.append(('wait_playback_started', show_osc))
        if self.exit_after_start and self.exit_after_start in self._loaded_url:
            self.is_alive = False
            self._exit_code = 0
            return 'exited'
        if show_osc:
            self.enable_osc()
        return 'playing'

    def property(self, name):
        if name == 'eof-reached':
            self._ad_polls += 1
            return self._ad_polls >= self.eof_after_polls
        return None

    def stop(self):
        self.is_alive = False
        self._exit_code = 0
        self.events.append(('stop',))


def _fast_timings(monkeypatch):
    monkeypatch.setattr(fallback_module, 'MIN_INTRO_MS', 20)
    monkeypatch.setattr(fallback_module, 'AD_WAIT_MS', 200)
    monkeypatch.setattr(fallback_module, 'POLL_INTERVAL_S', 0.005)


def test_fallback_plays_intro_then_preroll_then_film(tmp_path, monkeypatch):
    _fast_timings(monkeypatch)
    intro_file = tmp_path / 'intro.mp4'
    intro_file.write_bytes(b'ftyp')
    intro_choice = IntroChoice(True, 'v1', intro_file, intro_file, intro_file)
    intro_src = SimpleNamespace(current=lambda target: intro_choice, refresh_async=lambda force=True: None)
    ad = Preroll('11111111-1111-1111-1111-111111111111', 'https://cdn.example/ad.mp4', 5.0)
    telemetry = []
    visual = []
    engine = FakeMpv()

    res = fallback_module.play_with_fallback_prestart(
        engine,
        api=object(),
        meta={'kind': 'movie', 'movie_id': '22222222-2222-2222-2222-222222222222'},
        resolve_film=lambda: ('https://cdn.example/film.mp4', {'session_id': 'sess-1'}),
        film_args=['--alang=rus,ru', '--aid=2', '--force-media-title=Matrix'],
        win_args=['--fullscreen'],
        on_visual_start=lambda: visual.append(True),
        intro=intro_src,
        fetch_ad=lambda _api, _meta: ad,
        report=lambda _api, reported_ad, event: telemetry.append((reported_ad.delivery_id, event)),
    )

    assert res.started and res.film_payload == {'session_id': 'sess-1'} and visual == [True]
    names = [ev[0] for ev in engine.events]
    assert names[0] == 'start_local'
    assert ('command', ['loadfile', 'https://cdn.example/ad.mp4', 'replace']) in engine.events
    assert ('command', ['loadfile', 'https://cdn.example/film.mp4', 'replace']) in engine.events
    ad_idx = engine.events.index(('command', ['loadfile', 'https://cdn.example/ad.mp4', 'replace']))
    film_idx = engine.events.index(('command', ['loadfile', 'https://cdn.example/film.mp4', 'replace']))
    assert 0 < ad_idx < film_idx
    assert engine.props['keep-open'] == 'no' and engine.props['idle'] == 'once' and engine.props['panscan'] == '0'
    assert engine.props['alang'] == 'rus,ru' and engine.props['aid'] == 2 and engine.props['force-media-title'] == 'Matrix'
    assert telemetry == [(ad.delivery_id, 'impression'), (ad.delivery_id, 'completion')]


def test_fallback_plays_preroll_even_when_intro_disabled(tmp_path, monkeypatch):
    _fast_timings(monkeypatch)
    disabled = IntroChoice(False, 'disabled', tmp_path / 'none.mp4', tmp_path / 'none.mp4', tmp_path / 'none.mp4')
    intro_src = SimpleNamespace(current=lambda target: disabled)
    ad = Preroll('11111111-1111-1111-1111-111111111111', 'https://cdn.example/ad.mp4', 4.0)
    telemetry = []
    engine = FakeMpv()

    res = fallback_module.play_with_fallback_prestart(
        engine,
        api=object(),
        meta={'kind': 'movie', 'movie_id': '22222222-2222-2222-2222-222222222222'},
        resolve_film='https://cdn.example/film.mp4',
        intro=intro_src,
        fetch_ad=lambda _api, _meta: ad,
        report=lambda _api, _ad, event: telemetry.append(event),
    )

    assert res.started
    assert engine.events[0][:2] == ('start', 'https://cdn.example/ad.mp4')
    assert ('command', ['loadfile', 'https://cdn.example/film.mp4', 'replace']) in engine.events
    assert telemetry == ['impression', 'completion']


def test_fallback_aborts_cleanly_if_viewer_closes_mpv_during_intro(tmp_path, monkeypatch):
    _fast_timings(monkeypatch)
    intro_file = tmp_path / 'intro.mp4'
    intro_file.write_bytes(b'ftyp')
    intro_choice = IntroChoice(True, 'v1', intro_file, intro_file, intro_file)
    intro_src = SimpleNamespace(current=lambda target: intro_choice)
    cleaned = []
    engine = FakeMpv(exit_after_start='intro.mp4')

    res = fallback_module.play_with_fallback_prestart(
        engine,
        api=object(),
        meta={'kind': 'movie', 'movie_id': '22222222-2222-2222-2222-222222222222'},
        resolve_film=lambda: ('https://cdn.example/film.mp4', {'session_id': 'sess-clean'}),
        on_cleanup_film=lambda payload: cleaned.append(payload),
        intro=intro_src,
        fetch_ad=lambda _api, _meta: None,
        report=lambda *_args: None,
    )

    assert not res.started and res.aborted_by_viewer
    assert ('command', ['loadfile', 'https://cdn.example/film.mp4', 'replace']) not in engine.events
    assert cleaned == [{'session_id': 'sess-clean'}]


def test_window_routes_all_paths_through_fallback_when_cinema_unavailable(monkeypatch):
    from test_resilience import CatalogApi, Vault, sync
    _app()
    monkeypatch.setattr(app_module, 'create_surface', lambda *a, **kw: None)
    monkeypatch.setattr(app_module, 'Mpv', FakeMpv)

    calls = []

    def fake_prestart(engine, api, meta, resolve_film, **kwargs):
        calls.append(('fallback', meta.get('kind')))
        res = resolve_film()
        url, payload = res if isinstance(res, tuple) else (res, None)
        engine.start(url, extra_args=list(kwargs.get('film_args') or ()))
        return fallback_module.FallbackResult(started=True, film_payload=payload)

    monkeypatch.setattr(app_module, 'play_with_fallback_prestart', fake_prestart)

    api = CatalogApi()
    api.start = lambda _mid: {'session_id': 's1', 'media_url': 'https://watch.scenrix.com/m.mp4'}
    api.torrent_ticket = lambda *_a: {'stream_url': 'https://watch.scenrix.com/t.mp4'}
    api.start_series_playback = lambda _eid: {'media_url': 'https://watch.scenrix.com/e.mp4'}

    w = app_module.Window(api=api, engine=None, vault=Vault(), restore=False)
    w.work = sync
    assert w.cinema is None and isinstance(w.engine, FakeMpv) and w._cinema_enabled

    w.start_movie({'id': 'm1', 'title': 'Movie'})
    w.play_torrent({'kind': 'movie', 'tmdb_id': 1, 'title': 'Torrent'})
    w.play_episode({'series': {'title': 'Series'}, 'season': 1, 'episode': {'id': 'e1', 'episode_number': 1}})
    monkeypatch.setattr(app_module, 'stream_of', lambda _m: 'https://watch.scenrix.com/d.mp4')
    w.play_stream({'kind': 'movie', 'title': 'Direct', 'stream_url': 'https://watch.scenrix.com/d.mp4'}, attempt=0)
    assert calls == [('fallback', 'movie'), ('fallback', 'movie'), ('fallback', 'episode'), ('fallback', 'movie')]

    # Reconnect (attempt > 0) must NOT replay the fallback commercial prestart.
    calls.clear()
    w.play_stream({'kind': 'movie', 'title': 'Direct', 'stream_url': 'https://watch.scenrix.com/d.mp4'}, attempt=1)
    assert calls == []
    w.close()


def test_direct_player_runs_fallback_after_gl_failure_and_uses_grant(monkeypatch):
    _app()
    monkeypatch.setattr(direct_module, 'create_surface', lambda *a, **kw: None)
    monkeypatch.setattr(direct_module, 'Mpv', FakeMpv)

    seen = []

    def fake_prestart(engine, api, meta, resolve_film, **kwargs):
        seen.append(('prestart', getattr(kwargs.get('ad_api'), 'token', ''), meta.get('title')))
        url = resolve_film()
        engine.start(url)
        kwargs['on_visual_start']()
        return fallback_module.FallbackResult(started=True)

    monkeypatch.setattr(direct_module, 'play_with_fallback_prestart', fake_prestart)

    class GrantApi:
        def __init__(self):
            self.token = ''
        def open_launch(self, _lid):
            return {
                'kind': 'movie',
                'tmdb_id': 42,
                'title': 'Inception',
                'access_token': 'grant-xyz',
                'stream_url': 'https://watch.scenrix.com/stream/11111111-1111-1111-1111-111111111111',
            }
        def close(self):
            pass

    def sync(fn, done, fail):
        try:
            done(fn())
        except Exception as err:
            fail(err)

    dp = direct_module.DirectPlayer(api_factory=GrantApi, worker=sync)
    assert dp.cinema is None and dp._cinema_enabled and type(dp.engine) is FakeMpv
    dp.open_link('kinosota://watch?launch=11111111-1111-1111-1111-111111111111')
    assert seen == [('prestart', 'grant-xyz', 'Inception')]
    assert dp.playing

    # Reconnect attempt > 0 must NOT replay intro or ad.
    seen.clear()
    dp._start_attempt(dp.generation, 1)
    assert seen == []
    dp.shutdown()
