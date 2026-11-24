"""KINOSOTA series from the Telegram streams (0.2.3), as on the website series page.

The card in «Сериалы» opens this page: backdrop, poster, facts, season and episode choice and
«Смотреть». The episode is started with /series_playback/start by the window (intro, pre-roll and
the seamless start of the existing cinema engine); this page only loads /series/{id} and reports
the chosen episode with ``playRequested``.
"""
from PySide6.QtCore import QPoint, QSize, Qt, Signal
from PySide6.QtWidgets import (QFrame, QHBoxLayout, QLabel, QPushButton, QScrollArea, QSizePolicy, QStyledItemDelegate,
                               QVBoxLayout, QWidget)
from .api import API_ORIGIN, ApiError
from .artwork import Sink, rounded
from .catalog import Posters
from .filters import FilterCombo
from .icons import icon
from .motion import smooth
from .preferences import movie_title, secondary_title, translate
from .title_widgets import ShadowHost, TextBlock, TopBar


def episode_label(episode, t=lambda text: text):
    number = episode.get('episode_number')
    title = ' '.join(str(episode.get('title') or '').split())
    head = f"{t('Серия')} {number}" if type(number) is int else t('Серия')
    return f'{head} · {title}' if title and title.casefold() != head.casefold() else head


def seasons_of(detail):
    """Seasons with at least one episode, ordered by number; episodes ordered by number."""
    seasons = []
    for season in (detail.get('seasons') if isinstance(detail, dict) else None) or []:
        if not isinstance(season, dict) or type(season.get('season_number')) is not int:
            continue
        episodes = sorted((e for e in season.get('episodes') or [] if isinstance(e, dict) and e.get('id')
                           and type(e.get('episode_number')) is int), key=lambda e: e['episode_number'])
        if episodes:
            seasons.append({**season, 'episodes': episodes})
    return sorted(seasons, key=lambda s: s['season_number'])


class SeriesPage(QWidget):
    """«Сериалы» → KINOSOTA series → season, episode → mpv (via the window)."""
    playRequested = Signal(dict)
    backdropChanged = Signal(object)

    def __init__(self, api, work, show_error, language='ru', title_language='ru', parent=None):
        super().__init__(parent)
        self.setObjectName('seriesPage')
        self.api, self.work, self.show_error = api, work, show_error
        self.language, self.title_language = language, title_language
        self.item, self.detail, self.seasons = None, {}, []
        self.season = self.episode = None
        self.generation, self.loading, self.failed, self.busy = 0, False, False, False
        self.return_to, self.back_caption, self.poster_size = None, None, (260, 390)
        origin = getattr(api, 'origin', API_ORIGIN)
        self.art = Posters(Sink(self, self.render_art), origin)
        self.backdrop_art = Posters(Sink(self, self.render_backdrop), origin, size=(1280, 720))
        self._build()
        self.retranslate(language)

    def t(self, text):
        return translate(text, self.language)

    # ---------- layout ----------
    def _label(self, name, wrap=False):
        label = QLabel()
        label.setObjectName(name)
        label.setWordWrap(wrap)
        label.setTextFormat(Qt.TextFormat.PlainText)
        return label

    def _build(self):
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        scroll = QScrollArea()
        scroll.setObjectName('detailScroll')
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        outer.addWidget(scroll)
        self.scroll = scroll
        self.topbar = TopBar(self)
        self.back = self.topbar.back
        self.back.clicked.connect(self.go_back)
        self.topbar.follow(scroll)
        body = QWidget()
        body.setObjectName('detailBody')
        scroll.setWidget(body)
        column = QVBoxLayout(body)
        column.setContentsMargins(0, 0, 0, 0)
        column.setSpacing(0)
        column.addSpacing(self.topbar.sizeHint().height())
        self.hero = ShadowHost()
        self.hero.setObjectName('detailHero')
        self.hero.setMaximumWidth(1240)
        hero = QHBoxLayout(self.hero)
        hero.setContentsMargins(48, 24, 48, 40)
        hero.setSpacing(40)
        row = QHBoxLayout()
        row.addStretch(1)
        row.addWidget(self.hero, 100)
        row.addStretch(1)
        column.addLayout(row)
        column.addStretch(1)
        self.poster = QLabel()
        self.poster.setObjectName('detailPoster')
        self.poster.setFixedSize(*self.poster_size)
        self.hero.target = self.poster
        hero.addWidget(self.poster, 0, Qt.AlignmentFlag.AlignTop)
        info = QWidget()
        info.setObjectName('detailInfo')
        info.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        v = QVBoxLayout(info)
        v.setContentsMargins(8, 12, 8, 12)
        v.setSpacing(0)
        self.meta_label = self._label('detailMeta', wrap=True)
        self.title_label = TextBlock('detailName', 1.06)
        self.original_label = TextBlock('tagline', 1.4)
        for widget in (self.meta_label, self.title_label, self.original_label):
            v.addWidget(widget)
        badges = QHBoxLayout()
        badges.setContentsMargins(0, 16, 0, 0)
        badges.setSpacing(6)
        self.rating_value = self._label('ratingValue')
        self.source_tag = self._label('sourceTag')
        self.source_tag.setText('KINOSOTA')
        badges.addWidget(self.rating_value)
        badges.addWidget(self.source_tag, 0, Qt.AlignmentFlag.AlignVCenter)
        badges.addStretch(1)
        v.addLayout(badges)
        self.genres_label = self._label('durationGenres', wrap=True)
        v.addWidget(self.genres_label)
        v.addSpacing(24)
        self.controls = QFrame()
        self.controls.setObjectName('detailControls')
        controls = QVBoxLayout(self.controls)
        controls.setContentsMargins(24, 20, 24, 20)
        controls.setSpacing(14)
        actions = QHBoxLayout()
        actions.setSpacing(12)
        self.watch_button = QPushButton()
        self.watch_button.setObjectName('watch')
        self.watch_button.setProperty('hero', True)
        self.watch_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self.watch_button.setFixedHeight(56)
        self.watch_button.setMinimumWidth(160)
        self.watch_button.setIcon(icon('play', '#101010', 20))
        self.watch_button.setIconSize(QSize(20, 20))
        self.watch_button.clicked.connect(self.watch)
        actions.addWidget(self.watch_button)
        actions.addStretch(1)
        controls.addLayout(actions)
        self.episode_caption = self._label('pickerCaption')
        controls.addWidget(self.episode_caption)
        pickers = QHBoxLayout()
        pickers.setSpacing(10)
        self.season_combo, self.episode_combo = FilterCombo(), FilterCombo()
        for combo, width in ((self.season_combo, 150), (self.episode_combo, 260)):
            combo.setObjectName('detailCombo')
            combo.setItemDelegate(QStyledItemDelegate(combo))
            combo.setCursor(Qt.CursorShape.PointingHandCursor)
            combo.setMinimumWidth(width)
            combo.setMaxVisibleItems(10)
            pickers.addWidget(combo)
        pickers.addStretch(1)
        self.season_combo.activated.connect(self.pick_season)
        self.episode_combo.activated.connect(self.pick_episode)
        controls.addLayout(pickers)
        self.hint_label = self._label('detailHint', wrap=True)
        controls.addWidget(self.hint_label)
        v.addWidget(self.controls)
        v.addSpacing(28)
        self.about_caption = self._label('sectionCaption')
        v.addWidget(self.about_caption)
        self.overview_label = TextBlock('overview', 1.7)
        self.overview_label.setMaximumWidth(720)
        v.addWidget(self.overview_label)
        v.addStretch(1)
        hero.addWidget(info, 1)
        smooth(scroll)
        scroll.verticalScrollBar().valueChanged.connect(
            lambda value: self.topbar.set_strength(value / 48))

    # ---------- data ----------
    def open_series(self, row):
        """Show the card at once from the catalogue row, then fill seasons from /series/{id}."""
        self.generation += 1
        generation = self.generation
        self.item = dict(row or {})
        self.detail, self.seasons, self.season, self.episode = {}, [], None, None
        self.loading, self.failed, self.busy = True, False, False
        self.scroll.verticalScrollBar().setValue(0)
        self.art.load(self.item.get('poster_url') or self.item.get('poster'))
        self.render()

        def done(detail):
            if generation == self.generation:
                self.loaded(detail)

        def failed(error):
            if generation != self.generation:
                return
            self.loading, self.failed = False, True
            self.render()
            if isinstance(error, ApiError) and error.status == 401:
                self.show_error(error)
            else:
                self.show_error(error if isinstance(error, ApiError) else ApiError(0, '', 'Не удалось загрузить сериал.'))

        series_id = self.item.get('id')
        self.work(lambda: self.api.series_detail(series_id), done, failed)

    def loaded(self, detail):
        self.loading, self.failed = False, False
        self.detail = detail if isinstance(detail, dict) else {}
        self.item = {**self.item, **{k: v for k, v in self.detail.items() if k != 'seasons' and v not in (None, '')}}
        self.seasons = seasons_of(self.detail)
        first = next((s for s in self.seasons if any(e.get('is_playable', True) for e in s['episodes'])),
                     self.seasons[0] if self.seasons else None)
        self.season = first['season_number'] if first else None
        self.episode = self._first_episode(first)
        self.art.load(self.item.get('poster_url') or self.item.get('poster'))
        self.backdrop_art.load(self.detail.get('backdrop_url'))
        self.render()
        self.render_backdrop()

    @staticmethod
    def _first_episode(season):
        if not season:
            return None
        episode = next((e for e in season['episodes'] if e.get('is_playable', True)), season['episodes'][0])
        return episode.get('id')

    def current_season(self):
        return next((s for s in self.seasons if s['season_number'] == self.season), None)

    def current_episode(self):
        season = self.current_season()
        return next((e for e in season['episodes'] if e.get('id') == self.episode), None) if season else None

    def next_episode(self):
        """The episode after the current one, across seasons (for «следующая серия»)."""
        flat = [(s, e) for s in self.seasons for e in s['episodes']]
        for i, (season, episode) in enumerate(flat):
            if episode.get('id') == self.episode and i + 1 < len(flat):
                return flat[i + 1]
        return None

    # ---------- choices ----------
    def pick_season(self, index):
        number = self.season_combo.itemData(index)
        if number == self.season:
            return
        self.season = number
        self.episode = self._first_episode(self.current_season())
        self.render()

    def pick_episode(self, index):
        self.episode = self.episode_combo.itemData(index)
        self.render()

    def set_busy(self, busy):
        self.busy = bool(busy)
        self.render_action()

    def watch(self):
        episode = self.current_episode()
        if self.busy or not episode or not episode.get('is_playable', True):
            return
        self.playRequested.emit({'series': dict(self.item), 'season': self.season, 'episode': dict(episode)})

    def go_back(self):
        self.generation += 1
        self.backdropChanged.emit(None)
        if callable(self.return_to):
            self.return_to()

    def reset(self):
        self.generation += 1
        self.item, self.detail, self.seasons, self.season, self.episode = None, {}, [], None, None
        self.loading = self.failed = self.busy = False
        self.art.clear()
        self.backdrop_art.clear()
        self.backdropChanged.emit(None)

    # ---------- presentation ----------
    def render(self):
        item = self.item or {}
        self.title_label.set_text(movie_title(item, self.title_language) if item else '')
        original = secondary_title(item, self.title_language) if item else ''
        self.original_label.set_text(original)
        self.original_label.setVisible(bool(original))
        facts = [str(item['year'])] if type(item.get('year')) is int else []
        facts.append(self.t('Сериал'))
        if self.seasons:
            facts.append(f"{self.t('Сезонов')}: {len(self.seasons)}")
        self.meta_label.setText(' · '.join(facts))
        rating = item.get('rating')
        self.rating_value.setText(f'★ {float(rating):.1f}' if isinstance(rating, (int, float)) and rating > 0 else '')
        self.rating_value.setVisible(bool(self.rating_value.text()))
        genres = [g.get('name') for g in item.get('genres') or [] if isinstance(g, dict) and g.get('name')]
        self.genres_label.setText(', '.join(genres))
        self.genres_label.setVisible(bool(genres))
        overview = ' '.join(str(item.get('overview') or '').split())
        self.overview_label.set_text(overview)
        self.about_caption.setVisible(bool(overview))
        self.overview_label.setVisible(bool(overview))
        self.season_combo.clear()
        for season in self.seasons:
            number = season['season_number']
            self.season_combo.addItem(f"{self.t('Сезон')} {number}" if number else self.t('Спецвыпуски'), number)
        self.season_combo.setCurrentIndex(max(0, self.season_combo.findData(self.season)))
        self.episode_combo.clear()
        season = self.current_season()
        for episode in (season['episodes'] if season else []):
            text = episode_label(episode, self.t)
            if not episode.get('is_playable', True):
                text += f" · {self.t('недоступна')}"
            self.episode_combo.addItem(text, episode.get('id'))
        self.episode_combo.setCurrentIndex(max(0, self.episode_combo.findData(self.episode)))
        has = bool(self.seasons)
        self.season_combo.setVisible(has)
        self.episode_combo.setVisible(has)
        self.episode_caption.setVisible(has)
        self.season_combo.setEnabled(len(self.seasons) > 1)
        self.render_action()
        self.render_art()

    def render_action(self):
        episode = self.current_episode()
        playable = bool(episode) and episode.get('is_playable', True)
        if self.loading:
            text, hint = 'Загружаем…', ''
        elif self.failed:
            text, hint = 'Повторить', 'Не удалось загрузить сериал.'
        elif not self.seasons:
            text, hint = 'Смотреть', 'Серии этого сериала ещё загружаются. Загляните позже.'
        elif not playable:
            text, hint = 'Смотреть', 'Эта серия пока недоступна.'
        elif self.busy:
            text, hint = 'Запускаем…', ''
        else:
            text, hint = 'Смотреть', ''
        self.watch_button.setText(self.t(text))
        self.watch_button.setEnabled(self.failed or (playable and not self.busy and not self.loading))
        try:
            self.watch_button.clicked.disconnect()
        except (RuntimeError, TypeError):
            pass
        self.watch_button.clicked.connect(self.retry if self.failed else self.watch)
        self.hint_label.setText(self.t(hint))
        self.hint_label.setVisible(bool(hint))

    def retry(self):
        if self.item:
            self.open_series(self.item)

    def render_art(self):
        item = self.item or {}
        width, height = self.poster_size
        self.poster.setPixmap(rounded(self.art.get(item.get('poster_url') or item.get('poster')), width, height, 10,
                                      max(2.0, self.devicePixelRatioF())))
        self.hero.update()

    def render_backdrop(self):
        url = self.detail.get('backdrop_url') if isinstance(self.detail, dict) else None
        pixmap = self.backdrop_art.get(url) if url and self.isVisible() else None
        self.backdropChanged.emit(pixmap if pixmap is not None and not pixmap.isNull() else None)

    def retranslate(self, language):
        self.language = language
        self.back.setText(self.t(self.back_caption or 'Сериалы'))
        self.episode_caption.setText(self.t('Серия'))
        self.about_caption.setText(self.t('О сериале'))
        self.render()

    def set_title_language(self, language):
        self.title_language = language
        self.render()

    def set_back_caption(self, caption):
        self.back_caption = caption
        self.back.setText(self.t(caption or 'Сериалы'))

    def shutdown(self):
        self.generation += 1
        self.art.clear()
        self.backdrop_art.clear()
