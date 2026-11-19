"""Open web pages in the viewer's own default browser (the running one, with its signed-in session).

A frozen build (PyInstaller) exports its private library and Qt plugin directories to the process
environment. ``webbrowser.open`` / ``xdg-open`` started with that environment break, or start a
separate browser instance that has none of the viewer's cookies, so the site asks for the password
again. Every page is therefore opened with the environment the viewer's session had before the app
started: QDesktopServices first (the platform handler: a new tab in the running browser), then
``xdg-open`` / ``open`` / ``os.startfile`` with that clean environment, then ``webbrowser``.
"""
from __future__ import annotations

import logging
import os
import subprocess
import sys
import threading
import webbrowser
from contextlib import contextmanager

log = logging.getLogger('kinosota.browser')

SITE = 'https://watch.scenrix.com'
BILLING_URL = SITE + '/profile?tab=billing'
# Variables a frozen build changes for itself; PyInstaller keeps the viewer's value as NAME_ORIG.
BUNDLE_VARIABLES = ('LD_LIBRARY_PATH', 'LD_PRELOAD', 'QT_PLUGIN_PATH', 'QT_QPA_PLATFORM_PLUGIN_PATH',
                    'GTK_PATH', 'GIO_MODULE_DIR', 'GDK_PIXBUF_MODULE_FILE', 'PYTHONHOME', 'PYTHONPATH')
_env_lock = threading.Lock()


def bundled():
    """A frozen build (PyInstaller): its own library paths are in the environment."""
    return bool(getattr(sys, 'frozen', False))


def clean_environment(env=None, *, frozen=None):
    """The viewer's environment without the app bundle's library paths (NAME_ORIG restored when set).

    A source run (no bundle) keeps its environment as is, except LD_LIBRARY_PATH that the URL
    handler never needs (the browser resolves its own libraries)."""
    env = dict(os.environ if env is None else env)
    if not (bundled() if frozen is None else frozen):
        env.pop('LD_LIBRARY_PATH', None)
        return env
    for name in BUNDLE_VARIABLES:
        original = env.pop(name + '_ORIG', None)
        if original:
            env[name] = original
        else:
            env.pop(name, None)
    return env


@contextmanager
def _clean_process_environment():
    """Qt starts the URL handler with the process environment: give it the clean one meanwhile."""
    with _env_lock:
        saved = dict(os.environ)
        clean = clean_environment(saved)
        try:
            for name in [k for k in os.environ if k not in clean]:
                os.environ.pop(name, None)
            os.environ.update(clean)
            yield clean
        finally:
            os.environ.clear()
            os.environ.update(saved)


def _qt_open(url):
    try:
        from PySide6.QtCore import QUrl
        from PySide6.QtGui import QDesktopServices
    except Exception:  # noqa: BLE001 - no Qt (tests, headless tools)
        return False
    try:
        return bool(QDesktopServices.openUrl(QUrl(url)))
    except Exception as error:  # noqa: BLE001
        log.info('QDesktopServices could not open the page: %s', error)
        return False


def _system_open(url, env):
    try:
        if sys.platform.startswith('win'):
            os.startfile(url)  # type: ignore[attr-defined]  # noqa: S606
            return True
        command = ['open', url] if sys.platform == 'darwin' else ['xdg-open', url]
        subprocess.Popen(command, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, start_new_session=True, close_fds=True)
        return True
    except (OSError, ValueError) as error:
        log.info('The system URL handler could not open the page: %s', error)
        return False


def open_url(url):
    """Open ``url`` (https only) in the default browser of the viewer's session. True when handed over."""
    if not isinstance(url, str) or not url.startswith('https://'):
        return False
    with _clean_process_environment() as env:
        if _qt_open(url):
            return True
        if _system_open(url, env):
            return True
        try:
            return bool(webbrowser.open(url, new=2))
        except webbrowser.Error:
            return False


def open_billing():
    """«Нужна подписка PRO»: the PRO checkout of the site."""
    return open_url(BILLING_URL)
