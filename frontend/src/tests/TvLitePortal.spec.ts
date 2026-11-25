/**
 * Lite TV portal (/tv/lite) — TV_MULTI_EPOCH_PORTAL_SPEC.md §4.
 * Static ES5 page for 2012–2017 TVs: checks the compatibility contract (no ES modules, no ES2015+
 * syntax, no GPU-heavy CSS) and the remote-driven behaviour (shelves, D-pad, player, exit).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import JS from '../../public/assets/tv-lite.js?raw'
import HTML from '../../public/tv/lite/index.html?raw'
// The CSS contract (no backdrop-filter / clamp() / min() / max()) lives in TvLiteCss.spec.js:
// vitest does not hand CSS files to ?raw imports.

/** Source without comments, string and regex bodies, so only real syntax is checked. */
function syntaxOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/\/(?:\\.|[^/\\\n])+\/[gimsuy]*(?=[.,);\s])/g, '/r/')
}

describe('Lite TV portal compatibility contract', () => {
  it('loads a classic (non-module) script', () => {
    expect(HTML).not.toMatch(/type=["']module["']/)
    expect(HTML).toMatch(/<script src="\/assets\/tv-lite\.js(\?v=\d+)?"><\/script>/)
  })

  it('uses ES5 syntax only', () => {
    const code = syntaxOnly(JS)
    expect(code).not.toMatch(/\b(let|const|class)\s/)
    expect(code).not.toMatch(/=>/)
    expect(code).not.toMatch(/`/)
    expect(code).not.toMatch(/\.\.\./)
    expect(code).not.toMatch(/\b(import|export|async|await|yield)\b/)
    expect(code).not.toMatch(/\.(catch|finally)\(/)
    expect(code).not.toMatch(/\bfetch\(/)
  })

})

type Route = { method: string; path: string; status?: number; body: unknown }
type Sent = { method: string; url: string; body: string | null; headers: Record<string, string> }

const HOME = {
  popular: [{ id: 'm1', title: 'Первый', year: 2020, rating: 7.5, poster: 'https://image.tmdb.org/t/p/original/a.jpg' }, { id: 'm2', title: 'Второй', year: 2021, rating: 0, poster: null }],
  newest: [{ id: 'm3', title: 'Третий', year: 2024, rating: 6.1, poster: null }],
}
const SERIES = { items: [{ id: 's1', title: 'Сериал', year: 2019, rating: 8, poster_url: null }] }
const TORRENTS = { items: [{ kind: 'movie', tmdb_id: 77, title: 'Торрент', year: 2022, rating: 7, poster: null, backdrop: null, overview: '' }] }
const SPOTLIGHT = { items: [{ kind: 'movie', tmdb_id: 55, title: 'Герой', year: 2025, rating: 8.2, poster: null, backdrop: 'https://image.tmdb.org/t/p/original/b.jpg', overview: 'Описание' }] }

let routes: Route[] = []
let sent: Sent[] = []

class FakeXhr {
  readyState = 0
  status = 0
  responseText = ''
  onreadystatechange: (() => void) | null = null
  private method = 'GET'
  private url = ''
  private headers: Record<string, string> = {}
  open(method: string, url: string) { this.method = method; this.url = url }
  setRequestHeader(name: string, value: string) { this.headers[name] = value }
  abort() { }
  send(body: string | null) {
    sent.push({ method: this.method, url: this.url, body, headers: this.headers })
    const route = routes.find(item => item.method === this.method && this.url === '/api/v1' + item.path)
    setTimeout(() => {
      this.readyState = 4
      this.status = route ? (route.status ?? 200) : 404
      this.responseText = route ? JSON.stringify(route.body) : '{}'
      this.onreadystatechange?.()
    }, 0)
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 20))
const hover = (node: Element, at = 5) => node.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: at, clientY: at }))
const click = (node: Element) => node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
const press = (key: string, keyCode: number) => document.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true }))

type LiteHook = { player: { currentTime: number; duration: number; firstFrame: boolean }; adapter: { open: (url: string) => void; getTracks: () => { audio: unknown[]; text: unknown[] } }; normalizeTvUrl: (u: string) => string; pointer: { keyAt: number }; playerProblem: (kind: string) => void; filterQuery: (kind: string, f: Record<string, unknown>) => string; state: { row: number; mode: string; rows: { id: string; col: number }[] }; resolveKey: (e: { keyCode: number; key?: string }, orsay?: boolean) => string; tmdbSize: (u: string, s: string) => string; formatTime: (s: number) => string; LitePromise: new (fn: (res: (v: unknown) => void) => void) => Promise<unknown> }
const lite = () => (window as unknown as { KinosotaLite: LiteHook }).KinosotaLite

async function bootLite() {
  document.body.innerHTML = HTML.slice(HTML.indexOf('<body>') + 6, HTML.indexOf('<script src='))
  // eslint-disable-next-line no-new-func
  new Function(JS)()
  await flush()
}

describe('Lite TV portal behaviour', () => {
  const originalXhr = window.XMLHttpRequest
  beforeEach(() => {
    sent = []
    routes = [
      { method: 'GET', path: '/torrents/catalog?kind=movie&page=1&collection=spotlight', body: SPOTLIGHT },
      { method: 'GET', path: '/movies/home', body: HOME },
      { method: 'GET', path: '/series?sort=rating_desc&page_size=20', body: SERIES },
      { method: 'GET', path: '/torrents/catalog?kind=movie&page=1', body: TORRENTS },
      { method: 'POST', path: '/playback/start', body: { session_id: 'sess-1', media_url: '/media/m1.mp4', heartbeat_interval_seconds: 30 } },
      { method: 'POST', path: '/playback/stop', body: { ok: true } },
      { method: 'POST', path: '/torrents/playback-ticket', body: { stream_url: '/stream/t.m3u8', title: 'Герой', expires_at: '' } },
    ]
      ; (window as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr
    window.HTMLMediaElement.prototype.play = function () { return Promise.resolve() }
    window.HTMLMediaElement.prototype.pause = function () { }
    window.HTMLMediaElement.prototype.load = function () { }
  })
  afterEach(() => {
    vi.useRealTimers()
    window.XMLHttpRequest = originalXhr
    document.body.innerHTML = ''
  })

  it('renders the spotlight banner and the four shelves from the public API', async () => {
    await bootLite()
    expect(document.querySelector('.lite-hero-title')?.textContent).toBe('Герой')
    const titles = Array.from(document.querySelectorAll('.lite-shelf-title')).map(node => node.textContent)
    expect(titles).toEqual(['Популярное', 'Новинки', 'Сериалы', 'Торренты'])
    expect(document.querySelectorAll('.lite-card')).toHaveLength(5)
    expect(document.querySelector('.lite-btn.is-focused')?.textContent).toContain('Смотреть')
    // Heavy TMDB originals are resized and served by the cached same-origin poster proxy.
    expect((document.querySelector('.lite-hero-image') as HTMLImageElement).getAttribute('src')).toBe('/api/v1/poster/w1280/b.jpg')
    const poster = document.querySelector('.lite-card-poster img') as HTMLImageElement
    expect(poster.getAttribute('src') || poster.getAttribute('data-src')).toBe('/api/v1/poster/w185/a.jpg')
    expect(document.body.innerHTML).not.toContain('image.tmdb.org')
  })

  it('uses inline SVG menu icons and names the Telegram pairing bot', async () => {
    await bootLite()
    expect(document.querySelectorAll('.lite-menu-icon svg')).toHaveLength(8)
    expect(document.getElementById('lite-sidebar')?.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
    expect(document.getElementById('lite-auth-url')?.textContent).toBe('@kino_publisher_bot')
    expect(JS).not.toContain('qrserver')
  })

  it('moves the focus frame with the D-pad', async () => {
    await bootLite()
    press('ArrowDown', 40)
    expect(lite().state.row).toBe(1)
    press('ArrowRight', 39)
    expect(lite().state.rows[1].col).toBe(1)
    expect(document.querySelectorAll('.lite-card')[1].className).toContain('is-focused')
    press('ArrowRight', 39)
    // Right on the last card wraps to the first card of the next row.
    expect(lite().state.row).toBe(2)
    expect(lite().state.rows[2].col).toBe(0)
    press('ArrowUp', 38)
    expect(lite().state.row).toBe(1)
    press('ArrowUp', 38)
    press('ArrowRight', 39)
    press('ArrowRight', 39)
    // Hero «Смотреть» → «Подробнее», then focus stays on «Подробнее».
    expect(lite().state.row).toBe(0)
    expect(lite().state.rows[0].col).toBe(1)
  })

  it('opens side menu with ArrowLeft and closes it with ArrowRight or Back returning focus to content', async () => {
    await bootLite()
    expect(lite().state.mode).toBe('browse')
    expect(document.getElementById('lite-sidebar')?.className).not.toContain('is-expanded')

    // At leftmost card (col 0): ArrowLeft opens side menu
    press('ArrowLeft', 37)
    expect(lite().state.mode).toBe('menu')
    expect(document.getElementById('lite-sidebar')?.className).toContain('is-expanded')

    // ArrowRight closes the menu and returns to browse
    press('ArrowRight', 39)
    expect(lite().state.mode).toBe('browse')
    expect(document.getElementById('lite-sidebar')?.className).not.toContain('is-expanded')
    expect(document.querySelector('.lite-btn.is-focused')?.textContent).toContain('Смотреть')

    // ArrowLeft opens it again; Back also closes the menu without asking exit dialog
    press('ArrowLeft', 37)
    expect(lite().state.mode).toBe('menu')
    press('Escape', 27)
    expect(lite().state.mode).toBe('browse')
    expect(document.getElementById('lite-exit')?.className).toContain('is-hidden')
    expect(document.getElementById('lite-sidebar')?.className).not.toContain('is-expanded')
  })

  it('plays a catalogue film in the native player and releases the session on Back', async () => {
    await bootLite()
    press('ArrowDown', 40)
    press('Enter', 13) // opens details modal
    await flush()
    expect(lite().state.mode).toBe('details')
    expect(document.getElementById('lite-details-title')?.textContent).toBe('Первый')
    press('Enter', 13) // plays from details
    await flush()
    expect(lite().state.mode).toBe('player')
    const start = sent.find(item => item.url === '/api/v1/playback/start')
    expect(JSON.parse(start!.body!)).toEqual({ movie_id: 'm1', tv: true })
    expect((document.getElementById('lite-video') as HTMLVideoElement).getAttribute('src')).toBe('/media/m1.mp4')
    press('', 10009) // Samsung Tizen Return
    await flush()
    expect(lite().state.mode).toBe('details') // back from the player lands on the film card again
    press('', 10009)
    expect(lite().state.mode).toBe('browse')
    expect(sent.some(item => item.url === '/api/v1/playback/stop' && JSON.parse(item.body!).session_id === 'sess-1')).toBe(true)
  })

  it('plays the spotlight torrent title through a playback ticket', async () => {
    await bootLite()
    press('', 29443) // Samsung Enter
    await flush()
    const ticket = sent.find(item => item.url === '/api/v1/torrents/playback-ticket')
    expect(JSON.parse(ticket!.body!)).toEqual({ kind: 'movie', tmdb_id: 55, tv: true })
    expect((document.getElementById('lite-video') as HTMLVideoElement).getAttribute('src')).toBe('/stream/t.m3u8')
  })

  it('shows a readable message when playback needs a login', async () => {
    routes = routes.map(item => (item.path === '/playback/start' ? { ...item, status: 401, body: { detail: 'auth' } } : item))
    await bootLite()
    press('ArrowDown', 40)
    press('Enter', 13) // opens details
    await flush()
    press('Enter', 13) // starts playback
    await flush()
    expect(document.getElementById('lite-player-message')?.textContent).toContain('нужен вход')
  })

  it('Back on a shelf returns to the banner; on the banner it opens the exit dialog', async () => {
    await bootLite()
    press('ArrowDown', 40)
    press('ArrowDown', 40)
    press('', 461) // LG Back
    expect(lite().state.row).toBe(0)
    press('', 461)
    expect(lite().state.mode).toBe('exit')
    expect(document.getElementById('lite-exit')?.className).not.toContain('is-hidden')
    expect(document.getElementById('lite-exit-stay')?.className).toContain('is-focused')
    press('Escape', 27)
    expect(lite().state.mode).toBe('browse')
  })

  it('maps the remote keys of Samsung, LG, Android and HbbTV', async () => {
    await bootLite()
    const { resolveKey } = lite()
    expect(resolveKey({ keyCode: 29443 }, false)).toBe('select')
    expect(resolveKey({ keyCode: 10009 }, false)).toBe('back')
    expect(resolveKey({ keyCode: 461 }, false)).toBe('back')
    expect(resolveKey({ keyCode: 145 }, false)).toBe('back')
    expect(resolveKey({ keyCode: 23 }, false)).toBe('select')
    expect(resolveKey({ keyCode: 66 }, false)).toBe('select')
    expect(resolveKey({ keyCode: 4 }, false)).toBe('back')
    expect(resolveKey({ keyCode: 195 }, false)).toBe('select')
    expect(resolveKey({ keyCode: 196 }, false)).toBe('back')
    // Samsung Orsay widget codes: 4/5 are LEFT/RIGHT there, RETURN is 88.
    expect(resolveKey({ keyCode: 4 }, true)).toBe('left')
    expect(resolveKey({ keyCode: 5 }, true)).toBe('right')
    expect(resolveKey({ keyCode: 29460 }, true)).toBe('up')
    expect(resolveKey({ keyCode: 88 }, true)).toBe('back')
    expect(resolveKey({ keyCode: 0, key: 'ArrowDown' }, false)).toBe('down')
  })

  it('navigates across hero banner buttons with Right and opens details modal on second button', async () => {
    await bootLite()
    expect(lite().state.row).toBe(0)
    expect(lite().state.rows[0].col).toBe(0)
    press('ArrowRight', 39)
    expect(lite().state.rows[0].col).toBe(1)
    press('Enter', 13) // opens details on 'О фильме'
    await flush()
    expect(lite().state.mode).toBe('details')
    press('Escape', 27)
    expect(lite().state.mode).toBe('browse')
  })

  it('opens device pairing modal on 401 in player when OK is pressed', async () => {
    routes = routes.map(item => (item.path === '/playback/start' ? { ...item, status: 401, body: { detail: 'auth' } } : item))
    routes.push({ method: 'POST', path: '/desktop/pairing/start', status: 200, body: { device_code: 'd1', user_code: '12345678', verification_uri: 'https://watch.scenrix.com/profile?player_code=12345678' } })
    await bootLite()
    press('ArrowDown', 40)
    press('Enter', 13) // open details
    await flush()
    press('Enter', 13) // start playback -> 401
    await flush()
    expect(lite().state.mode).toBe('player')
    expect(document.getElementById('lite-player-message')?.textContent).toContain('нужен вход')
    press('Enter', 13) // presses OK on player to pair
    await flush()
    expect(lite().state.mode).toBe('auth')
    expect(document.getElementById('lite-auth')?.className).not.toContain('is-hidden')
    expect(document.getElementById('lite-auth-code')?.textContent).toBe('1234-5678')
    press('Escape', 27)
    // the details screen the film was started from is still open underneath
    expect(lite().state.mode).toBe('details')
    press('Escape', 27)
    expect(lite().state.mode).toBe('browse')
  })

  it('closing auth modal opened from side menu keeps home view visible without blank screen', async () => {
    routes.push({ method: 'POST', path: '/desktop/pairing/start', status: 200, body: { device_code: 'd2', user_code: '87654321', verification_uri: 'https://watch.scenrix.com' } })
    await bootLite()
    press('ArrowLeft', 37)
    expect(lite().state.mode).toBe('menu')
    for (let i = 0; i < 5; i++) press('ArrowDown', 40)
    expect(document.querySelectorAll('.lite-menu-item')[6].className).toContain('is-focused')
    press('Enter', 13)
    await flush()
    expect(lite().state.mode).toBe('auth')
    expect(document.getElementById('lite-auth')?.className).not.toContain('is-hidden')

    press('Escape', 27)
    expect(lite().state.mode).toBe('browse')
    expect(document.getElementById('lite-auth')?.className).toContain('is-hidden')
    expect(document.getElementById('lite-view-home')?.className).not.toContain('is-hidden')
    expect(document.querySelectorAll('.lite-card').length).toBeGreaterThan(0)
  })

  it('shows PRO modal when torrent playback returns 403 PRO required', async () => {
    routes = routes.map(item => (item.path === '/torrents/playback-ticket' ? { ...item, status: 403, body: { detail: 'Нужна подписка PRO' } } : item))
    await bootLite()
    press('', 29443) // Play spotlight torrent title
    await flush()
    expect(lite().state.mode).toBe('pro-modal')
    expect(document.getElementById('lite-pro-modal')?.className).not.toContain('is-hidden')
    expect(document.getElementById('lite-pro-qr')?.getAttribute('src')).toBe('/api/v1/billing/qr?format=png')

    press('Enter', 13)
    expect(lite().state.mode).toBe('browse')
    expect(document.getElementById('lite-pro-modal')?.className).toContain('is-hidden')
  })

  it('carries the KINOSOTA wordmark and no corner badge', () => {
    expect(HTML).not.toContain('lite-badge')
    expect(HTML).toContain('<span class="wordmark-highlight">KINO</span><span class="wordmark-honey">SOTA</span>')
    expect(HTML).toContain('/brand/kinosota-icon.svg')
  })

  it('sends rating, year and sort to the backend as query parameters', async () => {
    await bootLite()
    const q = lite().filterQuery
    expect(q('movies', { rating: 8, year: '2025', sort: 'popular' })).toBe('&min_rating=8&year=2025')
    expect(q('movies', { rating: 0, year: '2020-2023', sort: 'rating' })).toBe('&year_from=2020&year_to=2023&sort=rating_desc')
    expect(q('movies', { rating: 7, year: 'before', sort: 'date' })).toBe('&min_rating=7&year_to=2019&sort=newest')
    expect(q('torrents', { rating: 6, year: 'all', sort: 'rating' })).toBe('&rating=6&sort=rating')
    expect(q('series', { rating: 0, year: '2024', sort: 'date' })).toBe('&year=2024')
  })

  it('filters the movies catalogue and moves focus between the filter bar and the cards', async () => {
    const m1 = { id: 'm1', title: 'Первый', year: 2020, rating: 7.5, poster: null }
    const m9 = { id: 'm9', title: 'Девятый', year: 2025, rating: 8.4, poster: null }
    routes.push({ method: 'GET', path: '/movies?page=1&page_size=24', body: { items: [m1, m9] } })
    routes.push({ method: 'GET', path: '/movies?page=1&page_size=24&min_rating=8', body: { items: [m9] } })
    routes.push({ method: 'GET', path: '/movies?page=1&page_size=24&min_rating=8&year=2025', body: { items: [m9] } })
    await bootLite()
    click(document.querySelector('.lite-menu-item[data-id="movies"]')!)
    await flush()
    expect(document.querySelectorAll('.lite-filters .lite-pill').length).toBe(13)
    expect(document.querySelectorAll('#lite-grid-cards .lite-card').length).toBe(2)
    expect(lite().state.row).toBe(2) // first card row, filters sit above it
    press('ArrowUp', 38)
    press('ArrowUp', 38)
    expect(lite().state.row).toBe(0) // top filter row: rating + year
    press('ArrowRight', 39) // ★ 8.0+
    press('Enter', 13)
    await flush()
    expect(sent.some(item => item.url === '/api/v1/movies?page=1&page_size=24&min_rating=8')).toBe(true)
    expect(document.querySelectorAll('#lite-grid-cards .lite-card').length).toBe(1)
    expect(document.querySelectorAll('.lite-filters .lite-pill.is-active').length).toBe(3) // rating, year and sort each show their choice
    expect(lite().state.row).toBe(0) // focus stays on the filter that was just used
    for (let i = 0; i < 5; i++) press('ArrowRight', 39) // 2025
    press('Enter', 13)
    await flush()
    expect(sent.some(item => item.url === '/api/v1/movies?page=1&page_size=24&min_rating=8&year=2025')).toBe(true)
    press('ArrowDown', 40) // sort row
    press('ArrowDown', 40) // first card of the filtered list
    expect(lite().state.row).toBe(2)
    press('Enter', 13)
    await flush()
    expect(lite().state.mode).toBe('details')
    expect(document.getElementById('lite-details-title')?.textContent).toBe('Девятый')
  })

  it('opens the reference details screen for a torrent and plays the chosen release', async () => {
    routes.push({ method: 'GET', path: '/torrents/detail/movie/55', body: { tagline: 'Выживание зависит от их связи', countries: ['США'], genres: [{ id: 1, name: 'Приключения' }, { id: 2, name: 'Триллер' }], runtime: 101, year: 2025, rating: 7.9, overview: 'Описание' } })
    routes.push({
      method: 'GET', path: '/torrents/sources/movie/55', body: {
        selected_source_id: 'a', sources: [
          { source_id: 'a', quality: '1080p', source_type: 'WEB-DL', seeders: 989, size_bytes: 8053063680, start_ms: 1693, languages: ['ru'], state: 'ready', health: 'ok' },
          { source_id: 'b', quality: '720p', source_type: 'WEB-DL', seeders: 12, size_bytes: 2147483648, languages: ['uk', 'en'], state: 'ready', health: 'ok' },
        ]
      }
    })
    await bootLite()
    press('ArrowRight', 39) // «О фильме» next to «Смотреть»
    press('Enter', 13)
    await flush()
    expect(lite().state.mode).toBe('details')
    const text = (id: string) => document.getElementById(id)?.textContent
    expect(text('lite-details-title')).toBe('Герой')
    expect(text('lite-details-orig')).toBe('2025, США')
    expect(text('lite-details-tagline')).toBe('«Выживание зависит от их связи»')
    expect(text('lite-details-rating')).toBe('7.9')
    expect(text('lite-details-ratingsrc')).toBe('TMDB')
    expect(text('lite-details-meta')).toBe('01:41 • Приключения | Триллер')
    expect(document.querySelector('.watch-card')).not.toBeNull()
    expect(document.querySelector('.lite-btn-primary.is-focused')?.textContent).toContain('Смотреть')
    expect(text('lite-details-selected')).toContain('✓ Выбрано: 1080p WEB-DL')
    expect(text('lite-details-selected')).toContain('▲ 989 сидов')
    expect(text('lite-details-selected')).toContain('7.5 ГБ')
    expect(text('lite-details-ready')).toBe('Готово: старт 1693 мс')
    expect(text('lite-details-footer')).toBe('Открыто в KINOSOTA Player')
    expect(Array.from(document.querySelectorAll('#lite-quality-pills .lite-pill')).map(n => n.textContent)).toEqual(['1080p WEB-DL', '720p WEB-DL'])
    expect(Array.from(document.querySelectorAll('#lite-lang-pills .lite-pill')).map(n => n.textContent)).toEqual(['🇷🇺 RU', '🇺🇦 UA', '🇬🇧 EN', '🔊 Аудио'])
    press('ArrowDown', 40) // quality row
    press('ArrowRight', 39) // 720p
    press('Enter', 13)
    expect(text('lite-details-selected')).toContain('✓ Выбрано: 720p WEB-DL')
    expect(document.querySelector('#lite-quality-pills .is-active')?.textContent).toBe('720p WEB-DL')
    press('ArrowUp', 38)
    press('ArrowLeft', 37)
    press('Enter', 13) // ▶ Смотреть with the 720p release
    await flush()
    expect(lite().state.mode).toBe('player')
    const ticket = sent.find(item => item.url === '/api/v1/torrents/playback-ticket')
    expect(JSON.parse(ticket!.body!)).toEqual({ kind: 'movie', tmdb_id: 55, source_id: 'b', tv: true })
    press('Escape', 27) // back from the player lands on the details screen again
    await flush()
    expect(lite().state.mode).toBe('details')
    press('Escape', 27) // and back from details returns to the banner button it came from
    expect(lite().state.mode).toBe('browse')
    expect(document.getElementById('lite-details')?.className).toContain('is-hidden')
    expect(lite().state.rows[0].col).toBe(1)
  })

  it('follows a pointer remote: hover moves the focus, click opens, Watch plays, Back closes', async () => {
    await bootLite()
    const cards = document.querySelectorAll('.lite-card')
    const target = cards[1]
    hover(cards[0], 11)
    expect(cards[0].className).toContain('is-focused')
    expect(document.querySelectorAll('.lite-card.is-focused').length).toBe(1)
    expect(lite().state.rows[lite().state.row].col).toBe(0)
    press('ArrowRight', 39) // the D-pad continues from where the pointer is
    expect(lite().state.rows[lite().state.row].col).toBe(1)
    expect(target.className).toContain('is-focused')
    hover(target, 22)
    click(target) // right after a key press this is the TV's synthetic click: the key already acted, so it is ignored
    await flush()
    expect(lite().state.mode).toBe('browse')
    lite().pointer.keyAt = 0 // a deliberate click later on
    click(target)
    await flush()
    expect(lite().state.mode).toBe('details')
    expect(document.getElementById('lite-details-title')?.textContent).toBe(target.querySelector('.lite-card-title')?.textContent)
    const back = document.getElementById('lite-act-back')!
    hover(back, 33)
    expect(back.className).toContain('is-focused')
    click(back)
    expect(lite().state.mode).toBe('browse')
    expect(document.getElementById('lite-details')?.className).toContain('is-hidden')
    click(document.querySelector('.lite-hero .lite-btn-primary')!) // ▶ Смотреть on the banner
    await flush()
    expect(lite().state.mode).toBe('player')
    click(document.getElementById('lite-player-back')!)
    expect(lite().state.mode).toBe('browse')
  })

  it('turns an endless spinner into a diagnosis with retry and another-source actions', async () => {
    routes.push({ method: 'GET', path: '/movies/m1', body: { overview: 'x', mime_type: 'video/x-matroska', genres: [] } })
    await bootLite()
    press('ArrowDown', 40)
    press('Enter', 13)
    await flush()
    press('Enter', 13)
    await flush()
    expect(lite().state.mode).toBe('player')
    lite().playerProblem('stall') // what the 10 s first-frame timer calls
    expect(document.getElementById('lite-player-message')?.textContent).toContain('не запустилось')
    expect(document.getElementById('lite-player-message')?.textContent).toContain('MKV')
    expect(document.getElementById('lite-player-actions')?.className).not.toContain('is-hidden')
    press('Enter', 13) // «Повторить» asks the backend again
    await flush()
    expect(sent.filter(item => item.url === '/api/v1/playback/start').length).toBe(2)
    lite().playerProblem('stall')
    press('ArrowRight', 39) // «Выбрать другой источник»
    press('Enter', 13)
    await flush()
    expect(lite().state.mode).toBe('details')
    expect(document.getElementById('lite-player')?.className).toContain('is-hidden')
  })

  it('ships a working Promise polyfill and time formatting', async () => {
    await bootLite()
    const { LitePromise, formatTime } = lite()
    const value = await new Promise(resolve => {
      new LitePromise(res => res(1)).then((v: unknown) => (v as number) + 1).then((v: unknown) => resolve(v))
    })
    expect(value).toBe(2)
    expect(formatTime(65)).toBe('1:05')
    expect(formatTime(3725)).toBe('1:02:05')
  })

  it('plays intro -> pre-roll ad -> film in sequence (matching site order) and requests ad with tv=true', async () => {
    routes.push({ method: 'GET', path: '/ads/plan/torrent/movie/55?surface=torrent_browser', body: { cue_points: [{ id: 'pre1', kind: 'pre', at_sec: 0 }], plan_token: 'plan-1' } })
    routes.push({ method: 'POST', path: '/ads/prepare', body: { ad: { delivery_id: 'del-1', media_url: '/tv-ad/tg-node-1/ad-1.mp4', duration_sec: 15, skip_after: null } } })
    routes.push({ method: 'POST', path: '/ads/events/del-1', body: { ok: true } })
    routes.push({ method: 'GET', path: '/cinema/intro', body: { enabled: true, targets: { browser_torrents: true }, video_url: 'https://watch.scenrix.com/media/cinema-intro/clip.mp4' } })
    await bootLite()
    press('', 29443) // play spotlight torrent
    await flush()
    const prep = sent.find(item => item.url === '/api/v1/ads/prepare')
    expect(JSON.parse(prep!.body!)).toEqual({ plan_token: 'plan-1', cue_id: 'pre1', tv: true })
    const video = document.getElementById('lite-video') as HTMLVideoElement
    // 1) Intro plays first (HTTP TV contour: https:// intro on our own host is played over http://)
    expect(video.getAttribute('src')).toBe('http://watch.scenrix.com/media/cinema-intro/clip.mp4')
    expect(sent.some(item => item.url === '/api/v1/ads/events/del-1')).toBe(false)
    video.dispatchEvent(new Event('ended'))
    await flush()
    // 2) Pre-roll ad plays after intro; impression fires when ad starts playing
    expect(video.getAttribute('src')).toBe('/tv-ad/tg-node-1/ad-1.mp4')
    video.dispatchEvent(new Event('playing'))
    await flush()
    expect(sent.some(item => item.url === '/api/v1/ads/events/del-1' && item.body?.includes('"impression"'))).toBe(true)
    video.dispatchEvent(new Event('ended'))
    await flush()
    // 3) Film plays straight after pre-roll (never a second intro)
    expect(video.getAttribute('src')).toBe('/stream/t.m3u8')
  })

  it('uses Samsung Orsay webapis.avplay native player, switches audio tracks and stops cleanly on Back', async () => {
    const origUa = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (SmartHub; SMART-TV; U; Linux/SmartTV+2014; Maple; UE46H7000) AppleWebKit/537.42' })
    const calls: string[] = []
    const eventHook: { fn: ((type: number, data?: unknown) => void) | null } = { fn: null }
    const avStub = {
      status: '0',
      init: () => { calls.push('init') },
      setPlayerPluginObject: () => ({ Execute: (cmd: string, sec: number) => calls.push(`exec:${cmd}:${sec}`) }),
      set onEvent(fn: (type: number, data?: unknown) => void) { eventHook.fn = fn },
      open: (url: string) => { calls.push(`open:${url}`); return true },
      play: () => { calls.push('play') },
      pause: () => { avStub.status = '5'; calls.push('pause') },
      resume: () => { avStub.status = '1'; calls.push('resume') },
      stop: () => { calls.push('stop') },
      destroy: () => { calls.push('destroy') },
      setDisplayArea: (r: { left: number; top: number; width: number; height: number }) => { calls.push(`area:${r.left},${r.top},${r.width},${r.height}`) },
      startSubtitle: () => { },
      getDuration: () => 600000,
      getTotalNumOfStreamID: (kind: number) => (kind === 1 ? 2 : 0),
      getStreamLanguageInfo: (_kind: number, idx: number) => (idx === 0 ? 7501171 : 6647399),
      getStreamExtraData: (_kind: number, idx: number) => JSON.stringify({ codec: idx === 0 ? 'ac3' : 'dts' }),
      setStreamID: (kind: number, idx: number) => { calls.push(`track:${kind}:${idx}`) },
    }
      ; (window as unknown as { webapis?: unknown }).webapis = {
        avplay: { getAVPlay: (cb: (av: typeof avStub) => void) => cb(avStub) },
      }
    try {
      await bootLite()
      press('', 29443) // play spotlight torrent
      await flush()
      expect(calls.some(c => c.startsWith('open:http://localhost:3000/stream/t.m3u8'))).toBe(true)
      expect(calls).toContain('play')
      expect(document.body.className).toContain('lite-native-plane')
      expect((document.getElementById('lite-orsay-video') as HTMLElement | null)?.style.visibility).toBe('hidden')
      eventHook.fn?.(9)
      expect(calls).toContain('area:0,0,960,540')
      expect(lite().player.firstFrame).toBe(false)
      expect(document.getElementById('lite-player-audio')?.textContent).toContain('Russian')
      eventHook.fn?.(14, 12000)
      expect(lite().player.firstFrame).toBe(true)
      press('ArrowDown', 40) // opens audio tracks selector
      press('ArrowRight', 39)
      press('Enter', 13)
      expect(calls).toContain('track:1:1')
      press('ArrowRight', 39)
      expect(calls).toContain('exec:JumpForward:30')
      press('', 88) // Orsay Return
      expect(calls).toContain('stop')
      expect(calls).toContain('destroy')
      expect(document.body.className).not.toContain('lite-native-plane')
    } finally {
      delete (window as unknown as { webapis?: unknown }).webapis
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: origUa })
    }
  })

  it('prefers the Orsay SEF Player: Open 1.112 -> 1.000 fallback, 960x540 grid, OnEvent codes and SEF audio tracks', async () => {
    const origUa = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (SmartHub; SMART-TV; U; Linux/SmartTV; Maple2012) AppleWebKit/534.7' })
    const sefCalls: string[] = []
    const sefHook: { fn: ((type: number, data?: unknown) => void) | null } = { fn: null }
    try {
      await bootLite()
      const sefEl = document.getElementById('pluginObjectSef') as HTMLElement & {
        Open?: (a: string, b: string, c: string) => boolean
        Execute?: (cmd: string, ...args: unknown[]) => unknown
        Close?: () => void
      }
      expect(sefEl).toBeTruthy()
      // Late D-series firmware: only the 1.000 Player interface opens.
      sefEl.Open = (a: string, b: string, c: string) => { sefCalls.push(`Open:${a}:${b}:${c}`); return b === '1.000' }
      sefEl.Execute = (cmd: string, ...args: unknown[]) => {
        sefCalls.push(`Exec:${cmd}:${args.join(',')}`)
        if (cmd === 'GetDuration') return 420000
        if (cmd === 'GetTotalNumOfStreamID') return 2
        if (cmd === 'GetStreamLanguageInfo') return args[1] === 0 ? 7501171 : 6647399
        if (cmd === 'GetStreamExtraData') return args[1] === 0 ? 'fourCC:AC3' : 'fourCC:DTS'
        return 1
      }
      sefEl.Close = () => { sefCalls.push('Close') }
      Object.defineProperty(sefEl, 'OnEvent', {
        configurable: true,
        set(fn: (type: number, data?: unknown) => void) { sefHook.fn = fn },
      })

      press('', 29443) // play spotlight torrent
      await flush()
      const openIdx = sefCalls.indexOf('Open:Player:1.112:Player')
      expect(openIdx).toBeGreaterThanOrEqual(0)
      expect(sefCalls.indexOf('Open:Player:1.000:Player')).toBeGreaterThan(openIdx)
      const init = sefCalls.findIndex(c => c.startsWith('Exec:InitPlayer:http://localhost:3000/stream/t.m3u8|COMPONENT=HLS'))
      const area = sefCalls.indexOf('Exec:SetDisplayArea:0,0,960,540')
      const start = sefCalls.indexOf('Exec:StartPlayback:0')
      expect(init).toBeGreaterThan(sefCalls.indexOf('Exec:Stop:'))
      expect(area).toBeGreaterThan(init)
      expect(start).toBeGreaterThan(area)
      expect(document.body.className).toContain('lite-native-plane')
      expect(document.getElementById('lite-player-engine')?.textContent).toBe('Orsay SEF')

      sefHook.fn?.(9) // STREAM_INFO_READY
      expect(lite().player.firstFrame).toBe(false)
      expect(sefCalls).toContain('Exec:GetTotalNumOfStreamID:1')
      expect(document.getElementById('lite-player-audio')?.textContent).toContain('Russian')
      expect(document.getElementById('lite-player-audio')?.textContent).toContain('AC3')
      sefHook.fn?.(11) // BUFFERING_START
      expect(document.getElementById('lite-player-message')?.textContent || '').toContain('Буферизация')
      sefHook.fn?.(12) // BUFFERING_COMPLETE
      expect(lite().player.firstFrame).toBe(false)
      sefHook.fn?.(14, 15000) // CURRENT_PLAYBACK_TIME (ms)
      expect(lite().player.firstFrame).toBe(true)
      expect(lite().player.currentTime).toBe(15)
      expect(lite().player.duration).toBe(420)

      press('ArrowDown', 40) // audio track selector
      press('ArrowRight', 39)
      press('Enter', 13)
      expect(sefCalls).toContain('Exec:SetStreamID:1,1')

      press('ArrowRight', 39)
      expect(sefCalls).toContain('Exec:JumpForward:30')
      press('', 88) // Orsay Return
      expect(sefCalls).toContain('Close')
      expect(document.body.className).not.toContain('lite-native-plane')
    } finally {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: origUa })
    }
  })

  it('declares core Orsay Infolink objects statically without competing Player/SEF plugins before AVPlay', () => {
    const body = HTML.slice(HTML.indexOf('<body>'), HTML.indexOf('<script src='))
    for (const [id, clsid] of [
      ['pluginObjectNNavi', 'SAMSUNG-INFOLINK-NNAVI'],
      ['pluginObjectTVMW', 'SAMSUNG-INFOLINK-TVMW'],
      ['pluginObjectScreen', 'SAMSUNG-INFOLINK-SCREEN'],
    ]) {
      expect(body).toContain(`id="${id}"`)
      expect(body).toContain(`classid="clsid:${clsid}"`)
    }
    expect(body).not.toContain('pluginObjectSef')
    expect(body).not.toContain('pluginObjectPlayer')
  })

  it('prefers Orsay AVPlay (Lampa parity) when available and falls back to SEF when AVPlay fails', async () => {
    const origUa = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (SmartHub; SMART-TV; U; Linux/SmartTV+2013; Maple2012) AppleWebKit/534.7' })
    const sefCalls: string[] = []
    let getAvPlayCalled = false
      ; (window as unknown as { webapis?: unknown }).webapis = {
        avplay: {
          getAVPlay: (_ok: (av: unknown) => void, fail?: () => void) => {
            getAvPlayCalled = true
            fail?.()
          },
        },
      }
    try {
      await bootLite()
      const holder = document.getElementById('lite-orsay-plugins')!
      const sefEl = document.createElement('object') as unknown as HTMLElement & Record<string, unknown>
      sefEl.id = 'pluginObjectSef'
      sefEl.Open = (a: string, b: string) => { sefCalls.push(`Open:${b}`); return true }
      sefEl.Execute = (cmd: string, ...args: unknown[]) => { sefCalls.push(`Exec:${cmd}:${args.join(',')}`); return 1 }
      sefEl.Close = () => { sefCalls.push('Close') }
      holder.appendChild(sefEl as unknown as Node)
      press('', 29443)
      await flush()
      expect(getAvPlayCalled).toBe(true)
      expect(sefCalls[0]).toBe('Open:1.112')
      expect(sefCalls).not.toContain('Open:1.000')
      expect(document.getElementById('lite-player-engine')?.textContent).toBe('Orsay SEF')
    } finally {
      delete (window as unknown as { webapis?: unknown }).webapis
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: origUa })
    }
  })

  it('falls back from Orsay AVPlay to SEF when av.open returns false and keeps the SEF 960x540 grid inside a 1280x720 widget', async () => {
    const origUa = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (SmartHub; SMART-TV; U; Linux/SmartTV+2014; Maple2012) AppleWebKit/537.42' })
    const sefCalls: string[] = []
    const hook: { fn: ((t: number, d?: unknown) => void) | null } = { fn: null }
      ; (window as unknown as { curWidget?: { width: number; height: number } }).curWidget = { width: 1280, height: 720 }
      ; (window as unknown as { webapis?: unknown }).webapis = {
        avplay: {
          getAVPlay: (ok: (av: unknown) => void) => ok({
            init: () => { },
            setPlayerPluginObject: () => null,
            set onEvent(fn: (t: number, d?: unknown) => void) { hook.fn = fn },
            open: () => false,
            play: () => { },
            stop: () => { },
            destroy: () => { },
            setDisplayArea: () => { },
            getVideoResolution: () => '1920|1080',
            setCropArea: () => { },
            startSubtitle: () => { },
            getDuration: () => 0,
          }),
        },
      }
    try {
      await bootLite()
      const holder = document.getElementById('lite-orsay-plugins')!
      const sefEl = document.createElement('object') as unknown as HTMLElement & Record<string, unknown>
      sefEl.id = 'pluginObjectSef'
      sefEl.Open = (_a: string, b: string) => { sefCalls.push(`Open:${b}`); return true }
      sefEl.Execute = (cmd: string, ...args: unknown[]) => { sefCalls.push(`Exec:${cmd}:${args.join(',')}`); return 1 }
      sefEl.Close = () => { sefCalls.push('Close') }
      holder.appendChild(sefEl as unknown as Node)
      press('', 29443)
      await flush()
      expect(sefCalls[0]).toBe('Open:1.112')
      // SEF / Player take the plugin 960x540 grid even when MSX reports curWidget = 1280x720 (v8-v10 sent 1280x720)
      expect(sefCalls).toContain('Exec:SetDisplayArea:0,0,960,540')
      expect(sefCalls).not.toContain('Exec:SetDisplayArea:0,0,1280,720')
      expect(document.getElementById('lite-player-engine')?.textContent).toBe('Orsay SEF')
      press('', 88)
    } finally {
      delete (window as unknown as { curWidget?: unknown }).curWidget
      delete (window as unknown as { webapis?: unknown }).webapis
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: origUa })
    }
  })

  it('uses curWidget dimensions and 3-arg setCropArea with pipe getVideoResolution in Orsay AVPlay', async () => {
    const origUa = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (SmartHub; SMART-TV; U; Linux/SmartTV+2014; Maple2012) AppleWebKit/537.42' })
    const areas: string[] = []
    const crops: string[] = []
    const calls: string[] = []
    const hook: { fn: ((t: number, d?: unknown) => void) | null } = { fn: null }
      ; (window as unknown as { curWidget?: { width: number; height: number } }).curWidget = { width: 1280, height: 720 }
      ; (window as unknown as { webapis?: unknown }).webapis = {
        avplay: {
          getAVPlay: (ok: (av: unknown) => void) => ok({
            init: () => { },
            setPlayerPluginObject: () => null,
            set onEvent(fn: (t: number, d?: unknown) => void) { hook.fn = fn },
            open: () => { calls.push('open'); return undefined },
            play: () => { calls.push('play') },
            stop: () => { },
            destroy: () => { },
            setDisplayArea: (r: { width: number; height: number }) => { calls.push('area'); areas.push(`${r.width}x${r.height}`) },
            getVideoResolution: () => '1920|1080',
            setCropArea: (_ok: () => void, _err: () => void, r: { width: number; height: number }) => crops.push(`${r.width}x${r.height}`),
            startSubtitle: () => { },
            getDuration: () => 120000,
          }),
        },
      }
    try {
      await bootLite()
      press('', 29443)
      await flush()
      // Lampa parity: setDisplayArea is NOT called before play()/STREAM_INFO_READY (9)
      expect(calls).toEqual(['open', 'play'])
      hook.fn?.(9)
      expect(areas).toContain('1280x720')
      expect(crops).toContain('1920x1080')
      expect(document.getElementById('lite-player-engine')?.textContent).toBe('Orsay AVPlay')
      press('', 88)
    } finally {
      delete (window as unknown as { curWidget?: unknown }).curWidget
      delete (window as unknown as { webapis?: unknown }).webapis
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: origUa })
    }
  })

  it('rescues Orsay AVPlay event 6 before first frame via SEF without calling stop() or revealing <video>', async () => {
    const origUa = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (SmartHub; SMART-TV; U; Linux/SmartTV+2014; Maple2012) AppleWebKit/537.42' })
    const calls: string[] = []
    const sefCalls: string[] = []
    const hook: { fn: ((t: number, d?: unknown) => void) | null } = { fn: null }
      ; (window as unknown as { webapis?: unknown }).webapis = {
        avplay: {
          getAVPlay: (ok: (av: unknown) => void) => ok({
            init: () => { },
            setPlayerPluginObject: () => null,
            set onEvent(fn: (t: number, d?: unknown) => void) { hook.fn = fn },
            open: () => true,
            play: () => { },
            stop: () => { calls.push('stop') },
            destroy: () => { calls.push('destroy') },
            setDisplayArea: () => { },
            getVideoResolution: () => '',
            setCropArea: () => { },
            startSubtitle: () => { },
            getDuration: () => 0,
          }),
        },
      }
    try {
      await bootLite()
      const holder = document.getElementById('lite-orsay-plugins')!
      const sefEl = document.createElement('object') as unknown as HTMLElement & Record<string, unknown>
      sefEl.id = 'pluginObjectSef'
      sefEl.Open = (_a: string, b: string) => { sefCalls.push(`Open:${b}`); return true }
      sefEl.Execute = (cmd: string) => { sefCalls.push(`Exec:${cmd}`); return 1 }
      sefEl.Close = () => { sefCalls.push('Close') }
      holder.appendChild(sefEl as unknown as Node)

      press('', 29443)
      await flush()
      hook.fn?.(6, '2') // UNSUPPORTED_VIDEO_CODEC on AVPlay film
      expect(calls).toEqual(['destroy']) // no stop() on broken AVPlay
      expect(document.getElementById('lite-video')?.className).toContain('is-hidden')
      await new Promise(resolve => setTimeout(resolve, 550))
      expect(sefCalls[0]).toBe('Open:1.112')
      expect(document.getElementById('lite-player-engine')?.textContent).toBe('Orsay SEF')
      press('', 88)
    } finally {
      delete (window as unknown as { webapis?: unknown }).webapis
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: origUa })
    }
  })

  it('never wakes the sourceless <video> or legacy SEF/Player objects next to Orsay AVPlay inside MSX (v8-v10 decoder contention)', async () => {
    const origUa = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (SmartHub; SMART-TV; U; Linux/SmartTV+2014; Maple2012) AppleWebKit/537.42+ (KHTML, like Gecko) SmartTV Safari/537.42+' })
    const media: string[] = []
    const origLoad = window.HTMLMediaElement.prototype.load
    const origPause = window.HTMLMediaElement.prototype.pause
    window.HTMLMediaElement.prototype.load = function () { media.push('load') }
    window.HTMLMediaElement.prototype.pause = function () { media.push('pause') }
    const calls: string[] = []
    const hook: { fn: ((t: number, d?: unknown) => void) | null } = { fn: null }
      ; (window as unknown as { curWidget?: { width: number; height: number } }).curWidget = { width: 1280, height: 720 }
    try {
      // Real TV order: the page boots inside the widget engine, $MANAGER_WIDGET webapis.js arrives later.
      await bootLite()
      expect(document.getElementById('pluginObjectSef')).toBeNull()
      expect(document.getElementById('pluginObjectPlayer')).toBeNull()
      expect(document.getElementById('lite-video')?.getAttribute('preload')).toBe('none')
        ; (window as unknown as { webapis?: unknown }).webapis = {
          avplay: {
            getAVPlay: (ok: (av: unknown) => void) => ok({
              status: '0',
              init: () => { calls.push('init') },
              setPlayerPluginObject: () => null,
              set onEvent(fn: (t: number, d?: unknown) => void) { hook.fn = fn },
              open: (url: string) => { calls.push(`open:${url}`); return true },
              play: () => { calls.push('play') },
              stop: () => { calls.push('stop') },
              destroy: () => { calls.push('destroy') },
              setDisplayArea: () => { },
              getVideoResolution: () => '1920|1080',
              setCropArea: () => { },
              startSubtitle: () => { },
              getDuration: () => 10026,
            }),
          },
        }
      press('', 29443)
      await flush()
      expect(calls).toContain('play')
      expect(document.getElementById('lite-player-engine')?.textContent).toBe('Orsay AVPlay')
      // v8-v10 called video.pause() + video.load() here, creating WebKit's (hardware) media player
      expect(media).toEqual([])
      expect(document.getElementById('pluginObjectSef')).toBeNull()
      expect(document.getElementById('pluginObjectPlayer')).toBeNull()
      hook.fn?.(9)
      hook.fn?.(14, 40)
      expect(lite().player.firstFrame).toBe(true)
      press('', 88)
      expect(calls).toContain('destroy')
      expect(media).toEqual([])
    } finally {
      window.HTMLMediaElement.prototype.load = origLoad
      window.HTMLMediaElement.prototype.pause = origPause
      delete (window as unknown as { curWidget?: unknown }).curWidget
      delete (window as unknown as { webapis?: unknown }).webapis
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: origUa })
    }
  })

  it('keeps a single deferred Orsay stage open and holds back a RENDER_ERROR echo of the released session', async () => {
    const origUa = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (SmartHub; SMART-TV; U; Linux/SmartTV+2014; Maple2012) AppleWebKit/537.42+' })
    const calls: string[] = []
    const hook: { fn: ((t: number, d?: unknown) => void) | null } = { fn: null }
      ; (window as unknown as { webapis?: unknown }).webapis = {
        avplay: {
          getAVPlay: (ok: (av: unknown) => void) => ok({
            status: '4',
            init: () => { },
            setPlayerPluginObject: () => null,
            set onEvent(fn: (t: number, d?: unknown) => void) { hook.fn = fn },
            open: (url: string) => { calls.push(`open:${url}`); return true },
            play: () => { },
            stop: () => { },
            destroy: () => { calls.push('destroy') },
            setDisplayArea: () => { },
            getVideoResolution: () => '1920|1080',
            setCropArea: () => { },
            startSubtitle: () => { },
            getDuration: () => 0,
          }),
        },
      }
    try {
      await bootLite()
      press('', 29443)
      await flush()
      expect(calls.some(c => c.indexOf('/stream/t.m3u8') !== -1)).toBe(true)
      // stage 2 waits for the decoder hand-over, stage 3 supersedes it before it fires (v10 intro/film race)
      lite().adapter.open('/media/cinema-intro/clip.mp4')
      lite().adapter.open('/tv-stream/tg-node-1/film.mp4')
      expect(calls.filter(c => c.indexOf('open:') === 0).length).toBe(1)
      await new Promise(resolve => setTimeout(resolve, 1700))
      expect(calls.some(c => c.indexOf('clip.mp4') !== -1)).toBe(false)
      expect(calls[calls.length - 1]).toBe('open:http://localhost:3000/tv-stream/tg-node-1/film.mp4')
      const destroys = calls.filter(c => c === 'destroy').length
      // 6:3 right after the hand-over, before STREAM_INFO_READY: echo of the released session, not a codec verdict
      hook.fn?.(6, '3')
      expect(calls.filter(c => c === 'destroy').length).toBe(destroys)
      expect(document.getElementById('lite-player-engine')?.textContent).toBe('Orsay AVPlay')
      hook.fn?.(9)
      await new Promise(resolve => setTimeout(resolve, 1600))
      expect(calls.filter(c => c === 'destroy').length).toBe(destroys)
      expect(document.getElementById('lite-player-engine')?.textContent).toBe('Orsay AVPlay')
      press('', 88)
    } finally {
      delete (window as unknown as { webapis?: unknown }).webapis
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: origUa })
    }
  }, 10000)

  it('falls back to the legacy Orsay Player plugin (C/D series) with the 960x540 grid', async () => {
    const origUa = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (SmartHub; SMART-TV; U; Linux/SmartTV; Maple2011) AppleWebKit/534.7' })
    const calls: string[] = []
    try {
      await bootLite()
      const pl = document.getElementById('pluginObjectPlayer') as HTMLElement & Record<string, unknown>
      pl.InitPlayer = (url: string) => { calls.push(`InitPlayer:${url}`); return 1 }
      pl.SetDisplayArea = (...a: number[]) => { calls.push(`SetDisplayArea:${a.join(',')}`) }
      pl.StartPlayback = (pos: number) => { calls.push(`StartPlayback:${pos}`); return 1 }
      pl.Stop = () => { calls.push('Stop') }
      pl.GetDuration = () => 300000
      press('', 29443)
      await flush()
      expect(calls.some(c => c.startsWith('InitPlayer:http://localhost:3000/stream/t.m3u8'))).toBe(true)
      expect(calls).toContain('SetDisplayArea:0,0,960,540')
      expect(calls).toContain('StartPlayback:0')
      expect(document.getElementById('lite-player-engine')?.textContent).toBe('Orsay Player')
        ; (pl.OnCurrentPlayTime as (ms: number) => void)(5000)
      expect(lite().player.currentTime).toBe(5)
      press('', 88)
      expect(calls).toContain('Stop')
    } finally {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: origUa })
    }
  })

  it('drives Tizen AVPlay in the fixed 1920x1080 grid with prepareAsync before play and registers media keys', async () => {
    const origUa = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 4.0) AppleWebKit/537.36 (KHTML, like Gecko) 76.0.3809.146/4.0 TV Safari/537.36' })
    const calls: string[] = []
    let batch: string[] = []
    const prepared: { ok: (() => void) | null } = { ok: null }
      ; (window as unknown as { tizen?: unknown }).tizen = {
        tvinputdevice: { registerKeyBatch: (names: string[]) => { batch = names }, registerKey: (n: string) => { calls.push(`key:${n}`) } },
      }
      ; (window as unknown as { webapis?: unknown }).webapis = {
        avplay: {
          open: (url: string) => calls.push(`open:${url}`),
          close: () => calls.push('close'),
          stop: () => calls.push('stop'),
          setDisplayRect: (...a: number[]) => calls.push(`rect:${a.join(',')}`),
          setDisplayMethod: (m: string) => calls.push(`method:${m}`),
          setListener: () => calls.push('listener'),
          prepareAsync: (ok: () => void) => { calls.push('prepareAsync'); prepared.ok = ok },
          play: () => calls.push('play'),
          getCurrentTime: () => 0,
          getDuration: () => 0,
          getState: () => 'PLAYING',
          getTotalTrackInfo: () => [],
        },
      }
    try {
      await bootLite()
      expect(batch).toEqual(expect.arrayContaining(['MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop', 'MediaFastForward', 'MediaRewind', 'Return', 'Exit']))
      press('Enter', 13)
      await flush()
      expect(calls).toContain('rect:0,0,1920,1080')
      expect(calls).toContain('method:PLAYER_DISPLAY_MODE_LETTER_BOX')
      expect(calls.indexOf('open:http://localhost:3000/stream/t.m3u8')).toBeGreaterThan(-1)
      expect(calls).toContain('prepareAsync')
      expect(calls).not.toContain('play')
      prepared.ok?.()
      expect(calls.indexOf('play')).toBeGreaterThan(calls.indexOf('prepareAsync'))
      expect(document.getElementById('lite-player-engine')?.textContent).toBe('Tizen AVPlay')
      expect(document.body.className).toContain('lite-native-plane')
    } finally {
      delete (window as unknown as { webapis?: unknown }).webapis
      delete (window as unknown as { tizen?: unknown }).tizen
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: origUa })
    }
  })

  it('shows the on-screen debug console: Info toggles it, 3x Red toggles it, it lists UA, engines and console output', async () => {
    await bootLite()
    const panel = () => document.getElementById('lite-debug')
    expect(panel() === null || panel()!.className.indexOf('is-hidden') !== -1).toBe(true)
    press('', 457) // Info
    expect(panel()?.className).toBe('lite-debug')
    expect(panel()?.textContent).toContain('UA:')
      ; (lite() as unknown as { debug: { log: (l: string, t: string) => void } }).debug.log('info', 'hello-from-test')
    expect(panel()?.textContent).toContain('hello-from-test')
    press('', 457)
    expect(panel()?.className).toContain('is-hidden')
    press('', 403); press('', 403); press('', 403)
    expect(panel()?.className).toBe('lite-debug')
    press('Enter', 13) // play: factory steps are logged
    await flush()
    expect(panel()?.textContent).toContain('engines: SEF=false')
    expect(panel()?.textContent).toContain('engine: HTML5')
    expect(lite().adapter.getTracks()).toEqual({ audio: expect.any(Array), text: [] })
  })

  it('plays https links to watch.scenrix.com over plain HTTP on an HTTP page', async () => {
    await bootLite()
    expect(lite().normalizeTvUrl('https://watch.scenrix.com/tv-stream/n1/a.mkv?x=1')).toBe('http://watch.scenrix.com/tv-stream/n1/a.mkv?x=1')
    expect(lite().normalizeTvUrl('https://cdn.example.com/a.mp4')).toBe('https://cdn.example.com/a.mp4')
    expect(lite().normalizeTvUrl('/tv-ad/n1/ad.mp4')).toBe('/tv-ad/n1/ad.mp4')
  })

  it('uses SEF even when StartPlayback returns undefined, re-applies 960x540 on STREAM_INFO_READY and clears transparent plane cleanly', async () => {
    const origUa = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (SmartHub; SMART-TV; U; Linux/SmartTV+2014; Maple2012) AppleWebKit/537.42+' })
    const sefCalls: string[] = []
    const sefHook: { fn: ((type: number, data?: unknown) => void) | null } = { fn: null }
    try {
      await bootLite()
      const sefEl = document.getElementById('pluginObjectSef') as HTMLElement & Record<string, unknown>
      sefEl.Open = () => 1
      sefEl.Execute = (cmd: string, ...args: unknown[]) => {
        sefCalls.push(`Exec:${cmd}:${args.join(',')}`)
        if (cmd === 'StartPlayback') return undefined
        return 1
      }
      sefEl.Close = () => { sefCalls.push('Close') }
      Object.defineProperty(sefEl, 'OnEvent', {
        configurable: true,
        set(fn: (type: number, data?: unknown) => void) { sefHook.fn = fn },
      })
      press('', 29443)
      await flush()
      expect(document.getElementById('lite-player-engine')?.textContent).toBe('Orsay SEF')
      expect(document.body.style.backgroundColor).toBe('transparent')
      sefHook.fn?.(9)
      expect(sefCalls.filter(c => c === 'Exec:SetDisplayArea:0,0,960,540').length).toBeGreaterThanOrEqual(2)
      press('', 88)
      expect(document.body.style.backgroundColor).toBe('')
    } finally {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: origUa })
    }
  })

  it('switches TV window source to SOURCE_MODE_MEDIA before Orsay AVPlay and retries 960x540 if setDisplayArea(1280x720) returns false', async () => {
    const origUa = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (SmartHub; SMART-TV; U; Linux/SmartTV+2014; Maple2012) AppleWebKit/537.42+' })
    const calls: string[] = []
    const areas: string[] = []
    let subCalled = false
    const hook: { fn: ((t: number, d?: unknown) => void) | null } = { fn: null }
      ; (window as unknown as { curWidget?: { width: number; height: number } }).curWidget = { width: 1280, height: 720 }
      ; (window as unknown as { webapis?: unknown }).webapis = {
        tv: {
          window: {
            SOURCE_MODE_MEDIA: 43,
            getSource: () => ({ type: 0, number: 1 }),
            setSource: (src: { type: number }, ok: () => void) => {
              calls.push(`setSource:${src.type}`)
              ok()
            },
          },
        },
        avplay: {
          getAVPlay: (ok: (av: unknown) => void) => ok({
            status: '2',
            init: () => { },
            setPlayerPluginObject: () => null,
            set onEvent(fn: (t: number, d?: unknown) => void) { hook.fn = fn },
            open: () => { calls.push('open'); return true },
            play: () => { calls.push('play') },
            stop: () => { },
            destroy: () => { },
            setDisplayArea: (r: { width: number; height: number }) => {
              areas.push(`${r.width}x${r.height}`)
              return r.width <= 960
            },
            getVideoResolution: () => '1920|1080',
            setCropArea: () => { },
            startSubtitle: () => { subCalled = true },
            getDuration: () => 120000,
          }),
        },
      }
    try {
      await bootLite()
      press('', 29443)
      await flush()
      expect(calls).toEqual(['setSource:43', 'open', 'play'])
      hook.fn?.(9)
      expect(areas).toEqual(['1280x720', '960x540'])
      expect(subCalled).toBe(false)
      press('', 88)
    } finally {
      delete (window as unknown as { curWidget?: unknown }).curWidget
      delete (window as unknown as { webapis?: unknown }).webapis
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: origUa })
    }
  })

  it('cascades from stalled Orsay AVPlay (14=0) on film to AVPlay SDK options mode without dead-ending', async () => {
    const origUa = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (SmartHub; SMART-TV; U; Linux/SmartTV+2014; Maple2012) AppleWebKit/537.42+' })
    const inits: unknown[] = []
    const destroys: number[] = []
    const hook: { fn: ((t: number, d?: unknown) => void) | null } = { fn: null }
    const sdkHolder: { opts: { playCallback?: { oncurrentplaytime?: (t: unknown) => void }; bufferingCallback?: { onbufferingcomplete?: () => void } } | null } = { opts: null }
    let calls = 0
      ; (window as unknown as { curWidget?: { width: number; height: number } }).curWidget = { width: 1280, height: 720 }
      ; (window as unknown as { webapis?: unknown }).webapis = {
        avplay: {
          getAVPlay: (ok: (av: unknown) => void) => {
            calls += 1
            const idx = calls
            ok({
              status: '4',
              init: (opts?: unknown) => {
                inits.push(opts ?? 'no-args')
                if (opts && typeof opts === 'object') sdkHolder.opts = opts as typeof sdkHolder.opts
              },
              setPlayerPluginObject: () => null,
              set onEvent(fn: (t: number, d?: unknown) => void) { hook.fn = fn },
              open: () => true,
              play: () => { },
              stop: () => { },
              destroy: () => { destroys.push(idx) },
              setDisplayArea: () => true,
              getVideoResolution: () => '1920|1080',
              setCropArea: () => { },
              getDuration: () => 120000,
            })
          },
        },
      }
    try {
      await bootLite()
      vi.useFakeTimers()
      press('', 29443)
      await vi.advanceTimersByTimeAsync(30)
      expect(inits[0]).toBe('no-args')
      hook.fn?.(9)
      hook.fn?.(14, 0)
      expect(lite().player.firstFrame).toBe(false)
      await vi.advanceTimersByTimeAsync(13500)
      expect(destroys).toContain(1)
      expect(document.getElementById('lite-player-engine')?.textContent).toBe('Orsay AVPlay SDK')
      expect(sdkHolder.opts?.playCallback?.oncurrentplaytime).toBeTypeOf('function')
      sdkHolder.opts?.bufferingCallback?.onbufferingcomplete?.()
      sdkHolder.opts?.playCallback?.oncurrentplaytime?.({ millisecond: 650 })
      expect(lite().player.firstFrame).toBe(true)
      expect(lite().player.currentTime).toBe(0.65)
      press('', 88)
    } finally {
      vi.useRealTimers()
      delete (window as unknown as { curWidget?: unknown }).curWidget
      delete (window as unknown as { webapis?: unknown }).webapis
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: origUa })
    }
  })

  it('drives Orsay AVPlay SDK options mode (?orsay=avsdk) with { zIndex: -1, playCallback, bufferingCallback }', async () => {
    const origUa = navigator.userAgent
    const origSearch = window.location.search || ''
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (SmartHub; SMART-TV; U; Linux/SmartTV+2014; Maple2012) AppleWebKit/537.42+' })
    window.history.replaceState({}, '', `${window.location.pathname}?orsay=avsdk`)
    const receivedHolder: { opts: { zIndex?: number; playCallback?: { oncurrentplaytime?: (t: unknown) => void }; bufferingCallback?: { onbufferingcomplete?: () => void } } | null } = { opts: null }
    let setPluginCalled = false
      ; (window as unknown as { webapis?: unknown }).webapis = {
        avplay: {
          getAVPlay: (ok: (av: unknown) => void) => ok({
            status: '2',
            init: (opts: typeof receivedHolder.opts) => { receivedHolder.opts = opts },
            setPlayerPluginObject: () => { setPluginCalled = true; return null },
            open: () => true,
            play: () => { },
            stop: () => { },
            destroy: () => { },
            getDuration: () => 60000,
          }),
        },
      }
    try {
      await bootLite()
      press('', 29443)
      await flush()
      expect(setPluginCalled).toBe(false)
      expect(receivedHolder.opts?.zIndex).toBe(-1)
      expect(document.getElementById('lite-player-engine')?.textContent).toBe('Orsay AVPlay SDK')
      receivedHolder.opts?.bufferingCallback?.onbufferingcomplete?.()
      receivedHolder.opts?.playCallback?.oncurrentplaytime?.({ millisecond: 3000 })
      expect(lite().player.firstFrame).toBe(true)
      expect(lite().player.currentTime).toBe(3)
      press('', 88)
    } finally {
      window.history.replaceState({}, '', `${window.location.pathname}${origSearch}`)
      delete (window as unknown as { webapis?: unknown }).webapis
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: origUa })
    }
  })

  it('mounts dynamic SEF plugin inside #lite-native-host (visible on-screen) and closes cleanly on Back', async () => {
    const origUa = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (SmartHub; SMART-TV; U; Linux/SmartTV+2014; Maple2012) AppleWebKit/534.7' })
    const sefCalls: string[] = []
    try {
      await bootLite()
      const sefEl = document.getElementById('pluginObjectSef') as HTMLElement & Record<string, unknown>
      sefEl.Open = () => 1
      sefEl.Execute = (cmd: string) => { sefCalls.push(cmd); return 1 }
      sefEl.Close = () => { sefCalls.push('Close') }
      press('', 29443)
      await flush()
      expect(sefEl.parentElement?.id).toBe('lite-native-host')
      expect(sefEl.style.left).toBe('0px')
      expect(sefEl.style.width).toBe('1280px')
      expect(sefEl.style.height).toBe('720px')
      expect(sefEl.style.opacity).toBe('1')
      press('', 88)
      expect(sefCalls).toContain('Close')
    } finally {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: origUa })
    }
  })

  it('starts intro right away while a slow torrent ticket loads in background, then plays pre-roll -> film', async () => {
    routes.push({ method: 'GET', path: '/cinema/intro', body: { enabled: true, targets: { browser_torrents: true }, video_url: '/media/cinema-intro/clip.mp4' } })
    routes.push({ method: 'GET', path: '/ads/plan/torrent/movie/55?surface=torrent_browser', body: { cue_points: [{ id: 'pre1', kind: 'pre', at_sec: 0 }], plan_token: 'plan-1' } })
    routes.push({ method: 'POST', path: '/ads/prepare', body: { ad: { delivery_id: 'del-slow', media_url: '/tv-ad/n1/slow.mp4', duration_sec: 12, skip_after: null } } })
    routes.push({ method: 'POST', path: '/ads/events/del-slow', body: { ok: true } })
    await bootLite()
    const PrevXhr = window.XMLHttpRequest
    let releaseTicket!: () => void
    window.XMLHttpRequest = class extends PrevXhr {
      private reqUrl = ''
      open(method: string, url: string) { this.reqUrl = url; super.open(method, url) }
      send(body: string | null) {
        if (this.reqUrl === '/api/v1/torrents/playback-ticket') {
          void new Promise<void>(resolve => { releaseTicket = resolve }).then(() => super.send(body))
          return
        }
        super.send(body)
      }
    } as unknown as typeof XMLHttpRequest
    try {
      press('', 29443)
      await flush()
      const video = document.getElementById('lite-video') as HTMLVideoElement
      // Intro plays while playback-ticket is still pending
      expect(video.getAttribute('src')).toBe('/media/cinema-intro/clip.mp4')
      video.dispatchEvent(new Event('ended'))
      await flush()
      // Still waiting for slow stream: holds calmly on "Подготовка потока…" without error
      expect(document.getElementById('lite-player-message')?.textContent).toContain('Подготовка потока')
      releaseTicket()
      await flush()
      // Now Pre-roll Ad -> Film
      expect(video.getAttribute('src')).toBe('/tv-ad/n1/slow.mp4')
      video.dispatchEvent(new Event('ended'))
      await flush()
      expect(video.getAttribute('src')).toBe('/stream/t.m3u8')
    } finally {
      window.XMLHttpRequest = PrevXhr
    }
  })

  it('plays pre-roll -> film directly when admin disables intro for that target', async () => {
    routes.push({ method: 'GET', path: '/cinema/intro', body: { enabled: false, targets: { browser_torrents: false }, video_url: '/media/cinema-intro/clip.mp4' } })
    routes.push({ method: 'GET', path: '/ads/plan/torrent/movie/55?surface=torrent_browser', body: { cue_points: [{ id: 'pre1', kind: 'pre', at_sec: 0 }], plan_token: 'plan-1' } })
    routes.push({ method: 'POST', path: '/ads/prepare', body: { ad: { delivery_id: 'del-2', media_url: '/tv-ad/n1/only.mp4', duration_sec: 10, skip_after: null } } })
    routes.push({ method: 'POST', path: '/ads/events/del-2', body: { ok: true } })
    await bootLite()
    press('', 29443)
    await flush()
    const video = document.getElementById('lite-video') as HTMLVideoElement
    expect(video.getAttribute('src')).toBe('/tv-ad/n1/only.mp4')
    video.dispatchEvent(new Event('ended'))
    await flush()
    expect(video.getAttribute('src')).toBe('/stream/t.m3u8')
  })

  it('explains >1080p Orsay hardware limit clearly and stops pointless cascade on AvplayUnsupportedVideoResolutionError', async () => {
    const origUa = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (SmartHub; SMART-TV; U; Linux/SmartTV+2014; Maple2012) AppleWebKit/537.42+' })
    const hook: { fn: ((t: number, d?: unknown) => void) | null } = { fn: null }
    let opens = 0
      ; (window as unknown as { webapis?: unknown }).webapis = {
        avplay: {
          getAVPlay: (ok: (av: unknown) => void) => ok({
            status: '4',
            init: () => {},
            setPlayerPluginObject: () => null,
            set onEvent(fn: (t: number, d?: unknown) => void) { hook.fn = fn },
            open: () => { opens += 1; return true },
            play: () => {},
            stop: () => {},
            destroy: () => {},
            setDisplayArea: () => true,
            getVideoResolution: () => '1924|1082',
            setCropArea: () => {},
            getDuration: () => 0,
          }),
        },
      }
    try {
      await bootLite()
      press('', 29443)
      await flush()
      hook.fn?.(9)
      hook.fn?.(6, 4) // 1924x1082 + HARDWARE RENDER_ERROR 6:4 -> fail fast cleanly without looping
      expect(opens).toBe(1)
      const msg = document.getElementById('lite-player-message')?.textContent || ''
      expect(msg).toContain('1924x1082')
      expect(msg).toContain('1920×1080')
    } finally {
      delete (window as unknown as { webapis?: unknown }).webapis
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: origUa })
    }
  })

  it('keeps Orsay AVPlay unpoisoned across Intro stall timeout -> Pre-roll Ad -> Film', async () => {
    routes.push({ method: 'GET', path: '/cinema/intro', body: { enabled: true, targets: { browser_torrents: true }, video_url: '/media/cinema-intro/clip.mp4' } })
    routes.push({ method: 'GET', path: '/ads/plan/torrent/movie/55?surface=torrent_browser', body: { cue_points: [{ id: 'pre1', kind: 'pre', at_sec: 0 }], plan_token: 'plan-1' } })
    routes.push({ method: 'POST', path: '/ads/prepare', body: { ad: { delivery_id: 'del-v14', media_url: '/tv-ad/n1/only.mp4', duration_sec: 10, skip_after: null } } })
    routes.push({ method: 'POST', path: '/ads/events/del-v14', body: { ok: true } })
    const origUa = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (SmartHub; SMART-TV; U; Linux/SmartTV+2014; Maple2012) AppleWebKit/537.42+' })
    const opens: string[] = []
    const hooks: { fn: ((t: number, d?: unknown) => void) | null }[] = []
      ; (window as unknown as { webapis?: unknown }).webapis = {
        avplay: {
          getAVPlay: (ok: (av: unknown) => void) => {
            const slot: { fn: ((t: number, d?: unknown) => void) | null } = { fn: null }
            hooks.push(slot)
            ok({
              status: '4',
              init: () => {},
              setPlayerPluginObject: () => null,
              set onEvent(fn: (t: number, d?: unknown) => void) { slot.fn = fn },
              open: (url: string) => { opens.push(url); return true },
              play: () => {},
              stop: () => {},
              destroy: () => {},
              setDisplayArea: () => true,
              getVideoResolution: () => '1920|1080',
              setCropArea: () => {},
              getDuration: () => 10000,
            })
          },
        },
      }
    try {
      await bootLite()
      vi.useFakeTimers()
      press('', 29443)
      await vi.advanceTimersByTimeAsync(100)
      expect(opens).toHaveLength(1)
      expect(opens[0]).toContain('/media/cinema-intro/clip.mp4')
      // Intro stalls without rendering -> 14s commercial timeout advances to Pre-roll on AVPlay (not legacy Player)
      await vi.advanceTimersByTimeAsync(16500)
      expect(opens).toHaveLength(2)
      expect(opens[1]).toContain('/tv-ad/n1/only.mp4')
      expect(document.getElementById('lite-player-engine')?.textContent).toBe('Orsay AVPlay')
      // Complete Pre-roll -> Film also opens on Orsay AVPlay
      hooks[1].fn?.(7)
      hooks[1].fn?.(8)
      await vi.advanceTimersByTimeAsync(2000)
      expect(opens).toHaveLength(3)
      expect(opens[2]).toContain('/stream/t.m3u8')
      expect(document.getElementById('lite-player-engine')?.textContent).toBe('Orsay AVPlay')
      press('', 88)
    } finally {
      vi.useRealTimers()
      delete (window as unknown as { webapis?: unknown }).webapis
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: origUa })
    }
  })

  it('extends Orsay stall deadline during buffering progress events (9 -> 11 -> 13) until RENDERING_START (7)', async () => {
    const origUa = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (SmartHub; SMART-TV; U; Linux/SmartTV+2014; Maple2012) AppleWebKit/537.42+' })
    const hook: { fn: ((t: number, d?: unknown) => void) | null } = { fn: null }
    let destroys = 0
      ; (window as unknown as { webapis?: unknown }).webapis = {
        avplay: {
          getAVPlay: (ok: (av: unknown) => void) => ok({
            status: '4',
            init: () => {},
            setPlayerPluginObject: () => null,
            set onEvent(fn: (t: number, d?: unknown) => void) { hook.fn = fn },
            open: () => true,
            play: () => {},
            stop: () => {},
            destroy: () => { destroys += 1 },
            setDisplayArea: () => true,
            getVideoResolution: () => '1920|1080',
            setCropArea: () => {},
            getDuration: () => 120000,
          }),
        },
      }
    try {
      await bootLite()
      vi.useFakeTimers()
      press('', 29443)
      await vi.advanceTimersByTimeAsync(5000)
      hook.fn?.(9)
      await vi.advanceTimersByTimeAsync(6000)
      hook.fn?.(11)
      await vi.advanceTimersByTimeAsync(5000)
      hook.fn?.(13, 60)
      await vi.advanceTimersByTimeAsync(3000)
      // At t=19s (past 12s/18s initial stall), AVPlay stayed alive because 9/11/13 extended stall within the 28s cap
      expect(destroys).toBe(0)
      hook.fn?.(7)
      expect(lite().player.firstFrame).toBe(true)
      press('', 88)
    } finally {
      vi.useRealTimers()
      delete (window as unknown as { webapis?: unknown }).webapis
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: origUa })
    }
  })

  it('seeks via av.jumpForward/jumpBackward even when setPlayerPluginObject returns a function and handles clickable controls', async () => {
    const origUa = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (SmartHub; SMART-TV; U; Linux/SmartTV+2014; Maple2012) AppleWebKit/537.42+' })
    const hook: { fn: ((t: number, d?: unknown) => void) | null } = { fn: null }
    const jumps: [string, number][] = []
      ; (window as unknown as { webapis?: unknown }).webapis = {
        avplay: {
          getAVPlay: (ok: (av: unknown) => void) => ok({
            status: '4',
            init: () => {},
            setPlayerPluginObject: () => function nativeStub() {},
            set onEvent(fn: (t: number, d?: unknown) => void) { hook.fn = fn },
            open: () => true,
            play: () => {},
            stop: () => {},
            destroy: () => {},
            jumpForward: (sec: number) => { jumps.push(['fwd', sec]); return true },
            jumpBackward: (sec: number) => { jumps.push(['back', sec]); return true },
            setDisplayArea: () => true,
            getVideoResolution: () => '1920|1080',
            setCropArea: () => {},
            getDuration: () => 200000,
          }),
        },
      }
    try {
      await bootLite()
      press('', 29443)
      await flush()
      hook.fn?.(9)
      hook.fn?.(7)
      hook.fn?.(14, 60000)
      expect(lite().player.currentTime).toBe(60)
      lite().pointer.keyAt = 0
      click(document.getElementById('lite-player-ff')!)
      click(document.getElementById('lite-player-rw')!)
      const bar = document.getElementById('lite-progress')!
      bar.getBoundingClientRect = () => ({ left: 100, width: 1000, top: 0, right: 1100, bottom: 8, height: 8, x: 100, y: 0, toJSON: () => ({}) })
      bar.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 600 }))
      expect(jumps).toEqual([['fwd', 30], ['back', 30], ['fwd', 40]])
      press('', 88)
    } finally {
      delete (window as unknown as { webapis?: unknown }).webapis
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: origUa })
    }
  })
})
