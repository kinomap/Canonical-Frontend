"""Minimal, no-login redemption and mpv launch for website watch links."""
from __future__ import annotations

import math
import sys
import time
import uuid
from urllib.parse import urlsplit

from PySide6.QtCore import (QAbstractAnimation, QEasingCurve, QElapsedTimer, QObject, QPointF, QPropertyAnimation,
                            QRect, QRectF, QRunnable, QSize, QThreadPool, QTimer, Qt, Signal, Slot)
from PySide6.QtGui import QBrush, QColor, QCursor, QGuiApplication, QLinearGradient, QPainter, QPainterPath, QPen, QRadialGradient
from PySide6.QtWidgets import (QGraphicsOpacityEffect, QHBoxLayout, QLabel, QPushButton, QSizePolicy,
                               QVBoxLayout, QWidget)

from .api import Api, ApiError
from .deeplink import parse_launch, parse_mode
from .engine import FIRST_FRAME_TIMEOUT, Mpv
from .torrents import audio_args, media_title_args

BACKGROUND, BACKGROUND_DEEP = '#070b0e', '#070b0e'  # Unified CinemaPrestartOverlay.vue palette.
ACCENT, ACCENT_DEEP = '#ffd400', '#ffb800'
TEXT, TEXT_MUTED = '#ffffff', 'rgba(255, 255, 255, 0.58)'
FRAME_MS = 16  # ~60 FPS for the reel animation.
FADE_MS = 400  # 400ms Cross-Dissolve once playback-time >= 0.2s.
RESIZE_MS = 260
TEXT_FADE_MS = 280
# Delay between mpv reporting its first frame (IPC) and the splash fade-out.
# Qt's event loop needs at least one round-trip to let the mpv window become
# visible on screen; a 0 ms singleShot defers to the next event iteration and
# is enough in practice.  Set to > 0 for platforms that need a longer grace.
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


class FilmReelWidget(QWidget):
    """Two spinning reels and a running perforated film strip matching CinemaPrestartOverlay.vue (560x250 viewBox)."""

    DEGREES_PER_SECOND = 150.0
    FILM_SPEED = 53.33  # 24px / 0.45s matching web CSS animation
    PERFORATION_STEP = 24.0

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName('filmReel')
        self.setMinimumSize(260, 130)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        self.angle = 0.0
        self.film_offset = 0.0
        self.paused = False
        self.clock = QElapsedTimer()
        self.timer = QTimer(self)
        self.timer.setTimerType(Qt.TimerType.PreciseTimer)
        self.timer.setInterval(FRAME_MS)
        self.timer.timeout.connect(self.tick)

    def sizeHint(self):
        return QSize(560, 250)

    def running(self):
        return self.timer.isActive()

    def start(self):
        if not self.paused and not self.timer.isActive():
            self.clock.start()
            self.timer.start()

    def stop(self):
        self.timer.stop()

    def set_paused(self, paused):
        """The error state freezes the reels; the animation resumes with the next normal status."""
        self.paused = bool(paused)
        if self.paused:
            self.stop()
        elif self.isVisible():
            self.start()
        self.update()

    def advance(self, seconds):
        seconds = min(max(float(seconds), 0.0), 0.1)  # A stalled event loop must not make the reels jump.
        self.angle = (self.angle + self.DEGREES_PER_SECOND * seconds) % 360.0
        self.film_offset = (self.film_offset + self.FILM_SPEED * seconds) % self.PERFORATION_STEP

    def tick(self):
        elapsed = self.clock.restart() / 1000.0 if self.clock.isValid() else FRAME_MS / 1000.0
        self.advance(elapsed)
        self.update()

    def showEvent(self, event):
        super().showEvent(event)
        self.start()

    def hideEvent(self, event):
        self.stop()  # No CPU spent on a hidden splash.
        super().hideEvent(event)

    def geometry_of_reels(self):
        w, h = self.width(), self.height()
        s = min(w / 560.0, h / 250.0)
        dx = (w - 560.0 * s) * 0.5
        dy = (h - 250.0 * s) * 0.5
        return 70.0 * s, QPointF(dx + 145.0 * s, dy + 111.0 * s), QPointF(dx + 415.0 * s, dy + 111.0 * s)

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()
        s = min(w / 560.0, h / 250.0)
        dx = (w - 560.0 * s) * 0.5
        dy = (h - 250.0 * s) * 0.5
        painter.translate(dx, dy)
        painter.scale(s, s)

        glow = QColor(ACCENT_DEEP)
        for center in (QPointF(145.0, 110.0), QPointF(415.0, 110.0)):
            halo = QRadialGradient(center, 120.0)
            glow.setAlpha(46 if not self.paused else 20)  # alpha 0.18 -> 0.0
            halo.setColorAt(0.0, glow)
            glow.setAlpha(0)
            halo.setColorAt(1.0, glow)
            painter.setPen(Qt.PenStyle.NoPen)
            painter.setBrush(QBrush(halo))
            painter.drawEllipse(center, 120.0, 120.0)

        self._paint_film(painter)
        self._paint_reel(painter, QPointF(145.0, 111.0), self.angle)
        self._paint_reel(painter, QPointF(415.0, 111.0), -self.angle)
        painter.end()

    def _paint_film(self, painter):
        """Upper and lower curved film strips with running double perforations matching CinemaPrestartOverlay.vue."""
        upper = QPainterPath()
        upper.moveTo(145, 51)
        upper.quadTo(280, 28, 415, 51)
        upper.lineTo(415, 72)
        upper.quadTo(280, 49, 145, 72)
        upper.closeSubpath()
        painter.setPen(QPen(QColor(ACCENT_DEEP), 1.4))
        painter.setBrush(QBrush(QColor('#171d21')))
        painter.drawPath(upper)

        edge_pen = QPen(QColor(ACCENT), 1.5)
        edge_color = QColor(ACCENT)
        edge_color.setAlphaF(0.65)
        edge_pen.setColor(edge_color)
        painter.setBrush(Qt.BrushStyle.NoBrush)
        painter.setPen(edge_pen)
        edge_top = QPainterPath()
        edge_top.moveTo(145, 51)
        edge_top.quadTo(280, 28, 415, 51)
        painter.drawPath(edge_top)
        edge_bot = QPainterPath()
        edge_bot.moveTo(145, 72)
        edge_bot.quadTo(280, 49, 415, 72)
        painter.drawPath(edge_bot)

        perf_pen = QPen(QColor(255, 255, 255, 204), 4.5, Qt.PenStyle.CustomDashLine, Qt.PenCapStyle.RoundCap)
        perf_pen.setDashPattern([2.4, 2.8])
        perf_pen.setDashOffset(-self.film_offset / 4.5)
        painter.setPen(perf_pen)
        h_top = QPainterPath()
        h_top.moveTo(145, 56.5)
        h_top.quadTo(280, 33.5, 415, 56.5)
        painter.drawPath(h_top)
        h_bot = QPainterPath()
        h_bot.moveTo(145, 66.5)
        h_bot.quadTo(280, 43.5, 415, 66.5)
        painter.drawPath(h_bot)

        lower = QPainterPath()
        lower.moveTo(72, 151)
        lower.quadTo(280, 206, 488, 151)
        lower.lineTo(488, 172)
        lower.quadTo(280, 227, 72, 172)
        lower.closeSubpath()
        painter.setPen(QPen(QColor(ACCENT_DEEP), 1.4))
        painter.setBrush(QBrush(QColor('#141a1e')))
        painter.drawPath(lower)

        lower_edge = QPen(QColor(ACCENT), 1.5)
        lower_edge_color = QColor(ACCENT)
        lower_edge_color.setAlphaF(0.44)
        lower_edge.setColor(lower_edge_color)
        painter.setBrush(Qt.BrushStyle.NoBrush)
        painter.setPen(lower_edge)
        ledge_top = QPainterPath()
        ledge_top.moveTo(72, 151)
        ledge_top.quadTo(280, 206, 488, 151)
        painter.drawPath(ledge_top)
        ledge_bot = QPainterPath()
        ledge_bot.moveTo(72, 172)
        ledge_bot.quadTo(280, 227, 72, 172)
        painter.drawPath(ledge_bot)

        perf_pen_rev = QPen(QColor(255, 255, 255, 204), 4.5, Qt.PenStyle.CustomDashLine, Qt.PenCapStyle.RoundCap)
        perf_pen_rev.setDashPattern([2.4, 2.8])
        perf_pen_rev.setDashOffset(self.film_offset / 4.5)
        painter.setPen(perf_pen_rev)
        lh_top = QPainterPath()
        lh_top.moveTo(72, 156.5)
        lh_top.quadTo(280, 211.5, 488, 156.5)
        painter.drawPath(lh_top)
        lh_bot = QPainterPath()
        lh_bot.moveTo(72, 166.5)
        lh_bot.quadTo(280, 221.5, 488, 166.5)
        painter.drawPath(lh_bot)

    def _paint_reel(self, painter, center, angle):
        """8-spoke reel with rounded ends matching CinemaPrestartOverlay.vue."""
        painter.save()
        painter.translate(center)

        ring_color = QColor(ACCENT if not self.paused else '#7a8194')
        painter.setPen(QPen(ring_color, 5.0))
        painter.setBrush(QBrush(QColor('#11181d')))
        painter.drawEllipse(QPointF(0, 0), 70.0, 70.0)

        inner = QColor(ACCENT_DEEP)
        inner.setAlphaF(0.72)
        painter.setPen(QPen(inner, 1.5))
        painter.setBrush(Qt.BrushStyle.NoBrush)
        painter.drawEllipse(QPointF(0, 0), 55.0, 55.0)

        painter.rotate(angle)
        spoke_pen = QPen(ring_color, 7.0, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap)
        painter.setPen(spoke_pen)
        painter.drawLine(0, -50, 0, -14)
        painter.drawLine(0, 14, 0, 50)
        painter.drawLine(-50, 0, -14, 0)
        painter.drawLine(14, 0, 50, 0)
        painter.drawLine(-35, -35, -11, -11)
        painter.drawLine(11, 11, 35, 35)
        painter.drawLine(35, -35, 11, -11)
        painter.drawLine(-11, 11, -35, 35)

        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QBrush(QColor(ACCENT_DEEP if not self.paused else '#7a8194')))
        painter.drawEllipse(QPointF(0, 0), 13.0, 13.0)
        painter.setBrush(QBrush(QColor(BACKGROUND_DEEP)))
        painter.drawEllipse(QPointF(0, 0), 4.0, 4.0)

        painter.restore()


SPLASH_STYLE = f"""
QLabel#directLaunchBrand {{ color: {ACCENT}; font-weight: 800; letter-spacing: 4px; }}
QLabel#directLaunchStatus {{ color: {TEXT}; font-weight: 600; }}
QLabel#directLaunchStatus[tone="error"] {{ color: {ACCENT}; }}
QLabel#directLaunchHint {{ color: {TEXT_MUTED}; }}
QPushButton#directLaunchResize, QPushButton#directLaunchClose {{
    background: rgba(255, 255, 255, 0.06); color: {TEXT}; border: 1px solid rgba(255, 255, 255, 0.17);
    border-radius: 9px; font-size: 19px; min-width: 42px; min-height: 42px; max-width: 42px; max-height: 42px; }}
QPushButton#directLaunchResize:hover, QPushButton#directLaunchResize:focus {{
    background: rgba(255, 212, 0, 0.18); border-color: {ACCENT}; color: {ACCENT}; }}
QPushButton#directLaunchClose:hover, QPushButton#directLaunchClose:focus {{
    background: rgba(229, 72, 77, 0.24); border-color: #ff776e; color: #ffffff; }}
QPushButton#directLaunchResize:pressed, QPushButton#directLaunchClose:pressed {{ background: rgba(255, 255, 255, 0.16); }}
"""


class DirectLaunchSplash(QWidget):
    """Full-screen cinema splash shown from the deeplink until mpv has its first frame."""

    cancelRequested = Signal()
    modeChanged = Signal(str)
    faded = Signal()

    def __init__(self, parent=None):
        flags = Qt.WindowType.Window | Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint
        super().__init__(parent, flags)
        self.setObjectName('directLaunchSplash')
        self.setWindowTitle('KINOSOTA Player')
        self.setStyleSheet(SPLASH_STYLE)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.mode = 'full'
        self.error = False
        self.target_screen = None
        self._fading = False
        self._close_after_fade = False
        self._closing = False
        layout = QVBoxLayout(self)
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
        top.addWidget(self.close_button)
        layout.addLayout(top)
        layout.addStretch(1)
        self.reel = FilmReelWidget(self)
        layout.addWidget(self.reel, 3, Qt.AlignmentFlag.AlignHCenter)
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
        layout.addWidget(self.status_label)
        self.hint_label = QLabel('', self)
        self.hint_label.setObjectName('directLaunchHint')
        self.hint_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.hint_label.setWordWrap(True)
        layout.addWidget(self.hint_label)
        layout.addStretch(2)
        self.geometry_animation = QPropertyAnimation(self, b'geometry', self)
        self.geometry_animation.setDuration(RESIZE_MS)
        self.geometry_animation.setEasingCurve(QEasingCurve.Type.OutCubic)
        self.fade_animation = QPropertyAnimation(self, b'windowOpacity', self)
        self.fade_animation.setDuration(FADE_MS)
        self.fade_animation.setEasingCurve(QEasingCurve.Type.InOutCubic)
        self.fade_animation.finished.connect(self._fade_finished)
        self._update_texts()

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

    def present(self):
        """Open on the monitor under the mouse cursor, in the current mode, fully opaque."""
        self.fade_animation.stop()
        self._fading = False
        self._close_after_fade = False
        self.error = False
        self.reel.set_paused(False)
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
        self.show()
        self.raise_()
        self.activateWindow()
        self.setFocus()  # Esc reaches the splash; the buttons stay unhighlighted until Tab.
        self.reel.start()

    def set_mode(self, mode, *, animate=True):
        if mode not in ('full', 'compact') or mode == self.mode:
            return
        self.mode = mode
        self._update_texts()
        target = self.target_geometry()
        self.geometry_animation.stop()
        if animate and self.isVisible():
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
        for animation in (self.geometry_animation, self.text_fade, self.fade_animation):
            if animation.state() == QAbstractAnimation.State.Running:
                animation.setCurrentTime(animation.duration())

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
        self.reel.set_paused(error)
        self._update_texts()
        if changed:  # The new line fades in instead of jumping.
            self.text_fade.stop()
            self.text_fade.setStartValue(0.0)
            self.text_fade.setEndValue(1.0)
            self.text_fade.start()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        height = max(1, self.height())
        for label, size in ((self.status_label, height / 30), (self.hint_label, height / 60),
                            (self.brand_label, height / 55)):
            font = label.font()
            font.setPixelSize(int(min(max(size, 12), 30 if label is self.status_label else 18)))
            label.setFont(font)
        self.reel.setMaximumSize(min(720, int(self.width() * 0.6)), max(130, int(height * 0.36)))

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
        """windowOpacity 1 -> 0 in FADE_MS, then hide (and close when cancelling) and emit faded."""
        self._close_after_fade = bool(close) or (self._fading and self._close_after_fade)
        if self._fading:
            return
        if not self.isVisible():
            self._fade_finished()
            return
        self._fading = True
        self.fade_animation.stop()
        self.fade_animation.setStartValue(self.windowOpacity())
        self.fade_animation.setEndValue(0.0)
        self.fade_animation.start()

    def _fade_finished(self):
        self._fading = False
        self.text_fade.stop()
        self.geometry_animation.stop()
        self.reel.stop()
        self.hide()
        if self._close_after_fade:
            self._close_after_fade = False
            self.dismiss()
        self.setWindowOpacity(1.0)  # Ready for the next launch.
        self.faded.emit()

    def hide_now(self):
        """Hide at once (fallback to the app window, normal mpv exit) and reset the fade state."""
        self.fade_animation.stop()
        self.text_fade.stop()
        self.geometry_animation.stop()
        self.reel.stop()
        self._fading = False
        self._close_after_fade = False
        self.hide()
        self.setWindowOpacity(1.0)

    def dismiss(self):
        """Close without asking the user (programmatic close, no cancel signal)."""
        self.fade_animation.stop()
        self.text_fade.stop()
        self.geometry_animation.stop()
        self.reel.stop()
        self._fading = False
        self._closing = True
        try:
            self.close()
        finally:
            self._closing = False

    def keyPressEvent(self, event):
        if event.key() == Qt.Key.Key_Escape:
            self.cancelRequested.emit()
            return
        super().keyPressEvent(event)

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

    def __init__(self, *, api_factory=Api, engine=None, worker=None, show_splash=True, parent=None):
        super().__init__(parent)
        self.api_factory = api_factory
        self.engine = engine or Mpv()
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
        self.splash = self._make_splash() if show_splash else None

    def _make_splash(self):
        splash = DirectLaunchSplash()
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
        self._close_api()
        self.meta, self.url, self.attempt, self.playing = None, '', 0, False
        self._status(STARTING)
        api = self.api_factory()
        if hasattr(api, 'token'):
            api.token = ''
        self.api = api
        if self._worker is None and callable(getattr(self.engine, 'prewarm', None)):
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
                self.timer.stop()
                self._close_api()
                self._hide_splash()
                self.fallback.emit(dict(meta))
                return
            self.started_at = time.monotonic()
            self._start_attempt(generation, 0)

        def fail(error):
            if generation == self.generation:
                self._error(self._explain(error))

        self.work(lambda: api.open_launch(launch_id), done, fail)
        return True

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
        self._stop_everything()
        if self.splash is None or not self.splash.isVisible():
            self._cancelled()
            return
        self.splash.reel.stop()
        self.splash.fade_out(close=True)

    def _splash_faded(self):
        if self.cancelling:
            self._cancelled()

    def _cancelled(self):
        if self.splash is not None:
            self.splash.dismiss()
        if not self.cancel_reported:  # finished(1) exactly once, even if ✕ and Esc race.
            self.cancel_reported = True
            self.finished.emit(1)

    def _stop_everything(self):
        self.retired = True
        self.generation += 1  # warm_stream polls this and stops; late open_launch results are dropped.
        self.frame_token += 1
        self.timer.stop()
        self.engine.stop()
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

    def shutdown(self):
        self._stop_everything()
        self._hide_splash()
        if self.splash is not None:
            self.splash.dismiss()
