"""Dynamic prestart intro for the desktop player (admin «Видео и Реклама» → «Интро престарта»).

The launch never waits for the network:

* ``IntroSource.current()`` is synchronous, touches only the local disk and always returns a
  playable choice: the last known server answer if its files are fully cached, otherwise the
  intro bundled with the app (``assets/intro/kinosota-intro.mp4``). «Выключено» in the admin
  is remembered too, so an offline start honours it.
* ``IntroSource.refresh_async()`` asks ``GET /api/v1/cinema/intro`` on a daemon thread (short
  timeouts, ETag) and, for a custom clip, downloads poster, still and video into
  ``~/.cache/kinosota/intro/<version>.*``. Files are written to ``*.part`` and atomically
  renamed, the video last, so a half-downloaded version is never chosen. The next launch picks
  the new clip up; the one on screen is never swapped mid-play.

ZERO MEDIA ON VPS1/VPS2: an uploaded clip is pulled straight from a Media Node,
``https://<node>.<site>/intro/custom/<version><suffix>?token=<intro-view JWT>``, never from the API
host (VPS 1/VPS 2 serve no media). Everything the server says is validated: only Media Node hosts
of the API's own site, only that node route with its signed token, bounded sizes and real
MP4 / JPEG signatures. Any failure keeps the previous choice.

The admin switches the intro per playback environment (``targets``): the desktop player honours
``player_telegram`` for Telegram streams (a catalogue film without ``tmdb_id``) and
``player_torrents`` for torrent streams (``tmdb_id`` present). A switched-off target means no
intro at all: the film starts on its first decoded frame.
"""
from __future__ import annotations

import json
import logging
import os
import re
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import httpx

from . import __version__
from .api import API_ORIGIN

log = logging.getLogger('kinosota.intro')

BUNDLED_DIR = Path(__file__).resolve().parent / 'assets' / 'intro'
BUNDLED_VIDEO = BUNDLED_DIR / 'kinosota-intro.mp4'
BUNDLED_FIRST_FRAME = BUNDLED_DIR / 'kinosota-intro-first.jpg'
BUNDLED_STILL = BUNDLED_DIR / 'kinosota-intro-still.jpg'

ENDPOINT = '/api/v1/cinema/intro'
CONFIG_TIMEOUT = httpx.Timeout(3.0, connect=2.0)      # The answer is tiny; a slow network just means «next time».
DOWNLOAD_TIMEOUT = httpx.Timeout(30.0, connect=5.0)
REFRESH_INTERVAL_S = 60.0                              # Background (non-forced) refresh throttle; every launch forces one.
MAX_VIDEO_BYTES = 120 * 1000 * 1000                    # Upload is <= 50 MB; the normalised H.264 copy stays far below.
MAX_IMAGE_BYTES = 8 * 1000 * 1000
STATE_FILE = 'state.json'
VERSION = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$')
SUFFIXES = {'video': '.mp4', 'poster': '-poster.jpg', 'still': '-still.jpg'}
URL_KEYS = {'video': 'video_url', 'poster': 'poster_url', 'still': 'still_url'}
NODE_INTRO_PATH = '/intro/custom/'                      # kinomap/node media-nginx.conf: the uploaded intro route.
TOKEN = re.compile(r'^[A-Za-z0-9._-]{1,4096}$')          # intro-view JWT, checked by the node.
MAX_URL_LENGTH = 8192
SIGNATURES = {'video': lambda head: head[4:8] == b'ftyp', 'poster': lambda head: head[:3] == b'\xff\xd8\xff',
              'still': lambda head: head[:3] == b'\xff\xd8\xff'}
DOWNLOAD_ORDER = ('poster', 'still', 'video')          # Video last: its presence marks a complete version.
TARGETS = ('browser_telegram', 'player_telegram', 'browser_torrents', 'player_torrents')
PLAYER_TELEGRAM, PLAYER_TORRENTS = 'player_telegram', 'player_torrents'
PLAYER_TARGETS = (PLAYER_TELEGRAM, PLAYER_TORRENTS)


def target_for(meta) -> str:
    """The desktop environment of a launch: a torrent stream names its TMDB title, a Telegram stream does not."""
    meta = meta if isinstance(meta, dict) else {}
    return PLAYER_TORRENTS if type(meta.get('tmdb_id')) is int else PLAYER_TELEGRAM


def normalize_targets(raw, fallback: bool) -> dict:
    """Every known target as a bool; a missing one (older server or saved state) follows ``enabled``."""
    raw = raw if isinstance(raw, dict) else {}
    return {key: raw[key] if type(raw.get(key)) is bool else bool(fallback) for key in TARGETS}


@dataclass(frozen=True)
class IntroChoice:
    """What the next prestart plays. ``enabled=False``: no intro, the film starts as soon as it can."""
    enabled: bool
    version: str
    video: Path
    first_frame: Path
    still: Path
    custom: bool = False


BUNDLED = IntroChoice(True, 'bundled', BUNDLED_VIDEO,
                      BUNDLED_FIRST_FRAME if BUNDLED_FIRST_FRAME.is_file() else BUNDLED_STILL, BUNDLED_STILL)
DISABLED = IntroChoice(False, 'disabled', BUNDLED.video, BUNDLED.first_frame, BUNDLED.still)


def default_cache_dir() -> Path:
    override = os.environ.get('KINOSOTA_INTRO_CACHE_DIR', '').strip()
    if override:
        return Path(override).expanduser()
    if sys.platform == 'win32' and os.environ.get('LOCALAPPDATA'):
        return Path(os.environ['LOCALAPPDATA']) / 'kinosota' / 'cache' / 'intro'
    base = os.environ.get('XDG_CACHE_HOME', '').strip()
    return (Path(base) if base else Path.home() / '.cache') / 'kinosota' / 'intro'


def dynamic_disabled_by_environment() -> bool:
    return os.environ.get('KINOSOTA_INTRO_DYNAMIC', '1').strip().lower() in ('0', 'no', 'false', 'off')


def sanitize_config(raw, origin: str = API_ORIGIN):
    """The server answer reduced to what we trust, or None when it must be ignored."""
    if not isinstance(raw, dict) or type(raw.get('enabled')) is not bool:
        return None
    custom = raw.get('is_custom') is True
    config = {'enabled': raw['enabled'], 'targets': normalize_targets(raw.get('targets'), raw['enabled']),
              'is_custom': custom, 'version': 'default', 'urls': {}}
    if not custom:
        return config  # The stock KINOSOTA intro is the one bundled with the app: nothing to download.
    version = raw.get('version')
    if not isinstance(version, str) or not VERSION.match(version):
        return None
    api_host = (urlsplit(origin).hostname or '').lower()
    site = _site_of(api_host)
    for kind, key in URL_KEYS.items():
        url = _safe_url(raw.get(key), api_host, site, version + SUFFIXES[kind])
        if url is None:
            return None
        config['urls'][kind] = url
    config['version'] = version
    return config


def _site_of(host: str) -> str:
    """The API's own site (``watch.scenrix.com`` -> ``scenrix.com``): the Media Nodes live under it."""
    labels = host.split('.')
    return '.'.join(labels[-2:]) if len(labels) >= 2 and all(labels) else ''


def _safe_url(value, api_host: str, site: str, filename: str):
    """Only ``https://<node>.<site>/intro/custom/<filename>?token=<JWT>``; the API host itself is refused."""
    if not isinstance(value, str) or not value or len(value) > MAX_URL_LENGTH or not site:
        return None
    parts = urlsplit(value)
    host = (parts.hostname or '').lower()
    if parts.scheme != 'https' or parts.username or parts.password or parts.fragment:
        return None
    if host == api_host or not host.endswith('.' + site):
        return None  # VPS 1/VPS 2 never serve media; foreign hosts are never trusted.
    if parts.path != NODE_INTRO_PATH + filename:
        return None
    query = parse_qs(parts.query, keep_blank_values=True)
    if list(query) != ['token'] or len(query['token']) != 1 or not TOKEN.match(query['token'][0]):
        return None
    return value


class IntroSource:
    """Thread-safe resolver + cacher. ``current()`` is for the UI thread; the network runs on daemon threads."""

    def __init__(self, origin: str = API_ORIGIN, cache_dir=None, *, transport=None, network=True,
                 clock=time.monotonic, refresh_interval=REFRESH_INTERVAL_S):
        self.origin = origin.rstrip('/')
        self.cache_dir = Path(cache_dir) if cache_dir is not None else default_cache_dir()
        self.network = bool(network)
        self.clock = clock
        self.refresh_interval = float(refresh_interval)
        self._lock = threading.RLock()
        self._busy = threading.Lock()
        self._thread = None
        self._last_refresh = None
        self._client = httpx.Client(follow_redirects=False, transport=transport, timeout=CONFIG_TIMEOUT,
                                    headers={'User-Agent': 'KINOSOTA-Player/' + __version__})
        self._config, self._etag = self._load_state()

    # Local, instant -------------------------------------------------------------------------------------------
    def current(self, target=None) -> IntroChoice:
        """The intro for ``target`` (``player_telegram`` / ``player_torrents``); None: shown anywhere at all."""
        with self._lock:
            config = self._config
        if config is None:
            return BUNDLED
        if not self._enabled(config, target):
            return DISABLED
        if not config['is_custom']:
            return BUNDLED
        files = self.files(config['version'])
        if all(path.is_file() and path.stat().st_size > 0 for path in files.values()):
            return IntroChoice(True, config['version'], files['video'], files['poster'], files['still'], True)
        return BUNDLED  # Still downloading, or the cache was cleared: the bundled intro plays instantly.

    @staticmethod
    def _enabled(config, target) -> bool:
        if target not in TARGETS:
            return bool(config['enabled'])
        return normalize_targets(config.get('targets'), config['enabled'])[target]

    def player_targets(self) -> dict:
        """{'player_telegram': bool, 'player_torrents': bool}; both on until the server said otherwise."""
        with self._lock:
            config = self._config
        if config is None:
            return dict.fromkeys(PLAYER_TARGETS, True)
        return {target: self._enabled(config, target) for target in PLAYER_TARGETS}

    def files(self, version: str) -> dict:
        return {kind: self.cache_dir / f'{version}{suffix}' for kind, suffix in SUFFIXES.items()}

    def quarantine(self, version: str) -> None:
        """mpv could not play a cached clip: drop it, the next refresh downloads it again."""
        if not isinstance(version, str) or not VERSION.match(version):
            return
        for path in self.files(version).values():
            _unlink(path)
        with self._lock:
            self._last_refresh = None
        log.warning('Cached intro %s could not be played; removed from the cache', version)

    # Network, background ------------------------------------------------------------------------------------
    def refresh_async(self, *, force=False):
        """Start a background refresh unless one runs or the last one is recent. Never blocks."""
        if not self.network:
            return None
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return None
            if not force and self._last_refresh is not None and self.clock() - self._last_refresh < self.refresh_interval:
                return None
            self._thread = threading.Thread(target=self.refresh, name='kinosota-intro-refresh', daemon=True)
            self._thread.start()
            return self._thread

    def refresh(self) -> bool:
        """Fetch the config and cache a custom clip. True when the cache matches the server afterwards."""
        if not self.network or not self._busy.acquire(blocking=False):
            return False
        try:
            config = self._fetch_config()
            if config is None:
                return False
            if config['is_custom']:
                self._download_version(config)
            self._prune(config['version'] if config['is_custom'] else None)
            return True
        except Exception as error:  # Offline, DNS, TLS, disk full…: the previous choice stays.
            log.info('Intro refresh failed, keeping the current intro: %s', error)
            return False
        finally:
            with self._lock:
                self._last_refresh = self.clock()
            self._busy.release()

    def _fetch_config(self):
        headers = {'Accept': 'application/json'}
        with self._lock:
            if self._etag and self._config is not None:
                headers['If-None-Match'] = self._etag
        response = self._client.get(self.origin + ENDPOINT, headers=headers, timeout=CONFIG_TIMEOUT)
        if response.status_code == 304:
            with self._lock:
                return self._config
        if response.status_code != 200:
            log.info('Intro config answered HTTP %s; keeping the current intro', response.status_code)
            return None
        config = sanitize_config(response.json(), self.origin)
        if config is None:
            log.warning('Intro config rejected; keeping the current intro')
            return None
        etag = response.headers.get('etag', '')[:128] or None
        with self._lock:
            self._config, self._etag = config, etag
        self._save_state(config, etag)
        return config

    def _download_version(self, config) -> None:
        files = self.files(config['version'])
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        for kind in DOWNLOAD_ORDER:
            target = files[kind]
            if target.is_file() and target.stat().st_size > 0:
                continue
            limit = MAX_VIDEO_BYTES if kind == 'video' else MAX_IMAGE_BYTES
            self._download(config['urls'][kind], target, limit, SIGNATURES[kind])
        log.info('Custom intro %s cached in %s', config['version'], self.cache_dir)

    def _download(self, url, target: Path, limit: int, signature) -> None:
        part = target.with_name(target.name + '.part')
        try:
            with self._client.stream('GET', url, timeout=DOWNLOAD_TIMEOUT,
                                     headers={'Accept-Encoding': 'identity'}) as response:
                if response.status_code != 200:
                    raise OSError(f'HTTP {response.status_code} for {target.name}')
                declared = response.headers.get('content-length')
                encoded = response.headers.get('content-encoding', 'identity').lower() not in ('', 'identity')
                expected = int(declared) if declared and declared.isdigit() and not encoded else None
                if expected is not None and expected > limit:
                    raise OSError(f'{target.name} is too large ({expected} bytes)')
                written, head = 0, b''
                with open(part, 'wb') as out:
                    for chunk in response.iter_bytes():
                        written += len(chunk)
                        if written > limit:
                            raise OSError(f'{target.name} exceeds {limit} bytes')
                        if len(head) < 16:
                            head += chunk[:16 - len(head)]
                        out.write(chunk)
            if not written or (expected is not None and written != expected):
                raise OSError(f'{target.name} is truncated ({written} of {expected} bytes)')
            if not signature(head):
                raise OSError(f'{target.name} is not the expected media type')
            os.replace(part, target)
        finally:
            _unlink(part)

    def _prune(self, keep) -> None:
        """Only the active version stays on disk (plus leftovers that are still open on Windows)."""
        if not self.cache_dir.is_dir():
            return
        keep_names = {path.name for path in self.files(keep).values()} if keep else set()
        for path in self.cache_dir.iterdir():
            if path.name == STATE_FILE or path.name in keep_names or not path.is_file():
                continue
            if path.name.endswith(tuple(SUFFIXES.values())) or path.name.endswith('.part'):
                _unlink(path)

    # State --------------------------------------------------------------------------------------------------
    def _load_state(self):
        try:
            data = json.loads((self.cache_dir / STATE_FILE).read_text('utf-8'))
            config = data.get('config')
            if not isinstance(config, dict) or type(config.get('enabled')) is not bool:
                return None, None
            if config.get('is_custom') is True and not VERSION.match(str(config.get('version', ''))):
                return None, None
            etag = data.get('etag') if isinstance(data.get('etag'), str) else None
            return config, etag
        except (OSError, ValueError, AttributeError):
            return None, None

    def _save_state(self, config, etag) -> None:
        try:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            temp = self.cache_dir / (STATE_FILE + '.tmp')
            temp.write_text(json.dumps({'config': config, 'etag': etag, 'saved_at': int(time.time())}), 'utf-8')
            os.replace(temp, self.cache_dir / STATE_FILE)
        except OSError as error:
            log.info('Intro state not saved: %s', error)

    def close(self) -> None:
        self._client.close()


def _unlink(path: Path) -> None:
    try:
        path.unlink()
    except OSError:
        pass  # Already gone, or Windows keeps a file open by mpv: the next prune removes it.


_shared = None
_shared_lock = threading.Lock()


def shared() -> IntroSource:
    """The app-wide source; the first call starts a background refresh (app start)."""
    global _shared
    with _shared_lock:
        if _shared is None:
            _shared = IntroSource(network=not dynamic_disabled_by_environment())
            _shared.refresh_async()
        return _shared
