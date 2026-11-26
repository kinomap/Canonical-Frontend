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
    var appVer = (window.navigator && window.navigator.appVersion ? window.navigator.appVersion : '').toLowerCase();
    var IS_WEBOS = ua.indexOf('webos') !== -1 || ua.indexOf('web0s') !== -1;
    var IS_TIZEN = ua.indexOf('tizen') !== -1;
    var IS_ORSAY = ua.indexOf('maple') !== -1 || appVer.indexOf('maple') !== -1 ||
        ua.indexOf('smarthub') !== -1 ||
        typeof window.curWidget !== 'undefined' || typeof window.Common !== 'undefined' ||
        (ua.indexOf('smarttv') !== -1 && !IS_TIZEN && !IS_WEBOS) ||
        (ua.indexOf('smart-tv') !== -1 && ua.indexOf('samsung') !== -1 && !IS_TIZEN && !IS_WEBOS) ||
        (ua.indexOf('samsung') !== -1 && !IS_TIZEN && ua.indexOf('netcast') === -1 && ua.indexOf('webkit/53') !== -1);
    var IS_TV = IS_ORSAY || IS_TIZEN || IS_WEBOS || ua.indexOf('netcast') !== -1 || ua.indexOf('smarttv') !== -1 ||
        ua.indexOf('smart-tv') !== -1 || ua.indexOf('hbbtv') !== -1;

    /* ── Native video plane geometry and decoder hand-over ──
       Orsay SEF / legacy Player plugins take video coordinates in their own 960x540 grid, whatever the panel
       or the page resolution (MSX runs the page as a 1280x720 widget, curWidget = 1280x720).
       Orsay AVPlay ($MANAGER_WIDGET webapis wrapper) takes curWidget coordinates (Lampa parity).
       Tizen AVPlay always takes 1920x1080, even on UHD panels. */
    var ORSAY_GRID_W = 960;
    var ORSAY_GRID_H = 540;
    var TIZEN_GRID_W = 1920;
    var TIZEN_GRID_H = 1080;
    /* SEF Player versions: 1.112 for E/F/H (2012–2014), 1.000 for late D (2011). */
    var SEF_PLAYER_VERSIONS = ['1.112', '1.000'];
    /* TV decoders usually hold a single stream: wait this long after destroy/close before the next open(). */
    var DECODER_RELEASE_MS = IS_ORSAY ? 500 : 150;
    /* Orsay stage hand-over (ad -> intro -> film). Live logs v9/v10: a torn-down AVPlay/SEF session keeps
       echoing RENDER_ERROR 6:2 / 6:3 for up to ~3 s after destroy()/Close(). The next stage therefore opens
       ORSAY_STAGE_RELEASE_MS after the release, and a type-6 error that arrives before STREAM_INFO_READY (9)
       within ORSAY_ECHO_MS of a release is treated as an echo for ORSAY_ECHO_GRACE_MS first. */
    var ORSAY_STAGE_RELEASE_MS = 1500;
    var ORSAY_ECHO_MS = 3500;
    var ORSAY_ECHO_GRACE_MS = 1500;
    /* v15 cinema pipeline (Intro >= 5 s -> Pre-roll -> Film), 1:1 with VideoPlayer.vue / TorrentPlayer.vue:
       the intro is never cut before MIN_INTRO_MS and hands over only once the film's first bytes arrived
       (probeStreamFirstBytes: one plain XHR Range request, no second decoder) or the probe gave up after
       FILM_PREPROBE_MAX_WAIT_MS. */
    var MIN_INTRO_MS = 5000;
    var FILM_PREPROBE_MAX_WAIT_MS = 12000;
    var FILM_PROBE_RANGE = 'bytes=0-65535';
    /* Stage hand-over veil (#lite-transition-veil, #070b0e): 400 ms over native planes (Orsay / Tizen),
       900 ms dissolve + volume fade in HTML5 mode. */
    var VEIL_FADE_MS = 400;
    var DISSOLVE_MS = 900;
    /* 'Запускаем поток…' only when the film shows no frame for this long after its stage started. */
    var FILM_NOTICE_MS = 3000;
    /* A stage that rendered (7), saw no error event and is released on purpose (av_ev:8, or stop() +
       destroy() under the veil) frees the Orsay decoder much faster than a failed one: the next stage opens
       ORSAY_CLEAN_RELEASE_MS after it. Failed / never-rendered stages keep ORSAY_STAGE_RELEASE_MS and the
       echo guard (ORSAY_ECHO_MS / ORSAY_ECHO_GRACE_MS) stays unchanged. ?orsayrel=NNN overrides it. */
    var ORSAY_CLEAN_RELEASE_MS = 600;
    /* /cinema/intro is prefetched at boot and cached (memory + localStorage, like cinemaIntro.ts).
       v2: v1 answers held same-origin /cinema/intro/ and /media/cinema-intro/ paths, which no longer exist. */
    var INTRO_CACHE_KEY = 'kinosota.tv.cinema-intro.v2';
    /* Field switches for bisecting on a real TV: ?orsay=avplay|avsdk|sef|player forces the engine,
       ?orsaygrid=widget|960 forces the SetDisplayArea grid of the plugins / AVPlay. */
    var LITE_QUERY = (window.location && window.location.search) ? String(window.location.search) : '';
    var ORSAY_FORCE_ENGINE = (LITE_QUERY.match(/[?&]orsay=(avplay|avsdk|sef|player)(&|$)/) || [])[1] || '';
    var ORSAY_REL_QUERY = Number((LITE_QUERY.match(/[?&]orsayrel=(\d{3,4})(&|$)/) || [])[1] || 0);
    if (ORSAY_REL_QUERY >= 200 && ORSAY_REL_QUERY <= 5000) ORSAY_CLEAN_RELEASE_MS = ORSAY_REL_QUERY;
    /* ?orsaywin=late keeps the old behaviour (MEDIA source switched only right before av.open). */
    var ORSAY_EARLY_WIN_SRC = !/[?&]orsaywin=late(&|$)/.test(LITE_QUERY);
    var ORSAY_GRID_MODE = (LITE_QUERY.match(/[?&]orsaygrid=(widget|960)(&|$)/) || [])[1] || '';
    /* Own hosts: an https:// URL of these hosts is played over plain HTTP when the portal runs over HTTP.
       ZERO MEDIA ON VPS1/VPS2: films, ads and the intro never come from them, only from the Media Nodes. */
    var TV_HTTP_HOSTS = { 'watch.scenrix.com': 1, 'www.watch.scenrix.com': 1 };
    /* Media Nodes (tg-node-N, torrent-node-N, node-N) serve HTTPS only (port 80 is closed): never downgraded. */
    var MEDIA_NODE_HOST = /^(?:(?:tg|torrent)-)?node-\d{1,3}\./i;
    /* The node intro route: https://<node>/intro/<default|custom>/<file>?token=<intro-view JWT>. */
    var NODE_INTRO_URL = /^https:\/\/([A-Za-z0-9.-]+)(?::\d{1,5})?\/intro\/(?:default|custom)\/[0-9A-Za-z]{1,64}(?:\.mp4|\.webm|\.jpg|-still\.jpg|-poster\.jpg)\?token=[A-Za-z0-9._-]{1,4096}$/;
    /* /tv/lite (Samsung Orsay and other legacy TVs) decodes at most 1920x1080: the only client that sends a
       frame ceiling (4K Smart TVs on /tv never do). A fitting file is preferred, a bigger one never refused. */
    var LITE_MAX_WIDTH = 1920;
    var LITE_MAX_HEIGHT = 1080;
    var LITE_FRAME_QUERY = 'max_width=' + LITE_MAX_WIDTH + '&max_height=' + LITE_MAX_HEIGHT;

    /* ── On-screen diagnostics console ──
       Old TVs give no way to read console output. The overlay mirrors console.*, window.onerror and the
       player factory steps; it opens with ?debug=1, the Info key or 3x Red / 3x Blue, and by itself
       on a fatal playback error on a TV. */
    var DEBUG_KEEP = 150;
    var DEBUG_SHOW = 26;
    var debugState = { lines: [], open: false, colorKey: '', colorCount: 0, colorAt: 0, restore: null };

    function debugPad(n) { return n < 10 ? '0' + n : String(n); }

    function debugStringify(value) {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (typeof value === 'string') return value;
        if (value && value.message && value.name) return value.name + ': ' + value.message;
        try { return JSON.stringify(value); } catch (e) { return String(value); }
    }

    function debugLog(level, text) {
        var d = new Date();
        var line = debugPad(d.getHours()) + ':' + debugPad(d.getMinutes()) + ':' + debugPad(d.getSeconds()) + ' ' +
            (level === 'error' ? 'E ' : level === 'warn' ? 'W ' : '  ') + String(text);
        debugState.lines.push({ level: level, text: line });
        if (debugState.lines.length > DEBUG_KEEP) debugState.lines.splice(0, debugState.lines.length - DEBUG_KEEP);
        if (debugState.open) debugRender();
    }

    function debugNode() {
        var node = document.getElementById('lite-debug');
        if (node) return node;
        node = document.createElement('div');
        node.id = 'lite-debug';
        node.className = 'lite-debug is-hidden';
        var host = document.body || document.documentElement;
        if (host) host.appendChild(node);
        return node;
    }

    function debugRender() {
        var node = debugNode();
        if (!node) return;
        while (node.firstChild) node.removeChild(node.firstChild);
        var head = document.createElement('div');
        head.className = 'lite-debug-head';
        head.appendChild(document.createTextNode('KINOSOTA debug · Info / 3x красная — скрыть'));
        node.appendChild(head);
        var from = Math.max(0, debugState.lines.length - DEBUG_SHOW);
        for (var i = from; i < debugState.lines.length; i++) {
            var row = document.createElement('div');
            row.className = 'lite-debug-line' + (debugState.lines[i].level === 'error' ? ' is-error' : debugState.lines[i].level === 'warn' ? ' is-warn' : '');
            row.appendChild(document.createTextNode(debugState.lines[i].text));
            node.appendChild(row);
        }
    }

    function debugOpen() {
        debugState.open = true;
        var node = debugNode();
        debugRender();
        if (node) node.className = 'lite-debug';
    }

    function debugClose() {
        debugState.open = false;
        var node = document.getElementById('lite-debug');
        if (node) node.className = 'lite-debug is-hidden';
    }

    function debugToggle() {
        if (debugState.open) debugClose(); else debugOpen();
    }

    /* Info (Tizen/LG 457, Orsay 31) toggles the console; so do three Red (403 / Orsay 108) or Blue (406 / Orsay 22) presses. */
    function debugKey(event) {
        var code = event.keyCode || event.which || 0;
        if (code === 457 || (IS_ORSAY && code === 31)) { debugToggle(); return true; }
        var red = code === 403 || (IS_ORSAY && code === 108);
        var blue = code === 406 || (IS_ORSAY && code === 22);
        if (!red && !blue) return false;
        var now = new Date().getTime();
        var key = red ? 'red' : 'blue';
        if (debugState.colorKey === key && now - debugState.colorAt < 1500) debugState.colorCount += 1;
        else debugState.colorCount = 1;
        debugState.colorKey = key;
        debugState.colorAt = now;
        if (debugState.colorCount >= 3) {
            debugState.colorCount = 0;
            debugToggle();
        }
        return true;
    }

    function debugInstall() {
        var con = window.console;
        if (!con) { con = {}; try { window.console = con; } catch (e0) {} }
        var levels = ['log', 'info', 'warn', 'error'];
        var originals = {};
        for (var i = 0; i < levels.length; i++) {
            (function (level) {
                var original = con[level];
                originals[level] = original;
                con[level] = function () {
                    var parts = [];
                    for (var a = 0; a < arguments.length; a++) parts.push(debugStringify(arguments[a]));
                    try { debugLog(level, parts.join(' ')); } catch (e1) {}
                    if (typeof original === 'function') {
                        try { original.apply(con, arguments); } catch (e2) {}
                    }
                };
            })(levels[i]);
        }
        var previousOnError = window.onerror;
        window.onerror = function (message, source, line) {
            debugLog('error', 'window.onerror: ' + message + ' @ ' + (source || '?') + ':' + (line || 0));
            /* Only our own script errors are fatal: a missing $WEBAPIS / $MANAGER_WIDGET file outside the TV shell is not. */
            if (IS_TV && String(source || '').indexOf('tv-lite.js') !== -1) debugOpen();
            if (typeof previousOnError === 'function') return previousOnError.apply(this, arguments);
            return false;
        };
        debugState.restore = function () {
            for (var r = 0; r < levels.length; r++) con[levels[r]] = originals[levels[r]];
            window.onerror = previousOnError;
        };
        debugLog('info', 'UA: ' + (window.navigator ? window.navigator.userAgent : ''));
        debugLog('info', 'platform: ' + (IS_ORSAY ? 'orsay' : IS_TIZEN ? 'tizen' : IS_WEBOS ? 'webos' : IS_TV ? 'tv' : 'browser') +
            ' · page ' + (window.location ? window.location.protocol + '//' + window.location.host : '?'));
        if (/[?&]debug=1(&|$)/.test(window.location.search || '')) debugOpen();
    }

    var diagSentCount = 0;
    function reportTvDiag(tag, msg) {
        if (!IS_TV || diagSentCount >= 220) return;
        try {
            var loc = window.location;
            if (!loc || (loc.protocol !== 'http:' && loc.protocol !== 'https:')) return;
            diagSentCount += 1;
            var img = new window.Image();
            img.src = '/brand/kinosota-icon.svg?tvdiag=' + encodeURIComponent(String(tag) + ':' + String(msg || '')) + '&_=' + (new Date().getTime()) + '_' + diagSentCount;
        } catch (e) {}
    }

    function isCallableNative(fn) {
        return !!fn && (typeof fn === 'function' || typeof fn === 'object');
    }

    function debugEnv(url) {
        var sef = document.getElementById('pluginObjectSef');
        var pl = document.getElementById('pluginObjectPlayer');
        var wa = window.webapis;
        var inFrame = false;
        try { inFrame = window.top !== window.self; } catch (eF) { inFrame = true; }
        var cw = (typeof window.curWidget !== 'undefined' && window.curWidget) ? window.curWidget : null;
        var cwSize = (cw && cw.width && cw.height) ? (cw.width + 'x' + cw.height) : '-';
        var winSize = (window.innerWidth || 0) + 'x' + (window.innerHeight || 0);
        var msg = 'SEF=' + !!(sef && isCallableNative(sef.Open)) +
            '(t:' + (sef ? typeof sef.Open : 'none') + ')' +
            ' Player=' + !!(pl && isCallableNative(pl.InitPlayer)) +
            '(t:' + (pl ? typeof pl.InitPlayer : 'none') + ')' +
            ' webapis=' + !!wa +
            ' getAVPlay=' + !!(wa && wa.avplay && isCallableNative(wa.avplay.getAVPlay)) +
            ' open=' + !!(wa && wa.avplay && isCallableNative(wa.avplay.open)) +
            ' Common=' + !!window.Common +
            ' curWidget=' + (typeof window.curWidget !== 'undefined') +
            ' cwSize=' + cwSize +
            ' win=' + winSize +
            ' iframe=' + inFrame;
        debugLog('info', 'engines: ' + msg);
        debugLog('info', 'open: ' + url);
        reportTvDiag('env', msg);
    }

    debugInstall();

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

    /* ── Catalog filters: rating / year / sort are sent to the backend as query parameters ── */
    var RATING_OPTS = [{ id: 0, label: 'Все' }, { id: 8, label: '★ 8.0+' }, { id: 7, label: '★ 7.0+' }, { id: 6, label: '★ 6.0+' }];
    var YEAR_OPTS = [{ id: 'all', label: 'Все' }, { id: '2026', label: '2026' }, { id: '2025', label: '2025' }, { id: '2024', label: '2024' },
        { id: '2020-2023', label: '2020–2023' }, { id: 'before', label: 'до 2020' }];
    var SORT_OPTS = [{ id: 'popular', label: 'По популярности' }, { id: 'rating', label: 'По рейтингу' }, { id: 'date', label: 'По дате выхода' }];
    var SORT_PARAMS = {
        movies: { popular: 'popular', rating: 'rating_desc', date: 'newest' },
        series: { popular: 'rating_desc', rating: 'rating_desc', date: 'newest' },
        torrents: { popular: 'popular', rating: 'rating', date: 'newest' }
    };

    function defaultFilters() { return { rating: 0, year: 'all', sort: 'popular' }; }

    function filterSort(kind, filters) {
        return SORT_PARAMS[kind][(filters && filters.sort) || 'popular'] || 'popular';
    }

    function filterQuery(kind, filters) {
        if (!filters) return '';
        var query = '';
        if (filters.rating) query += (kind === 'torrents' ? '&rating=' : '&min_rating=') + filters.rating;
        var year = String(filters.year || 'all');
        if (/^\d{4}$/.test(year)) query += '&year=' + year;
        else if (year === '2020-2023') query += '&year_from=2020&year_to=2023';
        else if (year === 'before') query += '&year_to=2019';
        if (kind !== 'series' && filters.sort && filters.sort !== 'popular') query += '&sort=' + filterSort(kind, filters);
        return query;
    }

    /* Safety net on top of the server filter: a card outside the chosen range never shows. */
    function passesFilters(card, filters) {
        if (filters.rating && !(card.rating && card.rating >= filters.rating)) return false;
        var year = String(filters.year || 'all');
        if (year === 'all') return true;
        if (!card.year) return false;
        if (/^\d{4}$/.test(year)) return card.year === parseInt(year, 10);
        if (year === '2020-2023') return card.year >= 2020 && card.year <= 2023;
        if (year === 'before') return card.year < 2020;
        return true;
    }

    var api = {
        spotlight: function () { return request('GET', '/torrents/catalog?kind=movie&page=1&collection=spotlight'); },
        home: function () { return request('GET', '/movies/home'); },
        movies: function (page, filters) { return request('GET', '/movies?page=' + (page || 1) + '&page_size=24' + filterQuery('movies', filters)); },
        series: function (page, filters) { return request('GET', '/series?sort=' + filterSort('series', filters) + (page ? '&page=' + page : '') + '&page_size=' + SHELF_LIMIT + filterQuery('series', filters)); },
        torrents: function (page, filters) { return request('GET', '/torrents/catalog?kind=movie&page=' + (page || 1) + filterQuery('torrents', filters)); },
        torrentGenres: function () { return request('GET', '/torrents/genres?kind=movie'); },
        torrentRebuild: function (kind, id, sourceId) { return request('POST', '/torrents/sources/' + kind + '/' + encodeURIComponent(id) + '/rebuild', sourceId ? { source_id: sourceId } : {}); },
        favoriteState: function (key) { return request('GET', '/account/library/membership?keys=' + encodeURIComponent(key)); },
        favoriteAdd: function (kind, id) { return request('PUT', '/account/library/' + kind + '/' + encodeURIComponent(id)); },
        favoriteRemove: function (kind, id) { return request('DELETE', '/account/library/' + kind + '/' + encodeURIComponent(id)); },
        genres: function () { return request('GET', '/genres'); },
        genreContent: function (slug, page) { return request('GET', '/movies?genre=' + encodeURIComponent(slug) + '&page=' + (page || 1)); },
        search: function (q) { return request('GET', '/search?q=' + encodeURIComponent(q) + '&page=1&page_size=30'); },
        /* ?tv=1: the backend describes the source TV playback picks (<= 1920x1080 when one exists). */
        movieDetail: function (id) { return request('GET', '/movies/' + encodeURIComponent(id) + '?tv=1&' + LITE_FRAME_QUERY); },
        seriesDetail: function (id) { return request('GET', '/series/' + encodeURIComponent(id)); },
        torrentDetail: function (kind, id) { return request('GET', '/torrents/detail/' + kind + '/' + encodeURIComponent(id)); },
        torrentSources: function (kind, id) { return request('GET', '/torrents/sources/' + kind + '/' + encodeURIComponent(id)); },
        startPlayback: function (movieId) { return request('POST', '/playback/start', { movie_id: movieId, tv: true, max_width: LITE_MAX_WIDTH, max_height: LITE_MAX_HEIGHT }); },
        heartbeat: function (sessionId) { return request('POST', '/playback/heartbeat', { session_id: sessionId }); },
        stopPlayback: function (sessionId) { return request('POST', '/playback/stop', { session_id: sessionId }); },
        startSeriesPlayback: function (episodeId) { return request('POST', '/series_playback/start', { episode_id: episodeId, tv: true, max_width: LITE_MAX_WIDTH, max_height: LITE_MAX_HEIGHT }); },
        torrentTicket: function (body) {
            var payload = { tv: true, max_width: LITE_MAX_WIDTH, max_height: LITE_MAX_HEIGHT };
            for (var k in body) if (Object.prototype.hasOwnProperty.call(body, k)) payload[k] = body[k];
            return request('POST', '/torrents/playback-ticket', payload).then(null, function (error) {
                /* The chosen file is above the ceiling: the server names a fitting file of the same title. */
                var alternative = tvMediaAlternative(error);
                if (!alternative || alternative === payload.source_id) throw error;
                payload.source_id = alternative;
                return request('POST', '/torrents/playback-ticket', payload);
            });
        },
        introConfig: function () { return request('GET', '/cinema/intro'); },
        adPlan: function (play, episode) {
            if (!play) return Promise.reject(new Error('NO_TARGET'));
            if (play.src === 'torrent') {
                var extra = play.kind === 'tv' && episode ? '&season=' + episode.season + '&episode=' + episode.episode : '';
                return request('GET', '/ads/plan/torrent/' + encodeURIComponent(play.kind) + '/' + encodeURIComponent(play.id) + '?surface=tv_torrent' + extra);
            }
            if (play.kind === 'series') {
                if (!episode || !episode.id) return Promise.reject(new Error('NO_EPISODE'));
                return request('GET', '/ads/plan/episode/' + encodeURIComponent(episode.id) + '?surface=tv_telegram');
            }
            return request('GET', '/ads/plan/movie/' + encodeURIComponent(play.id) + '?surface=tv_telegram');
        },
        adPrepare: function (planToken, cueId) { return request('POST', '/ads/prepare', { plan_token: planToken, cue_id: cueId }); },
        adEvent: function (deliveryId, eventName) { return request('POST', '/ads/events/' + encodeURIComponent(deliveryId), { event: eventName }); },
        startPairing: function () { return request('POST', '/desktop/pairing/start'); },
        pollPairing: function (deviceCode) { return request('POST', '/desktop/pairing/exchange', { device_code: deviceCode }); }
    };

    /* ── Remote control keys ── */
    var KEY_NAMES = {
        arrowleft: 'left', left: 'left', arrowright: 'right', right: 'right', arrowup: 'up', up: 'up',
        arrowdown: 'down', down: 'down', enter: 'select', select: 'select', accept: 'select', ok: 'select',
        escape: 'back', backspace: 'back', goback: 'back', back: 'back', browserback: 'back', exit: 'back',
        mediaplaypause: 'playpause', mediaplay: 'play', mediapause: 'pause',
        mediafastforward: 'forward', mediarewind: 'rewind', mediastop: 'stop'
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
        if (code === 413 || code === 178 || (isOrsay && code === 70)) return 'stop';

        var name = event.key && event.key !== 'Unidentified' ? String(event.key).toLowerCase() : '';
        return KEY_NAMES.hasOwnProperty(name) ? KEY_NAMES[name] : '';
    }

    var TIZEN_KEYS = ['MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop', 'MediaFastForward', 'MediaRewind', 'Return', 'Exit'];
    var TIZEN_OPTIONAL_KEYS = ['Info', 'ColorF0Red', 'ColorF3Blue'];

    function registerTvKeys() {
        var input = null;
        try { input = window.tizen && window.tizen.tvinputdevice ? window.tizen.tvinputdevice : null; } catch (e0) { input = null; }
        if (!input) return;
        var batched = false;
        if (typeof input.registerKeyBatch === 'function') {
            try {
                input.registerKeyBatch(TIZEN_KEYS, function () {}, function () {
                    for (var f = 0; f < TIZEN_KEYS.length; f++) {
                        try { input.registerKey(TIZEN_KEYS[f]); } catch (eF) {}
                    }
                });
                batched = true;
            } catch (e1) { batched = false; }
        }
        /* Tizen 2.x–3.x: no registerKeyBatch, keys go one by one. */
        if (!batched) {
            for (var i = 0; i < TIZEN_KEYS.length; i++) {
                try { input.registerKey(TIZEN_KEYS[i]); } catch (e2) {}
            }
        }
        for (var j = 0; j < TIZEN_OPTIONAL_KEYS.length; j++) {
            try { input.registerKey(TIZEN_OPTIONAL_KEYS[j]); } catch (e3) {}
        }
    }

    /* ── Native TV platform bootstrap ($MANAGER_WIDGET for Orsay, $WEBAPIS for Tizen) ── */
    var nativePlatformReady = false;
    var orsayBooted = false;
    /* Set by destroy(): late $MANAGER_WIDGET callbacks of a replaced instance must not touch the DOM. */
    var liteDestroyed = false;
    var tizenBooted = false;

    function loadScriptSafe(src, onDone, attemptsLeft) {
        var left = typeof attemptsLeft === 'number' ? attemptsLeft : 3;
        try {
            var s = document.createElement('script');
            s.type = 'text/javascript';
            s.src = src;
            var settled = false;
            var finish = function (ok) {
                if (settled) return;
                settled = true;
                if (!ok && left > 1) {
                    loadScriptSafe(src, onDone, left - 1);
                    return;
                }
                if (onDone) onDone();
            };
            s.onload = s.onreadystatechange = function () {
                if (!s.readyState || s.readyState === 'loaded' || s.readyState === 'complete') finish(true);
            };
            s.onerror = function () { finish(false); };
            var target = document.body || (document.getElementsByTagName && document.getElementsByTagName('body')[0]) || document.head || document.documentElement;
            if (!target) { finish(false); return; }
            target.appendChild(s);
            setTimeout(function () { finish(true); }, 2500);
        } catch (e) {
            if (onDone) onDone();
        }
    }

    function loadScriptChain(urls, idx, done) {
        if (!urls || idx >= urls.length) {
            if (done) done();
            return;
        }
        loadScriptSafe(urls[idx], function () { loadScriptChain(urls, idx + 1, done); }, 2);
    }

    function ensureOrsayPluginObject(id, clsid) {
        var existing = $(id);
        if (existing) return existing;
        var host = $('lite-orsay-plugins');
        if (!host) {
            host = document.createElement('div');
            host.id = 'lite-orsay-plugins';
            /* Lampa core/orsay.js parity: the Infolink objects live off-screen. */
            host.style.position = 'absolute';
            host.style.left = '-1000px';
            host.style.top = '-1000px';
            host.style.width = '1px';
            host.style.height = '1px';
            var parent = document.body || document.documentElement;
            if (!parent) return null;
            parent.appendChild(host);
        }
        var obj = document.createElement('object');
        obj.id = id;
        obj.setAttribute('border', '0');
        obj.setAttribute('classid', 'clsid:' + clsid);
        /* Marks objects created by this script, so they can be released again (see releaseAutoOrsayPlugins). */
        obj.setAttribute('data-lite-auto', '1');
        obj.style.opacity = '0.0';
        obj.style.backgroundColor = '#000';
        obj.style.width = '1px';
        obj.style.height = '1px';
        host.appendChild(obj);
        return obj;
    }

    /* A media plugin object is a player instance from the moment it is in the DOM. Orsay has one hardware
       decoder, so only the engine that is about to play may own one: every auto-created SEF / Player object
       except keepId is removed before AVPlay / SEF / Player opens a stream. */
    function releaseAutoOrsayPlugins(keepId) {
        var ids = ['pluginObjectSef', 'pluginObjectPlayer'];
        var released = [];
        for (var i = 0; i < ids.length; i++) {
            if (ids[i] === keepId) continue;
            var node = $(ids[i]);
            if (!node || !node.getAttribute || node.getAttribute('data-lite-auto') !== '1') continue;
            try { if (node.parentNode) node.parentNode.removeChild(node); released.push(ids[i]); } catch (e) {}
        }
        if (released.length) {
            debugLog('info', 'released plugin objects: ' + released.join(','));
            reportTvDiag('plug_rel', released.join(',') + '|keep=' + (keepId || '-'));
        }
    }

    /* SEF / Player are attached only when AVPlay is definitely missing: right away when the page runs
       outside the widget engine (no curWidget, so $MANAGER_WIDGET webapis can never load), otherwise only
       after the $MANAGER_WIDGET chain has finished without webapis.avplay. */
    function attachLegacyOrsayPlugins(reason) {
        if (liteDestroyed || canUseOrsayAvplay()) return;
        ensureOrsayPluginObject('pluginObjectSef', 'SAMSUNG-INFOLINK-SEF');
        ensureOrsayPluginObject('pluginObjectPlayer', 'SAMSUNG-INFOLINK-PLAYER');
        reportTvDiag('plug_add', reason);
    }

    function initOrsayEnvironment() {
        if (!IS_ORSAY || orsayBooted) return;
        orsayBooted = true;
        /* Core Infolink objects are static in /tv/lite/index.html; legacy SEF/Player are added only when AVPlay is absent. */
        try {
            ensureOrsayPluginObject('pluginObjectNNavi', 'SAMSUNG-INFOLINK-NNAVI');
            ensureOrsayPluginObject('pluginObjectTVMW', 'SAMSUNG-INFOLINK-TVMW');
            ensureOrsayPluginObject('pluginObjectScreen', 'SAMSUNG-INFOLINK-SCREEN');
            /* v10 bug: this ran before $MANAGER_WIDGET webapis.js was loaded, so SEF + Player were attached
               on every Orsay boot (tvdiag env: SEF=true Player=true) next to AVPlay. */
            var hasWidgetEngine = typeof window.curWidget !== 'undefined' && !!window.curWidget;
            if (!hasWidgetEngine) attachLegacyOrsayPlugins('boot');
        } catch (e) {}
        /* Maple WebKit: never let the HTML5 <video> preload, its media player is the same hardware decoder. */
        try { var bootVideo = $('lite-video'); if (bootVideo) bootVideo.setAttribute('preload', 'none'); } catch (eV) {}
        var deadline = Date.now() + 5000;
        function setupOrsayApis() {
            try {
                if (window.Common && Common.API && Common.API.Widget && Common.API.Plugin && Common.API.TVKeyValue) {
                    var widgetAPI = new Common.API.Widget();
                    var tvKey = new Common.API.TVKeyValue();
                    var pluginAPI = new Common.API.Plugin();
                    var started = false;
                    var onShow = function () {
                        if (started) return;
                        started = true;
                        try {
                            pluginAPI.SetBannerState(1);
                            pluginAPI.unregistKey(tvKey.KEY_VOL_UP);
                            pluginAPI.unregistKey(tvKey.KEY_VOL_DOWN);
                            pluginAPI.unregistKey(tvKey.KEY_MUTE);
                            if (pluginAPI.registKey && tvKey.KEY_INFO) pluginAPI.registKey(tvKey.KEY_INFO);
                            pluginAPI.unregistKey(tvKey.KEY_TOOLS);
                            pluginAPI.unregistKey(tvKey.KEY_MENU);
                            pluginAPI.setOffScreenSaver();
                        } catch (e2) {}
                    };
                    window.onShow = onShow;
                    setTimeout(onShow, 1500);
                    widgetAPI.sendReadyEvent();
                    debugLog('info', 'Orsay Common API ready ($MANAGER_WIDGET)');
                } else if (!(window.webapis && window.webapis.avplay) && Date.now() < deadline) {
                    setTimeout(setupOrsayApis, 100);
                    return;
                }
            } catch (e3) {}
            try { attachLegacyOrsayPlugins('chain'); } catch (e4) {}
            nativePlatformReady = true;
        }
        if ((window.webapis && window.webapis.avplay) || (window.Common && window.Common.API)) {
            setupOrsayApis();
            return;
        }
        loadScriptChain([
            '$MANAGER_WIDGET/Common/API/Widget.js',
            '$MANAGER_WIDGET/Common/API/TVKeyValue.js',
            '$MANAGER_WIDGET/Common/API/Plugin.js',
            '$MANAGER_WIDGET/Common/webapi/1.0/webapis.js'
        ], 0, setupOrsayApis);
    }

    function initTizenEnvironment() {
        if (!IS_TIZEN || tizenBooted) return;
        tizenBooted = true;
        if (window.webapis && window.webapis.avplay) {
            nativePlatformReady = true;
            return;
        }
        loadScriptSafe('$WEBAPIS/webapis/webapis.js', function () {
            nativePlatformReady = true;
        }, 2);
    }

    function initNativePlatform() {
        if (IS_ORSAY) { initOrsayEnvironment(); return; }
        if (IS_TIZEN) { initTizenEnvironment(); return; }
        nativePlatformReady = true;
    }

    /* ── Content model ── */
    /* TMDB images always go through the cached VPS2 proxy /api/v1/poster/{size}/{file}:
       old TVs never open TLS to image.tmdb.org and cards never exceed w185 (~20 KB). */
    var POSTER_SIZES = { w92: 1, w154: 1, w185: 1, w342: 1, w500: 1, w780: 1, w1280: 1 };
    var TMDB_RE = /^https?:\/\/image\.tmdb\.org\/t\/p\/(?:original|w\d+)\/([A-Za-z0-9_\-]+\.(?:jpg|jpeg|png|webp))$/;
    function tmdbSize(url, size) {
        if (!url || typeof url !== 'string') return '';
        var m = url.match(TMDB_RE);
        if (!m) return url.indexOf('image.tmdb.org') !== -1 ? '' : url;
        return '/api/v1/poster/' + (POSTER_SIZES[size] ? size : 'w185') + '/' + m[1];
    }

    function ratingOf(value) {
        return typeof value === 'number' && value > 0 ? value : null;
    }

    function genreNamesFromIds(ids) {
        var out = [];
        for (var i = 0; ids && i < ids.length; i++) if (state.genreNames[ids[i]]) out.push(state.genreNames[ids[i]]);
        return out;
    }

    function movieCard(movie) {
        return {
            key: 'movie-' + movie.id,
            title: movie.title || '',
            year: movie.year || null,
            rating: ratingOf(movie.rating),
            quality: movie.quality || '1080p',
            lang: '🇷🇺 RU',
            poster: tmdbSize(movie.poster, 'w185'),
            posterHd: tmdbSize(movie.poster, 'w500'),
            tmdbId: movie.tmdb_id || null,
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
            poster: tmdbSize(series.poster_url, 'w185'),
            posterHd: tmdbSize(series.poster_url, 'w500'),
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
            poster: tmdbSize(item.poster, 'w185'),
            posterHd: tmdbSize(item.poster, 'w500'),
            backdrop: tmdbSize(item.backdrop, 'w780'),
            backdropHd: tmdbSize(item.backdrop, 'w1280'),
            genres: genreNamesFromIds(item.genre_ids),
            runtime: item.runtime || 0,
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
    var KB_LAYOUTS = {
        ru: [
            ['Й', 'Ц', 'У', 'К', 'Е', 'Н', 'Г', 'Ш', 'Щ', 'З', 'Х'],
            ['Ф', 'Ы', 'В', 'А', 'П', 'Р', 'О', 'Л', 'Д', 'Ж', 'Э'],
            ['Я', 'Ч', 'С', 'М', 'И', 'Т', 'Ь', 'Б', 'Ю', 'Ъ', 'Ё']
        ],
        en: [
            ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '-'],
            ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ':', "'"],
            ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '!', '?']
        ]
    };
    var KB_CLEAR = 'Очистить';
    function buildKeyboard(layout) {
        return [['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '⌫']]
            .concat(KB_LAYOUTS[layout])
            .concat([[layout === 'ru' ? 'EN' : 'RU', '␣', KB_CLEAR]]);
    }
    var KB_ROWS = buildKeyboard('ru');
    var SEARCH_COLS = 6;
    var SEARCH_DEBOUNCE = 400;

    var state = {
        mode: 'browse',        /* browse | menu | details | search | genres | auth | player | exit */
        view: 'home',          /* home | grid | search | genres */
        menuIndex: 1,          /* 1 is 'home' */
        rows: [],              /* [{id, node, items: [node], cards: [card], track, col}] */
        row: 0,
        hero: null,
        detailsCard: null,
        detailsOpen: false,
        genreNames: {},        /* TMDB genre id -> name, for hero and torrent cards */
        filters: { rating: 0, year: 'all', sort: 'popular' },
        hasFilters: false,
        filterRowCount: 0,
        grid: null,            /* last catalog grid request, replayed when a filter changes */
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
        if (viewName === 'auth') {
            openAuthModal();
            return;
        }
        if (viewName === 'exit') {
            openExit();
            return;
        }
        state.view = viewName;
        state.hasFilters = false;
        state.filterRowCount = 0;
        var titles = { home: 'Главная', movies: 'Фильмы', series: 'Сериалы', torrents: 'Торренты', genres: 'Жанры', search: 'Поиск' };
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
            state.filters = defaultFilters();
            loadCatalogGrid('movies', 'Каталог фильмов', api.movies, movieCard, true);
        } else if (viewName === 'series') {
            state.mode = 'browse';
            state.filters = defaultFilters();
            loadCatalogGrid('series', 'Каталог сериалов', api.series, seriesCard, true);
        } else if (viewName === 'torrents') {
            state.mode = 'browse';
            state.filters = defaultFilters();
            loadCatalogGrid('torrents', 'Каталог торрент-раздач (FHD / 4K)', api.torrents, torrentCard, true);
        } else if (viewName === 'genres') {
            state.mode = 'browse';
            loadGenresView();
        } else if (viewName === 'search') {
            openSearchView();
        }
        renderMenu();
    }

    /* ── Focus Management ── */
    function applyFocus(skipScroll) {
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

        /* Pointer hover only moves the highlight: scrolling under a resting cursor would make the focus jump. */
        if (skipScroll) { scheduleLazy(); return; }
        if (row.track) {
            var maxStart = Math.max(0, row.items.length - 5);
            var start = Math.min(Math.max(0, row.col - 1), maxStart);
            setTransform(row.track, -start * CARD_STEP, 0);
        }
        var top = 0;
        if (state.view === 'home') {
            if (state.row <= 1) {
                top = 0;
            } else {
                top = 344 + (state.row - 2) * 324;
            }
        } else if (state.view === 'genres') {
            if (state.row <= 4) top = 0;
            else top = (state.row - 4) * 84;
        } else if (state.hasFilters) {
            /* two filter rows, then card rows: the first card row shows the whole header, later ones scroll under it */
            var cardRow = state.row - state.filterRowCount;
            top = cardRow <= 0 ? 0 : 142 + (cardRow - 1) * 273;
            if (cardRow > 0 && cardRow === 1) top = 142;
        } else {
            if (state.row <= 1) {
                top = 0;
            } else {
                top = (state.row - 1) * 273;
            }
        }
        setTransform($('lite-scroll'), 0, -top);
        scheduleLazy();
    }

    /* Where focus goes back after a modal/menu closes (search keeps its own focus model). */
    function restoreFocus() {
        if (state.detailsOpen) {
            state.mode = 'details';
            applyDetailsFocus();
            return;
        }
        state.mode = state.view === 'search' ? 'search' : 'browse';
        renderMenu();
        if (state.mode === 'search') {
            if (state.searchFocus === 'results') applySearchResultFocus();
            else applyKeyboardFocus();
        } else {
            applyFocus();
        }
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
            } else if (row.id !== 'hero' && !row.noWrap && state.row < state.rows.length - 1) {
                /* Last card of a shelf or grid line wraps to the first card of the next row;
                   the hero buttons keep focus on «Подробнее» instead of jumping away. */
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
    /* Lazy posters: an <img> gets its src only when its card is on screen (+2 cards to the
       right/left, a quarter card vertically). Until then a dark gradient placeholder with the
       title keeps the 2:3 box, so the grid never jumps and offscreen cards make no requests. */
    var lazyImages = [];
    var lazyTimer = null;

    function loadVisiblePosters() {
        var vw = window.innerWidth || 1920;
        var vh = window.innerHeight || 1080;
        var keep = [];
        for (var i = 0; i < lazyImages.length; i++) {
            var img = lazyImages[i];
            var box = img.parentNode;
            if (!box || !document.body.contains(box)) continue;
            var r = box.getBoundingClientRect();
            var mx = (r.width || 0) * 2 + 40;
            var my = (r.height || 0) * 0.25;
            if (r.width > 0 && r.right >= -mx && r.left <= vw + mx && r.bottom >= -my && r.top <= vh + my) {
                img.src = img.getAttribute('data-src');
                img.removeAttribute('data-src');
            } else {
                keep.push(img);
            }
        }
        lazyImages = keep;
    }

    function scheduleLazy() {
        if (lazyTimer) clearTimeout(lazyTimer);
        loadVisiblePosters();
        /* again after the 300 ms track/scroll transition has settled */
        lazyTimer = setTimeout(loadVisiblePosters, 350);
    }

    function posterNode(card) {
        var box = el('div', 'lite-card-poster');
        var fallback = el('div', 'lite-card-fallback', clip(card.title, 40));
        box.appendChild(fallback);
        if (card.poster) {
            var img = document.createElement('img');
            img.alt = '';
            img.className = 'lite-lazy';
            img.onload = function () { addClass(img, 'is-loaded'); fallback.style.display = 'none'; };
            img.onerror = function () { img.style.display = 'none'; fallback.style.display = 'block'; };
            img.setAttribute('data-src', card.poster);
            box.appendChild(img);
            lazyImages.push(img);
        }
        if (card.rating) box.appendChild(el('span', 'lite-badge-rating', '★ ' + card.rating.toFixed(1)));
        if (card.quality) box.appendChild(el('span', 'lite-badge-quality', card.quality));
        if (card.lang) box.appendChild(el('span', 'lite-badge-lang', card.lang));
        return box;
    }

    /* Cover-fit by hand: old WebKit has no object-fit, and a stretched backdrop is exactly what looked cheap. */
    function fitCover(img, width, height) {
        var nw = img.naturalWidth;
        var nh = img.naturalHeight;
        if (!nw || !nh) return;
        var scale = Math.max(width / nw, height / nh);
        var w = Math.round(nw * scale);
        var h = Math.round(nh * scale);
        img.style.width = w + 'px';
        img.style.height = h + 'px';
        img.style.left = Math.round((width - w) / 2) + 'px';
        img.style.top = -Math.round((h - height) * 0.25) + 'px';
    }

    function renderHero(card) {
        var hero = $('lite-hero');
        while (hero.firstChild) hero.removeChild(hero.firstChild);
        if (!card) { hide(hero); return null; }
        var backdrop = card.backdropHd || card.backdrop;
        if (backdrop) {
            var img = document.createElement('img');
            img.className = 'lite-hero-image';
            img.alt = '';
            img.onload = function () { fitCover(img, 1208, 344); };
            img.onerror = function () { img.style.display = 'none'; };
            img.src = backdrop;
            hero.appendChild(img);
        }
        hero.appendChild(el('div', 'lite-hero-shade'));
        var body = el('div', 'lite-hero-body');
        body.appendChild(el('div', 'lite-hero-title', clip(card.title, 60)));
        var meta = [];
        if (card.year) meta.push(card.year);
        if (card.rating) meta.push('★ ' + card.rating.toFixed(1));
        if (card.genres && card.genres.length) meta.push(card.genres.slice(0, 3).join(', '));
        if (meta.length) body.appendChild(el('div', 'lite-hero-meta', meta.join(' · ')));
        if (card.overview) body.appendChild(el('div', 'lite-hero-overview', clip(card.overview, 260)));

        var actions = el('div', 'lite-hero-actions');
        var btnPlay = el('span', 'lite-btn lite-btn-primary is-focused', '▶ Смотреть');
        var btnDetails = el('span', 'lite-btn', 'О фильме');
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

        return settleAll([api.spotlight(), api.home(), api.series(), api.torrents(), api.torrentGenres()]).then(function (results) {
            loadingHome = false;
            var genreList = results[4] && results[4].ok && results[4].value && results[4].value.items ? results[4].value.items : [];
            for (var g = 0; g < genreList.length; g++) state.genreNames[genreList[g].id] = genreList[g].name;
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
    var gridLoadId = 0;

    function filterPill(group, option, active) {
        return { node: el('span', 'lite-pill' + (active ? ' is-active' : ''), option.label), card: { filter: group, value: option.id } };
    }

    function buildFilterRows(box) {
        box.innerHTML = '';
        var f = state.filters;
        var first = el('div', 'lite-filter-line');
        var second = el('div', 'lite-filter-line');
        var rowA = { id: 'filters-0', node: first, items: [], cards: [], track: null, col: 0, noWrap: true };
        var rowB = { id: 'filters-1', node: second, items: [], cards: [], track: null, col: 0, noWrap: true };
        function fill(line, row, group, options, current) {
            for (var i = 0; i < options.length; i++) {
                var pill = filterPill(group, options[i], options[i].id === current);
                line.appendChild(pill.node);
                row.items.push(pill.node);
                row.cards.push(pill.card);
            }
        }
        first.appendChild(el('span', 'lite-filter-label', 'РЕЙТИНГ'));
        fill(first, rowA, 'rating', RATING_OPTS, f.rating);
        first.appendChild(el('span', 'lite-filter-gap'));
        first.appendChild(el('span', 'lite-filter-label', 'ГОД'));
        fill(first, rowA, 'year', YEAR_OPTS, f.year);
        second.appendChild(el('span', 'lite-filter-label', 'СОРТИРОВКА'));
        fill(second, rowB, 'sort', SORT_OPTS, f.sort);
        box.appendChild(first);
        box.appendChild(second);
        return [rowA, rowB];
    }

    function applyFilterChoice(choice) {
        if (!state.grid) return;
        var keepRow = state.row;
        var keepCol = state.rows[state.row] ? state.rows[state.row].col : 0;
        state.filters[choice.filter] = choice.value;
        var g = state.grid;
        loadCatalogGrid(g.viewId, g.title, g.fetchFn, g.mapper, g.filterable, { row: keepRow, col: keepCol });
    }

    function loadCatalogGrid(viewId, title, fetchFn, mapper, filterable, keep) {
        var myLoad = ++gridLoadId;
        state.grid = { viewId: viewId, title: title, fetchFn: fetchFn, mapper: mapper, filterable: !!filterable };
        show($('lite-view-grid'));
        setText($('lite-grid-title'), title);
        var container = $('lite-grid-cards');
        container.innerHTML = '';
        var filterBox = $('lite-filters');
        var filterRows = [];
        if (filterable) {
            filterRows = buildFilterRows(filterBox);
            show(filterBox);
        } else {
            filterBox.innerHTML = '';
            hide(filterBox);
        }
        state.hasFilters = !!filterable;
        state.filterRowCount = filterRows.length;
        state.rows = filterRows.slice(0);
        state.row = keep && keep.row < filterRows.length ? keep.row : 0;
        if (keep && state.rows[state.row]) state.rows[state.row].col = keep.col;
        var status = $('lite-status');
        setText(status, 'Загрузка каталога…');
        show(status);
        if (filterRows.length) applyFocus();

        fetchFn(1, state.filters).then(function (res) {
            if (myLoad !== gridLoadId) return;
            hide(status);
            var list = res && res.items ? res.items : (Array.isArray(res) ? res : []);
            var cards = mapList(list, mapper);
            if (filterable) {
                var kept = [];
                for (var k = 0; k < cards.length; k++) if (passesFilters(cards[k], state.filters)) kept.push(cards[k]);
                cards = kept;
            }
            if (!cards.length) {
                setText(status, 'Ничего не найдено. Измените фильтры.');
                show(status);
                return;
            }
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
            if (!keep) state.row = filterRows.length;
            state.mode = 'browse';
            applyFocus();
        })['catch'](function () {
            if (myLoad !== gridLoadId) return;
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
        state.searchFocus = 'kb';
        state.searchCards = [];
        state.searchNodes = [];
        state.resIndex = 0;
        state.kbLayout = 'ru';
        KB_ROWS = buildKeyboard('ru');
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
                if (keyChar === '␣' || keyChar === KB_CLEAR || keyChar === 'EN' || keyChar === 'RU') addClass(keyEl, 'is-wide');
                if (keyChar === '␣') addClass(keyEl, 'is-space');
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
        } else if (char === KB_CLEAR) {
            state.searchQuery = '';
        } else if (char === 'EN' || char === 'RU') {
            state.kbLayout = char === 'EN' ? 'en' : 'ru';
            KB_ROWS = buildKeyboard(state.kbLayout);
            renderKeyboard();
            state.kbCol = Math.min(state.kbCol, KB_ROWS[state.kbRow].length - 1);
            applyKeyboardFocus();
            return;
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
            state.searchCards = [];
            state.searchNodes = [];
            return;
        }
        searchTimer = setTimeout(function () {
            api.search(q).then(function (res) {
                if (q !== state.searchQuery.trim()) return; /* a newer query is pending */
                var list = res && res.items ? res.items : [];
                var cards = mapList(list, function (x) { return x && x.type === 'series' ? seriesCard(x) : movieCard(x); });
                var container = $('lite-search-results');
                container.innerHTML = '';
                state.searchCards = cards;
                state.searchNodes = [];
                state.resIndex = 0;
                if (!cards.length) {
                    container.appendChild(el('p', 'lite-status', 'По запросу «' + q + '» ничего не найдено.'));
                    return;
                }
                for (var i = 0; i < cards.length; i++) {
                    var cardNode = el('div', 'lite-card');
                    cardNode.appendChild(posterNode(cards[i]));
                    cardNode.appendChild(el('div', 'lite-card-title', cards[i].title));
                    container.appendChild(cardNode);
                    state.searchNodes.push(cardNode);
                }
                scheduleLazy();
            })['catch'](function () {});
        }, SEARCH_DEBOUNCE);
    }

    function applySearchResultFocus() {
        var nodes = state.searchNodes || [];
        for (var i = 0; i < nodes.length; i++) {
            if (state.searchFocus === 'results' && i === state.resIndex) addClass(nodes[i], 'is-focused');
            else removeClass(nodes[i], 'is-focused');
        }
        if (state.searchFocus === 'results') {
            var kbKeys = $('lite-keyboard').querySelectorAll('.lite-kb-key');
            for (var k = 0; k < kbKeys.length; k++) removeClass(kbKeys[k], 'is-focused');
            var node = nodes[state.resIndex];
            var results = $('lite-search-results');
            if (node && results) results.scrollTop = Math.max(0, node.offsetTop - results.offsetTop - 20);
        }
        scheduleLazy();
    }

    function onSearchResultsKey(action) {
        var n = (state.searchCards || []).length;
        var i = state.resIndex;
        if (action === 'left') {
            if (i % SEARCH_COLS > 0) state.resIndex = i - 1;
            else { state.mode = 'menu'; renderMenu(); return true; }
        } else if (action === 'right') {
            if (i < n - 1) state.resIndex = i + 1; /* last column wraps to the next row */
        } else if (action === 'up') {
            if (i >= SEARCH_COLS) state.resIndex = i - SEARCH_COLS;
            else { state.searchFocus = 'kb'; applySearchResultFocus(); applyKeyboardFocus(); return true; }
        } else if (action === 'down') {
            if (i + SEARCH_COLS < n) state.resIndex = i + SEARCH_COLS;
            else if (Math.floor(i / SEARCH_COLS) < Math.floor((n - 1) / SEARCH_COLS)) state.resIndex = n - 1;
        } else if (action === 'select') {
            if (state.searchCards[i]) openDetailsModal(state.searchCards[i]);
            return true;
        } else if (action === 'back') {
            state.searchFocus = 'kb';
            applySearchResultFocus();
            applyKeyboardFocus();
            return true;
        } else {
            return false;
        }
        applySearchResultFocus();
        return true;
    }

    /* ── Movie details screen (poster, backdrop, watch card) ── */
    var LANGS = [
        { code: 'ru', api: 'ru', flag: '🇷🇺', label: 'RU', name: 'русский' },
        { code: 'ua', api: 'uk', flag: '🇺🇦', label: 'UA', name: 'украинский' },
        { code: 'en', api: 'en', flag: '🇬🇧', label: 'EN', name: 'английский' }
    ];
    var det = {
        card: null, token: 0, tmdb: null, tmdbKind: null, info: null, view: null, sources: [],
        selected: null, quality: null, lang: null, saved: false, busy: false,
        rows: [], row: 1, col: 0,
        /* v15: frame of the catalogue file the TV would play ('1924x1082') and, on Orsay when it is above
           1920x1080, a ready <= 1080p torrent of the same title ({ tmdb, source }) offered before the ads. */
        sourceRes: '', hdAlt: null
    };

    function genreNamesOf(list) {
        var out = [];
        for (var i = 0; list && i < list.length; i++) {
            var name = typeof list[i] === 'string' ? list[i] : (list[i] && list[i].name);
            if (name) out.push(name);
        }
        return out;
    }

    function formatRuntime(minutes) {
        if (!minutes || minutes < 1) return '';
        var h = Math.floor(minutes / 60);
        var m = minutes % 60;
        return (h < 10 ? '0' + h : String(h)) + ':' + (m < 10 ? '0' + m : String(m));
    }

    function formatSize(bytes) {
        if (!bytes || bytes < 1) return '';
        var gb = bytes / 1073741824;
        if (gb >= 1) return (Math.round(gb * 10) / 10) + ' ГБ';
        return Math.round(bytes / 1048576) + ' МБ';
    }

    function qualityLabel(source) {
        var parts = [];
        if (source.quality) parts.push(source.quality);
        if (source.source_type) parts.push(source.source_type);
        return parts.length ? parts.join(' ') : 'Источник';
    }

    function resolutionOf(label) {
        var m = String(label || '').match(/(\d{3,4})p/i);
        if (m) return parseInt(m[1], 10);
        if (/4k|uhd/i.test(label)) return 2160;
        return 0;
    }

    function langCodeOf(source) {
        var langs = source && source.languages ? source.languages : [];
        for (var i = 0; i < LANGS.length; i++) {
            for (var j = 0; j < langs.length; j++) if (langs[j] === LANGS[i].api) return LANGS[i].code;
        }
        return null;
    }

    function hasLang(source, code) {
        for (var i = 0; i < LANGS.length; i++) {
            if (LANGS[i].code !== code) continue;
            var langs = source.languages || [];
            for (var j = 0; j < langs.length; j++) if (langs[j] === LANGS[i].api) return true;
        }
        return false;
    }

    function isTorrentCard(card) { return !!(card && card.play && card.play.src === 'torrent'); }

    /* ── v15: catalogue files above 1920x1080 on Orsay ──
       The Orsay decoder refuses anything above Full HD, even an encoder-padded 1924x1082, with
       RENDER_ERROR 6:4 — and only after the intro and the pre-roll. The details learn the frame of the TV
       pick (/movies/{id}?tv=1) and, when it is still too big, look for a READY <= 1080p torrent of the
       same title (listed only to users allowed to play torrents): «Открыть 1080p (торрент)» is offered
       and focused in the details, and again on the 6:4 error screen. */
    function frameOf(width, height) {
        var w = Number(width) || 0;
        var h = Number(height) || 0;
        return w && h ? w + 'x' + h : '';
    }

    function frameText(res) { return String(res || '').replace(/\s*[x|]\s*/, '×'); }

    function pickHdAlternative(view) {
        var list = view && view.allowed !== false && view.sources ? view.sources : [];
        var best = null;
        var bestRes = 0;
        for (var i = 0; i < list.length; i++) {
            var item = list[i];
            if (!item || !item.source_id || item.state !== 'ready' || item.health === 'dead') continue;
            var res = resolutionOf(qualityLabel(item));
            /* the best frame <= 1080p; equal frames keep the backend's order (language, health) */
            if (!res || res > 1080 || res <= bestRes) continue;
            best = item;
            bestRes = res;
        }
        return best;
    }

    function lookupHdAlternative(tmdb, done) {
        if (!IS_ORSAY || !tmdb) return;
        api.torrentSources('movie', tmdb).then(function (view) {
            var source = pickHdAlternative(view);
            if (source) done({ tmdb: Number(tmdb), source: source });
        })['catch'](function () {});
    }

    function hdAlternativeCard(card, alt) {
        var copy = {};
        for (var key in card) if (Object.prototype.hasOwnProperty.call(card, key)) copy[key] = card[key];
        copy.play = { src: 'torrent', kind: 'movie', id: String(alt.tmdb), sourceId: alt.source.source_id };
        copy.release = alt.source;
        copy.tmdbId = alt.tmdb;
        copy.quality = qualityLabel(alt.source);
        copy.sourceRes = '';
        copy.hdAlt = null;
        return copy;
    }

    function qualityOptions() {
        var seen = {};
        var out = [];
        for (var i = 0; i < det.sources.length; i++) {
            var label = qualityLabel(det.sources[i]);
            if (!seen[label]) { seen[label] = true; out.push(label); }
        }
        out.sort(function (a, b) { return resolutionOf(b) - resolutionOf(a); });
        return out;
    }

    function anySourceWithLang(code) {
        for (var i = 0; i < det.sources.length; i++) if (hasLang(det.sources[i], code)) return true;
        return false;
    }

    /* Best release for the chosen quality (and language when one release has both). */
    function pickSource(quality, lang) {
        var byQuality = null;
        for (var i = 0; i < det.sources.length; i++) {
            var s = det.sources[i];
            if (quality && qualityLabel(s) !== quality) continue;
            if (!byQuality) byQuality = s;
            if (!lang || hasLang(s, lang)) return s;
        }
        return byQuality;
    }

    function applySources(view) {
        det.view = view || null;
        det.sources = [];
        var list = view && view.sources ? view.sources : [];
        for (var i = 0; i < list.length; i++) {
            if (list[i] && list[i].state !== 'failed' && list[i].health !== 'dead') det.sources.push(list[i]);
        }
        var sel = null;
        for (var j = 0; j < det.sources.length && !sel; j++) {
            if (view && view.selected_source_id && det.sources[j].source_id === view.selected_source_id) sel = det.sources[j];
        }
        for (var k = 0; k < det.sources.length && !sel; k++) if (det.sources[k]['default']) sel = det.sources[k];
        if (!sel && det.sources.length) sel = det.sources[0];
        sel = orsayFullHdSource(sel);
        det.selected = sel;
        det.quality = sel ? qualityLabel(sel) : null;
        det.lang = sel ? langCodeOf(sel) : null;
        renderWatchCard();
    }

    /* v15: Orsay (2014) decodes at most 1920x1080 — its default torrent is the best <= 1080p release in the
       backend's order (same audio language first), even when a 2160p one is listed first. The quality pills
       still allow an explicit choice. */
    function orsayFullHdSource(sel) {
        if (!IS_ORSAY || !sel || resolutionOf(qualityLabel(sel)) <= 1080) return sel;
        var lang = langCodeOf(sel);
        var fallback = null;
        for (var i = 0; i < det.sources.length; i++) {
            var item = det.sources[i];
            var res = resolutionOf(qualityLabel(item));
            if (res > 1080) continue;
            if (res > 0 && (!lang || langCodeOf(item) === lang)) return item;
            if (!fallback || (res > 0 && resolutionOf(qualityLabel(fallback)) === 0)) fallback = item;
        }
        return fallback || sel;
    }

    function selectQuality(label) {
        det.quality = label;
        var next = pickSource(label, det.lang);
        if (next && det.lang && !hasLang(next, det.lang)) det.lang = langCodeOf(next);
        det.selected = next;
        renderWatchCard('q:' + label);
    }

    function selectLang(code) {
        if (!anySourceWithLang(code)) { toast('Озвучка на этом языке не найдена'); return; }
        var next = pickSource(det.quality, code);
        if (!next || !hasLang(next, code)) next = pickSource(null, code);
        if (next) { det.selected = next; det.quality = qualityLabel(next); }
        det.lang = code;
        renderWatchCard('l:' + code);
    }

    function voiceNameOf(source) {
        if (source.voices && source.voices.length) return source.voices[0];
        var tracks = source.audio_tracks || [];
        for (var i = 0; i < tracks.length; i++) if (tracks[i].title) return tracks[i].title;
        var code = langCodeOf(source);
        for (var j = 0; j < LANGS.length; j++) if (LANGS[j].code === code) return LANGS[j].name;
        return 'оригинал';
    }

    /* The «Аудио» pill walks through the other releases of the chosen quality, one voice-over at a time. */
    function cycleAudio() {
        var pool = [];
        for (var i = 0; i < det.sources.length; i++) {
            if (!det.quality || qualityLabel(det.sources[i]) === det.quality) pool.push(det.sources[i]);
        }
        if (pool.length < 2) { toast('Других звуковых дорожек нет'); return; }
        var at = 0;
        for (var j = 0; j < pool.length; j++) if (pool[j] === det.selected) at = j;
        det.selected = pool[(at + 1) % pool.length];
        det.lang = langCodeOf(det.selected);
        renderWatchCard('audio');
        toast('Озвучка: ' + voiceNameOf(det.selected));
    }

    function pillNode(label, active, disabled) {
        var node = el('span', 'lite-pill' + (active ? ' is-active' : '') + (disabled ? ' is-disabled' : ''), label);
        return node;
    }

    function renderWatchCard(focusId) {
        var card = det.card;
        if (!card) return;
        var torrent = isTorrentCard(card);
        var sel = det.selected;
        var fav = $('lite-act-fav');
        var rebuild = $('lite-act-rebuild');
        var hd = $('lite-act-hd');
        var hdAlt = !torrent && det.hdAlt ? det.hdAlt : null;
        if (det.tmdb) show(fav); else hide(fav);
        if (torrent && det.tmdbKind) show(rebuild); else hide(rebuild);
        if (hdAlt) show(hd); else hide(hd);
        if (det.saved) addClass(fav, 'is-on'); else removeClass(fav, 'is-on');

        var line = $('lite-details-selected');
        line.innerHTML = '';
        var ready = $('lite-details-ready');
        removeClass(ready, 'is-ok');
        if (torrent) {
            if (sel) {
                line.appendChild(document.createTextNode('✓ Выбрано: ' + qualityLabel(sel)));
                line.appendChild(document.createTextNode(' • '));
                line.appendChild(el('span', 'is-seeds', '▲ ' + (sel.seeders || 0) + ' сидов'));
                var size = formatSize(sel.size_bytes);
                if (size) line.appendChild(document.createTextNode(' • ' + size));
                if (sel.warning) line.appendChild(el('span', 'is-warn', '  ' + clip(sel.warning, 90)));
                if (typeof sel.start_ms === 'number') {
                    setText(ready, 'Готово: старт ' + sel.start_ms + ' мс');
                    addClass(ready, 'is-ok');
                } else if (sel.state === 'ready') {
                    setText(ready, 'Готово к просмотру');
                    addClass(ready, 'is-ok');
                } else if (sel.state === 'loading') {
                    setText(ready, 'Готовится: ' + Math.round((sel.progress || 0) * (sel.progress > 1 ? 1 : 100)) + '%');
                } else {
                    setText(ready, 'Источник найден');
                }
            } else if (det.view) {
                line.appendChild(document.createTextNode((det.view.discovering || det.view.rebuilding) ? 'Подбираем раздачу…' : 'Раздача пока не найдена. Нажмите 🔄, чтобы подобрать заново.'));
                setText(ready, (det.view.discovering || det.view.rebuilding) ? 'Подбираем раздачу…' : 'Раздача не найдена');
            } else {
                line.appendChild(document.createTextNode('Проверяем раздачи…'));
                setText(ready, 'Проверяем доступность…');
            }
        } else {
            line.appendChild(document.createTextNode('✓ Источник: каталог KINOSOTA' + (card.quality ? ' • ' + card.quality : '')));
            if (IS_ORSAY && exceedsFullHd(det.sourceRes)) {
                line.appendChild(el('span', 'is-warn', '  Видео ' + frameText(det.sourceRes) + ' больше 1920×1080 — этот телевизор его не откроет.'));
                setText(ready, hdAlt ? 'Есть версия ' + qualityLabel(hdAlt.source) + ' (торрент)' : 'Видео больше 1080p');
                if (hdAlt) addClass(ready, 'is-ok');
            } else {
                setText(ready, 'Доступно в каталоге');
                addClass(ready, 'is-ok');
            }
        }

        /* quality and language pills (torrent releases only) */
        var qWrap = $('lite-quality-pills');
        var lWrap = $('lite-lang-pills');
        qWrap.innerHTML = '';
        lWrap.innerHTML = '';
        var qNodes = [];
        var lNodes = [];
        var qLabels = torrent ? qualityOptions() : [];
        var q;
        for (q = 0; q < qLabels.length; q++) {
            var qNode = pillNode(qLabels[q], qLabels[q] === det.quality, false);
            qWrap.appendChild(qNode);
            qNodes.push({ node: qNode, id: 'q:' + qLabels[q] });
        }
        if (qNodes.length) show($('lite-quality-row')); else hide($('lite-quality-row'));
        if (torrent && det.sources.length) {
            for (var l = 0; l < LANGS.length; l++) {
                var lNode = pillNode(LANGS[l].flag + ' ' + LANGS[l].label, det.lang === LANGS[l].code, !anySourceWithLang(LANGS[l].code));
                lWrap.appendChild(lNode);
                lNodes.push({ node: lNode, id: 'l:' + LANGS[l].code });
            }
            var audioNode = pillNode('🔊 Аудио', false, false);
            lWrap.appendChild(audioNode);
            lNodes.push({ node: audioNode, id: 'audio' });
            show($('lite-lang-row'));
        } else {
            hide($('lite-lang-row'));
        }

        var rows = [[{ node: $('lite-act-back'), id: 'back' }]];
        var actions = [{ node: $('lite-act-play'), id: 'play' }];
        if (hdAlt) actions.push({ node: hd, id: 'hd' });
        if (det.tmdb) actions.push({ node: fav, id: 'fav' });
        if (torrent && det.tmdbKind) actions.push({ node: rebuild, id: 'rebuild' });
        rows.push(actions);
        if (qNodes.length) rows.push(qNodes);
        if (lNodes.length) rows.push(lNodes);
        det.rows = rows;
        if (focusId) {
            for (var r = 0; r < rows.length; r++) {
                for (var c = 0; c < rows[r].length; c++) if (rows[r][c].id === focusId) { det.row = r; det.col = c; }
            }
        }
        if (det.row >= rows.length) det.row = rows.length - 1;
        if (det.col >= rows[det.row].length) det.col = rows[det.row].length - 1;
        applyDetailsFocus();
    }

    function applyDetailsFocus() {
        var all = det.rows;
        for (var r = 0; r < all.length; r++) {
            for (var c = 0; c < all[r].length; c++) {
                if (state.mode === 'details' && r === det.row && c === det.col) addClass(all[r][c].node, 'is-focused');
                else removeClass(all[r][c].node, 'is-focused');
            }
        }
    }

    function renderDetails() {
        var card = det.card;
        var info = det.info;
        var kicker = [];
        if (info.year) kicker.push(String(info.year));
        if (info.countries.length) kicker.push(info.countries.slice(0, 2).join(', '));
        setText($('lite-details-orig'), kicker.join(', '));
        setText($('lite-details-title'), card.title);
        setText($('lite-details-tagline'), info.tagline ? '«' + info.tagline + '»' : '');
        var rating = $('lite-details-rating');
        var ratingSrc = $('lite-details-ratingsrc');
        if (info.rating) { setText(rating, info.rating.toFixed(1)); show(ratingSrc); } else { setText(rating, ''); hide(ratingSrc); }
        var meta = [];
        var runtime = formatRuntime(info.runtime);
        if (runtime) meta.push(runtime);
        if (info.seasons) meta.push(info.seasons + ' сез.');
        if (info.genres.length) meta.push(info.genres.slice(0, 3).join(' | '));
        setText($('lite-details-meta'), meta.join(' • '));
        setText($('lite-details-overview'), info.overview || '');
        var poster = $('lite-details-poster');
        var posterUrl = card.posterHd || card.poster || '';
        if (poster.getAttribute('src') !== posterUrl) poster.setAttribute('src', posterUrl);
        $('lite-details-bg').style.backgroundImage = info.backdrop ? 'url(' + info.backdrop + ')' : '';
    }

    function mergeInfo(patch) {
        var info = det.info;
        if (!patch) return;
        if (patch.year) info.year = patch.year;
        if (patch.tagline) info.tagline = patch.tagline;
        if (patch.countries && patch.countries.length) info.countries = patch.countries;
        if (patch.genres && patch.genres.length) info.genres = patch.genres;
        if (patch.runtime) info.runtime = patch.runtime;
        if (patch.seasons) info.seasons = patch.seasons;
        if (patch.overview) info.overview = patch.overview;
        if (patch.backdrop) info.backdrop = patch.backdrop;
        if (patch.rating) info.rating = patch.rating;
        if (patch.mime) det.card.mime = patch.mime;
        renderDetails();
    }

    function torrentInfo(res) {
        return {
            tagline: res.tagline || '', countries: res.countries || [], genres: genreNamesOf(res.genres),
            runtime: res.runtime || 0, seasons: res.seasons || 0, overview: res.overview || '',
            backdrop: tmdbSize(res.backdrop, 'w1280'), rating: ratingOf(res.rating), year: res.year || null
        };
    }

    function openDetailsModal(card) {
        if (!card) return;
        det.token += 1;
        var token = det.token;
        det.card = card;
        state.detailsCard = card;
        state.detailsOpen = true;
        /* v15: warm-up before Play — Orsay MEDIA source switched while the user reads the details (one
           async tvWindow call, no-op once active; ?orsaywin=late restores the old timing) and the intro
           config / poster fetched if the boot prefetch has not landed yet. */
        if (IS_ORSAY && ORSAY_EARLY_WIN_SRC) ensureOrsayMediaSource(function () {});
        if (!readIntroCache()) refreshIntroConfig();
        state.mode = 'details';
        var torrent = isTorrentCard(card);
        det.tmdb = card.tmdbId || (torrent ? Number(card.play.id) : null) || null;
        det.tmdbKind = torrent ? card.play.kind : (det.tmdb ? 'movie' : null);
        det.info = {
            year: card.year || null, countries: [], genres: (card.genres || []).slice(0), tagline: '', runtime: card.runtime || 0,
            seasons: 0, overview: card.overview || '', backdrop: card.backdropHd || card.backdrop || '', rating: card.rating || null
        };
        det.view = null;
        det.sources = [];
        det.selected = null;
        det.quality = null;
        det.lang = null;
        det.saved = false;
        det.busy = false;
        det.sourceRes = '';
        det.hdAlt = null;
        det.row = 1;
        det.col = 0;
        renderDetails();
        show($('lite-details'));
        renderWatchCard('play');

        if (torrent) {
            api.torrentDetail(card.play.kind, card.play.id).then(function (res) {
                if (token === det.token && res) mergeInfo(torrentInfo(res));
            })['catch'](function () {});
            api.torrentSources(card.play.kind, card.play.id).then(function (view) {
                if (token === det.token) applySources(view);
            })['catch'](function () {
                if (token === det.token) { det.view = { sources: [], discovering: false }; renderWatchCard(); }
            });
        } else if (card.play && card.play.kind === 'series') {
            api.seriesDetail(card.play.id).then(function (res) {
                if (token !== det.token || !res) return;
                mergeInfo({ overview: res.overview || '', backdrop: tmdbSize(res.backdrop_url, 'w1280'), genres: genreNamesOf(res.genres), seasons: res.seasons ? res.seasons.length : 0 });
            })['catch'](function () {});
        } else {
            api.movieDetail(card.play.id).then(function (res) {
                if (token !== det.token || !res) return;
                if (res.tmdb_id && !det.tmdb) { det.tmdb = res.tmdb_id; det.tmdbKind = 'movie'; loadFavoriteState(token); renderWatchCard(); }
                mergeInfo({ overview: res.overview || '', backdrop: tmdbSize(res.backdrop, 'w1280'), runtime: res.runtime || 0, genres: genreNamesOf(res.genres), mime: res.mime_type || '' });
                det.sourceRes = frameOf(res.resolution_width, res.resolution_height);
                if (IS_ORSAY && exceedsFullHd(det.sourceRes)) {
                    debugLog('warn', 'catalogue file ' + det.sourceRes + ' > 1920x1080: looking for a 1080p torrent');
                    renderWatchCard();
                    lookupHdAlternative(res.tmdb_id, function (alt) {
                        if (token !== det.token) return;
                        det.hdAlt = alt;
                        /* the playable version takes the focus unless the user has already moved on */
                        var onPlay = state.mode === 'details' && det.rows[det.row] && det.rows[det.row][det.col] && det.rows[det.row][det.col].id === 'play';
                        renderWatchCard(onPlay ? 'hd' : undefined);
                    });
                }
                if (res.tmdb_id) {
                    api.torrentDetail('movie', res.tmdb_id).then(function (extra) {
                        if (token === det.token && extra) mergeInfo({ tagline: extra.tagline || '', countries: extra.countries || [], rating: ratingOf(extra.rating) });
                    })['catch'](function () {});
                }
            })['catch'](function () {});
        }
        loadFavoriteState(token);
    }

    function loadFavoriteState(token) {
        if (!det.tmdb || !readToken()) return;
        api.favoriteState(det.tmdbKind + ':' + det.tmdb).then(function (res) {
            if (token !== det.token) return;
            var saved = res && res.saved ? res.saved : [];
            det.saved = saved.indexOf(det.tmdbKind + ':' + det.tmdb) !== -1;
            renderWatchCard();
        })['catch'](function () {});
    }

    function closeDetailsModal() {
        det.token += 1;
        state.detailsOpen = false;
        hide($('lite-details'));
        restoreFocus();
    }

    function toggleFavorite() {
        if (!det.tmdb || det.busy) return;
        if (!readToken()) { toast('Войдите в аккаунт KINOSOTA, чтобы сохранять в избранное'); return; }
        det.busy = true;
        var token = det.token;
        var adding = !det.saved;
        var call = adding ? api.favoriteAdd(det.tmdbKind, det.tmdb) : api.favoriteRemove(det.tmdbKind, det.tmdb);
        call.then(function () {
            det.busy = false;
            if (token !== det.token) return;
            det.saved = adding;
            renderWatchCard('fav');
            toast(adding ? 'Добавлено в избранное' : 'Убрано из избранного');
        })['catch'](function (error) {
            det.busy = false;
            toast(error && (error.status === 401 || error.status === 403) ? 'Войдите в аккаунт KINOSOTA' : 'Не удалось изменить избранное');
        });
    }

    var REBUILD_TEXT = {
        rebuilding: 'Раздача пересобирается, это займёт около минуты',
        cooldown: 'Раздачу уже недавно пересобирали, подождите немного',
        busy: 'Подбор раздачи уже идёт',
        no_source: 'Нет раздачи, которую можно пересобрать'
    };

    function rebuildSelected() {
        if (!det.tmdb || !det.tmdbKind || det.busy) return;
        det.busy = true;
        var token = det.token;
        toast('Пересобираем раздачу…');
        api.torrentRebuild(det.tmdbKind, det.tmdb, det.selected && det.selected.source_id).then(function (res) {
            det.busy = false;
            if (token !== det.token) return;
            toast(REBUILD_TEXT[res && res.rebuild] || 'Готово');
            if (res && res.sources) applySources(res);
        })['catch'](function (error) {
            det.busy = false;
            toast(error && (error.status === 401 || error.status === 403) ? 'Войдите в аккаунт KINOSOTA' : 'Не удалось пересобрать раздачу');
        });
    }

    function playSelected() {
        var card = det.card;
        if (!card) return;
        var copy = {};
        for (var key in card) if (Object.prototype.hasOwnProperty.call(card, key)) copy[key] = card[key];
        copy.play = { src: card.play.src, kind: card.play.kind, id: card.play.id, sourceId: det.selected && det.selected.source_id ? det.selected.source_id : null };
        copy.release = det.selected || null;
        copy.sourceRes = isTorrentCard(card) ? '' : det.sourceRes;
        copy.hdAlt = isTorrentCard(card) ? null : det.hdAlt;
        openPlayer(copy);
    }

    function playHdAlternative() {
        if (!det.card || !det.hdAlt) return;
        debugLog('info', 'open the ' + qualityLabel(det.hdAlt.source) + ' torrent instead of the ' + det.sourceRes + ' catalogue file');
        openPlayer(hdAlternativeCard(det.card, det.hdAlt));
    }

    function activateDetails(id) {
        if (id === 'back') closeDetailsModal();
        else if (id === 'play') playSelected();
        else if (id === 'hd') playHdAlternative();
        else if (id === 'fav') toggleFavorite();
        else if (id === 'rebuild') rebuildSelected();
        else if (id === 'audio') cycleAudio();
        else if (id.indexOf('q:') === 0) selectQuality(id.slice(2));
        else if (id.indexOf('l:') === 0) selectLang(id.slice(2));
    }

    /* ── Player (Unified Native TV Engine + Ad/Intro Queue + Track Switcher) ── */
    var orsayProvenEngine = '';
    var player = {
        card: null, sessionId: null, heartbeat: null, barTimer: null, loadId: 0,
        ready: false, stallTimer: null, firstFrame: false, problem: false, focusAct: 0,
        phase: 'film', /* intro | ad | film */
        engineKind: 'html5',
        lastNativeErr: '', lastNativeRes: '', orsaySefTried: false, orsayTried: {}, winSrcLogged: false, winSrcMedia: false, currentOpenUrl: '',
        paused: true, currentTime: 0, duration: 0,
        adTimer: null, adStartedAt: 0, adElapsed: 0, adDeliveryId: null, adSkipAfter: null, adCanSkip: false,
        adImpressionSent: false, adPlanStarted: false, adPrepDone: false, adPrepared: null, adPrepPromise: null,
        introTimer: null, introConfig: null, introDone: false, waitingForStream: false,
        adPlan: null, stream: null, streamDone: false, streamError: null,
        tracks: [], trackOpen: false, trackFocus: 0,
        stallDeadline: 0, stallBumpAt: 0, seekLogged: false,
        /* engineSeq invalidates every native callback of a released engine; the timers are the only
           deferred opens and are cancelled on every new stage, rescue or close. */
        engineSeq: 0, openTimer: null, rescueTimer: null, echoTimer: null, nativeReleasedAt: 0,
        /* v15 hand-over state: Intro >= MIN_INTRO_MS, film first bytes (probe), veil / Ambient Hold. */
        introShownAt: 0, introClipEnded: false, handoffTimer: null, handoffStarted: false,
        filmBytesReady: false, probeTimedOut: false, probeXhr: null, probeTimer: null,
        adWaitSince: 0, adWaitExpired: false, veilTimer: null, posterTimer: null, filmNoticeTimer: null,
        lastReleaseClean: false, volumeTimer: null, volumeBefore: -1,
        /* v15: the 6:4 error screen offers the ready 1080p torrent instead of «Выбрать другой источник». */
        hdOffer: false
    };

    var ORSAY_LANGS = {
        6384738: 'Albanian', 7565673: 'Albanian', 6647399: 'English', 6388325: 'Azerbaijani',
        6386285: 'Armenian', 6448492: 'Belarusian', 6452588: 'Bulgarian', 6514793: 'Chinese',
        6776178: 'German', 6911073: 'Italian', 7565409: 'Spanish', 7037306: 'Kazakh',
        7040882: 'Korean', 7368562: 'Portuguese', 7501171: 'Russian', 7564399: 'Slovak',
        7564406: 'Slovenian', 7565936: 'Serbian', 7632242: 'Turkish', 7699042: 'Uzbek',
        7695218: 'Ukrainian', 8026747: 'Ukrainian', 6713957: 'French', 7567205: 'Swedish',
        6975598: 'Japanese'
    };

    function orsayLangName(num) {
        num = Number(num) || 0;
        if (ORSAY_LANGS[num]) return ORSAY_LANGS[num];
        if (num < 0x610000) return '';
        try {
            var hex = Number(num).toString(16);
            while (hex.length < 6) hex = '0' + hex;
            var code = String.fromCharCode(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)).replace(/\0/g, '');
            if (code) return code.toUpperCase();
        } catch (e) {}
        return '';
    }

    /* The TV contour runs over plain HTTP: https:// links to our own hosts are played over http://.
       Media Node links stay https:// (the nodes have no port 80, their RSA certificates suit old TVs). */
    function normalizeTvUrl(url) {
        if (!url || typeof url !== 'string') return url || '';
        var loc = window.location;
        if (!loc || loc.protocol !== 'http:') return url;
        var m = url.match(/^https:\/\/([^\/:?#]+)(?::443)?([\/?#].*)?$/i);
        if (m && !MEDIA_NODE_HOST.test(m[1]) && TV_HTTP_HOSTS[m[1].toLowerCase()]) return 'http://' + m[1] + (m[2] || '/');
        return url;
    }

    /* 409 TV_MEDIA_UNSUPPORTED: a file this TV cannot decode (or above its Full-HD ceiling). */
    function tvMediaDetail(error) {
        var detail = error && error.status === 409 && error.data ? error.data.detail : null;
        return detail && typeof detail === 'object' && detail.code === 'TV_MEDIA_UNSUPPORTED' ? detail : null;
    }

    function tvMediaAlternative(error) {
        var detail = tvMediaDetail(error);
        return detail && typeof detail.alternative_source_id === 'string' ? detail.alternative_source_id : '';
    }

    function toAbsoluteUrl(url) {
        if (!url || typeof url !== 'string') return '';
        url = normalizeTvUrl(url);
        var loc = window.location;
        var proto = (loc && loc.protocol === 'https:') ? 'https:' : 'http:';
        var host = (loc && loc.host) ? loc.host : '';
        if (url.charAt(0) === '/' && url.charAt(1) !== '/') {
            return host ? (proto + '//' + host + url) : url;
        }
        var m = url.match(/^(https?):\/\/([^\/]+)(\/.*)?$/i);
        if (m && loc && loc.hostname && m[2].toLowerCase().split(':')[0] === loc.hostname.toLowerCase()) {
            return proto + '//' + host + (m[3] || '/');
        }
        return url;
    }

    function setNativePlane(active) {
        var htmlEl = document.documentElement;
        var bodyEl = document.body;
        var appEl = $('lite-app');
        var plEl = $('lite-player');
        var bg = active ? 'transparent' : '';
        if (active) {
            addClass(htmlEl, 'lite-native-plane');
            addClass(bodyEl, 'lite-native-plane');
        } else {
            removeClass(htmlEl, 'lite-native-plane');
            removeClass(bodyEl, 'lite-native-plane');
        }
        try { if (htmlEl && htmlEl.style) htmlEl.style.backgroundColor = bg; } catch (e0) {}
        try { if (bodyEl && bodyEl.style) bodyEl.style.backgroundColor = bg; } catch (e1) {}
        try { if (appEl && appEl.style) appEl.style.backgroundColor = bg; } catch (e2) {}
        try { if (plEl && plEl.style) plEl.style.backgroundColor = bg; } catch (e3) {}
    }

    function setEngineLabel(text) {
        var node = $('lite-player-engine');
        if (node) setText(node, text || '');
    }

    /* create === false only looks the object up: capability checks must never attach a player object. */
    function orsaySefNode(create) {
        var node = create === false ? $('pluginObjectSef') : ensureOrsayPluginObject('pluginObjectSef', 'SAMSUNG-INFOLINK-SEF');
        return (node && isCallableNative(node.Open) && isCallableNative(node.Execute)) ? node : null;
    }

    function orsayPlayerNode(create) {
        var node = create === false ? $('pluginObjectPlayer') : ensureOrsayPluginObject('pluginObjectPlayer', 'SAMSUNG-INFOLINK-PLAYER');
        return (node && isCallableNative(node.InitPlayer) && isCallableNative(node.StartPlayback)) ? node : null;
    }

    function canUseOrsayAvplay() {
        return IS_ORSAY && !!(window.webapis && window.webapis.avplay && isCallableNative(window.webapis.avplay.getAVPlay));
    }

    function canUseOrsaySef() {
        return IS_ORSAY && !!orsaySefNode(false);
    }

    function canUseOrsayPlayer() {
        return IS_ORSAY && !!orsayPlayerNode(false);
    }

    function canUseTizenAvplay() {
        return !canUseOrsayAvplay() && !!(window.webapis && window.webapis.avplay && isCallableNative(window.webapis.avplay.open));
    }

    var nativeSession = { kind: 'html5', phase: 'film', av: null, plugin: null, sef: null, pl: null, activeTrack: 0, trail: '', openedAt: 0, tracksLogged: false };

    /* Compact per-session event trail for tvdiag: "9,12,13*4,14=0*6" (repeats of the last type are counted;
       14+ = CURRENT_PLAYBACK_TIME with ms > 0, 14=0 = the clock ticks but stays at 0). */
    function noteNativeEvent(type, data) {
        var key = String(type);
        if (type === 14) key = (Number(data) || 0) > 0 ? '14+' : '14=0';
        var trail = nativeSession.trail;
        var parts = trail ? trail.split(',') : [];
        var last = parts.length ? parts[parts.length - 1] : '';
        var m = last.match(/^(.+?)\*(\d+)$/);
        var lastKey = m ? m[1] : last;
        if (lastKey === key) parts[parts.length - 1] = key + '*' + ((m ? Number(m[2]) : 1) + 1);
        else if (parts.length < 24) parts.push(key);
        nativeSession.trail = parts.join(',');
    }

    function errText(err) {
        if (!err) return '-';
        if (typeof err === 'object') return String(err.code !== undefined ? err.code : '') + ':' + String(err.message || err.name || '');
        return String(err);
    }

    function waitNativePlatform(callback) {
        if (nativePlatformReady || canUseOrsayAvplay() || canUseOrsaySef() || canUseOrsayPlayer() || (!IS_ORSAY && !IS_TIZEN)) {
            callback();
            return;
        }
        var attempts = 0;
        var limit = IS_ORSAY ? 50 : 20;
        var timer = setInterval(function () {
            attempts += 1;
            if (nativePlatformReady || canUseOrsayAvplay() || canUseOrsaySef() || canUseOrsayPlayer() || canUseTizenAvplay() || attempts >= limit) {
                clearInterval(timer);
                callback();
            }
        }, 100);
    }

    /* Orsay drivers expose the same stream API under different call shapes:
       AVPlay av.getTotalNumOfStreamID(1), SEF Execute('GetTotalNumOfStreamID', 1), Player GetTotalNumOfStreamID(1). */
    function orsayStreamCaller() {
        var kind = nativeSession.kind;
        if ((kind === 'orsay' || kind === 'orsay-sdk') && nativeSession.av) {
            var av = nativeSession.av;
            return function (name, a, b) {
                var fn = av[name.charAt(0).toLowerCase() + name.slice(1)];
                if (typeof fn !== 'function') return null;
                return b === undefined ? fn.call(av, a) : fn.call(av, a, b);
            };
        }
        if (kind === 'orsay-sef' && nativeSession.sef) {
            var sef = nativeSession.sef;
            return function (name, a, b) {
                return b === undefined ? sef.Execute(name, a) : sef.Execute(name, a, b);
            };
        }
        if (kind === 'orsay-player' && nativeSession.pl) {
            var pl = nativeSession.pl;
            return function (name, a, b) {
                var fn = pl[name];
                if (typeof fn !== 'function') return null;
                return b === undefined ? fn.call(pl, a) : fn.call(pl, a, b);
            };
        }
        return null;
    }

    function orsayCodecOf(extra) {
        if (!extra) return '';
        try {
            var parsed = JSON.parse(extra);
            if (parsed && (parsed.codec || parsed.fourCC)) return String(parsed.codec || parsed.fourCC).toUpperCase();
        } catch (e) {}
        var m = String(extra).match(/(e-?ac-?3|ac-?3|dts|truehd|aac|mp3|mpeg|pcm|wma)/i);
        return m ? m[1].toUpperCase() : '';
    }

    function readOrsayTracks(call) {
        var list = [];
        var total = 0;
        try { total = Number(call('GetTotalNumOfStreamID', 1)) || 0; } catch (e0) { total = 0; }
        if (total > 16) total = 16;
        for (var i = 0; i < total; i++) {
            var lang = '';
            var codec = '';
            try { lang = orsayLangName(call('GetStreamLanguageInfo', 1, i)); } catch (e1) {}
            try { codec = orsayCodecOf(call('GetStreamExtraData', 1, i)); } catch (e2) {}
            var detail = (lang && codec) ? (lang + ' · ' + codec) : (lang || codec);
            list.push({ index: i, label: detail ? ('Дорожка ' + (i + 1) + ' (' + detail + ')') : ('Дорожка ' + (i + 1)), active: i === nativeSession.activeTrack });
        }
        return list;
    }

    function readEngineTracks() {
        var list = [];
        var i;
        var orsayCall = orsayStreamCaller();
        if (orsayCall) {
            list = readOrsayTracks(orsayCall);
            if (!nativeSession.tracksLogged) {
                nativeSession.tracksLogged = true;
                reportTvDiag('tracks', nativeSession.kind + '|n=' + list.length);
            }
            if (list.length) debugLog('info', 'audio tracks: ' + list.length);
        } else if (nativeSession.kind === 'tizen' && window.webapis && window.webapis.avplay) {
            try {
                var all = window.webapis.avplay.getTotalTrackInfo() || [];
                var pos = 0;
                for (i = 0; i < all.length; i++) {
                    if (all[i].type !== 'AUDIO') continue;
                    var tIdx = parseInt(all[i].index, 10);
                    var tLang = '';
                    var tCodec = '';
                    try {
                        var tExtra = JSON.parse(all[i].extra_info || '{}');
                        tLang = tExtra.language ? String(tExtra.language).toUpperCase() : '';
                        tCodec = tExtra.codec ? String(tExtra.codec).toUpperCase() : '';
                    } catch (e4) {}
                    var tDet = (tLang && tCodec) ? (tLang + ' · ' + tCodec) : (tLang || tCodec);
                    list.push({ index: tIdx, label: tDet ? ('Дорожка ' + (pos + 1) + ' (' + tDet + ')') : ('Дорожка ' + (pos + 1)), active: tIdx === nativeSession.activeTrack || (nativeSession.activeTrack === 0 && pos === 0) });
                    pos += 1;
                }
            } catch (e5) {}
        } else {
            var video = $('lite-video');
            var audio = video && video.audioTracks ? video.audioTracks : null;
            if (audio && audio.length) {
                for (i = 0; i < audio.length; i++) {
                    var label = (audio[i].label || audio[i].language || '').trim();
                    list.push({ index: i, label: label || ('Дорожка ' + (i + 1)), active: !!audio[i].enabled });
                }
            }
        }
        player.tracks = list;
        renderTrackStatus();
    }

    function selectEngineTrack(listIndex) {
        var picked = player.tracks[listIndex];
        if (!picked) return;
        var orsayCall = orsayStreamCaller();
        if (orsayCall) {
            try {
                orsayCall('SetStreamID', 1, picked.index);
                nativeSession.activeTrack = picked.index;
                debugLog('info', 'SetStreamID(1, ' + picked.index + ')');
            } catch (e) { debugLog('error', 'SetStreamID failed: ' + debugStringify(e)); }
        } else if (nativeSession.kind === 'tizen' && window.webapis && window.webapis.avplay) {
            try {
                window.webapis.avplay.setSelectTrack('AUDIO', picked.index);
                nativeSession.activeTrack = picked.index;
            } catch (e2) {}
        } else {
            var video = $('lite-video');
            var audio = video && video.audioTracks ? video.audioTracks : null;
            if (audio) {
                for (var i = 0; i < audio.length; i++) audio[i].enabled = (i === picked.index);
            }
        }
        readEngineTracks();
        renderTrackBar();
        toast('Звук: ' + picked.label);
    }

    function renderTrackStatus() {
        var badge = $('lite-player-audio');
        var hint = $('lite-player-hint');
        if (!badge || !hint) return;
        if (player.phase !== 'film' || !player.tracks || !player.tracks.length) {
            hide(badge);
            setText(hint, player.phase === 'film' ? 'OK — пауза · ◀ ▶ — 30 сек · Назад — выход' : 'Реклама · Назад — выход');
            return;
        }
        var active = player.tracks[0];
        for (var i = 0; i < player.tracks.length; i++) if (player.tracks[i].active) active = player.tracks[i];
        setText(badge, '🔊 ' + active.label + (player.tracks.length > 1 ? ' (' + player.tracks.length + ')' : ''));
        show(badge);
        setText(hint, player.tracks.length > 1
            ? 'OK — пауза · ◀ ▶ — 30 сек · ▼ — дорожка · Назад — выход'
            : 'OK — пауза · ◀ ▶ — 30 сек · Назад — выход');
    }

    function renderTrackBar() {
        var box = $('lite-player-tracks');
        if (!box) return;
        box.innerHTML = '';
        if (!player.trackOpen || !player.tracks || player.tracks.length < 2) {
            hide(box);
            return;
        }
        for (var i = 0; i < player.tracks.length; i++) {
            var t = player.tracks[i];
            var cls = 'lite-pill' + (t.active ? ' is-active' : '') + (i === player.trackFocus ? ' is-focused' : '');
            box.appendChild(el('span', cls, t.label));
        }
        show(box);
    }

    function openTrackBar() {
        if (player.phase !== 'film' || !player.tracks || player.tracks.length < 2) { showBar(); return; }
        player.trackOpen = true;
        player.trackFocus = 0;
        for (var i = 0; i < player.tracks.length; i++) if (player.tracks[i].active) player.trackFocus = i;
        renderTrackBar();
        showBar();
    }

    function closeTrackBar() {
        player.trackOpen = false;
        renderTrackBar();
        showBar();
    }

    function engineBusy() {
        if (nativeSession.kind !== 'html5') return true;
        var video = $('lite-video');
        return !!(video && video.getAttribute && video.getAttribute('src'));
    }

    function noop() {}

    function clearEngineTimers() {
        clearTimeout(player.openTimer);
        player.openTimer = null;
        clearTimeout(player.rescueTimer);
        player.rescueTimer = null;
        clearTimeout(player.echoTimer);
        player.echoTimer = null;
    }

    function videoHasSource(video) {
        return !!(video && video.getAttribute && video.getAttribute('src'));
    }

    /* ROOT CAUSE of «9 -> 12 -> no frame» on Orsay (v8 SEF, v9/v10 AVPlay): every engine switch ran
       video.pause() + video.removeAttribute('src') + video.load() on the sourceless <video id="lite-video">.
       In WebKit 537 both pause() on an empty element and load() run the media load algorithm, which creates
       the platform MediaPlayer; on Maple that is Samsung's hardware player. It was created right before
       AVPlay/SEF opened the stream, so the native player demuxed (9), buffered (12) and reached STARTED
       (status 4) but never got the decoders: no RENDERING_START (7), no clock (14) and, on teardown,
       RENDER_ERROR 6:2 + 6:3 (video + audio decoder never initialised). Lampa has no <video> at all in
       Orsay mode. A sourceless element is now left alone; a used one on Orsay is swapped for a fresh clone
       instead of load(), so no WebKit player stays behind. */
    function releaseHtml5Video(video) {
        if (!videoHasSource(video)) return;
        try { video.pause(); } catch (e0) {}
        try { video.removeAttribute('src'); } catch (e1) {}
        if (IS_ORSAY) { recycleOrsayVideo(video); return; }
        try { video.load(); } catch (e2) {}
    }

    function recycleOrsayVideo(video) {
        var parent = video && video.parentNode;
        if (!parent) return;
        try {
            var fresh = video.cloneNode(false);
            fresh.removeAttribute('src');
            fresh.setAttribute('preload', 'none');
            parent.replaceChild(fresh, video);
            bindVideo();
            reportTvDiag('v_recycle', player.phase);
        } catch (e) {}
    }

    /* Callbacks are detached before destroy()/Close()/Stop(): a released engine must not drive the next stage. */
    function muteNativeCallbacks() {
        if (nativeSession.kind === 'orsay' && nativeSession.av) { try { nativeSession.av.onEvent = noop; } catch (e0) {} }
        if (nativeSession.sef) { try { nativeSession.sef.OnEvent = noop; } catch (e1) {} }
        var pl = nativeSession.pl;
        if (pl) {
            var names = ['OnStreamInfoReady', 'OnRenderingComplete', 'OnCurrentPlayTime', 'OnBufferingStart', 'OnBufferingComplete',
                'OnConnectionFailed', 'OnNetworkDisconnected', 'OnRenderError', 'OnStreamNotFound'];
            for (var i = 0; i < names.length; i++) { try { pl[names[i]] = noop; } catch (e2) {} }
        }
    }

    function engineDetach(stopStream, keepNativeUi) {
        var kind = nativeSession.kind;
        player.engineSeq += 1;
        clearEngineTimers();
        clearStall();
        if (engineBusy()) {
            player.lastReleaseAt = Date.now();
            /* v15: clean = the stage rendered (7), saw no error event (1-4, 6) and is stopped on purpose. */
            player.lastReleaseClean = !!(stopStream && player.firstFrame && !/(^|,)[12346](\*\d+)?(,|$)/.test(nativeSession.trail || ''));
        }
        if (kind !== 'html5' && kind !== 'tizen') {
            player.nativeReleasedAt = Date.now();
            reportTvDiag('rel', kind + '|' + (nativeSession.phase || player.phase) + '|ev=' + (nativeSession.trail || '-'));
        }
        muteNativeCallbacks();
        if ((kind === 'orsay' || kind === 'orsay-sdk') && nativeSession.av) {
            if (stopStream) { try { nativeSession.av.stop(); } catch (e1) {} }
            try { nativeSession.av.destroy(); } catch (e2) {}
        } else if (kind === 'orsay-sef' && nativeSession.sef) {
            try { nativeSession.sef.Execute('Stop'); } catch (e3) {}
            try { nativeSession.sef.Close(); } catch (e4) {}
        } else if (kind === 'orsay-player' && nativeSession.pl) {
            try { nativeSession.pl.Stop(); } catch (e5) {}
        } else if (kind === 'tizen' && window.webapis && window.webapis.avplay) {
            try { window.webapis.avplay.stop(); } catch (e6) {}
            try { window.webapis.avplay.close(); } catch (e7) {}
        }
        if (kind !== 'html5') debugLog('info', 'released ' + kind);
        nativeSession.kind = 'html5';
        nativeSession.av = null;
        nativeSession.plugin = null;
        nativeSession.sef = null;
        nativeSession.pl = null;
        nativeSession.activeTrack = 0;
        nativeSession.trail = '';
        nativeSession.openedAt = 0;
        nativeSession.tracksLogged = false;
        setNativePlane(false);
        if (!keepNativeUi) setEngineLabel('');
        var host = $('lite-native-host');
        if (host) host.innerHTML = '';
        var video = $('lite-video');
        if (video) {
            if (keepNativeUi || IS_ORSAY || IS_TIZEN) hide(video); else show(video);
            releaseHtml5Video(video);
        }
        player.paused = true;
        player.currentTime = 0;
        player.duration = 0;
        player.tracks = [];
        player.trackOpen = false;
        renderTrackBar();
        renderTrackStatus();
    }

    function enginePlayPause(force) {
        var wantPlay = force === 'play' || (force !== 'pause' && player.paused);
        if ((nativeSession.kind === 'orsay' || nativeSession.kind === 'orsay-sdk') && nativeSession.av) {
            try {
                if (wantPlay) {
                    if (String(nativeSession.av.status) === '5' && nativeSession.av.resume) nativeSession.av.resume();
                    else nativeSession.av.play(function () {}, function () {});
                    player.paused = false;
                } else {
                    nativeSession.av.pause();
                    player.paused = true;
                }
            } catch (e) {}
            updateProgress();
            showBar();
            return;
        }
        if (nativeSession.kind === 'orsay-sef' && nativeSession.sef) {
            try {
                nativeSession.sef.Execute(wantPlay ? 'Resume' : 'Pause');
                player.paused = !wantPlay;
            } catch (eSef) {}
            updateProgress();
            showBar();
            return;
        }
        if (nativeSession.kind === 'orsay-player' && nativeSession.pl) {
            try {
                if (wantPlay) nativeSession.pl.Resume();
                else nativeSession.pl.Pause();
                player.paused = !wantPlay;
            } catch (ePl) {}
            updateProgress();
            showBar();
            return;
        }
        if (nativeSession.kind === 'tizen' && window.webapis && window.webapis.avplay) {
            try {
                if (wantPlay) { window.webapis.avplay.play(); player.paused = false; }
                else { window.webapis.avplay.pause(); player.paused = true; }
            } catch (e2) {}
            updateProgress();
            showBar();
            return;
        }
        var video = $('lite-video');
        /* Orsay: play()/pause() on a sourceless <video> would create the WebKit (hardware) media player. */
        if (IS_ORSAY && !videoHasSource(video)) { updateProgress(); showBar(); return; }
        try {
            if (wantPlay) {
                var started = video.play();
                if (started && typeof started.then === 'function') started.then(null, function () {});
                player.paused = false;
            } else {
                video.pause();
                player.paused = true;
            }
        } catch (e3) {}
        updateProgress();
        showBar();
    }

    function engineSeek(delta) {
        if (!player.ready || player.phase !== 'film') return;
        if ((nativeSession.kind === 'orsay' || nativeSession.kind === 'orsay-sdk') && nativeSession.av) {
            try {
                var secs = Math.round(Math.abs(delta));
                var seekRet;
                var sought = false;
                if (delta >= 0 && isCallableNative(nativeSession.av.jumpForward)) {
                    seekRet = nativeSession.av.jumpForward(secs);
                    sought = !nativeFailed(seekRet);
                } else if (delta < 0 && isCallableNative(nativeSession.av.jumpBackward)) {
                    seekRet = nativeSession.av.jumpBackward(secs);
                    sought = !nativeFailed(seekRet);
                }
                if (!sought && nativeSession.plugin && nativeSession.plugin.Execute) {
                    seekRet = nativeSession.plugin.Execute(delta >= 0 ? 'JumpForward' : 'JumpBackward', secs);
                    sought = !nativeFailed(seekRet);
                }
                if (!player.seekLogged || !sought) {
                    player.seekLogged = true;
                    reportTvDiag('seek', nativeSession.kind + '|' + (delta >= 0 ? '+' : '-') + secs + '|ok=' + sought + '|' + String(seekRet));
                }
                player.currentTime = Math.max(0, player.currentTime + delta);
            } catch (e) { reportTvDiag('seek_err', nativeSession.kind + '|' + errText(e)); }
            updateProgress();
            showBar();
            return;
        }
        if (nativeSession.kind === 'orsay-sef' && nativeSession.sef) {
            try {
                var sSecs = Math.round(Math.abs(delta));
                nativeSession.sef.Execute(delta >= 0 ? 'JumpForward' : 'JumpBackward', sSecs);
                player.currentTime = Math.max(0, player.currentTime + delta);
            } catch (eSef) {}
            updateProgress();
            showBar();
            return;
        }
        if (nativeSession.kind === 'orsay-player' && nativeSession.pl) {
            try {
                var pSecs = Math.round(Math.abs(delta));
                if (delta >= 0 && nativeSession.pl.JumpForward) nativeSession.pl.JumpForward(pSecs);
                else if (delta < 0 && nativeSession.pl.JumpBackward) nativeSession.pl.JumpBackward(pSecs);
                player.currentTime = Math.max(0, player.currentTime + delta);
            } catch (ePl) {}
            updateProgress();
            showBar();
            return;
        }
        if (nativeSession.kind === 'tizen' && window.webapis && window.webapis.avplay) {
            try {
                var dur = player.duration || 0;
                var target = player.currentTime + delta;
                if (target < 0) target = 0;
                if (dur && target > dur - 1) target = dur - 1;
                window.webapis.avplay.seekTo(Math.round(target * 1000));
                player.currentTime = target;
            } catch (e2) {}
            updateProgress();
            showBar();
            return;
        }
        var video = $('lite-video');
        var duration = video.duration && video.duration !== Infinity ? video.duration : 0;
        var vTarget = (video.currentTime || 0) + delta;
        if (vTarget < 0) vTarget = 0;
        if (duration && vTarget > duration - 1) vTarget = duration - 1;
        try { video.currentTime = vTarget; player.currentTime = vTarget; } catch (e3) {}
        updateProgress();
        showBar();
    }

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

    /* v15: buffering states (11 / 13 / 5 and their plugin / HTML5 twins) never surface during the
       commercial stages — the intro poster / veil covers them and the stall watchdog keeps running
       (extendStall). Only the film shows them. */
    function bufferNotice(text) {
        if (player.phase === 'intro' || player.phase === 'ad') return;
        if (player.ready) playerMessage(text);
    }

    function showBar() {
        var bar = $('lite-player-bar');
        removeClass(bar, 'is-faded');
        clearTimeout(player.barTimer);
        player.barTimer = setTimeout(function () {
            if (player.ready && !player.paused && !player.trackOpen && player.phase === 'film') addClass(bar, 'is-faded');
        }, BAR_HIDE_MS);
    }

    function updateProgress() {
        if (nativeSession.kind === 'html5') {
            var video = $('lite-video');
            if (video) {
                player.duration = video.duration && video.duration !== Infinity ? video.duration : 0;
                player.currentTime = video.currentTime || 0;
                player.paused = !!video.paused;
            }
        }
        var duration = player.duration || 0;
        var current = player.currentTime || 0;
        $('lite-progress-fill').style.width = duration ? Math.min(1184, Math.round(current / duration * 1184)) + 'px' : '0';
        setText($('lite-player-time'), formatTime(current) + ' / ' + formatTime(duration));
        setText($('lite-player-state'), player.paused ? '❚❚' : '▶');
        if (player.phase === 'ad') updateAdOverlay(current, duration);
        /* v15: within 0.25 s of the intro's end its still frame takes over (no black EOS frame). */
        if (player.phase === 'intro' && !player.introClipEnded && !player.introDone && duration > 1 && current >= duration - 0.25) {
            var eosId = player.loadId;
            setTimeout(function () { if (eosId === player.loadId) onIntroClipEnded('eos'); }, 0);
        }
    }

    function failText(error) {
        var status = error && error.status;
        if (status === 401 || status === 403) return 'Для просмотра нужен вход в аккаунт KINOSOTA.';
        if (tvMediaDetail(error)) return 'Этот файл не поддерживается телевизором. Выберите другой источник.';
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
                    return api.torrentTicket({ kind: 'tv', tmdb_id: tmdbId, season: episode.season, episode: episode.episode }).then(function (ticket) {
                        return { url: ticket && ticket.stream_url, adEpisode: episode };
                    });
                });
            }
            var movieChoice = { kind: 'movie', tmdb_id: tmdbId };
            if (play.sourceId) movieChoice.source_id = play.sourceId;
            return api.torrentTicket(movieChoice).then(function (ticket) { return { url: ticket && ticket.stream_url }; });
        }
        if (play.kind === 'series') {
            return api.seriesDetail(play.id).then(function (detail) {
                var episode = firstSeriesEpisode(detail);
                if (!episode) throw noStream();
                return api.startSeriesPlayback(episode.id).then(function (res) {
                    return { url: res && res.media_url, adEpisode: episode };
                });
            });
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

    function clearAdTimers() {
        clearTimeout(player.adTimer);
        player.adTimer = null;
        clearTimeout(player.introTimer);
        player.introTimer = null;
        hide($('lite-ad-badge'));
        hide($('lite-ad-skip'));
    }

    function detachVideo(stopStream, keepNativeUi) {
        clearAdTimers();
        engineDetach(stopStream, keepNativeUi);
    }

    /* A TV that never reaches the first frame must not spin forever: after STALL_MS the spinner turns into
       a diagnosis with «Повторить» / «Выбрать другой источник». On Orsay, a silent stall cascades across
       untried native drivers (avplay -> avsdk -> sef -> player) before declaring failure. */
    var STALL_MS = 10000;

    function orsayEngineKeyOf(kind) {
        if (kind === 'orsay') return 'avplay';
        if (kind === 'orsay-sdk') return 'avsdk';
        if (kind === 'orsay-sef') return 'sef';
        if (kind === 'orsay-player') return 'player';
        return '';
    }

    function markOrsayEngineTried(kindOrKey) {
        var key = orsayEngineKeyOf(kindOrKey) || kindOrKey;
        if (key && player.orsayTried) player.orsayTried[key] = true;
    }

    function pickOrsayEngine() {
        if (ORSAY_FORCE_ENGINE) return ORSAY_FORCE_ENGINE;
        if (orsayProvenEngine && !player.orsayTried[orsayProvenEngine]) {
            if ((orsayProvenEngine !== 'avplay' && orsayProvenEngine !== 'avsdk') || canUseOrsayAvplay()) return orsayProvenEngine;
        }
        var order = canUseOrsayAvplay() ? ['avplay', 'sef', 'avsdk', 'player'] : ['sef', 'player'];
        for (var i = 0; i < order.length; i++) {
            if (!player.orsayTried[order[i]]) return order[i];
        }
        return '';
    }

    function clearStall() {
        clearTimeout(player.stallTimer);
        player.stallTimer = null;
    }

    function extendStall(stepMs) {
        if (!player.card || player.firstFrame || !player.stallDeadline) return;
        var now = Date.now();
        if (now - player.stallBumpAt < 1000) return;
        player.stallBumpAt = now;
        var left = player.stallDeadline - now;
        if (left <= 500) return;
        armStall(Math.min(stepMs || 10000, left), false);
    }

    function armStall(ms, resetDeadline) {
        clearStall();
        var waitMs = ms || STALL_MS;
        if (resetDeadline !== false || !player.stallDeadline) {
            var isCom = (player.phase === 'ad' || player.phase === 'intro');
            player.stallDeadline = Date.now() + (isCom ? 24000 : 28000);
            player.stallBumpAt = 0;
        }
        player.stallTimer = setTimeout(function () {
            if (!player.card || player.firstFrame) return;
            var extra = '';
            if ((nativeSession.kind === 'orsay' || nativeSession.kind === 'orsay-sdk') && nativeSession.av) {
                try { extra += '|st=' + nativeSession.av.status; } catch (eS) {}
                try { extra += '|dur=' + (nativeSession.av.getDuration ? nativeSession.av.getDuration() : (nativeSession.av.duration !== undefined ? nativeSession.av.duration : '-')); } catch (eD) {}
                try { extra += '|res=' + (nativeSession.av.getVideoResolution ? nativeSession.av.getVideoResolution() : '-'); } catch (eR) {}
            } else if (nativeSession.kind === 'orsay-sef' && nativeSession.sef) {
                try { extra += '|dur=' + nativeSession.sef.Execute('GetDuration'); } catch (eSd) {}
            }
            if (nativeSession.kind !== 'html5') {
                extra += '|ev=' + (nativeSession.trail || '-') + '|t=' + (nativeSession.openedAt ? (Date.now() - nativeSession.openedAt) : -1);
                extra += '|' + mediaGuardInfo();
            }
            reportTvDiag('stall', player.engineKind + '|' + player.phase + extra);
            /* Never poison orsayTried during commercial stages (intro/ad) — film still gets primary AVPlay. */
            if (player.phase === 'ad' || player.phase === 'intro') { advanceFromCommercial('timeout'); return; }
            markOrsayEngineTried(nativeSession.kind);
            if (IS_ORSAY && !ORSAY_FORCE_ENGINE) {
                var nextEng = pickOrsayEngine();
                var retryUrl = player.currentOpenUrl || (player.stream && player.stream.url) || '';
                if (nextEng && retryUrl) {
                    reportTvDiag('stall_rescue', nativeSession.kind + '>' + nextEng);
                    clearStall();
                    engineDetach(false, true);
                    scheduleOrsayRescueEngine(retryUrl, player.loadId, nextEng, function () { playerProblem('stall'); });
                    return;
                }
            }
            playerProblem('stall');
        }, waitMs);
    }

    function sendAdImpression() {
        if (player.phase !== 'ad' || !player.adDeliveryId || player.adImpressionSent) return;
        player.adImpressionSent = true;
        api.adEvent(player.adDeliveryId, 'impression')['catch'](function () {});
    }

    function markFrame() {
        player.firstFrame = true;
        player.problem = false;
        player.stallDeadline = 0;
        var okKey = orsayEngineKeyOf(nativeSession.kind);
        if (okKey) orsayProvenEngine = okKey;
        clearStall();
        clearTimeout(player.filmNoticeTimer);
        player.filmNoticeTimer = null;
        if (player.phase === 'intro') {
            var introId = player.loadId;
            var introLimit = player.duration > 0 ? Math.min(35000, Math.max(8000, Math.ceil(player.duration * 1000) + 3000)) : 18000;
            clearTimeout(player.introTimer);
            player.introTimer = setTimeout(function () {
                if (introId === player.loadId && player.phase === 'intro') onIntroClipEnded('limit');
            }, introLimit);
            /* The intro poster dissolves into the running clip (400 ms) — no black frame in between. */
            if (!player.introClipEnded) {
                fadeIntroPoster();
                setVeil(false, false, false);
            }
        } else {
            /* Pre-roll / film rendered under the veil: lift it (RENDERING_START (7) on Orsay). */
            hideIntroPoster();
            setVeil(false, isHtml5Stage(), false);
        }
        playerMessage('');
        hide($('lite-player-actions'));
        sendAdImpression();
        readEngineTracks();
    }

    function codecHint(card) {
        if (player.engineKind !== 'html5') return '';
        var video = $('lite-video');
        var mime = card && card.mime ? String(card.mime).toLowerCase() : '';
        var release = card && card.release ? card.release : null;
        var name = release && release.file_name ? String(release.file_name).toLowerCase() : '';
        var mkv = mime.indexOf('matroska') !== -1 || /\.mkv$/.test(name);
        var mkvOk = false;
        try { mkvOk = !!(video.canPlayType && video.canPlayType('video/x-matroska')); } catch (e) { mkvOk = false; }
        if (mkv && !mkvOk) return 'Файл в контейнере MKV, который этот браузер не открывает.';
        var tracks = release && release.audio_tracks ? release.audio_tracks : [];
        for (var i = 0; i < tracks.length; i++) {
            var codec = String(tracks[i].codec || '').toLowerCase();
            if (codec === 'ac3' || codec === 'eac3' || codec === 'dts' || codec === 'truehd') {
                return 'В раздаче звук ' + codec.toUpperCase() + ', браузер может его не воспроизвести.';
            }
        }
        return '';
    }

    function renderPlayerActions() {
        var retry = $('lite-player-retry');
        var other = $('lite-player-other');
        setText(other, player.hdOffer ? 'Открыть 1080p (торрент)' : 'Выбрать другой источник');
        if (player.focusAct === 0) { addClass(retry, 'is-focused'); removeClass(other, 'is-focused'); }
        else { addClass(other, 'is-focused'); removeClass(retry, 'is-focused'); }
    }

    function exceedsFullHd(resStr) {
        if (!resStr) return false;
        var m = String(resStr).match(/(\d+)\s*[x|]\s*(\d+)/);
        if (!m) return false;
        return (Number(m[1]) || 0) > 1920 || (Number(m[2]) || 0) > 1080;
    }

    function isUnsupportedResolutionErr(errMsg, resStr) {
        if (errMsg && String(errMsg).indexOf('UnsupportedVideoResolution') !== -1) return true;
        return exceedsFullHd(resStr) && String(errMsg).indexOf('6:4') !== -1;
    }

    function playerProblem(kind) {
        clearStall();
        var prevKind = player.engineKind;
        var nativeErr = player.lastNativeErr;
        var nativeRes = player.lastNativeRes;
        reportTvDiag('prob', kind + '|' + prevKind + '|' + player.phase + (nativeErr ? '|' + nativeErr : '') + (nativeRes ? '|' + nativeRes : ''));
        if (player.phase === 'ad' || player.phase === 'intro') {
            debugLog('warn', player.phase + ' ' + kind + ': skipping to the next stage');
            advanceFromCommercial('error');
            return;
        }
        var card = player.card;
        debugLog('error', 'playback ' + kind + ' · engine ' + prevKind + (nativeErr ? ' (' + nativeErr + ')' : ''));
        if (IS_TV && (kind === 'error' || kind === 'stall')) debugOpen();
        player.problem = true;
        player.ready = false;
        player.focusAct = 0;
        detachVideo(false, prevKind !== 'html5');
        var hint = codecHint(card);
        var tooBig = isUnsupportedResolutionErr(nativeErr, nativeRes || (card && card.sourceRes));
        player.hdOffer = false;
        if (!hint && tooBig) {
            hint = 'Разрешение этого видео (' + (nativeRes || frameText(card && card.sourceRes) || 'больше 1080p') + ') превышает ограничение этого телевизора (1920×1080).';
        }
        if (!hint && nativeErr) {
            var errParts = String(nativeErr).split(':');
            if (errParts[0] === '6' && errParts[1] === '2') hint = 'Декодер ТВ (6:2): неподдерживаемый видеокодек.';
            else if (errParts[0] === '6' && errParts[1] === '3') hint = 'Декодер ТВ (6:3): неподдерживаемый аудиокодек.';
            else hint = 'Код ошибки декодера ТВ: ' + nativeErr + '.';
        }
        var head = kind === 'error' ? 'Телевизор не смог воспроизвести это видео.' : 'Видео не запустилось за 10 секунд.';
        playerMessage(head + ' ' + (hint || 'Проверьте сеть или выберите другой источник.'));
        if (tooBig && card && !isTorrentCard(card)) offerHdAlternative(card);
        show($('lite-player-actions'));
        renderPlayerActions();
        showBar();
    }

    /* 6:4 on a catalogue file: «Выбрать другой источник» becomes «Открыть 1080p (торрент)» (focused) as soon
       as a ready <= 1080p release is known — from the details or looked up now. */
    function offerHdAlternative(card) {
        var apply = function (alt) {
            if (player.card !== card || !player.problem) return;
            card.hdAlt = alt;
            player.hdOffer = true;
            player.focusAct = 1;
            renderPlayerActions();
        };
        if (card.hdAlt) { apply(card.hdAlt); return; }
        var sameAsDetails = det.card && det.card.play && card.play && det.card.play.id === card.play.id;
        var tmdb = card.tmdbId || (sameAsDetails ? det.tmdb : null);
        if (tmdb) { lookupHdAlternative(tmdb, apply); return; }
        if (!IS_ORSAY || !card.play || card.play.kind !== 'movie') return;
        api.movieDetail(card.play.id).then(function (res) {
            if (res && res.tmdb_id) lookupHdAlternative(res.tmdb_id, apply);
        })['catch'](function () {});
    }

    function playerChooseOther() {
        var card = player.card;
        if (player.hdOffer && card && card.hdAlt) {
            var alt = hdAlternativeCard(card, card.hdAlt);
            closePlayer();
            openPlayer(alt);
            return;
        }
        var wasOpen = state.detailsOpen;
        closePlayer();
        if (!wasOpen && card) openDetailsModal(card);
        toast('Выберите другое качество, озвучку или раздачу');
        for (var r = 2; r < det.rows.length; r++) { det.row = r; det.col = 0; break; }
        applyDetailsFocus();
    }

    function orsayPlayUrl(rawUrl) {
        var playUrl = toAbsoluteUrl(rawUrl);
        if (/\.m3u8(\?|$)/i.test(playUrl) && playUrl.toUpperCase().indexOf('|COMPONENT=HLS') === -1) playUrl += '|COMPONENT=HLS';
        else if (/\.mpd(\?|$)/i.test(playUrl) && playUrl.toUpperCase().indexOf('|COMPONENT=HAS') === -1) playUrl += '|COMPONENT=HAS';
        return playUrl;
    }

    function nativeOk(result) {
        return result !== false && result !== 0 && result !== '0' && result !== -1 && result !== '-1' && result !== null && result !== undefined;
    }

    function nativeFailed(result) {
        return result === false || result === 0 || result === '0' || result === -1 || result === '-1';
    }

    function enterNativePlane(kind, label) {
        nativeSession.kind = kind;
        nativeSession.phase = player.phase;
        player.engineKind = kind;
        player.lastNativeErr = '';
        player.lastNativeRes = '';
        setEngineLabel(label);
        var video = $('lite-video');
        if (video) {
            releaseHtml5Video(video);
            video = $('lite-video');
            if (video) hide(video);
        }
        nativeSession.trail = '';
        nativeSession.openedAt = Date.now();
        setNativePlane(true);
        debugLog('info', 'engine: ' + label);
        reportTvDiag('eng', kind + '|' + player.phase + '|' + mediaGuardInfo());
    }

    /* Driver A.1 — SEF Player (clsid:SAMSUNG-INFOLINK-SEF), the primary engine on Orsay E/F/H and late D. */
    function sefOpenPlayer(sef) {
        var trace = [];
        for (var v = 0; v < SEF_PLAYER_VERSIONS.length; v++) {
            var opened = false;
            try { opened = sef.Open('Player', SEF_PLAYER_VERSIONS[v], 'Player'); } catch (e) { opened = 'ERR:' + debugStringify(e); }
            debugLog('info', "SEF Open('Player', '" + SEF_PLAYER_VERSIONS[v] + "') -> " + opened);
            trace.push(SEF_PLAYER_VERSIONS[v] + '=' + opened);
            if (nativeOk(opened)) return SEF_PLAYER_VERSIONS[v];
        }
        reportTvDiag('sef_open_fail', trace.join(','));
        return '';
    }

    /* Orsay AVPlay grid: curWidget (Lampa changeScale parity), 960x540 outside the widget engine. */
    function orsayGridSize() {
        if (ORSAY_GRID_MODE === '960') return { width: ORSAY_GRID_W, height: ORSAY_GRID_H };
        var cw = (typeof window.curWidget !== 'undefined' && window.curWidget) ? window.curWidget : null;
        var w = cw && Number(cw.width) > 0 ? Number(cw.width) : ORSAY_GRID_W;
        var h = cw && Number(cw.height) > 0 ? Number(cw.height) : ORSAY_GRID_H;
        return { width: w, height: h };
    }

    /* SEF / legacy Player grid: the plugins' own 960x540 space even inside the 1280x720 MSX widget
       (v8-v10 sent 1280x720 there). ?orsaygrid=widget restores the curWidget grid for A/B on a TV. */
    function orsayPluginGrid() {
        if (ORSAY_GRID_MODE === 'widget') {
            var cw = (typeof window.curWidget !== 'undefined' && window.curWidget) ? window.curWidget : null;
            if (cw && Number(cw.width) > 0 && Number(cw.height) > 0) return { width: Number(cw.width), height: Number(cw.height) };
        }
        return { width: ORSAY_GRID_W, height: ORSAY_GRID_H };
    }

    /* Who else could hold the decoder right now: <video> src, SEF / Player objects (a = auto-created). */
    function mediaGuardInfo() {
        var video = $('lite-video');
        var sef = $('pluginObjectSef');
        var pl = $('pluginObjectPlayer');
        function tag(node) { return node ? ((node.getAttribute && node.getAttribute('data-lite-auto') === '1') ? 'a' : 's') : '0'; }
        var rel = player.nativeReleasedAt ? (Date.now() - player.nativeReleasedAt) : -1;
        return 'vid=' + (videoHasSource(video) ? 'src' : (video ? 'idle' : '0')) + ',sef=' + tag(sef) + ',pl=' + tag(pl) + ',rel=' + rel;
    }

    /* A type-6 RENDER_ERROR before STREAM_INFO_READY shortly after a release is most likely the echo of
       the previous session (see ORSAY_ECHO_MS). It is held back for ORSAY_ECHO_GRACE_MS and dropped if the
       new session reaches STREAM_INFO_READY meanwhile. */
    function isOrsayEcho(type, gotInfo) {
        if (!IS_ORSAY || type !== 6 || gotInfo || !player.nativeReleasedAt) return false;
        return (Date.now() - player.nativeReleasedAt) < ORSAY_ECHO_MS;
    }

    function deferOrsayEcho(tag, err, act) {
        var seq = player.engineSeq;
        reportTvDiag(tag + '_echo', err + '|rel=' + (Date.now() - player.nativeReleasedAt));
        clearTimeout(player.echoTimer);
        player.echoTimer = setTimeout(function () {
            player.echoTimer = null;
            if (seq !== player.engineSeq) return;
            act();
        }, ORSAY_ECHO_GRACE_MS);
    }

    function orsayStallMs(key) {
        if (player.phase === 'ad' || player.phase === 'intro') return 14000;
        if (IS_ORSAY && !ORSAY_FORCE_ENGINE) {
            var remaining = 0;
            var order = canUseOrsayAvplay() ? ['avplay', 'sef', 'avsdk', 'player'] : ['sef', 'player'];
            for (var i = 0; i < order.length; i++) {
                if (order[i] !== key && !player.orsayTried[order[i]]) remaining += 1;
            }
            if (remaining > 0) return 12000;
        }
        return 18000;
    }

    function orsayObjectDiag() {
        var objs = document.getElementsByTagName ? document.getElementsByTagName('object') : [];
        var out = [];
        for (var i = 0; i < objs.length && out.length < 8; i++) {
            var o = objs[i];
            var oid = o.id || o.className || 'obj';
            var cls = (o.getAttribute && o.getAttribute('classid')) ? o.getAttribute('classid').replace('clsid:SAMSUNG-INFOLINK-', '') : '';
            var par = (o.parentNode && o.parentNode.id) ? o.parentNode.id : '-';
            out.push(oid + (cls ? '@' + cls : '') + '/' + par);
        }
        return out.join(',');
    }

    function ensureOrsayMediaSource(done) {
        var called = false;
        var timer = null;
        function finish() {
            if (called) return;
            called = true;
            if (timer) { clearTimeout(timer); timer = null; }
            done();
        }
        try {
            var tvWin = window.webapis && window.webapis.tv && window.webapis.tv.window ? window.webapis.tv.window : null;
            if (tvWin && isCallableNative(tvWin.getSource) && isCallableNative(tvWin.setSource)) {
                var cur = tvWin.getSource();
                var curTag = cur ? (String(cur.type) + (cur.number !== undefined && cur.number !== null ? ':' + cur.number : '')) : 'null';
                var target = tvWin.SOURCE_MODE_MEDIA !== undefined ? tvWin.SOURCE_MODE_MEDIA : 43;
                if (cur && cur.type === target) {
                    player.winSrcMedia = true;
                    if (!player.winSrcLogged) { player.winSrcLogged = true; reportTvDiag('win_src', 'ok=' + curTag); }
                    finish();
                    return;
                }
                timer = setTimeout(function () {
                    if (!called) reportTvDiag('win_src', curTag + '>timeout');
                    finish();
                }, 1200);
                tvWin.setSource({ type: target, number: null }, function () {
                    player.winSrcMedia = true;
                    reportTvDiag('win_src', curTag + '>ok');
                    finish();
                }, function (err) {
                    reportTvDiag('win_src', curTag + '>err:' + errText(err));
                    finish();
                });
                return;
            }
        } catch (eWin) {
            reportTvDiag('win_src', 'exc:' + errText(eWin));
        }
        finish();
    }

    function ensureSefWindowMediaSource() {
        if (player.winSrcMedia) return;
        var winNode = null;
        try {
            var host = $('lite-orsay-plugins') || document.body || document.documentElement;
            if (!host || !document.createElement) return;
            winNode = document.createElement('object');
            winNode.setAttribute('border', '0');
            winNode.setAttribute('classid', 'clsid:SAMSUNG-INFOLINK-SEF');
            winNode.style.position = 'absolute';
            winNode.style.left = '-1000px';
            winNode.style.top = '-1000px';
            winNode.style.width = '1px';
            winNode.style.height = '1px';
            host.appendChild(winNode);
            if (isCallableNative(winNode.Open) && isCallableNative(winNode.Execute)) {
                var ok = winNode.Open('Window', '1.000', 'Window');
                if (nativeOk(ok)) {
                    var src = winNode.Execute('GetSource');
                    if (src !== 43 && src !== '43') {
                        var setRet = winNode.Execute('SetSource', 43);
                        reportTvDiag('sef_src', String(src) + '>' + String(setRet));
                    } else {
                        reportTvDiag('sef_src', 'ok=' + String(src));
                    }
                    try { winNode.Close(); } catch (eC) {}
                }
            }
        } catch (eSefWin) {
            reportTvDiag('sef_src', 'exc:' + errText(eSefWin));
        } finally {
            try { if (winNode && winNode.parentNode) winNode.parentNode.removeChild(winNode); } catch (eR) {}
        }
    }

    function mountOrsayPluginNode(node) {
        if (!node || !node.getAttribute || node.getAttribute('data-lite-auto') !== '1') return;
        var hostNative = $('lite-native-host');
        if (!hostNative) return;
        try {
            hostNative.appendChild(node);
            node.style.display = 'block';
            node.style.position = 'absolute';
            node.style.left = '0px';
            node.style.top = '0px';
            node.style.width = '1280px';
            node.style.height = '720px';
            node.style.opacity = '1';
            node.style.zIndex = '1';
        } catch (e) {}
    }

    function tryOrsaySef(rawUrl, loadId) {
        ensureSefWindowMediaSource();
        var sef = orsaySefNode();
        if (!sef) return false;
        var playUrl = orsayPlayUrl(rawUrl);
        var grid = orsayPluginGrid();
        try {
            engineDetach();
            releaseAutoOrsayPlugins('pluginObjectSef');
            mountOrsayPluginNode(sef);
            var seq = player.engineSeq;
            var version = sefOpenPlayer(sef);
            if (!version) return false;
            enterNativePlane('orsay-sef', 'Orsay SEF');
            nativeSession.sef = sef;
            var timeLogged = false;
            var zeroLogged = false;
            var gotInfo = false;
            var areaAppliedOnEvent = false;
            var sefError = function (type, data1) {
                if (seq !== player.engineSeq) return;
                player.orsayTried.sef = true;
                player.lastNativeErr = type + (data1 !== undefined ? ':' + data1 : '');
                if (!player.firstFrame && !ORSAY_FORCE_ENGINE && player.phase === 'film' && !isUnsupportedResolutionErr(player.lastNativeErr, player.lastNativeRes)) {
                    var nextEng = pickOrsayEngine();
                    if (nextEng) {
                        clearStall();
                        engineDetach(false, true);
                        scheduleOrsayRescueEngine(rawUrl, loadId, nextEng, function () { playerProblem('error'); });
                        return;
                    }
                }
                playerProblem('error');
            };
            sef.OnEvent = function (event, data1) {
                if (loadId !== player.loadId || seq !== player.engineSeq) return;
                var type = Number(event);
                noteNativeEvent(type, data1);
                if (type !== 14) {
                    debugLog(type >= 1 && type <= 6 ? 'warn' : 'info', 'SEF OnEvent(' + type + (data1 !== undefined ? ', ' + data1 : '') + ')');
                    if (type <= 9 || type === 12) reportTvDiag('sef_ev', type + ':' + (data1 !== undefined ? data1 : ''));
                }
                if (type === 9) {
                    /* STREAM_INFO_READY: duration and audio tracks are known now */
                    gotInfo = true;
                    extendStall();
                    var area9 = 'n/a';
                    try { area9 = sef.Execute('SetDisplayArea', 0, 0, grid.width, grid.height); } catch (eArea9) { area9 = 'ERR:' + errText(eArea9); }
                    var res9 = '-';
                    try { res9 = sef.Execute('GetVideoResolution') || '-'; } catch (eRes9) {}
                    var dims9 = parseOrsayResolution(res9);
                    if (dims9) player.lastNativeRes = dims9.width + 'x' + dims9.height;
                    reportTvDiag('sef_area9', String(area9) + '|g=' + grid.width + 'x' + grid.height + '|r=' + String(res9));
                    try { player.duration = (Number(sef.Execute('GetDuration')) || 0) / 1000; } catch (eDur) {}
                    readEngineTracks();
                    playerMessage('');
                    updateProgress();
                    showBar();
                } else if (type === 7) {
                    /* RENDERING_START: the first frame is on the video plane */
                    if (!areaAppliedOnEvent) {
                        areaAppliedOnEvent = true;
                        try { sef.Execute('SetDisplayArea', 0, 0, grid.width, grid.height); } catch (eArea7) { reportTvDiag('sef_area_err', errText(eArea7)); }
                    }
                    player.paused = false;
                    markFrame();
                    updateProgress();
                    showBar();
                } else if (type === 12) {
                    /* BUFFERING_COMPLETE */
                    extendStall();
                    player.paused = false;
                    playerMessage('');
                    updateProgress();
                    showBar();
                } else if (type === 11) {
                    /* BUFFERING_START */
                    extendStall();
                    bufferNotice('Буферизация…');
                } else if (type === 13) {
                    /* BUFFERING_PROGRESS (percent) */
                    extendStall();
                    if (!player.firstFrame) bufferNotice('Буферизация… ' + (Number(data1) || 0) + '%');
                } else if (type === 14) {
                    /* CURRENT_PLAYBACK_TIME (ms); 14 with 0 is reported too: the clock runs, the picture does not */
                    var ms = Number(data1) || 0;
                    if (ms <= 0 && !zeroLogged) {
                        zeroLogged = true;
                        reportTvDiag('sef_t14_0', 'ev=' + nativeSession.trail);
                    }
                    if (ms > 0 && !timeLogged) {
                        timeLogged = true;
                        debugLog('info', 'SEF OnEvent(14, ' + ms + ') — playback time running');
                        reportTvDiag('sef_t14', String(ms));
                    }
                    player.currentTime = ms / 1000;
                    if (!player.duration) {
                        try { player.duration = (Number(sef.Execute('GetDuration')) || 0) / 1000; } catch (eDur2) {}
                    }
                    if (ms > 0 && !player.firstFrame) markFrame();
                    updateProgress();
                } else if (type === 8) {
                    /* RENDERING_COMPLETE: end of the clip */
                    try { sef.Execute('Stop'); } catch (eS) {}
                    onPlaybackEnded();
                } else if (type === 5) {
                    /* NETWORK_SLOW: not fatal, the stall timer still guards the first frame */
                    bufferNotice('Медленная сеть, буферизация…');
                } else if (type >= 1 && type <= 6) {
                    /* CONNECTION_FAILED / AUTHENTICATION_FAILED / STREAM_NOT_FOUND / NETWORK_DISCONNECTED / RENDER_ERROR */
                    var errCode = type + (data1 !== undefined ? ':' + data1 : '');
                    if (isOrsayEcho(type, gotInfo)) {
                        deferOrsayEcho('sef', errCode, function () { if (!gotInfo) sefError(type, data1); });
                        return;
                    }
                    sefError(type, data1);
                }
            };
            try { sef.Execute('Stop'); } catch (eStop) {}
            var inited = sef.Execute('InitPlayer', playUrl);
            debugLog('info', 'SEF InitPlayer -> ' + inited);
            if (!nativeFailed(inited)) {
                var area = 'n/a';
                try { area = sef.Execute('SetDisplayArea', 0, 0, grid.width, grid.height); } catch (eArea) { area = 'ERR:' + errText(eArea); }
                var started = sef.Execute('StartPlayback', 0);
                debugLog('info', 'SEF StartPlayback(0) -> ' + started);
                reportTvDiag('sef_open', 'v=' + version + '|init=' + inited + '|area=' + area + '|start=' + started + '|g=' + grid.width + 'x' + grid.height + '|obj=' + orsayObjectDiag());
                if (!nativeFailed(started)) {
                    player.ready = true;
                    player.paused = false;
                    armStall(orsayStallMs('sef'));
                    showBar();
                    return true;
                }
                reportTvDiag('sef_start_fail', 'v=' + version + '|init=' + inited + '|start=' + started);
            } else {
                reportTvDiag('sef_init_fail', 'v=' + version + '|init=' + inited);
            }
            try { sef.OnEvent = noop; } catch (eMute) {}
            try { sef.Execute('Stop'); } catch (eStop2) {}
            try { sef.Close(); } catch (eClose) {}
            nativeSession.kind = 'html5';
            nativeSession.sef = null;
            setNativePlane(false);
        } catch (eSef) {
            debugLog('error', 'SEF failed: ' + debugStringify(eSef));
            reportTvDiag('sef_exc', debugStringify(eSef));
            nativeSession.kind = 'html5';
            nativeSession.sef = null;
            setNativePlane(false);
        }
        return false;
    }

    /* Driver A.3 — Legacy Player (clsid:SAMSUNG-INFOLINK-PLAYER) for C/D series. */
    function tryOrsayLegacyPlayer(rawUrl, loadId) {
        var pl = orsayPlayerNode();
        if (!pl) return false;
        var playUrl = orsayPlayUrl(rawUrl);
        var grid = orsayPluginGrid();
        try {
            engineDetach();
            releaseAutoOrsayPlugins('pluginObjectPlayer');
            mountOrsayPluginNode(pl);
            var seq = player.engineSeq;
            var live = function () { return loadId === player.loadId && seq === player.engineSeq; };
            enterNativePlane('orsay-player', 'Orsay Player');
            nativeSession.pl = pl;
            var timeLogged = false;
            pl.OnStreamInfoReady = function () {
                if (!live()) return;
                noteNativeEvent(9);
                extendStall();
                debugLog('info', 'Player OnStreamInfoReady');
                reportTvDiag('pl_ev', 'ready');
                try { pl.SetDisplayArea(0, 0, grid.width, grid.height); } catch (ePa9) { reportTvDiag('pl_area_err', errText(ePa9)); }
                try { player.duration = (Number(pl.GetDuration()) || 0) / 1000; } catch (ePd0) {}
                readEngineTracks();
                playerMessage('');
                updateProgress();
                showBar();
            };
            pl.OnRenderingComplete = function () { if (live()) { debugLog('info', 'Player OnRenderingComplete'); try { pl.Stop(); } catch (eP) {} onPlaybackEnded(); } };
            pl.OnCurrentPlayTime = function (ms) {
                if (!live()) return;
                var msVal = Number(ms) || 0;
                noteNativeEvent(14, msVal);
                if (msVal > 0 && !timeLogged) { timeLogged = true; reportTvDiag('pl_t14', String(msVal)); }
                player.currentTime = msVal / 1000;
                if (!player.duration) {
                    try { player.duration = (Number(pl.GetDuration()) || 0) / 1000; } catch (ePd) {}
                }
                if (msVal > 0 && !player.firstFrame) markFrame();
                updateProgress();
            };
            pl.OnBufferingStart = function () { if (live()) { extendStall(); bufferNotice('Буферизация…'); } };
            pl.OnBufferingComplete = function () { if (live()) { noteNativeEvent(12); extendStall(); player.paused = false; playerMessage(''); updateProgress(); showBar(); } };
            pl.OnConnectionFailed = pl.OnNetworkDisconnected = pl.OnRenderError = pl.OnStreamNotFound = function (code) {
                if (!live()) return;
                player.lastNativeErr = 'pl:' + (code !== undefined ? code : 'err');
                debugLog('error', 'Player stream error (' + player.lastNativeErr + ')');
                reportTvDiag('pl_ev', 'err|' + (code !== undefined ? code : '-'));
                playerProblem('error');
            };
            var inited = pl.InitPlayer(playUrl);
            debugLog('info', 'Player InitPlayer -> ' + inited);
            if (!nativeFailed(inited)) {
                try { pl.SetDisplayArea(0, 0, grid.width, grid.height); } catch (ePa) { reportTvDiag('pl_area_err', errText(ePa)); }
                var started = pl.StartPlayback(0);
                debugLog('info', 'Player StartPlayback(0) -> ' + started);
                if (!nativeFailed(started)) {
                    player.ready = true;
                    player.paused = false;
                    armStall(orsayStallMs('player'));
                    showBar();
                    return true;
                }
            }
            reportTvDiag('pl_fail', 'init=' + inited);
        } catch (ePl) {
            debugLog('error', 'Player failed: ' + debugStringify(ePl));
            reportTvDiag('pl_exc', debugStringify(ePl));
        }
        muteNativeCallbacks();
        nativeSession.kind = 'html5';
        nativeSession.pl = null;
        setNativePlane(false);
        return false;
    }

    function openOrsayByKey(key, rawUrl, loadId) {
        if (key === 'avplay') {
            if (!canUseOrsayAvplay()) return false;
            openOrsayAvplay(rawUrl, loadId);
            return true;
        }
        if (key === 'avsdk') {
            if (!canUseOrsayAvplay()) return false;
            openOrsayAvSdk(rawUrl, loadId);
            return true;
        }
        if (key === 'sef') return tryOrsaySef(rawUrl, loadId);
        if (key === 'player') return tryOrsayLegacyPlayer(rawUrl, loadId);
        return false;
    }

    function scheduleOrsayRescueEngine(rawUrl, loadId, engineKey, lastResort) {
        if (engineKey === 'sef') orsaySefNode();
        else if (engineKey === 'player') orsayPlayerNode();
        var seq = player.engineSeq;
        clearTimeout(player.rescueTimer);
        player.rescueTimer = setTimeout(function () {
            player.rescueTimer = null;
            if (loadId !== player.loadId || seq !== player.engineSeq) return;
            markOrsayEngineTried(engineKey);
            if (openOrsayByKey(engineKey, rawUrl, loadId)) return;
            var nextEng = pickOrsayEngine();
            if (nextEng) {
                scheduleOrsayRescueEngine(rawUrl, loadId, nextEng, lastResort);
                return;
            }
            if (lastResort) { lastResort(); return; }
            playerProblem('error');
        }, DECODER_RELEASE_MS);
    }

    /* AVPlay -> SEF rescue on the same stream. The SEF object is attached now (lazily, it does not exist next
       to AVPlay any more) and opened DECODER_RELEASE_MS later; a just-created plugin that is not callable yet
       gets up to two more attempts. */
    function scheduleOrsayRescue(rawUrl, loadId, attempt, lastResort) {
        orsaySefNode();
        var seq = player.engineSeq;
        clearTimeout(player.rescueTimer);
        player.rescueTimer = setTimeout(function () {
            player.rescueTimer = null;
            if (loadId !== player.loadId || seq !== player.engineSeq) return;
            markOrsayEngineTried('sef');
            if (tryOrsaySef(rawUrl, loadId)) return;
            if (!orsaySefNode(false) && attempt < 2) {
                reportTvDiag('sef_wait', String(attempt));
                scheduleOrsayRescue(rawUrl, loadId, attempt + 1, lastResort);
                return;
            }
            markOrsayEngineTried('player');
            if (tryOrsayLegacyPlayer(rawUrl, loadId)) return;
            var nextEng = pickOrsayEngine();
            if (nextEng && openOrsayByKey(nextEng, rawUrl, loadId)) return;
            if (lastResort) { lastResort(); return; }
            playerProblem('error');
        }, DECODER_RELEASE_MS);
    }

    function parseOrsayResolution(raw) {
        if (!raw) return null;
        if (typeof raw === 'object' && Number(raw.width) > 0 && Number(raw.height) > 0) {
            return { width: Number(raw.width), height: Number(raw.height) };
        }
        var parts = String(raw).split('|');
        if (parts.length >= 2) {
            var w = Number(parts[0]) || 0;
            var h = Number(parts[1]) || 0;
            if (w > 0 && h > 0) return { width: w, height: h };
        }
        return null;
    }

    function applyOrsayAvScale(av, grid) {
        var rawRes = '';
        try { rawRes = typeof av.getVideoResolution === 'function' ? av.getVideoResolution() : ''; } catch (e0) { rawRes = ''; }
        var res = parseOrsayResolution(rawRes);
        var aX = 0, aY = 0, aW = grid.width, aH = grid.height;
        var cW = res ? res.width : 0;
        var cH = res ? res.height : 0;
        if (cW > 0 && cH > 0) {
            player.lastNativeRes = cW + 'x' + cH;
            if (cW / cH < (grid.width / grid.height) + 0.02) {
                aW = Math.round(grid.height * cW / cH);
                aX = Math.round((grid.width - aW) / 2);
            } else {
                aH = Math.round(grid.width * cH / cW);
                aY = Math.round((grid.height - aH) / 2);
            }
        }
        /* v10 hid these failures behind empty catch blocks; they are reported now. */
        var areaRet = 'na';
        var areaFailed = false;
        try {
            areaRet = av.setDisplayArea({ left: aX, top: aY, width: aW, height: aH });
            if (nativeFailed(areaRet)) areaFailed = true;
        } catch (eArea) {
            areaFailed = true;
            areaRet = 'ERR';
            debugLog('warn', 'AVPlay setDisplayArea threw: ' + debugStringify(eArea));
            reportTvDiag('av_area_err', errText(eArea) + '|' + aW + 'x' + aH);
        }
        if (areaFailed && grid.width > ORSAY_GRID_W) {
            var sW = cW > 0 && cH > 0 && (cW / cH < (ORSAY_GRID_W / ORSAY_GRID_H) + 0.02) ? Math.round(ORSAY_GRID_H * cW / cH) : ORSAY_GRID_W;
            var sH = cW > 0 && cH > 0 && (cW / cH >= (ORSAY_GRID_W / ORSAY_GRID_H) + 0.02) ? Math.round(ORSAY_GRID_W * cH / cW) : ORSAY_GRID_H;
            var sX = Math.round((ORSAY_GRID_W - sW) / 2);
            var sY = Math.round((ORSAY_GRID_H - sH) / 2);
            var ret960 = 'na';
            try { ret960 = av.setDisplayArea({ left: sX, top: sY, width: sW, height: sH }); } catch (e960) { ret960 = 'ERR'; }
            reportTvDiag('av_area_960', String(areaRet) + '>' + String(ret960));
            areaRet = String(areaRet) + '>960:' + String(ret960);
        }
        try {
            if (typeof av.setCropArea === 'function') {
                var cropRect = (cW > 0 && cH > 0) ? { left: 0, top: 0, width: cW, height: cH } : { left: 0, top: 0, width: 0, height: 0 };
                av.setCropArea(function () {}, function (eCb) { reportTvDiag('av_crop_err', 'cb|' + errText(eCb)); }, cropRect);
            }
        } catch (eCrop) {
            debugLog('warn', 'AVPlay setCropArea threw: ' + debugStringify(eCrop));
            reportTvDiag('av_crop_err', errText(eCrop));
        }
        return (cW > 0 && cH > 0) ? (cW + 'x' + cH + '|a=' + String(areaRet)) : ('none|a=' + String(areaRet));
    }

    /* Driver A.1 — Orsay AVPlay ($MANAGER_WIDGET webapis.avplay.getAVPlay), Lampa's primary Orsay driver. */
    function openOrsayAvplay(rawUrl, loadId) {
        engineDetach(false, true);
        /* Lampa parity: AVPlay is the only player object on the page. */
        releaseAutoOrsayPlugins('');
        var seq = player.engineSeq;
        player.engineKind = 'orsay';
        setEngineLabel('Orsay AVPlay');
        var hostOrsay = $('lite-native-host');
        if (hostOrsay) hostOrsay.innerHTML = '<object id="lite-orsay-video" class="lite-avplayer" style="visibility:hidden;"></object>';
        var grid = orsayGridSize();
        function live() { return loadId === player.loadId && seq === player.engineSeq; }
        function fallback() {
            if (!live()) return;
            markOrsayEngineTried('avplay');
            clearStall();
            engineDetach(false, true);
            player.orsaySefTried = true;
            if (tryOrsaySef(rawUrl, loadId)) return;
            /* The SEF object was attached just now: give the plugin time to come up before giving in. */
            if (!orsaySefNode(false)) {
                scheduleOrsayRescue(rawUrl, loadId, 1, function () { openHtml5Fallback(rawUrl, loadId, 'Orsay plugins did not open the stream'); });
                return;
            }
            if (tryOrsayLegacyPlayer(rawUrl, loadId)) return;
            var nextEng = pickOrsayEngine();
            if (nextEng && openOrsayByKey(nextEng, rawUrl, loadId)) return;
            openHtml5Fallback(rawUrl, loadId, 'Orsay plugins did not open the stream');
        }
        ensureOrsayMediaSource(function () {
            if (!live()) return;
            try {
                window.webapis.avplay.getAVPlay(function (av) {
                    if (!live()) { try { av.destroy(); } catch (e0) {} return; }
                    nativeSession.av = av;
                    enterNativePlane('orsay', 'Orsay AVPlay');
                    var playUrl = orsayPlayUrl(rawUrl);
                    var timeLogged = false;
                    var zeroLogged = false;
                    var scaleDone = false;
                    var gotInfo = false;
                    try { av.init(); } catch (eInit) { reportTvDiag('av_init_err', errText(eInit)); }
                    try { nativeSession.plugin = av.setPlayerPluginObject(); } catch (ePlug) { nativeSession.plugin = null; }
                    reportTvDiag('av_plug', !!nativeSession.plugin + '|t=' + typeof nativeSession.plugin + '|st=' + av.status + '|obj=' + orsayObjectDiag());
                    var avError = function (type, data) {
                        if (!live()) return;
                        markOrsayEngineTried('avplay');
                        player.lastNativeErr = type + (data !== undefined ? ':' + data : '');
                        if (!player.firstFrame && !player.orsaySefTried && player.phase === 'film' && !isUnsupportedResolutionErr(player.lastNativeErr, player.lastNativeRes)) {
                            player.orsaySefTried = true;
                            var st = '-';
                            try { st = String(av.status); } catch (eSt) {}
                            reportTvDiag('av_to_sef', player.lastNativeErr + '|st=' + st + '|ev=' + nativeSession.trail);
                            clearStall();
                            engineDetach(false, true);
                            scheduleOrsayRescue(rawUrl, loadId, 0, null);
                            return;
                        }
                        playerProblem('error');
                    };
                    av.onEvent = function (type, data) {
                        if (!live()) return;
                        type = Number(type);
                        noteNativeEvent(type, data);
                        if (type !== 14) {
                            debugLog(type >= 1 && type <= 6 ? 'warn' : 'info', 'AVPlay onEvent(' + type + (data !== undefined ? ', ' + data : '') + ')');
                            if (type <= 9 || type === 12) reportTvDiag('av_ev', type + ':' + (data !== undefined ? data : ''));
                        }
                        if (type === 9) {
                            gotInfo = true;
                            extendStall();
                            setNativePlane(true);
                            var resInfo = applyOrsayAvScale(av, grid);
                            scaleDone = !!(resInfo && resInfo.indexOf('none|') !== 0);
                            reportTvDiag('av_res', resInfo + '|g=' + grid.width + 'x' + grid.height);
                            try { player.duration = (Number(av.getDuration()) || 0) / 1000; } catch (eDur9) {}
                            readEngineTracks();
                            playerMessage('');
                            updateProgress();
                            showBar();
                        } else if (type === 7) {
                            if (!scaleDone) { var s7 = applyOrsayAvScale(av, grid); scaleDone = !!(s7 && s7.indexOf('none|') !== 0); }
                            player.paused = false;
                            markFrame();
                            updateProgress();
                            showBar();
                        } else if (type === 12) {
                            extendStall();
                            if (!scaleDone) { var s12 = applyOrsayAvScale(av, grid); scaleDone = !!(s12 && s12.indexOf('none|') !== 0); }
                            player.paused = false;
                            playerMessage('');
                            updateProgress();
                            showBar();
                        } else if (type === 11) {
                            extendStall();
                            bufferNotice('Буферизация…');
                        } else if (type === 13) {
                            extendStall();
                            if (!player.firstFrame) bufferNotice('Буферизация… ' + (Number(data) || 0) + '%');
                        } else if (type === 14) {
                            var ms = Number(data) || 0;
                            if (ms <= 0 && !zeroLogged) {
                                zeroLogged = true;
                                reportTvDiag('av_t14_0', 'st=' + av.status + '|ev=' + nativeSession.trail);
                            }
                            if (ms > 0 && !scaleDone) { var s14 = applyOrsayAvScale(av, grid); scaleDone = !!(s14 && s14.indexOf('none|') !== 0); }
                            if (ms > 0 && !timeLogged) {
                                timeLogged = true;
                                debugLog('info', 'AVPlay onEvent(14, ' + ms + ') — playback time running');
                                reportTvDiag('av_t14', String(ms));
                            }
                            player.currentTime = ms / 1000;
                            if (!player.duration) {
                                try { player.duration = (Number(av.getDuration()) || 0) / 1000; } catch (eDur) {}
                            }
                            if (ms > 0 && !player.firstFrame) markFrame();
                            updateProgress();
                        } else if (type === 8) {
                            try { av.stop(); } catch (eStop) {}
                            onPlaybackEnded();
                        } else if (type === 5) {
                            bufferNotice('Медленная сеть, буферизация…');
                        } else if (type >= 1 && type <= 6) {
                            var errCode = type + (data !== undefined ? ':' + data : '');
                            if (isOrsayEcho(type, gotInfo)) {
                                deferOrsayEcho('av', errCode, function () { if (!gotInfo) avError(type, data); });
                                return;
                            }
                            avError(type, data);
                        }
                    };
                    var opened = false;
                    var openThrew = false;
                    try { opened = av.open(playUrl); } catch (eOpen) { openThrew = true; debugLog('warn', 'AVPlay open() threw: ' + debugStringify(eOpen)); reportTvDiag('av_open_err', errText(eOpen)); }
                    var openOk = !openThrew && !nativeFailed(opened);
                    debugLog('info', 'AVPlay open -> ' + opened + ' (ok=' + openOk + ')');
                    reportTvDiag('av_open', String(opened) + '|ok=' + openOk + '|cw=' + grid.width + 'x' + grid.height);
                    if (openOk) {
                        player.ready = true;
                        player.paused = false;
                        armStall(orsayStallMs('avplay'));
                        av.play(function () {}, function (err) {
                            if (!live()) return;
                            debugLog('error', 'AVPlay play() failed: ' + debugStringify(err));
                            reportTvDiag('av_play_fail', player.phase + '|' + errText(err));
                            if (!player.firstFrame) {
                                fallback();
                                return;
                            }
                            playerProblem('error');
                        });
                    } else {
                        fallback();
                    }
                }, function (err) {
                    debugLog('warn', 'getAVPlay error callback');
                    reportTvDiag('av_get_fail', 'cb|' + errText(err));
                    fallback();
                });
            } catch (eOrsay) {
                debugLog('error', 'getAVPlay failed: ' + debugStringify(eOrsay));
                reportTvDiag('av_get_fail', debugStringify(eOrsay));
                fallback();
            }
        });
    }

    /* Driver A.1b — Orsay AVPlay SDK options mode (av.init({ zIndex: -1, playCallback, bufferingCallback }), MSX tvx-app parity). */
    function openOrsayAvSdk(rawUrl, loadId) {
        engineDetach(false, true);
        releaseAutoOrsayPlugins('');
        var seq = player.engineSeq;
        player.engineKind = 'orsay-sdk';
        setEngineLabel('Orsay AVPlay SDK');
        var hostOrsay = $('lite-native-host');
        if (hostOrsay) hostOrsay.innerHTML = '';
        function live() { return loadId === player.loadId && seq === player.engineSeq; }
        function failSdk(tag, errMsg) {
            if (!live()) return;
            markOrsayEngineTried('avsdk');
            player.lastNativeErr = errMsg || tag;
            reportTvDiag(tag, player.phase + '|' + (errMsg || 'fail'));
            if (!player.firstFrame && !ORSAY_FORCE_ENGINE && !isUnsupportedResolutionErr(player.lastNativeErr, player.lastNativeRes)) {
                var nextEng = pickOrsayEngine();
                if (nextEng) {
                    clearStall();
                    engineDetach(false, true);
                    scheduleOrsayRescueEngine(rawUrl, loadId, nextEng, function () { playerProblem('error'); });
                    return;
                }
            }
            playerProblem('error');
        }
        ensureOrsayMediaSource(function () {
            if (!live()) return;
            try {
                window.webapis.avplay.getAVPlay(function (av) {
                    if (!live()) { try { av.destroy(); } catch (e0) {} return; }
                    nativeSession.av = av;
                    enterNativePlane('orsay-sdk', 'Orsay AVPlay SDK');
                    var playUrl = orsayPlayUrl(rawUrl);
                    var zeroLogged = false;
                    var timeLogged = false;
                    var initOk = true;
                    try {
                        av.init({
                            zIndex: -1,
                            playCallback: {
                                oncurrentplaytime: function (t) {
                                    if (!live()) return;
                                    var ms = (typeof t === 'object' && t !== null && t.millisecond !== undefined) ? (Number(t.millisecond) || 0) : (Number(t) || 0);
                                    noteNativeEvent(14, ms);
                                    if (ms <= 0 && !zeroLogged) {
                                        zeroLogged = true;
                                        reportTvDiag('avsdk_t0', 'st=' + av.status + '|ev=' + nativeSession.trail);
                                    }
                                    if (ms > 0 && !timeLogged) {
                                        timeLogged = true;
                                        debugLog('info', 'AVPlay SDK time running: ' + ms);
                                        reportTvDiag('avsdk_t14', String(ms));
                                    }
                                    player.currentTime = ms / 1000;
                                    if (!player.duration) {
                                        try { player.duration = (Number(av.getDuration ? av.getDuration() : av.duration) || 0) / 1000; } catch (eD) {}
                                    }
                                    if (ms > 0 && !player.firstFrame) markFrame();
                                    updateProgress();
                                },
                                onstreamcompleted: function () {
                                    if (!live()) return;
                                    noteNativeEvent(8);
                                    try { av.stop(); } catch (eS) {}
                                    onPlaybackEnded();
                                },
                                onerror: function (err) {
                                    if (!live()) return;
                                    var txt = errText(err);
                                    noteNativeEvent(6, txt);
                                    failSdk('avsdk_err', txt);
                                }
                            },
                            bufferingCallback: {
                                onbufferingstart: function () {
                                    if (!live()) return;
                                    noteNativeEvent(11);
                                    extendStall();
                                    bufferNotice('Буферизация…');
                                },
                                onbufferingprogress: function (pct) {
                                    if (!live()) return;
                                    noteNativeEvent(13, pct);
                                    extendStall();
                                },
                                onbufferingcomplete: function () {
                                    if (!live()) return;
                                    noteNativeEvent(12);
                                    extendStall();
                                    player.paused = false;
                                    playerMessage('');
                                    try { if (!player.duration) player.duration = (Number(av.getDuration ? av.getDuration() : av.duration) || 0) / 1000; } catch (eD2) {}
                                    updateProgress();
                                    showBar();
                                }
                            }
                        });
                    } catch (eInit) {
                        initOk = false;
                        reportTvDiag('avsdk_init_err', errText(eInit));
                    }
                    reportTvDiag('avsdk_init', (initOk ? 'ok' : 'err') + '|st=' + av.status + '|obj=' + orsayObjectDiag());
                    if (!initOk) { failSdk('avsdk_init_fail', 'init'); return; }
                    var opened = false;
                    var openThrew = false;
                    try { opened = av.open(playUrl); } catch (eOpen) { openThrew = true; reportTvDiag('avsdk_open_err', errText(eOpen)); }
                    var openOk = !openThrew && !nativeFailed(opened);
                    reportTvDiag('avsdk_open', String(opened) + '|ok=' + openOk);
                    if (openOk) {
                        player.ready = true;
                        player.paused = false;
                        armStall(orsayStallMs('avsdk'));
                        try {
                            av.play(function () {}, function (err) { failSdk('avsdk_play_err', errText(err)); });
                        } catch (ePlay) {
                            failSdk('avsdk_play_exc', errText(ePlay));
                        }
                    } else {
                        failSdk('avsdk_open_fail', String(opened));
                    }
                }, function (err) {
                    failSdk('avsdk_get_fail', errText(err));
                });
            } catch (eGet) {
                failSdk('avsdk_get_exc', errText(eGet));
            }
        });
    }

    /* Driver B (reserve in /tv/lite) — Tizen AVPlay for Tizen 2.x–4.x that land on the lite portal. */
    function openTizenAvplay(rawUrl, loadId) {
        var absUrl = toAbsoluteUrl(rawUrl);
        engineDetach();
        var host = $('lite-native-host');
        if (host) host.innerHTML = '<object id="lite-avplayer" class="lite-avplayer" type="application/avplayer"></object>';
        enterNativePlane('tizen', 'Tizen AVPlay');
        var avp = window.webapis.avplay;
        try {
            try { avp.close(); } catch (eClose) {}
            avp.open(absUrl);
            avp.setDisplayRect(0, 0, TIZEN_GRID_W, TIZEN_GRID_H);
            avp.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
            try { if (avp.setSilentSubtitle) avp.setSilentSubtitle(false); } catch (eS) {}
            avp.setListener({
                onbufferingstart: function () { if (loadId === player.loadId) bufferNotice('Буферизация…'); },
                onbufferingcomplete: function () { if (loadId === player.loadId) { player.paused = false; markFrame(); updateProgress(); } },
                oncurrentplaytime: function () {
                    if (loadId !== player.loadId) return;
                    try { player.currentTime = (avp.getCurrentTime() || 0) / 1000; } catch (eT) {}
                    try { player.duration = (avp.getDuration() || 0) / 1000; } catch (eD) {}
                    updateProgress();
                },
                onstreamcompleted: function () {
                    if (loadId !== player.loadId) return;
                    try { avp.stop(); } catch (eC) {}
                    onPlaybackEnded();
                },
                onerror: function (code) {
                    if (loadId !== player.loadId) return;
                    debugLog('error', 'Tizen onerror: ' + code);
                    playerProblem('error');
                }
            });
            player.ready = true;
            armStall(15000);
            avp.prepareAsync(function () {
                if (loadId !== player.loadId) return;
                debugLog('info', 'Tizen prepareAsync ok -> play()');
                avp.play();
                player.paused = false;
                markFrame();
                updateProgress();
                showBar();
            }, function (err) {
                if (loadId !== player.loadId) return;
                debugLog('error', 'Tizen prepareAsync failed: ' + debugStringify(err));
                playerProblem('error');
            });
            return true;
        } catch (eTizen) {
            debugLog('error', 'Tizen AVPlay failed: ' + debugStringify(eTizen));
            try { avp.close(); } catch (eClose2) {}
            nativeSession.kind = 'html5';
            setNativePlane(false);
            return false;
        }
    }

    /* Player factory. Every stage (intro → pre-roll → film) goes through here: the previous stream is
       stopped and closed first and, on a TV, the next open() waits DECODER_RELEASE_MS for the decoder.
       orsayTried resets per stage so a buffer timeout in intro/ad never burns primary AVPlay for film. */
    function openWithEngine(rawUrl, loadId) {
        if (loadId !== player.loadId) return;
        /* v10 race: a pending open of the previous stage (intro) fired after the film had started and
           re-opened intro.video_url under the film flag. Only one deferred open may exist. */
        clearEngineTimers();
        player.orsayTried = {};
        player.orsaySefTried = false;
        player.stallDeadline = 0;
        player.stallBumpAt = 0;
        if (engineBusy()) engineDetach(player.firstFrame);
        if (IS_TV && player.lastReleaseAt) {
            var since = new Date().getTime() - player.lastReleaseAt;
            var wait = IS_ORSAY ? (player.lastReleaseClean ? ORSAY_CLEAN_RELEASE_MS : ORSAY_STAGE_RELEASE_MS) : DECODER_RELEASE_MS;
            if (since >= 0 && since < wait) {
                /* lastReleaseAt is kept until the open really happens: a superseding stage still waits. */
                var seq = player.engineSeq;
                var phase = player.phase;
                player.openTimer = setTimeout(function () {
                    player.openTimer = null;
                    if (loadId !== player.loadId || seq !== player.engineSeq || phase !== player.phase) {
                        reportTvDiag('open_drop', phase + '>' + player.phase);
                        return;
                    }
                    player.lastReleaseAt = 0;
                    openWithEngineNow(rawUrl, loadId);
                }, wait - since);
                return;
            }
            player.lastReleaseAt = 0;
        }
        openWithEngineNow(rawUrl, loadId);
    }

    function openWithEngineNow(rawUrl, loadId) {
        if (loadId !== player.loadId) return;
        player.currentOpenUrl = rawUrl;
        debugEnv(rawUrl);
        player.firstFrame = false;
        player.ready = false;
        player.lastNativeErr = '';
        player.orsaySefTried = false;
        player.duration = 0;
        player.currentTime = 0;
        if (IS_ORSAY) {
            if (ORSAY_FORCE_ENGINE) {
                reportTvDiag('force', ORSAY_FORCE_ENGINE);
                if (openOrsayByKey(ORSAY_FORCE_ENGINE, rawUrl, loadId)) return;
            } else {
                var chosen = pickOrsayEngine();
                if (chosen) {
                    if (chosen === 'sef' || chosen === 'player') markOrsayEngineTried(chosen);
                    if (openOrsayByKey(chosen, rawUrl, loadId)) return;
                }
            }
            if (!ORSAY_FORCE_ENGINE) {
                if (!player.orsayTried.sef) { markOrsayEngineTried('sef'); if (tryOrsaySef(rawUrl, loadId)) return; }
                if (!player.orsayTried.player) { markOrsayEngineTried('player'); if (tryOrsayLegacyPlayer(rawUrl, loadId)) return; }
            }
            openHtml5Fallback(rawUrl, loadId, 'no Orsay plugin answered');
            return;
        }
        if (canUseTizenAvplay() && openTizenAvplay(rawUrl, loadId)) return;
        openHtml5Fallback(rawUrl, loadId, IS_TIZEN ? 'no Tizen AVPlay' : '');
    }

    function openHtml5Fallback(rawUrl, loadId, reason) {
        if (loadId !== player.loadId) return;
        engineDetach();
        player.engineKind = 'html5';
        nativeSession.kind = 'html5';
        setEngineLabel(IS_ORSAY ? 'HTML5 (no Orsay API)' : IS_TIZEN ? 'HTML5 (no Tizen API)' : 'HTML5');
        debugLog(reason ? 'warn' : 'info', 'engine: HTML5 <video>' + (reason ? ' — ' + reason : ''));
        reportTvDiag('html5', (reason || 'default') + '|' + player.phase);
        if (IS_TV && reason) debugOpen();
        var video = $('lite-video');
        show(video);
        video.src = normalizeTvUrl(rawUrl);
        try { video.load(); } catch (e) {}
        try {
            var started = video.play();
            if (started && typeof started.then === 'function') started.then(null, function () {});
        } catch (e2) {}
        player.ready = true;
        player.paused = false;
        armStall();
        showBar();
    }

    function updateAdOverlay(current, duration) {
        var badge = $('lite-ad-badge');
        var skip = $('lite-ad-skip');
        var rem = duration > 0 ? Math.max(0, Math.ceil(duration - current)) : '';
        if (badge) {
            setText(badge, rem !== '' ? ('Реклама · ' + rem + ' сек') : 'Реклама');
            show(badge);
        }
        if (skip && player.adSkipAfter !== null && player.adSkipAfter !== undefined) {
            if (current >= player.adSkipAfter) {
                player.adCanSkip = true;
                setText(skip, 'Пропустить рекламу');
                addClass(skip, 'is-focused');
            } else {
                player.adCanSkip = false;
                setText(skip, 'Пропустить через ' + Math.max(1, Math.ceil(player.adSkipAfter - current)) + ' сек');
                removeClass(skip, 'is-focused');
            }
            show(skip);
        } else if (skip) {
            hide(skip);
        }
    }

    var AD_PREPARE_WAIT_MS = 2500;

    /* ---------- v15 cinema pipeline: intro cache, poster / veil, film first-bytes probe, hand-over ---------- */

    var introCache = { cfg: null, pending: null, images: [] };

    function introCacheValid(cfg) {
        return !!cfg && typeof cfg === 'object' && typeof cfg.enabled === 'boolean';
    }

    /* Only a Media Node intro URL is played: https, a host other than this portal, the node route and its token. */
    function safeIntroUrl(url) {
        if (!url || typeof url !== 'string') return '';
        var m = url.match(NODE_INTRO_URL);
        if (!m) return '';
        var loc = window.location;
        if (loc && loc.hostname && m[1].toLowerCase() === String(loc.hostname).toLowerCase()) return '';
        return url;
    }

    /* No usable node URL = no intro (the film is never blocked, nothing is fetched from this portal). */
    function sanitizeIntroConfig(cfg) {
        if (!introCacheValid(cfg)) return null;
        var out = {};
        for (var k in cfg) if (Object.prototype.hasOwnProperty.call(cfg, k)) out[k] = cfg[k];
        out.video_url = safeIntroUrl(cfg.video_url);
        out.webm_url = safeIntroUrl(cfg.webm_url) || null;
        out.still_url = safeIntroUrl(cfg.still_url);
        out.poster_url = safeIntroUrl(cfg.poster_url) || out.still_url;
        if (!out.video_url) out.enabled = false;
        return out;
    }

    function readIntroCache() {
        if (introCache.cfg) return introCache.cfg;
        try {
            var raw = window.localStorage ? window.localStorage.getItem(INTRO_CACHE_KEY) : null;
            var parsed = raw ? JSON.parse(raw) : null;
            var cached = parsed ? sanitizeIntroConfig(parsed.cfg) : null;
            if (cached) introCache.cfg = cached;
        } catch (e) {}
        return introCache.cfg;
    }

    function storeIntroCache(cfg) {
        if (!introCacheValid(cfg)) return;
        introCache.cfg = cfg;
        try {
            if (window.localStorage) window.localStorage.setItem(INTRO_CACHE_KEY, JSON.stringify({ at: new Date().getTime(), cfg: cfg }));
        } catch (e) {}
    }

    /* Poster / still are decoded before Play, so #lite-intro-poster paints at 0 ms. */
    function preloadIntroImages(cfg) {
        if (!cfg || !cfg.enabled || typeof window.Image !== 'function') return;
        var urls = [cfg.poster_url, cfg.still_url];
        for (var i = 0; i < urls.length; i++) {
            if (!urls[i]) continue;
            try {
                var img = new window.Image();
                img.src = normalizeTvUrl(urls[i]);
                introCache.images.push(img);
            } catch (e) {}
        }
        if (introCache.images.length > 6) introCache.images = introCache.images.slice(introCache.images.length - 4);
    }

    /* Boot prefetch + background revalidation; resolves with the freshest known config (or null). */
    function refreshIntroConfig() {
        if (introCache.pending) return introCache.pending;
        introCache.pending = api.introConfig().then(function (cfg) {
            introCache.pending = null;
            cfg = sanitizeIntroConfig(cfg);
            if (introCacheValid(cfg)) {
                storeIntroCache(cfg);
                preloadIntroImages(cfg);
                return cfg;
            }
            return readIntroCache();
        }, function () {
            introCache.pending = null;
            return readIntroCache();
        });
        return introCache.pending;
    }

    function isHtml5Stage() {
        return nativeSession.kind === 'html5' && !IS_ORSAY && !IS_TIZEN;
    }

    function showIntroPoster(url, hold) {
        var img = $('lite-intro-poster');
        var src = url ? normalizeTvUrl(url) : '';
        if (!img || !src) return false;
        clearTimeout(player.posterTimer);
        player.posterTimer = null;
        if (img.getAttribute('src') !== src) img.setAttribute('src', src);
        removeClass(img, 'is-faded');
        if (hold) addClass(img, 'is-hold'); else removeClass(img, 'is-hold');
        show(img);
        var vignette = $('lite-hold-vignette');
        if (vignette) { if (hold) show(vignette); else hide(vignette); }
        return true;
    }

    function fadeIntroPoster() {
        var img = $('lite-intro-poster');
        if (!img || hasClass(img, 'is-hidden')) return;
        addClass(img, 'is-faded');
        hide($('lite-hold-vignette'));
        clearTimeout(player.posterTimer);
        player.posterTimer = setTimeout(function () {
            player.posterTimer = null;
            hideIntroPoster();
        }, VEIL_FADE_MS + 60);
    }

    function hideIntroPoster() {
        clearTimeout(player.posterTimer);
        player.posterTimer = null;
        var img = $('lite-intro-poster');
        if (img) {
            hide(img);
            addClass(img, 'is-faded');
            removeClass(img, 'is-hold');
        }
        hide($('lite-hold-vignette'));
    }

    function veilIsOn() {
        var veil = $('lite-transition-veil');
        return !!veil && hasClass(veil, 'is-on');
    }

    /* #lite-transition-veil: on = #070b0e cover. dissolve = 900 ms (HTML5), instant = no transition. */
    function setVeil(on, dissolve, instant) {
        var veil = $('lite-transition-veil');
        if (!veil) return;
        if (dissolve) addClass(veil, 'is-dissolve'); else removeClass(veil, 'is-dissolve');
        if (instant) addClass(veil, 'is-instant'); else removeClass(veil, 'is-instant');
        if (on) addClass(veil, 'is-on'); else removeClass(veil, 'is-on');
    }

    /* HTML5 only: the outgoing stage's sound fades with the picture. Orsay keeps its hardware volume. */
    function fadeVideoVolume(ms) {
        var video = $('lite-video');
        if (!video) return;
        clearInterval(player.volumeTimer);
        var start = 1;
        try { if (typeof video.volume === 'number' && !isNaN(video.volume)) start = video.volume; } catch (e) {}
        if (player.volumeBefore < 0) player.volumeBefore = start;
        var steps = Math.max(1, Math.round(ms / 60));
        var step = 0;
        player.volumeTimer = setInterval(function () {
            step += 1;
            try { video.volume = Math.max(0, start * (1 - step / steps)); } catch (e2) {}
            if (step >= steps) {
                clearInterval(player.volumeTimer);
                player.volumeTimer = null;
            }
        }, 60);
    }

    function restoreVideoVolume() {
        clearInterval(player.volumeTimer);
        player.volumeTimer = null;
        if (player.volumeBefore < 0) return;
        var video = $('lite-video');
        try { if (video) video.volume = player.volumeBefore; } catch (e) {}
        player.volumeBefore = -1;
    }

    /* Covers the outgoing stage with the veil (400 ms on native planes, 900 ms dissolve + volume fade in
       HTML5) and runs next() underneath it: the decoder re-initialisation between Intro, Pre-roll and Film
       is never seen. The veil lifts on the next stage's first frame (markFrame / RENDERING_START 7). */
    function coverStage(loadId, next) {
        if (loadId !== player.loadId) return;
        clearTimeout(player.veilTimer);
        player.veilTimer = null;
        if (!$('lite-transition-veil') || veilIsOn()) {
            hideIntroPoster();
            next();
            return;
        }
        var html5 = isHtml5Stage();
        var ms = html5 ? DISSOLVE_MS : VEIL_FADE_MS;
        setVeil(true, html5, false);
        if (html5) fadeVideoVolume(ms);
        player.veilTimer = setTimeout(function () {
            player.veilTimer = null;
            if (loadId !== player.loadId) return;
            hideIntroPoster();
            next();
        }, ms);
    }

    function cancelFilmProbe() {
        clearTimeout(player.probeTimer);
        player.probeTimer = null;
        var xhr = player.probeXhr;
        player.probeXhr = null;
        if (!xhr) return;
        try { xhr.onreadystatechange = null; } catch (e) {}
        try { xhr.abort(); } catch (e2) {}
    }

    /* Film first bytes while the intro plays: one plain XHR GET with Range bytes=0-65535 (no second
       decoder, nothing for Orsay to contend with). 200 / 206 with body bytes -> filmBytesReady; any other
       outcome, or FILM_PREPROBE_MAX_WAIT_MS, ends the wait (the film's own engine then reports problems).
       The request is aborted as soon as bytes arrive, so the media node / torrent worker slot is free long
       before AVPlay opens the film. */
    function probeStreamFirstBytes(rawUrl, loadId) {
        cancelFilmProbe();
        player.filmBytesReady = false;
        player.probeTimedOut = false;
        var url = rawUrl ? normalizeTvUrl(rawUrl) : '';
        var xhr = null;
        if (url && window.XMLHttpRequest) {
            try { xhr = new window.XMLHttpRequest(); } catch (e) { xhr = null; }
        }
        if (!xhr) {
            player.probeTimedOut = true;
            return;
        }
        var startedAt = new Date().getTime();
        var settled = false;
        function settle(ok, tag) {
            if (settled) return;
            settled = true;
            clearTimeout(player.probeTimer);
            player.probeTimer = null;
            if (player.probeXhr === xhr) player.probeXhr = null;
            try { xhr.onreadystatechange = null; } catch (e) {}
            if (xhr.readyState !== 4) {
                try { xhr.abort(); } catch (e2) {}
            }
            if (loadId !== player.loadId) return;
            if (ok) player.filmBytesReady = true; else player.probeTimedOut = true;
            reportTvDiag('film_probe', tag + '|t=' + (new Date().getTime() - startedAt));
            evaluateIntroHandoff(loadId);
        }
        xhr.onreadystatechange = function () {
            var state = xhr.readyState;
            if (state < 3) return;
            var status = 0;
            try { status = xhr.status; } catch (e) {}
            if (status === 200 || status === 206) {
                settle(true, 'st' + status + '|rs' + state);
                return;
            }
            if (state === 4) settle(false, 'st' + status);
        };
        player.probeXhr = xhr;
        player.probeTimer = setTimeout(function () { settle(false, 'timeout'); }, FILM_PREPROBE_MAX_WAIT_MS);
        try {
            xhr.open('GET', url, true);
            xhr.setRequestHeader('Range', FILM_PROBE_RANGE);
            if (xhr.overrideMimeType) xhr.overrideMimeType('text/plain; charset=x-user-defined');
            xhr.send(null);
        } catch (e3) {
            settle(false, 'open');
        }
    }

    function holdNotice() {
        /* A long cold-torrent hold gets one quiet line over the still — never over the running clip. */
        if (player.introClipEnded && !player.problem) playerMessage('Подготовка потока…');
    }

    /* The single gate between the intro and the next stage (1:1 with VideoPlayer.vue / TorrentPlayer.vue):
       never before MIN_INTRO_MS since the poster / first frame was shown, only once the film's stream is
       resolved and its first bytes arrived (or the probe gave up), and after the pre-roll is prepared or
       AD_PREPARE_WAIT_MS passed since the 5 s mark. A stream error exits through abortStreamError(). */
    function evaluateIntroHandoff(loadId) {
        if (loadId !== player.loadId || player.phase !== 'intro' || player.introDone || player.handoffStarted) return;
        if (player.streamError) return;
        clearTimeout(player.handoffTimer);
        player.handoffTimer = null;
        /* Nothing to hand over from until the intro is actually on screen (runIntro / poster). */
        if (!player.introShownAt) return;
        var now = new Date().getTime();
        var elapsed = now - player.introShownAt;
        if (elapsed < MIN_INTRO_MS) {
            player.handoffTimer = setTimeout(function () { evaluateIntroHandoff(loadId); }, MIN_INTRO_MS - elapsed);
            return;
        }
        if (!player.streamDone || !player.stream || !player.stream.url) {
            holdNotice();
            return;
        }
        if (!player.filmBytesReady && !player.probeTimedOut) {
            if (!player.probeXhr && !player.probeTimer) probeStreamFirstBytes(player.stream.url, loadId);
            if (loadId !== player.loadId || player.handoffStarted) return;
            if (!player.filmBytesReady && !player.probeTimedOut) {
                holdNotice();
                return;
            }
        }
        if (player.adPrepPromise && !player.adPrepDone && !player.adWaitExpired) {
            if (!player.adWaitSince) {
                player.adWaitSince = now;
                player.adPrepPromise.then(function () { evaluateIntroHandoff(loadId); }, function () { evaluateIntroHandoff(loadId); });
            }
            var waited = now - player.adWaitSince;
            if (waited < AD_PREPARE_WAIT_MS) {
                player.handoffTimer = setTimeout(function () { evaluateIntroHandoff(loadId); }, AD_PREPARE_WAIT_MS - waited);
                return;
            }
            player.adWaitExpired = true;
        }
        player.handoffStarted = true;
        playerMessage('');
        reportTvDiag('handoff', 't=' + elapsed + '|bytes=' + (player.filmBytesReady ? 1 : 0) + '|ad=' + (player.adPrepared ? 1 : 0));
        coverStage(loadId, function () { finishIntroStage(loadId); });
    }

    /* Ambient Hold: the intro clip reached its end (av_ev:8 / 0.25 s before duration), failed or stalled
       before the hand-over is allowed. Its final picture (still_url, else poster_url) covers the plane with
       a soft vignette, the decoder is released cleanly underneath and evaluateIntroHandoff() decides when
       the veil leads into the next stage. */
    function onIntroClipEnded(reason) {
        var id = player.loadId;
        if (player.phase !== 'intro' || player.introDone || player.introClipEnded || player.handoffStarted) return;
        player.introClipEnded = true;
        clearTimeout(player.introTimer);
        player.introTimer = null;
        reportTvDiag('intro_end', reason + '|t=' + (player.introShownAt ? new Date().getTime() - player.introShownAt : -1));
        var cfg = player.introConfig || readIntroCache() || {};
        if (showIntroPoster(cfg.still_url || cfg.poster_url, true)) setVeil(false, false, true);
        else setVeil(true, false, true);
        var clean = reason === 'ended' || reason === 'eos' || reason === 'limit';
        detachVideo(clean, IS_ORSAY || IS_TIZEN);
        evaluateIntroHandoff(id);
    }

    function advanceFromCommercial(reason) {
        var id = player.loadId;
        clearAdTimers();
        if (player.phase === 'intro') {
            /* v15: the clip ending / failing / stalling never cuts the intro stage short — Ambient Hold on
               still_url until evaluateIntroHandoff() lets the next stage in (MIN_INTRO_MS + film bytes). */
            onIntroClipEnded(reason);
            return;
        }
        if (player.phase === 'ad') {
            if (player.adDeliveryId && (reason === 'ended' || reason === 'skip')) {
                sendAdImpression();
                api.adEvent(player.adDeliveryId, reason === 'skip' ? 'skip' : 'completion')['catch'](function () {});
            }
            player.adDeliveryId = null;
            player.adSkipAfter = null;
            player.adCanSkip = false;
            player.adImpressionSent = false;
            /* The veil covers the last pre-roll frame, then the film opens underneath it. */
            coverStage(id, function () { startFilmStage(id); });
        }
    }

    function onPlaybackEnded() {
        if (player.phase === 'intro' || player.phase === 'ad') {
            advanceFromCommercial('ended');
            return;
        }
        closePlayer();
        toast('Просмотр завершён');
    }

    function introEnabledForCard(intro, card) {
        if (!intro || !intro.enabled || !intro.video_url) return false;
        /* Smart TV targets; configs saved before them follow the browser counterpart (as the backend does). */
        var key = isTorrentCard(card) ? 'tv_torrent' : 'tv_telegram';
        var parent = isTorrentCard(card) ? 'browser_torrents' : 'browser_telegram';
        if (intro.targets && typeof intro.targets[key] === 'boolean') return intro.targets[key];
        if (intro.targets && typeof intro.targets[parent] === 'boolean') return intro.targets[parent];
        return true;
    }

    function abortStreamError(error, loadId) {
        if (loadId !== player.loadId) return;
        clearAdTimers();
        clearStall();
        detachVideo(true);
        player.phase = 'film';
        player.waitingForStream = false;
        player.ready = false;
        var st = error && error.status;
        var card = player.card;
        if (st === 403) {
            var isProError = error && error.data && (error.data.detail === 'Нужна подписка PRO' || String(error.data.detail).indexOf('подписк') !== -1);
            var hasToken = !!readToken();
            if (card && card.play && card.play.src === 'torrent' && (isProError || hasToken)) {
                closePlayer();
                openProModal();
                return;
            }
            player.needsAuth = true;
        } else if (st === 401) {
            player.needsAuth = true;
        }
        playerMessage(failText(error));
        showBar();
    }

    function beginBackgroundAds(loadId, play, episode) {
        if (player.adPlanStarted) return;
        player.adPlanStarted = true;
        player.adPrepPromise = api.adPlan(play, episode)['catch'](function () { return null; }).then(function (plan) {
            if (loadId !== player.loadId) return null;
            player.adPlan = plan;
            var preCue = null;
            if (plan && plan.plan_token && plan.cue_points && plan.cue_points.length) {
                for (var c = 0; c < plan.cue_points.length; c++) {
                    if (plan.cue_points[c] && plan.cue_points[c].kind === 'pre') { preCue = plan.cue_points[c]; break; }
                }
            }
            if (!preCue || !plan.plan_token) {
                player.adPrepared = null;
                player.adPrepDone = true;
                return null;
            }
            return api.adPrepare(plan.plan_token, preCue.id)['catch'](function () { return null; }).then(function (prep) {
                if (loadId !== player.loadId) return null;
                var ad = prep && prep.ad && prep.ad.media_url ? prep.ad : null;
                player.adPrepared = ad;
                player.adPrepDone = true;
                return ad;
            });
        });
    }

    function startAdStage(loadId, ad) {
        if (loadId !== player.loadId) return;
        clearAdTimers();
        player.phase = 'ad';
        player.adDeliveryId = ad.delivery_id;
        player.adSkipAfter = ad.skip_after;
        player.adCanSkip = false;
        player.adImpressionSent = false;
        renderTrackStatus();
        updateAdOverlay(0, ad.duration_sec || 0);
        var adLimit = ad.duration_sec ? Math.min(35000, Math.max(12000, (Number(ad.duration_sec) + 5) * 1000)) : 30000;
        player.adTimer = setTimeout(function () {
            if (loadId === player.loadId && player.phase === 'ad') advanceFromCommercial('timeout');
        }, adLimit);
        openWithEngine(ad.media_url, loadId);
    }

    function proceedAfterIntro(loadId) {
        if (loadId !== player.loadId) return;
        if (player.streamError) { abortStreamError(player.streamError, loadId); return; }
        if (!player.streamDone) {
            player.waitingForStream = true;
            detachVideo(false, IS_ORSAY || IS_TIZEN);
            playerMessage('Подготовка потока…');
            showBar();
            return;
        }
        var stream = player.stream;
        if (!stream || !stream.url) { abortStreamError(noStream(), loadId); return; }
        if (player.adPrepDone) {
            if (player.adPrepared && player.adPrepared.media_url) { startAdStage(loadId, player.adPrepared); return; }
            startFilmStage(loadId);
            return;
        }
        if (player.adPrepPromise && !player.adWaitExpired) {
            var settled = false;
            var waitAd = setTimeout(function () {
                if (settled || loadId !== player.loadId) return;
                settled = true;
                startFilmStage(loadId);
            }, AD_PREPARE_WAIT_MS);
            player.adPrepPromise.then(function (ad) {
                clearTimeout(waitAd);
                if (settled || loadId !== player.loadId) return;
                settled = true;
                if (ad && ad.media_url) { startAdStage(loadId, ad); return; }
                startFilmStage(loadId);
            }, function () {
                clearTimeout(waitAd);
                if (settled || loadId !== player.loadId) return;
                settled = true;
                startFilmStage(loadId);
            });
            return;
        }
        startFilmStage(loadId);
    }

    function finishIntroStage(loadId) {
        if (loadId !== player.loadId || player.introDone) return;
        player.introDone = true;
        clearAdTimers();
        proceedAfterIntro(loadId);
    }

    function startFilmStage(loadId) {
        if (loadId !== player.loadId) return;
        clearAdTimers();
        var stream = player.stream;
        if (!stream || !stream.url) { playerProblem('error'); return; }
        player.phase = 'film';
        player.waitingForStream = false;
        cancelFilmProbe();
        renderTrackStatus();
        playerMessage('');
        if (!veilIsOn()) setVeil(true, false, true);
        clearTimeout(player.filmNoticeTimer);
        player.filmNoticeTimer = setTimeout(function () {
            player.filmNoticeTimer = null;
            if (loadId === player.loadId && player.phase === 'film' && !player.firstFrame && !player.problem) playerMessage('Запускаем поток…');
        }, FILM_NOTICE_MS);
        openWithEngine(stream.url, loadId);
    }

    /* Strict website playback sequence: Intro -> Pre-roll Ad (if planned & prepared) -> Film.
       The intro starts as soon as /cinema/intro permits it while stream resolution and pre-roll
       preparation happen concurrently in the background without touching a second decoder. */
    function startStream() {
        var card = player.card;
        if (!card) return;
        var id = ++player.loadId;
        endSession();
        detachVideo();
        clearStall();
        hide($('lite-player-actions'));
        player.problem = false;
        player.firstFrame = false;
        player.ready = false;
        player.lastNativeErr = '';
        player.lastNativeRes = '';
        player.orsaySefTried = false;
        player.orsayTried = {};
        player.winSrcLogged = false;
        player.winSrcMedia = false;
        player.currentOpenUrl = '';
        player.needsAuth = false;
        player.phase = 'intro';
        player.stream = null;
        player.streamDone = false;
        player.streamError = null;
        player.introConfig = null;
        player.introDone = false;
        player.waitingForStream = false;
        player.adPlan = null;
        player.adPlanStarted = false;
        player.adPrepDone = false;
        player.adPrepared = null;
        player.adPrepPromise = null;
        player.adDeliveryId = null;
        player.adSkipAfter = null;
        player.adCanSkip = false;
        player.adImpressionSent = false;
        cancelFilmProbe();
        clearTimeout(player.handoffTimer);
        clearTimeout(player.veilTimer);
        clearTimeout(player.filmNoticeTimer);
        player.handoffTimer = null;
        player.veilTimer = null;
        player.filmNoticeTimer = null;
        player.introShownAt = 0;
        player.introClipEnded = false;
        player.handoffStarted = false;
        player.filmBytesReady = false;
        player.probeTimedOut = false;
        player.adWaitSince = 0;
        player.adWaitExpired = false;
        restoreVideoVolume();
        /* v15: the intro config comes from the boot cache, so the poster is on screen at 0 ms (no
           'Загружаем видео…' over it) and the intro never waits for the network; a background refresh
           keeps the cache current for the next Play. */
        var cachedIntro = readIntroCache();
        if (introEnabledForCard(cachedIntro, card)) {
            showIntroPoster(cachedIntro.poster_url || cachedIntro.still_url, false);
            setVeil(false, false, true);
            player.introShownAt = new Date().getTime();
            playerMessage('');
        } else {
            hideIntroPoster();
            setVeil(true, false, true);
            playerMessage(cachedIntro ? 'Загружаем видео…' : '');
        }
        showBar();

        if (card.play.kind !== 'series' && card.play.kind !== 'tv') {
            beginBackgroundAds(id, card.play, null);
        }

        var introReq = cachedIntro ? null : refreshIntroConfig();
        if (cachedIntro) refreshIntroConfig();
        resolveStream(card.play).then(function (stream) {
            if (id !== player.loadId) {
                if (stream && stream.sessionId) api.stopPlayback(stream.sessionId)['catch'](function () {});
                return;
            }
            if (!stream || !stream.url) {
                var emptyErr = noStream();
                player.streamError = emptyErr;
                player.streamDone = true;
                abortStreamError(emptyErr, id);
                return;
            }
            player.stream = stream;
            player.streamDone = true;
            if (stream.sessionId) {
                player.sessionId = stream.sessionId;
                var every = (stream.heartbeat > 0 ? stream.heartbeat : 30) * 1000;
                player.heartbeat = setInterval(function () {
                    if (player.sessionId) api.heartbeat(player.sessionId)['catch'](function () {});
                }, every);
            }
            if ((card.play.kind === 'series' || card.play.kind === 'tv') && !player.adPlanStarted) {
                beginBackgroundAds(id, card.play, stream.adEpisode || null);
            }
            if (player.waitingForStream) {
                player.waitingForStream = false;
                proceedAfterIntro(id);
                return;
            }
            /* v15: warm the film's first bytes while the intro is on screen (one XHR Range request). */
            if (player.phase === 'intro' && !player.introDone) probeStreamFirstBytes(stream.url, id);
            evaluateIntroHandoff(id);
        }, function (error) {
            if (id !== player.loadId) return;
            player.streamError = error || noStream();
            player.streamDone = true;
            abortStreamError(player.streamError, id);
        });

        function runIntro(intro) {
            if (id !== player.loadId || player.streamError) return;
            player.introConfig = intro;
            var enabled = introEnabledForCard(intro, card);
            if (enabled && !player.introShownAt) {
                showIntroPoster(intro.poster_url || intro.still_url, false);
                setVeil(false, false, true);
                player.introShownAt = new Date().getTime();
                playerMessage('');
            } else if (!enabled) {
                hideIntroPoster();
                setVeil(true, false, true);
            }
            waitNativePlatform(function () {
                if (id !== player.loadId || player.streamError) return;
                if (enabled) {
                    player.phase = 'intro';
                    renderTrackStatus();
                    playerMessage('');
                    player.introTimer = setTimeout(function () {
                        if (id === player.loadId && player.phase === 'intro') onIntroClipEnded('limit');
                    }, 28000);
                    openWithEngine(intro.video_url, id);
                    evaluateIntroHandoff(id);
                    return;
                }
                finishIntroStage(id);
            });
        }

        if (cachedIntro) runIntro(cachedIntro);
        else introReq.then(runIntro, function () { runIntro(null); });
    }

    function openPlayer(card) {
        if (!card) return;
        player.card = card;
        state.mode = 'player';
        setText($('lite-player-title'), card.title + (card.year ? ' (' + card.year + ')' : ''));
        $('lite-progress-fill').style.width = '0';
        setText($('lite-player-time'), '0:00 / 0:00');
        if (IS_ORSAY || IS_TIZEN) hide($('lite-video'));
        show($('lite-player'));
        startStream();
    }

    function closePlayer() {
        player.loadId += 1;
        /* v15: «Назад» during the intro aborts the film first-bytes probe and every hand-over timer. */
        cancelFilmProbe();
        clearTimeout(player.handoffTimer);
        clearTimeout(player.veilTimer);
        clearTimeout(player.filmNoticeTimer);
        player.handoffTimer = null;
        player.veilTimer = null;
        player.filmNoticeTimer = null;
        endSession();
        detachVideo(true);
        hideIntroPoster();
        setVeil(false, false, true);
        restoreVideoVolume();
        clearTimeout(player.barTimer);
        clearStall();
        player.card = null;
        player.ready = false;
        player.problem = false;
        player.hdOffer = false;
        player.phase = 'film';
        hide($('lite-player-actions'));
        hide($('lite-player'));
        if (state.detailsOpen) {
            state.mode = 'details';
            applyDetailsFocus();
        } else {
            state.mode = 'browse';
            applyFocus();
        }
    }

    function seek(delta) {
        engineSeek(delta);
    }

    function togglePlay(force) {
        if (!player.ready) { startStream(); return; }
        if (player.phase === 'ad' || player.phase === 'intro') return;
        enginePlayPause(force);
    }

    function onPlayerKey(action) {
        if (action === 'back') {
            if (player.trackOpen) { closeTrackBar(); return true; }
            closePlayer();
            return true;
        }
        if (player.problem) {
            if (action === 'left' || action === 'right') { player.focusAct = player.focusAct ? 0 : 1; renderPlayerActions(); return true; }
            if (action === 'select') {
                if (player.focusAct === 0) startStream(); else playerChooseOther();
                return true;
            }
            return true;
        }
        if (player.phase === 'ad') {
            if (action === 'select' && player.adCanSkip) { advanceFromCommercial('skip'); return true; }
            return true;
        }
        if (player.phase === 'intro') return true;
        if (player.trackOpen) {
            if (action === 'left') { if (player.trackFocus > 0) player.trackFocus -= 1; renderTrackBar(); showBar(); return true; }
            if (action === 'right') { if (player.trackFocus < player.tracks.length - 1) player.trackFocus += 1; renderTrackBar(); showBar(); return true; }
            if (action === 'select') { selectEngineTrack(player.trackFocus); closeTrackBar(); return true; }
            if (action === 'up') { closeTrackBar(); return true; }
            return true;
        }
        if (action === 'select') {
            if (!player.ready && player.needsAuth) {
                closePlayer();
                openAuthModal(player.card);
                return true;
            }
            togglePlay();
            return true;
        }
        if (action === 'stop') { closePlayer(); return true; }
        if (action === 'playpause') { togglePlay(); return true; }
        if (action === 'play' || action === 'pause') { togglePlay(action); return true; }
        if (action === 'left' || action === 'rewind') { seek(-SEEK_STEP); return true; }
        if (action === 'right' || action === 'forward') { seek(SEEK_STEP); return true; }
        if (action === 'down') { openTrackBar(); return true; }
        if (action === 'up') { showBar(); return true; }
        return false;
    }

    /* ── Auth / Device Pairing ── */
    var authPolling = null;
    var currentDeviceCode = null;

    var PAIRING_BOT = 'kino_publisher_bot';
    var PAIRING_POLL_MS = 3000;
    function pairingQrUrl(userCode) {
        return API_BASE + '/desktop/pairing/qr?code=' + encodeURIComponent(String(userCode || '').replace(/-/g, ''));
    }

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
        restoreFocus();
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
            setText(urlEl, '@' + PAIRING_BOT);
            if (qrEl) {
                /* QR is rendered locally by the backend: https://t.me/<bot>?start=pair_<CODE> */
                qrEl.src = pairingQrUrl(uCode);
            }
            setText(statusEl, 'Ожидаем подтверждение в Telegram…');

            var delay = PAIRING_POLL_MS;
            authPolling = setInterval(function () {
                if (state.mode !== 'auth' || !currentDeviceCode) {
                    clearInterval(authPolling);
                    authPolling = null;
                    return;
                }
                api.pollPairing(currentDeviceCode).then(function (pollRes) {
                    if (pollRes && pollRes.access_token) {
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

    /* ── PRO Subscription Modal ── */
    function openProModal() {
        state.mode = 'pro-modal';
        var qr = $('lite-pro-qr');
        if (qr) qr.src = API_BASE + '/billing/qr?format=png';
        var btn = $('lite-pro-close');
        if (btn) addClass(btn, 'is-focused');
        show($('lite-pro-modal'));
    }

    function closeProModal() {
        hide($('lite-pro-modal'));
        restoreFocus();
    }

    function onProKey(action) {
        if (action === 'select' || action === 'back') {
            closeProModal();
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
        if (state.searchFocus === 'results') return onSearchResultsKey(action);
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
            } else if (state.searchCards && state.searchCards.length) {
                /* Down from the last keyboard row jumps straight to the first result */
                state.searchFocus = 'results';
                state.resIndex = 0;
                applySearchResultFocus();
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

    /* ── Details Screen Key Handling ── */
    function onDetailsKey(action) {
        var rows = det.rows;
        if (action === 'back') { closeDetailsModal(); return true; }
        if (!rows.length) return false;
        if (action === 'left') {
            if (det.col > 0) det.col -= 1;
        } else if (action === 'right') {
            if (det.col < rows[det.row].length - 1) det.col += 1;
        } else if (action === 'up') {
            if (det.row > 0) det.row -= 1;
            if (det.col >= rows[det.row].length) det.col = rows[det.row].length - 1;
        } else if (action === 'down') {
            if (det.row < rows.length - 1) det.row += 1;
            if (det.col >= rows[det.row].length) det.col = rows[det.row].length - 1;
        } else if (action === 'select') {
            activateDetails(rows[det.row][det.col].id);
            return true;
        } else {
            return false;
        }
        applyDetailsFocus();
        return true;
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
            restoreFocus();
            return true;
        }
        if (action === 'select') {
            var item = MENU_ITEMS[state.menuIndex];
            if (item === 'auth') {
                openAuthModal();
                return true;
            }
            if (item === 'exit') {
                openExit();
                return true;
            }
            switchView(item);
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
            if (chosen.filter) {
                applyFilterChoice(chosen);
            } else if (state.row === 0 && row.id === 'hero') {
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

    /* ── Mouse / pointer remotes (LG Magic Remote, Samsung Smart Remote pointer, air mouse) ──
       Hover moves the same amber focus the D-pad uses; a click runs the same «select» action.
       Only mousemove + click are used: every pointer remote fires them, and pointer events would
       fire a second click on the engines that map both. */
    var pointer = { x: -1, y: -1, wheelAt: 0, keyAt: 0 };

    function isInteractive(node) {
        return hasClass(node, 'lite-card') || hasClass(node, 'lite-menu-item') || hasClass(node, 'lite-btn') ||
            hasClass(node, 'lite-pill') || hasClass(node, 'lite-back') || hasClass(node, 'lite-kb-key') ||
            hasClass(node, 'lite-genre-tile') || hasClass(node, 'lite-progress') || hasClass(node, 'lite-player-audio');
    }

    function interactiveOf(node) {
        while (node && node !== document.body && node.nodeType === 1) {
            if (typeof node.className === 'string' && isInteractive(node)) return node;
            node = node.parentNode;
        }
        return null;
    }

    function indexIn(list, node) {
        for (var i = 0; list && i < list.length; i++) if (list[i] === node) return i;
        return -1;
    }

    function dialogTarget(node) {
        var id = node.id;
        if (state.mode === 'player') {
            if (id === 'lite-player-back' || id === 'lite-player-retry' || id === 'lite-player-other' ||
                id === 'lite-ad-skip' || id === 'lite-player-rw' || id === 'lite-player-state' ||
                id === 'lite-player-ff' || id === 'lite-player-audio' || id === 'lite-progress') return { kind: 'player', id: id };
            if (player.trackOpen && hasClass(node, 'lite-pill')) {
                var ti = indexIn($('lite-player-tracks').querySelectorAll('.lite-pill'), node);
                if (ti >= 0) return { kind: 'track', index: ti };
            }
            return null;
        }
        if (state.mode === 'auth') {
            if (id === 'lite-auth-refresh') return { kind: 'auth', id: 'refresh' };
            if (id === 'lite-auth-cancel') return { kind: 'auth', id: 'cancel' };
            return null;
        }
        if (state.mode === 'exit') {
            if (id === 'lite-exit-leave') return { kind: 'exit', id: 'exit' };
            if (id === 'lite-exit-stay') return { kind: 'exit', id: 'stay' };
            return null;
        }
        if (state.mode === 'pro-modal') return id === 'lite-pro-close' ? { kind: 'pro' } : null;
        return null;
    }

    function locateTarget(node) {
        var overlay = state.mode === 'player' || state.mode === 'auth' || state.mode === 'exit' || state.mode === 'pro-modal';
        if (overlay) return dialogTarget(node);
        if (state.mode === 'details') {
            for (var dr = 0; dr < det.rows.length; dr++) {
                for (var dc = 0; dc < det.rows[dr].length; dc++) if (det.rows[dr][dc].node === node) return { kind: 'details', row: dr, col: dc };
            }
            return null;
        }
        if (hasClass(node, 'lite-menu-item')) {
            var items = $('lite-menu').querySelectorAll('.lite-menu-item');
            var mi = indexIn(items, node);
            return mi < 0 ? null : { kind: 'menu', index: mi };
        }
        if (hasClass(node, 'lite-kb-key')) {
            var rows = $('lite-keyboard').querySelectorAll('.lite-kb-row');
            for (var kr = 0; kr < rows.length; kr++) {
                var kc = indexIn(rows[kr].querySelectorAll('.lite-kb-key'), node);
                if (kc >= 0) return { kind: 'kb', row: kr, col: kc };
            }
            return null;
        }
        if (state.view === 'search') {
            var ri = indexIn(state.searchNodes, node);
            return ri < 0 ? null : { kind: 'result', index: ri };
        }
        for (var r = 0; r < state.rows.length; r++) {
            var c = indexIn(state.rows[r].items, node);
            if (c >= 0) return { kind: 'row', row: r, col: c };
        }
        return null;
    }

    function focusTarget(t) {
        if (t.kind === 'details') {
            det.row = t.row;
            det.col = t.col;
            applyDetailsFocus();
        } else if (t.kind === 'menu') {
            state.menuIndex = t.index;
            state.mode = 'menu';
            renderMenu();
        } else if (t.kind === 'kb') {
            state.kbRow = t.row;
            state.kbCol = t.col;
            state.searchFocus = 'kb';
            if (state.mode !== 'search') { state.mode = 'search'; renderMenu(); }
            applySearchResultFocus();
            applyKeyboardFocus();
        } else if (t.kind === 'result') {
            state.searchFocus = 'results';
            state.resIndex = t.index;
            if (state.mode !== 'search') { state.mode = 'search'; renderMenu(); }
            applySearchResultFocus();
        } else if (t.kind === 'row') {
            state.row = t.row;
            state.rows[t.row].col = t.col;
            state.mode = 'browse';
            applyFocus(true);
        } else if (t.kind === 'auth') {
            state.authFocus = t.id;
            renderAuthActions();
        } else if (t.kind === 'exit') {
            state.exitFocus = t.id;
            renderExit();
        } else if (t.kind === 'player') {
            if (t.id === 'lite-player-retry') { player.focusAct = 0; renderPlayerActions(); }
            else if (t.id === 'lite-player-other') { player.focusAct = 1; renderPlayerActions(); }
        } else if (t.kind === 'track') {
            player.trackFocus = t.index;
            renderTrackBar();
        }
    }

    function onPointerMove(event) {
        var x = event.clientX;
        var y = event.clientY;
        if (x === pointer.x && y === pointer.y) return;
        pointer.x = x;
        pointer.y = y;
        var node = interactiveOf(event.target || event.srcElement);
        if (!node) return;
        var t = locateTarget(node);
        if (t) focusTarget(t);
    }

    function onPointerClick(event) {
        /* Some TVs follow OK on the D-pad with a synthetic click at the last pointer position: the key already acted. */
        if (new Date().getTime() - pointer.keyAt < 400) return;
        var node = interactiveOf(event.target || event.srcElement);
        var t = node ? locateTarget(node) : null;
        if (!t) {
            /* a click on the picture itself pauses / resumes, like OK on the D-pad */
            if (state.mode === 'player' && !player.problem) { onPlayerKey('select'); }
            return;
        }
        focusTarget(t);
        if (t.kind === 'player' && t.id === 'lite-player-back') { closePlayer(); return; }
        if (t.kind === 'player' && t.id === 'lite-ad-skip') { if (player.adCanSkip) advanceFromCommercial('skip'); return; }
        if (t.kind === 'player' && t.id === 'lite-player-rw') { if (player.phase === 'film' && !player.problem) seek(-SEEK_STEP); showBar(); return; }
        if (t.kind === 'player' && t.id === 'lite-player-ff') { if (player.phase === 'film' && !player.problem) seek(SEEK_STEP); showBar(); return; }
        if (t.kind === 'player' && t.id === 'lite-player-state') { if (!player.problem) togglePlay(); showBar(); return; }
        if (t.kind === 'player' && t.id === 'lite-player-audio') { if (!player.problem) { if (player.trackOpen) closeTrackBar(); else openTrackBar(); } return; }
        if (t.kind === 'player' && t.id === 'lite-progress') {
            if (player.ready && player.phase === 'film' && !player.problem && player.duration > 0 && typeof event.clientX === 'number' && node.getBoundingClientRect) {
                var rect = node.getBoundingClientRect();
                if (rect && rect.width > 0) {
                    var ratio = (event.clientX - rect.left) / rect.width;
                    if (ratio < 0) ratio = 0;
                    if (ratio > 1) ratio = 1;
                    seek(ratio * player.duration - player.currentTime);
                }
            }
            showBar();
            return;
        }
        if (t.kind === 'track') { selectEngineTrack(t.index); closeTrackBar(); return; }
        if (t.kind === 'pro') { onProKey('select'); return; }
        dispatchKey('select');
    }

    function onPointerWheel(event) {
        if (state.mode === 'player' || state.mode === 'auth' || state.mode === 'exit' || state.mode === 'pro-modal') return;
        var delta = event.deltaY || (event.wheelDelta ? -event.wheelDelta : 0);
        if (!delta) return;
        var now = new Date().getTime();
        if (now - pointer.wheelAt < 160) return;
        pointer.wheelAt = now;
        dispatchKey(delta > 0 ? 'down' : 'up');
        if (event.preventDefault) event.preventDefault();
    }

    function dispatchKey(action) {
        var handled;
        if (state.mode === 'player') handled = onPlayerKey(action);
        else if (state.mode === 'auth') handled = onAuthKey(action);
        else if (state.mode === 'pro-modal') handled = onProKey(action);
        else if (state.mode === 'exit') handled = onExitKey(action);
        else if (state.mode === 'details') handled = onDetailsKey(action);
        else if (state.mode === 'search') handled = onSearchKey(action);
        else if (state.mode === 'menu') handled = onMenuKey(action);
        else handled = onBrowseKey(action);
        return handled;
    }

    function onKeyDown(event) {
        if (debugKey(event)) {
            if (event.preventDefault) event.preventDefault();
            return;
        }
        var action = resolveKey(event);
        if (!action) return;
        pointer.keyAt = new Date().getTime();
        var handled = dispatchKey(action);
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
        video.addEventListener('waiting', function () { if (player.ready) { bufferNotice('Буферизация…'); if (!player.stallTimer && !player.problem) armStall(STALL_MS + 5000); } }, false);
        video.addEventListener('playing', function () { reportTvDiag('v_play', player.phase); markFrame(); }, false);
        video.addEventListener('canplay', function () { if (player.card && video.getAttribute('src')) markFrame(); }, false);
        video.addEventListener('loadeddata', function () { if (player.card && video.getAttribute('src')) markFrame(); }, false);
        video.addEventListener('ended', function () { onPlaybackEnded(); }, false);
        video.addEventListener('error', function () {
            if (!player.card || !video.getAttribute('src')) return;
            reportTvDiag('v_err', (video.error ? video.error.code : '?') + '|' + player.phase);
            playerProblem('error');
        }, false);
    }

    var bootDiagTimer = null;

    function onVisibilityChange() {
        var hidden = document.hidden || document.webkitHidden;
        if (!hidden) return;
        if (state.mode === 'player' && nativeSession.kind !== 'html5') {
            debugLog('info', 'page hidden: releasing ' + nativeSession.kind);
            closePlayer();
        }
    }

    /* PlayerAdapter contract shared with /tv (tvNativePlayer.ts): open / play / pause / resume / seek /
       getTracks / setAudio / setSubtitle / stop over whichever engine the factory picked. */
    var adapter = {
        open: function (url) { openWithEngine(url, player.loadId); },
        play: function () { enginePlayPause('play'); },
        pause: function () { enginePlayPause('pause'); },
        resume: function () { enginePlayPause('play'); },
        seek: function (seconds) { engineSeek((Number(seconds) || 0) - (player.currentTime || 0)); },
        getTracks: function () { return { audio: player.tracks.slice(0), text: [] }; },
        setAudio: function (index) { selectEngineTrack(index); },
        setSubtitle: function () { return false; },
        stop: function () { engineDetach(); },
        engine: function () { return nativeSession.kind; }
    };

    function boot() {
        if (window.KinosotaLite && window.KinosotaLite.destroy) window.KinosotaLite.destroy();
        var match = (window.location.search || '').match(/[?&]token=([^&]+)/);
        if (match && match[1]) {
            try { window.localStorage.setItem(TOKEN_KEY, decodeURIComponent(match[1])); } catch (e) {}
        }
        renderAuthMenuLabel();
        registerTvKeys();
        initNativePlatform();
        if (IS_TV) bootDiagTimer = setTimeout(function () { debugEnv('(boot)'); }, 2500);
        fitScreen();
        bindVideo();
        document.addEventListener('keydown', onKeyDown, false);
        document.addEventListener('mousemove', onPointerMove, false);
        document.addEventListener('click', onPointerClick, false);
        document.addEventListener('mousewheel', onPointerWheel, false);
        document.addEventListener('wheel', onPointerWheel, false);
        window.addEventListener('resize', fitScreen, false);
        window.addEventListener('pagehide', endSession, false);
        window.addEventListener('beforeunload', endSession, false);
        document.addEventListener('visibilitychange', onVisibilityChange, false);
        document.addEventListener('webkitvisibilitychange', onVisibilityChange, false);
        /* v15: the intro config / poster / still are prefetched at boot, so Play paints the poster at 0 ms. */
        readIntroCache();
        refreshIntroConfig();
        loadHome();
    }

    function destroy() {
        liteDestroyed = true;
        if (authPolling) { clearInterval(authPolling); authPolling = null; }
        clearTimeout(bootDiagTimer);
        bootDiagTimer = null;
        document.removeEventListener('keydown', onKeyDown, false);
        document.removeEventListener('mousemove', onPointerMove, false);
        document.removeEventListener('click', onPointerClick, false);
        document.removeEventListener('mousewheel', onPointerWheel, false);
        document.removeEventListener('wheel', onPointerWheel, false);
        clearAdTimers();
        cancelFilmProbe();
        clearTimeout(player.handoffTimer);
        clearTimeout(player.veilTimer);
        clearTimeout(player.filmNoticeTimer);
        clearTimeout(player.posterTimer);
        clearInterval(player.volumeTimer);
        clearTimeout(player.stallTimer);
        engineDetach();
        window.removeEventListener('resize', fitScreen, false);
        window.removeEventListener('pagehide', endSession, false);
        window.removeEventListener('beforeunload', endSession, false);
        document.removeEventListener('visibilitychange', onVisibilityChange, false);
        document.removeEventListener('webkitvisibilitychange', onVisibilityChange, false);
        if (debugState.restore) { debugState.restore(); debugState.restore = null; }
        player.loadId += 1;
        endSession();
        clearTimeout(player.barTimer);
        clearTimeout(toastTimer);
    }

    var hook = {
        resolveKey: resolveKey,
        tmdbSize: tmdbSize,
        pairingQrUrl: pairingQrUrl,
        loadVisiblePosters: loadVisiblePosters,
        buildKeyboard: buildKeyboard,
        formatTime: formatTime,
        state: state,
        player: player,
        details: det,
        playerProblem: playerProblem,
        adapter: adapter,
        debug: { log: debugLog, open: debugOpen, close: debugClose, lines: function () { return debugState.lines; } },
        normalizeTvUrl: normalizeTvUrl,
        pointer: pointer,
        filterQuery: filterQuery,
        passesFilters: passesFilters,
        dispatchKey: dispatchKey,
        openAuth: openAuthModal,
        reload: loadHome,
        destroy: destroy,
        LitePromise: LitePromise
    };

    boot();
    window.KinosotaLite = hook;
})(window, document);
