"""Title page building blocks (0.1.9): overlay top bar, sticky poster column, people cards and strips."""
from html import escape
from math import ceil
from PySide6.QtCore import QEvent, QPoint, QSize, Qt
from PySide6.QtGui import QColor, QFontMetricsF, QLinearGradient, QPainter
from PySide6.QtWidgets import (QFrame, QHBoxLayout, QLabel, QPushButton, QScrollArea, QSizePolicy, QVBoxLayout,
                               QWidget)
from .artwork import rounded
from .icons import icon
from .motion import smooth
from .theme import BACKGROUND, shadow_pixmap


class TextBlock(QLabel):
    """Word-wrapped plain text with a CSS line height: ``factor`` × the font size (``line-height: 1.7``)."""

    def __init__(self, name, factor, parent=None):
        super().__init__(parent)
        self.setObjectName(name)
        self.setWordWrap(True)
        self.setTextFormat(Qt.TextFormat.RichText)
        self.factor, self.plain = factor, ''

    def set_text(self, text):
        text = str(text or '')
        if text != self.plain:
            self.plain = text
            self.refresh()

    def refresh(self):
        self.ensurePolished()
        font = self.font()
        size = font.pixelSize() if font.pixelSize() > 0 else font.pointSizeF() * 96 / 72
        natural = QFontMetricsF(font).height()
        line = max(1, round(size * self.factor))
        # Qt puts the spare (or missing) height under each line; the last line keeps its descent visible.
        self.setContentsMargins(0, 0, 0, max(0, ceil(natural - line)))
        body = escape(self.plain).replace('\n', '<br>')
        self.setText(f'<p style="line-height:{line}px;margin:0">{body}</p>' if body else '')

    def changeEvent(self, event):
        super().changeEvent(event)
        if event.type() == QEvent.Type.FontChange and self.plain:
            self.refresh()


class TopBar(QWidget):
    """«← Назад» over the scrolling page; the page fades under it once it scrolls."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName('detailTopbar')
        self.strength, self.scroll = 0.0, None
        row = QHBoxLayout(self)
        row.setContentsMargins(40, 16, 40, 16)
        row.setSpacing(8)
        self.back = QPushButton()
        self.back.setObjectName('backBtn')
        self.back.setCursor(Qt.CursorShape.PointingHandCursor)
        self.back.setIcon(icon('arrow-left', '#b9c0c8', 14))
        self.back.setIconSize(QSize(14, 14))
        row.addWidget(self.back)
        row.addStretch(1)

    def follow(self, scroll):
        """Lie over the top of ``scroll`` without covering its scroll bar."""
        self.scroll = scroll
        scroll.viewport().installEventFilter(self)
        self.place()

    def place(self):
        if self.scroll is not None:
            self.setGeometry(0, 0, self.scroll.viewport().width(), self.sizeHint().height())
            self.raise_()

    def eventFilter(self, watched, event):
        if event.type() == QEvent.Type.Resize:
            self.place()
        return False

    def set_padding(self, vertical, horizontal):
        self.layout().setContentsMargins(horizontal, vertical, horizontal, vertical)
        self.place()

    def set_strength(self, value):
        value = max(0.0, min(1.0, float(value)))
        if abs(value - self.strength) > 0.01:
            self.strength = value
            self.update()

    def paintEvent(self, event):
        if self.strength <= 0:
            return
        p = QPainter(self)
        fade = QLinearGradient(0, 0, 0, self.height())
        top = QColor(BACKGROUND)
        top.setAlphaF(0.9 * self.strength)
        end = QColor(BACKGROUND)
        end.setAlphaF(0.0)
        fade.setColorAt(0, top)
        fade.setColorAt(1, end)
        p.fillRect(self.rect(), fade)


class StickyColumn(QWidget):
    """Grid cell whose content sticks under the top bar while the row scrolls (CSS position: sticky)."""

    def __init__(self, content, parent=None):
        super().__init__(parent)
        self.content = content
        content.setParent(self)
        self.offset = 0
        self.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Preferred)

    def sizeHint(self):
        return self.content.sizeHint()

    def minimumSizeHint(self):
        return QSize(self.content.minimumSizeHint().width(), self.content.sizeHint().height())

    def stick(self, scroll_top, sticky_top):
        """``scroll_top``: viewport top in the coordinates of this cell's parent page."""
        height = self.content.sizeHint().height()
        wanted = scroll_top + sticky_top - self.y()
        self.offset = int(max(0, min(self.height() - height, wanted)))
        self.place()

    def place(self):
        height = self.content.sizeHint().height()
        self.content.setGeometry(0, max(0, min(self.offset, self.height() - height)), self.width(), height)

    def refresh(self):
        """The content changed its height (status line, progress): re-measure the row."""
        self.updateGeometry()
        self.place()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.place()


class ShadowHost(QWidget):
    """Paints the poster's soft drop shadow (0 24px 64px) behind its children."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.target = None

    def paintEvent(self, event):
        target = self.target
        if target is None or not target.isVisible() or target.width() < 8:
            return
        origin = target.mapTo(self, QPoint(0, 0))
        shadow, pad = shadow_pixmap(target.width(), target.height(), 10)
        p = QPainter(self)
        p.drawPixmap(origin.x() - pad, origin.y() - pad + 20, shadow)


class PersonCard(QFrame):
    """Actor or director: 88 px photo, name and role; a white plate under the pointer."""

    def __init__(self, compact=False, parent=None):
        super().__init__(parent)
        self.setObjectName('personCard')
        self.setAttribute(Qt.WidgetAttribute.WA_Hover)
        self.person, self.photo_url, self.photo_size = {}, '', 88
        self._pixmap, self._shown = None, None
        self.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
        row = QHBoxLayout(self)
        row.setContentsMargins(0, 0, 28, 0)
        row.setSpacing(20)
        self.photo = QLabel()
        self.photo.setObjectName('personPhoto')
        self.photo.setAlignment(Qt.AlignmentFlag.AlignCenter)
        row.addWidget(self.photo, 0, Qt.AlignmentFlag.AlignVCenter)
        text = QVBoxLayout()
        text.setContentsMargins(0, 0, 0, 0)
        text.setSpacing(6)
        text.addStretch(1)
        self.name = QLabel()
        self.name.setObjectName('personName')
        self.role = QLabel()
        self.role.setObjectName('personRole')
        for label in (self.name, self.role):
            label.setTextFormat(Qt.TextFormat.PlainText)
            text.addWidget(label)
        text.addStretch(1)
        row.addLayout(text)
        self.set_compact(compact)

    @property
    def full_name(self):
        return self.name.text()

    def set_compact(self, compact):
        self.photo_size = 72 if compact else 88
        self.photo.setFixedSize(self.photo_size, self.photo_size)
        for label in (self, self.name, self.role):
            label.setProperty('compact', bool(compact))
        self.repolish()
        self._shown = None
        self.set_photo(self._pixmap)

    def set_person(self, person, role=''):
        self.person = person
        photo = person.get('photo')
        self.photo_url = photo if isinstance(photo, str) else ''
        self.name.setText(str(person.get('name') or '')[:80])
        self.role.setText(str(role or '')[:80])
        self.role.setVisible(bool(role))
        self.setToolTip(' — '.join(x for x in (self.name.text(), self.role.text()) if x))
        self._shown = None
        self.set_photo(None)

    def set_photo(self, pixmap):
        self._pixmap = pixmap
        size = self.photo_size
        key = (pixmap.cacheKey() if pixmap is not None and not pixmap.isNull() else 0, size, self.full_name)
        if key == self._shown:
            return  # The same photo arrives again whenever another one finishes loading.
        self._shown = key
        if pixmap is not None and not pixmap.isNull():
            self.photo.setPixmap(rounded(pixmap, size, size, 18))
            self.photo.setText('')
            return
        self.photo.clear()
        parts = [p for p in str(self.person.get('name') or '').split() if p[:1].isalpha()]
        self.photo.setText(''.join(p[0] for p in parts[:2]).upper() or '?')

    def repolish(self):
        for widget in (self, self.name, self.role, self.photo):
            widget.style().unpolish(widget)
            widget.style().polish(widget)

    def set_hover(self, on):
        for widget in (self, self.name, self.role):
            widget.setProperty('hover', bool(on))
        self.repolish()

    def enterEvent(self, event):
        super().enterEvent(event)
        self.set_hover(True)

    def leaveEvent(self, event):
        super().leaveEvent(event)
        self.set_hover(False)


class PeopleStrip(QScrollArea):
    """Horizontal row of person cards: no scroll bar, the mouse wheel glides it sideways."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName('peopleStrip')
        self.setFrameShape(QFrame.Shape.NoFrame)
        self.setWidgetResizable(True)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        body = QWidget()
        body.setObjectName('peopleBody')
        self.row = QHBoxLayout(body)
        self.row.setContentsMargins(0, 0, 0, 0)
        self.row.setSpacing(20)
        self.row.addStretch(1)
        self.setWidget(body)
        self.cards = []
        self.scroller = smooth(self, horizontal=True)

    def set_cards(self, cards):
        for card in self.cards:
            self.row.removeWidget(card)
            card.hide()
            card.deleteLater()
        self.cards = list(cards)
        for index, card in enumerate(self.cards):
            self.row.insertWidget(index, card)
        self.fit()
        self.horizontalScrollBar().setValue(0)

    def fit(self):
        height = max([card.sizeHint().height() for card in self.cards] or [0])
        self.setFixedHeight(height)
