"""0.1.9: update the installed player from Settings → «О приложении», without uninstalling it.

The website publishes one build per OS (GET /desktop/releases, paid access for the download).
The player fetches its own build with the session token, checks the manifest SHA-256 and hands
the file to the system installer: apt through pkexec for the Linux package (then it restarts
itself), the Inno Setup wizard in silent mode on Windows (it closes and restarts the player),
the disk image on macOS. Source and portable previews only link to the download page.
"""
import os
import platform
import re
import shutil
import tempfile
import threading
from PySide6.QtCore import QObject, QProcess, QProcessEnvironment, QRunnable, QThreadPool, QTimer, Signal
from . import __version__
from .api import RELEASE_FILES, ApiError
from .engine import child_environment, native_loader
from .installation import install_command, restart_command
from .preferences import translate

OS_KEYS = {'Windows': 'windows', 'Darwin': 'macos', 'Linux': 'linux'}
DOWNLOAD_PAGE = 'https://watch.scenrix.com/player'
SHA256 = re.compile(r'[0-9a-f]{64}')
VERSION = re.compile(r'\d+(?:\.\d+){1,3}')
MACHINES = {'x86_64': 'x86_64', 'amd64': 'x86_64', 'x64': 'x86_64', 'arm64': 'arm64', 'aarch64': 'arm64'}
DISMISSED = (126, 127)  # pkexec: the password dialog was closed, or the user may not install.
BUSY = ('checking', 'downloading', 'installing')
TEXTS = {
    'idle': 'Текущая версия', 'checking': 'Проверяем обновления…', 'latest': 'Установлена последняя версия',
    'available': 'Доступна версия', 'unpublished': 'Сборка для этой системы пока не опубликована',
    'manual': 'Обновление из приложения работает для установленного пакета. Скачайте новую версию на сайте.',
    'downloading': 'Скачиваем обновление…', 'installing': 'Устанавливаем обновление…',
    'failed': 'Не удалось проверить обновления',
}


def version_tuple(value):
    if not isinstance(value, str) or not VERSION.fullmatch(value.strip()):
        return None
    return tuple(int(part) for part in value.strip().split('.'))


def is_newer(candidate, current=__version__):
    new, old = version_tuple(candidate), version_tuple(current)
    return bool(new and old and new > old)


def os_key(system=None):
    return OS_KEYS.get(system or platform.system())


def fits_machine(architecture, machine=None):
    """A build for another CPU is never offered; labels we do not know are left to the installer."""
    if not isinstance(architecture, str) or not architecture.strip():
        return True
    wanted = MACHINES.get(architecture.strip().lower())
    have = MACHINES.get(str(machine or platform.machine()).lower())
    return wanted is None or have is None or wanted == have


def evaluate(data, system=None, machine=None, current=__version__):
    """GET /desktop/releases → (state, item) for this computer.

    state: 'unpublished' (no usable build), 'latest', 'locked' (newer, but no paid access yet)
    or 'available' (newer, downloadable and with its checksum)."""
    key = os_key(system)
    items = data.get('items') if isinstance(data, dict) else None
    item = next((x for x in items if isinstance(x, dict) and x.get('os') == key), None) if key and isinstance(items, list) else None
    if not item or item.get('ready') is not True or not version_tuple(item.get('version')):
        return 'unpublished', None
    if not fits_machine(item.get('architecture'), machine):
        return 'unpublished', None
    if not is_newer(item['version'], current):
        return 'latest', item
    if not item.get('download_url') or not data.get('can_download'):
        return 'locked', item
    if not isinstance(item.get('sha256'), str) or not SHA256.fullmatch(item['sha256']):
        return 'unpublished', None  # A build without its checksum is never installed.
    return 'available', item


class _Signals(QObject):
    done = Signal(object)
    failed = Signal(object)


class _Job(QRunnable):
    def __init__(self, fn):
        super().__init__()
        self.fn, self.signals = fn, _Signals()

    def run(self):
        try:
            self.signals.done.emit(self.fn())
        except Exception as error:  # Reported on the GUI thread.
            self.signals.failed.emit(error)


class Updater(QObject):
    """Check → download (progress, cancel) → install → restart, as one small state machine."""
    changed = Signal()
    quitRequested = Signal()

    def __init__(self, api, work=None, system=None, machine=None, pool=None, parent=None):
        super().__init__(parent)
        self.api, self.system, self.machine = api, system or platform.system(), machine
        self.work = work or self._run
        self.pool = pool or QThreadPool.globalInstance()
        self.jobs = set()
        self.state, self.item, self.note = 'idle', None, ''
        self.signed_in = False
        self.received = self.total = 0
        self.generation = 0
        self.cancel_event = threading.Event()
        self.process = None
        self.ticker = QTimer(self)
        self.ticker.setInterval(150)  # Download progress: the worker counts, the GUI thread repaints.
        self.ticker.timeout.connect(self.changed.emit)

    # ---------- state ----------
    def _set(self, state, note=''):
        self.state, self.note = state, note
        self.changed.emit()

    @property
    def version(self):
        return (self.item or {}).get('version') or ''

    @property
    def busy(self):
        return self.state in BUSY

    def percent(self):
        return int(self.received * 100 / self.total) if self.total > 0 else 0

    def text(self, language='ru'):
        t = lambda value: translate(value, language)
        if self.note:
            return t(self.note)
        if self.state == 'idle':
            return f'{t(TEXTS["idle"])}: {__version__}'
        if self.state == 'available':
            return f'{t(TEXTS["available"])} {self.version}'
        if self.state == 'locked':
            return t('Обновления доступны с подпиской PRO' if self.signed_in else 'Войдите, чтобы скачать обновление')
        if self.state == 'downloading':
            done = f' {self.percent()}%' if self.total else ''
            return t(TEXTS['downloading']) + done
        return t(TEXTS.get(self.state, ''))

    def actions(self):
        """Which buttons the card shows: check, update (to the version), cancel, open the website."""
        state = self.state
        return {'check': state not in ('available', 'downloading', 'installing'),
                'update': state == 'available', 'cancel': state == 'downloading',
                'website': state in ('locked', 'manual', 'failed') and bool(self.item)}

    # ---------- work ----------
    def _run(self, fn, done, fail):
        job = _Job(fn)
        self.jobs.add(job)

        def finish(value):
            self.jobs.discard(job)
            done(value)

        def failure(error):
            self.jobs.discard(job)
            fail(error)

        job.signals.done.connect(finish)
        job.signals.failed.connect(failure)
        self.pool.start(job)

    def can_install(self):
        """Is this the installed package that the system installer can replace in place?"""
        name = RELEASE_FILES.get(os_key(self.system))
        return bool(name) and install_command(os.path.join(tempfile.gettempdir(), name), self.system) is not None

    def check(self, quiet=False):
        """GET /desktop/releases. ``quiet``: the silent check after sign-in (errors stay unspoken)."""
        if self.busy or not hasattr(self.api, 'releases'):
            return
        self.generation += 1
        generation, before = self.generation, (self.state, self.note)
        self._set('checking')

        def done(data):
            if generation != self.generation:
                return
            state, item = evaluate(data, self.system, self.machine)
            if state == 'available' and not self.can_install():
                state = 'manual'  # Not the installed package: the website has the installer.
            self.item = item
            self._set(state)

        def fail(_error):
            if generation != self.generation:
                return
            if quiet:
                self._set(*before)
            else:
                self._set('failed', TEXTS['failed'])

        self.work(self.api.releases, done, fail)

    def start(self):
        """Download the offered build into a private temporary folder, then install it."""
        if self.state != 'available' or not self.item:
            return
        key, item = os_key(self.system), self.item
        self.generation += 1
        generation = self.generation
        cancel = self.cancel_event = threading.Event()
        folder = tempfile.mkdtemp(prefix='kinosota-update-')  # 0700: only this user can swap the file.
        self.received = self.total = 0

        def progress(received, total):
            self.received, self.total = received, total

        def fetch():
            return self.api.download_release(key, folder, item['sha256'], progress=progress, cancelled=cancel.is_set)

        def done(path):
            self.ticker.stop()
            if generation != self.generation or not path:
                shutil.rmtree(folder, ignore_errors=True)
                return
            self.install(path, folder)

        def fail(error):
            self.ticker.stop()
            shutil.rmtree(folder, ignore_errors=True)
            if generation != self.generation:
                return
            if isinstance(error, ApiError) and error.status == 403:
                self.item = item
                self._set('locked')
                return
            message = str(error) if isinstance(error, ApiError) else 'Не удалось установить обновление. Скачайте пакет на сайте.'
            self._set('failed', message)

        self._set('downloading')
        self.ticker.start()
        self.work(fetch, done, fail)

    def cancel(self):
        if self.state != 'downloading':
            return
        self.cancel_event.set()  # The worker stops at the next chunk and removes its partial file.
        self.generation += 1
        self.ticker.stop()
        self._set('available', 'Обновление отменено')

    def shutdown(self):
        self.cancel_event.set()
        self.generation += 1
        self.ticker.stop()

    def _process(self, command):
        process = QProcess(self)
        environment = QProcessEnvironment()
        for key, value in child_environment().items():
            environment.insert(key, value)
        process.setProcessEnvironment(environment)
        process.setProgram(command[0])
        process.setArguments(command[1:])
        return process

    def install(self, path, folder=None):
        command = install_command(path, self.system)
        if not command:
            if folder:
                shutil.rmtree(folder, ignore_errors=True)
            self._set('manual')
            return
        if self.system == 'Linux':
            self._set('installing', 'Подтвердите установку в системном окне. Плеер перезапустится сам.')
            process = self.process = self._process(command)
            finished = []

            def end(code):
                if finished:
                    return
                finished.append(code)
                self.process = None
                if folder:
                    shutil.rmtree(folder, ignore_errors=True)
                self.installed(code)

            process.finished.connect(lambda code, _status: end(code))
            process.errorOccurred.connect(lambda error: end(-1) if error == QProcess.ProcessError.FailedToStart else None)
            with native_loader():
                process.start()
            process.closeWriteChannel()  # apt never waits for an answer on stdin.
            return
        process = self._process(command)
        with native_loader():
            started = process.startDetached()
            started = started[0] if isinstance(started, tuple) else bool(started)
        if not started:
            self._set('failed', 'Не удалось установить обновление. Скачайте пакет на сайте.')
            return
        if self.system == 'Windows':
            self._set('installing', 'Установщик запущен. Плеер закроется, чтобы обновиться.')
            QTimer.singleShot(800, self.quitRequested.emit)  # Setup /CLOSEAPPLICATIONS replaces the files after us.
        else:
            self._set('opened', 'Откройте образ и перенесите KINOSOTA Player в Applications с заменой.')

    def installed(self, code):
        if code == 0:
            restart = restart_command(self.system)
            if restart:
                with native_loader():
                    self._process(restart).startDetached()
            self._set('installing', 'Устанавливаем обновление…')
            self.quitRequested.emit()
            return
        if code in DISMISSED:
            self._set('available', 'Установка отменена. Текущая версия продолжает работать.')
        else:
            self._set('failed', 'Не удалось установить обновление. Скачайте пакет на сайте.')
