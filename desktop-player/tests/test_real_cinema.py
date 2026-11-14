"""Real libmpv + OpenGL prestart (Xvfb + Mesa). Skipped on the offscreen platform used by the main suite.

Run alone: QT_QPA_PLATFORM=xcb LIBGL_ALWAYS_SOFTWARE=1 xvfb-run -a -s '-screen 0 1280x720x24' \
           python -m pytest tests/test_real_cinema.py
"""
import os
import shutil
import subprocess
import time

import pytest

if os.environ.get('QT_QPA_PLATFORM', 'offscreen') == 'offscreen' or not os.environ.get('DISPLAY'):
    pytest.skip('needs a real X display (xvfb-run) and QT_QPA_PLATFORM=xcb', allow_module_level=True)

from PySide6.QtGui import QColor, QImage  # noqa: E402
from PySide6.QtWidgets import QApplication  # noqa: E402

from kinosota_player import cinema, libmpv  # noqa: E402

if libmpv.load_error():
    pytest.skip(f'libmpv unavailable: {libmpv.load_error()}', allow_module_level=True)


def luminance(image, columns=16, rows=9):
    total = 0.0
    for y in range(rows):
        for x in range(columns):
            c = image.pixelColor(int((x + 0.5) * image.width() / columns), int((y + 0.5) * image.height() / rows))
            total += 0.2126 * c.red() + 0.7152 * c.green() + 0.0722 * c.blue()
    return total / (columns * rows)


def pump(app, seconds, until=lambda: False, each=None):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline and not until():
        app.processEvents()
        if each:
            each()
        time.sleep(0.01)
    return until()


@pytest.fixture(scope='module')
def app():
    application = QApplication.instance() or QApplication([])
    assert application.platformName() in ('xcb', 'wayland')
    return application


@pytest.fixture()
def film(tmp_path):
    assert shutil.which('ffmpeg')
    path = tmp_path / 'film.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
                    "nullsrc=s=320x180:r=24,geq=r='if(lt(Y,90),230,20)':g='20':b='if(lt(Y,90),20,230)'",
                    '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000', '-t', '6',
                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', str(path)],
                   check=True, timeout=60)
    return path


def test_poster_is_painted_upright_before_any_video(app):
    view = cinema.CinemaView()
    view.resize(320, 180)
    poster = QImage(320, 180, QImage.Format.Format_RGB32)
    poster.fill(QColor(20, 20, 230))
    for y in range(90):
        for x in range(320):
            poster.setPixelColor(x, y, QColor(230, 20, 20))
    view.set_poster(poster)
    view.show()
    assert pump(app, 3, lambda: view.initialized)
    image = view.grabFramebuffer()
    top, bottom = image.pixelColor(160, 30), image.pixelColor(160, 150)
    assert top.red() > 150 and top.blue() < 100, (top.getRgb(), bottom.getRgb())
    assert bottom.blue() > 150 and bottom.red() < 100
    view.release()
    view.close()


def test_intro_prestart_and_cross_dissolve_without_black_frames(app, film):
    surface = cinema.CinemaSurface()
    view = surface.view
    view.resize(640, 360)
    marks, samples = {}, []
    surface.filmStarted.connect(lambda: marks.setdefault('started', time.monotonic()))
    surface.filmDissolved.connect(lambda: marks.setdefault('dissolved', time.monotonic()))

    def sample():
        if view.initialized and view.first_paint_at is not None:
            image = view.grabFramebuffer()
            samples.append((round(time.monotonic() - t0, 3), surface.phase, round(luminance(image), 1)))

    t0 = time.monotonic()
    view.show()
    surface.present()
    assert pump(app, 3, lambda: view.first_paint_at is not None)
    first_paint_ms = (view.first_paint_at - t0) * 1000
    assert pump(app, 5, lambda: surface.intro_frame_at is not None, sample), surface.handles['intro'].get('time-pos')
    intro_frame_ms = (surface.intro_frame_at - t0) * 1000
    pump(app, 1.0, each=sample)  # The intro plays for a while.
    load_at = time.monotonic()
    surface.load_film(str(film), [('force-media-title', 'Test film')])
    assert pump(app, 10, lambda: 'started' in marks, sample), (surface.phase, samples[-5:])
    assert pump(app, 5, lambda: 'dissolved' in marks, sample)
    pump(app, 0.5, each=sample)
    final = view.grabFramebuffer()
    top, bottom = final.pixelColor(320, 60), final.pixelColor(320, 300)
    film_state = (surface.phase, surface.film_alive(), surface.handles['film'].get('pause'))
    surface.shutdown()
    view.close()
    report = (f'first paint {first_paint_ms:.0f} ms, intro frame {intro_frame_ms:.0f} ms, '
              f'film start {(marks["started"] - load_at) * 1000:.0f} ms after load, '
              f'dissolve {(marks["dissolved"] - marks["started"]) * 1000:.0f} ms, '
              f'min luminance {min(s[2] for s in samples)} over {len(samples)} frames')
    print(report)
    assert first_paint_ms < 100, report  # The click shows the intro's first frame at once.
    assert min(s[2] for s in samples) > 8, (report, [s for s in samples if s[2] <= 8])  # Never black.
    assert any(s[1] == 'dissolve' for s in samples), samples  # Frames were captured mid-dissolve.
    assert top.red() > 150 and top.blue() < 110, (top.getRgb(), bottom.getRgb())  # The film, upright.
    assert bottom.blue() > 150 and bottom.red() < 110
    assert film_state == ('film', True, False)


def test_the_launch_window_becomes_the_film_window_without_losing_the_picture(app, film):
    from kinosota_player.direct import DirectLaunchSplash
    from PySide6.QtCore import Qt
    surface = cinema.CinemaSurface()
    splash = DirectLaunchSplash(cinema=surface)
    splash.set_mode('compact', animate=False)
    splash.present()
    view = surface.view
    assert pump(app, 5, lambda: surface.intro_frame_at is not None)
    assert splash.windowFlags() & Qt.WindowType.WindowStaysOnTopHint
    context = view.context()
    surface.load_film(str(film))
    assert pump(app, 10, lambda: surface.phase == 'film')
    pump(app, 0.5)
    assert splash.film_mode and splash.isVisible()
    assert not splash.windowFlags() & Qt.WindowType.WindowStaysOnTopHint
    assert view.initialized and view.context() is context  # No window re-creation, no GL context loss.
    image = view.grabFramebuffer()
    top, bottom = image.pixelColor(image.width() // 2, image.height() // 6), image.pixelColor(image.width() // 2, image.height() * 5 // 6)
    assert top.red() > 150 and bottom.blue() > 150, (top.getRgb(), bottom.getRgb())
    splash.hide_now()
    assert surface.handles == {} and surface.phase == 'idle'
    splash.present()  # The next launch reuses the window and restarts the intro.
    assert pump(app, 5, lambda: surface.intro_frame_at is not None and surface.phase == 'intro')
    splash.dismiss()
    surface.shutdown()
