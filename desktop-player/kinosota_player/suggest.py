"""Header search suggestions: the first results under the field, like the website popup.

The popup is a child of the window (never a separate top-level window), so the
search field keeps keyboard focus: ↑/↓ move the highlight, Enter opens, Esc closes.
"""
import html
import re
from PySide6.QtCore import QPoint, Qt, Signal
from PySide6.QtWidgets import QFrame, QHBoxLayout, QLabel, QVBoxLayout
from .artwork import Sink, rounded
from .catalog import Posters
from .preferences import movie_title, translate

WORD = re.compile(r'[^\W_]+')
MARK = '#ffd24d'
LIMIT = 5


def fold(value):
    """Case- and ё-insensitive form that keeps one character per character."""
    out = []
    for char in value:
        lower = char.lower()
        out.append(('е' if lower == 'ё' else lower) if len(lower) == 1 else char)
    return ''.join(out)


def stem(word):
    return word[:-2] if len(word) > 5 else word[:-1] if len(word) == 5 else word


def highlight_parts(text, needles):
    """[(chunk, marked)]: a title word is marked when it starts with the stem of a typed word
    (or of the server interpretation), so «тёмный рыцарь» also lights «Тёмного рыцаря»."""
    stems = list(dict.fromkeys(stem(word) for needle in needles for word in WORD.findall(fold(needle or ''))
                               if len(word) >= 2))
    if not text:
        return []
    if not stems:
        return [(text, False)]
    parts = []

    def push(chunk, mark):
        if not chunk:
            return
        if parts and parts[-1][1] == mark:
            parts[-1] = (parts[-1][0] + chunk, mark)
        else:
            parts.append((chunk, mark))

    index, previous = 0, False
    for match in WORD.finditer(text):
        start, word = match.start(), match.group()
        hit = any(fold(word).startswith(value) for value in stems)
        gap = text[index:start]
        push(gap, hit and previous and bool(gap) and gap.isspace())
        push(word, hit)
        previous, index = hit, start + len(word)
    push(text[index:], False)
    return parts


def highlight_html(text, needles):
    return ''.join(f'<span style="color:{MARK};font-weight:800">{html.escape(chunk)}</span>' if mark else html.escape(chunk)
                   for chunk, mark in highlight_parts(text, needles))


def poster_of(movie):
    return movie.get('poster') or movie.get('poster_url') or ''


def meta_text(movie, language='ru'):
    """«Сериал · 2004 · ★ 8.6»."""
    series = movie.get('kind') == 'tv' or movie.get('type') == 'series'
    parts = [translate('Сериал' if series else 'Фильм', language)]
    if type(movie.get('year')) is int:
        parts.append(str(movie['year']))
    rating = movie.get('rating')
    if type(rating) in (int, float) and rating > 0:
        parts.append(f'★ {float(rating):.1f}')
    return ' · '.join(parts)


class SuggestRow(QFrame):
    clicked = Signal(int)
    hovered = Signal(int)

    def __init__(self, index):
        super().__init__()
        self.index = index
        self.setObjectName('suggestRow')
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        row = QHBoxLayout(self)
        row.setContentsMargins(8, 6, 10, 6)
        row.setSpacing(12)
        self.thumb = QLabel()
        self.thumb.setFixedSize(32, 48)
        self.title = QLabel()
        self.title.setObjectName('suggestTitle')
        self.title.setTextFormat(Qt.TextFormat.RichText)
        self.meta = QLabel()
        self.meta.setObjectName('suggestMeta')
        self.meta.setTextFormat(Qt.TextFormat.PlainText)
        text = QVBoxLayout()
        text.setSpacing(2)
        text.addWidget(self.title)
        text.addWidget(self.meta)
        row.addWidget(self.thumb)
        row.addLayout(text, 1)
        for child in (self.thumb, self.title, self.meta):
            child.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)

    def enterEvent(self, event):
        self.hovered.emit(self.index)
        super().enterEvent(event)

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.clicked.emit(self.index)
            event.accept()
            return
        super().mousePressEvent(event)


class SuggestPopup(QFrame):
    """Glass popup under the header search with up to five results (poster, marks, meta)."""
    chosen = Signal(int)

    def __init__(self, parent, origin):
        super().__init__(parent)
        self.setObjectName('suggest')
        self.hide()
        self.items, self.active = [], -1
        self.posters = Posters(Sink(self, self.refresh_art), origin)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(6, 6, 6, 6)
        layout.setSpacing(2)
        self.hint = QLabel()
        self.hint.setObjectName('suggestHint')
        self.hint.setTextFormat(Qt.TextFormat.RichText)
        layout.addWidget(self.hint)
        self.rows = []
        for index in range(LIMIT):
            row = SuggestRow(index)
            row.clicked.connect(self.chosen.emit)
            row.hovered.connect(self.set_active)
            layout.addWidget(row)
            self.rows.append(row)

    def present(self, field, items, query, interpreted='', language='ru', title_language='ru'):
        self.items = [item for item in items if isinstance(item, dict)][:LIMIT]
        if not self.items:
            self.dismiss()
            return
        interpreted = (interpreted or '').strip()
        show_hint = bool(interpreted) and interpreted.lower() != (query or '').strip().lower()
        self.hint.setVisible(show_hint)
        if show_hint:
            self.hint.setText(f'{html.escape(translate("Ищем", language))} '
                              f'<span style="color:{MARK};font-weight:700">«{html.escape(interpreted)}»</span>')
        for index, row in enumerate(self.rows):
            if index < len(self.items):
                movie = self.items[index]
                title = movie_title(movie, title_language)
                title = title if len(title) <= 70 else title[:69].rstrip() + '…'
                row.title.setText(highlight_html(title, [query, interpreted]))
                row.meta.setText(meta_text(movie, language))
                row.setAccessibleName(f'{title}, {row.meta.text()}')
                self.posters.load(poster_of(movie))
            row.setVisible(index < len(self.items))
        self.set_active(-1)
        self.refresh_art()
        self.place(field)
        self.show()
        self.raise_()

    def place(self, field):
        parent = self.parentWidget()
        if parent is None:
            return
        corner = field.mapTo(parent, QPoint(0, field.height() + 6))
        width = min(max(field.width(), 380), max(200, parent.width() - 16))
        self.setFixedWidth(width)
        self.adjustSize()
        self.move(max(8, min(corner.x(), parent.width() - width - 8)), corner.y())

    def set_active(self, index):
        self.active = index if 0 <= index < len(self.items) else -1
        for position, row in enumerate(self.rows):
            on = position == self.active
            if row.property('active') != on:
                row.setProperty('active', on)
                row.style().unpolish(row)
                row.style().polish(row)

    def move_active(self, delta):
        count = len(self.items)
        if count:
            self.set_active((self.active + delta) % count if self.active >= 0 else (0 if delta > 0 else count - 1))

    def dismiss(self):
        self.hide()
        self.items, self.active = [], -1

    def refresh_art(self):
        for index, row in enumerate(self.rows):
            if index < len(self.items):
                row.thumb.setPixmap(rounded(self.posters.get(poster_of(self.items[index])), 32, 48, 6))
