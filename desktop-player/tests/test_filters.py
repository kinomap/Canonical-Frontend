"""0.1.7: «Фильтры» panel, combined KINOSOTA + torrent catalogue, bookmarks, website film launches."""
import os
os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')
import json
import httpx
import pytest
from PySide6.QtCore import Qt, QPoint
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication, QListWidgetItem
from kinosota_player import __version__
from kinosota_player.api import Api, ApiError
from kinosota_player.app import Window
from kinosota_player.browse import Genres, default_state, fetch_page, load_genres, page_numbers, signature
from kinosota_player.catalog import bookmark_rect, bookmarkable, meta_text
from kinosota_player.filters import FilterBar

LAUNCH = '7f0c6a4e-2b1d-4c8a-9e3f-5a6b7c8d9e0f'
SITE = [{'slug': 'boevik', 'name': 'боевик'}, {'slug': 'detektiv', 'name': 'детектив'},
        {'slug': 'mystery', 'name': 'Детектив'}, {'slug': 'muzyka', 'name': 'музыка'}]
MOVIE = [{'id': 28, 'name': 'боевик'}, {'id': 9648, 'name': 'детектив'}, {'id': 878, 'name': 'фантастика'}]
TV = [{'id': 10759, 'name': 'Боевик и Приключения'}, {'id': 9648, 'name': 'детектив'}]


def app():
    return QApplication.instance() or QApplication([])


def sync(fn, done=None, fail=None):
    try:
        value = fn()
    except Exception as error:
        if fail:
            fail(error)
        return
    if done:
        done(value)


class Vault:
    backend = None
    def load(self): return ''
    def save(self, token): return False
    def clear(self): pass


class Engine:
    def __init__(self): self.started = []
    def alive(self): return bool(self.started)
    def exit_code(self): return 0
    def stop(self): pass
    def start(self, url, *, extra_args=()): self.started.append(url)


class CatalogApi:
    """Site: 45 films (2 pages of 30); TMDB: 3 pages of 20."""
    origin = 'https://watch.scenrix.com'
    token = ''

    def __init__(self, site_total=45, tmdb_total=60, saved=(), launch=None, launch_error=None):
        self.site_total, self.tmdb_total, self.saved = site_total, tmdb_total, set(saved)
        self.launch, self.launch_error = launch, launch_error
        self.calls = []

    def close(self): pass
    def access(self): self.calls.append(('access',)); return {'ok': True}
    def genres(self): return SITE
    def torrent_genres(self, kind): return MOVIE if kind == 'movie' else TV

    def movies(self, page=1, query='', genres=(), year_from=None, year_to=None, min_rating=None, sort='popularity', page_size=30):
        self.calls.append(('movies', page, query, tuple(genres), year_from, year_to, min_rating, sort))
        first = (page - 1) * page_size
        count = max(0, min(page_size, self.site_total - first))
        return {'items': [{'id': f'site-{first + i}', 'title': f'Фильм {first + i}', 'year': '2024', 'quality': 'HD',
                           'rating': '7.1', 'tmdb_id': 1000 + first + i if i % 2 == 0 else None} for i in range(count)],
                'total': self.site_total, 'total_pages': -(-self.site_total // page_size)}

    def torrent_catalog(self, kind='movie', query='', page=1, genres=(), year_from=None, year_to=None, rating=None, sort='popularity'):
        self.calls.append(('catalog', kind, query, page, tuple(genres), year_from, year_to, rating, sort))
        first = (page - 1) * 20
        count = max(0, min(20, self.tmdb_total - first))
        return {'items': [{'kind': kind, 'tmdb_id': 5000 + first + i, 'title': f'Тайтл {first + i}', 'year': 2000 + i,
                           'rating': 5 + (i % 5), 'genre_ids': [28] if i % 2 else [18]} for i in range(count)],
                'total': self.tmdb_total, 'total_pages': -(-self.tmdb_total // 20)}

    def library_membership(self, pairs):
        self.calls.append(('membership', len(pairs)))
        return {'saved': [f'{k}:{i}' for k, i in pairs if (k, i) in self.saved]}

    def add_to_library(self, kind, tmdb_id):
        self.calls.append(('library_add', kind, tmdb_id)); self.saved.add((kind, tmdb_id)); return {'saved': True}

    def remove_from_library(self, kind, tmdb_id):
        self.calls.append(('library_remove', kind, tmdb_id)); self.saved.discard((kind, tmdb_id)); return {'saved': False}

    def library(self, page=1):
        self.calls.append(('library', page))
        return {'items': [{'kind': 'movie', 'tmdb_id': 155, 'title': 'Тёмный рыцарь', 'year': 2008}], 'total': 1, 'total_pages': 1}

    def torrent_sources(self, kind, tmdb_id):
        self.calls.append(('sources', kind, tmdb_id))
        return {'allowed': True, 'status': {'status': 'not_queued'}, 'discovering': False, 'in_library': True,
                'selected_source_id': None, 'sources': [], 'qualities': [], 'languages': []}

    def open_launch(self, launch_id):
        self.calls.append(('open', launch_id))
        if self.launch_error:
            raise self.launch_error
        return self.launch

    def start(self, movie_id):
        self.calls.append(('start', movie_id))
        return {'session_id': 'lease-1', 'media_url': 'https://watch.scenrix.com/media/opaque', 'heartbeat_interval_seconds': 20}

    def stop(self, session_id): self.calls.append(('stop', session_id)); return {'ok': True}
    def logout(self): self.calls.append(('logout',))


def window(api, engine=None):
    w = Window(api=api, engine=engine or Engine(), vault=Vault(), restore=False)
    w.work = sync
    w.torrents.work = sync
    return w


def state(**changes):
    value = default_state()
    value.update(changes)
    return value


# ---------- genres ----------
def test_genres_merge_site_and_tmdb_names_and_translate():
    g = Genres(SITE, MOVIE, TV)
    assert g.slugs(['детектив']) == ['detektiv', 'mystery']  # Two website genres, one chip.
    assert g.ids('movie', ['боевик', 'детектив']) == [28, 9648]
    assert g.label('детектив') == 'Детектив' and g.label('детектив', 'en') == 'Mystery'
    assert [k for k, _ in g.options('tv', 'tmdb')] == ['боевик и приключения', 'детектив']
    assert 'музыка' in dict(g.options('movie', 'site')) and 'музыка' not in dict(g.options('movie', 'tmdb'))
    assert 'фантастика' not in dict(g.options('movie', 'site'))


def test_genre_lists_fail_soft_but_401_signs_out():
    class Broken(CatalogApi):
        def genres(self): raise ApiError(503)
    g = load_genres(Broken())
    assert not g.slugs(['боевик']) and g.ids('movie', ['боевик']) == [28]

    class Expired(CatalogApi):
        def torrent_genres(self, kind): raise ApiError(401)
    with pytest.raises(ApiError):
        load_genres(Expired())


# ---------- one page plan ----------
def test_first_page_is_site_then_totals_cover_both_sources():
    api = CatalogApi()
    data = fetch_page(api, Genres(SITE, MOVIE, TV), state())
    assert [c[0] for c in api.calls] == ['access', 'movies', 'catalog', 'membership']
    assert len(data['items']) == 30 and {row['_source'] for row in data['items']} == {'site'}
    assert data['total'] == 105 and data['total_pages'] == 5  # 2 site pages + 3 TMDB pages.
    assert data['totals'] == {'site': (45, 2), 'tmdb': (60, 3)}


def test_later_pages_use_cached_totals_and_only_the_serving_source():
    api, genres = CatalogApi(), Genres(SITE, MOVIE, TV)
    known = fetch_page(api, genres, state())['totals']
    api.calls.clear()
    second = fetch_page(api, genres, state(page=2), known)
    assert [c[0] for c in api.calls] == ['access', 'movies', 'membership'] and len(second['items']) == 15
    api.calls.clear()
    third = fetch_page(api, genres, state(page=3), known)
    assert [c[0] for c in api.calls] == ['access', 'catalog', 'membership']
    assert api.calls[1][3] == 1 and {row['_source'] for row in third['items']} == {'tmdb'}


def test_filters_reach_both_servers_with_their_own_genre_keys():
    api = CatalogApi()
    fetch_page(api, Genres(SITE, MOVIE, TV), state(genres=['детектив', 'боевик'], rating=6.0, year_from=2020, year_to=2026, sort='rating'))
    movies = next(c for c in api.calls if c[0] == 'movies')
    catalog = next(c for c in api.calls if c[0] == 'catalog')
    assert movies[3] == ('detektiv', 'mystery', 'boevik') and movies[4:] == (2020, 2026, 6.0, 'rating')
    assert catalog[4] == (9648, 28) and catalog[5:] == (2020, 2026, 6.0, 'rating')


def test_sources_series_and_genres_missing_on_one_side():
    api = CatalogApi()
    fetch_page(api, Genres(SITE, MOVIE, TV), state(source='site'))
    assert not any(c[0] == 'catalog' for c in api.calls)
    api.calls.clear()
    data = fetch_page(api, Genres(SITE, MOVIE, TV), state(kind='tv', source='site'))  # Series: torrents only.
    assert not any(c[0] == 'movies' for c in api.calls) and data['items'][0]['kind'] == 'tv'
    api.calls.clear()
    fetch_page(api, Genres(SITE, MOVIE, TV), state(genres=['фантастика']))  # No such website genre.
    assert [c[0] for c in api.calls] == ['access', 'catalog', 'membership']


def test_title_search_filters_torrent_page_locally():
    api = CatalogApi(site_total=0)
    data = fetch_page(api, Genres(SITE, MOVIE, TV), state(query='тайтл', genres=['боевик'], rating=7.0))
    catalog = next(c for c in api.calls if c[0] == 'catalog')
    assert catalog[2] == 'тайтл' and catalog[4:] == ((), None, None, None, 'popularity')  # Server rule: q only.
    assert data['items'] and all(28 in row['genre_ids'] and row['rating'] >= 7 for row in data['items'])


def test_membership_marks_saved_cards_and_only_known_state_shows_a_ribbon():
    api = CatalogApi(site_total=0, saved={('movie', 5001)})
    items = fetch_page(api, Genres(), state())['items']
    assert [row['_saved'] for row in items[:3]] == [False, True, False]
    assert bookmarkable(items[0]) and not bookmarkable({'kind': 'movie', 'tmdb_id': 5})
    assert not bookmarkable({'id': 'site', '_saved': False})  # Website film without a TMDB identity.
    assert meta_text({'year': 2026, '_source': 'tmdb', 'kind': 'tv'}) == '2026 · Сериал'
    assert meta_text({'year': '2026', 'quality': 'SD', '_source': 'site'}, 'en') == '2026 · SD'


def test_page_numbers_match_the_screen():
    assert page_numbers(1, 145) == [1, 2, 3, 4, 5, None, 145]
    assert page_numbers(72, 145) == [1, None, 71, 72, 73, None, 145]
    assert page_numbers(145, 145) == [1, None, 141, 142, 143, 144, 145]
    assert page_numbers(2, 4) == [1, 2, 3, 4] and page_numbers(1, 0) == [1]
    assert len(page_numbers(50, 500, 5)) == 5


def test_signature_ignores_page_only():
    assert signature(state(page=1)) == signature(state(page=9))
    assert signature(state(kind='tv', source='site')) == signature(state(kind='tv', source='all'))
    assert signature(state(rating=6.0)) != signature(state())


# ---------- filter panel ----------
def test_filter_bar_state_reset_years_and_series_source():
    app()
    bar = FilterBar()
    bar.set_catalog(Genres(SITE, MOVIE, TV))
    seen = []
    bar.changed.connect(lambda: seen.append(bar.state()))
    bar.toggle_genre('боевик')
    bar.toggle_genre('детектив')
    assert not seen and bar.genre_timer.isActive()  # Several genres → one request.
    bar.genre_timer.timeout.emit()
    assert seen[-1]['genres'] == ['боевик', 'детектив'] and bar.chip_box.isVisibleTo(bar)
    bar.from_combo.setCurrentIndex(bar.from_combo.findData(2026))
    bar.to_combo.setCurrentIndex(bar.to_combo.findData(2020))
    bar._years_picked('to')
    assert (bar.year_from, bar.year_to) == (2020, 2020)
    bar._rating_picked(bar.rating_combo.findData(6.0))
    assert seen[-1]['rating'] == 6.0 and bar.reset_button.isEnabled()
    bar.set_source('site')
    bar.reset()
    assert seen[-1] == {'genres': [], 'rating': None, 'year_from': None, 'year_to': None, 'source': 'site', 'sort': 'popularity'}
    assert not bar.reset_button.isEnabled()
    bar.toggle_genre('боевик')
    bar.set_kind('tv')
    assert bar.genres == [] and bar.state()['source'] == 'tmdb' and not bar.source_combo.isEnabled()
    bar.set_collapsed(True, user=True)
    assert bar.user_toggled and not bar.body.isVisibleTo(bar) and 'Торренты' in bar.summary.text()
    bar.retranslate('en')
    assert bar.toggle.text() == 'Filters' and bar.sort_combo.itemText(0) == 'Most popular'


def test_genre_menu_asks_for_lists_once_and_lists_options():
    app()
    bar = FilterBar()
    wanted = []
    bar.genresWanted.connect(lambda: wanted.append(1))
    bar.fill_genre_menu()
    assert wanted == [1] and not bar.genre_menu.actions()[0].isEnabled()
    bar.set_catalog(Genres(), 'loading')
    bar.fill_genre_menu()
    assert wanted == [1]
    bar.set_catalog(Genres(SITE, MOVIE, TV))
    bar.fill_genre_menu()
    labels = [a.text() for a in bar.genre_menu.actions()]
    assert 'Детектив' in labels and 'Фантастика' in labels
    bar.genre_menu.actions()[labels.index('Детектив')].trigger()
    assert bar.genres == ['детектив']


# ---------- window ----------
def signed(api, size=(1240, 840)):
    w = window(api)
    w.resize(*size)
    w.show()
    w.signed_in({'username': 'kos'})
    app().processEvents()
    return w


def test_sign_in_loads_home_with_found_counter_pages_and_avatar():
    api = CatalogApi()
    w = signed(api)
    assert w.section == 'home' and w.nav['home'].isChecked() and w.pages.currentIndex() == 1
    assert w.results.count() == 30 and '105' in w.found.text() and w.total_pages == 5
    assert w.pager.isVisibleTo(w) and not w.prev.isEnabled() and w.next.isEnabled()
    assert w.avatar.text() == 'K' and w.avatar.isVisibleTo(w) and w.search.placeholderText() == 'Поиск фильмов и сериалов...'
    assert w.filters.catalog and not w.message.text()
    w.go_page(3)
    assert w.results.item(0).data(Qt.ItemDataRole.UserRole)['_source'] == 'tmdb' and w.page == 3
    w.close()


def test_filter_change_reloads_first_page_and_source_follows_header():
    api = CatalogApi()
    w = signed(api)
    w.go_page(2)
    api.calls.clear()
    w.filters._rating_picked(w.filters.rating_combo.findData(7.0))
    assert w.page == 1 and [c for c in api.calls if c[0] == 'movies'][0][6] == 7.0
    w.filters.source_combo.setCurrentIndex(w.filters.source_combo.findData('tmdb'))
    w.filters._source_picked(w.filters.source_combo.currentIndex())
    assert w.section == 'torrents' and w.nav['torrents'].isChecked()
    w.show_section('series')
    assert w.filters.kind == 'tv' and w.nav['series'].isChecked() and api.calls[-2][1] == 'tv'
    w.show_section('movies')
    assert w.filters.kind == 'movie' and w.filters.state()['source'] == 'site'
    w.show_section('library')
    assert w.pages.currentIndex() == 2 and w.nav['library'].isChecked() and ('library', 1) in api.calls
    w.close()


def test_header_search_from_library_returns_to_catalogue():
    api = CatalogApi()
    w = signed(api)
    w.show_section('library')
    w.search.setText('Тайтл')
    w.new_search()
    assert w.pages.currentIndex() == 1 and w.section == 'home' and api.calls[-3][2] == 'Тайтл'
    w.close()


def test_ribbon_click_saves_without_playback_and_reverts_on_error():
    api = CatalogApi(site_total=0)
    engine = Engine()
    w = signed(api)
    w.engine = engine
    first = w.results.item(0)
    rect = bookmark_rect(w.results.visualItemRect(first), w.results.list_mode)
    QTest.mouseClick(w.results.viewport(), Qt.MouseButton.LeftButton, Qt.KeyboardModifier.NoModifier, rect.center().toPoint())
    assert ('library_add', 'movie', 5000) in api.calls and not any(c[0] in ('start', 'sources') for c in api.calls)
    assert w.results.item(0).data(Qt.ItemDataRole.UserRole)['_saved'] and w.message.text() == 'Добавлено в кинотеку'
    assert w.pages.currentIndex() == 1 and engine.started == []

    def refuse(kind, tmdb_id): raise ApiError(409, '', 'В кинотеке уже 5000 записей. Удалите ненужные перед добавлением.')
    api.add_to_library = refuse
    w.toggle_bookmark(w.results.item(1))
    assert not w.results.item(1).data(Qt.ItemDataRole.UserRole)['_saved'] and '5000' in w.message.text()
    w.toggle_bookmark(w.results.item(0))
    assert ('library_remove', 'movie', 5000) in api.calls and w.message.text() == 'Удалено из кинотеки'
    w.close()


def test_torrent_card_opens_title_page_and_back_keeps_the_section():
    api = CatalogApi(site_total=0)
    w = signed(api)
    w.show_section('torrents')
    count = len(api.calls)
    w.open_result(w.results.item(2))
    assert w.pages.currentIndex() == 2 and ('sources', 'movie', 5002) in api.calls and w.nav['torrents'].isChecked()
    w.torrents.show_list()
    assert w.pages.currentIndex() == 1 and w.section == 'torrents' and w.results.count() == 20
    assert not any(c[0] == 'catalog' for c in api.calls[count:])  # Back does not reload the catalogue.
    w.close()


def test_library_ribbon_removes_the_title():
    api = CatalogApi(saved={('movie', 155)})
    w = signed(api)
    w.show_section('library')
    item = w.torrents.grid.item(0)
    assert item.data(Qt.ItemDataRole.UserRole)['_saved']
    w.torrents.unsave(item)
    assert ('library_remove', 'movie', 155) in api.calls and w.torrents.grid.count() == 0
    w.close()


def test_website_launch_of_a_kinosota_film_plays_it_directly():
    meta = {'launch_id': LAUNCH, 'kind': 'movie', 'tmdb_id': None, 'movie_id': 'film-42', 'title': 'Сказка',
            'original_title': 'Fairy Tale', 'year': 2022, 'poster': None, 'quality': '1080p', 'audio_lang': None}
    api, engine = CatalogApi(launch=meta), Engine()
    w = window(api, engine)
    w.open_link(f'kinosota://watch?launch={LAUNCH}')
    assert w.pending_launch == LAUNCH
    w.signed_in({'username': 'kos'})
    assert ('open', LAUNCH) in api.calls and ('start', 'film-42') in api.calls
    assert engine.started == ['https://watch.scenrix.com/media/opaque'] and w.session == 'lease-1'
    assert w.message.text() == 'Воспроизводится: Сказка' and w.pages.currentIndex() == 1
    w.close()


def test_launch_of_a_removed_film_explains_it():
    api = CatalogApi(launch_error=ApiError(404, '', 'Фильм больше недоступен'))
    w = signed(api)
    w.open_link(f'kinosota://watch?launch={LAUNCH}')
    assert w.message.text() == 'Фильм больше недоступен'
    w.set_language('en')
    assert w.message.text() == 'This movie is no longer available'
    w.close()


def test_short_window_folds_filters_and_keeps_two_rows():
    api = CatalogApi()
    w = signed(api, (760, 600))
    assert w.filters.collapsed and not w.filters.body.isVisibleTo(w)
    w.filters.set_collapsed(False, user=True)
    w.resize(760, 640)
    app().processEvents()
    assert not w.filters.collapsed  # The viewer's choice wins over the automatic fold.
    w.set_view('list')
    assert w.results.list_mode and w.view_buttons['list'].isChecked()
    w.close()


def test_logout_forgets_pages_and_totals():
    api = CatalogApi()
    w = signed(api)
    w.logout()
    assert w.pages.currentIndex() == 0 and not w.totals and w.found.text() == '' and not w.pager.isVisibleTo(w)
    assert not w.nav['home'].isVisibleTo(w) and not w.search.isVisibleTo(w)
    w.close()


# ---------- HTTP contract ----------
def test_catalogue_requests_follow_the_server_contract():
    seen = []

    def serve(request):
        seen.append(request)
        return httpx.Response(200, json={'items': [], 'total': 0, 'total_pages': 1, 'saved': []})

    api = Api(transport=httpx.MockTransport(serve))
    api.movies(page=2, genres=['boevik', 'fantastika', 'boevik'], year_from=2026, year_to=2020, min_rating=6, sort='rating')
    params = dict(seen[-1].url.params)
    assert seen[-1].url.path == '/api/v1/movies'
    assert params == {'page': '2', 'page_size': '30', 'sort': 'rating_desc', 'genres': 'boevik,fantastika',
                      'year_from': '2020', 'year_to': '2026', 'min_rating': '6.0'}
    api.torrent_catalog('movie', '', 3, genres=[28, 878], rating=7, sort='newest')
    assert dict(seen[-1].url.params) == {'kind': 'movie', 'page': '3', 'genres': '28,878', 'rating': '7.0', 'sort': 'newest'}
    api.torrent_catalog('tv', 'Офис', 1)
    assert dict(seen[-1].url.params) == {'kind': 'tv', 'page': '1', 'q': 'Офис'}
    with pytest.raises(ValueError):
        api.torrent_catalog('movie', 'Офис', 1, rating=7)
    with pytest.raises(ValueError):
        api.movies(genres=['../x'])
    api.library_membership([('movie', 155), ('tv', 1399), ('movie', 155)])
    assert seen[-1].url.params['keys'] == 'movie:155,tv:1399'
    api.remove_from_library('tv', 1399)
    assert seen[-1].method == 'DELETE' and seen[-1].url.path == '/api/v1/account/library/tv/1399'
    api.torrent_genres('tv')
    assert seen[-1].url.path == '/api/v1/torrents/genres' and seen[-1].url.params['kind'] == 'tv'
    assert seen[-1].headers['User-Agent'] == 'KINOSOTA-Player/' + __version__ == 'KINOSOTA-Player/0.1.9'
    api.close()
