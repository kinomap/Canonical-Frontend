/**
 * Lite TV portal (/tv/lite) — TV_MULTI_EPOCH_PORTAL_SPEC.md §4.
 * Static ES5 page for 2012–2017 TVs: checks the compatibility contract (no ES modules, no ES2015+
 * syntax, no GPU-heavy CSS) and the remote-driven behaviour (shelves, D-pad, player, exit).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
  abort() {}
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
const press = (key: string, keyCode: number) => document.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true }))

type LiteHook = { state: { row: number; mode: string; rows: { id: string; col: number }[] }; resolveKey: (e: { keyCode: number; key?: string }, orsay?: boolean) => string; tmdbSize: (u: string, s: string) => string; formatTime: (s: number) => string; LitePromise: new (fn: (res: (v: unknown) => void) => void) => Promise<unknown> }
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
    ;(window as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr
    window.HTMLMediaElement.prototype.play = function () { return Promise.resolve() }
    window.HTMLMediaElement.prototype.pause = function () {}
    window.HTMLMediaElement.prototype.load = function () {}
  })
  afterEach(() => {
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
    expect((document.querySelector('.lite-hero-image') as HTMLImageElement).getAttribute('src')).toBe('/api/v1/poster/w780/b.jpg')
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
    expect(JSON.parse(start!.body!)).toEqual({ movie_id: 'm1' })
    expect((document.getElementById('lite-video') as HTMLVideoElement).getAttribute('src')).toBe('/media/m1.mp4')
    press('', 10009) // Samsung Tizen Return
    await flush()
    expect(lite().state.mode).toBe('browse')
    expect(sent.some(item => item.url === '/api/v1/playback/stop' && JSON.parse(item.body!).session_id === 'sess-1')).toBe(true)
  })

  it('plays the spotlight torrent title through a playback ticket', async () => {
    await bootLite()
    press('', 29443) // Samsung Enter
    await flush()
    const ticket = sent.find(item => item.url === '/api/v1/torrents/playback-ticket')
    expect(JSON.parse(ticket!.body!)).toEqual({ kind: 'movie', tmdb_id: 55 })
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
})
