"""Seamless motion-design prestart: intro -> warm-up -> cross-dissolve -> film in one OpenGL surface.

The «Смотреть» click shows the KINOSOTA intro at once (first-frame poster on the very
first paint, the intro video right after). The film is loaded paused and muted in a
second libmpv core under the intro. As soon as its first frame is decoded and a few
seconds are buffered, the film starts and a cross-dissolve with a light fade-shadow
replaces the intro while an equal-power curve fades the intro sound out and the film
sound in. There is never a black frame, an emblem or a pause in between.

``CinemaEngine`` exposes the surface through the ``engine.Mpv`` interface so the
existing launch logic (retries, leases, first-frame waits) drives it unchanged.
"""
from __future__ import annotations

import ctypes
import logging
import math
import os
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit

from PySide6.QtCore import (QEasingCurve, QObject, QPointF, QRect, QRectF, QSize, Qt, QThread, QTimer, QVariantAnimation,
                            Signal, Slot)
from PySide6.QtGui import QColor, QGuiApplication, QImage, QOpenGLContext
from PySide6.QtOpenGL import QOpenGLFramebufferObject, QOpenGLTexture, QOpenGLTextureBlitter
from PySide6.QtOpenGLWidgets import QOpenGLWidget

from . import libmpv

log = logging.getLogger('kinosota.cinema')

ASSETS = Path(__file__).resolve().parent / 'assets' / 'intro'
INTRO_VIDEO = ASSETS / 'kinosota-intro.mp4'
INTRO_FIRST_FRAME = ASSETS / 'kinosota-intro-first.jpg'
INTRO_STILL = ASSETS / 'kinosota-intro-still.jpg'

DISSOLVE_MS = 1200          # Cross-dissolve length once the film's first frame is ready.
SHADOW_DEPTH = 0.18         # Fade-shadow: the intro dims by up to 18 % mid-dissolve.
MIN_INTRO_MS = 800          # Never flash the intro for a split second on a very fast source.
PRESTART_CACHE_SECONDS = 2.5  # Buffered film seconds wanted before it is shown...
PRESTART_MAX_HOLD_MS = 4000   # ...but a decoded first frame never waits longer than this.
READY_POLL_MS = 100
GL_WATCHDOG_MS = 2000       # A shown surface without an OpenGL context falls back to the external player.
INTRO_VOLUME = 100
FILM_VOLUME = 100
BACKGROUND = QColor('#070b0e')
FIRST_FRAME_TIMEOUT = 30

COMMON_OPTIONS = [
    ('vo', 'libmpv'), ('hwdec', 'auto-safe'), ('terminal', 'no'), ('config', 'no'), ('idle', 'yes'),
    ('ytdl', 'no'), ('load-scripts', 'no'), ('input-vo-keyboard', 'no'), ('audio-client-name', 'KINOSOTA Player'),
    ('sub-auto', 'no'), ('audio-display', 'no'),
]
# The intro fills the window (panscan crops instead of letterboxing) and holds its last frame.
INTRO_OPTIONS = [*COMMON_OPTIONS, ('keep-open', 'always'), ('panscan', '1.0'), ('osd-level', '0'), ('osc', 'no'),
                 ('input-default-bindings', 'no'), ('pause', 'no'), ('volume', str(INTRO_VOLUME)),
                 ('background', '#070b0e'), ('background-color', '#070b0e')]
# The film starts paused and silent; mpv's own key bindings and OSC take over once it plays.
FILM_OPTIONS = [*COMMON_OPTIONS, ('keep-open', 'no'), ('pause', 'yes'), ('volume', '0'), ('osd-level', '0'), ('osc', 'no'),
                ('input-default-bindings', 'yes'), ('cache', 'yes'), ('demuxer-max-bytes', '150MiB'),
                ('demuxer-readahead-secs', '10'), ('cache-pause-wait', '1'), ('cache-pause-initial', 'no'),
                ('network-timeout', '60'), ('stream-lavf-o', 'reconnect=1,reconnect_streamed=1,reconnect_delay_max=3')]
# engine.Mpv window flags have no meaning here: the surface is the window.
WINDOW_OPTIONS = {'geometry', 'fullscreen', 'fs', 'native-fs', 'autofit', 'autofit-larger', 'force-window', 'title',
                  'input-ipc-server', 'idle', 'keep-open', 'vo', 'no-config', 'config', 'terminal', 'osd-level', 'osc'}

GL_FRAMEBUFFER, GL_BLEND, GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA = 0x8D40, 0x0BE2, 0x0302, 0x0303
GL_COLOR_BUFFER_BIT, GL_SCISSOR_TEST, GL_DEPTH_TEST, GL_STENCIL_TEST, GL_CULL_FACE = 0x4000, 0x0C11, 0x0B71, 0x0B90, 0x0B44
GL_ARRAY_BUFFER, GL_ELEMENT_ARRAY_BUFFER, GL_PIXEL_PACK_BUFFER, GL_PIXEL_UNPACK_BUFFER = 0x8892, 0x8893, 0x88EB, 0x88EC
GL_TEXTURE0, GL_TEXTURE_2D = 0x84C0, 0x0DE1
GL_UNPACK_ALIGNMENT, GL_PACK_ALIGNMENT, GL_UNPACK_ROW_LENGTH, GL_PACK_ROW_LENGTH = 0x0CF5, 0x0D05, 0x0CF2, 0x0D02


def disabled_by_environment():
    return os.environ.get('KINOSOTA_CINEMA', '1').strip().lower() in ('0', 'no', 'false', 'off')


def unavailable_reason():
    """None when the in-window cinema can run here, otherwise why not."""
    if disabled_by_environment():
        return 'disabled by KINOSOTA_CINEMA'
    platform = QGuiApplication.platformName() if QGuiApplication.instance() else ''
    if platform in ('offscreen', 'minimal', 'vnc'):
        return f'no OpenGL window on the {platform} platform'
    if not INTRO_VIDEO.is_file():
        return 'intro video is missing'
    return libmpv.load_error()


def create_surface(parent=None):
    """A CinemaSurface, or None (logged) when libmpv / OpenGL cannot be used."""
    reason = unavailable_reason()
    if reason:
        log.info('Cinema prestart unavailable, using the external mpv window: %s', reason)
        return None
    return CinemaSurface(parent)


# Timeline -------------------------------------------------------------------------------------------------------
class Timeline:
    """Pure dissolve math for progress p in [0, 1]."""

    def __init__(self, shadow=SHADOW_DEPTH):
        self.shadow = shadow
        self.progress = 0.0

    def set_progress(self, value):
        self.progress = min(max(float(value), 0.0), 1.0)

    @staticmethod
    def ease(p):
        return p * p * (3.0 - 2.0 * p)  # smoothstep: no visible start/stop jerk.

    @property
    def film_alpha(self):
        return self.ease(self.progress)

    @property
    def intro_alpha(self):
        """The intro under the film dims slightly mid-way (fade-shadow) and is fully covered at the end."""
        return 1.0 - self.shadow * math.sin(math.pi * self.progress)

    @property
    def intro_volume(self):
        return math.cos(self.progress * math.pi / 2.0)  # Equal-power crossfade.

    @property
    def film_volume(self):
        return math.sin(self.progress * math.pi / 2.0)


# Input ----------------------------------------------------------------------------------------------------------
_SPECIAL_KEYS = {
    Qt.Key.Key_Space: 'SPACE', Qt.Key.Key_Return: 'ENTER', Qt.Key.Key_Enter: 'KP_ENTER', Qt.Key.Key_Escape: 'ESC',
    Qt.Key.Key_Tab: 'TAB', Qt.Key.Key_Backspace: 'BS', Qt.Key.Key_Delete: 'DEL', Qt.Key.Key_Insert: 'INS',
    Qt.Key.Key_Home: 'HOME', Qt.Key.Key_End: 'END', Qt.Key.Key_PageUp: 'PGUP', Qt.Key.Key_PageDown: 'PGDWN',
    Qt.Key.Key_Left: 'LEFT', Qt.Key.Key_Right: 'RIGHT', Qt.Key.Key_Up: 'UP', Qt.Key.Key_Down: 'DOWN',
    Qt.Key.Key_MediaPlay: 'PLAY', Qt.Key.Key_MediaPause: 'PAUSE', Qt.Key.Key_MediaTogglePlayPause: 'PLAYPAUSE',
    Qt.Key.Key_MediaStop: 'STOP', Qt.Key.Key_MediaNext: 'NEXT', Qt.Key.Key_MediaPrevious: 'PREV',
    Qt.Key.Key_VolumeUp: 'VOLUME_UP', Qt.Key.Key_VolumeDown: 'VOLUME_DOWN', Qt.Key.Key_VolumeMute: 'MUTE',
    **{getattr(Qt.Key, f'Key_F{n}'): f'F{n}' for n in range(1, 13)},
}
_TEXT_NAMES = {'#': 'SHARP'}


def mpv_key_name(key, text='', modifiers=Qt.KeyboardModifier.NoModifier):
    """Qt key event -> mpv input name ('SPACE', 'Ctrl+LEFT', 'f', 'Shift+F1'), or None."""
    key = int(getattr(key, 'value', key))
    modifiers = Qt.KeyboardModifier(modifiers)
    prefix = [name for flag, name in ((Qt.KeyboardModifier.ControlModifier, 'Ctrl'), (Qt.KeyboardModifier.AltModifier, 'Alt'),
                                      (Qt.KeyboardModifier.MetaModifier, 'Meta')) if modifiers & flag]
    special = {int(k.value): v for k, v in _SPECIAL_KEYS.items()}.get(key)
    if special:
        if modifiers & Qt.KeyboardModifier.ShiftModifier:
            prefix.append('Shift')
        return '+'.join([*prefix, special])
    if text and len(text) == 1 and text.isprintable() and not text.isspace():
        return '+'.join([*prefix, _TEXT_NAMES.get(text, text)])
    if int(Qt.Key.Key_A.value) <= key <= int(Qt.Key.Key_Z.value):
        letter = chr(key)
        return '+'.join([*prefix, letter if modifiers & Qt.KeyboardModifier.ShiftModifier else letter.lower()])
    if 0x20 < key < 0x7f:
        return '+'.join([*prefix, _TEXT_NAMES.get(chr(key), chr(key))])
    return None


_BUTTONS = {Qt.MouseButton.LeftButton: 'MBTN_LEFT', Qt.MouseButton.RightButton: 'MBTN_RIGHT',
            Qt.MouseButton.MiddleButton: 'MBTN_MID', Qt.MouseButton.BackButton: 'MBTN_BACK',
            Qt.MouseButton.ForwardButton: 'MBTN_FORWARD'}


# View -----------------------------------------------------------------------------------------------------------
class _Layer:
    __slots__ = ('name', 'player', 'fbo', 'alpha', 'armed', 'has_frame')

    def __init__(self, name, player, alpha):
        self.name, self.player, self.alpha = name, player, alpha
        self.fbo = None
        self.armed = False
        self.has_frame = False


class CinemaView(QOpenGLWidget):
    """Renders every attached libmpv core into its own FBO and composites them with per-layer opacity."""

    frameReady = Signal(str)      # The first real frame of a layer has been composited.
    glFailed = Signal(str)
    activity = Signal()           # Pointer moved over the picture.
    mouseMoved = Signal(QPointF)  # Device pixels.
    mouseButton = Signal(str, bool)
    mouseDouble = Signal(str)
    wheel = Signal(str)
    _wake = Signal()

    ORDER = ('intro', 'film')

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName('cinemaView')
        self.setMouseTracking(True)
        self.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self.layers = {}
        self.seen = set()
        self.initialized = False
        self.failure = ''
        self.background = QColor(BACKGROUND)
        self.poster = None
        self._poster_texture = None
        self._poster_dirty = False
        self._blitter = None
        self._bind_vao = None
        self._bind_sampler = None
        self.first_paint_at = None
        self._wake.connect(self.update, Qt.ConnectionType.QueuedConnection)
        self.frameSwapped.connect(self._swapped)

    # Layers -------------------------------------------------------------------------------------------------
    def attach(self, name, player, alpha=1.0):
        self.detach(name)
        layer = _Layer(name, player, alpha)
        self.layers[name] = layer
        player.set_update_callback(self._wake.emit)  # mpv thread -> queued repaint on the UI thread.
        if self.initialized and self._make_current():
            try:
                self._create_render_context(layer)
            finally:
                self.doneCurrent()
        self.update()
        return layer

    def detach(self, name):
        layer = self.layers.pop(name, None)
        self.seen.discard(name)
        if layer is None:
            return None
        if self._make_current():
            try:
                layer.player.free_render_context()
                layer.fbo = None
            finally:
                self.doneCurrent()
        layer.fbo = None
        self.update()
        return layer.player

    def arm(self, name):
        """The core reported a decoded frame (playback-restart): show it from the next paint on."""
        layer = self.layers.get(name)
        if layer is not None and not layer.armed:
            layer.armed = True
            self.update()

    def disarm(self, name):
        layer = self.layers.get(name)
        if layer is not None:
            layer.armed = layer.has_frame = False
            self.seen.discard(name)
            self.update()

    def set_alpha(self, name, alpha):
        layer = self.layers.get(name)
        if layer is not None:
            layer.alpha = min(max(float(alpha), 0.0), 1.0)
            self.update()

    def alpha(self, name):
        layer = self.layers.get(name)
        return layer.alpha if layer is not None else 0.0

    def set_poster(self, image):
        """QImage (or path) painted under the layers until a fully opaque frame covers it."""
        if isinstance(image, (str, Path)):
            image = QImage(str(image))
        self.poster = image if image is not None and not image.isNull() else None
        self._poster_dirty = True
        self.update()

    # GL -----------------------------------------------------------------------------------------------------
    def _make_current(self):
        context = self.context()
        if not self.initialized or context is None or not context.isValid():
            return False
        self.makeCurrent()
        return True

    @staticmethod
    def _proc(name):
        context = QOpenGLContext.currentContext()
        if context is None:
            return None
        address = context.getProcAddress(name)
        try:
            return int(address) if address else None
        except TypeError:
            return None

    def _create_render_context(self, layer):
        layer.player.create_render_context(self._proc)

    def initializeGL(self):
        try:
            context = self.context()
            context.aboutToBeDestroyed.connect(self._context_lost, Qt.ConnectionType.DirectConnection)
            self._blitter = QOpenGLTextureBlitter()
            if not self._blitter.create():
                raise RuntimeError('QOpenGLTextureBlitter could not be created')
            vao = self._proc(b'glBindVertexArray')
            sampler = self._proc(b'glBindSampler')
            self._bind_vao = ctypes.CFUNCTYPE(None, ctypes.c_uint)(vao) if vao else None
            self._bind_sampler = ctypes.CFUNCTYPE(None, ctypes.c_uint, ctypes.c_uint)(sampler) if sampler else None
            self.initialized = True
            for layer in self.layers.values():
                self._create_render_context(layer)
            self._poster_dirty = True
        except Exception as error:  # A driver without the needed GL: the caller falls back.
            self.initialized = False
            self.failure = str(error) or type(error).__name__
            log.warning('Cinema OpenGL initialisation failed: %s', self.failure)
            QTimer.singleShot(0, lambda: self.glFailed.emit(self.failure))

    def _context_lost(self):
        """The native window is being recreated: free GL objects; initializeGL rebuilds them."""
        if not self.initialized:
            return
        self.makeCurrent()
        try:
            for layer in self.layers.values():
                layer.player.free_render_context()
                layer.fbo = None
                layer.has_frame = False
            if self._poster_texture is not None:
                self._poster_texture.destroy()
                self._poster_texture = None
            if self._blitter is not None:
                self._blitter.destroy()
                self._blitter = None
        finally:
            self.initialized = False
            self.doneCurrent()

    def release(self):
        """Free every GL object while the context still exists (application shutdown)."""
        self._context_lost()

    def _restore_state(self, gl):
        """libmpv leaves its own GL bindings behind; reset them before the next core or Qt draws."""
        for target in (GL_ARRAY_BUFFER, GL_ELEMENT_ARRAY_BUFFER, GL_PIXEL_PACK_BUFFER, GL_PIXEL_UNPACK_BUFFER):
            gl.glBindBuffer(target, 0)
        for unit in range(4):
            gl.glActiveTexture(GL_TEXTURE0 + unit)
            gl.glBindTexture(GL_TEXTURE_2D, 0)
            if self._bind_sampler is not None:
                self._bind_sampler(unit, 0)
        gl.glActiveTexture(GL_TEXTURE0)
        gl.glUseProgram(0)
        if self._bind_vao is not None:
            self._bind_vao(0)
        for name, value in ((GL_UNPACK_ALIGNMENT, 4), (GL_PACK_ALIGNMENT, 4), (GL_UNPACK_ROW_LENGTH, 0), (GL_PACK_ROW_LENGTH, 0)):
            gl.glPixelStorei(name, value)
        for capability in (GL_SCISSOR_TEST, GL_DEPTH_TEST, GL_STENCIL_TEST, GL_CULL_FACE):
            gl.glDisable(capability)

    def _device_size(self):
        ratio = self.devicePixelRatioF()
        return max(1, round(self.width() * ratio)), max(1, round(self.height() * ratio))

    def paintGL(self):
        if not self.initialized:
            return
        gl = self.context().functions()
        width, height = self._device_size()
        fresh = []
        for name in self.ORDER:
            layer = self.layers.get(name)
            if layer is None or not layer.player.render_context:
                continue
            flags = layer.player.update_flags()
            resized = layer.fbo is None or layer.fbo.size() != QSize(width, height)
            if resized:
                layer.fbo = QOpenGLFramebufferObject(QSize(width, height))
            if flags & libmpv.RENDER_UPDATE_FRAME or resized or (layer.armed and not layer.has_frame):
                layer.player.render(layer.fbo.handle(), width, height, flip=True)
                self._restore_state(gl)
                if layer.armed and not layer.has_frame:
                    layer.has_frame = True
                    fresh.append(name)
        gl.glBindFramebuffer(GL_FRAMEBUFFER, self.defaultFramebufferObject())
        gl.glViewport(0, 0, width, height)
        gl.glClearColor(self.background.redF(), self.background.greenF(), self.background.blueF(), 1.0)
        gl.glClear(GL_COLOR_BUFFER_BIT)
        gl.glEnable(GL_BLEND)
        gl.glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA)
        self._blitter.bind()
        viewport = QRect(0, 0, width, height)
        covered = any(l.has_frame and l.alpha >= 0.999 for l in self.layers.values())
        if not covered:
            self._draw_poster(viewport)
        full = QOpenGLTextureBlitter.targetTransform(QRectF(viewport), viewport)
        for name in self.ORDER:
            layer = self.layers.get(name)
            if layer is None or not layer.has_frame or layer.alpha <= 0.0 or layer.fbo is None:
                continue
            self._blitter.setOpacity(layer.alpha)
            self._blitter.blit(layer.fbo.texture(), full, QOpenGLTextureBlitter.Origin.OriginBottomLeft)
        self._blitter.setOpacity(1.0)
        self._blitter.release()
        gl.glDisable(GL_BLEND)
        if self.first_paint_at is None:
            self.first_paint_at = time.monotonic()
        for name in fresh:
            self.seen.add(name)
            QTimer.singleShot(0, lambda name=name: self.frameReady.emit(name))

    def _draw_poster(self, viewport):
        if self._poster_dirty:
            if self._poster_texture is not None:
                self._poster_texture.destroy()
            self._poster_texture = QOpenGLTexture(self.poster.convertToFormat(QImage.Format.Format_RGBA8888)) if self.poster else None
            if self._poster_texture is not None:
                self._poster_texture.setMinMagFilters(QOpenGLTexture.Filter.Linear, QOpenGLTexture.Filter.Linear)
            self._poster_dirty = False
        if self._poster_texture is None:
            return
        image_w, image_h = self.poster.width(), self.poster.height()
        scale = max(viewport.width() / image_w, viewport.height() / image_h)  # Cover, like the intro's panscan.
        w, h = image_w * scale, image_h * scale
        target = QRectF((viewport.width() - w) / 2.0, (viewport.height() - h) / 2.0, w, h)
        self._blitter.setOpacity(1.0)
        self._blitter.blit(self._poster_texture.textureId(), QOpenGLTextureBlitter.targetTransform(target, viewport),
                           QOpenGLTextureBlitter.Origin.OriginTopLeft)

    def _swapped(self):
        for layer in self.layers.values():
            layer.player.report_swap()

    # Pointer ------------------------------------------------------------------------------------------------
    def _device_point(self, position):
        ratio = self.devicePixelRatioF()
        return QPointF(position.x() * ratio, position.y() * ratio)

    def mouseMoveEvent(self, event):
        self.activity.emit()
        self.mouseMoved.emit(self._device_point(event.position()))
        super().mouseMoveEvent(event)

    def mousePressEvent(self, event):
        name = _BUTTONS.get(event.button())
        if name:
            self.mouseMoved.emit(self._device_point(event.position()))
            self.mouseButton.emit(name, True)
        super().mousePressEvent(event)

    def mouseReleaseEvent(self, event):
        name = _BUTTONS.get(event.button())
        if name:
            self.mouseButton.emit(name, False)
        super().mouseReleaseEvent(event)

    def mouseDoubleClickEvent(self, event):
        name = _BUTTONS.get(event.button())
        if name:
            self.mouseDouble.emit(name + '_DBL')
        super().mouseDoubleClickEvent(event)

    def wheelEvent(self, event):
        delta = event.angleDelta()
        if delta.y():
            self.wheel.emit('WHEEL_UP' if delta.y() > 0 else 'WHEEL_DOWN')
        elif delta.x():
            self.wheel.emit('WHEEL_LEFT' if delta.x() < 0 else 'WHEEL_RIGHT')
        event.accept()


# Surface --------------------------------------------------------------------------------------------------------
class CinemaSurface(QObject):
    """Phases: idle -> intro -> warmup -> dissolve -> film (-> ended / stopped / failed)."""

    filmStarted = Signal()     # Dissolve began: the film's first frame is on screen and playing.
    filmDissolved = Signal()   # The intro is gone.
    filmEnded = Signal(int)    # 0: end of file or quit, 2: the stream failed.
    fullscreenRequested = Signal(bool)
    failed = Signal(str)       # OpenGL / libmpv cannot be used: fall back to the external mpv window.
    _events = Signal()

    PLAYING = ('dissolve', 'film')

    def __init__(self, parent=None, *, view=None, player_factory=None, timeout=FIRST_FRAME_TIMEOUT):
        super().__init__(parent)
        self.view = view if view is not None else CinemaView()
        self.player_factory = player_factory or libmpv.Mpv
        self.timeout = timeout
        self.handles = {}
        self.phase = 'idle'
        self.timeline = None
        self.failure = ''
        self.presented_at = None
        self.intro_frame_at = None
        self.film_loaded_at = None
        self.film_frame_at = None
        self.film_started_at = None
        self._film_alive = False
        self._film_exit = None
        self._fullscreen = None
        self.started = threading.Event()  # Set when the film plays or ends (CinemaEngine waits on it).
        self.dissolve = QVariantAnimation(self)
        self.dissolve.setStartValue(0.0)
        self.dissolve.setEndValue(1.0)
        self.dissolve.setDuration(DISSOLVE_MS)
        self.dissolve.setEasingCurve(QEasingCurve.Type.Linear)  # Timeline applies the easing.
        self.dissolve.valueChanged.connect(self._dissolve_step)
        self.dissolve.finished.connect(self._dissolve_done)
        self.audio_fade = QVariantAnimation(self)
        self.audio_fade.setStartValue(1.0)
        self.audio_fade.setEndValue(0.0)
        self.audio_fade.valueChanged.connect(self._audio_fade_step)
        self.ready_timer = QTimer(self)
        self.ready_timer.setInterval(READY_POLL_MS)
        self.ready_timer.timeout.connect(self._check_ready)
        self.watchdog = QTimer(self)
        self.watchdog.setSingleShot(True)
        self.watchdog.setInterval(GL_WATCHDOG_MS)
        self.watchdog.timeout.connect(self._check_gl)
        self._events.connect(self._drain, Qt.ConnectionType.QueuedConnection)
        self.view.frameReady.connect(self._frame_ready)
        self.view.glFailed.connect(self._fail)
        self.view.mouseMoved.connect(self._mouse_moved)
        self.view.mouseButton.connect(self._mouse_button)
        self.view.mouseDouble.connect(self.send_key)
        self.view.wheel.connect(self.send_key)

    # Players ------------------------------------------------------------------------------------------------
    def _open(self, name, options):
        player = self.player_factory(list(options))
        player.set_wakeup_callback(self._events.emit)
        if name == 'film':
            player.observe('fullscreen')  # mpv's f / Esc / double-click ask the window to change mode.
        self.handles[name] = player
        self.view.attach(name, player, 1.0 if name == 'intro' else 0.0)
        return player

    def _close(self, name):
        player = self.handles.pop(name, None)
        self.view.detach(name)
        if player is not None:
            player.terminate()

    def _open_players(self):
        """The intro starts at once; the film core is created now so loading it later costs nothing."""
        if 'intro' not in self.handles:
            intro = self._open('intro', INTRO_OPTIONS)
            intro.command('loadfile', str(INTRO_VIDEO))
        if 'film' not in self.handles:
            self._open('film', FILM_OPTIONS)

    # Public API ---------------------------------------------------------------------------------------------
    def present(self):
        """Start (or keep) the intro; idempotent while a launch is on screen."""
        if self.phase == 'unavailable':
            return False
        if self.phase in self.PLAYING or (self.phase != 'idle' and 'intro' in self.handles):
            return True
        self.presented_at = time.monotonic()
        self.intro_frame_at = None
        self.view.set_poster(INTRO_FIRST_FRAME if INTRO_FIRST_FRAME.is_file() else INTRO_STILL)
        try:
            self._open_players()
        except libmpv.MpvError as error:
            self._fail(f'libmpv: {error}')
            return False
        if self.phase in ('idle', 'stopped', 'ended'):
            self.phase = 'intro'
        self.watchdog.start()
        return True

    def load_film(self, url, options=()):
        """Load the film paused and muted under the intro; the dissolve starts once it is ready."""
        if self.phase == 'unavailable':
            raise RuntimeError(self.failure or 'Видеоповерхность недоступна')
        self.dissolve.stop()
        self.ready_timer.stop()
        if 'intro' not in self.handles and self.phase not in self.PLAYING:
            self.present()
        film = self.handles.get('film') or self._open('film', FILM_OPTIONS)
        self.view.disarm('film')
        self.view.set_alpha('film', 0.0)
        if 'intro' in self.handles:
            self.view.set_alpha('intro', 1.0)
        else:
            self.view.set_poster(INTRO_STILL)  # A reconnect after the intro: the logo still, never black.
        for name, value in options:
            if not film.try_set(name, value):
                log.debug('mpv option %s was not accepted', name)
        film.set('pause', True)
        film.set('volume', 0)
        film.try_set('osc', False)
        film.try_set('osd-level', 0)
        self._film_alive, self._film_exit = True, None
        self.started.clear()
        self.film_loaded_at, self.film_frame_at, self.film_started_at = time.monotonic(), None, None
        self.phase = 'warmup'
        film.command('loadfile', url, 'replace')

    def stop_film(self):
        """Stop the film (engine.stop); the intro, if still there, keeps playing."""
        self.dissolve.stop()
        self.ready_timer.stop()
        film = self.handles.get('film')
        if film is not None and self._film_alive:
            try:
                film.command('stop')
            except libmpv.MpvError:
                pass
        self._film_alive, self._film_exit = False, None
        self.started.set()
        self.view.disarm('film')
        self.view.set_alpha('film', 0.0)
        intro = self.handles.get('intro')
        if intro is not None:
            self.view.set_alpha('intro', 1.0)
            intro.try_set('volume', INTRO_VOLUME)
        if self.phase not in ('idle', 'unavailable'):
            self.phase = 'intro' if intro is not None else 'stopped'

    def reset(self):
        """The window is hidden: nothing may keep playing."""
        self.dissolve.stop()
        self.audio_fade.stop()
        self.ready_timer.stop()
        self.watchdog.stop()
        for name in list(self.handles):
            self._close(name)
        self._film_alive, self._film_exit = False, None
        self.started.set()
        if self.phase != 'unavailable':
            self.phase = 'idle'

    def shutdown(self):
        self.reset()
        self.view.release()

    def fade_audio(self, duration_ms):
        """Fade every sound out (cancel while the window fades)."""
        self.audio_fade.stop()
        self.audio_fade.setDuration(max(1, int(duration_ms)))
        self.audio_fade.start()

    def film_state(self):
        return self.phase

    def film_alive(self):
        return self._film_alive

    def film_exit_code(self):
        return self._film_exit

    def film_player(self):
        return self.handles.get('film')

    def accepts_input(self):
        return self.phase in self.PLAYING and 'film' in self.handles

    def set_fullscreen(self, full):
        """Mirror the window mode into mpv so its f / Esc / double-click bindings toggle correctly."""
        self._fullscreen = bool(full)
        film = self.handles.get('film')
        if film is not None:
            film.try_set('fullscreen', bool(full))

    def send_key(self, name):
        film = self.handles.get('film')
        if name and film is not None and self.accepts_input():
            try:
                film.command('keypress', name)
            except libmpv.MpvError:
                pass

    # Events -------------------------------------------------------------------------------------------------
    def _drain(self):
        for name, player in list(self.handles.items()):
            for _ in range(256):
                event = player.wait_event(0)
                if event is None:
                    break
                self._event(name, player, event)
                if self.handles.get(name) is not player:
                    break

    def _event(self, name, player, event):
        if event.id == libmpv.EVENT_PLAYBACK_RESTART:
            self.view.arm(name)
        elif event.id == libmpv.EVENT_PROPERTY_CHANGE and event.name == 'fullscreen' and name == 'film':
            if isinstance(event.value, bool) and event.value != self._fullscreen and self.accepts_input():
                self._fullscreen = event.value
                self.fullscreenRequested.emit(event.value)
        elif name == 'film' and event.id == libmpv.EVENT_END_FILE:
            if event.reason in (libmpv.END_EOF, libmpv.END_QUIT):
                self._film_finished(0)
            elif event.reason == libmpv.END_ERROR:
                self._film_finished(2)
        elif name == 'film' and event.id == libmpv.EVENT_SHUTDOWN:
            # «q» in the film: mpv's core is gone, the next launch opens a new one.
            self._close('film')
            if self._film_alive:
                self._film_finished(0)
        elif name == 'intro' and event.id == libmpv.EVENT_SHUTDOWN:
            self._close('intro')

    def _film_finished(self, code):
        if not self._film_alive:
            return
        was_playing = self.phase in self.PLAYING
        self.ready_timer.stop()
        self._film_alive, self._film_exit = False, code
        self.started.set()
        if was_playing:
            if self.dissolve.state() == QVariantAnimation.State.Running:
                self.dissolve.stop()
                self._dissolve_done()
            self.phase = 'ended'
        else:
            # Failed before its first frame: the intro stays (no black screen) while the caller retries.
            self.view.disarm('film')
            self.phase = 'failed' if code else 'ended'
        self.filmEnded.emit(code)

    def _frame_ready(self, name):
        now = time.monotonic()
        if name == 'intro' and self.intro_frame_at is None:
            self.intro_frame_at = now
            self.watchdog.stop()
            if self.presented_at is not None:
                log.info('Intro first frame after %.0f ms', (now - self.presented_at) * 1000)
        elif name == 'film' and self.phase == 'warmup' and self.film_frame_at is None:
            self.film_frame_at = now
            if self.film_loaded_at is not None:
                log.info('Film first frame decoded after %.0f ms', (now - self.film_loaded_at) * 1000)
            self.ready_timer.start()
            self._check_ready()

    def _check_ready(self):
        """Smart prestart: a decoded first frame plus a little buffer, or the hold limit."""
        if self.phase != 'warmup' or self.film_frame_at is None:
            self.ready_timer.stop()
            return
        film = self.handles.get('film')
        if film is None:
            return
        now = time.monotonic()
        if self.presented_at is not None and (now - self.presented_at) * 1000 < MIN_INTRO_MS:
            return
        cached = film.get('demuxer-cache-duration')
        idle = film.get('demuxer-cache-idle')
        held = (now - self.film_frame_at) * 1000
        if (isinstance(cached, (int, float)) and cached >= PRESTART_CACHE_SECONDS) or idle is True or held >= PRESTART_MAX_HOLD_MS:
            self._begin_dissolve()

    def _begin_dissolve(self):
        film = self.handles.get('film')
        if film is None or self.phase != 'warmup':
            return
        self.ready_timer.stop()
        self.phase = 'dissolve'
        self.film_started_at = time.monotonic()
        self.timeline = Timeline()
        if self._fullscreen is not None:
            film.try_set('fullscreen', self._fullscreen)
        film.set('pause', False)
        self.started.set()
        self.filmStarted.emit()
        if 'intro' in self.handles:
            self.dissolve.start()
        else:
            self._dissolve_step(1.0)
            self._dissolve_done()

    def _dissolve_step(self, value):
        if self.timeline is None:
            self.timeline = Timeline()
        self.timeline.set_progress(value)
        self.view.set_alpha('film', self.timeline.film_alpha)
        self.view.set_alpha('intro', self.timeline.intro_alpha)
        intro, film = self.handles.get('intro'), self.handles.get('film')
        if intro is not None:
            intro.try_set('volume', round(INTRO_VOLUME * self.timeline.intro_volume, 1))
        if film is not None:
            film.try_set('volume', round(FILM_VOLUME * self.timeline.film_volume, 1))

    def _dissolve_done(self):
        if self.phase not in self.PLAYING:
            return
        self._dissolve_step(1.0)
        self._close('intro')
        self.view.set_poster(INTRO_STILL)
        film = self.handles.get('film')
        if film is not None:
            film.try_set('volume', FILM_VOLUME)
            film.try_set('osd-level', 1)
            film.try_set('osc', True)
        if self.phase == 'dissolve':
            self.phase = 'film'
        self.filmDissolved.emit()

    def _audio_fade_step(self, value):
        for name, player in self.handles.items():
            base = INTRO_VOLUME if name == 'intro' else FILM_VOLUME
            if name == 'film' and self.phase == 'dissolve' and self.timeline is not None:
                base *= self.timeline.film_volume
            player.try_set('volume', round(base * float(value), 1))

    # Input --------------------------------------------------------------------------------------------------
    def _mouse_moved(self, point):
        film = self.handles.get('film')
        if film is not None and self.accepts_input():
            try:
                film.command('mouse', int(point.x()), int(point.y()))
            except libmpv.MpvError:
                pass

    def _mouse_button(self, name, down):
        film = self.handles.get('film')
        if film is not None and self.accepts_input():
            try:
                film.command('keydown' if down else 'keyup', name)
            except libmpv.MpvError:
                pass

    # Failure ------------------------------------------------------------------------------------------------
    def _check_gl(self):
        if self.phase != 'idle' and self.view.isVisible() and not self.view.initialized:
            self._fail(self.view.failure or 'OpenGL context was not created')

    def _fail(self, reason):
        if self.phase == 'unavailable':
            return
        log.warning('Cinema prestart disabled: %s', reason)
        self.failure = str(reason)
        film_was_loading = self._film_alive
        self.reset()
        self.phase = 'unavailable'
        self._film_alive, self._film_exit = False, (2 if film_was_loading else None)
        self.failed.emit(self.failure)


# Engine adapter -------------------------------------------------------------------------------------------------
class _Dispatcher(QObject):
    call = Signal(object)

    def __init__(self):
        super().__init__()
        self.call.connect(self.run_job, Qt.ConnectionType.QueuedConnection)

    @Slot(object)
    def run_job(self, job):
        job()


def options_from_args(args):
    """['--alang=ru,rus', '--aid=2', '--force-media-title=X', '--fullscreen'] -> [(name, value)] minus window flags."""
    options = []
    for arg in args or ():
        if not isinstance(arg, str) or not arg.startswith('--'):
            continue
        name, has_value, value = arg[2:].partition('=')
        if not has_value:
            name, value = (name[3:], 'no') if name.startswith('no-') else (name, 'yes')
        if name and name not in WINDOW_OPTIONS:
            options.append((name, value))
    return options


class CinemaEngine:
    """engine.Mpv-compatible facade: launch code keeps calling start/stop/alive/wait_playback_started."""

    executable = 'libmpv'
    UI_TIMEOUT = 5.0

    def __init__(self, surface):
        self.surface = surface
        self._dispatcher = _Dispatcher()
        self._dispatcher.moveToThread(surface.thread())

    def _ui(self, fn):
        """Run fn on the surface's (UI) thread and return its result; workers block until it ran."""
        if QThread.currentThread() is self.surface.thread():
            return fn()
        done, box = threading.Event(), {}

        def job():
            try:
                box['value'] = fn()
            except BaseException as error:  # Re-raised in the calling worker.
                box['error'] = error
            finally:
                done.set()

        self._dispatcher.call.emit(job)
        if not done.wait(self.UI_TIMEOUT):
            raise TimeoutError('Видеоповерхность не отвечает')
        if 'error' in box:
            raise box['error']
        return box.get('value')

    def prewarm(self, *, extra_args=()):
        """The intro already runs under the splash; the film core is created with it."""

    def start(self, url, *, extra_args=()):
        parts = urlsplit(url)
        if parts.scheme != 'https' or not parts.netloc or parts.username or parts.password:
            raise ValueError('Only HTTPS media URLs are supported')
        options = options_from_args(extra_args)
        try:
            self._ui(lambda: self.surface.load_film(url, options))
        except libmpv.MpvError as error:
            raise RuntimeError(f'Не удалось запустить воспроизведение ({error}).') from error

    def stop(self):
        try:
            self._ui(self.surface.stop_film)
        except TimeoutError:
            pass

    def alive(self):
        return self.surface.film_alive()

    def exit_code(self):
        return self.surface.film_exit_code()

    def command(self, command):
        """The JSON-IPC style command list of engine.Mpv, applied to the film core."""
        if not command:
            return None
        verb = command[0]
        if verb == 'set_property' and len(command) >= 2 and command[1] in ('fullscreen', 'geometry'):
            return None  # The splash window is the video window and handles its own mode.
        player = self.surface.film_player()
        if player is None or not self.surface.film_alive():
            raise OSError('mpv is not running')
        if verb == 'get_property' and len(command) == 2:
            return player.get(command[1])
        if verb == 'set_property' and len(command) == 3:
            player.set(command[1], command[2])
            return None
        try:
            player.command(*command)
        except libmpv.MpvError as error:
            raise RuntimeError('mpv отклонил команду воспроизведения.') from error
        return None

    def property(self, name):
        player = self.surface.film_player()
        return player.get(name) if player is not None else None

    def enable_osc(self):
        """The surface enables the OSC itself when the dissolve ends."""

    def wait_playback_started(self, timeout=FIRST_FRAME_TIMEOUT, *, cancelled=lambda: False, interval=0.1,
                              sleep=time.sleep, clock=time.monotonic):
        """'playing' once the dissolve starts; 'eof', 'exited', 'cancelled' or 'timeout' like engine.Mpv."""
        deadline = clock() + max(float(timeout), 0.0)
        while True:
            if cancelled():
                return 'cancelled'
            if self.surface.film_state() in CinemaSurface.PLAYING:
                return 'playing'
            if not self.surface.film_alive():
                return 'eof' if self.surface.film_exit_code() == 0 else 'exited'
            if clock() >= deadline:
                return 'timeout'
            sleep(interval)
