"""«Фильтры» panel of «Главная»: genres (any of), rating, years, source and order.

0.2.3: drop-down lists and the genre checklist open as rounded dark glass without the platform's
white window corners; the years are picked on a compact four-row drum (YearWheelPopup) instead of
a screen-high list; the source is a choice for series too (KINOSOTA Telegram series / torrents).
"""
from datetime import date
from PySide6.QtCore import QEasingCurve, Qt, QPoint, QPointF, QRect, QRectF, QSize, QTimer, QVariantAnimation, Signal
from PySide6.QtGui import QColor, QFont, QIcon, QPainter, QPainterPath, QPen
from PySide6.QtWidgets import (QComboBox, QFrame, QHBoxLayout, QLabel, QLayout, QMenu, QPushButton,
    QSizePolicy, QStyledItemDelegate, QVBoxLayout, QWidget)
from .browse import Genres
from .preferences import translate
from .theme import icon, paint_glass, shadow_pixmap

RATINGS = (None, 5.0, 6.0, 7.0, 8.0)
SOURCE_TEXT = {'all': 'Все источники', 'site': 'KINOSOTA', 'tmdb': 'Торренты'}
SORT_TEXT = {'popularity': 'По популярности', 'rating': 'По рейтингу', 'newest': 'Новинки', 'title': 'По названию'}
FIRST_YEAR = 1920
MAX_CHIPS = 3
# Year drum: exactly four rows of 34 px are visible.
DRUM_ROWS = 4
DRUM_ROW = 34
POPUP_GLASS = QColor('#11171d')
POPUP_LINE = QColor(255, 255, 255, 38)
GOLD = QColor('#ffd400')


def year_values(today=None):
    """[None («Любой»), next year, this year, …, FIRST_YEAR]: newest first, as the old list."""
    latest = (today or date.today()).year + 1
    return [None, *range(latest, FIRST_YEAR - 1, -1)]


def frameless_popup(window):
    """A top-level popup without the platform frame and with a transparent backing store: only the
    rounded glass painted by the style sheet (or paintEvent) is visible, never white square corners."""
    if window is None or window.property('kinosotaPopup'):
        return window
    visible = window.isVisible()
    window.setWindowFlags(window.windowFlags() | Qt.WindowType.FramelessWindowHint | Qt.WindowType.NoDropShadowWindowHint)
    window.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
    window.setAutoFillBackground(False)
    window.setProperty('kinosotaPopup', True)
    if visible:
        window.show()
    return window


class FlowLayout(QLayout):
    """Left-to-right rows that wrap on narrow windows; rows align on their bottom edge."""

    def __init__(self, parent=None, hspacing=14, vspacing=8):
        super().__init__(parent)
        self.entries, self.hspacing, self.vspacing = [], hspacing, vspacing

    def addItem(self, item):
        self.entries.append(item)

    def count(self):
        return len(self.entries)

    def itemAt(self, index):
        return self.entries[index] if 0 <= index < len(self.entries) else None

    def takeAt(self, index):
        return self.entries.pop(index) if 0 <= index < len(self.entries) else None

    def expandingDirections(self):
        return Qt.Orientation(0)

    def hasHeightForWidth(self):
        return True

    def heightForWidth(self, width):
        return self._arrange(QRect(0, 0, width, 0), False)

    def setGeometry(self, rect):
        super().setGeometry(rect)
        self._arrange(rect, True)

    def sizeHint(self):
        return self.minimumSize()

    def minimumSize(self):
        size = QSize()
        for item in self.entries:
            if not item.isEmpty():
                size = size.expandedTo(item.minimumSize())
        m = self.contentsMargins()
        return size + QSize(m.left() + m.right(), m.top() + m.bottom())

    def _arrange(self, rect, apply):
        m = self.contentsMargins()
        area = rect.adjusted(m.left(), m.top(), -m.right(), -m.bottom())
        rows, row, x, line = [], [], area.x(), 0
        for item in self.entries:
            if item.isEmpty():
                continue
            hint = item.sizeHint()
            if row and x + hint.width() > area.right() + 1:
                rows.append((row, line))
                row, x, line = [], area.x(), 0
            row.append((item, x, hint))
            x += hint.width() + self.hspacing
            line = max(line, hint.height())
        if row:
            rows.append((row, line))
        y = area.y()
        for row, line in rows:
            if apply:
                for item, left, hint in row:
                    item.setGeometry(QRect(QPoint(left, y + line - hint.height()), hint))
            y += line + self.vspacing
        used = (y - self.vspacing - area.y()) if rows else 0
        return used + m.top() + m.bottom()


class StickyMenu(QMenu):
    """Genre checklist that stays open while several genres are picked."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName('stickyMenu')
        frameless_popup(self)  # 0.2.3: rounded dark glass (theme QMenu), no white frame around it.

    def mouseReleaseEvent(self, event):
        action = self.activeAction()
        if action is not None and action.isEnabled() and action.isCheckable():
            action.trigger()
            return
        super().mouseReleaseEvent(event)


class FilterCombo(QComboBox):
    """Combo box with a drawn chevron: no platform arrow or icon font is needed.

    0.2.3: the list opens in a frameless, translucent container, so the theme's 10 px rounded list
    (QComboBox QAbstractItemView) is all that shows, without the white rectangle behind it."""

    def popup_window(self):
        view = self.view()
        window = view.window() if view is not None else None
        if window is None or window is self.window():
            return None
        if not window.property('kinosotaPopup'):
            window.setObjectName('comboPopup')
            frameless_popup(window)
            view.setFrameShape(QFrame.Shape.NoFrame)
            view.viewport().setAutoFillBackground(False)
        return window

    def showPopup(self):
        self.popup_window()
        super().showPopup()

    def paintEvent(self, event):
        super().paintEvent(event)
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        pen = QPen(QColor('#c9d1d9' if self.isEnabled() else '#5f6870'), 1.6)
        pen.setCapStyle(Qt.PenCapStyle.RoundCap)
        pen.setJoinStyle(Qt.PenJoinStyle.RoundJoin)
        p.setPen(pen)
        x, y = self.width() - 15.5, self.height() / 2
        p.drawPolyline([QPointF(x - 4, y - 2), QPointF(x, y + 2), QPointF(x + 4, y - 2)])
        p.end()


class YearDrumWidget(QWidget):
    """Four visible rows of years; the wheel and the ▲ / ▼ arrows turn it one row at a time (snapped),
    a click picks the year under the pointer. The chosen year sits on a soft golden plate."""
    yearSelected = Signal(object)

    def __init__(self, values=None, parent=None):
        super().__init__(parent)
        self.setObjectName('yearDrum')
        self.values = list(values) if values is not None else year_values()
        self.index, self.top, self.shown, self.hover = 0, 0, 0.0, -1
        self.placeholder = 'Любой'
        self.wheel_rest = 0
        self.setMouseTracking(True)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.setFixedHeight(DRUM_ROWS * DRUM_ROW)
        self.setMinimumWidth(116)
        self.motion = QVariantAnimation(self)
        self.motion.setDuration(160)
        self.motion.setEasingCurve(QEasingCurve.Type.OutCubic)
        self.motion.valueChanged.connect(self._moved)

    def max_top(self):
        return max(0, len(self.values) - DRUM_ROWS)

    def set_year(self, year):
        """Select ``year`` (None = «Любой») and bring it into view: one row above it when possible."""
        self.index = self.values.index(year) if year in self.values else 0
        self.scroll_to(self.index - 1, animate=False)
        self.update()

    def year(self):
        return self.values[self.index] if self.values else None

    def scroll_to(self, top, animate=True):
        top = max(0, min(self.max_top(), int(top)))
        self.top = top
        self.motion.stop()
        if animate and self.isVisible() and abs(self.shown - top) < 12:
            self.motion.setStartValue(float(self.shown))
            self.motion.setEndValue(float(top))
            self.motion.start()
        else:
            self.shown = float(top)
            self.update()

    def step(self, rows):
        self.scroll_to(self.top + rows)

    def visible_years(self):
        return self.values[self.top:self.top + DRUM_ROWS]

    def row_at(self, y):
        row = int(y // DRUM_ROW)
        index = self.top + row
        return index if 0 <= row < DRUM_ROWS and index < len(self.values) else -1

    def pick(self, index):
        if 0 <= index < len(self.values):
            self.index = index
            self.update()
            self.yearSelected.emit(self.values[index])

    def text(self, value):
        return self.placeholder if value is None else str(value)

    def _moved(self, value):
        self.shown = float(value)
        self.update()

    def wheelEvent(self, event):
        angle, pixels = event.angleDelta().y(), event.pixelDelta().y()
        if angle:
            self.wheel_rest += angle
        elif pixels:  # Touchpads report pixels: one row per row height.
            self.wheel_rest += pixels * 120 / DRUM_ROW
        else:
            event.ignore()
            return
        rows = int(self.wheel_rest / 120)
        self.wheel_rest -= rows * 120
        if rows:
            self.step(-rows)  # Wheel up shows the newer years above.
        event.accept()

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.pick(self.row_at(event.position().y()))
            event.accept()
            return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        hover = self.row_at(event.position().y())
        if hover != self.hover:
            self.hover = hover
            self.update()
        super().mouseMoveEvent(event)

    def leaveEvent(self, event):
        self.hover = -1
        self.update()
        super().leaveEvent(event)

    def keyPressEvent(self, event):
        key = event.key()
        moves = {Qt.Key.Key_Up: -1, Qt.Key.Key_Down: 1, Qt.Key.Key_PageUp: -DRUM_ROWS, Qt.Key.Key_PageDown: DRUM_ROWS}
        if key in moves or key in (Qt.Key.Key_Home, Qt.Key.Key_End):
            if key == Qt.Key.Key_Home:
                self.index = 0
            elif key == Qt.Key.Key_End:
                self.index = len(self.values) - 1
            else:
                self.index = max(0, min(len(self.values) - 1, self.index + moves[key]))
            if not self.top <= self.index < self.top + DRUM_ROWS:
                self.scroll_to(self.index if self.index < self.top else self.index - DRUM_ROWS + 1)
            self.update()
            event.accept()
            return
        if key in (Qt.Key.Key_Return, Qt.Key.Key_Enter, Qt.Key.Key_Space):
            self.pick(self.index)
            event.accept()
            return
        super().keyPressEvent(event)

    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        p.setRenderHint(QPainter.RenderHint.TextAntialiasing, True)
        clip = QPainterPath()
        clip.addRoundedRect(QRectF(self.rect()), 8, 8)
        p.setClipPath(clip)
        first = int(self.shown)
        offset = (self.shown - first) * DRUM_ROW
        font = QFont(self.font())
        for row in range(DRUM_ROWS + 1):
            index = first + row
            if index >= len(self.values):
                break
            rect = QRectF(0, row * DRUM_ROW - offset, self.width(), DRUM_ROW)
            plate = rect.adjusted(2.5, 2.5, -2.5, -2.5)  # Half-pixel inset: the 1 px line sits on the grid.
            chosen = index == self.index
            if chosen:
                p.setPen(QPen(QColor(255, 212, 0, 120), 1))
                p.setBrush(QColor(255, 212, 0, 51))
                p.drawRoundedRect(plate, 7, 7)
            elif index == self.top + self.hover and abs(self.shown - self.top) < .01:
                p.setPen(Qt.PenStyle.NoPen)
                p.setBrush(QColor(255, 255, 255, 20))
                p.drawRoundedRect(plate, 7, 7)
            font.setWeight(QFont.Weight.Bold if chosen else QFont.Weight.Medium)
            font.setPixelSize(15 if chosen else 14)
            p.setFont(font)
            p.setPen(GOLD if chosen else QColor('#e6ebf0') if self.values[index] is not None else QColor('#aab5bf'))
            p.drawText(rect, Qt.AlignmentFlag.AlignCenter, self.text(self.values[index]))
        p.end()


class YearWheelPopup(QFrame):
    """Floating glass card under a year button: ▲, the four-row drum, ▼. Escape or a click outside
    closes it; a picked year is emitted as ``yearSelected`` and closes it as well."""
    yearSelected = Signal(object)
    SHADOW = 14

    def __init__(self, parent=None, values=None):
        super().__init__(parent, Qt.WindowType.Popup | Qt.WindowType.FramelessWindowHint | Qt.WindowType.NoDropShadowWindowHint)
        self.setObjectName('yearPopup')
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.radius = 14
        column = QVBoxLayout(self)
        m = self.SHADOW
        column.setContentsMargins(m + 8, m + 6, m + 8, m + 6)
        column.setSpacing(2)
        self.up = self._arrow('up')
        self.drum = YearDrumWidget(values, self)
        self.down = self._arrow('down')
        self.up.clicked.connect(lambda: self.drum.step(-1))
        self.down.clicked.connect(lambda: self.drum.step(1))
        self.up.clicked.connect(self.sync_arrows)
        self.down.clicked.connect(self.sync_arrows)
        self.drum.yearSelected.connect(self._picked)
        column.addWidget(self.up)
        column.addWidget(self.drum)
        column.addWidget(self.down)

    def _arrow(self, direction):
        button = QPushButton('▲' if direction == 'up' else '▼')
        button.setObjectName('yearArrow')
        button.setCursor(Qt.CursorShape.PointingHandCursor)
        button.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        button.setAutoRepeat(True)
        button.setAutoRepeatDelay(320)
        button.setAutoRepeatInterval(70)
        button.setFixedHeight(22)
        button.setAccessibleName('Новее' if direction == 'up' else 'Старше')
        return button

    def sync_arrows(self):
        self.up.setEnabled(self.drum.top > 0)
        self.down.setEnabled(self.drum.top < self.drum.max_top())

    def open(self, anchor, year, placeholder):
        """Show under ``anchor`` (kept on its screen) with ``year`` selected."""
        self.drum.placeholder = placeholder
        self.drum.set_year(year)
        self.sync_arrows()
        width = max(anchor.width(), 150) + 2 * self.SHADOW
        self.resize(width, self.sizeHint().height())
        spot = anchor.mapToGlobal(QPoint((anchor.width() - width) // 2, anchor.height() - self.SHADOW + 4))
        screen = anchor.screen().availableGeometry() if anchor.screen() is not None else None
        if screen is not None:
            x = max(screen.left(), min(spot.x(), screen.right() - width + 1))
            y = spot.y()
            if y + self.height() > screen.bottom():  # No room below: open above the button.
                y = anchor.mapToGlobal(QPoint(0, 0)).y() - self.height() + self.SHADOW - 4
            spot = QPoint(x, max(screen.top(), y))
        self.move(spot)
        self.show()
        self.drum.setFocus(Qt.FocusReason.PopupFocusReason)

    def _picked(self, year):
        self.yearSelected.emit(year)
        self.close()

    def keyPressEvent(self, event):
        if event.key() == Qt.Key.Key_Escape:
            self.close()
            event.accept()
            return
        super().keyPressEvent(event)

    def wheelEvent(self, event):
        self.drum.wheelEvent(event)  # The wheel turns the drum anywhere over the card, also over ▲ / ▼.
        self.sync_arrows()

    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        m = self.SHADOW
        card = QRectF(self.rect()).adjusted(m, m, -m, -m)
        shadow, pad = shadow_pixmap(int(card.width()), int(card.height()), self.radius, .55, m)
        p.drawPixmap(int(card.left()) - pad, int(card.top()) - pad + 6, shadow)
        p.setPen(QPen(POPUP_LINE, 1))
        p.setBrush(POPUP_GLASS)
        p.drawRoundedRect(card.adjusted(.5, .5, -.5, -.5), self.radius, self.radius)
        p.end()


class FilterYearButton(QPushButton):
    """«С любого» / «По любой»: looks like the other filter combos; a click opens YearWheelPopup."""
    yearPicked = Signal(object)

    def __init__(self, placeholder, parent=None):
        super().__init__(parent)
        self.setObjectName('filterYear')
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.year, self.placeholder, self.popup = None, placeholder, None
        self.clicked.connect(self.open_popup)
        self.refresh()

    def set_year(self, year):
        self.year = year if type(year) is int else None
        self.refresh()

    def set_placeholder(self, text):
        self.placeholder = text
        self.refresh()

    def refresh(self):
        self.setText(self.placeholder if self.year is None else str(self.year))
        self.updateGeometry()

    def open_popup(self):
        if self.popup is None:
            self.popup = YearWheelPopup(self)
            self.popup.yearSelected.connect(self._picked)
        self.popup.open(self, self.year, self.placeholder)
        return self.popup

    def _picked(self, year):
        self.set_year(year)
        self.yearPicked.emit(self.year)

    def sizeHint(self):
        hint = super().sizeHint()
        width = max(self.fontMetrics().horizontalAdvance(t) for t in (self.placeholder, '2026')) + 40
        return QSize(max(hint.width(), width), hint.height())

    def paintEvent(self, event):
        super().paintEvent(event)
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        pen = QPen(QColor('#c9d1d9' if self.isEnabled() else '#5f6870'), 1.6)
        pen.setCapStyle(Qt.PenCapStyle.RoundCap)
        pen.setJoinStyle(Qt.PenJoinStyle.RoundJoin)
        p.setPen(pen)
        x, y = self.width() - 15.5, self.height() / 2
        p.drawPolyline([QPointF(x - 4, y - 2), QPointF(x, y + 2), QPointF(x + 4, y - 2)])
        p.end()


def _combo(name):
    combo = FilterCombo()
    combo.setObjectName(name)
    combo.setSizeAdjustPolicy(QComboBox.SizeAdjustPolicy.AdjustToContents)
    combo.setCursor(Qt.CursorShape.PointingHandCursor)
    combo.setItemDelegate(QStyledItemDelegate(combo))  # 0.1.8: the styled 30 px rows of the list.
    return combo


class FilterBar(QFrame):
    changed = Signal()
    genresWanted = Signal()

    def __init__(self, language='ru', parent=None):
        super().__init__(parent)
        self.setObjectName('filters')
        self.language = language
        self.kind, self.source, self.sort = 'movie', 'all', 'popularity'
        self.genres, self.rating, self.year_from, self.year_to = [], None, None, None
        self.catalog, self.genres_state = Genres(), 'idle'
        self.collapsed, self.user_toggled, self.compact = False, False, False
        self.genre_timer = QTimer(self)
        self.genre_timer.setSingleShot(True)
        self.genre_timer.setInterval(450)
        self.genre_timer.timeout.connect(self.changed.emit)
        self.radius = 14  # Glass panel (0.1.9): painted in paintEvent, its shadow by the window scene.
        outer = QHBoxLayout(self)
        outer.setContentsMargins(12, 8, 12, 8)
        outer.setSpacing(14)
        self.toggle = QPushButton()
        self.toggle.setObjectName('filterToggle')
        self.toggle.setCursor(Qt.CursorShape.PointingHandCursor)
        self.toggle.setLayoutDirection(Qt.LayoutDirection.RightToLeft)  # Chevron after the word.
        self.toggle.setIconSize(QSize(14, 14))
        self.toggle.clicked.connect(lambda: self.set_collapsed(not self.collapsed, user=True))
        outer.addWidget(self.toggle, 0, Qt.AlignmentFlag.AlignBottom)
        self.body = QWidget()
        self.body.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        self.flow = FlowLayout(self.body)
        self.flow.setContentsMargins(0, 0, 0, 0)
        self.captions = {}
        # Genres: chips with ×, «+» opens the checklist.
        self.chip_box = QWidget()
        self.chip_row = QHBoxLayout(self.chip_box)
        self.chip_row.setContentsMargins(0, 0, 0, 0)
        self.chip_row.setSpacing(6)
        self.genre_menu = StickyMenu(self)
        self.genre_menu.aboutToShow.connect(self.fill_genre_menu)
        self.genre_button = QPushButton()
        self.genre_button.setObjectName('chipAdd')
        self.genre_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self.genre_button.setLayoutDirection(Qt.LayoutDirection.RightToLeft)
        self.genre_button.setIconSize(QSize(14, 14))
        self.genre_button.clicked.connect(self.open_genre_menu)
        self._group('genres', 'Жанры', self.chip_box, self.genre_button)
        self.rating_combo = _combo('filterCombo')
        for value in RATINGS:
            self.rating_combo.addItem('', value)
        self.rating_combo.activated.connect(self._rating_picked)
        self._group('rating', 'Рейтинг', self.rating_combo)
        # 0.2.3: a four-row drum in a floating card instead of a screen-high list of 100 years.
        self.from_year, self.to_year = FilterYearButton('С любого'), FilterYearButton('По любой')
        self.from_year.yearPicked.connect(lambda _: self._years_picked('from'))
        self.to_year.yearPicked.connect(lambda _: self._years_picked('to'))
        dash = QLabel('–')
        dash.setObjectName('hint')
        self._group('years', 'Год выпуска', self.from_year, dash, self.to_year)
        self.source_combo = _combo('filterCombo')
        for value in SOURCE_TEXT:
            self.source_combo.addItem('', value)
        self.source_combo.activated.connect(self._source_picked)
        self._group('source', 'Источник', self.source_combo)
        self.sort_combo = _combo('filterCombo')
        for value in SORT_TEXT:
            self.sort_combo.addItem('', value)
        self.sort_combo.activated.connect(self._sort_picked)
        self._group('sort', 'Сортировка', self.sort_combo)
        outer.addWidget(self.body, 1)
        self.summary = QLabel()
        self.summary.setObjectName('filterSummary')
        self.summary.setTextFormat(Qt.TextFormat.PlainText)
        self.summary.setSizePolicy(QSizePolicy.Policy.Ignored, QSizePolicy.Policy.Preferred)
        self.summary.hide()
        outer.addWidget(self.summary, 1, Qt.AlignmentFlag.AlignVCenter)
        self.reset_button = QPushButton()
        self.reset_button.setObjectName('filterReset')
        self.reset_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self.reset_button.setIcon(icon('reset', '#d5dbe0', 16))
        self.reset_button.setIconSize(QSize(15, 15))
        self.reset_button.clicked.connect(self.reset)
        outer.addWidget(self.reset_button, 0, Qt.AlignmentFlag.AlignBottom)
        self.retranslate(language)

    def _group(self, key, caption, *controls):
        box = QWidget()
        column = QVBoxLayout(box)
        column.setContentsMargins(0, 0, 0, 0)
        column.setSpacing(3)
        label = QLabel()
        label.setObjectName('filterCaption')
        self.captions[key] = (label, caption)
        column.addWidget(label)
        row = QHBoxLayout()
        row.setSpacing(6)
        for control in controls:
            row.addWidget(control)
        column.addLayout(row)
        self.flow.addWidget(box)
        if controls:
            label.setBuddy(controls[-1])
        return box

    def t(self, text):
        return translate(text, self.language)

    # ---------- state ----------
    def state(self):
        return {'genres': list(self.genres), 'rating': self.rating, 'year_from': self.year_from,
                'year_to': self.year_to, 'source': self.source, 'sort': self.sort}  # 0.2.3: series pick a source too.

    def active(self):
        return bool(self.genres or self.rating is not None or self.year_from is not None
                    or self.year_to is not None or self.sort != 'popularity')

    def set_kind(self, kind):
        if kind == self.kind:
            return
        self.kind = kind
        self.genres = []  # Series and films have different genre lists.
        self.sync()

    def set_source(self, source):
        self.source = source if source in SOURCE_TEXT else 'all'
        self.sync()

    def set_catalog(self, catalog, state='ready'):
        self.catalog, self.genres_state = catalog, state
        self.sync()

    def reset(self):
        self.genre_timer.stop()
        self.genres, self.rating, self.year_from, self.year_to, self.sort = [], None, None, None, 'popularity'
        self.sync()
        self.changed.emit()

    def _rating_picked(self, index):
        self.rating = self.rating_combo.itemData(index)
        self.sync()
        self.changed.emit()

    def _years_picked(self, which):
        self.year_from, self.year_to = self.from_year.year, self.to_year.year
        if self.year_from is not None and self.year_to is not None and self.year_from > self.year_to:
            if which == 'from':
                self.year_to = self.year_from
            else:
                self.year_from = self.year_to
        self.sync()
        self.changed.emit()

    def _source_picked(self, index):
        self.source = self.source_combo.itemData(index)
        self.sync()
        self.changed.emit()

    def _sort_picked(self, index):
        self.sort = self.sort_combo.itemData(index)
        self.sync()
        self.changed.emit()

    def toggle_genre(self, key, on=None):
        on = (key not in self.genres) if on is None else on
        if on and key not in self.genres and len(self.genres) < 10:
            self.genres.append(key)
        elif not on and key in self.genres:
            self.genres.remove(key)
        self.sync()
        self.genre_timer.start()

    def clear_genres(self):
        self.genres = []
        self.sync()
        self.genre_timer.start()

    # ---------- genre menu ----------
    def open_genre_menu(self):
        self.genre_menu.popup(self.genre_button.mapToGlobal(QPoint(0, self.genre_button.height() + 2)))

    def fill_genre_menu(self):
        menu = self.genre_menu
        menu.clear()
        if not self.catalog:
            action = menu.addAction(self.t('Не удалось загрузить жанры. Откройте список ещё раз.' if self.genres_state == 'failed' else 'Загружаем жанры…'))
            action.setEnabled(False)
            if self.genres_state != 'loading':
                self.genresWanted.emit()
            return
        if self.genres:
            menu.addAction(self.t('Сбросить жанры'), self.clear_genres)
            menu.addSeparator()
        for key, label in self.catalog.options(self.kind, self.state()['source'], self.language):
            action = menu.addAction(label)
            action.setCheckable(True)
            action.setChecked(key in self.genres)
            action.toggled.connect(lambda on, k=key: self.toggle_genre(k, on))

    # ---------- presentation ----------
    def sync(self):
        for combo, value in ((self.rating_combo, self.rating), (self.sort_combo, self.sort),
                             (self.source_combo, self.source)):
            combo.setCurrentIndex(max(0, combo.findData(value)))
        self.from_year.set_year(self.year_from)
        self.to_year.set_year(self.year_to)
        self.source_combo.setEnabled(True)
        self.source_combo.setToolTip(self.t('KINOSOTA — сериалы из Telegram, Торренты — из раздач') if self.kind == 'tv' else '')
        while self.chip_row.count():
            widget = self.chip_row.takeAt(0).widget()
            if widget is not None:
                widget.deleteLater()
        shown = self.genres if len(self.genres) <= MAX_CHIPS else self.genres[:MAX_CHIPS - 1]
        for key in shown:
            chip = QPushButton(f'{self.catalog.label(key, self.language)}  ×')
            chip.setObjectName('chip')
            chip.setCursor(Qt.CursorShape.PointingHandCursor)
            chip.setToolTip(self.t('Убрать жанр'))
            chip.clicked.connect(lambda _=False, k=key: self.toggle_genre(k, False))
            self.chip_row.addWidget(chip)
        if len(shown) < len(self.genres):
            more = QPushButton(f'+{len(self.genres) - len(shown)}')
            more.setObjectName('chip')
            more.setToolTip(', '.join(self.catalog.label(k, self.language) for k in self.genres[len(shown):]))
            more.clicked.connect(self.open_genre_menu)
            self.chip_row.addWidget(more)
        self.chip_box.setVisible(bool(self.genres))
        height = self.rating_combo.sizeHint().height()  # Captions line up across the groups.
        self.genre_button.setFixedHeight(height)
        self.from_year.setFixedHeight(height)
        self.to_year.setFixedHeight(height)
        for i in range(self.chip_row.count()):
            self.chip_row.itemAt(i).widget().setFixedHeight(height)
        self.genre_button.setText('+' if self.genres else self.t('Все жанры'))
        self.genre_button.setIcon(QIcon() if self.genres else icon('chevron-down', '#c9d1d9', 14))
        self.genre_button.setToolTip(self.t('Выбрать жанры'))
        self.reset_button.setEnabled(self.active())
        self.summary.setText(self.summary_text())
        self.updateGeometry()

    def summary_text(self):
        parts = []
        if self.genres:
            parts.append(', '.join(self.catalog.label(k, self.language) for k in self.genres))
        if self.rating is not None:
            parts.append(f'★ {self.t("от")} {self.rating:.1f}')
        if self.year_from is not None or self.year_to is not None:
            parts.append(f'{self.year_from or "…"} – {self.year_to or "…"}')
        parts.append(self.t(SOURCE_TEXT[self.source]))
        parts.append(self.t(SORT_TEXT[self.sort]))
        return '  ·  '.join(parts)

    def paintEvent(self, event):
        painter = QPainter(self)
        paint_glass(self, painter, self.radius)
        painter.end()

    def set_collapsed(self, collapsed, user=False):
        if user:
            self.user_toggled = True
        self.collapsed = bool(collapsed)
        self.body.setVisible(not self.collapsed)
        self.summary.setVisible(self.collapsed)
        self.toggle.setText(self.t('Фильтры'))
        self.toggle.setIcon(icon('chevron-down' if self.collapsed else 'chevron-up', '#f5f6f7', 14))
        self.toggle.setAccessibleName(self.t('Показать фильтры') if self.collapsed else self.t('Скрыть фильтры'))
        self.updateGeometry()

    def set_compact(self, compact):
        """Short windows: one line of controls without captions."""
        self.compact = bool(compact)
        for label, _ in self.captions.values():
            label.setVisible(not self.compact)
        self.updateGeometry()

    def retranslate(self, language):
        self.language = language
        for label, caption in self.captions.values():
            label.setText(self.t(caption))
        self.rating_combo.setItemText(0, '★ ' + self.t('Любой'))
        for i, value in enumerate(RATINGS[1:], 1):
            self.rating_combo.setItemText(i, f'★ {self.t("от")} {value:.1f}')
        self.from_year.set_placeholder(self.t('С любого'))
        self.to_year.set_placeholder(self.t('По любой'))
        for i, value in enumerate(SOURCE_TEXT):
            self.source_combo.setItemText(i, self.t(SOURCE_TEXT[value]))
        for i, value in enumerate(SORT_TEXT):
            self.sort_combo.setItemText(i, self.t(SORT_TEXT[value]))
        self.reset_button.setText(self.t('Сбросить'))
        self.set_collapsed(self.collapsed)
        self.sync()
