"""--cinema-smoke-test: packaged-app QA of the in-window CinemaSurface (0.2.4, frame checks 0.2.5).

--smoke-test and --playback-smoke-fixture deliberately use the external mpv engine, so before 0.2.4 the frozen
build and the .deb never proved that the embedded OpenGL surface, libmpv render API and the bundled
kinosota-intro.mp4 really work. This mode runs exactly the production path: create_surface() → DirectLaunchSplash →
bundled intro → a local Pre-roll (expect_preroll / queue_preroll) → load_film → teardown, without network,
credentials or a stored session. Exit 0 = PASS (or SKIP on a platform without OpenGL windows, e.g. offscreen).

0.2.5: the waits run a real QEventLoop (timers, Wayland frame callbacks and queued libmpv wake-ups are dispatched
the way app.exec() does, no sleep between passes); PASS also requires the Pre-roll, the film dissolve and frames that
keep reaching the screen (paintGL), and the report says how many and whether the compositor presented the window."""
import json
import os
import time
from pathlib import Path

from PySide6.QtCore import QEventLoop, QTimer
from PySide6.QtGui import QGuiApplication

from . import cinema

FILM_PHASES = ('intro', 'warmup', 'dissolve', 'film')
HEADLESS_PLATFORMS = ('offscreen', 'minimal')
POLL_MS = 20
# Composited paints after the intro's first frame. A healthy run paints the intro at its frame rate (Xvfb + llvmpipe
# in the QA containers: several per second); the 0.2.4 Wayland stall painted 0-2 times in the following 17 s.
MIN_FLOWING_PAINTS = 8


def _pump(seconds, until=None):
    """Run the application's event loop for up to seconds, or until until() is true (checked every POLL_MS)."""
    if until is not None and until():
        return True
    loop = QEventLoop()
    errors = []

    def check():
        try:
            if until is not None and until():
                loop.quit()
        except Exception as error:  # Re-raised below: a slot must never swallow it.
            errors.append(error)
            loop.quit()

    poll = QTimer()
    poll.setInterval(POLL_MS)
    poll.timeout.connect(check)
    deadline = QTimer()
    deadline.setSingleShot(True)
    deadline.timeout.connect(loop.quit)
    poll.start()
    deadline.start(max(0, int(seconds * 1000)))
    try:
        loop.exec()
    finally:
        poll.stop()
        deadline.stop()
    if errors:
        raise errors[0]
    return until() if until is not None else True


def _media(fixture):
    """A local film / Pre-roll clip: the synthetic QA fixture when given, otherwise the bundled intro itself."""
    if fixture:
        path = Path(fixture)
        if path.is_dir():
            for name in ('h264.mkv', 'hevc.mkv'):
                if (path / name).is_file():
                    return str(path / name)
            raise FileNotFoundError(f'no h264.mkv / hevc.mkv in {path}')
        if path.is_file():
            return str(path)
        raise FileNotFoundError(str(path))
    return str(cinema.INTRO_VIDEO)


def run(fixture=None, report_path=None, timeout=60.0):
    report = {'status': 'FAIL', 'mode': 'cinema-smoke', 'platform': QGuiApplication.platformName(),
              'intro': str(cinema.INTRO_VIDEO), 'phases': [], 'checks': {}}
    started = time.monotonic()
    held = {}
    try:
        code = _exercise(fixture, timeout, report, held, started)
    except Exception as error:  # Reported, never raised: the exit code is the QA contract.
        report['error'] = f'{type(error).__name__}: {error}'
        code = 1
    try:
        splash, surface = held.get('splash'), held.get('surface')
        if splash is not None:
            splash.hide_now()
            splash.dismiss()
        if surface is not None:
            surface.shutdown()
            report['checks']['teardown_clean'] = surface.handles == {}
            if not report['checks']['teardown_clean']:
                code = 1
        _pump(0.3)
    except Exception as error:
        report['error'] = f'teardown: {type(error).__name__}: {error}'
        code = 1
    if report['status'] != 'SKIP':
        report['status'] = 'PASS' if code == 0 else 'FAIL'
    report['seconds'] = round(time.monotonic() - started, 2)
    text = json.dumps(report, ensure_ascii=False, indent=2)
    if report_path:
        Path(report_path).write_text(text + '\n', encoding='utf-8')
    print(text, flush=True)
    return code


def _exercise(fixture, timeout, report, held, started):
    from .direct import DirectLaunchSplash

    reason = cinema.unavailable_reason()
    report['unavailable_reason'] = reason
    if reason:
        if report['platform'] in HEADLESS_PLATFORMS:
            report['status'] = 'SKIP'  # Expected: no OpenGL windows here, the external player is used.
            return 0
        report['error'] = f'cinema unavailable: {reason}'
        return 1
    if not Path(cinema.INTRO_VIDEO).is_file():
        report['error'] = 'bundled kinosota-intro.mp4 is missing'
        return 1
    media = _media(fixture)
    surface = held['surface'] = cinema.create_surface(bundled_only=True)
    if surface is None:
        report['error'] = 'create_surface() returned None'
        return 1
    failures = []
    surface.failed.connect(failures.append)
    view = surface.view
    frames = {'intro_paint': None, 'exposed_seen': False, 'unexposed_s': 0.0, 'last': time.monotonic()}
    splash = held['splash'] = DirectLaunchSplash(cinema=surface)
    splash.present()
    token = surface.expect_preroll()
    ad = {'started': False}
    surface.queue_preroll(token, media, duration=3.0, on_start=lambda *a: ad.__setitem__('started', True))
    surface.load_film(media)

    def note():
        if not report['phases'] or report['phases'][-1] != surface.phase:
            report['phases'].append(surface.phase)
        now = time.monotonic()
        if view.presentation()['exposed']:
            frames['exposed_seen'] = True
        else:
            frames['unexposed_s'] += now - frames['last']
        frames['last'] = now
        if frames['intro_paint'] is None and surface.intro_frame_at is not None:
            frames['intro_paint'] = (view.paint_count, surface.intro_frame_at)

    def running():
        note()
        return bool(failures) or (surface.view.initialized and surface.phase in FILM_PHASES
                                  and surface.intro_frame_at is not None)

    _pump(timeout, running)
    checks = report['checks']
    checks['gl_initialized'] = bool(surface.view.initialized)
    checks['intro_frame'] = surface.intro_frame_at is not None
    checks['phase_ok'] = surface.phase in FILM_PHASES
    checks['no_failure'] = not failures
    # Beyond the minimum, reported: the Pre-roll and the film reached within the remaining time.
    _pump(max(0.0, timeout - (time.monotonic() - started)),
          lambda: note() or bool(failures) or surface.phase in ('dissolve', 'film'))
    checks['preroll_started'] = ad['started']
    checks['film_reached'] = surface.phase in ('dissolve', 'film')
    checks['no_failure'] = not failures
    note()
    state = view.presentation()
    after_intro, intro_seconds = 0, 0.0
    if frames['intro_paint'] is not None:
        after_intro = view.paint_count - frames['intro_paint'][0]
        intro_seconds = max(0.001, time.monotonic() - frames['intro_paint'][1])
    checks['frames_flowing'] = after_intro >= MIN_FLOWING_PAINTS
    report['presentation'] = {
        'paints': view.paint_count, 'paints_after_intro_frame': after_intro,
        'fps_after_intro_frame': round(after_intro / intro_seconds, 1) if intro_seconds else 0.0,
        'exposed_seen': frames['exposed_seen'], 'exposed_at_end': state['exposed'],
        'unexposed_seconds': round(frames['unexposed_s'], 2), 'last_paint_ms': state['last_paint_ms'],
        'pending_frames': sorted(view.pending_frames()),
    }
    report['final_phase'] = surface.phase
    if failures:
        report['error'] = str(failures[0])
    elif not frames['exposed_seen'] or (not checks['frames_flowing'] and frames['unexposed_s'] > 1):
        report['error'] = ('the compositor did not present the window (locked or blanked screen, minimized?): '
                           'decoded frames could not reach the screen')
    required = ('gl_initialized', 'intro_frame', 'phase_ok', 'no_failure', 'preroll_started', 'film_reached',
                'frames_flowing')
    return 0 if all(checks[name] for name in required) else 1


def main_args(argv):
    """(fixture, report, timeout) from --cinema-smoke-test [FIXTURE] [--cinema-smoke-report PATH]."""
    fixture = report = None
    timeout = float(os.environ.get('KINOSOTA_CINEMA_SMOKE_TIMEOUT', '60'))
    index = argv.index('--cinema-smoke-test')
    if index + 1 < len(argv) and not argv[index + 1].startswith('--'):
        fixture = argv[index + 1]
    if '--cinema-smoke-report' in argv:
        position = argv.index('--cinema-smoke-report')
        if position + 1 < len(argv):
            report = argv[position + 1]
    return fixture, report, timeout
