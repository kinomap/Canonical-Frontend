"""Intro per desktop environment (player_telegram / player_torrents) and Intro -> Pre-roll -> film."""
import json
import time

import httpx

from kinosota_player import ads, cinema, libmpv
from kinosota_player.intro_source import BUNDLED, DISABLED, IntroSource, sanitize_config, target_for
from test_cinema import make_surface, push

ORIGIN = 'https://watch.scenrix.com'
URL = 'https://media.example/film.mkv'
AD_URL = 'https://media.example/ads/clip.mp4'
MOVIE = '0b1f3c3e-2f4f-4a51-9d8f-4f2e7c2b9a10'
DELIVERY = '6f1d8e7a-3c2b-4a1d-8e9f-0a1b2c3d4e5f'


def config(**targets):
    full = {'browser_telegram': True, 'player_telegram': True, 'browser_torrents': True, 'player_torrents': True}
    full.update(targets)
    return {'enabled': any(full.values()), 'targets': full, 'is_custom': False, 'version': 'default',
            'video_url': '/static/intro.mp4', 'still_url': '/static/intro.jpg'}


def source(tmp_path, answer):
    def handler(request):
        return httpx.Response(200, json=answer)
    intro = IntroSource(ORIGIN, tmp_path, transport=httpx.MockTransport(handler), refresh_interval=0)
    assert intro.refresh() is True
    return intro


def test_launch_environment_is_told_apart_by_tmdb_id():
    assert target_for({'kind': 'movie', 'movie_id': MOVIE}) == 'player_telegram'
    assert target_for({'kind': 'movie', 'tmdb_id': 603}) == 'player_torrents'
    assert target_for({'kind': 'tv', 'tmdb_id': 1399, 'season': 1, 'episode': 2}) == 'player_torrents'
    assert target_for(None) == 'player_telegram'


def test_each_desktop_target_is_honoured_and_remembered(tmp_path):
    intro = source(tmp_path, config(player_telegram=False))
    assert intro.current('player_telegram') == DISABLED
    assert intro.current('player_torrents') == BUNDLED
    assert intro.player_targets() == {'player_telegram': False, 'player_torrents': True}
    again = IntroSource(ORIGIN, tmp_path, network=False)  # Offline next start: the saved answer is used.
    assert again.current('player_telegram') == DISABLED and again.current('player_torrents') == BUNDLED


def test_an_old_server_without_targets_follows_enabled(tmp_path):
    assert sanitize_config({'enabled': False, 'is_custom': False})['targets']['player_torrents'] is False
    intro = source(tmp_path, {'enabled': True, 'is_custom': False})
    assert intro.current('player_telegram') == BUNDLED and intro.current('player_torrents') == BUNDLED


def surface_for(tmp_path, answer):
    surface, events = make_surface()
    surface.intro = source(tmp_path, answer)
    surface.intro.network = False
    return surface, events


def test_a_switched_off_target_plays_no_intro_and_starts_the_film_on_its_first_frame(tmp_path):
    surface, events = surface_for(tmp_path, config(player_torrents=False))
    surface.set_intro_target('player_torrents')
    assert surface.present() is True and 'intro' not in surface.handles
    surface.load_film(URL)
    push(surface, 'film', libmpv.EVENT_PLAYBACK_RESTART)
    surface._frame_ready('film')
    assert surface.phase == 'film' and events == [('filmStarted',), ('filmDissolved',)]
    surface.shutdown()


def test_an_enabled_target_keeps_the_intro(tmp_path):
    surface, _ = surface_for(tmp_path, config(player_torrents=False))
    surface.set_intro_target('player_telegram')
    surface.present()
    assert surface.handles['intro'].commands == [('loadfile', str(cinema.INTRO_VIDEO))]
    surface.shutdown()


def test_a_website_launch_decides_the_intro_once_it_names_its_stream(tmp_path):
    # Targets differ: the still holds until the launch is redeemed, then only the right intro plays.
    surface, _ = surface_for(tmp_path, config(player_telegram=False))
    surface.present()
    assert 'intro' not in surface.handles and surface.phase == 'intro'
    surface.set_intro_target('player_torrents')
    assert surface.handles['intro'].commands == [('loadfile', str(cinema.INTRO_VIDEO))]
    surface.shutdown()
    # Both on: the intro starts at once; a target switched off drops it before the film.
    surface, _ = surface_for(tmp_path, config(player_telegram=False, player_torrents=False, browser_telegram=True))
    surface.present()
    assert 'intro' not in surface.handles
    surface.shutdown()
    surface, _ = surface_for(tmp_path, config())
    surface.present()
    assert 'intro' in surface.handles
    surface.set_intro_target('player_telegram')
    assert 'intro' in surface.handles  # Still on: the clip on screen is never swapped.
    surface.shutdown()


def ready_film(surface):
    surface.load_film(URL)
    surface.presented_at = time.monotonic() - cinema.MIN_INTRO_MS / 1000 - 1
    surface.handles['film'].props['demuxer-cache-duration'] = 5.0
    push(surface, 'film', libmpv.EVENT_PLAYBACK_RESTART)
    surface._frame_ready('film')


def test_intro_then_preroll_then_film_with_the_cross_dissolve(tmp_path):
    surface, events = surface_for(tmp_path, config())
    surface.set_intro_target('player_telegram')
    surface.present()
    seen = []
    token = surface.expect_preroll()
    ready_film(surface)
    assert surface.phase == 'warmup' and events == []  # The film waits for the planned ad.
    surface.presented_at = time.monotonic() - 1  # The intro has run only 1 s so far.
    assert surface.queue_preroll(token, AD_URL, duration=10, on_start=lambda: seen.append('start'),
                                 on_end=seen.append) is True
    intro, ad = surface.handles['intro'], surface.handles['ad']
    # The ad warms up in its own core, paused and invisible under the intro: the intro decoder is never replaced.
    assert ad.commands == [('loadfile', AD_URL)] and ad.props['pause'] is True
    assert surface.view.alpha('ad') == 0.0 and surface.view.alpha('intro') == 1.0
    assert not any(c[:2] == ('loadfile', AD_URL) for c in intro.commands)
    push(surface, 'ad', libmpv.EVENT_PLAYBACK_RESTART)  # First ad frame decoded.
    surface._ad_tick()
    assert surface.preroll_state() == 'queued' and seen == []  # The intro always runs its 5 s minimum first.
    surface.presented_at = time.monotonic() - cinema.MIN_INTRO_MS / 1000 - 0.05
    surface._ad_tick()
    # 5 s are over: the warmed-up Pre-roll starts at once WITH sound, the intro cross-fades away over it.
    assert surface.preroll_state() == 'playing' and seen == ['start']
    assert ad.props['pause'] is False and ad.props['volume'] == cinema.INTRO_VOLUME and ad.props['mute'] is False
    assert surface.view.alpha('ad') == 1.0 and 'intro' in surface.handles
    surface.ad_fade.setCurrentTime(cinema.AD_CROSSFADE_MS // 2)
    assert 0.0 < surface.view.alpha('intro') < 1.0
    surface.ad_fade.setCurrentTime(cinema.AD_CROSSFADE_MS)
    assert 'intro' not in surface.handles
    surface._check_ready()
    assert surface.phase == 'warmup'  # Never over the ad.
    ad.props['eof-reached'] = True
    surface._ad_tick()
    assert seen == ['start', 'completion'] and surface.phase == 'dissolve'
    # Straight from the ad to the film: the intro is never loaded again.
    assert 'intro' not in surface.handles
    surface.dissolve.setCurrentTime(cinema.DISSOLVE_MS)
    assert surface.phase == 'film' and 'intro' not in surface.handles and 'ad' not in surface.handles
    surface.shutdown()


def test_a_preroll_waits_for_its_first_frame_and_a_creative_that_never_decodes_is_dropped(tmp_path):
    surface, _ = surface_for(tmp_path, config())
    surface.set_intro_target('player_telegram')
    surface.present()
    token = surface.expect_preroll()
    surface.presented_at = time.monotonic() - cinema.MIN_INTRO_MS / 1000 - 0.05
    surface.queue_preroll(token, AD_URL, duration=5)
    surface._ad_tick()
    assert surface.preroll_state() == 'queued'  # 5 s over, but the ad has no decoded frame yet: the intro plays on.
    surface._ad['queued_at'] -= cinema.AD_LOAD_TIMEOUT_S + 0.1
    surface._ad_tick()
    assert surface.preroll_state() == 'done' and 'ad' not in surface.handles and 'intro' in surface.handles
    surface.shutdown()


def test_a_preroll_that_ends_before_the_film_is_ready_never_brings_the_intro_back(tmp_path):
    surface, _ = surface_for(tmp_path, config())
    surface.set_intro_target('player_telegram')
    surface.present()
    token = surface.expect_preroll()
    surface.presented_at = time.monotonic() - cinema.MIN_INTRO_MS / 1000 - 0.05
    surface.queue_preroll(token, AD_URL, duration=5)
    ad = surface.handles['ad']
    push(surface, 'ad', libmpv.EVENT_PLAYBACK_RESTART)
    assert surface.preroll_state() == 'playing'
    surface.ad_fade.setCurrentTime(cinema.AD_CROSSFADE_MS)
    assert 'intro' not in surface.handles
    ad.props['eof-reached'] = True
    surface._ad_tick()
    assert surface.preroll_state() == 'done' and 'ad' in surface.handles  # Its last frame holds the screen.
    ready_film(surface)
    assert 'intro' not in surface.handles  # No intro (or its clip) after the ad.
    assert surface.phase == 'dissolve'  # The film takes over from the ad's last frame.
    surface.shutdown()


def test_without_intro_the_preroll_starts_at_once_and_a_broken_ad_never_blocks_the_film(tmp_path):
    surface, events = surface_for(tmp_path, config(player_torrents=False))
    surface.set_intro_target('player_torrents')
    surface.present()
    token = surface.expect_preroll()
    surface.queue_preroll(token, AD_URL, duration=5)
    assert 'intro' not in surface.handles and surface.handles['ad'].commands == [('loadfile', AD_URL)]
    push(surface, 'ad', libmpv.EVENT_PLAYBACK_RESTART)
    assert surface.preroll_state() == 'playing'
    ready_film(surface)
    assert surface.phase == 'warmup'
    push(surface, 'ad', libmpv.EVENT_END_FILE, reason=libmpv.END_ERROR, error=-13)
    assert surface.phase == 'dissolve' and events[0] == ('filmStarted',)
    surface.shutdown()


def test_no_preroll_or_a_slow_ad_service_releases_the_film(tmp_path):
    surface, _ = surface_for(tmp_path, config())
    surface.present()
    token = surface.expect_preroll()
    ready_film(surface)
    assert surface.phase == 'warmup'
    surface.cancel_preroll(token)
    assert surface.phase == 'dissolve'
    surface.shutdown()
    surface, _ = surface_for(tmp_path, config())
    surface.present()
    token = surface.expect_preroll()
    ready_film(surface)
    surface.film_frame_at -= cinema.AD_WAIT_MS / 1000 + 0.1
    surface._check_ready()
    assert surface.phase == 'dissolve' and surface.queue_preroll(token, AD_URL) is False  # Too late: dropped.
    surface.shutdown()


class FakeApi:
    def __init__(self, plan, ad=None):
        self.token, self.plan, self.ad, self.calls = 'session', plan, ad, []

    def request(self, method, path, body=None):
        self.calls.append((method, path, body))
        if path.startswith('/ads/plan'):
            return self.plan
        if path == '/ads/prepare':
            return {'ad': self.ad}
        return {}


def test_ad_plan_asks_the_desktop_surface_of_the_stream():
    assert ads.plan_path({'kind': 'movie', 'movie_id': MOVIE}) == f'/ads/plan/movie/{MOVIE}?surface=player_telegram'
    assert ads.plan_path({'kind': 'movie', 'tmdb_id': 603}) == '/ads/plan/torrent/movie/603?surface=player_torrents'
    assert ads.plan_path({'kind': 'tv', 'tmdb_id': 1399, 'season': 1, 'episode': 2}) == \
        '/ads/plan/torrent/tv/1399?surface=player_torrents&season=1&episode=2'
    assert ads.plan_path({'kind': 'movie', 'movie_id': 'nonsense'}) is None


def test_fetch_preroll_prepares_only_the_first_pre_cue():
    ad = {'delivery_id': DELIVERY, 'media_url': AD_URL, 'duration_sec': 12, 'skip_after': None}
    api = FakeApi({'cue_points': [{'id': 'mid-half', 'kind': 'mid'}, {'id': 'pre', 'kind': 'pre'}], 'plan_token': 't'}, ad)
    result = ads.fetch_preroll(api, {'kind': 'movie', 'tmdb_id': 603})
    assert result == ads.Preroll(DELIVERY, AD_URL, 12.0)
    assert api.calls[-1] == ('POST', '/ads/prepare', {'plan_token': 't', 'cue_id': 'pre'})
    assert ads.report(api, result, 'impression') is True
    assert api.calls[-1] == ('POST', f'/ads/events/{DELIVERY}', {'event': 'impression'})


def test_no_ad_without_a_pre_cue_a_session_or_a_safe_url():
    assert ads.fetch_preroll(FakeApi({'cue_points': [], 'plan_token': None}), {'kind': 'movie', 'tmdb_id': 1}) is None
    signed_out = FakeApi({'cue_points': [{'id': 'pre', 'kind': 'pre'}], 'plan_token': 't'})
    signed_out.token = ''
    assert ads.fetch_preroll(signed_out, {'kind': 'movie', 'tmdb_id': 1}) is None and signed_out.calls == []
    unsafe = FakeApi({'cue_points': [{'id': 'pre', 'kind': 'pre'}], 'plan_token': 't'},
                     {'delivery_id': DELIVERY, 'media_url': 'http://evil/ad.mp4', 'duration_sec': 5})
    assert ads.fetch_preroll(unsafe, {'kind': 'movie', 'tmdb_id': 1}) is None
    assert json.dumps(ads.EVENTS)
