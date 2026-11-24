"""0.2.3: KINOSOTA Telegram series, the year drum, rounded popups and crisp HiDPI painting."""
import os
os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')
import json
import httpx
import pytest
from PySide6.QtCore import QPoint, QPointF, Qt
from PySide6.QtGui import QImage, QPixmap, QWheelEvent
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication
from kinosota_player.api import Api, ApiError
from kinosota_player.browse import Genres, default_state, fetch_page
from kinosota_player.catalog import TileDelegate, crisp, meta_text
from kinosota_player.filters import (DRUM_ROW, DRUM_ROWS, FilterBar, FilterCombo, FilterYearButton, StickyMenu,
                                     YearDrumWidget, YearWheelPopup, year_values)
from kinosota_player.hidpi import POLICY, configure_high_dpi
from kinosota_player.series import episode_label, seasons_of
from test_filters import CatalogApi, Engine, SITE, MOVIE, TV, signed, state, sync

SERIES_ID = '11111111-1111-4111-8111-111111111111'
EP1 = '22222222-2222-4222-8222-222222222221'
EP2 = '22222222-2222-4222-8222-222222222222'
EP3 = '22222222-2222-4222-8222-222222222223'
DETAIL = {'id': SERIES_ID, 'title': 'Сериал 1', 'year': 2024, 'overview': 'О сериале.', 'backdrop_url': None,
          'rating': 8.1, 'genres': [{'slug': 'boevik', 'name': 'боевик'}],
          'seasons': [{'id': 's2', 'season_number': 2, 'episodes': [{'id': EP3, 'episode_number': 1, 'title': 'Новая глава'}]},
                      {'id': 's1', 'season_number': 1, 'episodes': [
                          {'id': EP2, 'episode_number': 2, 'title': None, 'is_playable': True},
                          {'id': EP1, 'episode_number': 1, 'title': 'Пилот', 'is_playable': True}]}]}


def app():
    return QApplication.instance() or QApplication([])


def api_with(handler):
    return Api('https://watch.scenrix.com', transport=httpx.MockTransport(handler))


# ---------- API ----------
def test_series_methods_follow_the_backend_contract():
    seen = []

    def handler(request):
        seen.append(request)
        if request.url.path == '/api/v1/series_playback/start':
            return httpx.Response(200, json={'media_url': 'https://node.scenrix.com/s/abc', 'playback_token': 't'})
        return httpx.Response(200, json={'items': [], 'total': 0, 'total_pages': 0} if request.url.path == '/api/v1/series' else DETAIL)

    api = api_with(handler)
    api.series(page=2, query='дом', genres=['boevik', 'detektiv'], year_from=2024, year_to=2010, min_rating=7, sort='rating')
    params = dict(seen[-1].url.params)
    assert seen[-1].url.path == '/api/v1/series' and params == {
        'page': '2', 'page_size': '30', 'sort': 'rating_desc', 'q': 'дом', 'genre': 'boevik',
        'year_from': '2010', 'year_to': '2024', 'min_rating': '7.0'}
    assert api.series_detail(SERIES_ID)['title'] == 'Сериал 1' and seen[-1].url.path == f'/api/v1/series/{SERIES_ID}'
    data = api.start_series_playback(EP1)
    assert data['media_url'].startswith('https://') and seen[-1].method == 'POST'
    assert json.loads(seen[-1].content) == {'episode_id': EP1}
    with pytest.raises(ValueError):
        api.series(sort='bogus')
    with pytest.raises(ValueError):
        api.series_detail('../movies')


def test_series_playback_errors_are_readable_and_bad_urls_rejected():
    api = api_with(lambda r: httpx.Response(409, json={'detail': {'code': 'BROWSER_MEDIA_UNSUPPORTED', 'message': 'x'}}))
    with pytest.raises(ApiError) as error:
        api.start_series_playback(EP1)
    assert error.value.status == 409 and 'серия' in str(error.value).lower()
    api = api_with(lambda r: httpx.Response(200, json={'media_url': 'file:///etc/passwd'}))
    with pytest.raises(ApiError) as error:
        api.start_series_playback(EP1)
    assert error.value.code == 'BAD_MEDIA_URL'


# ---------- catalogue ----------
def test_series_all_sources_put_kinosota_first_then_torrents():
    api = CatalogApi()
    data = fetch_page(api, Genres(SITE, MOVIE, TV), state(kind='tv', source='all'))
    names = [c[0] for c in api.calls]
    assert 'series' in names and 'movies' not in names
    first = data['items'][0]
    assert all(row['_series'] for row in data['items']) and first['kind'] == 'tv' and 'tmdb_id' not in first
    assert meta_text(first).endswith('Сериал')
    data = fetch_page(api, Genres(SITE, MOVIE, TV), state(kind='tv', source='all', page=2))  # Torrent series follow.
    assert data['items'] and all(row['_source'] == 'tmdb' and row['kind'] == 'tv' for row in data['items'])
    api.calls.clear()
    fetch_page(api, Genres(SITE, MOVIE, TV), state(kind='tv', source='tmdb'))
    assert not any(c[0] == 'series' for c in api.calls)
    assert Genres(SITE, MOVIE, TV).available('боевик', 'tv', 'site')


def test_seasons_are_sorted_and_episode_labels_read_well():
    seasons = seasons_of(DETAIL)
    assert [s['season_number'] for s in seasons] == [1, 2] and [e['id'] for e in seasons[0]['episodes']] == [EP1, EP2]
    assert episode_label(seasons[0]['episodes'][0]) == 'Серия 1 · Пилот' and episode_label(seasons[0]['episodes'][1]) == 'Серия 2'


# ---------- window ----------
class SeriesApi(CatalogApi):
    def series_detail(self, series_id):
        self.calls.append(('series_detail', series_id)); return DETAIL

    def start_series_playback(self, episode_id):
        self.calls.append(('series_start', episode_id))
        return {'media_url': f'https://node.scenrix.com/s/{episode_id}', 'playback_token': 't'}


def test_series_card_opens_page_and_watch_starts_mpv_with_the_intro_flow():
    app()
    api = SeriesApi(site_total=0)
    engine = Engine()
    w = signed(api)
    w.engine = engine
    w.show_section('series')
    assert w.filters.state()['source'] == 'all' and w.results.item(0).data(Qt.ItemDataRole.UserRole)['_series']
    w._target_intro = lambda meta: api.calls.append(('intro', meta['kind']))
    w._prepare_preroll = lambda meta: api.calls.append(('preroll', meta['kind'], meta['id']))
    w._present_playback_splash = lambda text: ['--force-window=yes']
    w._await_splash_first_frame = lambda generation: api.calls.append(('splash_wait',))
    w.open_result(w.results.item(0))
    page = w.series
    assert w.pages.currentIndex() == 3 and any(c[0] == 'series_detail' for c in api.calls)
    assert page.season == 1 and page.episode == EP1 and page.season_combo.count() == 2 and page.episode_combo.count() == 2
    page.pick_episode(1)
    assert page.episode == EP2
    page.pick_season(page.season_combo.findData(2))
    assert page.episode == EP3
    page.watch_button.click()
    assert ('series_start', EP3) in api.calls and engine.started == [f'https://node.scenrix.com/s/{EP3}']
    assert ('intro', 'episode') in api.calls and ('preroll', 'episode', EP3) in api.calls and ('splash_wait',) in api.calls
    assert w.episode_choice['episode']['id'] == EP3 and not w.busy and not page.busy
    page.go_back()
    assert w.pages.currentIndex() == 1 and w.section == 'series'
    w.close()


def test_series_page_reports_a_failed_detail_and_offers_retry():
    class Broken(SeriesApi):
        def series_detail(self, series_id):
            raise ApiError(503, '', 'Сервис недоступен')
    app()
    api = Broken(site_total=0)
    w = signed(api)
    errors = []
    w.series.show_error = errors.append
    w.show_section('series')
    w.open_result(w.results.item(0))
    assert w.series.failed and errors and w.series.watch_button.isEnabled() and w.series.watch_button.text() == 'Повторить'
    w.close()


# ---------- year drum ----------
def wheel(widget, delta):
    centre = QPointF(widget.width() / 2, widget.height() / 2)
    event = QWheelEvent(centre, widget.mapToGlobal(centre), QPoint(), QPoint(0, delta), Qt.MouseButton.NoButton,
                        Qt.KeyboardModifier.NoModifier, Qt.ScrollPhase.NoScrollPhase, False)
    QApplication.sendEvent(widget, event)


def test_year_drum_shows_four_rows_wheel_arrows_and_click():
    app()
    values = year_values()
    assert values[0] is None and values[1] > values[2] and values[-1] == 1920
    popup = YearWheelPopup(values=values)
    drum = popup.drum
    assert drum.height() == DRUM_ROWS * DRUM_ROW == 136
    drum.set_year(2020)
    assert len(drum.visible_years()) == 4 and 2020 in drum.visible_years() and drum.year() == 2020
    top = drum.top
    wheel(drum, -120)
    assert drum.top == top + 1  # Wheel down: one row towards older years, snapped.
    wheel(drum, 60); wheel(drum, 60)
    assert drum.top == top  # Two half notches = one row.
    popup.down.click()
    assert drum.top == top + 1
    popup.up.click(); popup.up.click()
    assert drum.top == top - 1
    picked = []
    popup.yearSelected.connect(picked.append)
    QTest.mouseClick(drum, Qt.MouseButton.LeftButton, pos=QPoint(drum.width() // 2, DRUM_ROW * 2 + DRUM_ROW // 2))
    assert picked == [values[drum.top + 2]]
    drum.set_year(None)
    popup.sync_arrows()
    assert drum.top == 0 and not popup.up.isEnabled() and popup.down.isEnabled()


def test_year_button_opens_popup_escape_closes_and_bar_reloads():
    app()
    bar = FilterBar()
    bar.set_catalog(Genres(SITE, MOVIE, TV))
    bar.show()
    seen = []
    bar.changed.connect(lambda: seen.append(bar.state()))
    popup = bar.from_year.open_popup()
    assert popup.isVisible() and popup.windowFlags() & Qt.WindowType.Popup
    assert popup.testAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
    QTest.keyClick(popup.drum, Qt.Key.Key_Escape)
    assert not popup.isVisible() and not seen
    popup = bar.from_year.open_popup()
    popup.drum.pick(popup.drum.values.index(2015))
    assert not popup.isVisible() and bar.from_year.text() == '2015' and seen[-1]['year_from'] == 2015
    bar.reset()
    assert bar.from_year.text() == 'С любого' and bar.from_year.year is None
    bar.retranslate('en')
    assert bar.from_year.text() != 'С любого'
    bar.close()


# ---------- popups ----------
def test_combo_and_genre_menu_open_as_frameless_translucent_glass():
    app()
    combo = FilterCombo()
    combo.addItems(['a', 'b'])
    combo.show()
    combo.showPopup()
    window = combo.view().window()
    assert window is not combo and window.property('kinosotaPopup')
    assert window.testAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
    assert window.windowFlags() & Qt.WindowType.FramelessWindowHint
    combo.hidePopup()
    menu = StickyMenu()
    assert menu.testAttribute(Qt.WidgetAttribute.WA_TranslucentBackground) and menu.windowFlags() & Qt.WindowType.FramelessWindowHint
    combo.close()


# ---------- HiDPI ----------
def test_high_dpi_policy_and_dpr_aware_posters():
    app()
    assert configure_high_dpi() is False  # Too late once the application exists: no warning, no change.
    assert POLICY == Qt.HighDpiScaleFactorRoundingPolicy.PassThrough
    image = QPixmap(QImage(400, 600, QImage.Format.Format_RGB32))
    delegate = TileDelegate()
    scaled, w, h = delegate.cover(image, 150, 225, 1.5)
    assert (w, h) == (225, 338) and scaled.devicePixelRatio() == 1.5 and scaled.width() >= 225
    assert delegate.cover(image, 150, 225, 1.5)[0].cacheKey() == scaled.cacheKey()  # Reused, not rescaled.
    rect = crisp(QPixmap(10, 10).rect(), 1)
    assert (rect.left(), rect.width()) == (0.5, 9.0)
