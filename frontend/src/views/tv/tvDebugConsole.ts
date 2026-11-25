/**
 * On-screen diagnostics console for the /tv portal (the ES5 twin lives in public/assets/tv-lite.js).
 * TVs give no way to read console output, so the overlay mirrors console.*, window.onerror and the
 * player factory steps. It opens with ?debug=1, the Info key (457) or 3x Red (403) / 3x Blue (406)
 * within 1.5 s, and by itself when playback fails fatally on a TV.
 */

type Level = 'log' | 'info' | 'warn' | 'error'

interface DebugLine { level: Level; text: string }

const KEEP = 200
const SHOW = 30
const COLOR_WINDOW_MS = 1500
const INFO_KEY = 457
const RED_KEY = 403
const BLUE_KEY = 406

const lines: DebugLine[] = []
let opened = false
let installed = false
let node: HTMLDivElement | null = null
let restore: (() => void) | null = null
const color = { key: '', count: 0, at: 0 }

function stamp(): string {
  const d = new Date()
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return `${value.name}: ${value.message}`
  try { return JSON.stringify(value) ?? String(value) } catch { return String(value) }
}

export function isTvUserAgent(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  return /tizen|web0?s|smart-?tv|netcast|hbbtv|maple|smarthub/i.test(ua)
}

function ensureNode(): HTMLDivElement | null {
  if (typeof document === 'undefined') return null
  if (node && node.isConnected) return node
  node = document.createElement('div')
  node.className = 'tv-debug-console'
  node.setAttribute('data-testid', 'tv-debug-console')
  node.setAttribute('aria-hidden', 'true')
  Object.assign(node.style, {
    position: 'fixed', left: '24px', top: '24px', width: '60vw', maxHeight: '80vh', overflow: 'hidden',
    padding: '12px 16px', zIndex: '2147483647', background: 'rgba(0,0,0,0.82)', color: '#b8f5b0',
    font: '15px/1.4 monospace', whiteSpace: 'pre-wrap', pointerEvents: 'none', display: 'none',
  })
  ;(document.body || document.documentElement).appendChild(node)
  return node
}

function render(): void {
  const target = ensureNode()
  if (!target) return
  target.textContent = ''
  const head = document.createElement('div')
  head.style.color = '#ffce21'
  head.textContent = 'KINOSOTA debug · Info / 3× красная — скрыть'
  target.appendChild(head)
  for (const line of lines.slice(-SHOW)) {
    const row = document.createElement('div')
    row.textContent = line.text
    if (line.level === 'error') row.style.color = '#ff8a80'
    else if (line.level === 'warn') row.style.color = '#ffd180'
    target.appendChild(row)
  }
  target.style.display = opened ? 'block' : 'none'
}

export function tvDebugLog(level: Level, ...parts: unknown[]): void {
  const prefix = level === 'error' ? 'E ' : level === 'warn' ? 'W ' : '  '
  lines.push({ level, text: `${stamp()} ${prefix}${parts.map(stringify).join(' ')}` })
  if (lines.length > KEEP) lines.splice(0, lines.length - KEEP)
  if (opened) render()
}

export function tvDebugLines(): readonly string[] {
  return lines.map((line) => line.text)
}

export function isTvDebugOpen(): boolean { return opened }

export function openTvDebug(): void { opened = true; render() }

export function closeTvDebug(): void { opened = false; if (node) node.style.display = 'none' }

export function toggleTvDebug(): void { if (opened) closeTvDebug(); else openTvDebug() }

/** A fatal playback error: log it and, on a TV, show the console so the cause can be read off the screen. */
export function tvDebugFatal(...parts: unknown[]): void {
  tvDebugLog('error', ...parts)
  if (isTvUserAgent()) openTvDebug()
}

/** Info toggles the console; so do three Red or three Blue presses. Returns true when the key was consumed. */
export function handleTvDebugKey(event: KeyboardEvent): boolean {
  const code = event.keyCode || event.which || 0
  const key = event.key || ''
  if (code === INFO_KEY || key === 'Info') { toggleTvDebug(); return true }
  const red = code === RED_KEY || key === 'ColorF0Red'
  const blue = code === BLUE_KEY || key === 'ColorF3Blue'
  if (!red && !blue) return false
  const now = Date.now()
  const which = red ? 'red' : 'blue'
  color.count = color.key === which && now - color.at < COLOR_WINDOW_MS ? color.count + 1 : 1
  color.key = which
  color.at = now
  if (color.count >= 3) { color.count = 0; toggleTvDebug() }
  return true
}

function onKeydown(event: KeyboardEvent): void {
  if (handleTvDebugKey(event)) {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
}

/** Installs the console once per page: console hooks, window.onerror, debug keys, environment summary. */
export function installTvDebugConsole(): () => void {
  if (installed || typeof window === 'undefined') return restore ?? (() => {})
  installed = true
  const con = window.console as unknown as Record<Level, (...args: unknown[]) => void>
  const originals: Partial<Record<Level, (...args: unknown[]) => void>> = {}
  for (const level of ['log', 'info', 'warn', 'error'] as Level[]) {
    const original = con[level]
    originals[level] = original
    con[level] = (...args: unknown[]) => {
      try { tvDebugLog(level, ...args) } catch { /* never break logging */ }
      original?.apply(window.console, args)
    }
  }
  const previousOnError = window.onerror
  window.onerror = function (message, source, line, column, error) {
    tvDebugLog('error', `window.onerror: ${String(message)} @ ${source || '?'}:${line || 0}`)
    return typeof previousOnError === 'function' ? previousOnError.call(window, message, source, line, column, error) : false
  }
  const onRejection = (event: PromiseRejectionEvent) => tvDebugLog('error', 'unhandledrejection:', event.reason)
  window.addEventListener('unhandledrejection', onRejection)
  window.addEventListener('keydown', onKeydown, true)

  const win = window as unknown as { webapis?: { avplay?: unknown }; tizen?: unknown }
  tvDebugLog('info', 'UA:', navigator.userAgent)
  tvDebugLog('info', `page ${location.protocol}//${location.host}${location.pathname}`)
  tvDebugLog('info', `platform: tizen=${Boolean(win.tizen)} webapis=${Boolean(win.webapis)} avplay=${Boolean(win.webapis?.avplay)} tv=${isTvUserAgent()}`)
  if (/[?&]debug=1(?:&|$)/.test(location.search)) openTvDebug()

  restore = () => {
    for (const level of Object.keys(originals) as Level[]) con[level] = originals[level]!
    window.onerror = previousOnError
    window.removeEventListener('unhandledrejection', onRejection)
    window.removeEventListener('keydown', onKeydown, true)
    node?.remove()
    node = null
    opened = false
    installed = false
    lines.length = 0
    restore = null
  }
  return restore
}
