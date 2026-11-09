"""«Торренты»: the KINOSOTA torrent catalogue inside the desktop app.

Same server contract as the website detail page: Kinoteka / search, quality / language / episode
choice, live preparation progress and a short-lived playback ticket. The app never sees an infohash,
magnet or tracker URL; the stream URL goes to mpv over private IPC and the chosen language becomes
mpv ``--alang``. 0.1.9: the title page has the website layout (fixed backdrop, sticky poster, info
column, people strips). 0.2.0: the Russian title is the heading with the original one under it; one
«Аудио» button opens AudioTrackDialog with the start track for mpv (``--alang``, ``--aid`` when the
server knows the container numbering). The prepared file keeps every track and mpv switches them on
the fly (💬), so a voice-over is never a new preparation.
"""
from datetime import date
from PySide6.QtCore import QLocale, QPoint, QSize, Qt, QTimer, Signal
from PySide6.QtGui import QIcon
from PySide6.QtWidgets import (QButtonGroup, QDialog, QFrame, QHBoxLayout, QLabel, QLineEdit, QListWidgetItem,
    QProgressBar, QPushButton, QScrollArea, QStackedWidget, QStyledItemDelegate, QVBoxLayout, QWidget)
from .api import API_ORIGIN, ApiError
from .artwork import Sink, rounded
from .catalog import PosterGrid, Posters
from .filters import FilterCombo, FlowLayout
from .icons import flag, glyph, icon
from .motion import smooth
from .preferences import cyrillic, movie_title, secondary_title, translate
from .title_widgets import PeopleStrip, PersonCard, ShadowHost, StickyColumn, TextBlock, TopBar

QUALITIES = ('2160p', '1080p', '720p', '480p')
LANGUAGES = ('ru', 'uk', 'en')
# 0.1.9: language options as on the website: a flag and a short code; the tooltip names the track.
LANGUAGE_LABELS = {'ru': 'RU', 'uk': 'UA', 'en': 'EN'}
LANGUAGE_NAMES = {'ru': 'Русская озвучка', 'uk': 'Украинская озвучка', 'en': 'Английская дорожка'}
# mpv picks the first audio track whose language tag matches, in this order.
MPV_ALANG = {'ru': 'rus,ru', 'uk': 'ukr,uk', 'en': 'eng,en'}
# 0.2.0: AudioTrackDialog groups a release's tracks by language; the tip points at mpv's own switch.
AUDIO_GROUPS = {'ru': 'Русский', 'uk': 'Украинский', 'en': 'Английский'}
AUDIO_TAGS = {'rus': 'ru', 'ukr': 'uk', 'eng': 'en'}
AUDIO_TIP = ('Быстро переключить звуковую дорожку во время просмотра можно прямо в плеере '
             '(кнопка 💬 на нижней панели управления)')
TITLE_KEYS = ('title_ru', 'title', 'original_title', 'title_en')
PREP_LABELS = {'queued': 'В очереди', 'retrying': 'В очереди', 'searching': 'Поиск раздач',
               'loading': 'Проверка и буферизация', 'partial': 'Готово', 'playable': 'Готово',
               'unavailable': 'Раздачи не найдены'}
PREP_PROGRESS = {'not_queued': 0, 'unavailable': 0, 'queued': 10, 'retrying': 10, 'searching': 35,
                 'loading': 75, 'partial': 100, 'playable': 100}
IN_PROGRESS = ('queued', 'searching', 'loading', 'retrying')
POLL_MS = 4000
ACTION_TEXT = {'loading': 'Загружаем…', 'retry': 'Повторить', 'subscribe': 'Нужна подписка PRO',
               'launch': 'Смотреть', 'missing': 'Серия не найдена', 'prepare': 'Подготовить раздачу',
               'wait': 'Готовим раздачу…', 'discover': 'Найти раздачи', 'library': 'Добавить в кинотеку'}
ACTION_ICONS = {'launch': 'play', 'retry': 'refresh-cw', 'prepare': 'download', 'discover': 'search', 'library': 'plus'}
ACTIONABLE = ('retry', 'launch', 'prepare', 'discover', 'library')
# TMDB production states as the website badge names them; a released film shows none.
STATUS_LABELS = {'Ended': 'Завершён', 'Canceled': 'Закрыт', 'Returning Series': 'Продолжается',
                 'In Production': 'В производстве', 'Post Production': 'Постпродакшн', 'Planned': 'Запланирован',
                 'Rumored': 'Анонсирован', 'Pilot': 'Пилот'}
EN = {
    'В очереди': 'Queued', 'Поиск раздач': 'Searching releases', 'Проверка и буферизация': 'Checking and buffering',
    'Готово': 'Ready', 'Раздачи не найдены': 'No releases found', 'Раздача не отвечает': 'Release is not responding',
    'Раздача не подготовлена': 'Release is not prepared yet',
}


def audio_args(language, track=None):
    """mpv start audio: the language order (--alang); the container track (--aid) only when it is known."""
    value = MPV_ALANG.get(language)
    args = ['--alang=' + value] if value else []
    if type(track) is int and 0 < track < 100:
        args.append(f'--aid={track}')
    return args


def audio_tracks(source):
    """The audio of one release for AudioTrackDialog, grouped RU, UA, EN.

    Container tracks (``audio_tracks``: language, title, 1-based ``index``) when the server sends them;
    otherwise the voice-overs the release title names (studios, then voice types) under Russian and one
    entry per other language. Entries: ``{'id', 'language', 'label', 'index'}``; ``index`` stays None
    unless the container numbering is known (then mpv also gets ``--aid``).
    """
    source = source if isinstance(source, dict) else {}
    languages = [lang for lang in LANGUAGES if lang in (source.get('languages') or [])]
    tracks, seen = [], set()

    def add(language, label, index=None):
        language = str(language or '').lower()
        language = AUDIO_TAGS.get(language, language)
        label = ' '.join(str(label or '').split())[:60]
        if language in LANGUAGES and label and (language, label.casefold()) not in seen:
            seen.add((language, label.casefold()))
            tracks.append({'id': f'{language}:{label}', 'language': language, 'label': label,
                           'index': index if type(index) is int and 0 < index < 100 else None})

    for entry in source.get('audio_tracks') or []:
        if isinstance(entry, dict):
            add(entry.get('language'), entry.get('title') or entry.get('label'), entry.get('index'))
    if tracks:
        return sorted(tracks, key=lambda track: LANGUAGES.index(track['language']))
    if 'ru' in languages or not languages:
        for voice in source.get('voices') or []:
            if isinstance(voice, str):
                add('ru', voice)
        if 'ru' in languages and not tracks:
            add('ru', LANGUAGE_NAMES['ru'])
    for lang in ('uk', 'en'):
        if lang in languages:
            add(lang, LANGUAGE_NAMES[lang])
    return tracks


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
                # Server viewer rank (1080p > 2160p > 720p, the richest audio package, seeders).
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


def track_count_text(count, language='ru'):
    """«4 дорожки» / «4 tracks»: the size of a release's audio package."""
    if language == 'en':
        return f'{count} track' + ('' if count == 1 else 's')
    return f'{count} ' + plural(count, 'дорожка', 'дорожки', 'дорожек')


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


def status_text(state, language='ru'):
    """Line under the poster: «Готово: старт 7 718 мс», or why the release cannot start; '' while preparing."""
    if not state:
        return ''
    status, _percent, start, label = state
    t = (lambda s: EN.get(s, s)) if language == 'en' else (lambda s: s)
    if status in ('playable', 'partial'):
        if type(start) is int and start > 0:
            amount = f'{start:,}'.replace(',', ',' if language == 'en' else '\u00a0')
            return f'Ready: start {amount} ms' if language == 'en' else f'Готово: старт {amount} мс'
        return t('Готово')
    if label:
        return t(label)
    return '' if status in IN_PROGRESS else t(PREP_LABELS.get(status, ''))


def clock_text(minutes):
    """«01:32»: the length of a film as the website shows it."""
    if type(minutes) is not int or minutes <= 0:
        return ''
    return f'{minutes // 60:02d}:{minutes % 60:02d}'


def money_text(amount):
    """«$120M»: a TMDB budget in US dollars."""
    if type(amount) is not int or amount <= 0:
        return ''
    for size, suffix in ((10 ** 9, 'B'), (10 ** 6, 'M'), (10 ** 3, 'K')):
        if amount >= size:
            value = amount / size
            text = f'{value:.1f}'.rstrip('0').rstrip('.') if value < 10 else str(round(value))
            return f'${text}{suffix}'
    return f'${amount}'


def date_text(value, language='ru'):
    """«19.09.2005» (ISO in English) from a TMDB ``YYYY-MM-DD`` date; '' when it is not one."""
    if not isinstance(value, str) or len(value) != 10:
        return ''
    try:
        day = date.fromisoformat(value)
    except ValueError:
        return ''
    return day.isoformat() if language == 'en' else day.strftime('%d.%m.%Y')


def people(values, limit):
    """``{name, photo, character}`` entries with a name, at most ``limit``."""
    return [p for p in (values if isinstance(values, list) else []) if isinstance(p, dict)
            and isinstance(p.get('name'), str) and p['name'].strip()][:limit]


def _pill(text, handler):
    button = QPushButton(text)
    button.setObjectName('pill')
    button.setCheckable(True)
    button.setCursor(Qt.CursorShape.PointingHandCursor)
    button.clicked.connect(handler)
    return button


class AudioTrackDialog(QDialog):
    """«Выбор аудиодорожки»: the start audio track of the chosen release, centred, in dark glass.

    The release's tracks are grouped by language (RU, UA, EN); «Выбрать» hands the pick to the page, which
    starts mpv with it (``--alang``; ``--aid`` when the server knows the container numbering). Nothing is
    prepared again: the prepared file keeps every track and mpv switches them on the fly (💬).
    """
    trackChosen = Signal(dict)

    def __init__(self, page, tracks, current=None, caption=''):
        super().__init__(page.window() if page is not None else None)
        self.language = getattr(page, 'language', 'ru')
        self.tracks = [dict(track) for track in tracks or [] if isinstance(track, dict) and track.get('id')]
        self.setObjectName('audioDialog')
        self.setWindowTitle(self.t('Выбор аудиодорожки'))
        self.setWindowFlag(Qt.WindowType.FramelessWindowHint, True)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setModal(True)
        self.setFixedWidth(480)
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        self.card = QFrame()
        self.card.setObjectName('audioCard')
        outer.addWidget(self.card)
        box = QVBoxLayout(self.card)
        box.setContentsMargins(24, 20, 24, 22)
        box.setSpacing(0)
        head = QHBoxLayout()
        head.setSpacing(12)
        self.title_label = QLabel(self.t('Выбор аудиодорожки'))
        self.title_label.setObjectName('audioDialogTitle')
        head.addWidget(self.title_label, 1)
        self.close_button = QPushButton()
        self.close_button.setObjectName('iconButton')
        self.close_button.setIcon(icon('x', '#c9ced6', 18))
        self.close_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self.close_button.setToolTip(self.t('Закрыть'))
        self.close_button.setAccessibleName(self.close_button.toolTip())
        self.close_button.clicked.connect(self.reject)
        head.addWidget(self.close_button, 0, Qt.AlignmentFlag.AlignTop)
        box.addLayout(head)
        self.meta_label = QLabel(caption)
        self.meta_label.setObjectName('audioDialogMeta')
        self.meta_label.setWordWrap(True)
        self.meta_label.setVisible(bool(caption))
        box.addWidget(self.meta_label)
        box.addSpacing(14)
        # Language groups of checkable rows, one checked: the track mpv starts with.
        listing = QWidget()
        listing.setObjectName('audioList')
        rows = QVBoxLayout(listing)
        rows.setContentsMargins(0, 0, 0, 0)
        rows.setSpacing(6)
        self.group = QButtonGroup(self)
        self.group.setExclusive(True)
        self.track_buttons, self.group_labels = {}, {}
        for language in LANGUAGES:
            entries = [track for track in self.tracks if track.get('language') == language]
            if not entries:
                continue
            heading = QLabel(self.t(AUDIO_GROUPS[language]).upper())
            heading.setObjectName('audioGroup')
            rows.addWidget(heading)
            self.group_labels[language] = heading
            for track in entries:
                button = QPushButton(self.t(track['label']))
                button.setObjectName('audioTrack')
                button.setCheckable(True)
                button.setCursor(Qt.CursorShape.PointingHandCursor)
                button.setIcon(QIcon(flag(language)))
                button.setIconSize(QSize(18, 12))
                self.group.addButton(button)
                self.track_buttons[track['id']] = button
                rows.addWidget(button)
        rows.addStretch(1)
        self.scroll = QScrollArea()
        self.scroll.setObjectName('audioScroll')
        self.scroll.setWidgetResizable(True)
        self.scroll.setFrameShape(QFrame.Shape.NoFrame)
        self.scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.scroll.setWidget(listing)
        box.addWidget(self.scroll, 1)
        box.addSpacing(16)
        self.tip = QFrame()
        self.tip.setObjectName('audioTip')
        tip = QHBoxLayout(self.tip)
        tip.setContentsMargins(14, 12, 14, 12)
        tip.setSpacing(10)
        self.tip_icon = QLabel()
        self.tip_icon.setObjectName('audioTipIcon')
        self.tip_icon.setPixmap(glyph('message-square', '#ffd24d', 18))
        tip.addWidget(self.tip_icon, 0, Qt.AlignmentFlag.AlignTop)
        self.tip_text = QLabel(self.t(AUDIO_TIP))
        self.tip_text.setObjectName('audioTipText')
        self.tip_text.setWordWrap(True)
        tip.addWidget(self.tip_text, 1)
        box.addWidget(self.tip)
        box.addSpacing(20)
        buttons = QHBoxLayout()
        buttons.setSpacing(10)
        buttons.addStretch(1)
        self.cancel_button = QPushButton(self.t('Отмена'))
        self.cancel_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self.cancel_button.clicked.connect(self.reject)
        buttons.addWidget(self.cancel_button)
        self.choose_button = QPushButton(self.t('Выбрать'))
        self.choose_button.setObjectName('primary')
        self.choose_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self.choose_button.setDefault(True)
        self.choose_button.clicked.connect(self.confirm)
        buttons.addWidget(self.choose_button)
        box.addLayout(buttons)
        wanted = self.track_buttons.get((current or {}).get('id')) or next(iter(self.track_buttons.values()), None)
        if wanted is not None:
            wanted.setChecked(True)
        self.choose_button.setEnabled(wanted is not None)

    def t(self, text):
        return translate(text, self.language)

    def selected_track(self):
        """The checked track (a copy), or None."""
        button = self.group.checkedButton()
        hit = next((track for track in self.tracks if self.track_buttons.get(track['id']) is button), None)
        return dict(hit) if button is not None and hit else None

    def confirm(self):
        track = self.selected_track()
        if track is None:
            return
        self.trackChosen.emit(track)
        self.accept()

    def centre(self):
        """Over the middle of the app window: a frameless dialog gets no placement from the window manager."""
        self.adjustSize()
        host = self.parentWidget()
        if host is None:
            return
        middle = host.mapToGlobal(host.rect().center())
        self.move(middle.x() - self.width() // 2, middle.y() - self.height() // 2)

    def showEvent(self, event):
        super().showEvent(event)
        self.centre()


class TorrentPage(QWidget):
    """Кинотека / Фильмы / Сериалы → title → quality, language, episode → mpv."""
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
        self.audio_track = self.audio_dialog = None  # 0.2.0: the dialog's start track, the open dialog.
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
        self.narrow, self.title_px = None, 0
        self._build_list()
        self._build_detail()
        self.retranslate(language)

    # ---------- layout ----------
    def _build_list(self):
        page = QWidget()
        v = QVBoxLayout(page)
        # 0.1.9: «Кинотека» in the window keeps air between the glass header and the first row.
        v.setContentsMargins(0, 18 if self.embedded else 0, 0, 0)
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
        self.pager = QWidget()
        pages = QHBoxLayout(self.pager)
        pages.setContentsMargins(0, 0, 0, 0)
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
        self.pager.hide()  # Only when there is more than one page.
        v.addWidget(self.pager)
        self.stack.addWidget(page)

    def _build_detail(self):
        """Website title page: top bar, sticky poster + info column, «О фильме», people strips."""
        page = QWidget()
        page.setObjectName('detailPage')
        frame = QVBoxLayout(page)
        frame.setContentsMargins(0, 0, 0, 0)
        scroll = QScrollArea()
        scroll.setObjectName('detailScroll')
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        frame.addWidget(scroll)
        self.detail_page, self.detail_scroll = page, scroll
        self.topbar = TopBar(page)
        self.back = self.topbar.back
        self.back.clicked.connect(self.show_list)
        self.topbar.follow(scroll)
        body = QWidget()
        body.setObjectName('detailBody')
        scroll.setWidget(body)
        outer = QVBoxLayout(body)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)
        self.top_gap = QWidget()
        self.top_gap.setFixedHeight(self.topbar.sizeHint().height())
        outer.addWidget(self.top_gap)
        # Two columns, centred and at most 1240 px wide: the sticky poster and the facts and choices.
        self.hero = ShadowHost()
        self.hero.setObjectName('detailHero')
        self.hero.setMaximumWidth(1240)
        self.hero_layout = QHBoxLayout(self.hero)
        self.hero_layout.setContentsMargins(48, 24, 48, 40)
        self.hero_layout.setSpacing(40)
        outer.addLayout(self._centred(self.hero))
        poster_box = QWidget()
        poster_box.setObjectName('posterColumn')
        column = QVBoxLayout(poster_box)
        column.setContentsMargins(0, 28, 0, 0)
        column.setSpacing(16)
        self.poster = QLabel()
        self.poster.setObjectName('detailPoster')
        self.hero.target = self.poster
        column.addWidget(self.poster)
        self.status_label = self._label('posterStatus', wrap=True)
        column.addWidget(self.status_label)
        self.progress_box = QWidget()
        progress = QVBoxLayout(self.progress_box)
        progress.setContentsMargins(0, 4, 0, 0)
        progress.setSpacing(6)
        meta = QHBoxLayout()
        meta.setSpacing(12)
        self.progress_caption = self._label('progressMeta')
        self.progress_value = self._label('progressMeta')
        meta.addWidget(self.progress_caption, 1)
        meta.addWidget(self.progress_value)
        progress.addLayout(meta)
        self.progress = QProgressBar()
        self.progress.setObjectName('prepBar')
        self.progress.setRange(0, 100)
        self.progress.setTextVisible(False)
        self.progress.setFixedHeight(3)
        progress.addWidget(self.progress)
        column.addWidget(self.progress_box)
        column.addStretch(1)
        self.poster_col = StickyColumn(poster_box)
        self.hero_layout.addWidget(self.poster_col)
        info = QWidget()
        info.setObjectName('detailInfo')
        info_layout = QVBoxLayout(info)
        # 0.2.0: the poster column's 28 px top and a body at least as tall as the poster (adapt): the facts
        # go up, the card of choices and actions goes down and ends on the poster's bottom line.
        info_layout.setContentsMargins(32, 28, 32, 28)
        info_layout.setSpacing(0)
        self.info_body = QWidget()
        self.info_body.setObjectName('detailInfoBody')
        info_layout.addWidget(self.info_body)
        info_layout.addStretch(1)
        v = QVBoxLayout(self.info_body)
        v.setContentsMargins(0, 0, 0, 0)
        v.setSpacing(0)
        self.meta_label = self._label('detailMeta', wrap=True)
        self.title_label = TextBlock('detailName', 1.06)
        self.tagline_label = TextBlock('tagline', 1.4)
        for widget in (self.meta_label, self.title_label, self.tagline_label):
            v.addWidget(widget)
        self.badges = QWidget()
        badges = QHBoxLayout(self.badges)
        badges.setContentsMargins(0, 16, 0, 0)
        badges.setSpacing(10)
        self.rating_value = self._label('ratingValue')
        self.rating_source = self._label('sourceTag')
        self.rating_source.setText('TMDB')
        rating = QHBoxLayout()
        rating.setSpacing(6)  # The score and its source sit 6 px apart, the other badges 10 px.
        rating.addWidget(self.rating_value)
        rating.addWidget(self.rating_source, 0, Qt.AlignmentFlag.AlignVCenter)
        badges.addLayout(rating)
        self.status_badge = self._label('statusBadge')
        badges.addWidget(self.status_badge, 0, Qt.AlignmentFlag.AlignVCenter)
        badges.addStretch(1)
        v.addWidget(self.badges)
        self.duration_label = self._label('durationGenres', wrap=True)
        v.addWidget(self.duration_label)
        v.addStretch(1)
        v.addSpacing(24)
        # The card of choices and actions: watch / library, the chosen release, quality, language and audio.
        self.controls = QFrame()
        self.controls.setObjectName('detailControls')
        controls = QVBoxLayout(self.controls)
        controls.setContentsMargins(24, 20, 24, 20)
        controls.setSpacing(0)
        v.addWidget(self.controls)
        self.actions = QWidget()
        actions = QHBoxLayout(self.actions)
        actions.setContentsMargins(0, 0, 0, 0)
        actions.setSpacing(12)
        self.action_button = QPushButton()
        self.action_button.setObjectName('watch')
        self.action_button.setProperty('hero', True)
        self.action_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self.action_button.setFixedHeight(56)
        self.action_button.setMinimumWidth(160)
        self.action_button.setIconSize(QSize(20, 20))
        self.action_button.clicked.connect(self.act)
        actions.addWidget(self.action_button)
        self.library_button = QPushButton()
        self.library_button.setObjectName('iconBtn')
        self.library_button.setCheckable(True)
        self.library_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self.library_button.setFixedSize(56, 56)
        self.library_button.setIconSize(QSize(22, 22))
        self.library_button.clicked.connect(self.toggle_library)
        actions.addWidget(self.library_button)
        actions.addStretch(1)
        controls.addWidget(self.actions)
        self.selected_label = self._label('selectedInfo', wrap=True)
        controls.addWidget(self.selected_label)
        self.pickers = QWidget()
        pickers = QVBoxLayout(self.pickers)
        pickers.setContentsMargins(0, 16, 0, 0)
        pickers.setSpacing(16)
        self.quality_section, self.quality_caption, self.quality_row = self._picker(pickers)
        self.quality_buttons = {}
        for quality in QUALITIES:
            self.quality_buttons[quality] = self._option(quality, lambda _=False, q=quality: self.pick_quality(q))
            self.quality_row.addWidget(self.quality_buttons[quality])
        self.language_section, self.language_caption, self.language_row = self._picker(pickers)
        self.language_buttons = {}
        for lang in LANGUAGES:
            button = self._option(LANGUAGE_LABELS[lang], lambda _=False, l=lang: self.pick_language(l))
            button.setIcon(QIcon(flag(lang)))
            button.setIconSize(QSize(18, 12))
            self.language_buttons[lang] = button
            self.language_row.addWidget(button)
        # 0.2.0: one «Аудио» button next to the languages instead of a row of voice-overs (AudioTrackDialog).
        self.audio_button = QPushButton()
        self.audio_button.setObjectName('audioButton')
        self.audio_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self.audio_button.clicked.connect(self.open_audio_dialog)
        self.language_row.addWidget(self.audio_button)
        self.episode_box, self.episode_caption, episode_row = self._picker(pickers)
        self.season_combo = FilterCombo()
        self.episode_combo = FilterCombo()
        for combo, width in ((self.season_combo, 150), (self.episode_combo, 130)):
            combo.setObjectName('detailCombo')
            combo.setItemDelegate(QStyledItemDelegate(combo))
            combo.setCursor(Qt.CursorShape.PointingHandCursor)
            combo.setMinimumWidth(width)
            episode_row.addWidget(combo)
        self.season_combo.activated.connect(self.pick_season)
        self.episode_combo.activated.connect(self.pick_episode)
        controls.addWidget(self.pickers)
        self.hint_label = self._label('detailHint', wrap=True)
        controls.addWidget(self.hint_label)
        self.hero_layout.addWidget(info, 1)
        # «О фильме» (overview ≤ 720 px, release / studio / budget chips), the director and «В ролях».
        self.details = QWidget()
        self.details.setObjectName('detailDetails')
        self.details.setMaximumWidth(1240)
        self.details_layout = QVBoxLayout(self.details)
        self.details_layout.setContentsMargins(48, 32, 48, 80)
        self.details_layout.setSpacing(32)
        outer.addLayout(self._centred(self.details))
        outer.addStretch(1)
        self.about = QWidget()
        about = QVBoxLayout(self.about)
        about.setContentsMargins(0, 0, 0, 0)
        about.setSpacing(0)
        self.about_caption = self._label('sectionCaption')
        about.addWidget(self.about_caption)
        self.overview_label = TextBlock('overview', 1.7)
        self.overview_label.setMaximumWidth(720)
        about.addWidget(self.overview_label)
        self.chips = QWidget()
        self.chips_box = FlowLayout(self.chips, 8, 8)
        self.chips_box.setContentsMargins(0, 10, 0, 0)
        self.chip_items = None
        about.addWidget(self.chips)
        self.details_layout.addWidget(self.about)
        self.directors_section, self.directors_caption, self.director_strip = self._people_section()
        self.cast_section, self.cast_caption, self.cast_strip = self._people_section()
        self.director_people = self.cast_people = None
        self.about.hide()
        self.stack.addWidget(page)
        smooth(scroll)
        scroll.verticalScrollBar().valueChanged.connect(self.on_detail_scroll)
        self.adapt()

    @staticmethod
    def _centred(widget):
        """A row that keeps ``widget`` centred once it reaches its maximum width (CSS margin: 0 auto)."""
        row = QHBoxLayout()
        row.setContentsMargins(0, 0, 0, 0)
        row.setSpacing(0)
        row.addStretch(1)
        row.addWidget(widget, 10000)
        row.addStretch(1)
        return row

    def _picker(self, box):
        """«КАЧЕСТВО»-style caption over a wrapping row of options."""
        section = QWidget()
        layout = QVBoxLayout(section)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(8)
        caption = self._label('pickerLabel')
        layout.addWidget(caption)
        row = QWidget()
        flow = FlowLayout(row, 6, 6)
        flow.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(row)
        box.addWidget(section)
        return section, caption, flow

    @staticmethod
    def _option(text, handler):
        button = QPushButton(text)
        button.setObjectName('opt')
        button.setCheckable(True)
        button.setCursor(Qt.CursorShape.PointingHandCursor)
        button.clicked.connect(handler)
        return button

    def _people_section(self):
        section = QWidget()
        layout = QVBoxLayout(section)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        caption = self._label('sectionCaption')
        layout.addWidget(caption)
        strip = PeopleStrip()
        layout.addWidget(strip)
        self.details_layout.addWidget(section)
        section.hide()
        return section, caption, strip

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
                            (self.episode_caption, 'СЕРИЯ'), (self.cast_caption, 'В РОЛЯХ')):
            label.setText(self.t(text))
        for lang, button in self.language_buttons.items():
            button.setToolTip(self.t(LANGUAGE_NAMES[lang]))
        self.chip_items = self.director_people = self.cast_people = None
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
        self.pager.setVisible(self.total_pages > 1)

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
        self.close_audio_dialog()
        self.item = {k: row.get(k) for k in ('kind', 'tmdb_id', 'title', 'original_title', 'title_en', 'title_ru', 'year',
                                             'poster', 'rating', 'overview')}
        self.meta, self.meta_loaded, self.backdrop_url = {}, False, ''
        self.view, self.load_failed, self.busy, self.hint = None, False, '', ''
        self.selected_id = prefs.get('source_id') or None
        self.lang = prefs.get('audio_lang') if prefs.get('audio_lang') in LANGUAGES else None
        self.audio_track = None
        tv = row.get('kind') == 'tv' and type(prefs.get('season')) is int and type(prefs.get('episode')) is int
        self.season, self.episode = (prefs['season'], prefs['episode']) if tv else (None, None)
        self.notify('')
        self.stack.setCurrentIndex(1)
        self.render_backdrop()
        smooth(self.detail_scroll).scroll_to(0, animated=False)
        self.art.load(self.item.get('poster'))
        self.adapt()
        self.render_meta()
        self.render()
        self.refresh()
        self.load_meta()
    def show_list(self):
        self.detail_generation += 1
        self.poll.stop()
        self.close_audio_dialog()
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
        self.close_audio_dialog()
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
        self.close_audio_dialog()
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
            for person in people(data.get('director_list'), 4) + people(data.get('cast'), 12):
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

    def title_fields(self):
        """The open title's names completed by its details: a catalogue row may know only «The Terminator»
        while /torrents/detail has «Терминатор»; that one becomes title_ru, so the Russian heading wins."""
        item, meta = self.item or {}, self.meta or {}
        fields = {key: item.get(key) for key in TITLE_KEYS}
        for key in TITLE_KEYS:
            if not (isinstance(fields[key], str) and fields[key].strip()) and isinstance(meta.get(key), str):
                fields[key] = meta[key]
        if not cyrillic(fields['title_ru']) and cyrillic(meta.get('title')):
            fields['title_ru'] = meta['title']
        return fields

    def display_title(self):
        return movie_title(self.title_fields(), self.title_language)

    def choice(self):
        selected, episode = self.selected(), self.current_episode()
        result = {'kind': self.item['kind'], 'tmdb_id': self.item['tmdb_id'],
                  'source_id': (selected or {}).get('source_id'), 'season': episode[0] if episode else None,
                  'episode': episode[1] if episode else None, 'audio_lang': self.audio_language(),
                  'title': self.display_title()}
        track = self.picked_audio_track()
        if track and track.get('index'):
            result['audio_track'] = track['index']  # mpv --aid: only a container number the server knows.
        return result

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
        self.audio_track = None  # A language click starts with that language's first track again.
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

    def toggle_library(self):
        """Bookmark next to «Смотреть»: add the title to «Кинотека» or take it out again."""
        if self.busy or not self.item or self.view is None:
            self.render()
            return
        kind, tmdb_id = self.item['kind'], self.item['tmdb_id']
        if not self.view.get('in_library'):
            self.add_library()
        elif hasattr(self.api, 'remove_from_library'):
            self._run('library', lambda: self.api.remove_from_library(kind, tmdb_id), 'Удалено из кинотеки')
        else:
            self.render()

    # ---------- render ----------
    def back_text(self):
        return self.t('Назад')

    def meta_line(self):
        """«2004–2012, США»: the year (years of a series) and up to two production countries."""
        item, meta = self.item, self.meta
        parts = []
        year = item.get('year') if type(item.get('year')) is int else meta.get('year')
        if type(year) is int:
            end = meta.get('end_year')
            parts.append(f'{year}–{end}' if item['kind'] == 'tv' and type(end) is int and end > year else str(year))
        parts += country_names(meta, self.language, 2)
        return ', '.join(parts).upper()

    def other_title(self):
        """The original (or the other language) title: under the heading and its tooltip."""
        return secondary_title(self.title_fields(), self.title_language)

    def subtitle_text(self):
        """The line under the heading, as on the website: «The Terminator • «Слоган»», or one of them."""
        return ' • '.join(part for part in (self.other_title(), self.tagline_text()) if part)

    def tagline_text(self):
        tagline = self.meta.get('tagline')
        tagline = tagline.strip().strip('«»“”"').strip() if isinstance(tagline, str) else ''
        if not tagline:
            return ''
        return f'“{tagline}”' if self.language == 'en' else f'«{tagline}»'

    def status_badge_text(self):
        status = self.meta.get('status')
        if not isinstance(status, str) or status not in STATUS_LABELS:
            return ''
        return status if self.language == 'en' else STATUS_LABELS[status]

    def duration_text(self):
        """«01:32 • Драма | Комедия», for a series «8 сезонов · 176 серий • Драма»."""
        meta = self.meta
        length = (count_text(meta.get('seasons'), meta.get('episodes'), self.language) if self.item['kind'] == 'tv'
                  else clock_text(meta.get('runtime')))
        genres = ' | '.join(name[:1].upper() + name[1:] for name in names(meta.get('genres'), 4))
        return ' • '.join(part for part in (length, genres) if part)

    def selected_text(self, selected):
        """«✓ Выбрано: 2160p WEB-DL · ▲ 50 сидов · 20,0 ГБ»."""
        if not selected:
            return ''
        seeds = seeds_text(selected.get('seeders'), self.language)
        parts = [source_name(selected), '▲ ' + seeds if seeds else '', size_text(selected.get('size_bytes'), self.language)]
        return '✓ ' + self.t('Выбрано:') + ' ' + ' · '.join(part for part in parts if part)

    def quality_text(self, quality, selected, offered):
        """«1080p WEB-DL»: the bucket with the release type that a click would pick."""
        if selected and selected.get('quality') == quality:
            source = selected
        else:
            source = best_source([s for s in offered if s.get('quality') == quality], language=self.lang,
                                 episode=self.current_episode())
        kind = (source or {}).get('source_type')
        return f'{quality} {kind.strip()}' if isinstance(kind, str) and kind.strip() else quality

    @staticmethod
    def _tone(widget, tone):
        if widget.property('tone') != tone:
            widget.setProperty('tone', tone)
            widget.style().unpolish(widget)
            widget.style().polish(widget)

    @staticmethod
    def _show(label, text):
        label.setText(text)
        label.setVisible(bool(text))

    def render(self):
        if not hasattr(self, 'action_button') or not self.item:
            return
        t = self.t
        self.back.setText(self.back_text())
        self.back.setToolTip(t(self.back_caption) if self.back_caption else '')
        self.title_label.set_text(self.display_title())
        self.title_label.setToolTip(self.other_title())
        self._show(self.meta_label, self.meta_line())
        self.tagline_label.set_text(self.subtitle_text())
        self.tagline_label.setVisible(bool(self.tagline_label.plain))
        rating = self.meta.get('rating') or self.item.get('rating')
        rated = isinstance(rating, (int, float)) and not isinstance(rating, bool) and rating > 0
        self.rating_value.setText(f'{rating:.1f}' if rated else '')
        self.rating_value.setVisible(rated)
        self.rating_source.setVisible(rated)
        self._show(self.status_badge, self.status_badge_text())
        self.badges.setVisible(rated or bool(self.status_badge.text()))
        self._show(self.duration_label, self.duration_text())
        selected = self.selected()
        state = progress_state(self.view, selected)
        ready = bool(state) and state[0] in ('playable', 'partial')
        active = bool(state) and state[0] in IN_PROGRESS and not state[3]
        self._show(self.status_label, status_text(state, self.language))
        self._tone(self.status_label, 'ready' if ready else 'loading')
        self.progress_box.setVisible(active)
        if active:
            percent = max(0, min(100, int(state[1])))
            label = PREP_LABELS.get(state[0], '')
            self.progress_caption.setText(EN.get(label, label) if self.language == 'en' else label)
            self.progress_value.setText(f'{percent}%')
            self.progress.setValue(percent)
        self._show(self.selected_label, self.selected_text(selected))
        self.selected_label.setToolTip(str((selected or {}).get('title') or ''))
        offered = [s for s in self.sources() if s.get('state') != 'failed']
        qualities = {s.get('quality') for s in offered}
        languages = {lang for s in offered for lang in s.get('languages') or []}
        audio = self.audio_language()
        shown = False
        for quality, button in self.quality_buttons.items():
            checked = bool(selected) and selected.get('quality') == quality
            button.setText(self.quality_text(quality, selected, offered))
            button.setVisible(quality in qualities or checked)
            button.setEnabled(quality in qualities and not self.busy)
            button.setChecked(checked)
            shown = shown or quality in qualities or checked
        self.quality_section.setVisible(shown)
        shown = False
        for lang, button in self.language_buttons.items():
            button.setVisible(lang in languages or audio == lang)
            button.setEnabled(lang in languages and not self.busy)
            button.setChecked(audio == lang)
            shown = shown or lang in languages or audio == lang
        tracks = self._render_audio()
        self.language_section.setVisible(shown or bool(tracks))
        self._render_episodes()
        self.pickers.setVisible(any(not w.isHidden() for w in (self.quality_section, self.language_section,
                                                              self.episode_box)))
        action = self.action()
        text = t('Подождите…') if self.busy else t(ACTION_TEXT[action])
        episode = self.current_episode()
        if action == 'launch' and episode and not self.busy:
            text += (f' · S{episode[0]} E{episode[1]}' if self.language == 'en'
                     else f' · {episode[0]} сезон, {episode[1]} серия')
        enabled = action in ACTIONABLE and not self.busy
        glyph = None if self.busy else ACTION_ICONS.get(action)
        self.action_button.setText(text)
        self.action_button.setIcon(icon(glyph, '#11120e', 20, fill='#11120e' if glyph == 'play' else 'none') if glyph else QIcon())
        self.action_button.setEnabled(enabled)
        name = 'watch' if action == 'launch' else 'primary'
        if self.action_button.objectName() != name:
            self.action_button.setObjectName(name)
            self.action_button.style().unpolish(self.action_button)
            self.action_button.style().polish(self.action_button)
        saved = bool((self.view or {}).get('in_library'))
        self.library_button.setVisible(self.view is not None)
        self.library_button.setChecked(saved)
        self.library_button.setEnabled(not self.busy)
        self.library_button.setIcon(icon('bookmark-check' if saved else 'bookmark', '#ffd24d' if saved else '#c9ced6', 22))
        self.library_button.setToolTip(t('Убрать из кинотеки') if saved else t('Добавить в кинотеку'))
        self.library_button.setAccessibleName(self.library_button.toolTip())
        self._show(self.hint_label, t(self.hint))
        self.poster_col.refresh()
        self.on_detail_scroll()

    # ---------- audio ----------
    def offered_tracks(self):
        """The audio of the selected release for AudioTrackDialog, grouped RU, UA, EN."""
        return audio_tracks(self.selected())

    def picked_audio_track(self, tracks=None):
        """The dialog's pick while the selected release and the audio language still have it; else None."""
        chosen = (self.audio_track or {}).get('id')
        if not chosen:
            return None
        tracks = self.offered_tracks() if tracks is None else tracks
        hit = next((track for track in tracks if track['id'] == chosen), None)
        return hit if hit and hit['language'] == self.audio_language() else None

    def current_audio_track(self, tracks=None):
        """The start track: the dialog's pick, else the first track of the audio language."""
        tracks = self.offered_tracks() if tracks is None else tracks
        language = self.audio_language()
        return (self.picked_audio_track(tracks) or next((t for t in tracks if t['language'] == language), None)
                or (tracks[0] if tracks else None))

    def _render_audio(self):
        """«Аудио: Дубляж» for a pick (or the only track), else «Аудио: 4 дорожки»; hidden without audio."""
        tracks = self.offered_tracks()
        button = self.audio_button
        button.setVisible(bool(tracks))
        if not tracks:
            return tracks
        picked = self.picked_audio_track(tracks) or (tracks[0] if len(tracks) == 1 else None)
        name = self.t(picked['label']) if picked else track_count_text(len(tracks), self.language)
        button.setText(self.t('Аудио:') + ' ' + name)
        if picked:
            button.setIcon(QIcon(flag(picked['language'])))
            button.setIconSize(QSize(18, 12))
        else:
            button.setIcon(icon('audio-lines', '#ffd24d', 16))
            button.setIconSize(QSize(16, 16))
        button.setEnabled(not self.busy)
        button.setToolTip(self.t('Выбор аудиодорожки'))
        button.setAccessibleName(button.text())
        return tracks

    def open_audio_dialog(self):
        """«Аудио»: the centred track dialog (window-modal, non-blocking); the pick returns via trackChosen."""
        tracks = self.offered_tracks()
        if not tracks or self.busy:
            return None
        self.close_audio_dialog()
        selected = self.selected()
        caption = ' · '.join(part for part in (source_name(selected) if selected else '',
                                               track_count_text(len(tracks), self.language)) if part)
        dialog = AudioTrackDialog(self, tracks, self.current_audio_track(tracks), caption)
        dialog.trackChosen.connect(self.apply_audio_track)
        dialog.finished.connect(lambda _=0, d=dialog: self._audio_dialog_closed(d))
        self.audio_dialog = dialog
        dialog.open()
        return dialog

    def _audio_dialog_closed(self, dialog):
        if self.audio_dialog is dialog:
            self.audio_dialog = None
        dialog.deleteLater()

    def close_audio_dialog(self):
        dialog, self.audio_dialog = self.audio_dialog, None
        if dialog is not None:
            dialog.reject()

    def apply_audio_track(self, track):
        """The dialog's pick becomes the start track of this release; nothing is prepared again."""
        if not isinstance(track, dict) or track.get('language') not in LANGUAGES or not track.get('id'):
            return
        self.audio_track = {key: track.get(key) for key in ('id', 'language', 'label', 'index')}
        self.lang = track['language']
        self.render()

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

    def chip_texts(self):
        """«Релиз: 19.09.2005», up to three studios, «Бюджет: $120M» (films)."""
        meta, t = self.meta, self.t
        chips = []
        released = date_text(meta.get('release_date'), self.language)
        if released:
            chips.append(t('Релиз:') + ' ' + released)
        chips += names(meta.get('studios'), 3)
        budget = money_text(meta.get('budget')) if self.item['kind'] == 'movie' else ''
        if budget:
            chips.append(t('Бюджет:') + ' ' + budget)
        return chips

    def render_meta(self):
        """«О фильме / О сериале» with its chips, the director (creator) cards and «В ролях»."""
        if not hasattr(self, 'chips_box') or not self.item:
            return
        t, meta, item = self.t, self.meta, self.item
        overview = meta.get('overview') or item.get('overview')
        overview = overview.strip() if isinstance(overview, str) else ''
        self.about_caption.setText(t('О СЕРИАЛЕ') if item['kind'] == 'tv' else t('О ФИЛЬМЕ'))
        self.overview_label.set_text(overview or t('Описание на русском языке пока недоступно.'))
        chips = self.chip_texts()
        if chips != self.chip_items:
            self.chip_items = chips
            self._clear(self.chips_box)
            for text in chips:
                chip = self._label('detailChip')
                chip.setText(text)
                self.chips_box.addWidget(chip)
            self.chips_box.invalidate()
        self.chips.setVisible(bool(chips))
        self.about.setVisible(bool(overview or chips or self.meta_loaded))
        self.render_people()
        self.render_art()
        self.adapt()

    def render_people(self):
        meta, t, tv = self.meta, self.t, self.item['kind'] == 'tv'
        directors = people(meta.get('director_list'), 4) or [{'name': name} for name in names(meta.get('directors'), 4)]
        role = t('Создатель') if tv else t('Режиссёр')
        many = t('Создатели') if tv else t('Режиссёры')
        self.directors_caption.setText((many if len(directors) > 1 else role).upper())
        key = [(p['name'], p.get('photo')) for p in directors] + [role]
        if key != self.director_people:
            self.director_people = key
            self.director_strip.set_cards([self._person(p, role) for p in directors])
        self.directors_section.setVisible(bool(directors))
        cast = people(meta.get('cast'), 12)
        key = [(p['name'], p.get('character'), p.get('photo')) for p in cast]
        if key != self.cast_people:
            self.cast_people = key
            self.cast_strip.set_cards([self._person(p, p.get('character') if isinstance(p.get('character'), str) else '')
                                       for p in cast])
        self.cast_section.setVisible(bool(cast))

    @property
    def cast_cards(self):
        return self.cast_strip.cards

    def _person(self, person, role):
        card = PersonCard()
        card.set_person(person, role)
        return card

    def render_art(self):
        if not hasattr(self, 'poster') or not self.item:
            return
        width, height = self.poster_size
        if width:
            source = self.art.get(self.item.get('poster') or self.meta.get('poster'))
            self.poster.setPixmap(rounded(source, width, height, 10))
        for card in self.director_strip.cards + self.cast_strip.cards:
            card.set_photo(self.art.get(card.photo_url))

    def render_backdrop(self):
        """The title backdrop behind the whole window, as the website hero; only on the title page."""
        shown = bool(self.item) and self.stack.currentIndex() == 1 and bool(self.backdrop_url)
        pixmap = self.backdrop_art.get(self.backdrop_url) if shown else None
        self.backdropChanged.emit(pixmap if pixmap is not None and not pixmap.isNull() else None)

    def on_detail_scroll(self, *_):
        """The top bar darkens once the page moves; the poster sticks under it (CSS position: sticky)."""
        if not hasattr(self, 'poster_col'):
            return
        self.topbar.set_strength(self.detail_scroll.verticalScrollBar().value() / 48)
        before = self.poster_col.offset
        top = self.hero.mapFrom(self.detail_scroll.viewport(), QPoint(0, 0)).y()
        self.poster_col.stick(top, max(0, self.topbar.height() - 10))
        if self.poster_col.offset != before:
            self.hero.update(self.poster_col.geometry().adjusted(-64, -64, 64, 96))  # Its soft shadow moves too.

    def adapt(self):
        """Website breakpoints by the page width: up to 900 px a 180 px poster and tighter padding."""
        if not hasattr(self, 'poster'):
            return
        width = max(1, self.width())
        narrow = width <= 900
        if narrow != self.narrow:
            self.narrow = narrow
            self.hero_layout.setContentsMargins(*((24, 16, 24, 40) if narrow else (48, 24, 48, 40)))
            self.hero_layout.setSpacing(28 if narrow else 40)
            self.details_layout.setContentsMargins(*((24, 32, 24, 48) if narrow else (48, 32, 48, 80)))
            self.topbar.set_padding(10 if narrow else 16, 24 if narrow else 40)
            self.top_gap.setFixedHeight(self.topbar.sizeHint().height())
            column = 180 if narrow else 340
            self.poster_size = (column, column * 3 // 2)
            self.poster.setFixedSize(*self.poster_size)
            self.poster_col.setFixedWidth(column)
            self.info_body.setMinimumHeight(self.poster_size[1])  # The card of choices ends on the poster's line.
            self.render_art()
        # font-size: clamp(2.2rem, 4vw, 3.4rem); up to 900 px clamp(1.6rem, 5vw, 2.4rem).
        size = round(max(25.6, min(38.4, width * .05)) if narrow else max(35.2, min(54.4, width * .04)))
        if size != self.title_px:
            self.title_px = size
            self.title_label.setStyleSheet(f'font-size:{size}px;letter-spacing:{-round(size * .02, 1)}px;')
        self.poster_col.refresh()
        self.on_detail_scroll()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.adapt()

    def showEvent(self, event):
        super().showEvent(event)
        if self.item and self.stack.currentIndex() == 1 and self.view is not None and in_flight(self.view):
            self.refresh()
