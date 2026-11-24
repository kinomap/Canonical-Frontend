"""--cinema-smoke-test: packaged-app QA of the in-window CinemaSurface (0.2.4).

--smoke-test and --playback-smoke-fixture deliberately use the external mpv engine, so before 0.2.4 the frozen
build and the .deb never proved that the embedded OpenGL surface, libmpv render API and the bundled
kinosota-intro.mp4 really work. This mode runs exactly the production path: create_surface() → DirectLaunchSplash →
bundled intro → a local Pre-roll (expect_preroll / queue_preroll) → load_film → teardown, without network,
credentials or a stored session. Exit 0 = PASS (or SKIP on a platform without OpenGL windows, e.g. offscreen)."""
import json
import os
import time
from pathlib import Path

from PySide6.QtCore import QCoreApplication, QEventLoop
from PySide6.QtGui import QGuiApplication

from . import cinema

FILM_PHASES = ('intro', 'warmup', 'dissolve', 'film')
HEADLESS_PLATFORMS = ('offscreen', 'minimal')


def _pump(seconds, until=None):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        QCoreApplication.processEvents(QEventLoop.AllEvents, 50)
        if until is not None and until():
            return True
        time.sleep(0.02)
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
    splash = held['splash'] = DirectLaunchSplash(cinema=surface)
    splash.present()
    token = surface.expect_preroll()
    ad = {'started': False}
    surface.queue_preroll(token, media, duration=3.0, on_start=lambda *a: ad.__setitem__('started', True))
    surface.load_film(media)

    def note():
        if not report['phases'] or report['phases'][-1] != surface.phase:
            report['phases'].append(surface.phase)

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
    report['final_phase'] = surface.phase
    if failures:
        report['error'] = str(failures[0])
    required = ('gl_initialized', 'intro_frame', 'phase_ok', 'no_failure')
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
