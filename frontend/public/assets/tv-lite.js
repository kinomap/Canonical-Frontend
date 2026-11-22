/*
 * KINOSOTA Lite TV portal (/tv/lite) — TV_MULTI_EPOCH_PORTAL_SPEC.md §4.
 * Strict ES5 / vanilla JS for 2012–2017 Smart TVs (Samsung Orsay / Maple WebKit 537, early Tizen,
 * LG Netcast / webOS 1–3, Android 4.4–7 boxes): no let/const, arrow functions, classes, template
 * strings or ES modules. Network goes through XMLHttpRequest with a Promise polyfill.
 * Only existing public /api/v1 endpoints are used (the same ones as the Next-Gen /tv portal).
 */
(function (window, document) {
    'use strict';

    var API_BASE = '/api/v1';
    var LAUNCHER_URL = 'http://www.kinosota.devs.surf/';
    var TOKEN_KEY = 'tg_stream_access_token';
    var SHELF_LIMIT = 20;
    var SEEK_STEP = 30;
    var CARD_STEP = 180;          /* .lite-card width + margin-right (px) */
    var REQUEST_TIMEOUT_MS = 20000;
    var EXIT_FALLBACK_MS = 600;
    var BAR_HIDE_MS = 4000;

    var ua = (window.navigator && window.navigator.userAgent ? window.navigator.userAgent : '').toLowerCase();
    var IS_ORSAY = ua.indexOf('maple') !== -1 ||
        (ua.indexOf('smarttv') !== -1 && ua.indexOf('tizen') === -1 && ua.indexOf('web0s') === -1 && ua.indexOf('webos') === -1);

    /* ── Promise polyfill (only when the TV has no native Promise) ── */
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

    /** Promise.allSettled replacement: never rejects, gives {ok, value|error} per request. */
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

    /* ── Session token (shared with the Next-Gen portal on the same origin) ── */
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
        } catch (e2) { /* not a JWT we can read: send as is */ }
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
        series: function () { return request('GET', '/series?sort=rating_desc&page_size=' + SHELF_LIMIT); },
        torrents: function () { return request('GET', '/torrents/catalog?kind=movie&page=1'); },
        seriesDetail: function (id) { return request('GET', '/series/' + encodeURIComponent(id)); },
        torrentSources: function (kind, id) { return request('GET', '/torrents/sources/' + kind + '/' + encodeURIComponent(id)); },
        startPlayback: function (movieId) { return request('POST', '/playback/start', { movie_id: movieId }); },
        heartbeat: function (sessionId) { return request('POST', '/playback/heartbeat', { session_id: sessionId }); },
        stopPlayback: function (sessionId) { return request('POST', '/playback/stop', { session_id: sessionId }); },
        startSeriesPlayback: function (episodeId) { return request('POST', '/series_playback/start', { episode_id: episodeId }); },
        torrentTicket: function (body) { return request('POST', '/torrents/playback-ticket', body); }
    };

    /* ── Remote control keys ── */
    var KEYS = {
        left: [37, 214, 205],
        right: [39, 213, 206],
        up: [38, 211, 203],
        down: [40, 212, 204],
        select: [13, 29443, 195, 23, 66],
        back: [27, 8, 10009, 461, 196, 145],
        playpause: [179, 10252, 463],
        play: [415, 250],
        pause: [19],
        forward: [417, 228],
        rewind: [412, 227]
    };
    /* Samsung Orsay (Maple) widget key codes; 4 is LEFT there, but Android BACK everywhere else. */
    var ORSAY_KEYS = { left: [4], right: [5], up: [29460], down: [29461], back: [88, 45], play: [71], pause: [74], forward: [72], rewind: [69] };
    var KEY_NAMES = {
        arrowleft: 'left', left: 'left', arrowright: 'right', right: 'right', arrowup: 'up', up: 'up',
        arrowdown: 'down', down: 'down', enter: 'select', select: 'select', accept: 'select', ok: 'select',
        escape: 'back', backspace: 'back', goback: 'back', back: 'back', browserback: 'back', exit: 'back',
        mediaplaypause: 'playpause', mediaplay: 'play', mediapause: 'pause',
        mediafastforward: 'forward', mediarewind: 'rewind'
    };

    function inList(list, code) {
        if (!list) return false;
        for (var i = 0; i < list.length; i++) if (list[i] === code) return true;
        return false;
    }

    /** Remote key → action ('left'|'right'|'up'|'down'|'select'|'back'|'playpause'|'play'|'pause'|'forward'|'rewind'|''). */
    function resolveKey(event, orsay) {
        var code = event.keyCode || event.which || 0;
        var isOrsay = orsay === undefined ? IS_ORSAY : orsay;
        var action;
        if (isOrsay) {
            for (action in ORSAY_KEYS) {
                if (ORSAY_KEYS.hasOwnProperty(action) && inList(ORSAY_KEYS[action], code)) return action;
            }
        } else if (code === 4) {
            return 'back';
        }
        for (action in KEYS) {
            if (KEYS.hasOwnProperty(action) && inList(KEYS[action], code)) return action;
        }
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
    /** TMDB pictures are resized (originals are too heavy for 512 MB TVs); any other URL is kept as is. */
    function tmdbSize(url, size) {
        if (!url || typeof url !== 'string') return '';
        if (url.indexOf('image.tmdb.org/t/p/') === -1 || url.indexOf('?') !== -1) return url;
        return url.replace(/\/t\/p\/(original|w\d+)\//, '/t/p/' + size + '/');
    }

    function ratingOf(value) {
        return typeof value === 'number' && value > 0 ? value : null;
    }

    function movieCard(movie) {
        return { key: 'movie-' + movie.id, title: movie.title || '', year: movie.year || null, rating: ratingOf(movie.rating),
            poster: tmdbSize(movie.poster, 'w342'), play: { src: 'catalog', kind: 'movie', id: String(movie.id) } };
    }

    function seriesCard(series) {
        return { key: 'series-' + series.id, title: series.title || '', year: series.year || null, rating: ratingOf(series.rating),
            poster: tmdbSize(series.poster_url, 'w342'), play: { src: 'catalog', kind: 'series', id: String(series.id) } };
    }

    function torrentCard(item) {
        return { key: 'torrent-' + item.kind + '-' + item.tmdb_id, title: item.title || '', year: item.year || null, rating: ratingOf(item.rating),
            poster: tmdbSize(item.poster, 'w342'), backdrop: tmdbSize(item.backdrop, 'w1280'), overview: item.overview || '',
            play: { src: 'torrent', kind: item.kind === 'tv' ? 'tv' : 'movie', id: String(item.tmdb_id) } };
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
    function isShown(node) { return node && !hasClass(node, 'is-hidden'); }

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

    /** The layout is drawn for 1280px; zoom it to the TV browser width (720p / 1080p screens). */
    function fitScreen() {
        var app = $('lite-app');
        var width = window.innerWidth || document.documentElement.clientWidth || 1280;
        var height = window.innerHeight || document.documentElement.clientHeight || 720;
        var scale = width / 1280;
        if (scale > 0.95 && scale < 1.05) scale = 1;
        app.style.zoom = scale === 1 ? '' : String(scale);
        app.style.height = Math.round(height / scale) + 'px';
        $('lite-viewport').style.height = Math.round(height / scale - 64) + 'px';
    }

    /* ── State ── */
    var state = {
        rows: [],          /* [{id, node, items: [node], cards: [card], track, col}] */
        row: 0,
        mode: 'browse',    /* browse | player | exit */
        exitFocus: 'stay',
        hero: null
    };

    function focusedNode() {
        var row = state.rows[state.row];
        return row ? row.items[row.col] : null;
    }

    function applyFocus() {
        var rows = state.rows;
        for (var r = 0; r < rows.length; r++) {
            for (var c = 0; c < rows[r].items.length; c++) removeClass(rows[r].items[c], 'is-focused');
        }
        var row = rows[state.row];
        if (!row) return;
        addClass(row.items[row.col], 'is-focused');
        if (row.track) {
            var maxStart = Math.max(0, row.items.length - 6);
            var start = Math.min(Math.max(0, row.col - 1), maxStart);
            setTransform(row.track, -start * CARD_STEP, 0);
        }
        var top = state.row === 0 ? 0 : row.node.offsetTop - 8;
        setTransform($('lite-scroll'), 0, -top);
    }

    function moveFocus(action) {
        var row = state.rows[state.row];
        if (!row) return;
        if (action === 'left' && row.col > 0) row.col -= 1;
        else if (action === 'right' && row.col < row.items.length - 1) row.col += 1;
        else if (action === 'up' && state.row > 0) state.row -= 1;
        else if (action === 'down' && state.row < state.rows.length - 1) state.row += 1;
        applyFocus();
    }

    /* ── Rendering ── */
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
        if (card.rating) box.appendChild(el('span', 'lite-card-rating', card.rating.toFixed(1)));
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
        if (meta.length) body.appendChild(el('div', 'lite-hero-meta', meta.join(' · ')));
        if (card.overview) body.appendChild(el('div', 'lite-hero-overview', clip(card.overview, 220)));
        var button = el('span', 'lite-btn', '▶ Смотреть');
        body.appendChild(button);
        hero.appendChild(body);
        show(hero);
        return button;
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

    function buildRows(heroCard, shelves) {
        state.rows = [];
        $('lite-shelves').innerHTML = '';
        var button = renderHero(heroCard);
        if (button) state.rows.push({ id: 'hero', node: $('lite-hero'), items: [button], cards: [heroCard], track: null, col: 0 });
        for (var i = 0; i < shelves.length; i++) {
            if (!shelves[i].cards.length) continue;
            var view = renderShelf(shelves[i].title, shelves[i].cards);
            state.rows.push({ id: shelves[i].id, node: view.node, items: view.items, cards: shelves[i].cards, track: view.track, col: 0 });
        }
        state.row = 0;
        var status = $('lite-status');
        if (state.rows.length) { hide(status); applyFocus(); } else {
            setText(status, 'Подборки сейчас недоступны. Нажмите OK, чтобы повторить.');
            show(status);
        }
    }

    var loading = false;
    function loadCatalog() {
        if (loading) return null;
        loading = true;
        var status = $('lite-status');
        setText(status, 'Загружаем подборки…');
        show(status);
        return settleAll([api.spotlight(), api.home(), api.series(), api.torrents()]).then(function (results) {
            loading = false;
            var spotlight = results[0].ok && results[0].value && results[0].value.items ? results[0].value.items[0] : null;
            var home = results[1].ok && results[1].value ? results[1].value : {};
            var series = results[2].ok && results[2].value ? results[2].value.items : [];
            var torrents = results[3].ok && results[3].value ? results[3].value.items : [];
            state.hero = spotlight ? torrentCard(spotlight) : null;
            buildRows(state.hero, [
                { id: 'popular', title: 'Популярное', cards: mapList(home.popular, movieCard) },
                { id: 'newest', title: 'Новинки', cards: mapList(home.newest, movieCard) },
                { id: 'series', title: 'Сериалы', cards: mapList(series, seriesCard) },
                { id: 'torrents', title: 'Торренты', cards: mapList(torrents, torrentCard) }
            ]);
        });
    }

    /* ── Player (native HTML5 <video>: progressive MP4 / HLS through the TV's own player) ── */
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

    /** Stream URL for a card, through the same endpoints as the Next-Gen TV player. */
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
        if (action === 'select' || action === 'playpause') { togglePlay(); return true; }
        if (action === 'play' || action === 'pause') { togglePlay(action); return true; }
        if (action === 'left' || action === 'rewind') { seek(-SEEK_STEP); return true; }
        if (action === 'right' || action === 'forward') { seek(SEEK_STEP); return true; }
        if (action === 'up' || action === 'down') { showBar(); return true; }
        return false;
    }

    /* ── Exit: back to Media Station X / the KINOSOTA launcher, never a dead end ── */
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

    /* ── Browse keys ── */
    function onBrowseKey(action) {
        if (action === 'left' || action === 'right' || action === 'up' || action === 'down') { moveFocus(action); return true; }
        if (action === 'select') {
            if (!state.rows.length) { loadCatalog(); return true; }
            var row = state.rows[state.row];
            openPlayer(row.cards[row.col]);
            return true;
        }
        if (action === 'back') {
            /* Back on a shelf returns to the top row; on the top row it asks before leaving. */
            if (state.row > 0) { state.row = 0; applyFocus(); } else { openExit(); }
            return true;
        }
        return false;
    }

    function onKeyDown(event) {
        var action = resolveKey(event);
        if (!action) return;
        var handled;
        if (state.mode === 'player') handled = onPlayerKey(action);
        else if (state.mode === 'exit') handled = onExitKey(action);
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
        /* A second copy of the script (tests, double include) replaces the first one cleanly. */
        if (window.KinosotaLite && window.KinosotaLite.destroy) window.KinosotaLite.destroy();
        registerTvKeys();
        fitScreen();
        bindVideo();
        document.addEventListener('keydown', onKeyDown, false);
        window.addEventListener('resize', fitScreen, false);
        window.addEventListener('pagehide', endSession, false);
        window.addEventListener('beforeunload', endSession, false);
        loadCatalog();
    }

    function destroy() {
        document.removeEventListener('keydown', onKeyDown, false);
        window.removeEventListener('resize', fitScreen, false);
        window.removeEventListener('pagehide', endSession, false);
        window.removeEventListener('beforeunload', endSession, false);
        player.loadId += 1;
        endSession();
        clearTimeout(player.barTimer);
        clearTimeout(toastTimer);
    }

    /* Small read-only hook for automated tests. */
    var hook = {
        resolveKey: resolveKey,
        tmdbSize: tmdbSize,
        formatTime: formatTime,
        state: state,
        player: player,
        reload: loadCatalog,
        destroy: destroy,
        LitePromise: LitePromise
    };

    boot();
    window.KinosotaLite = hook;
})(window, document);
