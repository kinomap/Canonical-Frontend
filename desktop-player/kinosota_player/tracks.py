"""In-film track popups: every audio track or subtitle of the playing file, picked with one click.

A right click on the OSC 💬 / subtitle button reaches ``CinemaSurface`` as a script-message; the film window
opens ``TrackSelectionDialog`` over the picture. The rows come from mpv's ``track-list``; a click sets
``aid`` / ``sid`` on the running core, so the film switches on the fly and keeps playing.
"""
from __future__ import annotations

from PySide6.QtCore import QSize, Qt, Signal
from PySide6.QtGui import QColor, QIcon, QPainter
from PySide6.QtWidgets import (QButtonGroup, QDialog, QFrame, QHBoxLayout, QLabel, QPushButton, QScrollArea,
                               QVBoxLayout, QWidget)

from .icons import flag, icon
from .theme import PREMIUM_STYLE

AUDIO, SUBTITLES = 'audio', 'sub'
TITLES = {AUDIO: 'Выбор аудиодорожки', SUBTITLES: 'Выбор субтитров'}
EMPTY = {AUDIO: 'В этом файле нет аудиодорожек', SUBTITLES: 'В этом файле нет субтитров'}
SUBTITLES_OFF = 'Без субтитров'
OFF_ID = 0  # The «Без субтитров» row; mpv is given sid=no for it.
CHECK = '✓'

# mpv language tags -> the flags the app ships (ru / uk / en) and the short codes shown on the website.
FLAG_LANGUAGES = {'ru': 'ru', 'rus': 'ru', 'uk': 'uk', 'ukr': 'uk', 'en': 'en', 'eng': 'en'}
LANGUAGE_CODES = {'ru': 'RU', 'uk': 'UA', 'en': 'EN'}
LANGUAGE_NAMES = {'ru': 'Русский', 'uk': 'Украинский', 'en': 'Английский'}
CODECS = {'ac3': 'AC-3', 'eac3': 'E-AC-3', 'dts': 'DTS', 'truehd': 'TrueHD', 'aac': 'AAC', 'mp3': 'MP3', 'opus': 'Opus',
          'flac': 'FLAC', 'vorbis': 'Vorbis', 'subrip': 'SRT', 'ass': 'ASS', 'ssa': 'SSA', 'webvtt': 'WebVTT',
          'hdmv_pgs_subtitle': 'PGS', 'dvd_subtitle': 'VobSub', 'mov_text': 'TX3G'}
CHANNELS = {1: '1.0', 2: '2.0', 6: '5.1', 8: '7.1'}

TRACK_STYLE = PREMIUM_STYLE + """
QDialog#trackDialog{background:transparent;border:0;}
QFrame#audioCard{background:rgba(14,18,26,245);border:1px solid rgba(255,255,255,28);border-radius:18px;}
QLabel#audioDialogTitle{font-family:"Manrope";font-size:20px;font-weight:700;color:#ffffff;}
QLabel#trackEmpty{font-size:14px;color:rgba(255,255,255,140);padding:12px 2px;}
QPushButton#audioTrack{text-align:left;}
"""


def _int(value):
    return value if type(value) is int else None


def _language(track):
    tag = str(track.get('lang') or '').strip().lower()
    return FLAG_LANGUAGES.get(tag, ''), (LANGUAGE_CODES.get(FLAG_LANGUAGES.get(tag, '')) or tag.upper())


def _details(track, kind):
    parts = []
    codec = str(track.get('codec') or '').strip().lower()
    if codec:
        parts.append(CODECS.get(codec, codec.upper()))
    if kind == AUDIO:
        channels = _int(track.get('demux-channel-count'))
        if channels:
            parts.append(CHANNELS.get(channels, f'{channels} ch'))
    else:
        title = str(track.get('title') or '').lower()
        if track.get('forced') is True and 'forced' not in title:
            parts.append('Forced')
        if track.get('external') is True:
            parts.append('внешние')
    return ' · '.join(parts)


def track_entries(track_list, kind):
    """mpv ``track-list`` -> rows of one kind ('audio' / 'sub') in container order.

    Each row: id (mpv aid/sid), language (flag code or ''), code (RU / UA / EN / tag), title, details, selected.
    Subtitles start with the «Без субтитров» row (id 0), selected when no subtitle is shown.
    """
    rows = []
    for track in track_list if isinstance(track_list, list) else []:
        if not isinstance(track, dict) or track.get('type') != kind:
            continue
        track_id = _int(track.get('id'))
        if track_id is None or track_id <= 0:
            continue
        language, code = _language(track)
        title = str(track.get('title') or '').strip()
        if not title:
            title = LANGUAGE_NAMES.get(language) or f'Дорожка {track_id}'
        rows.append({'id': track_id, 'language': language, 'code': code, 'title': title,
                     'details': _details(track, kind), 'selected': track.get('selected') is True})
    if kind == SUBTITLES:
        off = not any(row['selected'] for row in rows)
        rows.insert(0, {'id': OFF_ID, 'language': '', 'code': '', 'title': SUBTITLES_OFF, 'details': '',
                        'selected': off})
    return rows


def row_text(row):
    text = row['title']
    if row['code'] and not row['language']:
        text = f"{row['code']}  {text}"  # No flag for this language: its tag says it.
    if row['details']:
        text += f"   ·   {row['details']}"
    if row['selected']:
        text += f'   {CHECK}'
    return text


class TrackSelectionDialog(QDialog):
    """«Выбор аудиодорожки» / «Выбор субтитров» over the playing film: a dimmed picture, a dark-glass card.

    One click on a row emits ``trackChosen(id)`` and closes; Esc, ✕ or a click on the dimmed area just close.
    """
    trackChosen = Signal(int)

    def __init__(self, parent, kind, rows):
        super().__init__(parent)
        self.kind = kind
        self.rows = [dict(row) for row in rows or []]
        self.setObjectName('trackDialog')
        self.setWindowTitle(TITLES.get(kind, ''))
        self.setWindowFlags(Qt.WindowType.Dialog | Qt.WindowType.FramelessWindowHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setStyleSheet(TRACK_STYLE)
        self.setModal(True)
        outer = QVBoxLayout(self)
        outer.setContentsMargins(24, 24, 24, 24)
        outer.addStretch(1)
        middle = QHBoxLayout()
        middle.addStretch(1)
        self.card = QFrame()
        self.card.setObjectName('audioCard')
        self.card.setFixedWidth(520)
        middle.addWidget(self.card)
        middle.addStretch(1)
        outer.addLayout(middle)
        outer.addStretch(1)
        box = QVBoxLayout(self.card)
        box.setContentsMargins(24, 20, 24, 22)
        box.setSpacing(0)
        head = QHBoxLayout()
        head.setSpacing(12)
        self.title_label = QLabel(TITLES.get(kind, ''))
        self.title_label.setObjectName('audioDialogTitle')
        head.addWidget(self.title_label, 1)
        self.close_button = QPushButton()
        self.close_button.setObjectName('iconButton')
        self.close_button.setIcon(icon('x', '#c9ced6', 18))
        self.close_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self.close_button.setToolTip('Закрыть')
        self.close_button.setAccessibleName('Закрыть')
        self.close_button.setAutoDefault(False)
        self.close_button.clicked.connect(self.reject)
        head.addWidget(self.close_button, 0, Qt.AlignmentFlag.AlignTop)
        box.addLayout(head)
        box.addSpacing(14)
        listing = QWidget()
        listing.setObjectName('audioList')
        lines = QVBoxLayout(listing)
        lines.setContentsMargins(0, 0, 0, 0)
        lines.setSpacing(6)
        self.group = QButtonGroup(self)
        self.group.setExclusive(True)
        self.track_buttons = {}
        for row in self.rows:
            button = QPushButton(row_text(row))
            button.setObjectName('audioTrack')
            button.setCheckable(True)
            button.setChecked(bool(row['selected']))
            button.setCursor(Qt.CursorShape.PointingHandCursor)
            button.setAutoDefault(False)
            if row['language']:
                button.setIcon(QIcon(flag(row['language'])))
                button.setIconSize(QSize(18, 12))
            button.setAccessibleName(row_text(row))
            button.clicked.connect(lambda _checked=False, track_id=row['id']: self.choose(track_id))
            self.group.addButton(button)
            self.track_buttons[row['id']] = button
            lines.addWidget(button)
        self.empty_label = None
        if not self.rows:
            self.empty_label = QLabel(EMPTY.get(kind, ''))
            self.empty_label.setObjectName('trackEmpty')
            lines.addWidget(self.empty_label)
        lines.addStretch(1)
        self.scroll = QScrollArea()
        self.scroll.setObjectName('audioScroll')
        self.scroll.setWidgetResizable(True)
        self.scroll.setFrameShape(QFrame.Shape.NoFrame)
        self.scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.scroll.setWidget(listing)
        box.addWidget(self.scroll, 1)
        self._listing = listing

    def selected_id(self):
        return next((row['id'] for row in self.rows if row['selected']), None)

    def choose(self, track_id):
        self.trackChosen.emit(int(track_id))
        self.accept()

    def cover(self, host):
        """Lie exactly over the film window; the card stays centred and never outgrows 70 % of its height."""
        if host is None:
            return
        area = host.frameGeometry() if host.isWindow() else host.rect()
        if host.isWindow():
            self.setGeometry(area)
        else:
            top_left = host.mapToGlobal(area.topLeft())
            self.setGeometry(top_left.x(), top_left.y(), area.width(), area.height())
        wanted = self._listing.sizeHint().height() + 2
        self.scroll.setMaximumHeight(max(120, min(wanted, int(self.height() * 0.7) - 90)))
        self.scroll.setMinimumHeight(min(wanted, self.scroll.maximumHeight()))
        self.card.setMaximumWidth(max(280, self.width() - 48))
        current = self.track_buttons.get(self.selected_id())
        if current is not None:
            current.setFocus()
            self.scroll.ensureWidgetVisible(current)

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.fillRect(self.rect(), QColor(0, 0, 0, 115))  # The film stays visible, dimmed, behind the card.
        painter.end()

    def mousePressEvent(self, event):
        if not self.card.geometry().contains(event.position().toPoint()):
            self.reject()  # A click on the dimmed film closes the popup.
            event.accept()
            return
        super().mousePressEvent(event)
