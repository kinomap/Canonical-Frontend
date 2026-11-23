/*
 * KINOSOTA Lite TV Portal v2 (/tv/lite) — TV_MULTI_EPOCH_PORTAL_SPEC.md §4.
 * Lampa-grade Smart TV interface for 2012–2017 Smart TVs (Samsung Orsay WebKit 537, LG Netcast/webOS, Android boxes).
 * Strict ES5 / vanilla JS: no let/const, arrow functions, classes, template strings, or ES modules.
 * Network uses XMLHttpRequest with a LitePromise polyfill.
 */
(function (window, document) {
    'use strict';

    var API_BASE = '/api/v1';
    var LAUNCHER_URL = 'http://www.kinosota.devs.surf/';
    var TOKEN_KEY = 'tg_stream_access_token';
    var SHELF_LIMIT = 20;
    var SEEK_STEP = 30;
    var CARD_STEP = 172;          /* .lite-card width (150) + margin-right (22) */
    var REQUEST_TIMEOUT_MS = 20000;
    var EXIT_FALLBACK_MS = 600;
    var BAR_HIDE_MS = 4000;

    var ua = (window.navigator && window.navigator.userAgent ? window.navigator.userAgent : '').toLowerCase();
    var IS_ORSAY = ua.indexOf('maple') !== -1 ||
        (ua.indexOf('smarttv') !== -1 && ua.indexOf('tizen') === -1 && ua.indexOf('web0s') === -1 && ua.indexOf('webos') === -1);

    /* ── Promise polyfill ── */
    function LitePromise(executor) {
        var self = this;
        self._state = 0; /* 0 pending, 1 fulfilled, 2 rejected */
        self._value = undefined;
        self._handlers = [];
        var done = false;

        function finish(state, value) {
            self._state = state;
            self._value = value;
            var list = self._handlers;
            self._handlers = [];
            for (var i = 0; i < list.length; i++) runHandler(self, list[i]);
        }

        function resolve(value) {
            if (done) return;
            done = true;
            adopt(value);
        }

        function adopt(value) {
            if (value === self) { finish(2, new TypeError('Promise resolved with itself')); return; }
            if (value && (typeof value === 'object' || typeof value === 'function')) {
                var then;
                try { then = value.then; } catch (e) { finish(2, e); return; }
                if (typeof then === 'function') {
                    var called = false;
                    try {
                        then.call(value, function (v) { if (!called) { called = true; adopt(v); } },
                            function (r) { if (!called) { called = true; finish(2, r); } });
                    } catch (e2) { if (!called) { called = true; finish(2, e2); } }
                    return;
                }
            }
            finish(1, value);
        }

        function reject(reason) {
            if (done) return;
            done = true;
            finish(2, reason);
        }

        try { executor(resolve, reject); } catch (e) { reject(e); }
    }

    function runHandler(promise, handler) {
        setTimeout(function () {
            var callback = promise._state === 1 ? handler.onFulfilled : handler.onRejected;
            if (typeof callback !== 'function') {
                if (promise._state === 1) handler.resolve(promise._value); else handler.reject(promise._value);
                return;
            }
            var result;
            try { result = callback(promise._value); } catch (e) { handler.reject(e); return; }
            handler.resolve(result);
        }, 0);
    }

    LitePromise.prototype.then = function (onFulfilled, onRejected) {
        var self = this;
        return new LitePromise(function (resolve, reject) {
            var handler = { onFulfilled: onFulfilled, onRejected: onRejected, resolve: resolve, reject: reject };
            if (self._state === 0) self._handlers.push(handler); else runHandler(self, handler);
        });
    };
    LitePromise.prototype['catch'] = function (onRejected) { return this.then(null, onRejected); };
    LitePromise.resolve = function (value) { return new LitePromise(function (resolve) { resolve(value); }); };
    LitePromise.reject = function (reason) { return new LitePromise(function (resolve, reject) { reject(reason); }); };

    var Promise = typeof window.Promise === 'function' ? window.Promise : LitePromise;
    if (typeof window.Promise !== 'function') window.Promise = LitePromise;

    function settleAll(list) {
        return new Promise(function (resolve) {
            var results = [];
            var left = list.length;
            if (!left) { resolve(results); return; }
            function store(index, entry) {
                results[index] = entry;
                left -= 1;
                if (!left) resolve(results);
            }
            for (var i = 0; i < list.length; i++) {
                (function (index) {
                    list[index].then(function (value) { store(index, { ok: true, value: value }); },
                        function (error) { store(index, { ok: false, error: error }); });
                })(i);
            }
        });
    }

    /* ── Session token ── */
    function base64UrlDecode(part) {
        var text = part.replace(/-/g, '+').replace(/_/g, '/');
        while (text.length % 4) text += '=';
        return window.atob ? window.atob(text) : '';
    }

    function readToken() {
        var token = null;
        try { token = window.localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
        if (!token) return null;
        try {
            var payload = JSON.parse(base64UrlDecode(token.split('.')[1] || ''));
            if (payload && typeof payload.exp === 'number' && payload.exp * 1000 < new Date().getTime()) return null;
        } catch (e2) {}
        return token;
    }

    /* ── Network: XMLHttpRequest wrapper ── */
    function request(method, path, body) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            var finished = false;
            var timer = setTimeout(function () {
                if (finished) return;
                finished = true;
                try { xhr.abort(); } catch (e) {}
                var error = new Error('TIMEOUT');
                error.status = 0;
                reject(error);
            }, REQUEST_TIMEOUT_MS);
            xhr.open(method, API_BASE + path, true);
            xhr.setRequestHeader('Accept', 'application/json');
            if (body !== undefined) xhr.setRequestHeader('Content-Type', 'application/json');
            var token = readToken();
            if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4 || finished) return;
                finished = true;
                clearTimeout(timer);
                var data = null;
                try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch (e) { data = null; }
                if (xhr.status >= 200 && xhr.status < 300) { resolve(data); return; }
                var error = new Error('HTTP ' + xhr.status);
                error.status = xhr.status;
                error.data = data;
                reject(error);
            };
            xhr.send(body !== undefined ? JSON.stringify(body) : null);
        });
    }

    var api = {
        spotlight: function () { return request('GET', '/torrents/catalog?kind=movie&page=1&collection=spotlight'); },
        home: function () { return request('GET', '/movies/home'); },
        movies: function (page) { return request('GET', '/movies?page=' + (page || 1) + '&page_size=24'); },
        series: function (page) { return request('GET', '/series?sort=rating_desc' + (page ? '&page=' + page : '') + '&page_size=' + SHELF_LIMIT); },
        torrents: function (page) { return request('GET', '/torrents/catalog?kind=movie&page=' + (page || 1)); },
        genres: function () { return request('GET', '/genres'); },
        genreContent: function (slug, page) { return request('GET', '/movies?genre=' + encodeURIComponent(slug) + '&page=' + (page || 1)); },
        search: function (q) { return request('GET', '/search?q=' + encodeURIComponent(q) + '&page=1&page_size=30'); },
        movieDetail: function (id) { return request('GET', '/movies/' + encodeURIComponent(id)); },
        seriesDetail: function (id) { return request('GET', '/series/' + encodeURIComponent(id)); },
        torrentDetail: function (kind, id) { return request('GET', '/torrents/detail/' + kind + '/' + encodeURIComponent(id)); },
        torrentSources: function (kind, id) { return request('GET', '/torrents/sources/' + kind + '/' + encodeURIComponent(id)); },
        startPlayback: function (movieId) { return request('POST', '/playback/start', { movie_id: movieId }); },
        heartbeat: function (sessionId) { return request('POST', '/playback/heartbeat', { session_id: sessionId }); },
        stopPlayback: function (sessionId) { return request('POST', '/playback/stop', { session_id: sessionId }); },
        startSeriesPlayback: function (episodeId) { return request('POST', '/series_playback/start', { episode_id: episodeId }); },
        torrentTicket: function (body) { return request('POST', '/torrents/playback-ticket', body); },
        startPairing: function () { return request('POST', '/desktop/pairing/start'); },
        pollPairing: function (deviceCode) { return request('POST', '/desktop/pairing/exchange', { device_code: deviceCode }); }
    };

    /* ── Remote control keys ── */
    var KEY_NAMES = {
        arrowleft: 'left', left: 'left', arrowright: 'right', right: 'right', arrowup: 'up', up: 'up',
        arrowdown: 'down', down: 'down', enter: 'select', select: 'select', accept: 'select', ok: 'select',
        escape: 'back', backspace: 'back', goback: 'back', back: 'back', browserback: 'back', exit: 'back',
        mediaplaypause: 'playpause', mediaplay: 'play', mediapause: 'pause',
        mediafastforward: 'forward', mediarewind: 'rewind'
    };

    function resolveKey(event, orsay) {
        var code = event.keyCode || event.which || 0;
        var isOrsay = orsay === undefined ? IS_ORSAY : orsay;

        // Hardware back/return keys: Samsung 88, Tizen 10009, LG 461, Netcast 145, MSX 196, Esc 27, Backspace 8, Orsay 45
        if (code === 88 || code === 10009 || code === 461 || code === 196 || code === 145 || code === 27 || code === 8 || code === 45) {
            return 'back';
        }
        // Hardware select/enter keys: Enter 13, Samsung 29443, Android Center 23, NumpadEnter 66, Space 32, TV 195
        if (code === 13 || code === 29443 || code === 195 || code === 23 || code === 66 || code === 32) {
            return 'select';
        }
        // Android Back (4) vs Samsung Orsay widget Left (4)
        if (code === 4) {
            return isOrsay ? 'left' : 'back';
        }
        // D-pad arrows
        if (code === 37 || code === 214 || code === 205) return 'left';
        if (code === 39 || code === 213 || code === 206 || code === 5) return 'right';
        if (code === 38 || code === 211 || code === 203 || code === 29460) return 'up';
        if (code === 40 || code === 212 || code === 204 || code === 29461) return 'down';

        // Media keys
        if (code === 179 || code === 10252 || code === 463) return 'playpause';
        if (code === 415 || code === 250 || code === 71) return 'play';
        if (code === 19 || code === 74) return 'pause';
        if (code === 417 || code === 228 || code === 72) return 'forward';
        if (code === 412 || code === 227 || code === 69) return 'rewind';

        var name = event.key && event.key !== 'Unidentified' ? String(event.key).toLowerCase() : '';
        return KEY_NAMES.hasOwnProperty(name) ? KEY_NAMES[name] : '';
    }

    function registerTvKeys() {
        try {
            if (window.tizen && window.tizen.tvinputdevice) {
                var names = ['Return', 'Exit', 'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaFastForward', 'MediaRewind'];
                for (var i = 0; i < names.length; i++) {
                    try { window.tizen.tvinputdevice.registerKey(names[i]); } catch (e) {}
                }
            }
        } catch (e2) {}
    }

    /* ── Content model ── */
    function tmdbSize(url, size) {
        if (!url || typeof url !== 'string') return '';
        if (url.indexOf('image.tmdb.org/t/p/') === -1 || url.indexOf('?') !== -1) return url;
        return url.replace(/\/t\/p\/(original|w\d+)\//, '/t/p/' + size + '/');
    }

    function ratingOf(value) {
        return typeof value === 'number' && value > 0 ? value : null;
    }

    function movieCard(movie) {
        return {
            key: 'movie-' + movie.id,
            title: movie.title || '',
            year: movie.year || null,
            rating: ratingOf(movie.rating),
            quality: movie.quality || '1080p',
            lang: '🇷🇺 RU',
            poster: tmdbSize(movie.poster, 'w342'),
            overview: movie.overview || '',
            play: { src: 'catalog', kind: 'movie', id: String(movie.id) }
        };
    }

    function seriesCard(series) {
        return {
            key: 'series-' + series.id,
            title: series.title || '',
            year: series.year || null,
            rating: ratingOf(series.rating),
            quality: 'FHD',
            lang: '🇷🇺 RU',
            poster: tmdbSize(series.poster_url, 'w342'),
            overview: series.overview || '',
            play: { src: 'catalog', kind: 'series', id: String(series.id) }
        };
    }

    function torrentCard(item) {
        return {
            key: 'torrent-' + item.kind + '-' + item.tmdb_id,
            title: item.title || '',
            year: item.year || null,
            rating: ratingOf(item.rating),
            quality: '4K',
            lang: '🇷🇺 RU',
            poster: tmdbSize(item.poster, 'w342'),
            backdrop: tmdbSize(item.backdrop, 'w1280'),
            overview: item.overview || '',
            play: { src: 'torrent', kind: item.kind === 'tv' ? 'tv' : 'movie', id: String(item.tmdb_id) }
        };
    }

    function mapList(list, mapper) {
        var out = [];
        if (!list || !list.length) return out;
        for (var i = 0; i < list.length && out.length < SHELF_LIMIT; i++) {
            if (list[i]) out.push(mapper(list[i]));
        }
        return out;
    }

    /* ── DOM helpers ── */
    function $(id) { return document.getElementById(id); }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.appendChild(document.createTextNode(String(text)));
        return node;
    }

    function hasClass(node, name) { return (' ' + node.className + ' ').indexOf(' ' + name + ' ') !== -1; }
    function addClass(node, name) { if (node && !hasClass(node, name)) node.className = (node.className ? node.className + ' ' : '') + name; }
    function removeClass(node, name) {
        if (!node) return;
        node.className = (' ' + node.className + ' ').replace(' ' + name + ' ', ' ').replace(/^\s+|\s+$/g, '');
    }
    function show(node) { removeClass(node, 'is-hidden'); }
    function hide(node) { addClass(node, 'is-hidden'); }

    function setTransform(node, x, y) {
        var value = 'translate3d(' + x + 'px, ' + y + 'px, 0)';
        node.style.webkitTransform = value;
        node.style.transform = value;
    }

    function setText(node, text) {
        if (!node) return;
        while (node.firstChild) node.removeChild(node.firstChild);
        node.appendChild(document.createTextNode(text));
    }

    function clip(text, length) {
        text = text || '';
        return text.length > length ? text.slice(0, length - 1).replace(/\s+\S*$/, '') + '…' : text;
    }

    var toastTimer = null;
    function toast(text) {
        var node = $('lite-toast');
        setText(node, text);
        show(node);
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { hide(node); }, 3500);
    }

    function fitScreen() {
        var app = $('lite-app');
        var width = window.innerWidth || document.documentElement.clientWidth || 1280;
        var height = window.innerHeight || document.documentElement.clientHeight || 720;
        var scale = width / 1280;
        if (scale > 0.96 && scale < 1.04) scale = 1;
        app.style.zoom = scale === 1 ? '' : String(scale);
        app.style.height = Math.round(height / scale) + 'px';
        $('lite-viewport').style.height = Math.round(height / scale - 52) + 'px';
        $('lite-sidebar').style.height = Math.round(height / scale) + 'px';
        $('lite-content').style.height = Math.round(height / scale) + 'px';
    }

    /* ── State ── */
    var MENU_ITEMS = ['search', 'home', 'movies', 'series', 'torrents', 'genres', 'auth', 'exit'];
    var KB_ROWS = [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '⌫'],
        ['Й', 'Ц', 'У', 'К', 'Е', 'Н', 'Г', 'Ш', 'Щ', 'З', 'Х'],
        ['Ф', 'Ы', 'В', 'А', 'П', 'Р', 'О', 'Л', 'Д', 'Ж', 'Э'],
        ['Я', 'Ч', 'С', 'М', 'И', 'Т', 'Ь', 'Б', 'Ю', 'EN', '␣']
    ];

    var state = {
        mode: 'browse',        /* browse | menu | details | search | genres | auth | player | exit */
        view: 'home',          /* home | grid | search | genres */
        menuIndex: 1,          /* 1 is 'home' */
        rows: [],              /* [{id, node, items: [node], cards: [card], track, col}] */
        row: 0,
        hero: null,
        detailsCard: null,
        detailsFocus: 'play',  /* play | sources | close | source-list | episode */
        detailsSources: [],
        detailsSourceCol: 0,
        detailsEpisodes: [],
        detailsEpisodeCol: 0,
        detailsSeasonCol: 0,
        searchQuery: '',
        kbRow: 0,
        kbCol: 0,
        authFocus: 'cancel',   /* cancel | refresh */
        pendingPlayCard: null,
        exitFocus: 'stay'
    };

    function renderAuthMenuLabel() {
        var label = $('lite-menu-auth-label');
        if (!label) return;
        var token = readToken();
        setText(label, token ? '✓ Профиль' : 'Войти');
    }

    /* ── Sidebar & Menu ── */
    function renderMenu() {
        renderAuthMenuLabel();
        var sidebar = $('lite-sidebar');
        if (state.mode === 'menu') addClass(sidebar, 'is-expanded'); else removeClass(sidebar, 'is-expanded');
        var items = $('lite-menu').querySelectorAll('.lite-menu-item');
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (i === state.menuIndex) {
                if (state.mode === 'menu') addClass(item, 'is-focused'); else removeClass(item, 'is-focused');
            } else {
                removeClass(item, 'is-focused');
            }
            if (MENU_ITEMS[i] === state.view) addClass(item, 'is-active'); else removeClass(item, 'is-active');
        }
    }

    function switchView(viewName) {
        state.view = viewName;
        var titles = { home: 'Главная', movies: 'Фильмы', series: 'Сериалы', torrents: 'Торренты', genres: 'Жанры', search: 'Поиск', auth: 'Привязка ТВ', exit: 'Выход' };
        setText($('lite-view-title'), titles[viewName] || 'KINOSOTA TV');
        hide($('lite-view-home'));
        hide($('lite-view-grid'));
        hide($('lite-view-search'));
        hide($('lite-view-genres'));
        hide($('lite-status'));

        if (viewName === 'home') {
            show($('lite-view-home'));
            state.mode = 'browse';
            applyFocus();
        } else if (viewName === 'movies') {
            state.mode = 'browse';
            loadCatalogGrid('movies', 'Каталог фильмов', api.movies, movieCard);
        } else if (viewName === 'series') {
            state.mode = 'browse';
            loadCatalogGrid('series', 'Каталог сериалов', api.series, seriesCard);
        } else if (viewName === 'torrents') {
            state.mode = 'browse';
            loadCatalogGrid('torrents', 'Каталог торрент-раздач (FHD / 4K)', api.torrents, torrentCard);
        } else if (viewName === 'genres') {
            state.mode = 'browse';
            loadGenresView();
        } else if (viewName === 'search') {
            openSearchView();
        } else if (viewName === 'auth') {
            openAuthModal();
        } else if (viewName === 'exit') {
            openExit();
        }
        renderMenu();
    }

    /* ── Focus Management ── */
    function applyFocus() {
        if (state.mode === 'menu') {
            renderMenu();
            return;
        }
        renderMenu();
        var rows = state.rows;
        for (var r = 0; r < rows.length; r++) {
            for (var c = 0; c < rows[r].items.length; c++) removeClass(rows[r].items[c], 'is-focused');
        }
        var row = rows[state.row];
        if (!row || !row.items.length) return;
        if (row.col >= row.items.length) row.col = row.items.length - 1;
        var currentItem = row.items[row.col];
        addClass(currentItem, 'is-focused');

        if (row.track) {
            var maxStart = Math.max(0, row.items.length - 5);
            var start = Math.min(Math.max(0, row.col - 1), maxStart);
            setTransform(row.track, -start * CARD_STEP, 0);
        }
        var top = state.row === 0 ? 0 : Math.max(0, row.node.offsetTop - 14);
        setTransform($('lite-scroll'), 0, -top);
    }

    function moveFocus(action) {
        var row = state.rows[state.row];
        if (!row) return;

        if (action === 'left') {
            if (row.col > 0) {
                row.col -= 1;
            } else {
                /* At the leftmost card: move into side menu */
                state.mode = 'menu';
                renderMenu();
                return;
            }
        } else if (action === 'right') {
            if (row.col < row.items.length - 1) {
                row.col += 1;
            } else if (!row.track && state.row < state.rows.length - 1) {
                /* Multi-row grids (without horizontal track) wrap to the next line */
                state.row += 1;
                state.rows[state.row].col = 0;
            }
        } else if (action === 'up') {
            if (state.row > 0) {
                state.row -= 1;
                var prevRow = state.rows[state.row];
                if (prevRow.col >= prevRow.items.length) prevRow.col = prevRow.items.length - 1;
            }
        } else if (action === 'down') {
            if (state.row < state.rows.length - 1) {
                state.row += 1;
                var nextRow = state.rows[state.row];
                if (nextRow.col >= nextRow.items.length) nextRow.col = nextRow.items.length - 1;
            }
        }
        applyFocus();
    }

    /* ── Cards & Shelves Rendering ── */
    function posterNode(card) {
        var box = el('div', 'lite-card-poster');
        var fallback = el('div', 'lite-card-fallback', clip(card.title, 40));
        box.appendChild(fallback);
        if (card.poster) {
            var img = document.createElement('img');
            img.alt = '';
            img.onload = function () { fallback.style.display = 'none'; };
            img.onerror = function () { img.style.display = 'none'; fallback.style.display = 'block'; };
            img.src = card.poster;
            box.appendChild(img);
        }
        if (card.rating) box.appendChild(el('span', 'lite-badge-rating', '★ ' + card.rating.toFixed(1)));
        if (card.quality) box.appendChild(el('span', 'lite-badge-quality', card.quality));
        if (card.lang) box.appendChild(el('span', 'lite-badge-lang', card.lang));
        return box;
    }

    function renderHero(card) {
        var hero = $('lite-hero');
        while (hero.firstChild) hero.removeChild(hero.firstChild);
        if (!card) { hide(hero); return null; }
        if (card.backdrop) {
            var img = document.createElement('img');
            img.className = 'lite-hero-image';
            img.alt = '';
            img.onerror = function () { img.style.display = 'none'; };
            img.src = card.backdrop;
            hero.appendChild(img);
        }
        hero.appendChild(el('div', 'lite-hero-shade'));
        var body = el('div', 'lite-hero-body');
        body.appendChild(el('div', 'lite-hero-kicker', 'В ЦЕНТРЕ ВНИМАНИЯ'));
        body.appendChild(el('div', 'lite-hero-title', clip(card.title, 60)));
        var meta = [];
        if (card.year) meta.push(card.year);
        if (card.rating) meta.push('★ ' + card.rating.toFixed(1));
        if (card.quality) meta.push(card.quality);
        if (meta.length) body.appendChild(el('div', 'lite-hero-meta', meta.join(' · ')));
        if (card.overview) body.appendChild(el('div', 'lite-hero-overview', clip(card.overview, 220)));

        var actions = el('div', 'lite-hero-actions');
        var btnPlay = el('span', 'lite-btn is-focused', '▶ Смотреть');
        var btnDetails = el('span', 'lite-btn', 'ℹ О фильме');
        actions.appendChild(btnPlay);
        actions.appendChild(btnDetails);
        body.appendChild(actions);
        hero.appendChild(body);
        show(hero);
        return [btnPlay, btnDetails];
    }

    function renderShelf(title, cards) {
        var shelf = el('div', 'lite-shelf');
        shelf.appendChild(el('div', 'lite-shelf-title', title));
        var windowNode = el('div', 'lite-shelf-window');
        var track = el('div', 'lite-shelf-track');
        var items = [];
        for (var i = 0; i < cards.length; i++) {
            var item = el('div', 'lite-card');
            item.appendChild(posterNode(cards[i]));
            item.appendChild(el('div', 'lite-card-title', cards[i].title));
            track.appendChild(item);
            items.push(item);
        }
        windowNode.appendChild(track);
        shelf.appendChild(windowNode);
        $('lite-shelves').appendChild(shelf);
        return { node: shelf, track: track, items: items };
    }

    function buildHomeRows(heroCard, shelves) {
        state.rows = [];
        $('lite-shelves').innerHTML = '';
        var heroBtns = renderHero(heroCard);
        if (heroBtns && heroBtns.length) {
            state.rows.push({ id: 'hero', node: $('lite-hero'), items: heroBtns, cards: [heroCard, heroCard], track: null, col: 0 });
        }
        for (var i = 0; i < shelves.length; i++) {
            if (!shelves[i].cards.length) continue;
            var view = renderShelf(shelves[i].title, shelves[i].cards);
            state.rows.push({ id: shelves[i].id, node: view.node, items: view.items, cards: shelves[i].cards, track: view.track, col: 0 });
        }
        state.row = 0;
        var status = $('lite-status');
        if (state.rows.length) {
            hide(status);
            applyFocus();
        } else {
            setText(status, 'Подборки сейчас недоступны. Нажмите OK, чтобы повторить.');
            show(status);
        }
    }

    var loadingHome = false;
    function loadHome() {
        if (loadingHome) return null;
        loadingHome = true;
        var status = $('lite-status');
        setText(status, 'Загружаем подборки…');
        show(status);

        return settleAll([api.spotlight(), api.home(), api.series(), api.torrents()]).then(function (results) {
            loadingHome = false;
            var spotlight = results[0].ok && results[0].value && results[0].value.items ? results[0].value.items[0] : null;
            var home = results[1].ok && results[1].value ? results[1].value : {};
            var series = results[2].ok && results[2].value ? results[2].value.items : [];
            var torrents = results[3].ok && results[3].value ? results[3].value.items : [];

            state.hero = spotlight ? torrentCard(spotlight) : (home.popular && home.popular[0] ? movieCard(home.popular[0]) : null);
            buildHomeRows(state.hero, [
                { id: 'popular', title: 'Популярное', cards: mapList(home.popular, movieCard) },
                { id: 'newest', title: 'Новинки', cards: mapList(home.newest, movieCard) },
                { id: 'series', title: 'Сериалы', cards: mapList(series, seriesCard) },
                { id: 'torrents', title: 'Торренты', cards: mapList(torrents, torrentCard) }
            ]);
        });
    }

    /* ── Catalog Grid View ── */
    function loadCatalogGrid(viewId, title, fetchFn, mapper) {
        show($('lite-view-grid'));
        setText($('lite-grid-title'), title);
        var container = $('lite-grid-cards');
        container.innerHTML = '';
        state.rows = [];
        state.row = 0;
        var status = $('lite-status');
        setText(status, 'Загрузка каталога…');
        show(status);

        fetchFn().then(function (res) {
            hide(status);
            var list = res && res.items ? res.items : (Array.isArray(res) ? res : []);
            var cards = mapList(list, mapper);
            if (!cards.length) {
                setText(status, 'Ничего не найдено.');
                show(status);
                return;
            }
            state.rows = [];
            var items = [];
            var COLS = 6;
            for (var i = 0; i < cards.length; i++) {
                var cardNode = el('div', 'lite-card');
                cardNode.appendChild(posterNode(cards[i]));
                cardNode.appendChild(el('div', 'lite-card-title', cards[i].title));
                container.appendChild(cardNode);
                items.push(cardNode);
            }
            for (var r = 0; r < Math.ceil(items.length / COLS); r++) {
                var rowItems = items.slice(r * COLS, (r + 1) * COLS);
                var rowCards = cards.slice(r * COLS, (r + 1) * COLS);
                state.rows.push({ id: viewId + '-' + r, node: rowItems[0], items: rowItems, cards: rowCards, track: null, col: 0 });
            }
            state.row = 0;
            state.mode = 'browse';
            applyFocus();
        })['catch'](function () {
            setText(status, 'Ошибка загрузки. Нажмите OK, чтобы повторить.');
            show(status);
        });
    }

    /* ── Genres View ── */
    function loadGenresView() {
        show($('lite-view-genres'));
        var container = $('lite-genres-grid');
        container.innerHTML = '';
        var status = $('lite-status');
        setText(status, 'Загрузка жанров…');
        show(status);

        api.genres().then(function (genres) {
            hide(status);
            var list = Array.isArray(genres) ? genres : (genres && genres.items ? genres.items : []);
            state.rows = [];
            var items = [];
            var COLS = 4;
            for (var i = 0; i < list.length; i++) {
                var g = list[i];
                var tile = el('div', 'lite-genre-tile');
                tile.appendChild(el('div', 'lite-genre-name', g.name));
                tile.appendChild(el('div', 'lite-genre-sub', 'Смотреть подборку →'));
                container.appendChild(tile);
                items.push(tile);
            }
            for (var r = 0; r < Math.ceil(items.length / COLS); r++) {
                var rowItems = items.slice(r * COLS, (r + 1) * COLS);
                var rowData = list.slice(r * COLS, (r + 1) * COLS);
                state.rows.push({ id: 'genre-row-' + r, node: rowItems[0], items: rowItems, cards: rowData, track: null, col: 0 });
            }
            state.row = 0;
            state.mode = 'browse';
            applyFocus();
        })['catch'](function () {
            setText(status, 'Не удалось загрузить жанры.');
            show(status);
        });
    }

    /* ── Search View with On-Screen Keyboard ── */
    function openSearchView() {
        show($('lite-view-search'));
        state.searchQuery = '';
        updateSearchInput();
        renderKeyboard();
        $('lite-search-results').innerHTML = '';
        state.mode = 'search';
        state.kbRow = 0;
        state.kbCol = 0;
        applyKeyboardFocus();
    }

    function updateSearchInput() {
        var input = $('lite-search-input');
        setText(input, state.searchQuery ? state.searchQuery : 'Введите название фильма…');
    }

    function renderKeyboard() {
        var kb = $('lite-keyboard');
        kb.innerHTML = '';
        for (var r = 0; r < KB_ROWS.length; r++) {
            var rowEl = el('div', 'lite-kb-row');
            for (var c = 0; c < KB_ROWS[r].length; c++) {
                var keyChar = KB_ROWS[r][c];
                var keyEl = el('span', 'lite-kb-key', keyChar);
                if (keyChar === '␣' || keyChar === '⌫' || keyChar === 'EN') addClass(keyEl, 'is-wide');
                rowEl.appendChild(keyEl);
            }
            kb.appendChild(rowEl);
        }
    }

    function applyKeyboardFocus() {
        var rows = $('lite-keyboard').querySelectorAll('.lite-kb-row');
        for (var r = 0; r < rows.length; r++) {
            var keys = rows[r].querySelectorAll('.lite-kb-key');
            for (var c = 0; c < keys.length; c++) {
                if (r === state.kbRow && c === state.kbCol) addClass(keys[c], 'is-focused');
                else removeClass(keys[c], 'is-focused');
            }
        }
    }

    function onSearchKeySelect() {
        var char = KB_ROWS[state.kbRow][state.kbCol];
        if (char === '⌫') {
            if (state.searchQuery.length > 0) state.searchQuery = state.searchQuery.slice(0, -1);
        } else if (char === '␣') {
            state.searchQuery += ' ';
        } else if (char === 'EN' || char === 'RU') {
            // toggle layout
            toast('Язык переключён');
        } else {
            state.searchQuery += char;
        }
        updateSearchInput();
        performSearch();
    }

    var searchTimer = null;
    function performSearch() {
        clearTimeout(searchTimer);
        var q = state.searchQuery.trim();
        if (!q) {
            $('lite-search-results').innerHTML = '';
            return;
        }
        searchTimer = setTimeout(function () {
            api.search(q).then(function (res) {
                var list = res && res.items ? res.items : [];
                var cards = mapList(list, movieCard);
                var container = $('lite-search-results');
                container.innerHTML = '';
                if (!cards.length) {
                    container.appendChild(el('p', 'lite-status', 'По запросу «' + q + '» ничего не найдено.'));
                    return;
                }
                for (var i = 0; i < cards.length; i++) {
                    var cardNode = el('div', 'lite-card');
                    cardNode.appendChild(posterNode(cards[i]));
                    cardNode.appendChild(el('div', 'lite-card-title', cards[i].title));
                    container.appendChild(cardNode);
                }
            })['catch'](function () {});
        }, 300);
    }

    /* ── Movie Details Modal (Lampa style) ── */
    function openDetailsModal(card) {
        if (!card) return;
        state.detailsCard = card;
        state.mode = 'details';
        state.detailsFocus = 'play';
        state.detailsSources = [];
        state.detailsEpisodes = [];

        setText($('lite-details-title'), card.title);
        setText($('lite-details-orig'), card.year ? String(card.year) : '');
        var meta = [];
        if (card.year) meta.push(card.year);
        if (card.rating) meta.push('★ ' + card.rating.toFixed(1));
        if (card.quality) meta.push(card.quality);
        if (card.lang) meta.push(card.lang);
        setText($('lite-details-meta'), meta.join(' · '));
        setText($('lite-details-overview'), card.overview || 'Описание фильма загружается…');

        var posterImg = $('lite-details-poster');
        posterImg.src = card.poster || '';

        var bg = $('lite-details-bg');
        if (card.backdrop) bg.style.backgroundImage = 'url(' + card.backdrop + ')'; else bg.style.backgroundImage = '';

        hide($('lite-sources-wrap'));
        hide($('lite-series-wrap'));
        show($('lite-details'));
        renderDetailsActions();

        // Background fetch extra sources/details
        if (card.play && card.play.src === 'torrent') {
            api.torrentSources('movie', card.play.id).then(function (res) {
                if (res && res.sources && res.sources.length) {
                    state.detailsSources = res.sources;
                    renderDetailsSources();
                }
            })['catch'](function () {});
        } else if (card.play && card.play.kind === 'series') {
            api.seriesDetail(card.play.id).then(function (res) {
                if (res && res.seasons && res.seasons.length) {
                    state.detailsEpisodes = res.seasons;
                    renderSeriesSeasons();
                }
            })['catch'](function () {});
        }
    }

    function closeDetailsModal() {
        hide($('lite-details'));
        state.mode = 'browse';
        applyFocus();
    }

    function renderDetailsActions() {
        var actPlay = $('lite-act-play');
        var actSources = $('lite-act-sources');
        var actClose = $('lite-act-close');
        removeClass(actPlay, 'is-focused');
        removeClass(actSources, 'is-focused');
        removeClass(actClose, 'is-focused');

        if (state.detailsFocus === 'play') addClass(actPlay, 'is-focused');
        else if (state.detailsFocus === 'sources') addClass(actSources, 'is-focused');
        else if (state.detailsFocus === 'close') addClass(actClose, 'is-focused');
    }

    function renderDetailsSources() {
        var list = state.detailsSources;
        var container = $('lite-sources-list');
        container.innerHTML = '';
        if (!list || !list.length) return;
        for (var i = 0; i < list.length && i < 10; i++) {
            var s = list[i];
            var item = el('div', 'lite-source-item');
            var qBadge = el('span', 'lite-source-quality', s.quality || 'HD');
            item.appendChild(qBadge);
            item.appendChild(document.createTextNode(s.title || 'Релиз'));
            if (s.voices && s.voices.length) {
                item.appendChild(el('span', 'lite-source-voices', s.voices.slice(0, 2).join(', ')));
            }
            if (s.size_bytes) {
                var gb = s.size_bytes / 1073741824;
                item.appendChild(el('span', 'lite-source-size', gb >= 1 ? gb.toFixed(1) + ' ГБ' : Math.round(s.size_bytes / 1048576) + ' МБ'));
            }
            container.appendChild(item);
        }
        show($('lite-sources-wrap'));
    }

    function renderSeriesSeasons() {
        var seasons = state.detailsEpisodes;
        if (!seasons || !seasons.length) return;
        var sRow = $('lite-seasons-row');
        sRow.innerHTML = '';
        for (var i = 0; i < seasons.length; i++) {
            var sBtn = el('span', 'lite-season-btn' + (i === 0 ? ' is-active' : ''), 'Сезон ' + seasons[i].season_number);
            sRow.appendChild(sBtn);
        }
        var epTrack = $('lite-episodes-track');
        epTrack.innerHTML = '';
        var episodes = seasons[0].episodes || [];
        for (var j = 0; j < episodes.length; j++) {
            var ep = episodes[j];
            var epCard = el('div', 'lite-episode-card');
            epCard.appendChild(el('div', 'lite-ep-num', ep.episode_number + ' серия'));
            epCard.appendChild(el('div', 'lite-ep-title', ep.title || 'Эпизод ' + ep.episode_number));
            epTrack.appendChild(epCard);
        }
        show($('lite-series-wrap'));
    }

    /* ── Player ── */
    var player = { card: null, sessionId: null, heartbeat: null, barTimer: null, loadId: 0, ready: false };

    function formatTime(seconds) {
        if (!seconds || seconds < 0 || seconds !== seconds || seconds === Infinity) seconds = 0;
        var total = Math.floor(seconds);
        var h = Math.floor(total / 3600);
        var m = Math.floor((total % 3600) / 60);
        var s = total % 60;
        var mm = h ? (m < 10 ? '0' + m : String(m)) : String(m);
        return (h ? h + ':' : '') + mm + ':' + (s < 10 ? '0' + s : s);
    }

    function playerMessage(text) {
        var node = $('lite-player-message');
        setText(node, text || '');
        if (text) show(node); else hide(node);
    }

    function showBar() {
        var bar = $('lite-player-bar');
        removeClass(bar, 'is-faded');
        clearTimeout(player.barTimer);
        player.barTimer = setTimeout(function () {
            var video = $('lite-video');
            if (player.ready && !video.paused) addClass(bar, 'is-faded');
        }, BAR_HIDE_MS);
    }

    function updateProgress() {
        var video = $('lite-video');
        var duration = video.duration && video.duration !== Infinity ? video.duration : 0;
        var current = video.currentTime || 0;
        $('lite-progress-fill').style.width = duration ? Math.round(current / duration * 1184) + 'px' : '0';
        setText($('lite-player-time'), formatTime(current) + ' / ' + formatTime(duration));
        setText($('lite-player-state'), video.paused ? '❚❚' : '▶');
    }

    function failText(error) {
        var status = error && error.status;
        if (status === 401 || status === 403) return 'Для просмотра нужен вход в аккаунт KINOSOTA.';
        if (status === 404 || status === 409 || status === 425) return 'Видео ещё готовится. Попробуйте чуть позже.';
        return 'Не удалось запустить видео. Нажмите OK, чтобы повторить.';
    }

    function noStream() {
        var error = new Error('NO_STREAM');
        error.status = 409;
        return error;
    }

    function firstSeriesEpisode(detail) {
        var seasons = (detail && detail.seasons ? detail.seasons : []).slice(0);
        seasons.sort(function (a, b) { return a.season_number - b.season_number; });
        for (var i = 0; i < seasons.length; i++) {
            var episodes = (seasons[i].episodes || []).slice(0);
            episodes.sort(function (a, b) { return a.episode_number - b.episode_number; });
            for (var j = 0; j < episodes.length; j++) {
                if (episodes[j].is_playable !== false) return episodes[j];
            }
        }
        return null;
    }

    function resolveStream(play) {
        if (play.src === 'torrent') {
            var tmdbId = Number(play.id);
            if (play.kind === 'tv') {
                return api.torrentSources('tv', play.id).then(function (view) {
                    var episode = view && view.episodes && view.episodes.length ? view.episodes[0] : null;
                    if (!episode) throw noStream();
                    return api.torrentTicket({ kind: 'tv', tmdb_id: tmdbId, season: episode.season, episode: episode.episode });
                }).then(function (ticket) { return { url: ticket && ticket.stream_url }; });
            }
            return api.torrentTicket({ kind: 'movie', tmdb_id: tmdbId }).then(function (ticket) { return { url: ticket && ticket.stream_url }; });
        }
        if (play.kind === 'series') {
            return api.seriesDetail(play.id).then(function (detail) {
                var episode = firstSeriesEpisode(detail);
                if (!episode) throw noStream();
                return api.startSeriesPlayback(episode.id);
            }).then(function (res) { return { url: res && res.media_url }; });
        }
        return api.startPlayback(play.id).then(function (res) {
            return { url: res && res.media_url, sessionId: res && res.session_id, heartbeat: res && res.heartbeat_interval_seconds };
        });
    }

    function endSession() {
        clearInterval(player.heartbeat);
        player.heartbeat = null;
        if (player.sessionId) {
            var sessionId = player.sessionId;
            player.sessionId = null;
            api.stopPlayback(sessionId)['catch'](function () {});
        }
    }

    function detachVideo() {
        var video = $('lite-video');
        try { video.pause(); } catch (e) {}
        try { video.removeAttribute('src'); video.load(); } catch (e2) {}
    }

    function startStream() {
        var card = player.card;
        if (!card) return;
        var id = ++player.loadId;
        endSession();
        detachVideo();
        player.ready = false;
        player.needsAuth = false;
        playerMessage('Загружаем видео…');
        showBar();
        resolveStream(card.play).then(function (stream) {
            if (id !== player.loadId) {
                if (stream && stream.sessionId) api.stopPlayback(stream.sessionId)['catch'](function () {});
                return;
            }
            if (!stream || !stream.url) throw noStream();
            if (stream.sessionId) {
                player.sessionId = stream.sessionId;
                var every = (stream.heartbeat > 0 ? stream.heartbeat : 30) * 1000;
                player.heartbeat = setInterval(function () {
                    if (player.sessionId) api.heartbeat(player.sessionId)['catch'](function () {});
                }, every);
            }
            var video = $('lite-video');
            video.src = stream.url;
            try { video.load(); } catch (e) {}
            try {
                var started = video.play();
                if (started && typeof started.then === 'function') started.then(null, function () {});
            } catch (e2) {}
            player.ready = true;
            playerMessage('');
            showBar();
        })['catch'](function (error) {
            if (id !== player.loadId) return;
            player.ready = false;
            var st = error && error.status;
            if (st === 401 || st === 403) {
                player.needsAuth = true;
            }
            playerMessage(failText(error));
            showBar();
        });
    }

    function openPlayer(card) {
        if (!card) return;
        player.card = card;
        state.mode = 'player';
        setText($('lite-player-title'), card.title + (card.year ? ' (' + card.year + ')' : ''));
        $('lite-progress-fill').style.width = '0';
        setText($('lite-player-time'), '0:00 / 0:00');
        show($('lite-player'));
        startStream();
    }

    function closePlayer() {
        player.loadId += 1;
        endSession();
        detachVideo();
        clearTimeout(player.barTimer);
        player.card = null;
        player.ready = false;
        hide($('lite-player'));
        state.mode = 'browse';
        applyFocus();
    }

    function seek(delta) {
        var video = $('lite-video');
        if (!player.ready) return;
        var duration = video.duration && video.duration !== Infinity ? video.duration : 0;
        var target = (video.currentTime || 0) + delta;
        if (target < 0) target = 0;
        if (duration && target > duration - 1) target = duration - 1;
        try { video.currentTime = target; } catch (e) {}
        updateProgress();
        showBar();
    }

    function togglePlay(force) {
        var video = $('lite-video');
        if (!player.ready) { startStream(); return; }
        var wantPlay = force === 'play' || (force !== 'pause' && video.paused);
        try {
            if (wantPlay) {
                var started = video.play();
                if (started && typeof started.then === 'function') started.then(null, function () {});
            } else {
                video.pause();
            }
        } catch (e) {}
        updateProgress();
        showBar();
    }

    function onPlayerKey(action) {
        if (action === 'back') { closePlayer(); return true; }
        if (action === 'select') {
            if (!player.ready && player.needsAuth) {
                closePlayer();
                openAuthModal(player.card);
                return true;
            }
            togglePlay();
            return true;
        }
        if (action === 'playpause') { togglePlay(); return true; }
        if (action === 'play' || action === 'pause') { togglePlay(action); return true; }
        if (action === 'left' || action === 'rewind') { seek(-SEEK_STEP); return true; }
        if (action === 'right' || action === 'forward') { seek(SEEK_STEP); return true; }
        if (action === 'up' || action === 'down') { showBar(); return true; }
        return false;
    }

    /* ── Auth / Device Pairing ── */
    var authPolling = null;
    var currentDeviceCode = null;

    function openAuthModal(onSuccessPlayCard) {
        state.mode = 'auth';
        state.authFocus = 'cancel';
        state.pendingPlayCard = onSuccessPlayCard || null;
        renderAuthActions();
        show($('lite-auth'));
        fetchPairing();
    }

    function closeAuthModal() {
        if (authPolling) { clearInterval(authPolling); authPolling = null; }
        currentDeviceCode = null;
        state.pendingPlayCard = null;
        hide($('lite-auth'));
        state.mode = 'browse';
        applyFocus();
    }

    function renderAuthActions() {
        var btnRefresh = $('lite-auth-refresh');
        var btnCancel = $('lite-auth-cancel');
        removeClass(btnRefresh, 'is-focused');
        removeClass(btnCancel, 'is-focused');
        if (state.authFocus === 'refresh') addClass(btnRefresh, 'is-focused');
        else addClass(btnCancel, 'is-focused');
    }

    function fetchPairing() {
        if (authPolling) { clearInterval(authPolling); authPolling = null; }
        var statusEl = $('lite-auth-status');
        var codeEl = $('lite-auth-code');
        var qrEl = $('lite-auth-qr');
        var urlEl = $('lite-auth-url');
        setText(statusEl, 'Запрашиваем код привязки…');
        setText(codeEl, '····-····');

        api.startPairing().then(function (res) {
            if (!res || !res.device_code) {
                setText(statusEl, 'Не удалось получить код. Нажмите «Обновить код».');
                return;
            }
            currentDeviceCode = res.device_code;
            var uCode = res.user_code || '';
            var formatted = uCode.length === 8 ? uCode.slice(0, 4) + '-' + uCode.slice(4) : uCode;
            setText(codeEl, formatted);
            var uri = res.verification_uri || ('https://watch.scenrix.com/profile?player_code=' + encodeURIComponent(uCode));
            setText(urlEl, uri.replace(/^https?:\/\//, ''));
            if (qrEl) {
                qrEl.src = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(uri);
            }
            setText(statusEl, 'Ожидание подтверждения на телефоне…');

            var delay = (res.interval && res.interval >= 3 ? res.interval : 4) * 1000;
            authPolling = setInterval(function () {
                if (state.mode !== 'auth' || !currentDeviceCode) {
                    clearInterval(authPolling);
                    authPolling = null;
                    return;
                }
                api.pollPairing(currentDeviceCode).then(function (pollRes) {
                    if (pollRes && pollRes.status === 'authorized' && pollRes.access_token) {
                        clearInterval(authPolling);
                        authPolling = null;
                        try { window.localStorage.setItem(TOKEN_KEY, pollRes.access_token); } catch (e) {}
                        setText(statusEl, '✓ Вход выполнен успешно!');
                        toast('Телевизор успешно привязан!');
                        renderAuthMenuLabel();
                        var toPlay = state.pendingPlayCard;
                        setTimeout(function () {
                            closeAuthModal();
                            if (toPlay) openPlayer(toPlay);
                        }, 1000);
                    }
                })['catch'](function () {});
            }, delay);
        })['catch'](function () {
            setText(statusEl, 'Ошибка сети. Нажмите «Обновить код».');
        });
    }

    function onAuthKey(action) {
        if (action === 'left' || action === 'right') {
            state.authFocus = state.authFocus === 'cancel' ? 'refresh' : 'cancel';
            renderAuthActions();
            return true;
        }
        if (action === 'select') {
            if (state.authFocus === 'refresh') {
                fetchPairing();
            } else {
                closeAuthModal();
            }
            return true;
        }
        if (action === 'back') {
            closeAuthModal();
            return true;
        }
        return false;
    }

    /* ── Exit Dialog ── */
    var exiting = false;
    function exitToLauncher() {
        if (exiting) return;
        exiting = true;
        var startUrl = window.location.href;
        try {
            if (window.TVXInteractionPlugin && window.TVXInteractionPlugin.executeAction) window.TVXInteractionPlugin.executeAction('back');
        } catch (e) {}
        try {
            var steps = 1 - window.history.length;
            if (steps < 0) window.history.go(steps);
        } catch (e2) {}
        setTimeout(function () {
            exiting = false;
            if (window.location.href !== startUrl) return;
            try { window.location.replace(LAUNCHER_URL); } catch (e3) { window.location.href = LAUNCHER_URL; }
        }, EXIT_FALLBACK_MS);
    }

    function renderExit() {
        var leave = $('lite-exit-leave');
        var stay = $('lite-exit-stay');
        if (state.exitFocus === 'exit') { addClass(leave, 'is-focused'); removeClass(stay, 'is-focused'); } else { addClass(stay, 'is-focused'); removeClass(leave, 'is-focused'); }
    }

    function openExit() {
        state.mode = 'exit';
        state.exitFocus = 'stay';
        renderExit();
        show($('lite-exit'));
    }

    function closeExit() {
        hide($('lite-exit'));
        state.mode = 'browse';
        applyFocus();
    }

    function onExitKey(action) {
        if (action === 'left') { state.exitFocus = 'exit'; renderExit(); return true; }
        if (action === 'right') { state.exitFocus = 'stay'; renderExit(); return true; }
        if (action === 'back') { closeExit(); return true; }
        if (action === 'select') {
            if (state.exitFocus === 'exit') { hide($('lite-exit')); state.mode = 'browse'; exitToLauncher(); } else { closeExit(); }
            return true;
        }
        return action !== '';
    }

    /* ── Keyboard / Search Key Handling ── */
    function onSearchKey(action) {
        if (action === 'left') {
            if (state.kbCol > 0) {
                state.kbCol -= 1;
                applyKeyboardFocus();
            } else {
                state.mode = 'menu';
                renderMenu();
            }
            return true;
        }
        if (action === 'right') {
            if (state.kbCol < KB_ROWS[state.kbRow].length - 1) {
                state.kbCol += 1;
                applyKeyboardFocus();
            }
            return true;
        }
        if (action === 'up') {
            if (state.kbRow > 0) {
                state.kbRow -= 1;
                state.kbCol = Math.min(state.kbCol, KB_ROWS[state.kbRow].length - 1);
                applyKeyboardFocus();
            }
            return true;
        }
        if (action === 'down') {
            if (state.kbRow < KB_ROWS.length - 1) {
                state.kbRow += 1;
                state.kbCol = Math.min(state.kbCol, KB_ROWS[state.kbRow].length - 1);
                applyKeyboardFocus();
            }
            return true;
        }
        if (action === 'select') {
            onSearchKeySelect();
            return true;
        }
        if (action === 'back') {
            switchView('home');
            return true;
        }
        return false;
    }

    /* ── Details Modal Key Handling ── */
    function onDetailsKey(action) {
        if (action === 'left') {
            if (state.detailsFocus === 'close') state.detailsFocus = 'sources';
            else if (state.detailsFocus === 'sources') state.detailsFocus = 'play';
            renderDetailsActions();
            return true;
        }
        if (action === 'right') {
            if (state.detailsFocus === 'play') state.detailsFocus = 'sources';
            else if (state.detailsFocus === 'sources') state.detailsFocus = 'close';
            renderDetailsActions();
            return true;
        }
        if (action === 'select') {
            if (state.detailsFocus === 'play') {
                hide($('lite-details'));
                openPlayer(state.detailsCard);
            } else if (state.detailsFocus === 'sources') {
                show($('lite-sources-wrap'));
                toast('Выбор озвучки');
            } else if (state.detailsFocus === 'close') {
                closeDetailsModal();
            }
            return true;
        }
        if (action === 'back') {
            closeDetailsModal();
            return true;
        }
        return false;
    }

    /* ── Side Menu Key Handling ── */
    function onMenuKey(action) {
        if (action === 'up') {
            if (state.menuIndex > 0) state.menuIndex -= 1;
            renderMenu();
            return true;
        }
        if (action === 'down') {
            if (state.menuIndex < MENU_ITEMS.length - 1) state.menuIndex += 1;
            renderMenu();
            return true;
        }
        if (action === 'right' || action === 'back') {
            state.mode = state.view === 'search' ? 'search' : 'browse';
            renderMenu();
            if (state.mode === 'search') {
                applyKeyboardFocus();
            } else {
                applyFocus();
            }
            return true;
        }
        if (action === 'select') {
            switchView(MENU_ITEMS[state.menuIndex]);
            return true;
        }
        return false;
    }

    /* ── Browse Key Handling (Home / Shelves / Grids) ── */
    function onBrowseKey(action) {
        if (action === 'left' || action === 'right' || action === 'up' || action === 'down') {
            moveFocus(action);
            return true;
        }
        if (action === 'select') {
            if (!state.rows.length) { loadHome(); return true; }
            var row = state.rows[state.row];
            if (!row || !row.cards || !row.cards[row.col]) return true;
            var chosen = row.cards[row.col];
            if (state.row === 0 && row.id === 'hero') {
                if (row.col === 0) {
                    openPlayer(chosen);
                } else {
                    openDetailsModal(chosen);
                }
            } else if (chosen.play) {
                // Open Movie Details Sheet / Modal
                openDetailsModal(chosen);
            } else if (chosen.slug) {
                // Genre tile clicked: open movies of this genre
                loadCatalogGrid('genre-' + chosen.slug, 'Жанр: ' + chosen.name, function () { return api.genreContent(chosen.slug); }, movieCard);
            }
            return true;
        }
        if (action === 'back') {
            if (state.view !== 'home') {
                switchView('home');
            } else if (state.row > 0) {
                state.row = 0;
                applyFocus();
            } else {
                openExit();
            }
            return true;
        }
        return false;
    }

    function onKeyDown(event) {
        var action = resolveKey(event);
        if (!action) return;
        var handled;
        if (state.mode === 'player') handled = onPlayerKey(action);
        else if (state.mode === 'auth') handled = onAuthKey(action);
        else if (state.mode === 'exit') handled = onExitKey(action);
        else if (state.mode === 'details') handled = onDetailsKey(action);
        else if (state.mode === 'search') handled = onSearchKey(action);
        else if (state.mode === 'menu') handled = onMenuKey(action);
        else handled = onBrowseKey(action);

        if (handled) {
            if (event.preventDefault) event.preventDefault();
            if (event.stopPropagation) event.stopPropagation();
        }
    }

    function bindVideo() {
        var video = $('lite-video');
        video.addEventListener('timeupdate', updateProgress, false);
        video.addEventListener('play', function () { updateProgress(); showBar(); }, false);
        video.addEventListener('pause', function () { updateProgress(); showBar(); }, false);
        video.addEventListener('waiting', function () { if (player.ready) playerMessage('Буферизация…'); }, false);
        video.addEventListener('playing', function () { playerMessage(''); }, false);
        video.addEventListener('ended', function () { closePlayer(); toast('Просмотр завершён'); }, false);
        video.addEventListener('error', function () {
            if (!player.card || !video.getAttribute('src')) return;
            player.ready = false;
            playerMessage('Телевизор не смог воспроизвести это видео. Нажмите OK, чтобы повторить.');
            showBar();
        }, false);
    }

    function boot() {
        if (window.KinosotaLite && window.KinosotaLite.destroy) window.KinosotaLite.destroy();
        var match = (window.location.search || '').match(/[?&]token=([^&]+)/);
        if (match && match[1]) {
            try { window.localStorage.setItem(TOKEN_KEY, decodeURIComponent(match[1])); } catch (e) {}
        }
        renderAuthMenuLabel();
        registerTvKeys();
        fitScreen();
        bindVideo();
        document.addEventListener('keydown', onKeyDown, false);
        window.addEventListener('resize', fitScreen, false);
        window.addEventListener('pagehide', endSession, false);
        window.addEventListener('beforeunload', endSession, false);
        loadHome();
    }

    function destroy() {
        if (authPolling) { clearInterval(authPolling); authPolling = null; }
        document.removeEventListener('keydown', onKeyDown, false);
        window.removeEventListener('resize', fitScreen, false);
        window.removeEventListener('pagehide', endSession, false);
        window.removeEventListener('beforeunload', endSession, false);
        player.loadId += 1;
        endSession();
        clearTimeout(player.barTimer);
        clearTimeout(toastTimer);
    }

    var hook = {
        resolveKey: resolveKey,
        tmdbSize: tmdbSize,
        formatTime: formatTime,
        state: state,
        player: player,
        openAuth: openAuthModal,
        reload: loadHome,
        destroy: destroy,
        LitePromise: LitePromise
    };

    boot();
    window.KinosotaLite = hook;
})(window, document);
