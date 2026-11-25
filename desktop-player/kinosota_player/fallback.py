"""Commercial prestart (Intro -> Pre-roll -> film) for external mpv fallback playback.

When the in-window OpenGL CinemaSurface cannot run (for example a broken GL driver or libmpv
unavailable), playback falls back to the external ``Mpv`` child window. Without this fallback
prestart, the film would start directly and bypass both the branded intro and Pre-roll ads.

This module drives the exact same ``Intro -> Pre-roll -> film`` pipeline on initial launches
(``attempt == 0``) inside the existing external ``Mpv`` process before loading the film URL,
while warming the film stream / resolving the launch ticket concurrently so startup stays snappy.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
import logging
from pathlib import Path
import time

from . import intro_source
from .ads import Preroll, fetch_preroll, report as report_ad
from .engine import FIRST_FRAME_TIMEOUT
from .intro_source import target_for

log = logging.getLogger('kinosota.fallback')

MIN_INTRO_MS = 5000
AD_WAIT_MS = 5000
AD_LOAD_TIMEOUT_S = 10.0
AD_GRACE_S = 15.0
AD_DEFAULT_MAX_S = 120.0
INTRO_VOLUME = 100
FILM_VOLUME = 100
POLL_INTERVAL_S = 0.1


@dataclass(frozen=True)
class FallbackResult:
    """Outcome of a fallback prestart + film start run on a worker thread."""
    started: bool
    film_payload: object = None
    aborted_by_viewer: bool = False


def _film_properties(film_args):
    """Translate ``--flag=value`` film CLI args to runtime mpv IPC properties."""
    props = {
        'keep-open': 'no',
        'idle': 'once',
        'panscan': '0',
        'volume': FILM_VOLUME,
        'alang': '',
        'aid': 'auto',
        'force-media-title': '',
    }
    for raw in film_args or ():
        if not isinstance(raw, str) or not raw.startswith('--'):
            continue
        body = raw[2:]
        if '=' not in body:
            continue
        key, value = body.split('=', 1)
        if key == 'aid':
            try:
                props[key] = int(value)
                continue
            except ValueError:
                pass
        props[key] = value
    return props


def _apply_properties(engine, properties):
    for key, value in properties.items():
        try:
            engine.set_property(key, value)
        except Exception as error:
            log.debug('Could not set mpv fallback property %s=%r: %s', key, value, error)


def _refresh_intro(intro):
    refresh = getattr(intro, 'refresh_async', None)
    if not callable(refresh):
        return
    try:
        refresh(force=True)
    except TypeError:
        refresh()
    except Exception:
        pass


def _wait_for_future(future, timeout_s, *, engine=None, cancelled=lambda: False, check_film=None, clock=time.monotonic, sleep=time.sleep):
    """Poll a Future while honoring cancellation, mpv close, and early film resolution failure."""
    deadline = clock() + max(0.0, float(timeout_s))
    while not future.done():
        if cancelled():
            return False
        if engine is not None and not engine.alive():
            return False
        if check_film is not None and check_film.done() and check_film.exception() is not None:
            return False
        if clock() >= deadline:
            return False
        sleep(POLL_INTERVAL_S)
    return True


def _hold_until(deadline, *, cancelled, engine, film_future, wait_future=None, clock=time.monotonic, sleep=time.sleep):
    """Hold current playback until deadline unless cancelled, mpv closes, film fails, or wait_future finishes."""
    while clock() < deadline:
        if cancelled() or not engine.alive():
            return False
        if film_future.done() and film_future.exception() is not None:
            return False
        if wait_future is not None and wait_future.done():
            return True
        sleep(POLL_INTERVAL_S)
    return True


def _wait_ad_completion(engine, ad, *, cancelled, film_future, clock=time.monotonic, sleep=time.sleep):
    """Wait until the Pre-roll clip reaches EOF or its bounded deadline, never stalling the film forever."""
    limit = (float(ad.duration_sec) + AD_GRACE_S) if ad.duration_sec > 0 else AD_DEFAULT_MAX_S
    deadline = clock() + limit
    while clock() < deadline:
        if cancelled() or not engine.alive():
            return False
        if film_future.done() and film_future.exception() is not None:
            return False
        try:
            if engine.property('eof-reached') is True:
                return True
        except (OSError, TimeoutError, ValueError):
            if not engine.alive():
                return False
        sleep(POLL_INTERVAL_S)
    return False


def play_with_fallback_prestart(
    engine,
    api,
    meta,
    resolve_film,
    *,
    film_args=(),
    win_args=(),
    ad_api=None,
    cancelled=lambda: False,
    on_visual_start=None,
    on_cleanup_film=None,
    intro=None,
    fetch_ad=fetch_preroll,
    report=report_ad,
    clock=time.monotonic,
    sleep=time.sleep,
):
    """Run ``Intro -> Pre-roll -> film`` in the external ``Mpv`` engine while resolving the film concurrently.

    ``resolve_film`` may be either an already-ready HTTPS URL string or a zero-arg callable returning
    either ``film_url`` or ``(film_url, film_payload)``.
    Returns :class:`FallbackResult`. If ``resolve_film`` fails, any spawned mpv child is closed first.
    """
    intro = intro or intro_source.shared()
    choice = intro.current(target_for(meta))
    _refresh_intro(intro)
    has_intro = bool(getattr(choice, 'enabled', False) and getattr(choice, 'video', None) and Path(choice.video).is_file())
    ad_client = api if ad_api is None else ad_api

    visual_signaled = False
    mpv_opened = False

    def signal_visual():
        nonlocal visual_signaled
        if visual_signaled:
            return
        visual_signaled = True
        if callable(on_visual_start):
            on_visual_start()

    def _safe_ad():
        try:
            return fetch_ad(ad_client, meta)
        except Exception as error:
            log.info('Fallback Pre-roll fetch failed: %s', error)
            return None

    def _resolve():
        resolved = resolve_film() if callable(resolve_film) else resolve_film
        if isinstance(resolved, tuple) and len(resolved) == 2:
            return resolved
        return resolved, None

    pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix='kinosota-prestart')
    film_future = pool.submit(_resolve)
    ad_future = pool.submit(_safe_ad)

    def _cleanup_payload(payload):
        if payload is not None and callable(on_cleanup_film):
            try:
                on_cleanup_film(payload)
            except Exception:
                pass

    def _cleanup_film():
        if film_future.done():
            if film_future.exception() is None:
                _, payload = film_future.result()
                _cleanup_payload(payload)
        else:
            film_future.add_done_callback(lambda fut: _cleanup_payload(fut.result()[1]) if not fut.cancelled() and fut.exception() is None else None)

    try:
        # Stage 1: Intro clip in persistent external mpv (--idle=yes --keep-open=always).
        if has_intro and not cancelled() and not (film_future.done() and film_future.exception() is not None):
            try:
                engine.start_local(
                    choice.video,
                    extra_args=[
                        '--keep-open=always',
                        '--panscan=1.0',
                        '--osd-level=0',
                        '--no-osc',
                        f'--volume={INTRO_VOLUME}',
                        *win_args,
                    ],
                    idle='yes',
                )
                mpv_opened = True
                status = engine.wait_playback_started(
                    FIRST_FRAME_TIMEOUT,
                    cancelled=cancelled,
                    interval=POLL_INTERVAL_S,
                    sleep=sleep,
                    clock=clock,
                    show_osc=False,
                )
                if status == 'playing':
                    signal_visual()
                    _hold_until(
                        clock() + MIN_INTRO_MS / 1000.0,
                        cancelled=cancelled,
                        engine=engine,
                        film_future=film_future,
                        clock=clock,
                        sleep=sleep,
                    )
                    if not ad_future.done():
                        _hold_until(
                            clock() + AD_WAIT_MS / 1000.0,
                            cancelled=cancelled,
                            engine=engine,
                            film_future=film_future,
                            wait_future=ad_future,
                            clock=clock,
                            sleep=sleep,
                        )
            except Exception as error:
                log.warning('Fallback intro playback could not start: %s', error)
                if mpv_opened and not engine.alive():
                    mpv_opened = False

        if cancelled():
            engine.stop()
            _cleanup_film()
            raise RuntimeError('Cancelled')
        if mpv_opened and not engine.alive():
            _cleanup_film()
            return FallbackResult(started=False, aborted_by_viewer=True)
        if film_future.done() and film_future.exception() is not None:
            engine.stop()
            film_future.result()

        # Stage 2: Pre-roll ad (if enabled/available; wait up to AD_WAIT_MS when no intro ran).
        if not ad_future.done():
            _wait_for_future(
                ad_future,
                AD_WAIT_MS / 1000.0,
                engine=engine if mpv_opened else None,
                cancelled=cancelled,
                check_film=film_future,
                clock=clock,
                sleep=sleep,
            )

        ad = ad_future.result() if ad_future.done() and ad_future.exception() is None else None
        if isinstance(ad, Preroll) and not cancelled() and not (film_future.done() and film_future.exception() is not None):
            try:
                if mpv_opened and engine.alive():
                    _apply_properties(engine, {
                        'keep-open': 'always',
                        'panscan': '0',
                        'osc': False,
                        'osd-level': 0,
                        'volume': INTRO_VOLUME,
                    })
                    engine.command(['loadfile', ad.media_url, 'replace'])
                else:
                    engine.start(
                        ad.media_url,
                        extra_args=[
                            '--idle=yes',
                            '--keep-open=always',
                            '--panscan=0',
                            '--osd-level=0',
                            '--no-osc',
                            f'--volume={INTRO_VOLUME}',
                            *win_args,
                        ],
                    )
                    mpv_opened = True
                ad_status = engine.wait_playback_started(
                    AD_LOAD_TIMEOUT_S,
                    cancelled=cancelled,
                    interval=POLL_INTERVAL_S,
                    sleep=sleep,
                    clock=clock,
                    show_osc=False,
                )
                if ad_status == 'playing':
                    signal_visual()
                    report(ad_client, ad, 'impression')
                    completed = _wait_ad_completion(
                        engine,
                        ad,
                        cancelled=cancelled,
                        film_future=film_future,
                        clock=clock,
                        sleep=sleep,
                    )
                    if completed:
                        report(ad_client, ad, 'completion')
            except Exception as error:
                log.warning('Fallback Pre-roll playback skipped: %s', error)
                if mpv_opened and not engine.alive():
                    mpv_opened = False

        if cancelled():
            engine.stop()
            _cleanup_film()
            raise RuntimeError('Cancelled')
        if mpv_opened and not engine.alive():
            _cleanup_film()
            return FallbackResult(started=False, aborted_by_viewer=True)

        # Stage 3: Film stream (wait cleanly for resolve_film if still warming/fetching).
        while not film_future.done():
            if cancelled():
                engine.stop()
                raise RuntimeError('Cancelled')
            if mpv_opened and not engine.alive():
                return FallbackResult(started=False, aborted_by_viewer=True)
            sleep(POLL_INTERVAL_S)

        film_url, film_payload = film_future.result()
        if cancelled():
            engine.stop()
            if film_payload is not None and callable(on_cleanup_film):
                on_cleanup_film(film_payload)
            raise RuntimeError('Cancelled')
        if mpv_opened and not engine.alive():
            if film_payload is not None and callable(on_cleanup_film):
                on_cleanup_film(film_payload)
            return FallbackResult(started=False, aborted_by_viewer=True)

        if mpv_opened and engine.alive():
            _apply_properties(engine, _film_properties(film_args))
            engine.command(['loadfile', film_url, 'replace'])
        else:
            engine.start(film_url, extra_args=[*film_args, *win_args])
        return FallbackResult(started=True, film_payload=film_payload)
    except Exception:
        engine.stop()
        _cleanup_film()
        raise
    finally:
        pool.shutdown(wait=False)
