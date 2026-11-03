"""«Торренты»: the KINOSOTA torrent catalogue inside the desktop app.

Same server contract as the website detail page: Kinoteka / search, quality /
voice / episode choice, live preparation progress and a short-lived playback
ticket. The app never sees an infohash, magnet or tracker URL; the stream URL
goes to mpv over private IPC and the chosen voice becomes mpv ``--alang``.
"""
from PySide6.QtCore import Qt, QRectF, QTimer, Signal
from PySide6.QtGui import QColor, QIcon, QPainter, QPixmap
from PySide6.QtWidgets import (QButtonGroup, QComboBox, QHBoxLayout, QLabel, QLineEdit, QListWidgetItem,
    QProgressBar, QPushButton, QStackedWidget, QVBoxLayout, QWidget)
from .api import ApiError
from .catalog import PosterGrid
from .preferences import movie_title, translate

QUALITIES = ('2160p', '1080p', '720p', '480p')
LANGUAGES = ('ru', 'uk', 'en')
LANGUAGE_LABELS = {'ru': 'RU', 'uk': 'UA', 'en': 'EN'}
LANGUAGE_NAMES = {'ru': 'Русская озвучка', 'uk': 'Украинская озвучка', 'en': 'Английская дорожка'}
# mpv picks the first audio track whose language tag matches, in this order.
MPV_ALANG = {'ru': 'rus,ru', 'uk': 'ukr,uk', 'en': 'eng,en'}
PREP_LABELS = {'queued': 'В очереди', 'retrying': 'В очереди', 'searching': 'Поиск раздач',
               'loading': 'Проверка и буферизация', 'partial': 'Готово', 'playable': 'Готово',
               'unavailable': 'Раздачи не найдены'}
PREP_PROGRESS = {'not_queued': 0, 'unavailable': 0, 'queued': 10, 'retrying': 10, 'searching': 35,
                 'loading': 75, 'partial': 100, 'playable': 100}
IN_PROGRESS = ('queued', 'searching', 'loading', 'retrying')
POLL_MS = 4000
ACTION_TEXT = {'loading': 'Загружаем…', 'retry': 'Повторить', 'subscribe': 'Нужна подписка PRO',
               'launch': '▶  Смотреть', 'missing': 'Серия не найдена', 'prepare': 'Подготовить раздачу',
               'wait': 'Готовим раздачу…', 'discover': 'Найти раздачи', 'library': 'Добавить в кинотеку'}
ACTIONABLE = ('retry', 'launch', 'prepare', 'discover', 'library')
EN = {
    'В очереди': 'Queued', 'Поиск раздач': 'Searching releases', 'Проверка и буферизация': 'Checking and buffering',
    'Готово': 'Ready', 'Раздачи не найдены': 'No releases found', 'Раздача не отвечает': 'Release is not responding',
    'Раздача не подготовлена': 'Release is not prepared yet',
}
_READY_BAR = 'QProgressBar{background:#10181d;border:1px solid #24563a;border-radius:5px;} QProgressBar::chunk{background:#35c46a;border-radius:4px;}'
_ACTIVE_BAR = 'QProgressBar{background:#10181d;border:1px solid #2d3a44;border-radius:5px;} QProgressBar::chunk{background:#9ce8d7;border-radius:4px;}'


def audio_args(language):
    value = MPV_ALANG.get(language)
    return ['--alang=' + value] if value else []


def media_title_args(title):
    clean = ''.join(ch for ch in str(title or '') if ch.isprintable() and ch not in '$\\')[:160].strip()
    return ['--force-media-title=' + clean] if clean else []


def _episodes(source):
    return [(e['season'], e['episode']) for e in (source or {}).get('episodes') or []
            if isinstance(e, dict) and type(e.get('season')) is int and type(e.get('episode')) is int]


def has_episode(source, episode):
    return episode in _episodes(source)


def best_source(sources, quality=None, language=None, episode=None):
    """Prefer working, matching, already prepared, then best-seeded sources (as the site)."""
    def rank(s):
        return (s.get('state') == 'failed', bool(quality) and s.get('quality') != quality,
                bool(language) and language not in (s.get('languages') or []),
                bool(episode) and not has_episode(s, episode), s.get('state') != 'ready',
                -int(s.get('seeders') or 0), -int(s.get('size_bytes') or 0))
    return min(sources, key=rank) if sources else None


def in_flight(view):
    status = ((view or {}).get('status') or {}).get('status')
    return bool((view or {}).get('discovering')) or status in IN_PROGRESS or any(
        isinstance(s, dict) and s.get('state') in ('queued', 'loading') for s in (view or {}).get('sources') or [])


def progress_state(view, selected):
    """(status, percent, start_ms, label) exactly like the website progress bar, or None."""
    if not view or not view.get('allowed'):
        return None
    if selected and not selected.get('default'):
        state = selected.get('state')
        if state == 'failed':
            return ('unavailable', 0, None, 'Раздача не отвечает')
        if state == 'candidate':
            return ('queued', 0, None, 'Раздача не подготовлена')
        status = 'playable' if state == 'ready' else 'loading' if state == 'loading' else 'queued'
        return (status, int(selected.get('progress') or 0), selected.get('start_ms'), None)
    payload = view.get('status') or {}
    status = payload.get('status') or 'not_queued'
    if status == 'not_queued':
        return None
    progress = payload.get('progress')
    start = payload.get('start_ms') or (selected or {}).get('start_ms')
    return (status, int(progress) if type(progress) is int else PREP_PROGRESS.get(status, 0), start, None)


def progress_text(state, language='ru'):
    """«В очереди 10%» → «Поиск раздач 35%» → «Проверка и буферизация 75%» → «Готово · старт N мс»."""
    if not state:
        return ''
    status, percent, start, label = state
    t = (lambda s: EN.get(s, s)) if language == 'en' else (lambda s: s)
    if status in ('playable', 'partial'):
        if type(start) is int and start > 0:
            amount = f'{start:,}'.replace(',', '\u00a0')
            return f'Ready · start {amount} ms' if language == 'en' else f'Готово · старт {amount} мс'
        return t('Готово')
    if label:
        return t(label)
    name = t(PREP_LABELS.get(status, ''))
    return f'{name} {percent}%' if status in IN_PROGRESS else name


def size_text(size):
    if type(size) is not int or size <= 0:
        return ''
    gb = size / 1024 ** 3
    return (f'{gb:.1f}'.replace('.', ',') + ' ГБ') if gb >= 1 else f'{max(1, round(size / 1024 ** 2))} МБ'


def source_name(source):
    parts = [x for x in ((source or {}).get('quality'), (source or {}).get('source_type')) if isinstance(x, str) and x]
    return ' '.join(parts) or str((source or {}).get('title') or 'Раздача')[:80]


def flag_icon(language):
    """Drawn flags: emoji flags are not rendered by Windows fonts."""
    stripes = {'ru': ('#ffffff', '#1c57a5', '#d52b1e'), 'uk': ('#0057b7', '#ffd700')}.get(language)
    if not stripes:
        return QIcon()
    pixmap = QPixmap(24, 16)
    pixmap.fill(Qt.GlobalColor.transparent)
    painter = QPainter(pixmap)
    height = 16 / len(stripes)
    for index, color in enumerate(stripes):
        painter.fillRect(QRectF(0, index * height, 24, height + 0.5), QColor(color))
    painter.setPen(QColor(0, 0, 0, 110))
    painter.drawRect(0, 0, 23, 15)
    painter.end()
    return QIcon(pixmap)


def _pill(text, handler):
    button = QPushButton(text)
    button.setObjectName('pill')
    button.setCheckable(True)
    button.setCursor(Qt.CursorShape.PointingHandCursor)
    button.clicked.connect(handler)
    return button


class TorrentPage(QWidget):
    """Кинотека / Фильмы / Сериалы → title → quality, voice, episode → mpv."""
    playRequested = Signal(dict)

    def __init__(self, api, work, show_error, notify, language='ru', title_language='ru', parent=None):
        super().__init__(parent)
        self.api, self.work, self.show_error, self.notify = api, work, show_error, notify
        self.language, self.title_language = language, title_language
        self.mode, self.query, self.page, self.total_pages = 'library', '', 1, 1
        self.list_generation = self.detail_generation = 0
        self.loaded = False
        self.item = self.view = None
        self.selected_id = self.lang = self.season = self.episode = None
        self.busy, self.hint, self.load_failed = '', '', False
        self.poll = QTimer(self)
        self.poll.setSingleShot(True)
        self.poll.timeout.connect(self.refresh)
        self.search_timer = QTimer(self)
        self.search_timer.setSingleShot(True)
        self.search_timer.setInterval(300)
        self.search_timer.timeout.connect(self.new_search)
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        self.stack = QStackedWidget()
        outer.addWidget(self.stack, 1)
        self._build_list()
        self._build_detail()
        self.retranslate(language)

    # ---------- layout ----------
    def _build_list(self):
        page = QWidget()
        v = QVBoxLayout(page)
        v.setContentsMargins(0, 0, 0, 0)
        v.setSpacing(8)
        row = QHBoxLayout()
        row.setSpacing(6)
        self.mode_group = QButtonGroup(self)
        self.mode_buttons = {}
        for mode in ('library', 'movie', 'tv'):
            button = _pill('', lambda _=False, m=mode: self.set_mode(m))
            self.mode_group.addButton(button)
            self.mode_buttons[mode] = button
            row.addWidget(button)
        self.mode_buttons['library'].setChecked(True)
        self.search = QLineEdit()
        self.search.setMaxLength(100)
        self.search.setMaximumWidth(440)
        self.search.setClearButtonEnabled(True)
        self.search.textEdited.connect(lambda _: self.search_timer.start())
        self.search.returnPressed.connect(self.new_search)
        row.addSpacing(10)
        row.addWidget(self.search, 1)
        row.addStretch(0)
        v.addLayout(row)
        self.grid = PosterGrid(self.api.origin)
        self.grid.title_language = self.title_language
        self.grid.itemClicked.connect(self.open_item)
        self.grid.itemActivated.connect(self.open_item)
        v.addWidget(self.grid, 1)
        pages = QHBoxLayout()
        self.prev = QPushButton()
        self.prev.clicked.connect(lambda: self.change_page(-1))
        self.next = QPushButton()
        self.next.clicked.connect(lambda: self.change_page(1))
        self.page_label = QLabel()
        self.page_label.setObjectName('hint')
        pages.addWidget(self.prev)
        pages.addStretch()
        pages.addWidget(self.page_label)
        pages.addStretch()
        pages.addWidget(self.next)
        v.addLayout(pages)
        self.stack.addWidget(page)

    def _build_detail(self):
        page = QWidget()
        v = QVBoxLayout(page)
        v.setContentsMargins(4, 0, 4, 0)
        v.setSpacing(9)
        top = QHBoxLayout()
        self.back = QPushButton()
        self.back.clicked.connect(self.show_list)
        top.addWidget(self.back)
        top.addStretch()
        v.addLayout(top)
        self.title_label = self._label('torrentTitle', wrap=True)
        self.meta_label = self._label('hint')
        v.addWidget(self.title_label)
        v.addWidget(self.meta_label)
        self.progress = QProgressBar()
        self.progress.setRange(0, 100)
        self.progress.setTextVisible(False)
        self.progress.setFixedHeight(10)
        self.progress.setMaximumWidth(520)
        self.progress_label = self._label('progress')
        v.addWidget(self.progress_label)
        v.addWidget(self.progress)
        self.selected_label = self._label('selected', wrap=True)
        v.addWidget(self.selected_label)
        self.quality_caption = self._label('caption')
        v.addWidget(self.quality_caption)
        row = QHBoxLayout()
        row.setSpacing(6)
        self.quality_buttons = {}
        for quality in QUALITIES:
            self.quality_buttons[quality] = _pill(quality, lambda _=False, q=quality: self.pick_quality(q))
            row.addWidget(self.quality_buttons[quality])
        row.addStretch()
        v.addLayout(row)
        self.language_caption = self._label('caption')
        v.addWidget(self.language_caption)
        row = QHBoxLayout()
        row.setSpacing(6)
        self.language_buttons = {}
        for lang in LANGUAGES:
            button = _pill(LANGUAGE_LABELS[lang], lambda _=False, l=lang: self.pick_language(l))
            button.setIcon(flag_icon(lang))
            self.language_buttons[lang] = button
            row.addWidget(button)
        row.addStretch()
        v.addLayout(row)
        self.episode_box = QWidget()
        row = QHBoxLayout(self.episode_box)
        row.setContentsMargins(0, 0, 0, 0)
        row.setSpacing(8)
        self.season_combo = QComboBox()
        self.episode_combo = QComboBox()
        self.season_combo.setMinimumWidth(170)
        self.episode_combo.setMinimumWidth(150)
        self.season_combo.activated.connect(self.pick_season)
        self.episode_combo.activated.connect(self.pick_episode)
        row.addWidget(self.season_combo)
        row.addWidget(self.episode_combo)
        row.addStretch()
        v.addWidget(self.episode_box)
        row = QHBoxLayout()
        self.action_button = QPushButton()
        self.action_button.setObjectName('watch')
        self.action_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self.action_button.setMinimumWidth(220)
        self.action_button.clicked.connect(self.act)
        row.addWidget(self.action_button)
        row.addStretch()
        v.addLayout(row)
        self.hint_label = self._label('hint', wrap=True)
        v.addWidget(self.hint_label)
        v.addStretch(1)
        self.stack.addWidget(page)

    @staticmethod
    def _label(name, wrap=False):
        label = QLabel()
        label.setObjectName(name)
        label.setWordWrap(wrap)
        label.setTextFormat(Qt.TextFormat.PlainText)
        return label

    def t(self, text):
        return translate(text, self.language)

    def retranslate(self, language):
        self.language = language
        for mode, text in (('library', 'Кинотека'), ('movie', 'Фильмы'), ('tv', 'Сериалы')):
            self.mode_buttons[mode].setText(self.t(text))
        self.search.setPlaceholderText(self.t('Поиск фильмов и сериалов — название…'))
        self.search.setAccessibleName(self.search.placeholderText())
        self.prev.setText(self.t('← Назад'))
        self.next.setText(self.t('Далее →'))
        self.back.setText(self.t('← К списку'))
        self.quality_caption.setText(self.t('КАЧЕСТВО'))
        self.language_caption.setText(self.t('ЯЗЫК'))
        for lang, button in self.language_buttons.items():
            button.setToolTip(self.t(LANGUAGE_NAMES[lang]))
        self.render()

    def set_title_language(self, language):
        self.title_language = language
        self.grid.title_language = language
        for i in range(self.grid.count()):
            item = self.grid.item(i)
            title = movie_title(item.data(Qt.ItemDataRole.UserRole) or {}, language)
            item.setText(title)
            item.setToolTip(title)
        self.grid.viewport().update()
        self.render()

    # ---------- list ----------
    def set_mode(self, mode):
        self.mode = mode
        self.page = 1
        if mode == 'library':
            self.search.clear()
            self.query = ''
        self.load()

    def new_search(self):
        self.search_timer.stop()
        self.query = self.search.text().strip()
        self.page = 1
        if self.query and self.mode == 'library':
            self.mode = 'movie'
            self.mode_buttons['movie'].setChecked(True)
        self.load()

    def change_page(self, delta):
        self.page = max(1, min(self.total_pages, self.page + delta))
        self.load()

    def load(self):
        self.loaded = True
        self.list_generation += 1
        generation, mode, query, page = self.list_generation, self.mode, self.query, self.page
        self.prev.setEnabled(False)
        self.next.setEnabled(False)
        self.notify('Загружаем кинотеку…' if mode == 'library' else 'Ищем фильмы…')

        def fetch():
            return self.api.library(page) if mode == 'library' else self.api.torrent_catalog(mode, query, page)

        def done(data):
            if generation != self.list_generation:
                return
            self.fill(data if isinstance(data, dict) else {}, page)
            if mode == 'library' and not self.grid.count():
                self.notify('В кинотеке пока пусто. Найдите фильм или сериал и добавьте его.')
            elif not self.grid.count():
                self.notify('Ничего не найдено. Попробуйте другое название.')
            else:
                self.notify(f'Найдено: {data.get("total", self.grid.count())}')

        def fail(error):
            if generation != self.list_generation:
                return
            self.prev.setEnabled(page > 1)
            self.next.setEnabled(page < self.total_pages)
            self.show_error(error)

        self.work(fetch, done, fail)

    def fill(self, data, page):
        self.grid.clear()
        self.total_pages = max(1, min(500, int(data.get('total_pages') or 1)))
        for row in data.get('items') or []:
            if not isinstance(row, dict) or row.get('kind') not in ('movie', 'tv') or type(row.get('tmdb_id')) is not int:
                continue
            title = movie_title(row, self.title_language)
            item = QListWidgetItem(title)
            item.setData(Qt.ItemDataRole.UserRole, row)
            item.setToolTip(title)
            item.setData(Qt.ItemDataRole.AccessibleTextRole, title)
            self.grid.addItem(item)
            self.grid.posters.load(row.get('poster'))
        self.prev.setEnabled(page > 1)
        self.next.setEnabled(page < self.total_pages)
        self.page_label.setText(f'{page} / {self.total_pages}')

    # ---------- detail ----------
    def open_item(self, item):
        row = item.data(Qt.ItemDataRole.UserRole) if item is not None else None
        if isinstance(row, dict):
            self.open_title(row)

    def open_title(self, row, prefs=None):
        if row.get('kind') not in ('movie', 'tv') or type(row.get('tmdb_id')) is not int:
            return
        prefs = prefs or {}
        self.detail_generation += 1
        self.poll.stop()
        self.item = {k: row.get(k) for k in ('kind', 'tmdb_id', 'title', 'original_title', 'title_en', 'title_ru', 'year', 'poster')}
        self.view, self.load_failed, self.busy, self.hint = None, False, '', ''
        self.selected_id = prefs.get('source_id') or None
        self.lang = prefs.get('audio_lang') if prefs.get('audio_lang') in LANGUAGES else None
        tv = row.get('kind') == 'tv' and type(prefs.get('season')) is int and type(prefs.get('episode')) is int
        self.season, self.episode = (prefs['season'], prefs['episode']) if tv else (None, None)
        self.stack.setCurrentIndex(1)
        self.render()
        self.refresh()

    def show_list(self):
        self.detail_generation += 1
        self.poll.stop()
        self.item = self.view = None
        self.stack.setCurrentIndex(0)
        if self.mode == 'library' and self.loaded:
            self.load()  # Preparation progress may have changed meanwhile.

    def reset(self):
        self.list_generation += 1
        self.detail_generation += 1
        self.poll.stop()
        self.search_timer.stop()
        self.grid.posters.clear()
        self.grid.clear()
        self.item = self.view = None
        self.loaded = False
        self.mode, self.query, self.page = 'library', '', 1
        self.mode_buttons['library'].setChecked(True)
        self.search.clear()
        self.stack.setCurrentIndex(0)

    def shutdown(self):
        self.reset()

    def refresh(self):
        if not self.item:
            return
        generation, kind, tmdb_id = self.detail_generation, self.item['kind'], self.item['tmdb_id']
        self.poll.stop()

        def done(view):
            if generation != self.detail_generation:
                return
            self.view = view if isinstance(view, dict) else {}
            self.load_failed = False
            self.ensure_episode()
            self.render()
            if in_flight(self.view):
                self.poll.start(POLL_MS)

        def fail(error):
            if generation != self.detail_generation:
                return
            if isinstance(error, ApiError) and error.status == 401:
                self.show_error(error)
                return
            self.load_failed = True
            self.render()
            self.poll.start(POLL_MS * 2)

        self.work(lambda: self.api.torrent_sources(kind, tmdb_id), done, fail)

    def sources(self):
        return [s for s in (self.view or {}).get('sources') or [] if isinstance(s, dict)]

    def selected(self):
        sources = self.sources()
        if not sources:
            return None
        if self.selected_id:
            hit = next((s for s in sources if s.get('source_id') == self.selected_id), None)
            if hit:
                return hit
        return next((s for s in sources if s.get('default')), None) or best_source(sources)

    def audio_language(self):
        languages = (self.selected() or {}).get('languages') or []
        if self.lang and (self.lang in languages or not languages):
            return self.lang
        return 'ru' if 'ru' in languages else (languages[0] if languages else None)

    def known_episodes(self):
        seen = set(_episodes(self.selected()))
        for e in (self.view or {}).get('episodes') or []:
            if isinstance(e, dict) and type(e.get('season')) is int and type(e.get('episode')) is int:
                seen.add((e['season'], e['episode']))
        return sorted(seen)

    def ensure_episode(self):
        if not self.item or self.item['kind'] != 'tv':
            return
        episodes = self.known_episodes()
        if not episodes or (self.season is not None and self.episode is not None):
            return
        own = _episodes(self.selected())
        self.season, self.episode = own[0] if own else episodes[0]

    def current_episode(self):
        if self.item and self.item['kind'] == 'tv' and self.season is not None and self.episode is not None and self.known_episodes():
            return (self.season, self.episode)
        return None

    def action(self):
        view = self.view
        if view is None:
            return 'retry' if self.load_failed else 'loading'
        if not view.get('allowed'):
            return 'subscribe'
        selected = self.selected()
        if selected and selected.get('state') == 'ready':
            episode = self.current_episode()
            return 'launch' if not episode or has_episode(selected, episode) else 'missing'
        if selected and selected.get('source_id') and selected.get('state') in ('candidate', 'failed'):
            return 'prepare'
        if selected and selected.get('state') in ('queued', 'loading'):
            return 'wait'
        status = (view.get('status') or {}).get('status')
        if status in IN_PROGRESS or view.get('discovering'):
            return 'wait'
        if status == 'not_queued':
            return 'discover' if view.get('in_library') else 'library'
        return 'discover'

    def display_title(self):
        return movie_title(self.item or {}, self.title_language)

    def choice(self):
        selected, episode = self.selected(), self.current_episode()
        return {'kind': self.item['kind'], 'tmdb_id': self.item['tmdb_id'],
                'source_id': (selected or {}).get('source_id'), 'season': episode[0] if episode else None,
                'episode': episode[1] if episode else None, 'audio_lang': self.audio_language(),
                'title': self.display_title()}

    # ---------- choices ----------
    def choose(self, source):
        if not source:
            return
        self.selected_id = source.get('source_id')
        self.hint = ''
        if source.get('source_id') and source.get('state') in ('candidate', 'failed'):
            self.prepare(source)

    def pick_quality(self, quality):
        selected = self.selected()
        if not selected or selected.get('quality') != quality:
            options = [s for s in self.sources() if s.get('quality') == quality and s.get('state') != 'failed']
            self.choose(best_source(options, language=self.lang, episode=self.current_episode()))
        self.render()

    def pick_language(self, language):
        self.lang = language
        selected = self.selected()
        if not selected or language not in (selected.get('languages') or []):
            options = [s for s in self.sources() if language in (s.get('languages') or []) and s.get('state') != 'failed']
            self.choose(best_source(options, quality=(selected or {}).get('quality'), episode=self.current_episode()))
        self.render()

    def follow_episode(self):
        episode, selected = self.current_episode(), self.selected()
        if not episode or not selected or has_episode(selected, episode):
            return
        options = [s for s in self.sources() if s.get('state') == 'ready' and has_episode(s, episode)]
        alternative = best_source(options, quality=selected.get('quality'), language=self.audio_language())
        if alternative:
            self.selected_id = alternative.get('source_id')

    def pick_season(self, index):
        value = self.season_combo.itemData(index)
        if type(value) is not int:
            return
        self.season = value
        own = [e for s, e in _episodes(self.selected()) if s == value]
        known = [e for s, e in self.known_episodes() if s == value]
        self.episode = own[0] if own else (known[0] if known else 1)
        self.follow_episode()
        self.render()

    def pick_episode(self, index):
        value = self.episode_combo.itemData(index)
        if type(value) is not int or value < 1:
            return
        self.episode = value
        self.follow_episode()
        self.render()

    # ---------- actions ----------
    def act(self):
        if self.busy:
            return
        action = self.action()
        if action == 'retry':
            self.refresh()
        elif action == 'launch':
            self.playRequested.emit(self.choice())
        elif action == 'prepare':
            self.prepare()
        elif action == 'discover':
            self.discover()
        elif action == 'library':
            self.add_library()

    def _run(self, name, fn, message):
        generation = self.detail_generation
        self.busy = name
        self.render()

        def done(result):
            if generation != self.detail_generation:
                return
            self.busy = ''
            self.hint = message(result) if callable(message) else message
            self.refresh()

        def fail(error):
            if generation != self.detail_generation:
                return
            self.busy = ''
            if isinstance(error, ApiError) and error.status == 401:
                self.show_error(error)
                return
            self.hint = str(error) if isinstance(error, ApiError) else 'Не удалось выполнить действие. Повторите попытку.'
            self.render()

        self.work(fn, done, fail)

    def prepare(self, source=None):
        source = source or self.selected()
        if self.busy or not source or not source.get('source_id'):
            return
        source_id = source['source_id']
        self._run('prepare', lambda: self.api.prepare_source(source_id), 'Раздача поставлена в очередь на проверку')

    def discover(self):
        kind, tmdb_id = self.item['kind'], self.item['tmdb_id']
        results = {'cooldown': 'Повторный поиск станет доступен чуть позже',
                   'no_demand': 'Добавьте запись в кинотеку, чтобы начать поиск'}
        self._run('discover', lambda: self.api.discover_sources(kind, tmdb_id),
                  lambda r: results.get((r or {}).get('result'), 'Ищем раздачи…'))

    def add_library(self):
        kind, tmdb_id = self.item['kind'], self.item['tmdb_id']
        self._run('library', lambda: self.api.add_to_library(kind, tmdb_id), 'Добавлено в кинотеку — ищем раздачи')

    # ---------- render ----------
    def render(self):
        if not hasattr(self, 'action_button') or not self.item:
            return
        t = self.t
        self.title_label.setText(self.display_title())
        meta = [str(self.item['year'])] if type(self.item.get('year')) is int else []
        meta.append(t('Сериал') if self.item['kind'] == 'tv' else t('Фильм'))
        self.meta_label.setText(' · '.join(meta))
        selected = self.selected()
        state = progress_state(self.view, selected)
        self.progress.setVisible(bool(state))
        self.progress_label.setVisible(bool(state))
        if state:
            status, percent, _, _ = state
            ready = status in ('playable', 'partial')
            self.progress.setValue(100 if ready else 0 if status == 'unavailable' else max(0, min(100, percent)))
            self.progress.setStyleSheet(_READY_BAR if ready else _ACTIVE_BAR)
            self.progress_label.setText(progress_text(state, self.language))
            self.progress_label.setStyleSheet('color:#35c46a;font-weight:700;' if ready else 'color:#9ce8d7;')
        self.selected_label.setVisible(bool(selected))
        if selected:
            self.selected_label.setText(f'✓ {t("Выбрано")}: {source_name(selected)} · ▲ {int(selected.get("seeders") or 0)} {t("сид")}'
                                        + (f' · {size_text(selected.get("size_bytes"))}' if size_text(selected.get('size_bytes')) else ''))
            self.selected_label.setToolTip(str(selected.get('title') or ''))
        offered = [s for s in self.sources() if s.get('state') != 'failed']
        qualities = {s.get('quality') for s in offered}
        languages = {lang for s in offered for lang in s.get('languages') or []}
        has_sources = bool(self.sources())
        audio = self.audio_language()
        for widget in (self.quality_caption, self.language_caption):
            widget.setVisible(has_sources)
        for quality, button in self.quality_buttons.items():
            button.setVisible(has_sources)
            button.setEnabled(quality in qualities and not self.busy)
            button.setChecked(bool(selected) and selected.get('quality') == quality)
        for lang, button in self.language_buttons.items():
            button.setVisible(has_sources)
            button.setEnabled(lang in languages and not self.busy)
            button.setChecked(audio == lang)
        self._render_episodes()
        action = self.action()
        self.action_button.setText(t('Подождите…') if self.busy else t(ACTION_TEXT[action]))
        self.action_button.setEnabled(action in ACTIONABLE and not self.busy)
        name = 'watch' if action == 'launch' else 'primary'
        if self.action_button.objectName() != name:
            self.action_button.setObjectName(name)
            self.action_button.style().unpolish(self.action_button)
            self.action_button.style().polish(self.action_button)
        self.hint_label.setText(t(self.hint))
        self.hint_label.setVisible(bool(self.hint))

    def _render_episodes(self):
        episodes = self.known_episodes()
        show = self.item['kind'] == 'tv' and bool(episodes)
        self.episode_box.setVisible(show)
        if not show:
            return
        seasons = sorted({s for s, _ in episodes})
        self.season_combo.blockSignals(True)
        self.episode_combo.blockSignals(True)
        self.season_combo.clear()
        for season in seasons:
            self.season_combo.addItem(self.t('Сезон') + f' {season}' if season else self.t('Спецвыпуски'), season)
        if self.season in seasons:
            self.season_combo.setCurrentIndex(seasons.index(self.season))
        self.episode_combo.clear()
        numbers = [e for s, e in episodes if s == self.season]
        for number in numbers:
            self.episode_combo.addItem(self.t('Серия') + f' {number}', number)
        if self.episode in numbers:
            self.episode_combo.setCurrentIndex(numbers.index(self.episode))
        self.season_combo.blockSignals(False)
        self.episode_combo.blockSignals(False)

    def showEvent(self, event):
        super().showEvent(event)
        if self.item and self.stack.currentIndex() == 1 and self.view is not None and in_flight(self.view):
            self.refresh()
