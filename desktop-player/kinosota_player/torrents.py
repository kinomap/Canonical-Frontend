"""«Торренты»: the KINOSOTA torrent catalogue inside the desktop app.

Same server contract as the website detail page: Kinoteka / search, quality /
voice / episode choice, live preparation progress and a short-lived playback
ticket. The app never sees an infohash, magnet or tracker URL; the stream URL
goes to mpv over private IPC and the chosen voice becomes mpv ``--alang``.
"""
from PySide6.QtCore import QLocale, Qt, QTimer, Signal
from PySide6.QtWidgets import (QButtonGroup, QFrame, QGridLayout, QHBoxLayout, QLabel, QLineEdit, QListWidgetItem,
    QProgressBar, QPushButton, QScrollArea, QSizePolicy, QStackedWidget, QStyledItemDelegate, QVBoxLayout, QWidget)
from .api import API_ORIGIN, ApiError
from .artwork import Sink, rounded
from .catalog import PosterGrid, Posters
from .filters import FilterCombo, FlowLayout
from .preferences import movie_title, translate

QUALITIES = ('2160p', '1080p', '720p', '480p')
LANGUAGES = ('ru', 'uk', 'en')
LANGUAGE_LABELS = {'ru': 'RU', 'uk': 'UA', 'en': 'EN'}
# 0.1.8: the title page names the languages as the website does (no drawn flags).
LANGUAGE_PILLS = {'ru': 'Русский', 'uk': 'Українська', 'en': 'English'}
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
                # Server viewer rank (1080p > 2160p > 720p, ru/en/uk voices, more voices, seeders).
                s.get('rank') if type(s.get('rank')) is int else 10 ** 9,
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


def plural(count, one, few, many):
    n = abs(int(count)) % 100
    if 11 <= n <= 14:
        return many
    n %= 10
    return one if n == 1 else few if 2 <= n <= 4 else many


def seeds_text(count, language='ru'):
    if type(count) is not int or count < 0:
        return ''
    if language == 'en':
        return f'{count} seed' + ('' if count == 1 else 's')
    return f'{count} ' + plural(count, 'сид', 'сида', 'сидов')


def start_text(ms, language='ru'):
    """«старт 3,1 с»: how quickly the prepared release starts playing."""
    if type(ms) is not int or ms <= 0:
        return ''
    value = f'{ms / 1000:.1f}'
    return f'start {value} s' if language == 'en' else 'старт ' + value.replace('.', ',') + ' с'


def count_text(seasons, episodes, language='ru'):
    parts = []
    if type(seasons) is int and seasons > 0:
        word = ('season' if seasons == 1 else 'seasons') if language == 'en' else plural(seasons, 'сезон', 'сезона', 'сезонов')
        parts.append(f'{seasons} {word}')
    if type(episodes) is int and episodes > 0:
        word = ('episode' if episodes == 1 else 'episodes') if language == 'en' else plural(episodes, 'серия', 'серии', 'серий')
        parts.append(f'{episodes} {word}')
    return ' · '.join(parts)


def runtime_text(minutes, language='ru'):
    if type(minutes) is not int or minutes <= 0:
        return ''
    hours, rest = divmod(minutes, 60)
    h, m = ('h', 'min') if language == 'en' else ('ч', 'мин')
    if not hours:
        return f'{rest} {m}'
    return f'{hours} {h} {rest} {m}' if rest else f'{hours} {h}'


def names(values, limit=3):
    """Unique non-empty names from strings or ``{name}`` objects, at most ``limit``."""
    found = []
    for value in values if isinstance(values, list) else []:
        name = value.get('name') if isinstance(value, dict) else value
        if isinstance(name, str) and name.strip() and name.strip() not in found:
            found.append(name.strip())
        if len(found) >= limit:
            break
    return found


def initials(name):
    parts = [p for p in str(name or '').split() if p[:1].isalpha()]
    return ''.join(p[0] for p in parts[:2]).upper() or '?'


# The API names production countries in Russian and sends their ISO codes alongside (0.1.8);
# the English interface takes Qt's territory names, with the short and historical forms below.
SHORT_COUNTRIES = {'US': 'USA', 'GB': 'UK', 'AE': 'UAE', 'HK': 'Hong Kong', 'SU': 'USSR', 'XC': 'Czechoslovakia',
                   'YU': 'Yugoslavia', 'XG': 'West Germany', 'DD': 'East Germany'}


def english_country(code):
    """English name of an ISO 3166-1 code, '' when unknown."""
    if not isinstance(code, str) or len(code) != 2:
        return ''
    if code.upper() in SHORT_COUNTRIES:
        return SHORT_COUNTRIES[code.upper()]
    territory = QLocale.codeToTerritory(code.upper())
    return QLocale.territoryToString(territory) if territory != QLocale.Country.AnyCountry else ''


def country_names(meta, language, limit):
    """Production countries in the interface language; Russian names when the codes are missing or misaligned."""
    values = meta.get('countries') if isinstance(meta.get('countries'), list) else []
    codes = meta.get('country_codes') if isinstance(meta.get('country_codes'), list) else []
    if language == 'en' and len(codes) == len(values):
        values = [english_country(code) or name for code, name in zip(codes, values)]
    return names(values, limit)


def size_text(size, language='ru'):
    if type(size) is not int or size <= 0:
        return ''
    gb = size / 1024 ** 3
    if language == 'en':
        return f'{gb:.1f} GB' if gb >= 1 else f'{max(1, round(size / 1024 ** 2))} MB'
    return (f'{gb:.1f}'.replace('.', ',') + ' ГБ') if gb >= 1 else f'{max(1, round(size / 1024 ** 2))} МБ'


def source_name(source):
    parts = [x for x in ((source or {}).get('quality'), (source or {}).get('source_type')) if isinstance(x, str) and x]
    return ' '.join(parts) or str((source or {}).get('title') or 'Раздача')[:80]


class ElideLabel(QLabel):
    """One line ending with «…» instead of widening the cast grid."""

    def __init__(self, name):
        super().__init__()
        self.setObjectName(name)
        self.setTextFormat(Qt.TextFormat.PlainText)
        self.setSizePolicy(QSizePolicy.Policy.Ignored, QSizePolicy.Policy.Preferred)
        self.full = ''

    def set_full(self, text):
        self.full = str(text or '')
        self.setToolTip(self.full)
        self.elide()

    def elide(self):
        width = self.width()
        fits = not self.isVisible() or width <= 8
        self.setText(self.full if fits else self.fontMetrics().elidedText(self.full, Qt.TextElideMode.ElideRight, width))

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.elide()

    def showEvent(self, event):
        super().showEvent(event)
        self.elide()


class CastCard(QFrame):
    """«В ролях»: photo (or initials), name and role, as on the website."""

    def __init__(self):
        super().__init__()
        self.setObjectName('castCard')
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self.person, self.photo_url = {}, ''
        row = QHBoxLayout(self)
        row.setContentsMargins(10, 10, 12, 10)
        row.setSpacing(12)
        self.photo = QLabel()
        self.photo.setObjectName('castPhoto')
        self.photo.setFixedSize(48, 48)
        self.photo.setAlignment(Qt.AlignmentFlag.AlignCenter)
        row.addWidget(self.photo)
        text = QVBoxLayout()
        text.setSpacing(2)
        self.name = ElideLabel('castName')
        self.role = ElideLabel('castRole')
        text.addStretch(1)
        text.addWidget(self.name)
        text.addWidget(self.role)
        text.addStretch(1)
        row.addLayout(text, 1)

    def set_person(self, person):
        self.person = person
        photo = person.get('photo')
        self.photo_url = photo if isinstance(photo, str) else ''
        self.name.set_full(person.get('name'))
        role = person.get('character') if isinstance(person.get('character'), str) else ''
        self.role.set_full(role)
        self.role.setVisible(bool(role))
        self.set_photo(None)

    def set_photo(self, pixmap):
        if pixmap is not None and not pixmap.isNull():
            self.photo.setPixmap(rounded(pixmap, 48, 48, 10))
            return
        self.photo.clear()
        self.photo.setText(initials(self.person.get('name')))


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
    listShown = Signal()
    backdropChanged = Signal(object)  # 0.1.8: the open title's backdrop (QPixmap) or None.

    def __init__(self, api, work, show_error, notify, language='ru', title_language='ru', parent=None, embedded=False):
        super().__init__(parent)
        # Embedded in the window: the header navigation and search replace the pills.
        self.embedded = embedded
        self.return_to = None
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
        # Title page artwork and TMDB details (/torrents/detail), loaded next to the sources.
        self.meta, self.meta_loaded, self.back_caption, self.poster_size = {}, False, None, (0, 0)
        self.art = Posters(Sink(self, self.render_art), getattr(api, 'origin', API_ORIGIN))
        self.backdrop_url = ''
        self.backdrop_art = Posters(Sink(self, self.render_backdrop), getattr(api, 'origin', API_ORIGIN), size=(1280, 720))
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
        self.list_controls = QWidget()
        self.list_controls.setLayout(row)
        row.setContentsMargins(0, 0, 0, 0)
        self.list_controls.setVisible(not self.embedded)
        v.addWidget(self.list_controls)
        self.grid = PosterGrid(self.api.origin)
        self.grid.title_language = self.title_language
        self.grid.itemClicked.connect(self.open_item)
        self.grid.itemActivated.connect(self.open_item)
        self.grid.bookmarkToggled.connect(self.unsave)
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
        scroll = QScrollArea()
        scroll.setObjectName('detailScroll')
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        page = QWidget()
        page.setObjectName('detailBody')
        scroll.setWidget(page)
        self.detail_scroll = scroll
        v = QVBoxLayout(page)
        v.setContentsMargins(4, 0, 16, 28)
        v.setSpacing(24)
        top = QHBoxLayout()
        self.back = QPushButton()
        self.back.setObjectName('backChip')
        self.back.setCursor(Qt.CursorShape.PointingHandCursor)
        self.back.clicked.connect(self.show_list)
        top.addWidget(self.back)
        top.addStretch()
        v.addLayout(top)
        hero = QHBoxLayout()
        hero.setSpacing(28)
        self.poster = QLabel()
        self.poster.setObjectName('detailPoster')
        hero.addWidget(self.poster, 0, Qt.AlignmentFlag.AlignTop)
        info = QVBoxLayout()
        info.setSpacing(10)
        self.meta_label = self._label('detailEyebrow')
        self.title_label = self._label('torrentTitle', wrap=True)
        self.subtitle_label = self._label('subtitle', wrap=True)
        for widget in (self.meta_label, self.title_label, self.subtitle_label):
            info.addWidget(widget)
        self.facts = QWidget()
        self.facts_box = FlowLayout(self.facts, 8, 8)
        self.facts_box.setContentsMargins(0, 2, 0, 2)
        self.fact_items = None
        info.addWidget(self.facts)
        row = QHBoxLayout()
        row.setContentsMargins(0, 8, 0, 0)
        self.action_button = QPushButton()
        self.action_button.setObjectName('watch')
        self.action_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self.action_button.setMinimumWidth(240)
        self.action_button.clicked.connect(self.act)
        row.addWidget(self.action_button)
        row.addStretch()
        info.addLayout(row)
        status = QHBoxLayout()
        status.setSpacing(6)
        self.progress_label = self._label('progress')
        self.progress_label.setSizePolicy(QSizePolicy.Policy.Maximum, QSizePolicy.Policy.Preferred)
        self.selected_label = self._label('selected', wrap=True)
        status.addWidget(self.progress_label, 0, Qt.AlignmentFlag.AlignTop)
        status.addWidget(self.selected_label, 1)
        info.addLayout(status)
        self.progress = QProgressBar()
        self.progress.setObjectName('prepBar')
        self.progress.setRange(0, 100)
        self.progress.setTextVisible(False)
        self.progress.setFixedHeight(6)
        self.progress.setMaximumWidth(520)
        info.addWidget(self.progress)
        self.options = QFrame()
        self.options.setObjectName('optionsCard')
        grid = QGridLayout(self.options)
        grid.setContentsMargins(20, 16, 20, 16)
        grid.setHorizontalSpacing(24)
        grid.setVerticalSpacing(12)
        grid.setColumnStretch(1, 1)
        self.quality_caption, self.quality_row = self._option_row(grid, 0)
        self.quality_buttons = {}
        for quality in QUALITIES:
            self.quality_buttons[quality] = _pill(quality, lambda _=False, q=quality: self.pick_quality(q))
            self.quality_row.layout().addWidget(self.quality_buttons[quality])
        self.quality_row.layout().addStretch()
        self.language_caption, self.language_row = self._option_row(grid, 1)
        self.language_buttons = {}
        for lang in LANGUAGES:
            self.language_buttons[lang] = _pill(LANGUAGE_PILLS[lang], lambda _=False, l=lang: self.pick_language(l))
            self.language_row.layout().addWidget(self.language_buttons[lang])
        self.language_row.layout().addStretch()
        self.voice_caption = self._caption(grid, 2)
        self.voice_row = QWidget()
        self.voice_box = FlowLayout(self.voice_row, 6, 6)
        self.voice_box.setContentsMargins(0, 0, 0, 0)
        self.voice_buttons, self.voice_values = [], None
        grid.addWidget(self.voice_row, 2, 1)
        self.episode_caption, self.episode_box = self._option_row(grid, 3)
        self.season_combo = FilterCombo()
        self.episode_combo = FilterCombo()
        for combo, width in ((self.season_combo, 170), (self.episode_combo, 150)):
            combo.setObjectName('detailCombo')
            combo.setItemDelegate(QStyledItemDelegate(combo))
            combo.setCursor(Qt.CursorShape.PointingHandCursor)
            combo.setMinimumWidth(width)
            self.episode_box.layout().addWidget(combo)
        self.episode_box.layout().addStretch()
        self.season_combo.activated.connect(self.pick_season)
        self.episode_combo.activated.connect(self.pick_episode)
        info.addSpacing(6)
        info.addWidget(self.options)
        self.hint_label = self._label('hint', wrap=True)
        info.addWidget(self.hint_label)
        info.addStretch(1)
        hero.addLayout(info, 1)
        v.addLayout(hero)
        self.about = QWidget()
        about = QVBoxLayout(self.about)
        about.setContentsMargins(0, 4, 0, 0)
        about.setSpacing(12)
        self.about_caption = self._label('sectionCaption')
        about.addWidget(self.about_caption)
        body = QHBoxLayout()
        body.setSpacing(48)
        self.overview_label = self._label('overview', wrap=True)
        self.overview_label.setAlignment(Qt.AlignmentFlag.AlignTop | Qt.AlignmentFlag.AlignLeft)
        body.addWidget(self.overview_label, 3)
        self.credits = QWidget()
        self.credits_box = QGridLayout(self.credits)
        self.credits_box.setContentsMargins(0, 0, 0, 0)
        self.credits_box.setHorizontalSpacing(18)
        self.credits_box.setVerticalSpacing(8)
        self.credits_box.setColumnStretch(1, 1)
        self.credit_rows = None
        body.addWidget(self.credits, 2, Qt.AlignmentFlag.AlignTop)
        about.addLayout(body)
        v.addWidget(self.about)
        self.cast_section = QWidget()
        cast = QVBoxLayout(self.cast_section)
        cast.setContentsMargins(0, 4, 0, 0)
        cast.setSpacing(12)
        self.cast_caption = self._label('sectionCaption')
        cast.addWidget(self.cast_caption)
        self.cast_grid = QGridLayout()
        self.cast_grid.setHorizontalSpacing(12)
        self.cast_grid.setVerticalSpacing(12)
        cast.addLayout(self.cast_grid)
        self.cast_cards, self.cast_people, self.cast_columns = [], None, 0
        v.addWidget(self.cast_section)
        v.addStretch(1)
        self.about.hide()
        self.cast_section.hide()
        self.stack.addWidget(scroll)
        self.adapt()

    def _caption(self, grid, row):
        label = self._label('caption')
        grid.addWidget(label, row, 0, Qt.AlignmentFlag.AlignTop | Qt.AlignmentFlag.AlignLeft)
        return label

    def _option_row(self, grid, row):
        caption = self._caption(grid, row)
        box = QWidget()
        layout = QHBoxLayout(box)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)
        grid.addWidget(box, row, 1)
        return caption, box

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
        self.back.setText(self.back_text())
        for label, text in ((self.quality_caption, 'КАЧЕСТВО'), (self.language_caption, 'ЯЗЫК'),
                            (self.voice_caption, 'ОЗВУЧКА'), (self.episode_caption, 'СЕРИЯ'),
                            (self.cast_caption, 'В РОЛЯХ')):
            label.setText(self.t(text))
        for lang, button in self.language_buttons.items():
            button.setToolTip(self.t(LANGUAGE_NAMES[lang]))
        self.fact_items = self.credit_rows = None
        self.render()
        self.render_meta()

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
                self.notify('')  # 0.1.8: no «Найдено: N» line under the posters.

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
            if self.mode == 'library':
                row = {**row, '_saved': True}  # Yellow ribbon: a click removes the title.
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

    def unsave(self, item):
        """Ribbon in «Кинотека»: remove the title from the personal library."""
        row = item.data(Qt.ItemDataRole.UserRole) if item is not None else None
        if self.mode != 'library' or not isinstance(row, dict) or not hasattr(self.api, 'remove_from_library'):
            return
        generation = self.list_generation

        def done(_):
            if generation == self.list_generation:
                for i in range(self.grid.count()):
                    current = self.grid.item(i).data(Qt.ItemDataRole.UserRole) or {}
                    if (current.get('kind'), current.get('tmdb_id')) == (row['kind'], row['tmdb_id']):
                        self.grid.takeItem(i)
                        break
            self.notify('Удалено из кинотеки')

        self.work(lambda: self.api.remove_from_library(row['kind'], row['tmdb_id']), done, self.show_error)

    # ---------- detail ----------
    def open_item(self, item):
        row = item.data(Qt.ItemDataRole.UserRole) if item is not None else None
        if isinstance(row, dict):
            self.back_caption = {'library': 'Кинотека', 'movie': 'Фильмы', 'tv': 'Сериалы'}.get(self.mode)
            self.open_title(row)

    def open_title(self, row, prefs=None):
        if row.get('kind') not in ('movie', 'tv') or type(row.get('tmdb_id')) is not int:
            return
        prefs = prefs or {}
        self.detail_generation += 1
        self.poll.stop()
        self.item = {k: row.get(k) for k in ('kind', 'tmdb_id', 'title', 'original_title', 'title_en', 'title_ru', 'year',
                                             'poster', 'rating', 'overview')}
        self.meta, self.meta_loaded, self.backdrop_url = {}, False, ''
        self.view, self.load_failed, self.busy, self.hint = None, False, '', ''
        self.selected_id = prefs.get('source_id') or None
        self.lang = prefs.get('audio_lang') if prefs.get('audio_lang') in LANGUAGES else None
        tv = row.get('kind') == 'tv' and type(prefs.get('season')) is int and type(prefs.get('episode')) is int
        self.season, self.episode = (prefs['season'], prefs['episode']) if tv else (None, None)
        self.notify('')
        self.stack.setCurrentIndex(1)
        self.render_backdrop()
        self.detail_scroll.verticalScrollBar().setValue(0)
        self.art.load(self.item.get('poster'))
        self.adapt()
        self.render_meta()
        self.render()
        self.refresh()
        self.load_meta()

    def show_list(self):
        self.detail_generation += 1
        self.poll.stop()
        self.item = self.view = None
        self.meta, self.back_caption, self.backdrop_url = {}, None, ''
        self.stack.setCurrentIndex(0)
        self.render_backdrop()
        back, self.return_to = self.return_to, None
        if back:
            back()  # Opened from the window catalogue: go back there.
            return
        if self.mode == 'library' and self.loaded:
            self.load()  # Preparation progress may have changed meanwhile.
        self.listShown.emit()

    def show_library(self):
        """«Кинотека» in the window header: the personal library list, freshly loaded."""
        self.return_to = None
        self.detail_generation += 1
        self.poll.stop()
        self.item = self.view = None
        self.meta, self.back_caption, self.backdrop_url = {}, None, ''
        self.stack.setCurrentIndex(0)
        self.render_backdrop()
        self.mode_buttons['library'].setChecked(True)
        self.search.clear()
        self.query = ''
        self.set_mode('library')

    def reset(self):
        self.list_generation += 1
        self.detail_generation += 1
        self.poll.stop()
        self.search_timer.stop()
        self.grid.posters.clear()
        self.grid.clear()
        self.art.clear()
        self.backdrop_art.clear()
        self.item = self.view = None
        self.meta, self.back_caption, self.backdrop_url = {}, None, ''
        self.loaded = False
        self.return_to = None
        self.mode, self.query, self.page = 'library', '', 1
        self.mode_buttons['library'].setChecked(True)
        self.search.clear()
        self.stack.setCurrentIndex(0)
        self.render_backdrop()

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

    def load_meta(self):
        """TMDB facts for the title page: tagline, genres, length, credits, cast (public, cached)."""
        if not self.item or not hasattr(self.api, 'torrent_detail'):
            return
        generation, kind, tmdb_id = self.detail_generation, self.item['kind'], self.item['tmdb_id']

        def done(data):
            if generation != self.detail_generation or not isinstance(data, dict):
                return
            self.meta, self.meta_loaded = data, True
            backdrop = data.get('backdrop')
            self.backdrop_url = backdrop if isinstance(backdrop, str) else ''
            self.backdrop_art.load(self.backdrop_url)
            self.art.load(self.item.get('poster') or data.get('poster'))
            for person in (data.get('cast') or [])[:8]:
                if isinstance(person, dict):
                    self.art.load(person.get('photo'))
            self.render_meta()
            self.render()
            self.render_backdrop()

        def fail(_error):
            pass  # The page works without the extras; sources and playback are unaffected.

        self.work(lambda: self.api.torrent_detail(kind, tmdb_id), done, fail)

    def sources(self):
        return [s for s in (self.view or {}).get('sources') or [] if isinstance(s, dict)]

    def selected(self):
        sources = self.sources()
        if not sources:
            return None
        # The user's pick, then the server's best-ranked ready source, then the manifest default.
        for wanted in (self.selected_id, (self.view or {}).get('selected_source_id')):
            hit = next((s for s in sources if s.get('source_id') == wanted), None) if wanted else None
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

    def pick_voice(self, voice):
        selected = self.selected()
        if not selected or voice not in (selected.get('voices') or []):
            options = [s for s in self.sources() if voice in (s.get('voices') or []) and s.get('state') != 'failed']
            self.choose(best_source(options, quality=(selected or {}).get('quality'), language=self.lang,
                                    episode=self.current_episode()))
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
    def back_text(self):
        return '‹  ' + self.t(self.back_caption) if self.back_caption else self.t('← К списку')

    def eyebrow(self):
        """«СЕРИАЛ · 2004–2012 · США»."""
        item, meta = self.item, self.meta
        parts = [self.t('Сериал') if item['kind'] == 'tv' else self.t('Фильм')]
        year = item.get('year') if type(item.get('year')) is int else meta.get('year')
        if type(year) is int:
            end = meta.get('end_year')
            parts.append(f'{year}–{end}' if item['kind'] == 'tv' and type(end) is int and end > year else str(year))
        parts += country_names(meta, self.language, 1)
        return ' · '.join(parts).upper()

    def subtitle_text(self):
        """«House · «Уже лучше?»»: the other title, then the tagline."""
        item, meta, shown = self.item, self.meta, self.display_title()
        parts = []
        for other in (item.get('original_title') or meta.get('original_title'), item.get('title') or meta.get('title')):
            if isinstance(other, str) and other.strip() and other.strip() != shown:
                parts.append(other.strip())
                break
        tagline = meta.get('tagline')
        tagline = tagline.strip().strip('«»"').strip() if isinstance(tagline, str) else ''
        if tagline:
            parts.append(f'«{tagline}»')
        return ' · '.join(parts)

    @staticmethod
    def _tone(widget, tone):
        if widget.property('tone') != tone:
            widget.setProperty('tone', tone)
            widget.style().unpolish(widget)
            widget.style().polish(widget)

    def render(self):
        if not hasattr(self, 'action_button') or not self.item:
            return
        t = self.t
        self.back.setText(self.back_text())
        self.title_label.setText(self.display_title())
        self.meta_label.setText(self.eyebrow())
        subtitle = self.subtitle_text()
        self.subtitle_label.setText(subtitle)
        self.subtitle_label.setVisible(bool(subtitle))
        selected = self.selected()
        state = progress_state(self.view, selected)
        ready = bool(state) and state[0] in ('playable', 'partial')
        active = bool(state) and state[0] in IN_PROGRESS and not state[3]
        self.progress.setVisible(active)
        self.progress_label.setVisible(bool(state))
        if state:
            status, percent = state[0], state[1]
            self.progress.setValue(100 if ready else 0 if status == 'unavailable' else max(0, min(100, percent)))
            self.progress_label.setText('● ' + t('Готово') if ready else progress_text(state, self.language))
            self._tone(self.progress_label, 'ready' if ready else 'active' if active else 'muted')
        parts = []
        if selected:
            parts = [source_name(selected), seeds_text(selected.get('seeders'), self.language),
                     size_text(selected.get('size_bytes'), self.language)]
            if ready:
                parts.append(start_text(state[2] if type(state[2]) is int else selected.get('start_ms'), self.language))
        details = ' · '.join(p for p in parts if p)
        self.selected_label.setText(('· ' if state else '') + details if details else '')
        self.selected_label.setVisible(bool(details))
        self.selected_label.setToolTip(str((selected or {}).get('title') or ''))
        offered = [s for s in self.sources() if s.get('state') != 'failed']
        qualities = {s.get('quality') for s in offered}
        languages = {lang for s in offered for lang in s.get('languages') or []}
        audio = self.audio_language()
        self.options.setVisible(bool(self.sources()))
        shown = False
        for quality, button in self.quality_buttons.items():
            checked = bool(selected) and selected.get('quality') == quality
            button.setVisible(quality in qualities or checked)
            button.setEnabled(quality in qualities and not self.busy)
            button.setChecked(checked)
            shown = shown or quality in qualities or checked
        self.quality_caption.setVisible(shown)
        self.quality_row.setVisible(shown)
        shown = False
        for lang, button in self.language_buttons.items():
            button.setVisible(lang in languages or audio == lang)
            button.setEnabled(lang in languages and not self.busy)
            button.setChecked(audio == lang)
            shown = shown or lang in languages or audio == lang
        self.language_caption.setVisible(shown)
        self.language_row.setVisible(shown)
        self._render_voices(selected)
        self._render_episodes()
        action = self.action()
        text = t('Подождите…') if self.busy else t(ACTION_TEXT[action])
        episode = self.current_episode()
        if action == 'launch' and episode and not self.busy:
            text += (f' · S{episode[0]} E{episode[1]}' if self.language == 'en'
                     else f' · {episode[0]} сезон, {episode[1]} серия')
        self.action_button.setText(text)
        self.action_button.setEnabled(action in ACTIONABLE and not self.busy)
        name = 'watch' if action == 'launch' else 'primary'
        if self.action_button.objectName() != name:
            self.action_button.setObjectName(name)
            self.action_button.style().unpolish(self.action_button)
            self.action_button.style().polish(self.action_button)
        self.hint_label.setText(t(self.hint))
        self.hint_label.setVisible(bool(self.hint))

    def voice_options(self):
        """Voice-over studios of the offered releases, best-ranked first (at most 12), as the site."""
        values = []
        offered = [s for s in self.sources() if s.get('state') != 'failed']
        for source in sorted(offered, key=lambda s: s.get('rank') if type(s.get('rank')) is int else 10 ** 9):
            values += [v.strip() for v in source.get('voices') or [] if isinstance(v, str) and v.strip()]
        values += [v['value'].strip() for v in (self.view or {}).get('voices') or []
                   if isinstance(v, dict) and isinstance(v.get('value'), str) and v['value'].strip()]
        return list(dict.fromkeys(values))[:12]

    def _render_voices(self, selected):
        values = self.voice_options()
        if values != self.voice_values:
            self.voice_values = values
            while self.voice_box.count():
                self.voice_box.takeAt(0)
            for button in self.voice_buttons:
                button.hide()
                button.deleteLater()
            self.voice_buttons = []
            for value in values:
                button = _pill(value, lambda _=False, v=value: self.pick_voice(v))
                button.setObjectName('voice')
                self.voice_box.addWidget(button)
                self.voice_buttons.append(button)
            self.voice_box.invalidate()
        current = (selected or {}).get('voices') or []
        for button, value in zip(self.voice_buttons, values):
            button.setChecked(value in current)
            button.setEnabled(not self.busy)
        self.voice_caption.setVisible(bool(values))
        self.voice_row.setVisible(bool(values))

    def _render_episodes(self):
        episodes = self.known_episodes()
        show = self.item['kind'] == 'tv' and bool(episodes)
        self.episode_box.setVisible(show)
        self.episode_caption.setVisible(show)
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

    @staticmethod
    def _clear(layout):
        while layout.count():
            entry = layout.takeAt(0)
            widget = entry.widget() if entry is not None else None
            if widget is not None:
                widget.hide()
                widget.deleteLater()

    def render_meta(self):
        """Facts chips, «О фильме / О сериале» with credits and «В ролях» from /torrents/detail."""
        if not hasattr(self, 'facts_box') or not self.item:
            return
        t, meta, item = self.t, self.meta, self.item
        tv = item['kind'] == 'tv'
        facts = []
        rating = meta.get('rating') or item.get('rating')
        if isinstance(rating, (int, float)) and not isinstance(rating, bool) and rating > 0:
            facts.append(('factRating', f'★ {rating:.1f} TMDB'))
        length = (count_text(meta.get('seasons'), meta.get('episodes'), self.language) if tv
                  else runtime_text(meta.get('runtime'), self.language))
        if length:
            facts.append(('fact', length))
        facts += [('fact', genre.lower()) for genre in names(meta.get('genres'), 4)]
        if facts != self.fact_items:
            self.fact_items = facts
            self._clear(self.facts_box)
            for name, text in facts:
                label = self._label(name)
                label.setText(text)
                self.facts_box.addWidget(label)
            self.facts_box.invalidate()
        self.facts.setVisible(bool(facts))
        rows = []
        directors = names(meta.get('directors'), 4)
        if directors:
            key = ('Создатель', 'Создатели') if tv else ('Режиссёр', 'Режиссёры')
            rows.append((t(key[len(directors) > 1]), ', '.join(directors)))
        for values, one, many in ((names(meta.get('studios'), 4), 'Студия', 'Студии'),
                                  (country_names(meta, self.language, 4), 'Страна', 'Страны')):
            if values:
                rows.append((t(many if len(values) > 1 else one), ', '.join(values)))
        if rows != self.credit_rows:
            self.credit_rows = rows
            self._clear(self.credits_box)
            for index, (key, value) in enumerate(rows):
                label = self._label('factKey')
                label.setText(key)
                self.credits_box.addWidget(label, index, 0, Qt.AlignmentFlag.AlignTop)
                label = self._label('factValue', wrap=True)
                label.setText(value)
                self.credits_box.addWidget(label, index, 1)
        self.credits.setVisible(bool(rows))
        overview = meta.get('overview') or item.get('overview')
        overview = overview.strip() if isinstance(overview, str) else ''
        self.about_caption.setText(t('О СЕРИАЛЕ') if tv else t('О ФИЛЬМЕ'))
        self.overview_label.setText(overview or t('Описание на русском языке пока недоступно.'))
        self.about.setVisible(bool(overview or rows or self.meta_loaded))
        people = [p for p in meta.get('cast') or [] if isinstance(p, dict) and isinstance(p.get('name'), str)
                  and p['name'].strip()][:8]
        if people != self.cast_people:
            self.cast_people = people
            for card in self.cast_cards:
                self.cast_grid.removeWidget(card)
                card.hide()
                card.deleteLater()
            self.cast_cards = []
            for person in people:
                card = CastCard()
                card.set_person(person)
                self.cast_cards.append(card)
            self.cast_columns = 0
        self.cast_section.setVisible(bool(people))
        self.render_art()
        self.adapt()

    def render_art(self):
        if not hasattr(self, 'poster') or not self.item:
            return
        width, height = self.poster_size
        if width:
            source = self.art.get(self.item.get('poster') or self.meta.get('poster'))
            self.poster.setPixmap(rounded(source, width, height, 16))
        for card in self.cast_cards:
            card.set_photo(self.art.get(card.photo_url))

    def render_backdrop(self):
        """The title backdrop behind the page header, as the website hero; only on the title page."""
        shown = bool(self.item) and self.stack.currentIndex() == 1 and bool(self.backdrop_url)
        pixmap = self.backdrop_art.get(self.backdrop_url) if shown else None
        self.backdropChanged.emit(pixmap if pixmap is not None and not pixmap.isNull() else None)

    def adapt(self):
        """Poster and cast columns follow the window width, like the website breakpoints."""
        if not hasattr(self, 'poster'):
            return
        width = self.width()
        size = (264, 396) if width >= 1150 else (220, 330) if width >= 940 else (168, 252)
        if size != self.poster_size:
            self.poster_size = size
            self.poster.setFixedSize(*size)
            self.render_art()
        columns = 4 if width >= 1100 else 3 if width >= 860 else 2
        if columns != self.cast_columns:
            self.cast_columns = columns
            for card in self.cast_cards:
                self.cast_grid.removeWidget(card)
            for index, card in enumerate(self.cast_cards):
                self.cast_grid.addWidget(card, index // columns, index % columns)
            for column in range(4):
                self.cast_grid.setColumnStretch(column, 1 if column < columns else 0)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.adapt()

    def showEvent(self, event):
        super().showEvent(event)
        if self.item and self.stack.currentIndex() == 1 and self.view is not None and in_flight(self.view):
            self.refresh()
