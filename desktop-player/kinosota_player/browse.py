"""«Главная» catalogue: KINOSOTA films first, then TMDB titles with torrent sources.

One request plan per filter state; every network call of one page load runs in a
single background job. Genres are merged by name: the website and TMDB name the
same genre independently («детектив» / «Детектив»), so one chip may stand for
several site slugs and TMDB ids.
"""
import math
from .api import ApiError

SITE_PAGE = 30
SOURCES = ('all', 'site', 'tmdb')
SORTS = ('popularity', 'rating', 'newest', 'title')
KINDS = ('movie', 'tv')


# English labels for the Russian genre names served by the website and TMDB (ru-RU).
GENRE_EN = {
    'биография': 'Biography', 'боевик': 'Action', 'вестерн': 'Western', 'военный': 'War', 'детектив': 'Mystery',
    'детский': 'Kids', 'документальный': 'Documentary', 'драма': 'Drama', 'история': 'History', 'комедия': 'Comedy',
    'короткометражка': 'Short', 'криминал': 'Crime', 'мелодрама': 'Romance', 'музыка': 'Music', 'мультфильм': 'Animation',
    'мюзикл': 'Musical', 'приключения': 'Adventure', 'семейный': 'Family', 'спорт': 'Sport',
    'телевизионный фильм': 'TV Movie', 'триллер': 'Thriller', 'ужасы': 'Horror', 'фантастика': 'Science Fiction',
    'фэнтези': 'Fantasy', 'боевик и приключения': 'Action & Adventure', 'новости': 'News', 'реалити-шоу': 'Reality',
    'нф и фэнтези': 'Sci-Fi & Fantasy', 'мыльная опера': 'Soap', 'ток-шоу': 'Talk', 'война и политика': 'War & Politics',
}


def genre_key(name):
    return ' '.join(str(name or '').split()).casefold()


def genre_label(name):
    name = ' '.join(str(name or '').split())
    return name[:1].upper() + name[1:]


class Genres:
    """Display genres per kind; each knows its site slugs and TMDB ids."""

    def __init__(self, site=(), movie=(), tv=()):
        self.entries = {}
        for row in site or ():
            if isinstance(row, dict) and isinstance(row.get('slug'), str) and row.get('name'):
                self._entry(row['name'])['slugs'].append(row['slug'])
        for kind, rows in (('movie', movie), ('tv', tv)):
            for row in rows or ():
                if isinstance(row, dict) and type(row.get('id')) is int and row.get('name'):
                    self._entry(row['name'])[kind].append(row['id'])

    def _entry(self, name):
        key = genre_key(name)
        if key not in self.entries:
            self.entries[key] = {'key': key, 'label': genre_label(name), 'slugs': [], 'movie': [], 'tv': []}
        return self.entries[key]

    def __bool__(self):
        return bool(self.entries)

    def available(self, key, kind, source):
        entry = self.entries.get(key)
        if not entry:
            return False
        if kind == 'tv':
            return bool(entry['tv'])
        return bool((entry['slugs'] if source in ('all', 'site') else []) or (entry['movie'] if source in ('all', 'tmdb') else []))

    def options(self, kind, source, language='ru'):
        keys = [k for k in self.entries if self.available(k, kind, source)]
        return sorted(((k, self.label(k, language)) for k in keys), key=lambda kv: kv[1].casefold())

    def label(self, key, language='ru'):
        if language == 'en' and key in GENRE_EN:
            return GENRE_EN[key]
        entry = self.entries.get(key)
        return entry['label'] if entry else genre_label(key)

    def slugs(self, keys):
        return list(dict.fromkeys(s for k in keys for s in self.entries.get(k, {}).get('slugs', [])))[:10]

    def ids(self, kind, keys):
        return list(dict.fromkeys(i for k in keys for i in self.entries.get(k, {}).get(kind, [])))[:10]


def load_genres(api):
    """Site + TMDB genre lists in one job; a missing list only narrows the choice."""
    lists = {}
    for name, call in (('site', lambda: api.genres()), ('movie', lambda: api.torrent_genres('movie')),
                       ('tv', lambda: api.torrent_genres('tv'))):
        try:
            data = call()
        except ApiError as error:
            if error.status == 401:
                raise
            data = []
        lists[name] = data.get('items', []) if isinstance(data, dict) else data if isinstance(data, list) else []
    return Genres(lists['site'], lists['movie'], lists['tv'])


def default_state():
    return {'kind': 'movie', 'source': 'all', 'query': '', 'genres': [], 'rating': None,
            'year_from': None, 'year_to': None, 'sort': 'popularity', 'page': 1}


def signature(state):
    """Everything except the page: totals stay valid while paging."""
    return (state['kind'], effective_source(state), state['query'], tuple(state['genres']), state['rating'],
            state['year_from'], state['year_to'], state['sort'])


def effective_source(state):
    return 'tmdb' if state['kind'] == 'tv' else state['source']


def filtered(state):
    return bool(state['genres'] or state['rating'] is not None or state['year_from'] is not None
                or state['year_to'] is not None)


def _year(row):
    year = row.get('year')
    if type(year) is int:
        return year
    text = str(row.get('release_date') or row.get('first_air_date') or '')[:4]
    return int(text) if text.isdigit() else None


def matches(row, state, ids):
    """TMDB title search has no server-side filters: apply them to the page."""
    if ids and not set(row.get('genre_ids') or []) & set(ids):
        return False
    if state['rating'] is not None and float(row.get('rating') or 0) < state['rating']:
        return False
    year = _year(row)
    if state['year_from'] is not None and (year is None or year < state['year_from']):
        return False
    if state['year_to'] is not None and (year is None or year > state['year_to']):
        return False
    return True


def fetch_page(api, genres, state, known=None):
    """Return {'items','total','total_pages','totals'} for one combined page.

    KINOSOTA pages come first (30 films each), then TMDB pages (20 titles each).
    ``known`` carries totals of the same filter signature so later pages need
    only the request that serves them.
    """
    known = dict(known or {})
    if hasattr(api, 'access'):
        api.access()  # Paid access is rechecked before each catalogue page.
    kind, source, page, query = state['kind'], effective_source(state), max(1, int(state['page'])), state['query']
    keys = list(state['genres'])
    use_site = kind == 'movie' and source in ('all', 'site')
    use_tmdb = source in ('all', 'tmdb')
    slugs = genres.slugs(keys) if genres else []
    ids = genres.ids(kind, keys) if genres else []
    if keys and not slugs:
        use_site = False  # None of the chosen genres exists on the website.
    if keys and not ids:
        use_tmdb = False
    items, interpreted = [], ''
    site_total, site_pages = known.get('site', (None, None))
    if not use_site:
        site_total, site_pages = 0, 0
    elif site_pages is None or page <= site_pages:
        data = api.movies(page=page, query=query, genres=slugs, year_from=state['year_from'], year_to=state['year_to'],
                          min_rating=state['rating'], sort=state['sort'], page_size=SITE_PAGE)
        site_total = max(0, int(data.get('total') or 0))
        site_pages = math.ceil(site_total / SITE_PAGE)
        if page <= site_pages:
            items = [{**row, '_source': 'site'} for row in data.get('items') or [] if isinstance(row, dict) and row.get('id')]
    tmdb_total, tmdb_pages = known.get('tmdb', (None, None))
    if not use_tmdb:
        tmdb_total, tmdb_pages = 0, 0
    else:
        tmdb_page = page - site_pages
        if tmdb_page >= 1 or tmdb_pages is None:
            if query:
                data = api.torrent_catalog(kind, query, max(1, tmdb_page))
                # 0.1.8: a transliterated / wrong-layout query comes back as the words actually searched.
                value = data.get('interpreted_as') if isinstance(data, dict) else None
                interpreted = value.strip()[:120] if isinstance(value, str) else ''
            else:
                data = api.torrent_catalog(kind, '', max(1, tmdb_page), genres=ids, year_from=state['year_from'],
                                           year_to=state['year_to'], rating=state['rating'], sort=state['sort'])
            tmdb_total = max(0, int(data.get('total') or 0))
            tmdb_pages = max(0, min(500, int(data.get('total_pages') or 0)))
            if tmdb_page >= 1 and tmdb_page <= max(tmdb_pages, 1):
                rows = [{**row, '_source': 'tmdb'} for row in data.get('items') or []
                        if isinstance(row, dict) and row.get('kind') in KINDS and type(row.get('tmdb_id')) is int]
                if query and filtered(state):
                    rows = [row for row in rows if matches(row, state, ids)]
                items = rows
    pairs = [(row.get('kind') or 'movie', row['tmdb_id']) for row in items if type(row.get('tmdb_id')) is int and row['tmdb_id'] > 0]
    saved = set()
    if pairs and hasattr(api, 'library_membership'):
        try:
            saved = set((api.library_membership(pairs) or {}).get('saved') or [])
        except ApiError as error:
            if error.status == 401:
                raise
    for row in items:
        if type(row.get('tmdb_id')) is int:
            row['_saved'] = f"{row.get('kind') or 'movie'}:{row['tmdb_id']}" in saved
    return {'items': items, 'total': site_total + tmdb_total, 'total_pages': max(1, site_pages + tmdb_pages),
            'totals': {'site': (site_total, site_pages), 'tmdb': (tmdb_total, tmdb_pages)}, 'interpreted_as': interpreted}


def page_numbers(current, total, width=7):
    """1 … 4 5 6 … 145 — None marks a gap; never more than ``width`` entries."""
    total = max(1, int(total))
    current = max(1, min(total, int(current)))
    if total <= width:
        return list(range(1, total + 1))
    inner = width - 2
    if current <= inner - 1:
        return [*range(1, inner + 1), None, total]
    if current >= total - inner + 2:
        return [1, None, *range(total - inner + 1, total + 1)]
    side = (width - 5) // 2
    return [1, None, *range(current - side, current + side + 1), None, total]
