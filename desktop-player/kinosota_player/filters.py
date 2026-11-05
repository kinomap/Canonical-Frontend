"""«Фильтры» panel of «Главная»: genres (any of), rating, years, source and order."""
from datetime import date
from PySide6.QtCore import Qt, QPoint, QPointF, QRect, QSize, QTimer, Signal
from PySide6.QtGui import QColor, QIcon, QPainter, QPen
from PySide6.QtWidgets import (QComboBox, QFrame, QHBoxLayout, QLabel, QLayout, QMenu, QPushButton,
    QSizePolicy, QStyledItemDelegate, QVBoxLayout, QWidget)
from .browse import Genres
from .preferences import translate
from .theme import icon

RATINGS = (None, 5.0, 6.0, 7.0, 8.0)
SOURCE_TEXT = {'all': 'Все источники', 'site': 'KINOSOTA', 'tmdb': 'Торренты'}
SORT_TEXT = {'popularity': 'По популярности', 'rating': 'По рейтингу', 'newest': 'Новинки', 'title': 'По названию'}
FIRST_YEAR = 1920
MAX_CHIPS = 3


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

    def mouseReleaseEvent(self, event):
        action = self.activeAction()
        if action is not None and action.isEnabled() and action.isCheckable():
            action.trigger()
            return
        super().mouseReleaseEvent(event)


class FilterCombo(QComboBox):
    """Combo box with a drawn chevron: no platform arrow or icon font is needed."""

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
        outer = QHBoxLayout(self)
        outer.setContentsMargins(12, 7, 12, 7)
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
        self.from_combo, self.to_combo = _combo('filterCombo'), _combo('filterCombo')
        latest = date.today().year + 1
        for combo in (self.from_combo, self.to_combo):
            combo.addItem('', None)
            for year in range(latest, FIRST_YEAR - 1, -1):
                combo.addItem(str(year), year)
            combo.setMaxVisibleItems(14)
        self.from_combo.activated.connect(lambda _: self._years_picked('from'))
        self.to_combo.activated.connect(lambda _: self._years_picked('to'))
        dash = QLabel('–')
        dash.setObjectName('hint')
        self._group('years', 'Год выпуска', self.from_combo, dash, self.to_combo)
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
                'year_to': self.year_to, 'source': self.source if self.kind == 'movie' else 'tmdb', 'sort': self.sort}

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
        self.year_from, self.year_to = self.from_combo.currentData(), self.to_combo.currentData()
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
        for combo, value in ((self.rating_combo, self.rating), (self.from_combo, self.year_from),
                             (self.to_combo, self.year_to), (self.sort_combo, self.sort)):
            combo.setCurrentIndex(max(0, combo.findData(value)))
        tv = self.kind == 'tv'
        self.source_combo.setCurrentIndex(max(0, self.source_combo.findData('tmdb' if tv else self.source)))
        self.source_combo.setEnabled(not tv)
        self.source_combo.setToolTip(self.t('Сериалы доступны только из торрентов') if tv else '')
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
        parts.append(self.t(SOURCE_TEXT['tmdb' if self.kind == 'tv' else self.source]))
        parts.append(self.t(SORT_TEXT[self.sort]))
        return '  ·  '.join(parts)

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
        for combo, text in ((self.from_combo, 'С любого'), (self.to_combo, 'По любой')):
            combo.setItemText(0, self.t(text))
        for i, value in enumerate(SOURCE_TEXT):
            self.source_combo.setItemText(i, self.t(SOURCE_TEXT[value]))
        for i, value in enumerate(SORT_TEXT):
            self.sort_combo.setItemText(i, self.t(SORT_TEXT[value]))
        self.reset_button.setText(self.t('Сбросить'))
        self.set_collapsed(self.collapsed)
        self.sync()
