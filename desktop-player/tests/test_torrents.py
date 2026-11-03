"""«Торренты» in the desktop app: same choices as the website, voice → mpv --alang."""
import os
os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')
import copy, json
import httpx
import pytest
from PySide6.QtWidgets import QApplication
from kinosota_player.api import Api, ApiError
from kinosota_player.app import Window
from kinosota_player.torrents import (TorrentPage, audio_args, best_source, in_flight, media_title_args,
    progress_state, progress_text, size_text)

A = '11111111-1111-4111-8111-111111111111'
B = '22222222-2222-4222-8222-222222222222'
C = '33333333-3333-4333-8333-333333333333'
LAUNCH = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'
GB = 1024 ** 3


def source(source_id, quality, languages, state='ready', seeders=10, default=False, episodes=(), size=8 * GB, kind='WEB-DL'):
    return {'source_id': source_id, 'title': f'Fixture.{quality}.{kind}', 'quality': quality, 'source_type': kind,
            'languages': list(languages), 'seeders': seeders, 'size_bytes': size, 'state': state,
            'progress': 100 if state == 'ready' else 0, 'start_ms': 1234 if state == 'ready' else None,
            'default': default, 'episodes': [{'season': s, 'episode': e} for s, e in episodes], 'file_count': 1}


def movie_view():
    return {'allowed': True, 'status': {'status': 'playable', 'playable': True, 'progress': 100, 'start_ms': 1234},
            'discovering': False, 'in_library': True, 'selected_source_id': A,
            'sources': [source(A, '2160p', ['ru', 'en'], seeders=50, default=True, size=20 * GB),
                        source(B, '1080p', ['ru', 'uk'], state='candidate', seeders=120, kind='BDRip'),
                        source(C, '720p', ['ru'], state='failed')],
            'qualities': ['2160p', '1080p', '720p'], 'languages': ['ru', 'uk', 'en'], 'episodes': []}


def tv_view():
    return {'allowed': True, 'status': {'status': 'playable', 'progress': 100, 'start_ms': 900}, 'discovering': False,
            'in_library': True, 'selected_source_id': A,
            'sources': [source(A, '1080p', ['ru'], default=True, episodes=[(1, 1), (1, 2)]),
                        source(B, '1080p', ['ru'], seeders=5, episodes=[(1, 3), (2, 1)])],
            'qualities': ['1080p'], 'languages': ['ru'],  # Union of ready releases, as the server sends it.
            'episodes': [{'season': s, 'episode': e} for s, e in ((1, 1), (1, 2), (1, 3), (2, 1))]}


def sync(fn, done=None, fail=None):
    try:
        value = fn()
    except Exception as error:  # Same contract as Window.work, without threads.
        if fail:
            fail(error)
        return
    if done:
        done(value)


class FakeApi:
    origin = 'https://watch.scenrix.com'
    token = ''

    def __init__(self, view=None, launch=None, launch_error=None):
        self.views = [view or movie_view()]
        self.launch, self.launch_error = launch, launch_error
        self.calls = []

    def close(self):
        pass

    def search(self, query='', page=1):
        return {'items': [], 'total': 0, 'total_pages': 1}

    def library(self, page=1):
        self.calls.append(('library', page))
        return {'items': [{'kind': 'movie', 'tmdb_id': 155, 'title': 'Тёмный рыцарь', 'year': 2008, 'poster': None}],
                'total': 1, 'total_pages': 1}

    def torrent_catalog(self, kind, query='', page=1):
        self.calls.append(('catalog', kind, query, page))
        return {'items': [], 'total': 0, 'total_pages': 1}

    def torrent_sources(self, kind, tmdb_id):
        self.calls.append(('sources', kind, tmdb_id))
        return copy.deepcopy(self.views[0] if len(self.views) == 1 else self.views.pop(0))

    def prepare_source(self, source_id):
        self.calls.append(('prepare', source_id))
        return {'state': 'queued'}

    def discover_sources(self, kind, tmdb_id):
        self.calls.append(('discover', kind, tmdb_id))
        return {'result': 'queued'}

    def add_to_library(self, kind, tmdb_id):
        self.calls.append(('library_add', kind, tmdb_id))
        return {'saved': True}

    def open_launch(self, launch_id):
        self.calls.append(('open', launch_id))
        if self.launch_error:
            raise self.launch_error
        return self.launch

    def torrent_ticket(self, kind, tmdb_id, source_id=None, season=None, episode=None):
        self.calls.append(('ticket', kind, tmdb_id, source_id, season, episode))
        return {'stream_url': 'https://torrent-01.scenrix.com/stream/opaque-ticket', 'expires_at': 'x'}


class FakeEngine:
    def __init__(self):
        self.started = []

    def alive(self):
        return bool(self.started)

    def exit_code(self):
        return 0

    def stop(self):
        pass

    def start(self, url, *, extra_args=()):
        self.started.append((url, list(extra_args)))


class Vault:
    backend = None

    def load(self):
        return ''

    def save(self, token):
        return False

    def clear(self):
        pass


def page_for(api):
    app = QApplication.instance() or QApplication([])
    notes, errors = [], []
    page = TorrentPage(api, sync, errors.append, notes.append)
    page.resize(900, 700)
    page.show()
    app.processEvents()
    return page, notes, errors


def window_for(api, engine):
    w = Window(api=api, engine=engine, vault=Vault(), restore=False)
    w.work = sync
    w.torrents.work = sync
    return w


def test_helpers_match_the_website_progress_and_mpv_audio_contract():
    assert audio_args('ru') == ['--alang=rus,ru'] and audio_args('uk') == ['--alang=ukr,uk']
    assert audio_args('en') == ['--alang=eng,en'] and audio_args('de') == [] and audio_args(None) == []
    assert media_title_args('Фильм ${path} \\ x') == ['--force-media-title=Фильм {path}  x']
    assert media_title_args('\n') == []
    assert progress_text(('queued', 10, None, None)) == 'В очереди 10%'
    assert progress_text(('searching', 35, None, None)) == 'Поиск раздач 35%'
    assert progress_text(('loading', 75, None, None)) == 'Проверка и буферизация 75%'
    assert progress_text(('playable', 100, 1234, None)) == 'Готово · старт 1\u00a0234 мс'
    assert progress_text(('playable', 100, None, None)) == 'Готово'
    assert progress_text(('queued', 10, None, None), 'en') == 'Queued 10%'
    assert progress_text(('unavailable', 0, None, 'Раздача не отвечает')) == 'Раздача не отвечает'
    assert size_text(20 * GB) == '20,0 ГБ' and size_text(500 * 1024 ** 2) == '500 МБ' and size_text(None) == ''
    view = movie_view()
    assert progress_state(view, view['sources'][0]) == ('playable', 100, 1234, None)
    assert progress_state(view, view['sources'][1]) == ('queued', 0, None, 'Раздача не подготовлена')
    assert progress_state(view, view['sources'][2]) == ('unavailable', 0, None, 'Раздача не отвечает')
    assert progress_state({**view, 'allowed': False}, None) is None
    assert not in_flight(view) and in_flight({**view, 'discovering': True})
    # Failed sources lose; then matching quality/voice; then prepared; then seeders.
    assert best_source(view['sources'])['source_id'] == A
    assert best_source(view['sources'], quality='1080p')['source_id'] == B
    assert best_source(view['sources'], language='uk')['source_id'] == B
    assert best_source(view['sources'][2:]) == view['sources'][2] and best_source([]) is None


def test_detail_page_shows_selection_progress_and_white_watch_button():
    api = FakeApi()
    page, notes, errors = page_for(api)
    page.open_title({'kind': 'movie', 'tmdb_id': 155, 'title': 'Тёмный рыцарь', 'year': 2008})
    assert api.calls == [('sources', 'movie', 155)] and not errors
    assert page.stack.currentIndex() == 1 and page.title_label.text() == 'Тёмный рыцарь'
    assert page.meta_label.text() == '2008 · Фильм'
    assert page.progress_label.text() == 'Готово · старт 1\u00a0234 мс' and page.progress.value() == 100
    assert page.selected_label.text() == '✓ Выбрано: 2160p WEB-DL · ▲ 50 сид · 20,0 ГБ'
    q = page.quality_buttons
    assert q['2160p'].isEnabled() and q['2160p'].isChecked() and q['1080p'].isEnabled() and not q['1080p'].isChecked()
    assert not q['720p'].isEnabled() and not q['480p'].isEnabled()  # Only a failed 720p, no 480p at all.
    lang = page.language_buttons
    assert lang['ru'].isChecked() and lang['en'].isEnabled() and lang['uk'].isEnabled() and not lang['en'].isChecked()
    assert lang['ru'].text() == 'RU' and lang['uk'].text() == 'UA' and not lang['ru'].icon().isNull()
    assert page.action_button.text() == '▶  Смотреть' and page.action_button.objectName() == 'watch'
    assert page.action_button.isEnabled() and not page.episode_box.isVisibleTo(page)
    played = []
    page.playRequested.connect(played.append)
    page.pick_language('en')  # The 2160p release has an English track: keep it, switch the voice.
    assert page.selected()['source_id'] == A and lang['en'].isChecked() and not lang['ru'].isChecked()
    page.action_button.click()
    assert played == [{'kind': 'movie', 'tmdb_id': 155, 'source_id': A, 'season': None, 'episode': None,
                       'audio_lang': 'en', 'title': 'Тёмный рыцарь'}]
    page.close()


def test_choosing_an_unprepared_quality_queues_it_and_shows_live_progress():
    queued = movie_view()
    queued['sources'][1].update(state='queued', progress=10)
    api = FakeApi()
    page, notes, errors = page_for(api)
    page.open_title({'kind': 'movie', 'tmdb_id': 155, 'title': 'Тёмный рыцарь'})
    api.views = [queued]
    page.pick_quality('1080p')
    assert ('prepare', B) in api.calls and api.calls[-1] == ('sources', 'movie', 155)
    assert page.selected()['source_id'] == B and page.quality_buttons['1080p'].isChecked()
    assert page.progress_label.text() == 'В очереди 10%' and page.progress.value() == 10
    assert page.action_button.text() == 'Готовим раздачу…' and not page.action_button.isEnabled()
    assert page.action_button.objectName() == 'primary'
    assert page.hint_label.text() == 'Раздача поставлена в очередь на проверку'
    assert page.language_buttons['uk'].isEnabled() and page.audio_language() == 'ru'
    assert page.poll.isActive()  # Keeps polling while the release is checked.
    page.close()


def test_title_outside_library_offers_add_then_discovery_without_infohash():
    empty = {'allowed': True, 'status': {'status': 'not_queued'}, 'discovering': False, 'in_library': False,
             'selected_source_id': None, 'sources': [], 'qualities': [], 'languages': [], 'episodes': []}
    added = {**empty, 'in_library': True, 'status': {'status': 'searching', 'progress': 35}, 'discovering': True}
    api = FakeApi(view=empty)
    page, notes, errors = page_for(api)
    page.open_title({'kind': 'movie', 'tmdb_id': 680, 'title': 'Криминальное чтиво'})
    assert page.action_button.text() == 'Добавить в кинотеку' and page.action_button.isEnabled()
    assert not page.quality_buttons['1080p'].isVisibleTo(page) and not page.progress.isVisibleTo(page)
    api.views = [added]
    page.action_button.click()
    assert ('library_add', 'movie', 680) in api.calls
    assert page.progress_label.text() == 'Поиск раздач 35%' and page.action_button.text() == 'Готовим раздачу…'
    assert page.hint_label.text() == 'Добавлено в кинотеку — ищем раздачи'
    locked = FakeApi(view={**empty, 'allowed': False})
    page2, _, _ = page_for(locked)
    page2.open_title({'kind': 'movie', 'tmdb_id': 680, 'title': 'Криминальное чтиво'})
    assert page2.action_button.text() == 'Нужна подписка PRO' and not page2.action_button.isEnabled()
    page.close()
    page2.close()


def test_series_episode_choice_follows_a_release_that_contains_the_episode():
    api = FakeApi(view=tv_view())
    page, notes, errors = page_for(api)
    page.open_title({'kind': 'tv', 'tmdb_id': 1399, 'title': 'Игра престолов'})
    assert page.episode_box.isVisibleTo(page) and (page.season, page.episode) == (1, 1)
    assert [page.season_combo.itemText(i) for i in range(page.season_combo.count())] == ['Сезон 1', 'Сезон 2']
    assert [page.episode_combo.itemData(i) for i in range(page.episode_combo.count())] == [1, 2, 3]
    page.pick_episode(2)  # Episode 3 exists only in release B.
    assert page.episode == 3 and page.selected()['source_id'] == B
    played = []
    page.playRequested.connect(played.append)
    page.act()
    assert played[-1]['season'] == 1 and played[-1]['episode'] == 3 and played[-1]['source_id'] == B
    page.pick_season(1)
    assert (page.season, page.episode) == (2, 1)
    page.close()


def test_website_launch_waits_for_login_then_plays_with_selected_voice():
    app = QApplication.instance() or QApplication([])
    meta = {'launch_id': LAUNCH, 'kind': 'movie', 'tmdb_id': 155, 'title': 'Тёмный рыцарь', 'original_title': 'The Dark Knight',
            'year': 2008, 'poster': None, 'source_id': B, 'quality': '1080p', 'source_type': 'BDRip',
            'languages': ['ru', 'uk'], 'season': None, 'episode': None, 'audio_lang': 'uk'}
    ready = movie_view()
    ready['sources'][1].update(state='ready', progress=100, start_ms=800)
    api, engine = FakeApi(view=ready, launch=meta), FakeEngine()
    w = window_for(api, engine)
    assert not w.nav_torrents.isVisibleTo(w)  # Login page: no sections yet.
    w.open_link('kinosota://watch?launch=' + LAUNCH.upper())
    assert w.pending_launch == LAUNCH and api.calls == [] and 'Войдите в аккаунт' in w.message.text()
    w.signed_in({'username': 'viewer'})
    assert ('open', LAUNCH) in api.calls and w.pending_launch == ''
    assert w.pages.currentIndex() == 2 and w.nav_torrents.isChecked() and w.nav_torrents.isVisibleTo(w)
    assert ('ticket', 'movie', 155, B, None, None) in api.calls
    assert engine.started == [('https://torrent-01.scenrix.com/stream/opaque-ticket',
                               ['--alang=ukr,uk', '--force-media-title=Тёмный рыцарь'])]
    assert w.torrent_playing and w.message.text() == 'Воспроизводится: Тёмный рыцарь'
    assert w.torrents.selected()['source_id'] == B and w.torrents.language_buttons['uk'].isChecked()
    w.close()
    app.processEvents()


@pytest.mark.parametrize('status,text', [(404, 'другим аккаунтом'), (410, 'Ссылка устарела')])
def test_foreign_or_expired_launch_is_explained_without_playing(status, text):
    app = QApplication.instance() or QApplication([])
    api, engine = FakeApi(launch_error=ApiError(status)), FakeEngine()
    w = window_for(api, engine)
    w.signed_in({'username': 'viewer'})
    w.open_link(f'kinosota://watch?launch={LAUNCH}')
    assert text in w.message.text() and engine.started == [] and w.pending_launch == ''
    w.close()
    app.processEvents()


def test_forged_link_is_ignored_and_expired_session_keeps_the_launch():
    app = QApplication.instance() or QApplication([])
    api, engine = FakeApi(launch_error=ApiError(401)), FakeEngine()
    w = window_for(api, engine)
    w.signed_in({'username': 'viewer'})
    w.open_link('kinosota://watch?launch=../../account&token=x')
    assert 'не распознана' in w.message.text() and not any(c[0] == 'open' for c in api.calls)
    w.open_link(f'kinosota://watch?launch={LAUNCH}')
    assert w.pages.currentIndex() == 0 and w.pending_launch == LAUNCH  # Re-login resumes the same launch.
    w.close()
    app.processEvents()


def test_torrent_api_contract_and_server_messages():
    seen = []

    def serve(request):
        seen.append(request)
        path = request.url.path
        assert request.headers['Authorization'] == 'Bearer opaque-session'
        if path.endswith('/playback-ticket'):
            body = json.loads(request.content)
            if body['tmdb_id'] == 2:
                return httpx.Response(409, json={'detail': 'Раздача не готова'})
            return httpx.Response(200, json={'stream_url': 'https://torrent-01.scenrix.com/stream/t', 'body': body})
        if path.startswith('/api/v1/account/library/'):
            return httpx.Response(409, json={'detail': 'В кинотеке уже 5000 записей. Удалите ненужные перед добавлением.'})
        if path.endswith('/discover'):
            return httpx.Response(429, json={'detail': 'too many'})
        return httpx.Response(200, json={'ok': True})

    api = Api(transport=httpx.MockTransport(serve))
    api.token = 'opaque-session'
    body = api.torrent_ticket('tv', 1399, A.upper(), 1, 2)['body']
    assert body == {'kind': 'tv', 'tmdb_id': 1399, 'source_id': A, 'season': 1, 'episode': 2}
    assert api.torrent_ticket('movie', 155, None, 1, 2)['body'] == {'kind': 'movie', 'tmdb_id': 155}
    with pytest.raises(ApiError) as error:
        api.torrent_ticket('movie', 2)
    assert error.value.status == 409 and str(error.value) == 'Раздача ещё готовится. Попробуйте через минуту.'
    with pytest.raises(ApiError) as error:
        api.add_to_library('movie', 155)
    assert str(error.value).startswith('В кинотеке уже 5000 записей') and seen[-1].method == 'PUT'
    with pytest.raises(ApiError) as error:
        api.discover_sources('tv', 1399)
    assert str(error.value) == 'Слишком много попыток. Подождите и повторите.'
    api.torrent_sources('movie', 155)
    api.prepare_source(B)
    api.open_launch(LAUNCH.upper())
    api.library(2)
    api.torrent_catalog('tv', 'Игра & престолов', 3)
    paths = [r.url.path for r in seen[-5:]]
    assert paths == ['/api/v1/torrents/sources/movie/155', f'/api/v1/torrents/sources/{B}/prepare',
                     f'/api/v1/torrents/desktop-launch/{LAUNCH}/open', '/api/v1/account/library',
                     '/api/v1/torrents/catalog']
    assert seen[-2].url.params['page'] == '2' and seen[-2].url.params['size'] == '48'
    assert dict(seen[-1].url.params) == {'kind': 'tv', 'page': '3', 'q': 'Игра & престолов'}
    count = len(seen)
    for bad in (lambda: api.torrent_sources('music', 1), lambda: api.torrent_sources('movie', 0),
                lambda: api.torrent_sources('movie', True), lambda: api.prepare_source('../admin'),
                lambda: api.open_launch('x'), lambda: api.torrent_ticket('movie', 155, 'not-a-uuid')):
        with pytest.raises(ValueError):
            bad()
    assert len(seen) == count  # Invalid identifiers never reach the network.
    api.close()
