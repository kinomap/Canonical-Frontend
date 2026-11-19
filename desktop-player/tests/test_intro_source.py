"""Dynamic prestart intro (admin CMS) in the desktop player: instant local choice, background cache, fallbacks."""
import os
os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')
import json
import threading
import time

import httpx
import pytest

from kinosota_player import cinema, intro_source, libmpv
from kinosota_player.intro_source import BUNDLED, DISABLED, IntroChoice, IntroSource, sanitize_config

from test_cinema import URL, make_surface, push

ORIGIN = 'https://watch.scenrix.com'
VERSION = '0123456789abcdef'
MP4 = b'\x00\x00\x00\x20ftypisom' + b'\x00' * 4096
JPG = b'\xff\xd8\xff\xe0' + b'\x00' * 512


def custom_config(enabled=True, version=VERSION, host=ORIGIN):
    prefix = f'{host}/media/cinema-intro/{version}'
    return {'enabled': enabled, 'version': version, 'video_url': prefix + '.mp4', 'webm_url': None,
            'still_url': prefix + '-still.jpg', 'poster_url': prefix + '-poster.jpg', 'duration_ms': 5000, 'is_custom': True}


def default_config(enabled=True):
    return {'enabled': enabled, 'version': 'default-v1', 'video_url': ORIGIN + '/cinema/intro/kinosota-intro-v1.mp4',
            'webm_url': None, 'still_url': ORIGIN + '/cinema/intro/kinosota-intro-v1.jpg',
            'poster_url': ORIGIN + '/cinema/intro/kinosota-intro-v1.jpg', 'duration_ms': 14933, 'is_custom': False}


class Server:
    """httpx.MockTransport backend: /api/v1/cinema/intro plus the media files."""

    def __init__(self, config, files=None, etag='"v1"'):
        self.config, self.etag, self.requests = config, etag, []
        self.files = files if files is not None else {
            f'/media/cinema-intro/{VERSION}.mp4': MP4, f'/media/cinema-intro/{VERSION}-poster.jpg': JPG,
            f'/media/cinema-intro/{VERSION}-still.jpg': JPG}
        self.gate = None  # threading.Event: hold the config answer (slow network).

    def __call__(self, request):
        self.requests.append(request)
        if request.url.path == '/api/v1/cinema/intro':
            if self.gate is not None:
                self.gate.wait(5)
            if self.etag and request.headers.get('if-none-match') == self.etag:
                return httpx.Response(304)
            return httpx.Response(200, json=self.config, headers={'ETag': self.etag} if self.etag else {})
        body = self.files.get(request.url.path)
        if body is None:
            return httpx.Response(404)
        return httpx.Response(200, content=body)


def source(tmp_path, server, **kw):
    return IntroSource(ORIGIN, tmp_path / 'intro', transport=httpx.MockTransport(server), **kw)


def offline(request):
    raise httpx.ConnectError('offline', request=request)


# Resolver -------------------------------------------------------------------------------------------------------
def test_default_cache_location_is_the_user_cache(monkeypatch, tmp_path):
    monkeypatch.delenv('KINOSOTA_INTRO_CACHE_DIR', raising=False)
    monkeypatch.setenv('XDG_CACHE_HOME', str(tmp_path))
    monkeypatch.setattr(intro_source.sys, 'platform', 'linux')
    assert intro_source.default_cache_dir() == tmp_path / 'kinosota' / 'intro'
    monkeypatch.delenv('XDG_CACHE_HOME')
    assert intro_source.default_cache_dir() == intro_source.Path.home() / '.cache' / 'kinosota' / 'intro'


def test_first_start_plays_the_bundled_intro_without_touching_the_network(tmp_path):
    server = Server(custom_config())
    intro = source(tmp_path, server)
    started = time.monotonic()
    assert intro.current() == BUNDLED and BUNDLED.video.is_file() and BUNDLED.video.name == 'kinosota-intro.mp4'
    assert time.monotonic() - started < 0.05 and server.requests == []


def test_custom_intro_is_cached_by_version_and_used_from_the_next_launch(tmp_path):
    server = Server(custom_config())
    intro = source(tmp_path, server)
    assert intro.refresh() is True
    choice = intro.current()
    assert choice.custom and choice.enabled and choice.version == VERSION
    assert choice.video == tmp_path / 'intro' / f'{VERSION}.mp4' and choice.video.read_bytes() == MP4
    assert choice.first_frame.name == f'{VERSION}-poster.jpg' and choice.still.name == f'{VERSION}-still.jpg'
    assert not list((tmp_path / 'intro').glob('*.part'))
    # A restart (even offline) remembers the answer and reuses the cached clip.
    again = IntroSource(ORIGIN, tmp_path / 'intro', transport=httpx.MockTransport(offline))
    assert again.current() == choice and again.refresh() is False and again.current() == choice


def test_a_clip_still_downloading_never_delays_the_launch(tmp_path):
    server = Server(custom_config())
    server.gate = threading.Event()
    intro = source(tmp_path, server)
    thread = intro.refresh_async()
    assert thread is not None and thread.daemon
    started = time.monotonic()
    assert intro.current() == BUNDLED and time.monotonic() - started < 0.05  # Slow network: bundled, instantly.
    assert intro.refresh_async() is None  # One refresh at a time.
    server.gate.set()
    thread.join(5)
    assert intro.current().custom


def test_disabled_intro_is_honoured_and_remembered_offline(tmp_path):
    intro = source(tmp_path, Server(custom_config(enabled=False)))
    assert intro.refresh() is True and intro.current() == DISABLED and not DISABLED.enabled
    restarted = IntroSource(ORIGIN, tmp_path / 'intro', transport=httpx.MockTransport(offline))
    assert restarted.current() == DISABLED


def test_offline_server_errors_and_garbage_keep_the_previous_choice(tmp_path):
    assert source(tmp_path, offline).refresh() is False
    assert source(tmp_path, offline).current() == BUNDLED
    intro = source(tmp_path, Server(custom_config()))
    intro.refresh()
    cached = intro.current()
    for answer in (httpx.Response(503), httpx.Response(200, content=b'not json'), httpx.Response(200, json={'enabled': 'yes'})):
        broken = IntroSource(ORIGIN, tmp_path / 'intro', transport=httpx.MockTransport(lambda request, a=answer: a))
        assert broken.refresh() is False and broken.current() == cached


@pytest.mark.parametrize('mutate', [
    lambda c: c.update(video_url='https://evil.example/media/cinema-intro/%s.mp4' % VERSION),
    lambda c: c.update(video_url='http://watch.scenrix.com/media/cinema-intro/%s.mp4' % VERSION),
    lambda c: c.update(video_url=ORIGIN + '/media/cinema-intro/../../etc/passwd'),
    lambda c: c.update(video_url=ORIGIN + '/media/cinema-intro/other.mp4'),
    lambda c: c.update(still_url=ORIGIN + '/media/cinema-intro/%s-still.jpg?x=1' % VERSION),
    lambda c: c.update(version='../escape'),
    lambda c: c.update(version='a' * 80),
])
def test_untrusted_urls_and_versions_are_rejected(mutate):
    config = custom_config()
    mutate(config)
    assert sanitize_config(config, ORIGIN) is None


def test_relative_urls_are_resolved_against_the_api_origin():
    config = custom_config()
    config['video_url'] = f'/media/cinema-intro/{VERSION}.mp4'
    assert sanitize_config(config, ORIGIN)['urls']['video'] == f'{ORIGIN}/media/cinema-intro/{VERSION}.mp4'


@pytest.mark.parametrize('body', [b'<html>error</html>' + b'0' * 100, b''])
def test_a_bad_or_empty_download_is_never_published(tmp_path, body):
    server = Server(custom_config())
    server.files[f'/media/cinema-intro/{VERSION}.mp4'] = body
    intro = source(tmp_path, server)
    assert intro.refresh() is False and intro.current() == BUNDLED
    assert not (tmp_path / 'intro' / f'{VERSION}.mp4').exists() and not list((tmp_path / 'intro').glob('*.part'))


def test_truncated_and_oversized_downloads_are_discarded(tmp_path, monkeypatch):
    def truncated(request):
        if request.url.path.endswith('.mp4'):
            return httpx.Response(200, content=MP4[:100], headers={'Content-Length': str(len(MP4))})
        return Server(custom_config())(request)
    intro = source(tmp_path, truncated)
    assert intro.refresh() is False and intro.current() == BUNDLED
    monkeypatch.setattr(intro_source, 'MAX_VIDEO_BYTES', 1000)
    big = source(tmp_path, Server(custom_config()))
    assert big.refresh() is False and big.current() == BUNDLED
    assert not list((tmp_path / 'intro').glob('*.mp4*'))


def test_reset_to_default_prunes_the_custom_clip_and_switching_versions_keeps_only_the_new_one(tmp_path):
    server = Server(custom_config())
    intro = source(tmp_path, server)
    intro.refresh()
    old = intro.current()
    new = 'fedcba9876543210'
    server.config, server.etag = custom_config(version=new), '"v2"'
    server.files.update({f'/media/cinema-intro/{new}.mp4': MP4, f'/media/cinema-intro/{new}-poster.jpg': JPG,
                         f'/media/cinema-intro/{new}-still.jpg': JPG})
    assert intro.refresh() is True and intro.current().version == new and not old.video.exists()
    server.config, server.etag = default_config(), '"v3"'
    assert intro.refresh() is True and intro.current() == BUNDLED
    assert sorted(p.name for p in (tmp_path / 'intro').iterdir()) == ['state.json']


def test_etag_revalidation_and_refresh_throttling(tmp_path):
    now = [100.0]
    server = Server(custom_config())
    intro = source(tmp_path, server, clock=lambda: now[0])
    intro.refresh()
    calls = len(server.requests)
    assert intro.refresh() is True and server.requests[-1].headers['if-none-match'] == '"v1"'
    assert len(server.requests) == calls + 1 and intro.current().custom  # 304: nothing downloaded again.
    assert intro.refresh_async() is None  # Refreshed just now.
    now[0] += intro_source.REFRESH_INTERVAL_S + 1
    thread = intro.refresh_async()
    assert thread is not None
    thread.join(5)


def test_network_can_be_switched_off_by_environment(tmp_path, monkeypatch):
    monkeypatch.setenv('KINOSOTA_INTRO_DYNAMIC', '0')
    assert intro_source.dynamic_disabled_by_environment()
    intro = IntroSource(ORIGIN, tmp_path, transport=httpx.MockTransport(offline), network=False)
    assert intro.refresh_async() is None and intro.refresh() is False and intro.current() == BUNDLED


def test_quarantine_drops_an_unplayable_clip(tmp_path):
    intro = source(tmp_path, Server(custom_config()))
    intro.refresh()
    intro.quarantine(VERSION)
    assert intro.current() == BUNDLED and not list((tmp_path / 'intro').glob(VERSION + '*'))
    intro.quarantine('../../x')  # Never touches paths outside the cache.


# Cinema surface integration -------------------------------------------------------------------------------------
class FakeIntro:
    def __init__(self, choice):
        self.choice, self.refreshes, self.quarantined = choice, 0, []

    def current(self):
        if isinstance(self.choice, Exception):
            raise self.choice
        return self.choice

    def refresh_async(self, **kw):
        self.refreshes += 1

    def quarantine(self, version):
        self.quarantined.append(version)


def surface_with(choice):
    surface, events = make_surface()
    surface.intro = FakeIntro(choice)
    return surface, events


def cached_choice(tmp_path):
    paths = {}
    for kind, data in (('video', MP4), ('poster', JPG), ('still', JPG)):
        paths[kind] = tmp_path / f'{VERSION}{intro_source.SUFFIXES[kind]}'
        paths[kind].write_bytes(data)
    return IntroChoice(True, VERSION, paths['video'], paths['poster'], paths['still'], True)


def test_surface_plays_the_cached_custom_intro_and_its_own_stills(tmp_path):
    choice = cached_choice(tmp_path)
    surface, _ = surface_with(choice)
    assert surface.present() is True
    assert surface.handles['intro'].commands == [('loadfile', str(choice.video))]
    assert surface.view.posters[-1] == choice.first_frame and surface.intro.refreshes == 1
    surface.load_film(URL)
    surface.presented_at = time.monotonic() - 5
    surface.handles['film'].props['demuxer-cache-duration'] = 5.0
    push(surface, 'film', libmpv.EVENT_PLAYBACK_RESTART)
    surface._frame_ready('film')
    surface.dissolve.setCurrentTime(cinema.DISSOLVE_MS)
    assert surface.phase == 'film' and surface.view.posters[-1] == choice.still
    surface.shutdown()


def test_disabled_intro_goes_straight_to_the_film_on_its_first_frame():
    surface, events = surface_with(DISABLED)
    assert surface.present() is True
    assert 'intro' not in surface.handles and 'film' in surface.handles and surface.phase == 'intro'
    assert surface.view.posters[-1] is None and surface.present() is True  # Plain splash, never the intro's last frame.
    surface.load_film(URL)
    surface.handles['film'].props['demuxer-cache-duration'] = 0.0
    push(surface, 'film', libmpv.EVENT_PLAYBACK_RESTART)
    surface._frame_ready('film')  # No minimum intro exposure, no buffer hold.
    assert surface.phase == 'film' and events == [('filmStarted',), ('filmDissolved',)]
    assert surface.handles['film'].props['pause'] is False and surface.view.alpha('film') == 1.0
    surface.shutdown()


def test_a_broken_intro_source_or_missing_clip_falls_back_to_the_bundled_intro(tmp_path):
    for choice in (RuntimeError('disk'), 'nonsense',
                   IntroChoice(True, VERSION, tmp_path / 'gone.mp4', tmp_path / 'p.jpg', tmp_path / 's.jpg', True)):
        surface, _ = surface_with(choice)
        assert surface.present() is True
        assert surface.intro_choice == BUNDLED
        assert surface.handles['intro'].commands == [('loadfile', str(cinema.INTRO_VIDEO))]
        surface.shutdown()


def test_an_unplayable_cached_clip_switches_to_the_bundled_intro_in_place(tmp_path):
    choice = cached_choice(tmp_path)
    surface, events = surface_with(choice)
    surface.present()
    intro = surface.handles['intro']
    push(surface, 'intro', libmpv.EVENT_END_FILE, reason=libmpv.END_ERROR, error=-13)
    assert intro.commands[-1] == ('loadfile', str(cinema.INTRO_VIDEO)) and surface.intro_choice == BUNDLED
    assert surface.intro.quarantined == [VERSION] and surface.view.posters[-1] == BUNDLED.first_frame
    assert events == [] and surface.phase == 'intro'
    push(surface, 'intro', libmpv.EVENT_END_FILE, reason=libmpv.END_ERROR, error=-13)
    assert len(intro.commands) == 2  # The bundled intro failing is never retried in a loop.
    surface.shutdown()


def test_without_an_intro_source_the_surface_keeps_the_bundled_behaviour():
    surface, _ = make_surface()
    assert surface.intro is None and surface.present() is True and surface.intro_choice == BUNDLED
    surface.shutdown()
