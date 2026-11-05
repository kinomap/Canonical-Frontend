"""Interface icons: Lucide line icons (ISC, the same set as the website) and language flags.

Every pictogram of the app comes from this one set at one stroke width, rendered for the
screen's device pixel ratio; nothing is drawn by hand next to it.
"""
from PySide6.QtCore import QByteArray, QRectF, Qt
from PySide6.QtGui import QBrush, QColor, QIcon, QPainter, QPainterPath, QPen, QPixmap
from PySide6.QtSvg import QSvgRenderer
from PySide6.QtWidgets import QApplication

# lucide-vue-next 0.428.0 (ISC, Lucide Contributors; portions MIT, Cole Bemis / Feather).
LUCIDE = {
    'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    'layout-grid': '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    'list': '<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-up': '<path d="m18 15-6-6-6 6"/>',
    'rotate-ccw': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    'bookmark': '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
    'bookmark-check': '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"/><path d="m9 10 2 2 4-4"/>',
    'play': '<polygon points="6 3 20 12 6 21 6 3"/>',
    'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    'settings': '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    'user': '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    'info': '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    'circle-help': '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    'copy': '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    'refresh-cw': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    'check': '<path d="M20 6 9 17l-5-5"/>',
    'plus': '<path d="M5 12h14"/><path d="M12 5v14"/>',
}
# The website's language flags (TorrentWatchPanel.vue): imagery, not icons.
FLAGS = {
    'ru': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 6"><rect width="9" height="2" fill="#fff"/>'
          '<rect y="2" width="9" height="2" fill="#0039a6"/><rect y="4" width="9" height="2" fill="#d52b1e"/></svg>',
    'uk': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 6"><rect width="9" height="3" fill="#0057b7"/>'
          '<rect y="3" width="9" height="3" fill="#ffd700"/></svg>',
    'en': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice">'
          '<rect width="60" height="30" fill="#012169"/><path d="M0 0L60 30M60 0L0 30" stroke="#fff" stroke-width="6"/>'
          '<path d="M0 0L60 30M60 0L0 30" stroke="#c8102e" stroke-width="2"/>'
          '<path d="M30 0V30M0 15H60" stroke="#fff" stroke-width="10"/>'
          '<path d="M30 0V30M0 15H60" stroke="#c8102e" stroke-width="6"/></svg>',
}
STROKE = 2.0  # Lucide's own weight, the same on every icon.


def _ratio():
    app = QApplication.instance()
    screen = app.primaryScreen() if app is not None else None
    return max(1.0, min(3.0, float(screen.devicePixelRatio()))) if screen is not None else 1.0


def _render(svg, width, height, ratio):
    pixmap = QPixmap(max(1, round(width * ratio)), max(1, round(height * ratio)))
    pixmap.fill(Qt.GlobalColor.transparent)
    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    QSvgRenderer(QByteArray(svg.encode())).render(painter, QRectF(0, 0, pixmap.width(), pixmap.height()))
    painter.end()
    pixmap.setDevicePixelRatio(ratio)
    return pixmap


def svg(name, color='#d5dbe0', fill='none'):
    body = LUCIDE[name]
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" '
            f'fill="{fill}" stroke="{color}" stroke-width="{STROKE}" stroke-linecap="round" '
            f'stroke-linejoin="round">{body}</svg>')


def glyph(name, color='#d5dbe0', size=16, fill='none'):
    """One Lucide icon as a crisp pixmap of ``size`` logical pixels."""
    return _render(svg(name, color, fill), size, size, _ratio())


def icon(name, color='#d5dbe0', size=16, checked=None, fill='none', checked_fill=None):
    """QIcon with an optional checked-state colour (toggle buttons)."""
    result = QIcon()
    result.addPixmap(glyph(name, color, size, fill), QIcon.Mode.Normal, QIcon.State.Off)
    if checked:
        result.addPixmap(glyph(name, checked, size, checked_fill or fill), QIcon.Mode.Normal, QIcon.State.On)
    return result


def flag(language, width=18, height=12):
    """Rounded language flag (ru / uk / en), or an empty pixmap for other codes."""
    source = FLAGS.get(language)
    if not source:
        return QPixmap()
    ratio = _ratio()
    art = _render(source, width, height, ratio)
    art.setDevicePixelRatio(1)  # Device pixels while it is a brush texture.
    result = QPixmap(art.size())
    result.fill(Qt.GlobalColor.transparent)
    painter = QPainter(result)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    path = QPainterPath()
    path.addRoundedRect(QRectF(0.5, 0.5, result.width() - 1, result.height() - 1), 2 * ratio, 2 * ratio)
    painter.fillPath(path, QBrush(art))
    painter.setPen(QPen(QColor(255, 255, 255, 46), ratio))
    painter.drawPath(path)
    painter.end()
    result.setDevicePixelRatio(ratio)
    return result
