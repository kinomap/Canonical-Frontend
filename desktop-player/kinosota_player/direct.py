"""Minimal, no-login redemption and playback for website watch links."""
from __future__ import annotations

import sys
import time
import uuid
from urllib.parse import urlsplit

from PySide6.QtCore import (QAbstractAnimation, QEasingCurve, QObject, QPointF, QPropertyAnimation, QRect, QRectF,
                            QRunnable, QThreadPool, QTimer, Qt, Signal, Slot)
from PySide6.QtGui import QBrush, QColor, QCursor, QGuiApplication, QImage, QLinearGradient, QPainter, QRadialGradient
from PySide6.QtWidgets import (QApplication, QGraphicsOpacityEffect, QHBoxLayout, QLabel, QLayout, QPushButton,
                               QVBoxLayout, QWidget)

from .api import Api, ApiError
from .cinema import CHROME_HIDE_MS, INTRO_STILL, CinemaEngine, create_surface, mpv_key_name
from .deeplink import parse_launch, parse_mode
from .engine import FIRST_FRAME_TIMEOUT, Mpv
from .torrents import audio_args, media_title_args
from .ads import fetch_preroll, report as report_ad
from .intro_source import target_for

BACKGROUND, BACKGROUND_DEEP = '#070b0e', '#070b0e'  # Unified CinemaPrestartOverlay.vue palette.
ACCENT, ACCENT_DEEP = '#ffd400', '#ffb800'
TEXT, TEXT_MUTED = '#ffffff', 'rgba(255, 255, 255, 0.58)'
FADE_MS = 400  # Window fade when the launch is cancelled or handed to the external mpv window.
RESIZE_MS = 260
TEXT_FADE_MS = 280
CLOSE_FADE_MS = 220   # ✕ over the film fades in on pointer movement and out CHROME_HIDE_MS after the last one.
# The bottom share of the film window that belongs to mpv's OSC bar (0.35 bottombar: 56 of 720 virtual px, plus
# margin): a press there is a seek / button press, never the start of a window move.
OSC_BAND = 0.12
LONG_WAIT_MS = 15000   # The intro has ended and the film is still buffering: say so.
# Delay between mpv reporting its first frame (IPC) and the splash fade-out (external mpv window only).
FIRST_FRAME_FADE_DELAY_MS = 0

STARTING = 'Фильм запускается, подождите немного…'
CONNECTING = 'Подключаем медиапоток…'
RECONNECTING = 'Переподключаем медиапоток…'
BUFFERING = 'Буферизация видео…'


def stream_of(meta) -> str:
    """Return only a canonical HTTPS media-node stream URL."""
    if not isinstance(meta, dict):
        return ''
    value = meta.get('stream_url')
    if not isinstance(value, str) or not value or value != value.strip():
        return ''
    try:
        parts = urlsplit(value)
        _ = parts.port
        token = parts.path.removeprefix('/stream/')
        canonical = str(uuid.UUID(token))
    except (ValueError, AttributeError):
        return ''
    if (parts.scheme.lower() != 'https' or not parts.hostname or parts.username or parts.password
            or parts.fragment or parts.query or parts.path != f'/stream/{canonical}'):
        return ''
    return value


def catalog_movie_id(meta) -> str:
    """A redeemed KINOSOTA catalogue (Telegram) launch without a ready stream: its movie id, else ''.

    Such a launch is leased with its own single-use grant (``/desktop/playback/start``) right inside the
    direct player, under the same splash and intro as a torrent, instead of being handed to the app window.
    """
    if not isinstance(meta, dict) or meta.get('kind') != 'movie' or type(meta.get('tmdb_id')) is int:
        return ''
    movie_id, grant = meta.get('movie_id'), meta.get('access_token')
    if not isinstance(movie_id, str) or not movie_id.strip() or not isinstance(grant, str) or not grant.strip():
        return ''
    return movie_id.strip()


def lease_url(session) -> str:
    """The media URL of a playback lease (HTTPS only; it carries the node's playback token)."""
    value = session.get('media_url') if isinstance(session, dict) else None
    if not isinstance(value, str) or not value or value != value.strip():
        return ''
    try:
        parts = urlsplit(value)
    except ValueError:
        return ''
    if parts.scheme.lower() != 'https' or not parts.hostname or parts.username or parts.password or parts.fragment:
        return ''
    return value


def launch_args(meta) -> list[str]:
    """mpv start flags for the website's selected language, track, and title."""
    meta = meta if isinstance(meta, dict) else {}
    return [*audio_args(meta.get('audio_lang'), meta.get('audio_track')),
            *media_title_args(meta.get('title'))]


def _pixels(rect, ratio, platform):
    """Qt logical geometry -> mpv pixels. mpv uses physical pixels except on macOS (points)."""
    x, y, w, h = rect if isinstance(rect, tuple) else (rect.x(), rect.y(), rect.width(), rect.height())
    scale = 1.0 if platform == 'darwin' or not ratio or ratio <= 0 else float(ratio)
    return (round(x * scale), round(y * scale), max(1, round(w * scale)), max(1, round(h * scale)))


def geometry_text(rect, ratio=1.0, platform=sys.platform) -> str:
    """mpv --geometry value WxH+X+Y; a negative offset becomes +-N, which mpv reads as left/above the origin."""
    x, y, w, h = _pixels(rect, ratio, platform)
    return f'{w}x{h}+{x}+{y}'


def geometry_args(mode, rect, ratio=1.0, platform=sys.platform) -> list[str]:
    """mpv window flags that put the video exactly where the launch splash is.

    'full': fullscreen on the splash's monitor (the position picks the monitor);
    'compact': the same size and position as the splash window."""
    x, y, w, h = _pixels(rect, ratio, platform)
    if mode == 'full':
        args = ['--fullscreen', f'--geometry=+{x}+{y}']
        if platform == 'darwin':
            args.append('--native-fs=no')  # No macOS Space animation: the video appears under the splash.
        return args
    return [f'--geometry={w}x{h}+{x}+{y}']


class StillBackdrop(QWidget):
    """The intro's logo still, cropped to fill: the launch backdrop when libmpv / OpenGL is unavailable."""

    def __init__(self, parent=None, image=None):
        super().__init__(parent)
        self.setObjectName('cinemaStill')
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        self.image = image if image is not None else QImage(str(INTRO_STILL))

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)
        painter.fillRect(self.rect(), QColor(BACKGROUND))
        if not self.image.isNull():
            scale = max(self.width() / self.image.width(), self.height() / self.image.height())
            w, h = self.image.width() * scale, self.image.height() * scale
            painter.drawImage(QRectF((self.width() - w) / 2.0, (self.height() - h) / 2.0, w, h), self.image)
        shade = QLinearGradient(0, 0, 0, self.height())  # Keeps the status line readable at the bottom.
        shade.setColorAt(0.55, QColor(7, 11, 14, 0))
        shade.setColorAt(1.0, QColor(7, 11, 14, 200))
        painter.fillRect(self.rect(), QBrush(shade))
        painter.end()


SPLASH_STYLE = f"""
QLabel#directLaunchBrand {{ color: {ACCENT}; font-weight: 800; letter-spacing: 4px; }}
QLabel#directLaunchStatus {{ color: {TEXT}; font-weight: 600; }}
QLabel#directLaunchStatus[tone="error"] {{ color: {ACCENT}; }}
QLabel#directLaunchStatus[cinema="true"] {{ background: rgba(7, 11, 14, 0.62); border-radius: 12px; padding: 10px 18px; }}
QLabel#directLaunchHint {{ color: {TEXT_MUTED}; }}
QPushButton#directLaunchResize, QPushButton#directLaunchClose {{
    background: rgba(7, 11, 14, 0.46); color: {TEXT}; border: 1px solid rgba(255, 255, 255, 0.17);
    border-radius: 9px; font-size: 19px; min-width: 42px; min-height: 42px; max-width: 42px; max-height: 42px; }}
QPushButton#directLaunchResize:hover, QPushButton#directLaunchResize:focus {{
    background: rgba(255, 212, 0, 0.18); border-color: {ACCENT}; color: {ACCENT}; }}
QPushButton#directLaunchClose:hover, QPushButton#directLaunchClose:focus {{
    background: rgba(229, 72, 77, 0.24); border-color: #ff776e; color: #ffffff; }}
QPushButton#directLaunchResize:pressed, QPushButton#directLaunchClose:pressed {{ background: rgba(255, 255, 255, 0.16); }}
"""


class DirectLaunchSplash(QWidget):
    """The launch window: the KINOSOTA intro until the film dissolves in (cinema), or the logo still.

    With a CinemaSurface the window stays on screen as the film window once the film starts;
    without one it fades out over the external mpv window when mpv shows its first frame."""

    cancelRequested = Signal()
    modeChanged = Signal(str)
    faded = Signal()

    def __init__(self, parent=None, *, cinema=None):
        flags = Qt.WindowType.Window | Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint
        super().__init__(parent, flags)
        self.setObjectName('directLaunchSplash')
        self.setWindowTitle('KINOSOTA Player')
        self.setStyleSheet(SPLASH_STYLE)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.mode = 'full'
        self.error = False
        self.film_mode = False
        self.long_wait = False
        self.target_screen = None
        self.cinema = None
        self.backdrop = None
        self._drag_origin = None
        self._fading = False
        self._close_after_fade = False
        self._closing = False
        layout = QVBoxLayout(self)
        # The window must keep exactly target_geometry(): mpv gets the same rectangle (mpv_args), so wide system
        # fonts (Segoe UI on Windows) or a small monitor must not let the layout's minimum size grow the window.
        layout.setSizeConstraint(QLayout.SizeConstraint.SetNoConstraint)
        layout.setContentsMargins(24, 18, 18, 24)
        layout.setSpacing(12)
        top = QHBoxLayout()
        top.setSpacing(8)
        self.brand_label = QLabel('KINOSOTA <span style="color:rgba(255,255,255,0.58);font-style:italic;font-weight:600">PLAYER</span>', self)
        self.brand_label.setTextFormat(Qt.TextFormat.RichText)
        self.brand_label.setObjectName('directLaunchBrand')
        top.addWidget(self.brand_label, 0, Qt.AlignmentFlag.AlignVCenter)
        top.addStretch(1)
        self.resize_button = QPushButton('□', self)
        self.resize_button.setObjectName('directLaunchResize')
        self.resize_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self.resize_button.clicked.connect(lambda _checked=False: self.toggle_mode())
        top.addWidget(self.resize_button)
        self.close_button = QPushButton('✕', self)
        self.close_button.setObjectName('directLaunchClose')
        self.close_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self.close_button.setToolTip('Отменить запуск')
        self.close_button.setAccessibleName('Отменить запуск')
        self.close_button.clicked.connect(self.cancelRequested)  # Signal to signal: the checked flag is dropped.
        self.close_effect = QGraphicsOpacityEffect(self.close_button)
        self.close_effect.setOpacity(1.0)
        self.close_button.setGraphicsEffect(self.close_effect)
        self.close_fade = QPropertyAnimation(self.close_effect, b'opacity', self)
        self.close_fade.setDuration(CLOSE_FADE_MS)
        self.close_fade.setEasingCurve(QEasingCurve.Type.InOutCubic)
        self.close_fade.finished.connect(self._close_fade_finished)
        self.chrome_timer = QTimer(self)
        self.chrome_timer.setSingleShot(True)
        self.chrome_timer.setInterval(CHROME_HIDE_MS)
        self.chrome_timer.timeout.connect(self._chrome_idle)
        self._film_close_shown = False
        top.addWidget(self.close_button)
        layout.addLayout(top)
        layout.addStretch(5)
        self.status_label = QLabel(STARTING, self)
        self.status_label.setObjectName('directLaunchStatus')
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.status_label.setWordWrap(True)
        self.status_effect = QGraphicsOpacityEffect(self.status_label)
        self.status_effect.setOpacity(1.0)
        self.status_label.setGraphicsEffect(self.status_effect)
        self.text_fade = QPropertyAnimation(self.status_effect, b'opacity', self)
        self.text_fade.setDuration(TEXT_FADE_MS)
        self.text_fade.setEasingCurve(QEasingCurve.Type.OutCubic)
        layout.addWidget(self.status_label, 0, Qt.AlignmentFlag.AlignHCenter)
        self.hint_label = QLabel('', self)
        self.hint_label.setObjectName('directLaunchHint')
        self.hint_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.hint_label.setWordWrap(True)
        layout.addWidget(self.hint_label)
        layout.addStretch(1)
        self.geometry_animation = QPropertyAnimation(self, b'geometry', self)
        self.geometry_animation.setDuration(RESIZE_MS)
        self.geometry_animation.setEasingCurve(QEasingCurve.Type.OutCubic)
        self.fade_animation = QPropertyAnimation(self, b'windowOpacity', self)
        self.fade_animation.setDuration(FADE_MS)
        self.fade_animation.setEasingCurve(QEasingCurve.Type.InOutCubic)
        self.fade_animation.finished.connect(self._fade_finished)
        self.long_wait_timer = QTimer(self)
        self.long_wait_timer.setSingleShot(True)
        self.long_wait_timer.setInterval(LONG_WAIT_MS)
        self.long_wait_timer.timeout.connect(self._long_wait)
        self._install_backdrop(cinema)
        self._update_texts()

    # Backdrop -----------------------------------------------------------------------------------------------
    def _install_backdrop(self, cinema):
        old = self.backdrop
        if old is not None:
            old.hide()  # A failed cinema view stays parked: its surface may still reference it.
            if isinstance(old, StillBackdrop):
                old.setParent(None)
                old.deleteLater()
        self.cinema = cinema
        if cinema is not None:
            self.backdrop = cinema.view
            self.backdrop.setParent(self)
            cinema.filmStarted.connect(self.enter_film)
            cinema.view.activity.connect(self.show_film_chrome)
            cinema.fullscreenRequested.connect(lambda full: self.set_mode('full' if full else 'compact'))
            cinema.failed.connect(self.use_still_backdrop)
            cinema.set_fullscreen(self.mode == 'full')
        else:
            self.backdrop = StillBackdrop(self)
        self.backdrop.setGeometry(self.rect())
        self.backdrop.lower()
        self.backdrop.show()
        self._refresh_chrome()

    def use_still_backdrop(self, _reason=''):
        """libmpv / OpenGL failed: the launch continues over the logo still and the external mpv window."""
        if self.cinema is None:
            return
        self.film_mode = False
        self._install_backdrop(None)

    def cinema_mode(self):
        return self.cinema is not None

    # Geometry -----------------------------------------------------------------------------------------------
    def screen_area(self):
        screen = self.target_screen or self.screen() or QGuiApplication.primaryScreen()
        return QRect(screen.geometry()) if screen is not None else QRect(0, 0, 1280, 720)

    def target_geometry(self, mode=None):
        """'full' covers the monitor; 'compact' is half width x half height (25 % of the area), centred."""
        area = self.screen_area()
        if (mode or self.mode) == 'full':
            return QRect(area)
        width, height = max(1, area.width() // 2), max(1, area.height() // 2)
        return QRect(area.x() + (area.width() - width) // 2, area.y() + (area.height() - height) // 2, width, height)

    def device_ratio(self):
        screen = self.target_screen or self.screen()
        return screen.devicePixelRatio() if screen is not None else 1.0

    def mpv_args(self):
        """mpv window flags matching the splash, computed on the UI thread before mpv starts."""
        return geometry_args(self.mode, self.target_geometry(), self.device_ratio())

    def _set_on_top(self, on_top):
        """Stay above the browser while launching; a playing film is an ordinary window (no re-creation)."""
        flags = self.windowFlags()
        wanted = flags | Qt.WindowType.WindowStaysOnTopHint if on_top else flags & ~Qt.WindowType.WindowStaysOnTopHint
        if wanted == flags:
            return
        self.overrideWindowFlags(wanted)
        handle = self.windowHandle()
        if handle is not None:
            handle.setFlags(wanted)

    def present(self):
        """Open on the monitor under the mouse cursor, in the current mode, fully opaque; start the intro."""
        self.fade_animation.stop()
        self._fading = False
        self._close_after_fade = False
        self.error = False
        if not self.film_mode:
            self._set_on_top(True)
        self.target_screen = QGuiApplication.screenAt(QCursor.pos()) or QGuiApplication.primaryScreen()
        if self.target_screen is not None:
            handle = self.windowHandle()
            if handle is None:
                self.create()
                handle = self.windowHandle()
            if handle is not None:
                handle.setScreen(self.target_screen)
        self.setWindowOpacity(1.0)
        self.setGeometry(self.target_geometry())
        self._show_in_mode()
        self.raise_()
        self.activateWindow()
        self.setFocus()  # Esc reaches the splash; the buttons stay unhighlighted until Tab.
        if self.cinema is not None:
            self.cinema.present()
            if not self.film_mode and not self.long_wait_timer.isActive():
                self.long_wait = False
                self.long_wait_timer.start()
        self._refresh_chrome()

    def _show_in_mode(self):
        """'full' is a real fullscreen window: the window manager hides the dock and the top panel over it."""
        if self.mode == 'full':
            self.showFullScreen()
        else:
            self.showNormal()

    def set_mode(self, mode, *, animate=True):
        if mode not in ('full', 'compact') or mode == self.mode:
            return
        self.mode = mode
        self._drag_origin = None
        self._update_texts()
        if self.cinema is not None:
            self.cinema.set_fullscreen(mode == 'full')
        target = self.target_geometry()
        self.geometry_animation.stop()
        if not self.isVisible():
            self.setGeometry(target)
        elif mode == 'full':
            self.setGeometry(target)  # On the splash's monitor...
            self.showFullScreen()     # ...as a real fullscreen window, the same native one: never a black frame.
        else:
            self.showNormal()
            if animate:
                self.geometry_animation.setStartValue(self.geometry())
                self.geometry_animation.setEndValue(target)
                self.geometry_animation.start()
            else:
                self.setGeometry(target)
        self.modeChanged.emit(mode)

    def toggle_mode(self):
        self.set_mode('compact' if self.mode == 'full' else 'full')

    def finish_animations(self):
        """Jump running animations to their end (also used by tests)."""
        for animation in (self.geometry_animation, self.text_fade, self.fade_animation, self.close_fade):
            if animation.state() == QAbstractAnimation.State.Running:
                animation.setCurrentTime(animation.duration())

    # Film hand-over -----------------------------------------------------------------------------------------
    def enter_film(self):
        """The film's first frame is dissolving in: the window becomes the film window.

        □ belongs to the launch only (the film has mpv's OSC, a double click and f). ✕ fades out with the intro and
        comes back at the top right whenever the pointer moves over the film (show_film_chrome)."""
        self.film_mode = True
        self.long_wait_timer.stop()
        self._set_on_top(False)
        self._film_close_shown = False
        self.chrome_timer.stop()
        if self.close_button.isVisible():
            self._fade_close(0.0)
        self._refresh_chrome()

    def _long_wait(self):
        self.long_wait = True
        self._refresh_chrome()

    def _refresh_chrome(self):
        """Over the intro only □ / ✕ stay; over the film ✕ follows the pointer; the status shows on errors or a long wait."""
        cinema = self.cinema is not None
        self.brand_label.setVisible(not cinema)
        show_status = not self.film_mode and (not cinema or self.error or self.long_wait)
        self.status_label.setVisible(show_status)
        self.hint_label.setVisible(show_status)
        self.status_label.setProperty('cinema', 'true' if cinema else 'false')
        self.status_label.style().unpolish(self.status_label)
        self.status_label.style().polish(self.status_label)
        self.resize_button.setVisible(not self.film_mode)
        tip = 'Закрыть плеер' if self.film_mode else 'Отменить запуск'
        self.close_button.setToolTip(tip)
        self.close_button.setAccessibleName(tip)
        if not self.film_mode:
            self.chrome_timer.stop()
            self.close_fade.stop()
            self._film_close_shown = False
            self.close_effect.setOpacity(1.0)
            self.close_button.setVisible(True)
        elif self._film_close_shown:
            self.close_button.setVisible(True)
        elif self.close_fade.state() != QAbstractAnimation.State.Running:
            self.close_button.setVisible(False)

    # Film chrome (✕) ------------------------------------------------------------------------------------------
    def film_chrome_shown(self):
        return self.film_mode and self._film_close_shown

    def show_film_chrome(self):
        """The pointer moved over the film: ✕ fades in at the top right and hides again CHROME_HIDE_MS later."""
        if not self.film_mode or not self.isVisible() or self._fading:
            return
        self.chrome_timer.start()
        if self._film_close_shown:
            return
        self._film_close_shown = True
        self.close_button.setVisible(True)
        self.close_button.raise_()
        self._fade_close(1.0)

    def hide_film_chrome(self):
        """No pointer movement for CHROME_HIDE_MS (or the pointer left the window): ✕ fades out."""
        self.chrome_timer.stop()
        if not self.film_mode or not self._film_close_shown:
            return
        self._film_close_shown = False
        self._fade_close(0.0)

    def _chrome_idle(self):
        if self.film_mode and self.close_button.underMouse():
            self.chrome_timer.start()  # The pointer rests on ✕: it stays until the pointer leaves it.
            return
        self.hide_film_chrome()

    def _fade_close(self, target):
        self.close_fade.stop()
        self.close_fade.setStartValue(self.close_effect.opacity())
        self.close_fade.setEndValue(float(target))
        self.close_fade.start()

    def _close_fade_finished(self):
        if self.film_mode and not self._film_close_shown:
            self.close_button.setVisible(False)

    # Text ---------------------------------------------------------------------------------------------------
    def _update_texts(self):
        full = self.mode == 'full'
        tip = 'Уменьшить окно' if full else 'Развернуть на весь экран'
        self.resize_button.setToolTip(tip)
        self.resize_button.setAccessibleName(tip)
        self.hint_label.setText('Нажмите ✕, чтобы закрыть' if self.error
                                else 'Нажмите ✕ или Esc, чтобы отменить запуск')

    def set_status(self, text, *, error=False):
        changed = text != self.status_label.text() or bool(error) != self.error
        self.error = bool(error)
        self.status_label.setText(text)
        self.status_label.setProperty('tone', 'error' if error else 'normal')
        self.status_label.style().unpolish(self.status_label)
        self.status_label.style().polish(self.status_label)
        self._update_texts()
        self._refresh_chrome()
        if changed:  # The new line fades in instead of jumping.
            self.text_fade.stop()
            self.text_fade.setStartValue(0.0)
            self.text_fade.setEndValue(1.0)
            self.text_fade.start()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        if self.backdrop is not None:
            self.backdrop.setGeometry(self.rect())
            self.backdrop.lower()
        height = max(1, self.height())
        for label, size in ((self.status_label, height / 30), (self.hint_label, height / 60),
                            (self.brand_label, height / 55)):
            font = label.font()
            font.setPixelSize(int(min(max(size, 12), 30 if label is self.status_label else 18)))
            label.setFont(font)
        self.status_label.setMaximumWidth(max(240, int(self.width() * 0.8)))

    def paintEvent(self, event):
        painter = QPainter(self)
        gradient = QLinearGradient(0, 0, 0, self.height())
        gradient.setColorAt(0.0, QColor(BACKGROUND))
        gradient.setColorAt(1.0, QColor(BACKGROUND_DEEP))
        painter.fillRect(self.rect(), QBrush(gradient))
        glow = QRadialGradient(QPointF(self.width() / 2, self.height() * 0.45), max(self.width(), self.height()) * 0.45)
        accent = QColor(ACCENT)
        accent.setAlpha(18)
        glow.setColorAt(0.0, accent)
        accent.setAlpha(0)
        glow.setColorAt(1.0, accent)
        painter.fillRect(self.rect(), QBrush(glow))
        painter.end()

    # Fade and close -----------------------------------------------------------------------------------------
    def fading(self):
        return self._fading

    def fade_out(self, *, close=False):
        """The launch screen is done.

        Cinema: the window already shows the dissolving film and stays. Otherwise (and on cancel):
        windowOpacity 1 -> 0 in FADE_MS, then hide (and close when cancelling) and emit faded."""
        if not close and self.cinema is not None:
            if self.film_mode:
                return
            if self.cinema.film_state() in ('warmup', 'intro', 'failed'):
                return  # The film is still warming up under the intro: it dissolves in by itself.
        self._close_after_fade = bool(close) or (self._fading and self._close_after_fade)
        if self._fading:
            return
        if not self.isVisible():
            self._fade_finished()
            return
        self._fading = True
        if self.cinema is not None:
            self.cinema.fade_audio(FADE_MS)
        self.fade_animation.stop()
        self.fade_animation.setStartValue(self.windowOpacity())
        self.fade_animation.setEndValue(0.0)
        self.fade_animation.start()

    def _stop_media(self):
        """A hidden window never keeps the intro or the film playing."""
        self._drag_origin = None
        self.long_wait_timer.stop()
        self.long_wait = False
        self.film_mode = False
        if self.cinema is not None:
            self.cinema.reset()
        self._refresh_chrome()

    def _fade_finished(self):
        self._fading = False
        self.text_fade.stop()
        self.geometry_animation.stop()
        self.hide()
        self._stop_media()
        if self._close_after_fade:
            self._close_after_fade = False
            self.dismiss()
        self.setWindowOpacity(1.0)  # Ready for the next launch.
        self.faded.emit()

    def hide_now(self):
        """Hide at once (fallback to the app window, film end) and reset the fade state."""
        self.fade_animation.stop()
        self.text_fade.stop()
        self.geometry_animation.stop()
        self._fading = False
        self._close_after_fade = False
        self.hide()
        self._stop_media()
        self.setWindowOpacity(1.0)

    def dismiss(self):
        """Close without asking the user (programmatic close, no cancel signal)."""
        self.fade_animation.stop()
        self.text_fade.stop()
        self.geometry_animation.stop()
        self._fading = False
        self._stop_media()
        self._closing = True
        try:
            self.close()
        finally:
            self._closing = False

    # Window move --------------------------------------------------------------------------------------------
    def _may_drag(self, event):
        """A window (compact) is moved by holding the left button on the picture, away from mpv's OSC bar and menu."""
        if self.mode != 'compact' or self.isFullScreen() or event.button() != Qt.MouseButton.LeftButton:
            return False
        if self.cinema is not None and self.cinema.menu_open:
            return False
        return not (self.film_mode and event.position().y() >= self.height() * (1.0 - OSC_BAND))

    def mousePressEvent(self, event):
        # The picture (CinemaView) passes its presses on to the window after mpv has seen them.
        self._drag_origin = QPointF(event.globalPosition()) if self._may_drag(event) else None
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        origin = self._drag_origin
        if origin is not None and event.buttons() & Qt.MouseButton.LeftButton:
            if (event.globalPosition() - origin).manhattanLength() >= QApplication.startDragDistance():
                self._drag_origin = None
                self.start_window_move()
                return
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        self._drag_origin = None
        super().mouseReleaseEvent(event)

    def leaveEvent(self, event):
        if self.film_mode:
            self.hide_film_chrome()  # A window (compact) shows ✕ only while the pointer is over it.
        super().leaveEvent(event)

    def start_window_move(self):
        """Hand the window to the window manager (X11 and Wayland), which follows the pointer until release."""
        if self.cinema is not None:
            self.cinema.release_mouse()  # The release goes to the window manager, not to mpv.
        handle = self.windowHandle()
        return bool(handle is not None and handle.startSystemMove())

    def keyPressEvent(self, event):
        if self.film_mode and self.cinema is not None and self.cinema.accepts_input():
            if self._closes_film(event):
                self.cancelRequested.emit()  # The same stop-and-close as ✕.
                return
            name = mpv_key_name(event.key(), event.text(), event.modifiers())
            if name:
                self.cinema.send_key(name)  # mpv's own bindings: space, arrows, f, m, Esc (leaves fullscreen)…
                return
        if event.key() == Qt.Key.Key_Escape:
            self.cancelRequested.emit()
            return
        super().keyPressEvent(event)

    def _closes_film(self, event):
        """q closes the player; so does Esc in a window (compact), unless the track menu is open (Esc closes it).

        In fullscreen Esc stays mpv's: it leaves fullscreen."""
        modifiers = event.modifiers() & ~Qt.KeyboardModifier.KeypadModifier
        if modifiers != Qt.KeyboardModifier.NoModifier:
            return False
        if event.key() == Qt.Key.Key_Q:
            return True
        return (event.key() == Qt.Key.Key_Escape and self.mode == 'compact' and not self.isFullScreen()
                and not self.cinema.menu_open)

    def closeEvent(self, event):
        if self._closing:
            event.accept()
            return
        event.ignore()  # Alt+F4 / Cmd+W: cancel the launch the same way as ✕.
        self.cancelRequested.emit()


class _WorkSignals(QObject):
    done = Signal(object, object)
    failed = Signal(object, object)


class _Work(QRunnable):
    def __init__(self, fn):
        super().__init__()
        self.fn = fn
        self.signals = _WorkSignals()

    def run(self):
        try:
            self.signals.done.emit(self, self.fn())
        except Exception as error:
            self.signals.failed.emit(self, error)


class DirectPlayer(QObject):
    """Redeem a site launch under a cinema splash, then run mpv without building the app window."""

    finished = Signal(int)
    fallback = Signal(dict)

    def __init__(self, *, api_factory=Api, engine=None, worker=None, show_splash=True, cinema=None, parent=None):
        super().__init__(parent)
        self.api_factory = api_factory
        if cinema is None and engine is None and show_splash:
            cinema = create_surface()  # None without libmpv / OpenGL: the external mpv window is used.
        self.cinema = cinema
        self.engine = engine or (CinemaEngine(cinema) if cinema is not None else Mpv())
        self.cancel_code = 1
        self._worker = worker
        self._jobs = set()
        self.api = None
        self.meta = None
        self.url = ''
        self.attempt = 0
        self.started_at = 0.0
        self.generation = 0
        self.frame_token = 0
        self.playing = False
        self.cancelling = False
        self.cancel_reported = False
        self._fade_generation = 0
        self.window = []  # mpv window flags, refreshed on the UI thread whenever the splash changes mode.
        self.last_error = ''
        self.retired = False
        self.timer = QTimer(self)
        self.timer.setInterval(1000)
        self.timer.timeout.connect(self._watch)
        # A catalogue film leased here (catalog_movie_id): its heartbeat keeps the Telegram stream slot.
        self.session_id = ''
        self._lease_grant = ''
        self.lease_timer = QTimer(self)
        self.lease_timer.timeout.connect(self._heartbeat)
        self.splash = self._make_splash() if show_splash else None
        if cinema is not None:
            cinema.failed.connect(self._cinema_failed)

    def _make_splash(self):
        splash = DirectLaunchSplash(cinema=self.cinema)
        splash.cancelRequested.connect(self._close_by_user)
        splash.modeChanged.connect(self._sync_engine_window)
        splash.faded.connect(self._splash_faded)
        self.status_label = splash.status_label
        self.close_button = splash.close_button
        return splash

    def _status(self, message, *, error=False):
        self.last_error = message if error else ''
        if self.splash is None:
            return
        self.splash.set_status(message, error=error)
        if not self.splash.isVisible() or self.splash.fading():
            self.splash.present()

    def _window_args(self):
        """mpv geometry from the splash; nothing when the launch runs without one."""
        if self.splash is None or not self.splash.isVisible():
            return []
        return self.splash.mpv_args()

    def work(self, fn, done, fail):
        """Run blocking API/media work off the UI thread; override or inject for tests."""
        if self._worker is not None:
            return self._worker(fn, done, fail)
        job = _Work(fn)
        self._jobs.add(job)
        job.signals.done.connect(self._work_done)
        job.signals.failed.connect(self._work_failed)
        job.done_callback = done
        job.fail_callback = fail
        QThreadPool.globalInstance().start(job)

    @Slot(object, object)
    def _work_done(self, job, value):
        self._jobs.discard(job)
        job.done_callback(value)

    @Slot(object, object)
    def _work_failed(self, job, error):
        self._jobs.discard(job)
        job.fail_callback(error)

    def open_link(self, link):
        """Accept only a canonical launch deeplink; malformed links are ignored."""
        launch_id = parse_launch(link)
        if not launch_id or self.retired:
            return False
        mode = parse_mode(link)
        # Reset cancel state so a fresh link is not blocked by a previous abort.
        self.cancelling = False
        self.cancel_reported = False
        if self.splash is not None:
            self.splash.set_mode(mode, animate=False)
        self.generation += 1
        generation = self.generation
        self.timer.stop()
        self.engine.stop()
        self._release_lease()
        self._close_api()
        self.meta, self.url, self.attempt, self.playing = None, '', 0, False
        self._refresh_intro()
        self._status(STARTING)
        api = self.api_factory()
        if hasattr(api, 'token'):
            api.token = ''
        self.api = api
        if self._worker is None and self.cinema is None and callable(getattr(self.engine, 'prewarm', None)):
            win_args = self._window_args()
            def prewarm_task():
                if generation != self.generation or self.retired or self.cancelling:
                    return
                self.engine.prewarm(extra_args=win_args)
                if generation != self.generation or self.retired or self.cancelling:
                    self.engine.stop()
            QThreadPool.globalInstance().start(_Work(prewarm_task))

        def done(meta):
            if generation != self.generation:
                return
            if not isinstance(meta, dict):
                self._error('Не удалось открыть фильм с сайта. Нажмите «Смотреть» ещё раз.')
                return
            self.meta = dict(meta)
            self.url = stream_of(meta)
            if not self.url:
                movie_id = catalog_movie_id(meta)
                if movie_id:
                    # Telegram catalogue film: one seamless splash + intro, exactly like a torrent stream.
                    self.started_at = time.monotonic()
                    self._prepare_launch(generation, self.meta)
                    self._start_lease(generation, movie_id)
                    return
                self.timer.stop()
                self._close_api()
                self._hide_splash()
                self.fallback.emit(dict(meta))
                return
            self.started_at = time.monotonic()
            self._prepare_launch(generation, self.meta)
            self._start_attempt(generation, 0)

        def fail(error):
            if generation == self.generation:
                self._error(self._explain(error))

        self.work(lambda: api.open_launch(launch_id), done, fail)
        return True

    def _refresh_intro(self):
        """Every new launch asks the server for the admin intro switches at once (no 60 s throttle)."""
        source = getattr(self.cinema, 'intro', None) if self.cinema is not None else None
        refresh = getattr(source, 'refresh_async', None)
        if not callable(refresh):
            return
        try:
            refresh(force=True)
        except TypeError:  # An intro source without the force switch.
            refresh()
        except Exception:  # Never block a launch on the intro config; the last known choice stays.
            pass

    def _start_lease(self, generation, movie_id):
        """Lease the catalogue film with the launch grant, then play it under the splash already on screen."""
        api, grant = self.api, str(self.meta.get('access_token') or '').strip()
        if api is None:
            return
        self._status(CONNECTING)

        def start():
            if generation != self.generation:
                raise RuntimeError('Cancelled')
            api.token = grant
            return api.start(movie_id)

        def done(session):
            sid = session.get('session_id') if isinstance(session, dict) else None
            sid = sid if isinstance(sid, str) and sid else ''
            if generation != self.generation or self.api is not api:
                self._stop_lease(sid, grant)  # Cancelled while the lease was being granted.
                return
            url = lease_url(session)
            if not url or not sid:
                self._stop_lease(sid, grant)
                self._error('Не удалось открыть фильм с сайта. Нажмите «Смотреть» ещё раз.')
                return
            self.session_id, self._lease_grant, self.url = sid, grant, url
            try:
                interval = max(5, int(session.get('heartbeat_interval_seconds') or 20))
            except (TypeError, ValueError):
                interval = 20
            self.lease_timer.start(interval * 1000)
            self._start_attempt(generation, 0)

        def fail(error):
            if generation == self.generation:
                self._error(self._explain(error))

        self.work(start, done, fail)

    def _heartbeat(self):
        sid, api = self.session_id, self.api
        if not sid or api is None:
            self.lease_timer.stop()
            return
        self.work(lambda: api.heartbeat(sid), lambda _value: None, lambda _error: None)

    def _stop_lease(self, sid, grant):
        """End a lease on its own short-lived client: the launch client may be closed right after."""
        if not sid:
            return

        def stop():
            api = self.api_factory()
            try:
                api.token = grant
                return api.stop(sid)
            finally:
                close = getattr(api, 'close', None)
                if callable(close):
                    close()

        self.work(stop, lambda _value: None, lambda _error: None)

    def _release_lease(self):
        self.lease_timer.stop()
        sid, grant = self.session_id, self._lease_grant
        self.session_id, self._lease_grant = '', ''
        self._stop_lease(sid, grant)

    def _prepare_launch(self, generation, meta):
        """The redeemed launch names its stream: intro per environment, then its Pre-roll (Intro -> Pre-roll -> film).

        A torrent stream (``tmdb_id``) is ``player_torrents``, a KINOSOTA catalogue film ``player_telegram``. The ad
        plan is asked with the launch's own session grant on a separate client; without one there is no ad.
        """
        cinema = self.cinema
        if cinema is None:
            return
        cinema.set_intro_target(target_for(meta))
        grant = meta.get('access_token') if isinstance(meta, dict) else None
        if not isinstance(grant, str) or not grant.strip():
            return
        token = cinema.expect_preroll()

        def fetch():
            api = self.api_factory()
            try:
                api.token = grant.strip()
                return api, fetch_preroll(api, meta)
            finally:
                close = getattr(api, 'close', None)
                if callable(close):
                    close()

        def tell(api, ad, event):
            self.work(lambda: report_ad(api, ad, event), lambda _value: None, lambda _error: None)

        def done(value):
            api, ad = value if isinstance(value, tuple) else (None, None)
            if ad is None or generation != self.generation or self.cinema is not cinema:
                cinema.cancel_preroll(token)
                return
            cinema.queue_preroll(token, ad.media_url, duration=ad.duration_sec,
                                 on_start=lambda: tell(api, ad, 'impression'),
                                 on_end=lambda kind: tell(api, ad, 'completion') if kind == 'completion' else None)

        self.work(fetch, done, lambda _error: cinema.cancel_preroll(token))

    def _start_attempt(self, generation, attempt):
        if generation != self.generation or self.api is None or not self.meta:
            return
        self.attempt = attempt
        self.playing = False
        meta, url, api = dict(self.meta), self.url, self.api
        self._status(RECONNECTING if attempt else CONNECTING)
        # The splash geometry is read on the UI thread; the worker only reads the ready list.
        self.window = self._window_args()

        def start():
            if hasattr(api, 'warm_stream'):
                api.warm_stream(url, lambda: generation != self.generation)
            if generation != self.generation:
                return False
            self.engine.start(url, extra_args=[*launch_args(meta), *self.window])
            if generation != self.generation:  # Cancelled while mpv was spawning: do not leave it behind.
                self.engine.stop()
                return False
            return True

        def done(started):
            if generation != self.generation:
                return
            if not started:
                return
            self.timer.start()
            self._await_first_frame(generation)

        def fail(error):
            if generation == self.generation:
                self.timer.stop()
                self._error(self._explain(error))

        self.work(start, done, fail)

    def _await_first_frame(self, generation):
        """Keep the splash until mpv shows the first frame (or the file ends / the timeout expires)."""
        self.frame_token += 1
        token = self.frame_token
        wait = getattr(self.engine, 'wait_playback_started', None)
        if self.splash is None or not callable(wait):
            self._playback_started()
            return
        self._status(BUFFERING)

        def current():
            return generation == self.generation and token == self.frame_token

        def done(result):
            if not current():
                return
            if result in ('playing', 'eof', 'timeout'):
                # On timeout mpv keeps buffering with its own OSD: hand the screen over instead of hanging.
                self._playback_started()
            # 'exited' and 'cancelled': _watch decides between a retry, an error and a normal exit.

        def fail(_error):
            if current() and self.engine.alive():
                self._playback_started()

        self.work(lambda: wait(FIRST_FRAME_TIMEOUT, cancelled=lambda: not current()), done, fail)

    def _playback_started(self):
        self.playing = True
        # Give mpv's window ~180 ms to actually appear on screen before dissolving
        # the splash. Without this delay the splash fades out while mpv's window is
        # still painting its first frame, leaving a black rectangle for 3–5 s.
        self._fade_generation = self.generation
        QTimer.singleShot(FIRST_FRAME_FADE_DELAY_MS, self._hide_splash_fade)

    def _sync_engine_window(self, mode):
        """□ after mpv has started: move the running mpv window as well (best effort over IPC)."""
        self.window = self._window_args()  # A launch still warming the stream starts mpv in the new mode.
        command = getattr(self.engine, 'command', None)
        if self.splash is None or not callable(command) or not self.engine.alive():
            return
        rect, ratio = self.splash.target_geometry(mode), self.splash.device_ratio()

        def apply():
            try:
                if mode == 'full':
                    command(['set_property', 'fullscreen', True])
                else:
                    command(['set_property', 'fullscreen', False])
                    command(['set_property', 'geometry', geometry_text(rect, ratio)])
            except (OSError, TimeoutError, RuntimeError, ValueError):
                pass  # Old mpv without runtime geometry or a closing IPC: the splash still follows the button.
            return None

        self.work(apply, lambda _value: None, lambda _error: None)

    def _watch(self):
        if self.engine.alive():
            return
        self.timer.stop()
        self.frame_token += 1  # A pending first-frame wait belongs to the dead process.
        code = self.engine.exit_code()
        if code in (None, 0):
            self._hide_splash()
            self._release_lease()
            self._close_api()
            self.finished.emit(0)
            return
        if code != 4 and self.attempt < 2 and time.monotonic() - self.started_at < 120:
            self._start_attempt(self.generation, self.attempt + 1)
            return
        self._error('Не удалось воспроизвести видео. Проверьте соединение и нажмите ✕.')

    @staticmethod
    def _explain(error):
        if isinstance(error, ApiError):
            return {
                403: 'Для просмотра нужна действующая подписка PRO.',
                404: 'Ссылка не найдена или раздача больше недоступна. Нажмите «Смотреть» ещё раз.',
                409: 'Источник ещё готовится. Попробуйте открыть фильм чуть позже.',
                410: 'Ссылка устарела или уже использована. Нажмите «Смотреть» на сайте ещё раз.',
            }.get(error.status, str(error))
        if isinstance(error, (RuntimeError, ValueError)) and str(error) and str(error) != 'Cancelled':
            return str(error)
        return 'Не удалось открыть фильм. Проверьте соединение и попробуйте ещё раз.'

    def _error(self, message):
        self.timer.stop()
        self._status(message, error=True)

    def _close_by_user(self):
        """✕ / Esc: abort open_launch and warm_stream, stop mpv, fade the splash out, quit."""
        if self.cancelling:
            return
        self.cancelling = True
        self.cancel_code = 0 if self.playing else 1  # ✕ over a playing film is a normal close.
        self._stop_everything()
        if self.splash is None or not self.splash.isVisible():
            self._cancelled()
            return
        self.splash.fade_out(close=True)

    def _splash_faded(self):
        if self.cancelling:
            self._cancelled()

    def _cancelled(self):
        if self.splash is not None:
            self.splash.dismiss()
        if not self.cancel_reported:  # finished exactly once, even if ✕ and Esc race.
            self.cancel_reported = True
            self.finished.emit(self.cancel_code)

    def _stop_everything(self):
        self.retired = True
        self.generation += 1  # warm_stream polls this and stops; late open_launch results are dropped.
        self.frame_token += 1
        self.timer.stop()
        self.engine.stop()
        self._release_lease()
        self._close_api()  # Closing the httpx clients aborts a request that is still in flight.

    def _hide_splash_fade(self):
        """Called from singleShot after mpv has had time to draw its first frame.

        Guards against cancel/retry that increments self.generation between the
        singleShot arm and its fire: fade only when still on the same launch.
        """
        if self.playing and self.generation == self._fade_generation:
            self._hide_splash(fade=True)

    def _hide_splash(self, *, fade=False):
        if self.splash is None:
            return
        if fade and self.splash.isVisible():
            self.splash.fade_out()
        else:
            self.splash.hide_now()

    def _close_api(self):
        api, self.api = self.api, None
        close = getattr(api, 'close', None)
        if callable(close):
            close()

    def retire(self):
        """Dismiss the no-login surface when the caller hands a legacy launch to Window."""
        self._stop_everything()
        self._hide_splash()

    def _cinema_failed(self, reason):
        """libmpv / OpenGL broke: continue this launch in the external mpv window over the logo still."""
        self.cinema = None
        self.engine = Mpv()
        if self.meta and self.url and self.api is not None and not self.retired and not self.cancelling:
            self._start_attempt(self.generation, self.attempt)

    def shutdown(self):
        self._stop_everything()
        self._hide_splash()
        if self.splash is not None:
            self.splash.dismiss()
        if self.cinema is not None:
            self.cinema.shutdown()
