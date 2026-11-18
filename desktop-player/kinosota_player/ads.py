"""Pre-roll ads for the desktop player (Ad Studio «Среды показа»: player_telegram / player_torrents).

The launch never waits for the ad service longer than the film needs to warm up:

* ``fetch_preroll(api, meta)`` runs on a worker thread. It asks ``GET /api/v1/ads/plan/...`` with
  ``surface=player_telegram`` (a KINOSOTA catalogue film, no ``tmdb_id``) or
  ``surface=player_torrents`` (a torrent stream, ``tmdb_id`` present), then prepares the first
  Pre-roll cue (``POST /ads/prepare``). The plan holds only ads enabled for that surface.
* ``cinema.CinemaSurface`` plays the prepared clip after the intro: Intro -> Pre-roll -> film.
* ``report(api, ad, event)`` sends impression / completion telemetry; failures never touch playback.

The prestart intro is not an ad: it never comes from here and never takes a Pre-roll slot.
"""
from __future__ import annotations

import logging
import re
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from urllib.parse import quote, urlsplit

from .intro_source import PLAYER_TELEGRAM, PLAYER_TORRENTS, target_for

log = logging.getLogger('kinosota.ads')

MAX_AD_SECONDS = 600.0        # A creative longer than this is a broken answer, not an ad.
EVENTS = ('impression', 'completion', 'skip', 'click')


@dataclass(frozen=True)
class Preroll:
    delivery_id: str
    media_url: str
    duration_sec: float


def surface_for(meta) -> str:
    """Ad Studio surface of a launch; the same rule as the intro target."""
    return target_for(meta)


def _uuid(value):
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        return None


def plan_path(meta):
    """Relative API path of the ad plan for this launch, or None when the title cannot be named."""
    meta = meta if isinstance(meta, dict) else {}
    surface = surface_for(meta)
    if surface == PLAYER_TORRENTS:
        kind = meta.get('kind')
        tmdb_id = meta.get('tmdb_id')
        if kind not in ('movie', 'tv') or type(tmdb_id) is not int or tmdb_id <= 0:
            return None
        path = f'/ads/plan/torrent/{kind}/{tmdb_id}?surface={PLAYER_TORRENTS}'
        season, episode = meta.get('season'), meta.get('episode')
        if kind == 'tv' and type(season) is int and type(episode) is int and season >= 0 and episode >= 0:
            path += f'&season={season}&episode={episode}'
        return path
    kind = meta.get('kind') if meta.get('kind') in ('movie', 'episode') else 'movie'
    target = _uuid(meta.get('movie_id') if kind == 'movie' and meta.get('movie_id') else meta.get('id'))
    if target is None:
        return None
    return f'/ads/plan/{kind}/{target}?surface={quote(PLAYER_TELEGRAM)}'


def _clean(ad):
    if not isinstance(ad, dict):
        return None
    delivery = _uuid(ad.get('delivery_id'))
    url = ad.get('media_url')
    if delivery is None or not isinstance(url, str) or len(url) > 2048:
        return None
    parts = urlsplit(url)
    if parts.scheme != 'https' or not parts.hostname or parts.username or parts.password:
        return None
    try:
        duration = float(ad.get('duration_sec') or 0)
    except (TypeError, ValueError):
        duration = 0.0
    if not 0 < duration <= MAX_AD_SECONDS:
        duration = 0.0
    return Preroll(delivery, url, duration)


@contextmanager
def _session(api):
    """A private client with the same session: ad calls never queue behind (or block) playback calls."""
    from .api import Api
    if type(api) is Api:
        own = Api(api.origin)
        own.token = api.token
        try:
            yield own
        finally:
            own.close()
    else:
        yield api


def fetch_preroll(api, meta):
    """The prepared Pre-roll of this launch, or None (no ad, PRO, offline, signed out, old server...). Blocking."""
    path = plan_path(meta)
    if path is None or api is None or not getattr(api, 'token', ''):
        return None
    with _session(api) as client:
        return _fetch(client, path)


def _fetch(api, path):
    plan = api.request('GET', path)
    if not isinstance(plan, dict):
        return None
    token = plan.get('plan_token')
    cues = plan.get('cue_points') if isinstance(plan.get('cue_points'), list) else []
    first = next((c for c in cues if isinstance(c, dict) and c.get('kind') == 'pre'), None)
    if not token or first is None or not isinstance(first.get('id'), str) or not re.fullmatch(r'[\w:.-]{1,60}', first['id']):
        return None
    prepared = api.request('POST', '/ads/prepare', {'plan_token': token, 'cue_id': first['id']})
    return _clean(prepared.get('ad') if isinstance(prepared, dict) else None)


def report(api, ad, event):
    """Ad telemetry; never raises (a failed report must not fake completion or stop the film)."""
    if api is None or not isinstance(ad, Preroll) or event not in EVENTS:
        return False
    try:
        with _session(api) as client:
            client.request('POST', f'/ads/events/{ad.delivery_id}', {'event': event})
        return True
    except Exception as error:  # noqa: BLE001 - telemetry only
        log.info('Ad %s report failed: %s', event, error)
        return False
