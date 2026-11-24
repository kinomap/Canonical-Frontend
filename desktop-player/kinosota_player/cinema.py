"""Seamless motion-design prestart: intro -> warm-up -> cross-dissolve -> film in one OpenGL surface.

The «Смотреть» click shows the KINOSOTA intro at once (first-frame poster on the very
first paint, the intro video right after). The film is loaded paused and muted in a
second libmpv core under the intro. As soon as its first frame is decoded and a few
seconds are buffered, the film starts and a cross-dissolve with a light fade-shadow
replaces the intro while an equal-power curve fades the intro sound out and the film
sound in. There is never a black frame, an emblem or a pause in between.

``CinemaEngine`` exposes the surface through the ``engine.Mpv`` interface so the
existing launch logic (retries, leases, first-frame waits) drives it unchanged.

Which intro plays is decided per launch by an ``intro_source.IntroSource`` (admin CMS): the
cached custom clip, the bundled one, or none at all. The decision is local and instant; the
server is asked in the background, so the film is never delayed by the network.
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
from . import intro_source
from .engine import WHEEL_VOLUME_STEP
from .intro_source import BUNDLED, BUNDLED_FIRST_FRAME, BUNDLED_STILL, BUNDLED_VIDEO, DISABLED, PLAYER_TARGETS, IntroChoice

log = logging.getLogger('kinosota.cinema')

ASSETS = intro_source.BUNDLED_DIR
INTRO_VIDEO = BUNDLED_VIDEO          # Always shipped: the graceful fallback for every custom-intro problem.
INTRO_FIRST_FRAME = BUNDLED_FIRST_FRAME
INTRO_STILL = BUNDLED_STILL

DISSOLVE_MS = 1200          # Cross-dissolve length once the film's first frame is ready.
SHADOW_DEPTH = 0.18         # Fade-shadow: the intro dims by up to 18 % mid-dissolve.
MIN_INTRO_MS = 5000         # The intro always runs at least 5 s, however fast the film or the Pre-roll is ready.
NO_INTRO_MAX_HOLD_MS = 0      # Intro switched off in the admin: the film starts on its first decoded frame.
PRESTART_CACHE_SECONDS = 2.5  # Buffered film seconds wanted before it is shown...
PRESTART_MAX_HOLD_MS = 4000   # ...but a decoded first frame never waits longer than this.
READY_POLL_MS = 100
# 0.2.4: a shown surface without an OpenGL context falls back to the external player only after this long. 2 s was
# shorter than a cold Wayland (GNOME Mutter) map of a fullscreen frameless window right after an auto-restart.
GL_WATCHDOG_MS = 5000
# A window the compositor has not exposed yet is waited for (re-armed watchdog) up to this long after present().
GL_EXPOSE_LIMIT_MS = 15000
# Window / DirectPlayer rebuild a failed surface before the next launch; after this many failures in a row without
# a single composited frame (a really broken driver) only once per CINEMA_REBUILD_COOLDOWN_S.
CINEMA_REBUILD_LIMIT = 3
CINEMA_REBUILD_COOLDOWN_S = 300.0
INTRO_VOLUME = 100
FILM_VOLUME = 100
BACKGROUND = QColor('#070b0e')
FIRST_FRAME_TIMEOUT = 30
# Pre-roll (Ad Studio surfaces player_telegram / player_torrents): Intro -> Pre-roll -> film. The ad plays in its own
# 'ad' core under the intro layer: it is loaded (paused, first frame decoded) while the intro runs, so the hand-over
# never re-initialises a demuxer on screen (no `loadfile replace` of the intro). At the hand-over the ad is unpaused
# WITH sound (INTRO_VOLUME) and the intro cross-fades away over the moving ad; the film later dissolves in over it.
AD_WAIT_MS = 5000           # A ready film waits this long for a Pre-roll that is still being prepared, never longer.
AD_LOAD_TIMEOUT_S = 10.0    # The ad clip must start playing within this time.
AD_GRACE_S = 15.0           # ...and end within its declared duration plus this (stalls never block the film).
AD_DEFAULT_MAX_S = 120.0
AD_CROSSFADE_MS = 900       # Intro -> Pre-roll: the intro dissolves over the already moving ad.
# The Pre-roll starts as soon as the intro reached MIN_INTRO_MS; the rest of the intro clip is never waited for.

COMMON_OPTIONS = [
    ('vo', 'libmpv'), ('hwdec', 'auto-safe'), ('terminal', 'no'), ('config', 'no'), ('idle', 'yes'),
    ('ytdl', 'no'), ('load-scripts', 'no'), ('input-vo-keyboard', 'no'), ('audio-client-name', 'KINOSOTA Player'),
    ('sub-auto', 'no'), ('audio-display', 'no'),
]
# The film core's OSC and track menu are mpv scripts drawn by mpv's own OSD (no widget over the film). The bundled
# libmpv 0.35 has no select.lua and its OSC cannot rebind the track buttons, so the film core runs a copy of the
# 0.35 osc.lua whose right click on the audio (💬) / subtitle button opens kinosota_tracks.lua: the
# «Select an audio track:» / «Select a subtitle track:» menu of select.lua. The menu tells us when it is on screen
# (script-message kinosota-menu open|closed), so the mouse wheel scrolls it instead of changing the volume.
MPV_SCRIPTS = Path(__file__).resolve().parent / 'assets' / 'mpv'
OSC_SCRIPT = MPV_SCRIPTS / 'osc.lua'
TRACK_MENU_SCRIPT = MPV_SCRIPTS / 'kinosota_tracks.lua'
MENU_STATE_MESSAGE = 'kinosota-menu'
FILM_SCRIPTS = os.pathsep.join(str(path) for path in (OSC_SCRIPT, TRACK_MENU_SCRIPT))
# The OSC bar and the window's ✕ (direct.DirectLaunchSplash) hide together this long after the last mouse move.
CHROME_HIDE_MS = 2500
# Shown once the intro is gone (_dissolve_done).
FILM_SCRIPT_OPTS = f'osc-visibility=never,osc-idlescreen=no,osc-hidetimeout={CHROME_HIDE_MS}'
# A fast wheel spin can report several notches in one event: the open menu gets at most this many steps per
# event, so a flick never floods mpv's input queue and the highlight runs line by line.
MENU_WHEEL_MAX_STEPS = 3
# The intro fills the window (panscan crops instead of letterboxing) and holds its last frame.
INTRO_OPTIONS = [*COMMON_OPTIONS, ('keep-open', 'always'), ('panscan', '1.0'), ('osd-level', '0'), ('osc', 'no'),
                 ('input-default-bindings', 'no'), ('pause', 'no'), ('volume', str(INTRO_VOLUME)),
                 ('background', '#070b0e'), ('background-color', '#070b0e')]
# The Pre-roll core: loaded paused under the intro (first frame decoded in advance), letterboxed, with full sound.
AD_OPTIONS = [*COMMON_OPTIONS, ('keep-open', 'always'), ('panscan', '0'), ('osd-level', '0'), ('osc', 'no'),
              ('input-default-bindings', 'no'), ('pause', 'yes'), ('volume', str(INTRO_VOLUME)), ('mute', 'no'),
              ('cache', 'yes'), ('background', '#070b0e'), ('background-color', '#070b0e')]
# The film starts paused and silent; mpv's own key bindings and OSC take over once it plays.
FILM_OPTIONS = [*COMMON_OPTIONS, ('keep-open', 'no'), ('pause', 'yes'), ('volume', '0'), ('osd-level', '0'), ('osc', 'no'),
                ('input-default-bindings', 'yes'), ('cache', 'yes'), ('demuxer-max-bytes', '150MiB'),
                ('demuxer-readahead-secs', '10'), ('cache-pause-wait', '1'), ('cache-pause-initial', 'no'),
                ('network-timeout', '60'), ('stream-lavf-o', 'reconnect=1,reconnect_streamed=1,reconnect_delay_max=3'),
                ('scripts', FILM_SCRIPTS), ('script-opts', FILM_SCRIPT_OPTS)]
# engine.Mpv window flags have no meaning here: the surface is the window.
WINDOW_OPTIONS = {'geometry', 'fullscreen', 'fs', 'native-fs', 'autofit', 'autofit-larger', 'force-window', 'title',
                  'input-ipc-server', 'idle', 'keep-open', 'vo', 'no-config', 'config', 'terminal', 'osd-level', 'osc'}

_GL_ORPHANS = []  # See CinemaView._orphan_gl.

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


def create_surface(parent=None, intro=None, *, bundled_only=False):
    """A CinemaSurface, or None (logged) when libmpv / OpenGL cannot be used.

    bundled_only: the shipped intro only, no admin intro from the server (packaged-app QA)."""
    reason = unavailable_reason()
    if reason:
        log.info('Cinema prestart unavailable, using the external mpv window: %s', reason)
        return None
    if bundled_only:
        return CinemaSurface(parent, intro=None)
    return CinemaSurface(parent, intro=intro if intro is not None else intro_source.shared())


class CinemaRecovery:
    """0.2.4: when a failed CinemaSurface may be rebuilt.

    A transient OpenGL / libmpv failure (a slow Wayland map after an auto-restart, a driver hiccup) must never cost
    the intro and the Pre-roll for the rest of the session: the next launch gets a fresh surface. Only a surface that
    keeps failing without ever compositing a frame is retried less often (CINEMA_REBUILD_LIMIT / _COOLDOWN_S)."""

    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.failures = 0          # In a row, without a composited frame in between.
        self.pending = False       # The current surface failed: rebuild before the next launch.
        self.last_failure = None
        self.last_reason = ''
        self.rebuilds = 0

    def failed(self, reason=''):
        self.failures += 1
        self.pending = True
        self.last_failure = self.clock()
        self.last_reason = str(reason or 'unknown')

    def healthy(self):
        """The surface composited a real frame: the driver works."""
        self.failures = 0

    def may_rebuild(self):
        if not self.pending:
            return False
        if self.failures < CINEMA_REBUILD_LIMIT:
            return True
        return self.last_failure is None or self.clock() - self.last_failure >= CINEMA_REBUILD_COOLDOWN_S

    def rebuilt(self):
        self.pending = False
        self.rebuilds += 1


def retire_surface(surface):
    """Free a failed surface for good (GL objects with a current context, cores, the view) once nothing uses it."""
    if surface is None:
        return
    try:
        surface.shutdown()
    except Exception as error:  # Never let a broken surface stop the next launch.
        log.warning('Retired cinema surface did not shut down cleanly: %s', error)
    for obj in (surface.view, surface):
        try:
            if obj is surface.view:
                obj.hide()
            obj.deleteLater()
        except (RuntimeError, AttributeError):
            pass


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


def wheel_volume_notches(angle_delta, inverted=False):
    """Signed volume notches of a wheel event (+1.0: one notch louder), 0.0 when it is not a volume gesture.

    Only the vertical wheel is a volume control. A tilt wheel or a sideways touchpad swipe does nothing,
    so no wheel movement can seek the film. High-resolution wheels and touchpads give fractions of a
    notch, which makes the volume glide. Natural (inverted) scrolling is undone: turning the wheel
    away from the hand always makes the film louder.
    """
    notches = angle_delta.y() / 120.0
    return -notches if inverted else notches


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
    volumeWheel = Signal(float)   # Signed wheel notches: the wheel is the volume control...
    menuWheel = Signal(str)       # ...except while the track menu is open: WHEEL_UP / WHEEL_DOWN scroll its list.
    _wake = Signal()

    ORDER = ('ad', 'intro', 'film')  # The intro dissolves over the ad, the film over both.

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
        self.menu_open = False
        self._menu_wheel = 0
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
        elif layer.fbo is not None:
            self._orphan_gl(layer.fbo)
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
        """True only when our context really is current: GL objects are never freed without it."""
        context = self.context()
        if not self.initialized or context is None or not context.isValid():
            return False
        self.makeCurrent()
        if QOpenGLContext.currentContext() is not context:
            log.warning('Cinema OpenGL context could not be made current')
            return False
        return True

    def _orphan_gl(self, *objects):
        """GL objects whose context cannot be made current: never destroy them without it (Wayland segfault 139,
        «QOpenGLTexturePrivate::destroy() called without a current context»). They go with the context."""
        for obj in objects:
            if obj is not None:
                _GL_ORPHANS.append(obj)

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
        context = self.context()
        current = False
        if context is not None and context.isValid():
            self.makeCurrent()
            current = QOpenGLContext.currentContext() is context
        try:
            for layer in self.layers.values():
                layer.player.free_render_context()  # libmpv needs it before the core is destroyed.
                if not current:
                    self._orphan_gl(layer.fbo)
                layer.fbo = None
                layer.has_frame = False
            if current:
                if self._poster_texture is not None:
                    self._poster_texture.destroy()
                if self._blitter is not None:
                    self._blitter.destroy()
            else:
                log.warning('Cinema OpenGL objects released without a current context; leaving them to the driver')
                self._orphan_gl(self._poster_texture, self._blitter)
            self._poster_texture = None
            self._blitter = None
            self._poster_dirty = True
        finally:
            self.initialized = False
            if current:
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
        if self.menu_open:
            for name in self._menu_wheel_steps(event.angleDelta().y()):
                self.menuWheel.emit(name)
            event.accept()
            return
        self._menu_wheel = 0
        notches = wheel_volume_notches(event.angleDelta(), event.inverted())
        if notches:
            self.volumeWheel.emit(notches)
        event.accept()


    def _menu_wheel_steps(self, delta):
        """One WHEEL_UP / WHEEL_DOWN per wheel notch; touchpad fractions add up to whole steps.

        A turn the other way starts afresh (an opposite remainder never cancels or delays it), and one event
        gives at most MENU_WHEEL_MAX_STEPS steps, all in the same direction."""
        delta = int(delta)
        if delta and self._menu_wheel and (delta > 0) != (self._menu_wheel > 0):
            self._menu_wheel = 0
        self._menu_wheel += delta
        steps = []
        while self._menu_wheel >= 120 and len(steps) < MENU_WHEEL_MAX_STEPS:
            steps.append('WHEEL_UP')
            self._menu_wheel -= 120
        while self._menu_wheel <= -120 and len(steps) < MENU_WHEEL_MAX_STEPS:
            steps.append('WHEEL_DOWN')
            self._menu_wheel += 120
        if abs(self._menu_wheel) >= 120:
            self._menu_wheel = 0  # Notches beyond the cap are dropped, never replayed later.
        return steps


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

    def __init__(self, parent=None, *, view=None, player_factory=None, timeout=FIRST_FRAME_TIMEOUT, intro=None):
        super().__init__(parent)
        self.view = view if view is not None else CinemaView()
        self.player_factory = player_factory or libmpv.Mpv
        self.timeout = timeout
        self.intro = intro              # IntroSource-like (current / refresh_async / quarantine); None: bundled only.
        self.intro_choice = BUNDLED     # What the launch on screen plays; fixed until the next present().
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
        self.menu_open = False          # The OSD track menu (kinosota_tracks.lua) is on screen.
        self.intro_target = None        # intro_source.target_for(launch): player_telegram / player_torrents.
        self._intro_pending = False     # Admin targets differ and the launch has not named its stream yet.
        self._ad = None                 # Pre-roll of the launch on screen (expect_preroll / queue_preroll).
        self._ad_token = 0
        self._loaded_core = None
        self._film_fade_from = FILM_VOLUME
        self.started = threading.Event()  # Set when the film plays or ends (CinemaEngine waits on it).
        self.dissolve = QVariantAnimation(self)
        self.dissolve.setStartValue(0.0)
        self.dissolve.setEndValue(1.0)
        self.dissolve.setDuration(DISSOLVE_MS)
        self.dissolve.setEasingCurve(QEasingCurve.Type.Linear)  # Timeline applies the easing.
        self.dissolve.valueChanged.connect(self._dissolve_step)
        self.dissolve.finished.connect(self._dissolve_done)
        self.ad_fade = QVariantAnimation(self)  # Intro -> Pre-roll cross-fade (the ad already plays underneath).
        self.ad_fade.setStartValue(0.0)
        self.ad_fade.setEndValue(1.0)
        self.ad_fade.setDuration(AD_CROSSFADE_MS)
        self.ad_fade.valueChanged.connect(self._ad_fade_step)
        self.ad_fade.finished.connect(self._ad_fade_done)
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
        self.ad_timer = QTimer(self)
        self.ad_timer.setInterval(READY_POLL_MS)
        self.ad_timer.timeout.connect(self._ad_tick)
        self._events.connect(self._drain, Qt.ConnectionType.QueuedConnection)
        self.view.frameReady.connect(self._frame_ready)
        self.view.glFailed.connect(self._fail)
        self.view.mouseMoved.connect(self._mouse_moved)
        self.view.mouseButton.connect(self._mouse_button)
        self.view.mouseDouble.connect(self.send_key)
        self.view.volumeWheel.connect(self.wheel_volume)
        self.view.menuWheel.connect(self.send_key)

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
        if name == 'film':
            self._set_menu_open(False)
        player = self.handles.pop(name, None)
        self.view.detach(name)
        if player is not None:
            player.terminate()

    def _open_players(self):
        """The intro starts at once; the film core is created now so loading it later costs nothing."""
        if self.intro_choice.enabled and 'intro' not in self.handles:
            intro = self._open('intro', INTRO_OPTIONS)
            intro.command('loadfile', str(self.intro_choice.video))
        if 'film' not in self.handles:
            self._open('film', FILM_OPTIONS)

    def _resolve_intro(self) -> IntroChoice:
        """Local and instant. Any problem means the bundled intro; the server is asked in the background."""
        if self.intro is None:
            return BUNDLED
        self._intro_pending = False
        try:
            choice = self._intro_for_target()
        except Exception as error:
            log.warning('Intro source failed, using the bundled intro: %s', error)
            choice = BUNDLED
        try:
            # Every launch asks the server again (no 60 s throttle): an admin switch applies to the next start.
            try:
                self.intro.refresh_async(force=True)
            except TypeError:  # An intro source without the force switch.
                self.intro.refresh_async()
        except Exception as error:
            log.info('Intro refresh could not start: %s', error)
        if not isinstance(choice, IntroChoice):
            return BUNDLED
        if choice.enabled and not Path(choice.video).is_file():
            return BUNDLED
        return choice

    def _intro_current(self, target):
        try:
            return self.intro.current(target)
        except TypeError:  # An intro source without per-target switches.
            return self.intro.current()

    def _intro_for_target(self):
        """The intro of this launch's environment. Unknown yet: play it only where every desktop target shows it."""
        if self.intro_target is not None:
            return self._intro_current(self.intro_target)
        flags = getattr(self.intro, 'player_targets', None)
        flags = flags() if callable(flags) else None
        if isinstance(flags, dict) and flags and not all(flags.values()):
            self._intro_pending = any(flags.values())  # Decided in set_intro_target once the stream is known.
            return DISABLED
        return self._intro_current(None)

    def set_intro_target(self, target):
        """Which desktop environment this launch is (``intro_source.target_for``).

        Called before ``present()`` the intro is simply resolved for it. Called while a prestart is already on
        screen (a website launch names its stream only after redeeming), a switched-off target drops the intro
        at once and the film starts on its first frame; a launch held on the still starts its intro now.
        """
        self.intro_target = target if target in PLAYER_TARGETS else None
        if self.intro is None or self.intro_target is None or self.phase not in ('intro', 'warmup') or self._ad_busy():
            return
        previous = self.intro_choice
        choice = self._resolve_intro()
        if not choice.enabled:
            self.intro_choice = choice
            if 'intro' in self.handles:
                self._close('intro')
                # Switched off for this environment: the clean splash background, never the intro's
                # final (logo) frame - it used to flash for a second before every such film.
                self.view.set_poster(None)
            if self.phase == 'warmup' and self.film_frame_at is not None:
                self._check_ready()
            return
        if previous.enabled or 'intro' in self.handles:
            return  # The intro on screen keeps playing: a clip is never swapped mid-play.
        self.intro_choice = choice
        self.presented_at, self.intro_frame_at = time.monotonic(), None
        self.view.set_poster(choice.first_frame)
        try:
            self._open('intro', INTRO_OPTIONS).command('loadfile', str(choice.video))
        except libmpv.MpvError as error:
            log.info('Intro could not be started: %s', error)

    # Pre-roll -----------------------------------------------------------------------------------------------
    def expect_preroll(self):
        """This launch may have a Pre-roll: a ready film waits up to AD_WAIT_MS for it. Returns the launch token."""
        self._end_ad(None, notify=False)
        self._ad_token += 1
        self._ad = {'token': self._ad_token, 'state': 'pending'}
        return self._ad_token

    def queue_preroll(self, token, url, *, duration=0.0, on_start=None, on_end=None):
        """Play ``url`` after the intro and before the film. False when it came too late for this launch."""
        ad = self._ad
        if ad is None or ad['token'] != token or ad['state'] != 'pending' or self.phase not in ('intro', 'warmup', 'failed'):
            return False
        try:
            duration = float(duration or 0)
        except (TypeError, ValueError):
            duration = 0.0
        ad.update(state='queued', url=str(url), on_start=on_start, on_end=on_end, queued_at=time.monotonic(), warm=False,
                  max_s=duration + AD_GRACE_S if duration > 0 else AD_DEFAULT_MAX_S)
        if not self._warm_ad(ad):
            self._end_ad('error')
            return True
        self.ad_timer.start()
        self._ad_tick()
        return True

    def _warm_ad(self, ad):
        """Load the ad paused in its own core under the intro: its first frame is decoded before the hand-over."""
        self._close('ad')
        try:
            core = self._open('ad', AD_OPTIONS)
            core.command('loadfile', ad['url'])
        except libmpv.MpvError as error:
            log.info('Pre-roll could not be prepared: %s', error)
            self._close('ad')
            return False
        ad['core'] = core
        return True

    def _ad_warmed(self, player):
        ad = self._ad
        if ad is None or ad.get('core') is not player:
            return
        if ad['state'] == 'queued' and not ad.get('warm'):
            ad['warm'] = True
            self._ad_tick()

    def cancel_preroll(self, token=None):
        """No Pre-roll after all (none planned, PRO, offline): the film no longer waits for one."""
        ad = self._ad
        if ad is None or (token is not None and ad['token'] != token) or ad['state'] not in ('pending', 'queued'):
            return
        ad['state'] = 'done'
        self.ad_timer.stop()
        self._close('ad')
        self._resume_after_ad()

    def preroll_state(self):
        return self._ad['state'] if self._ad is not None else None

    def _ad_busy(self):
        return self._ad is not None and self._ad['state'] in ('queued', 'playing')

    def _ad_holds(self, now):
        ad = self._ad
        if ad is None:
            return False
        if ad['state'] in ('queued', 'playing'):
            return True
        if ad['state'] == 'pending':
            if self.film_frame_at is not None and (now - self.film_frame_at) * 1000 >= AD_WAIT_MS:
                ad['state'] = 'done'  # The ad service is slow: the film is never held hostage by it.
                return False
            return True
        return False

    def _ad_tick(self):
        ad = self._ad
        if ad is None or ad['state'] not in ('queued', 'playing'):
            self.ad_timer.stop()
            return
        if self.phase not in ('intro', 'warmup', 'failed'):
            self._end_ad('error')
            return
        now = time.monotonic()
        core = self.handles.get('ad')
        if core is None or core is not ad.get('core'):
            self._end_ad('error')
            return
        if ad['state'] == 'queued':
            intro = self.handles.get('intro')
            intro_on = intro is not None and self.intro_choice.enabled and self.presented_at is not None
            if intro_on and (now - self.presented_at) * 1000 < MIN_INTRO_MS:
                return  # The intro always holds its 5 s minimum first (the ad warms up meanwhile)...
            if not ad.get('warm'):
                if now - ad['queued_at'] > AD_LOAD_TIMEOUT_S:
                    self._end_ad('error')  # A creative that never decodes never blocks the film.
                return
            # ...then the warmed-up Pre-roll takes over at once, without waiting for the end of the intro clip.
            self._start_ad(now)
            return
        if core.get('eof-reached') is True:
            self._end_ad('completion')
        elif now - ad['started_at'] > ad['max_s']:
            self._end_ad('error')

    def _start_ad(self, now):
        """The warmed-up ad starts WITH sound under the intro; the intro then cross-fades away over it."""
        ad = self._ad
        core = ad.get('core')
        try:
            core.try_set('mute', False)
            core.try_set('volume', INTRO_VOLUME)
            core.set('pause', False)
        except libmpv.MpvError as error:
            log.info('Pre-roll could not be started: %s', error)
            self._end_ad('error')
            return
        self.view.set_alpha('ad', 1.0)
        ad.update(state='playing', started_at=now, loaded=True)
        self._ad_callback(ad.get('on_start'))
        if 'intro' in self.handles:
            self.ad_fade.stop()
            self.ad_fade.start()

    def _ad_fade_step(self, value):
        intro = self.handles.get('intro')
        if intro is None:
            return
        left = 1.0 - float(value)
        self.view.set_alpha('intro', left)
        intro.try_set('volume', round(INTRO_VOLUME * left, 1))

    def _ad_fade_done(self):
        """The intro is gone for this launch: after the ad the film follows, never the intro again."""
        if self.phase in ('intro', 'warmup', 'failed') and 'ad' in self.handles:
            self._close('intro')

    def _end_ad(self, kind, *, notify=True):
        """The Pre-roll ended (completion / error): straight to the film, the intro (or its still) never returns."""
        ad = self._ad
        if ad is None or ad['state'] not in ('pending', 'queued', 'playing'):
            return
        state, ad['state'] = ad['state'], 'done'
        self.ad_timer.stop()
        if state != 'playing':
            self._close('ad')  # Warmed up but never shown: nothing of it stays on screen.
            if notify:
                self._resume_after_ad()
            return
        # Intro -> Pre-roll -> film: the film takes over from the ad's last frame. The intro still is
        # never reloaded here, so the viewer never sees the intro (or its still) a second time.
        if notify:
            self._ad_callback(ad.get('on_end'), kind)
            self._resume_after_ad()

    @staticmethod
    def _ad_callback(callback, *args):
        if callable(callback):
            try:
                callback(*args)
            except Exception as error:  # Telemetry never breaks the launch.
                log.info('Pre-roll callback failed: %s', error)

    def _resume_after_ad(self):
        if self.phase == 'warmup' and self.film_frame_at is not None:
            self.ready_timer.start()
            self._check_ready()

    def _prestart_on_screen(self):
        if 'intro' in self.handles or 'ad' in self.handles:
            return True  # The Pre-roll (or its last frame) is on screen: the intro never restarts under it.
        return not self.intro_choice.enabled and self.phase in ('intro', 'warmup', 'failed')

    def _intro_unplayable(self, player):
        """A cached custom clip mpv cannot open: switch to the bundled intro in place, drop the bad file."""
        failed = self.intro_choice
        if not failed.custom:
            return  # The bundled intro itself: keep-open holds the poster, the film still dissolves in.
        log.warning('Custom intro %s failed to play, falling back to the bundled intro', failed.version)
        self.intro_choice = BUNDLED
        if self.intro is not None:
            try:
                self.intro.quarantine(failed.version)
            except Exception as error:
                log.info('Intro quarantine failed: %s', error)
        if self.phase not in self.PLAYING:
            self.view.set_poster(BUNDLED.first_frame)
        try:
            player.command('loadfile', str(BUNDLED.video))
        except libmpv.MpvError as error:
            log.info('Bundled intro could not be loaded: %s', error)

    # Public API ---------------------------------------------------------------------------------------------
    def _rest_poster(self):
        """Picture under the layers when no intro clip is on screen.

        The intro still (its final logo frame) only when this launch really plays the intro; otherwise
        (intro off for this environment, or the environment not decided yet) nothing, so the splash
        stays its plain dark background instead of flashing the bumper's last frame.
        """
        choice = self.intro_choice
        return choice.still if choice.enabled else None

    def present(self):
        """Start (or keep) the intro; idempotent while a launch is on screen."""
        if self.phase == 'unavailable':
            return False
        if self.phase in self.PLAYING or (self.phase != 'idle' and self._prestart_on_screen()):
            return True
        self.intro_choice = self._resolve_intro()
        self.presented_at = time.monotonic()
        self.intro_frame_at = None
        choice = self.intro_choice
        self.view.set_poster(choice.first_frame if choice.enabled else None)
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
            if self.phase == 'unavailable':  # present() failed (libmpv): never load a film on a dead surface.
                raise RuntimeError(self.failure or 'Видеоповерхность недоступна')
        film = self.handles.get('film') or self._open('film', FILM_OPTIONS)
        reloaded = self._loaded_core is film  # This core played (or tried) a film before: a reconnect.
        self.view.disarm('film')
        self.view.set_alpha('film', 0.0)
        if 'intro' in self.handles:
            self.view.set_alpha('intro', 1.0)
        else:
            self.view.set_poster(self._rest_poster())  # A reconnect after a played intro: its logo still; no intro: plain splash.
        for name, value in options:
            if not film.try_set(name, value):
                log.debug('mpv option %s was not accepted', name)
        film.set('pause', True)
        film.set('volume', 0)
        self._set_menu_open(False)
        if reloaded:  # A reconnect under the logo still: no menu, no controls until the film is back.
            self._film_script('kinosota_tracks', 'close')
            self._osc_visibility('never')  # A new core starts hidden by FILM_SCRIPT_OPTS.
        film.try_set('osd-level', 0)
        self._film_alive, self._film_exit = True, None
        self.started.clear()
        self.film_loaded_at, self.film_frame_at, self.film_started_at = time.monotonic(), None, None
        self.phase = 'warmup'
        self._loaded_core = film
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
        self._set_menu_open(False)
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
        self.ad_fade.stop()
        self.ready_timer.stop()
        self.watchdog.stop()
        self.ad_timer.stop()
        self._ad = None
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
        """Fade every sound out (cancel while the window fades); the film from the level the viewer set."""
        self.audio_fade.stop()
        self._film_fade_from = self._film_volume_level()
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

    def _film_script(self, script, *args):
        """script-message-to one of the film core's scripts; quietly nothing while they are still loading."""
        film = self.handles.get('film')
        if film is None:
            return False
        try:
            film.command('script-message-to', script, *args)
        except libmpv.MpvError:
            return False
        return True

    def _osc_visibility(self, mode):
        return self._film_script('osc', 'osc-visibility', mode, 'no-osd')

    def _set_menu_open(self, value):
        self.menu_open = bool(value)
        self.view.menu_open = self.menu_open
        self.view._menu_wheel = 0

    def release_mouse(self, name='MBTN_LEFT'):
        """The window manager took the pointer (window move): mpv must not keep the button held."""
        self._mouse_button(name, False)

    def send_key(self, name):
        film = self.handles.get('film')
        if name and film is not None and self.accepts_input():
            try:
                film.command('keypress', name)
            except libmpv.MpvError:
                pass

    def wheel_volume(self, notches):
        """The mouse wheel changes the film volume and never seeks.

        The wheel is not forwarded to mpv as WHEEL_UP / WHEEL_DOWN: the bundled libmpv binds those to
        «seek ±10 s» and its OSC seek bar reacts to them too, so the film jumped while the volume moved.
        Only the open track menu gets them (CinemaView.menuWheel): there they scroll its list.
        """
        film = self.handles.get('film')
        step = round(WHEEL_VOLUME_STEP * float(notches), 2)
        if not step or film is None or not self.accepts_input():
            return
        try:
            film.command('osd-auto', 'add', 'volume', f'{step:g}')  # mpv clamps it and shows its volume bar.
        except libmpv.MpvError:
            pass

    def _film_volume_level(self):
        film = self.handles.get('film')
        level = film.get('volume') if film is not None and self.phase == 'film' else None
        if isinstance(level, bool) or not isinstance(level, (int, float)):
            return FILM_VOLUME
        return float(level)

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
            if name == 'ad':
                self._ad_warmed(player)
        elif name == 'ad' and event.id == libmpv.EVENT_SHUTDOWN:
            self._close('ad')
            if self._ad is not None and self._ad['state'] in ('queued', 'playing'):
                self._end_ad('error')
        elif name == 'ad' and event.id == libmpv.EVENT_END_FILE and event.reason == libmpv.END_ERROR:
            if self._ad is not None and self._ad['state'] in ('queued', 'playing'):
                self._end_ad('error')  # A broken creative is skipped; the film is never blocked by it.
        elif event.id == libmpv.EVENT_PROPERTY_CHANGE and event.name == 'fullscreen' and name == 'film':
            if isinstance(event.value, bool) and event.value != self._fullscreen and self.accepts_input():
                self._fullscreen = event.value
                self.fullscreenRequested.emit(event.value)
        elif name == 'film' and event.id == libmpv.EVENT_END_FILE:
            if event.reason in (libmpv.END_EOF, libmpv.END_QUIT):
                self._film_finished(0)
            elif event.reason == libmpv.END_ERROR:
                self._film_finished(2)
        elif name == 'film' and event.id == libmpv.EVENT_CLIENT_MESSAGE:
            self._client_message(getattr(event, 'args', None) or [])
        elif name == 'film' and event.id == libmpv.EVENT_SHUTDOWN:
            # «q» in the film: mpv's core is gone, the next launch opens a new one.
            self._close('film')
            if self._film_alive:
                self._film_finished(0)
        elif name == 'intro' and event.id == libmpv.EVENT_SHUTDOWN:
            self._close('intro')
        elif name == 'intro' and event.id == libmpv.EVENT_END_FILE and event.reason == libmpv.END_ERROR:
            self._intro_unplayable(player)

    def _client_message(self, args):
        """«script-message kinosota-menu open|closed» from kinosota_tracks.lua."""
        if len(args) >= 2 and args[0] == MENU_STATE_MESSAGE:
            self._set_menu_open(args[1] == 'open' and self.accepts_input())

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
        if self._ad_holds(now):
            return  # Intro -> Pre-roll -> film: the warmed-up film waits for the ad.
        with_intro = self.intro_choice.enabled
        if with_intro and self.presented_at is not None and (now - self.presented_at) * 1000 < MIN_INTRO_MS:
            return
        cached = film.get('demuxer-cache-duration')
        idle = film.get('demuxer-cache-idle')
        held = (now - self.film_frame_at) * 1000
        hold_limit = PRESTART_MAX_HOLD_MS if with_intro else NO_INTRO_MAX_HOLD_MS
        if (isinstance(cached, (int, float)) and cached >= PRESTART_CACHE_SECONDS) or idle is True or held >= hold_limit:
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
        if 'intro' in self.handles or 'ad' in self.handles:
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
        intro, film, ad = self.handles.get('intro'), self.handles.get('film'), self.handles.get('ad')
        if intro is not None:
            intro.try_set('volume', round(INTRO_VOLUME * self.timeline.intro_volume, 1))
        if ad is not None:
            ad.try_set('volume', round(INTRO_VOLUME * self.timeline.intro_volume, 1))
        if film is not None:
            film.try_set('volume', round(FILM_VOLUME * self.timeline.film_volume, 1))

    def _dissolve_done(self):
        if self.phase not in self.PLAYING:
            return
        self._dissolve_step(1.0)
        self.ad_fade.stop()
        self._close('intro')
        self._close('ad')
        self.view.set_poster(self._rest_poster())
        film = self.handles.get('film')
        if film is not None:
            film.try_set('volume', FILM_VOLUME)
            film.try_set('osd-level', 1)
        self._osc_visibility('auto')  # mpv's own controls appear on the film only, never over the intro.
        if self.phase == 'dissolve':
            self.phase = 'film'
        self.filmDissolved.emit()

    def _audio_fade_step(self, value):
        for name, player in self.handles.items():
            base = INTRO_VOLUME if name in ('intro', 'ad') else self._film_fade_from
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
    def _exposed(self):
        """Has the compositor really mapped the window (Wayland configures it well after show())?"""
        try:
            window = self.view.window()
            handle = window.windowHandle() if window is not None else None
            return bool(handle is not None and handle.isExposed())
        except RuntimeError:
            return False

    def _check_gl(self):
        if self.phase in ('idle', 'unavailable') or self.view.initialized:
            return
        if not self.view.isVisible():
            log.info('Cinema GL watchdog: the window was hidden before OpenGL started; nothing to fall back from')
            return
        waited = (time.monotonic() - self.presented_at) * 1000 if self.presented_at is not None else GL_EXPOSE_LIMIT_MS
        exposed = self._exposed()
        if not self.view.failure and not exposed and waited < GL_EXPOSE_LIMIT_MS:
            log.info('Cinema GL watchdog: window not exposed by the compositor after %.0f ms, waiting', waited)
            self.watchdog.start()
            return
        platform = QGuiApplication.platformName() if QGuiApplication.instance() else ''
        self._fail(self.view.failure or f'OpenGL context was not created after {waited:.0f} ms '
                                        f'(platform {platform or "unknown"}, exposed {exposed})')

    def _fail(self, reason):
        if self.phase == 'unavailable':
            return
        log.warning('Cinema prestart disabled for this surface (phase %s): %s', self.phase, reason)
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
        self.fallback = None    # 0.2.4: the external engine.Mpv that replaces a failed surface (set by the owner).
        self._external = None   # ...once a start was handed to it: every later call goes there too.
        self._dispatcher = _Dispatcher()
        self._dispatcher.moveToThread(surface.thread())

    def _surface_failed(self):
        return getattr(self.surface, 'phase', None) == 'unavailable'

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
        if self.fallback is not None and self._surface_failed():
            return self._start_external(url, extra_args, self.surface.failure)
        try:
            self._ui(lambda: self.surface.load_film(url, options))
        except libmpv.MpvError as error:
            raise RuntimeError(f'Не удалось запустить воспроизведение ({error}).') from error
        except RuntimeError as error:
            # The surface broke while this start was on its way: the launch continues in the external window.
            if self.fallback is not None and self._surface_failed():
                return self._start_external(url, extra_args, error)
            raise
        self._external = None

    def _start_external(self, url, extra_args, reason):
        log.warning('Cinema surface unavailable (%s): this launch continues in the external mpv window', reason)
        self._external = self.fallback
        return self._external.start(url, extra_args=extra_args)

    def stop(self):
        if self._external is not None:
            self._external.stop()
            return
        try:
            self._ui(self.surface.stop_film)
        except TimeoutError:
            pass

    def alive(self):
        if self._external is not None:
            return self._external.alive()
        return self.surface.film_alive()

    def exit_code(self):
        if self._external is not None:
            return self._external.exit_code()
        return self.surface.film_exit_code()

    def command(self, command):
        """The JSON-IPC style command list of engine.Mpv, applied to the film core."""
        if self._external is not None:
            return self._external.command(command)
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
        if self._external is not None:
            return self._external.property(name)
        player = self.surface.film_player()
        return player.get(name) if player is not None else None

    def enable_osc(self):
        """The surface shows the OSC itself when the dissolve ends."""
        if self._external is not None:
            self._external.enable_osc()

    def wait_playback_started(self, timeout=FIRST_FRAME_TIMEOUT, *, cancelled=lambda: False, interval=0.1,
                              sleep=time.sleep, clock=time.monotonic):
        """'playing' once the dissolve starts; 'eof', 'exited', 'cancelled' or 'timeout' like engine.Mpv."""
        if self._external is not None:
            return self._external.wait_playback_started(timeout, cancelled=cancelled, interval=interval, sleep=sleep,
                                                        clock=clock)
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
