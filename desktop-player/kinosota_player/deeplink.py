"""kinosota:// deep links from the website and single-instance hand-off.

The site's «▶ Смотреть» button opens ``kinosota://watch?launch=<uuid>``. The link is
untrusted input: only that exact shape is accepted and it carries no token. The
launch id is short-lived and bound to the website account; the app redeems it with
its own signed-in session, so a leaked or forged link grants nothing.

Windows/Linux pass the link in argv (a second process), macOS delivers a FileOpen
event to the running app. A per-user local socket forwards links from a second
process to the window that is already open.
"""
import getpass, hashlib, re, uuid
from urllib.parse import parse_qs, urlsplit
from PySide6.QtCore import QEvent, QObject, Signal
from PySide6.QtNetwork import QLocalServer, QLocalSocket

SCHEME = 'kinosota'
MAX_LINK = 200
_UUID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')


def parse_launch(link):
    """Canonical launch UUID from ``kinosota://watch?launch=<uuid>``; None otherwise."""
    if not isinstance(link, str) or not link or len(link) > MAX_LINK:
        return None
    if any(ord(ch) < 33 or ord(ch) > 126 for ch in link.strip()):
        return None
    try:
        parts = urlsplit(link.strip())
        port = parts.port
    except ValueError:
        return None
    if parts.scheme.lower() != SCHEME or (parts.hostname or '') != 'watch' or port is not None:
        return None
    if parts.netloc.lower() != 'watch' or parts.path not in ('', '/') or parts.fragment:
        return None
    query = parse_qs(parts.query, keep_blank_values=True)
    if set(query) != {'launch'} or len(query['launch']) != 1:
        return None
    value = query['launch'][0].lower()
    if not _UUID.fullmatch(value):
        return None
    return str(uuid.UUID(value))


def find_link(argv):
    """The first kinosota: argument (raw, validated later), if the OS passed one."""
    for arg in list(argv or [])[1:]:
        if isinstance(arg, str) and arg[:len(SCHEME) + 1].lower() == SCHEME + ':':
            return arg[:MAX_LINK + 1]
    return None


def server_name():
    try:
        user = getpass.getuser()
    except Exception:
        user = 'user'
    return 'kinosota-player-' + hashlib.sha256(user.encode('utf-8', 'replace')).hexdigest()[:16]


def forward(link, timeout=1500):
    """Hand a link to an already running app. True when it accepted the link."""
    socket = QLocalSocket()
    socket.connectToServer(server_name())
    if not socket.waitForConnected(timeout):
        return False
    try:
        socket.write((str(link)[:MAX_LINK] + '\n').encode('utf-8', 'replace'))
        if not socket.waitForBytesWritten(timeout):
            return False
        # Wait for the acknowledgement so a hung window does not swallow the click.
        return socket.waitForReadyRead(timeout) and bytes(socket.readAll()).startswith(b'ok')
    finally:
        socket.disconnectFromServer()


class Instance(QObject):
    """Per-user local server that receives links forwarded by later processes."""
    linkReceived = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.server = QLocalServer(self)
        self.server.setSocketOptions(QLocalServer.SocketOption.UserAccessOption)
        self.server.newConnection.connect(self._accept)

    def listen(self):
        name = server_name()
        # Qt replaces an existing Unix socket when access options are set, so probe
        # first: an open window keeps receiving links instead of losing them silently.
        probe = QLocalSocket()
        probe.connectToServer(name)
        if probe.waitForConnected(300):
            probe.disconnectFromServer()
            return False
        QLocalServer.removeServer(name)  # Stale socket left by a crashed run.
        return self.server.listen(name)

    def close(self):
        self.server.close()

    def _accept(self):
        while self.server.hasPendingConnections():
            connection = self.server.nextPendingConnection()
            buffer = bytearray()

            def read(connection=connection, buffer=buffer):
                buffer.extend(bytes(connection.readAll()))
                if len(buffer) > MAX_LINK + 2:
                    connection.abort()
                    return
                if b'\n' in buffer:
                    line = bytes(buffer).split(b'\n', 1)[0].decode('utf-8', 'replace')
                    buffer.clear()
                    connection.write(b'ok\n')
                    connection.flush()
                    connection.disconnectFromServer()
                    self.linkReceived.emit(line)

            connection.readyRead.connect(read)
            connection.disconnected.connect(connection.deleteLater)


class LinkEvents(QObject):
    """macOS opens custom-scheme URLs with a FileOpen event instead of argv."""

    def __init__(self, callback, parent=None):
        super().__init__(parent)
        self.callback = callback

    def eventFilter(self, watched, event):
        if event.type() == QEvent.Type.FileOpen:
            url = getattr(event, 'url', None)
            text = url().toString() if callable(url) else ''
            if text[:len(SCHEME) + 1].lower() == SCHEME + ':':
                self.callback(text)
                return True
        return False
