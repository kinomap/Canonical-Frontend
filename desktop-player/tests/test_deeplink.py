"""kinosota:// links from the website: strict parsing and single-window hand-off."""
import os
os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')
import socket, subprocess, sys, tempfile, time, uuid
from pathlib import Path
import pytest
from PySide6.QtCore import QUrl
from PySide6.QtGui import QFileOpenEvent
from PySide6.QtWidgets import QApplication
from kinosota_player import deeplink
from kinosota_player.deeplink import LinkEvents, find_link, parse_launch

LAUNCH = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'
ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize('link', [
    f'kinosota://watch?launch={LAUNCH}',
    f'kinosota://watch/?launch={LAUNCH}',
    f'KINOSOTA://WATCH?launch={LAUNCH.upper()}',
])
def test_only_the_website_launch_shape_is_accepted(link):
    assert parse_launch(link) == LAUNCH


@pytest.mark.parametrize('link', [
    None, '', 42, 'kinosota:', 'kinosota://watch', f'https://watch?launch={LAUNCH}',
    f'kinosota://evil?launch={LAUNCH}', f'kinosota://watch:80?launch={LAUNCH}',
    f'kinosota://user@watch?launch={LAUNCH}', f'kinosota://watch/play?launch={LAUNCH}',
    f'kinosota://watch?launch={LAUNCH}&token=secret', f'kinosota://watch?launch={LAUNCH}&launch={LAUNCH}',
    f'kinosota://watch?launch={LAUNCH}#x', 'kinosota://watch?launch=not-a-uuid',
    f'kinosota://watch?launch={LAUNCH.replace("-", "")}', f'kinosota://watch?launch=%20{LAUNCH}',
    f'kinosota://watch?launch={LAUNCH}\u044f', f'kinosota://watch?launch={LAUNCH}&x=' + 'a' * 300,
    f'kinosota://watch?launch={LAUNCH} --script=evil.lua',
])
def test_forged_or_foreign_links_are_rejected(link):
    assert parse_launch(link) is None


def test_argv_link_detection_skips_program_and_caps_length():
    assert find_link(['kinosota-player']) is None
    assert find_link([f'kinosota://watch?launch={LAUNCH}']) is None  # argv[0] is the program.
    assert find_link(['app', '--flag', f'KINOSOTA://watch?launch={LAUNCH}']) == f'KINOSOTA://watch?launch={LAUNCH}'
    long = find_link(['app', 'kinosota://' + 'x' * 1000])
    assert len(long) == deeplink.MAX_LINK + 1 and parse_launch(long) is None


def test_macos_file_open_event_is_routed_to_the_window():
    app = QApplication.instance() or QApplication([])
    seen = []
    events = LinkEvents(seen.append)
    assert events.eventFilter(app, QFileOpenEvent(QUrl(f'kinosota://watch?launch={LAUNCH}')))
    assert seen == [f'kinosota://watch?launch={LAUNCH}']
    assert not events.eventFilter(app, QFileOpenEvent(QUrl('file:///tmp/movie.mkv')))
    assert len(seen) == 1


def test_second_process_forwards_the_link_to_the_open_window(monkeypatch):
    app = QApplication.instance() or QApplication([])
    name = 'kinosota-test-' + uuid.uuid4().hex[:12]
    monkeypatch.setattr(deeplink, 'server_name', lambda: name)
    instance = deeplink.Instance()
    assert instance.listen()
    received = []
    instance.linkReceived.connect(received.append)
    link = f'kinosota://watch?launch={LAUNCH}'
    code = ('import sys\nfrom PySide6.QtCore import QCoreApplication\nfrom kinosota_player import deeplink\n'
            f'app = QCoreApplication([])\ndeeplink.server_name = lambda: {name!r}\n'
            'sys.exit(0 if deeplink.forward(sys.argv[1]) else 3)\n')
    env = dict(os.environ, PYTHONPATH=str(ROOT) + os.pathsep + os.environ.get('PYTHONPATH', ''))
    child = subprocess.Popen([sys.executable, '-c', code, link], cwd=str(ROOT), env=env)
    deadline = time.monotonic() + 30
    while child.poll() is None and time.monotonic() < deadline:
        app.processEvents()
        time.sleep(0.01)
    assert child.poll() == 0, 'the running window must acknowledge the link'
    for _ in range(20):
        app.processEvents()
    assert received == [link]
    # A later window must not steal links from the one that is already open.
    other = deeplink.Instance()
    assert not other.listen()
    instance.close()
    assert not deeplink.forward(link, timeout=300)  # Nobody listens any more.


@pytest.mark.skipif(sys.platform.startswith('win'), reason='Unix socket files only')
def test_stale_socket_from_a_crashed_run_is_replaced(monkeypatch):
    name = 'kinosota-test-' + uuid.uuid4().hex[:12]
    monkeypatch.setattr(deeplink, 'server_name', lambda: name)
    path = os.path.join(tempfile.gettempdir(), name)
    stale = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    stale.bind(path)
    stale.close()  # The file stays behind, nobody accepts connections.
    assert os.path.exists(path)
    app = QApplication.instance() or QApplication([])
    instance = deeplink.Instance()
    try:
        assert instance.listen()
        assert oct(os.stat(path).st_mode & 0o777) == '0o700'  # Only this user may hand over links.
    finally:
        instance.close()
        if os.path.exists(path):
            os.unlink(path)
