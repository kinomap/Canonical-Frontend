"""Minimal, no-login redemption and mpv launch for website watch links."""
from __future__ import annotations

import time
import uuid
from urllib.parse import urlsplit

from PySide6.QtCore import QObject, QRunnable, QThreadPool, QTimer, Qt, Signal, Slot
from PySide6.QtWidgets import QHBoxLayout, QLabel, QPushButton, QVBoxLayout, QWidget

from .api import Api, ApiError
from .deeplink import parse_launch
from .engine import Mpv
from .torrents import audio_args, media_title_args


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
    """Redeem a site launch in a small splash, then run mpv without building the app window."""

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
        self.last_error = ''
        self.retired = False
        self.timer = QTimer(self)
        self.timer.setInterval(1000)
        self.timer.timeout.connect(self._watch)
        self.splash = self._make_splash() if show_splash else None

    def _make_splash(self):
        flags = (Qt.WindowType.Tool | Qt.WindowType.FramelessWindowHint |
                 Qt.WindowType.WindowStaysOnTopHint)
        window = QWidget(None, flags)
        window.setObjectName('directLaunchSplash')
        window.setWindowTitle('KINOSOTA Player')
        window.setFixedWidth(360)
        layout = QVBoxLayout(window)
        layout.setContentsMargins(22, 18, 18, 18)
        layout.setSpacing(14)
        row = QHBoxLayout()
        self.status_label = QLabel('Открываем фильм…', window)
        self.status_label.setWordWrap(True)
        self.status_label.setObjectName('directLaunchStatus')
        row.addWidget(self.status_label, 1)
        self.close_button = QPushButton('Закрыть', window)
        self.close_button.setObjectName('directLaunchClose')
        self.close_button.clicked.connect(self._close_by_user)
        self.close_button.hide()
        row.addWidget(self.close_button, 0, Qt.AlignmentFlag.AlignTop)
        layout.addLayout(row)
        return window

    def _status(self, message, *, error=False):
        self.last_error = message if error else ''
        if self.splash is None:
            return
        self.status_label.setText(message)
        self.close_button.setVisible(error)
        if not self.splash.isVisible():
            self.splash.show()
            self.splash.adjustSize()
            screen = self.splash.screen()
            if screen is not None:
                area = screen.availableGeometry()
                self.splash.move(area.center() - self.splash.rect().center())

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
        self.generation += 1
        generation = self.generation
        self.timer.stop()
        self.engine.stop()
        self._close_api()
        self.meta, self.url, self.attempt = None, '', 0
        self._status('Открываем фильм с сайта…')
        api = self.api_factory()
        if hasattr(api, 'token'):
            api.token = ''
        self.api = api

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
        meta, url, api = dict(self.meta), self.url, self.api
        self._status('Подключаем поток…' if attempt else 'Подготавливаем поток…')

        def start():
            if hasattr(api, 'warm_stream'):
                api.warm_stream(url, lambda: generation != self.generation)
            if generation != self.generation:
                return False
            self.engine.start(url, extra_args=launch_args(meta))
            return True

        def done(started):
            if generation != self.generation:
                return
            if not started:
                return
            self._hide_splash()
            self.timer.start()

        def fail(error):
            if generation == self.generation:
                self.timer.stop()
                self._error(self._explain(error))

        self.work(start, done, fail)

    def _watch(self):
        if self.engine.alive():
            return
        self.timer.stop()
        code = self.engine.exit_code()
        if code in (None, 0):
            self._hide_splash()
            self._close_api()
            self.finished.emit(0)
            return
        if code != 4 and self.attempt < 2 and time.monotonic() - self.started_at < 120:
            self._start_attempt(self.generation, self.attempt + 1)
            return
        self._error('Не удалось воспроизвести видео. Проверьте соединение и нажмите «Закрыть».')

    @staticmethod
    def _explain(error):
        if isinstance(error, ApiError):
            return {
                403: 'Для просмотра нужна действующая подписка PRO.',
                404: 'Ссылка не найдена или раздача больше недоступна. Нажмите «Смотреть» ещё раз.',
                409: 'Источник ещё готовится. Попробуйте открыть фильм чуть позже.',
                410: 'Ссылка устарела или уже использована. Нажмите «Смотреть» на сайте ещё раз.',
            }.get(error.status, str(error))
        return 'Не удалось открыть фильм. Проверьте соединение и попробуйте ещё раз.'

    def _error(self, message):
        self.timer.stop()
        self._status(message, error=True)

    def _close_by_user(self):
        self.shutdown()
        self.finished.emit(1)

    def _hide_splash(self):
        if self.splash is not None:
            self.splash.hide()

    def _close_api(self):
        api, self.api = self.api, None
        close = getattr(api, 'close', None)
        if callable(close):
            close()

    def retire(self):
        """Dismiss the no-login surface when the caller hands a legacy launch to Window."""
        self.retired = True
        self.generation += 1
        self.timer.stop()
        self.engine.stop()
        self._hide_splash()
        self._close_api()

    def shutdown(self):
        self.retired = True
        self.generation += 1
        self.timer.stop()
        self.engine.stop()
        self._hide_splash()
        self._close_api()
        if self.splash is not None:
            self.splash.close()
