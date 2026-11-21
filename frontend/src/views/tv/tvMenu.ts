/**
 * Left menu of the KINOSOTA TV layer (Leanback sidebar): one flat list for the D-pad engine
 * (`menu:<index>`), rendered in sections: online catalogue (Telegram), torrent hub, mine, system.
 */
import type { LocationQuery } from 'vue-router'
import type { TvIconName } from './tvIcons'

export type TvMenuSection = 'top' | 'catalog' | 'torrents' | 'mine' | 'system'
export type TvMenuId =
  | 'search'
  | 'home' | 'movies' | 'series' | 'genres'
  | 'torrents' | 'torrent-movies' | 'torrent-series' | 'torrent-genres'
  | 'library' | 'profile'
  | 'exit'

/** `icon` is a vector icon of the TV set (tvIcons.ts), never an emoji. */
export interface TvMenuItem { id: TvMenuId; section: TvMenuSection; icon: TvIconName; label: string; to?: string }

export const TV_MENU_SECTIONS: { id: TvMenuSection; title: string }[] = [
  { id: 'top', title: '' },
  { id: 'catalog', title: 'Каталог онлайн (Telegram)' },
  { id: 'torrents', title: 'Торрент хаб (4K & релизы)' },
  { id: 'mine', title: 'Моё и профиль' },
  { id: 'system', title: 'Система' },
]

export const TV_MENU_ITEMS: TvMenuItem[] = [
  { id: 'search', section: 'top', icon: 'search', label: 'Поиск' },
  { id: 'home', section: 'catalog', icon: 'home', label: 'Главная', to: '/tv' },
  { id: 'movies', section: 'catalog', icon: 'movies', label: 'Фильмы онлайн', to: '/tv/movies' },
  { id: 'series', section: 'catalog', icon: 'series', label: 'Сериалы онлайн', to: '/tv/series' },
  { id: 'genres', section: 'catalog', icon: 'genres', label: 'Жанры каталога', to: '/tv/genres?source=catalog' },
  { id: 'torrents', section: 'torrents', icon: 'torrents', label: 'Торренты: Главная', to: '/tv/torrents' },
  { id: 'torrent-movies', section: 'torrents', icon: 'disc', label: 'Торрент-фильмы', to: '/tv/torrents/movies' },
  { id: 'torrent-series', section: 'torrents', icon: 'reel', label: 'Торрент-сериалы', to: '/tv/torrents/series' },
  { id: 'torrent-genres', section: 'torrents', icon: 'galaxy', label: 'Торрент-жанры', to: '/tv/genres?source=torrents' },
  { id: 'library', section: 'mine', icon: 'library', label: 'Кинотека (История / Закладки)', to: '/tv/library' },
  { id: 'profile', section: 'mine', icon: 'profile', label: 'Профиль', to: '/tv/auth' },
  { id: 'exit', section: 'system', icon: 'exit', label: 'Выход в Launcher' },
]

export function tvMenuIndex(id: TvMenuId): number {
  return TV_MENU_ITEMS.findIndex(item => item.id === id)
}

/** Menu entry highlighted as «active» for a TV route (-1 when none, e.g. a title page). */
export function tvMenuIdForRoute(path: string, query: LocationQuery = {}): TvMenuId | null {
  const p = path.replace(/\/+$/, '') || '/'
  if (p === '/tv') return 'home'
  if (p === '/tv/movies') return 'movies'
  if (p === '/tv/series') return 'series'
  if (p === '/tv/torrents') return 'torrents'
  if (p === '/tv/torrents/movies') return 'torrent-movies'
  if (p === '/tv/torrents/series') return 'torrent-series'
  if (p === '/tv/library') return 'library'
  if (p === '/tv/auth') return 'profile'
  if (p.startsWith('/tv/genres/torrents')) return 'torrent-genres'
  if (p.startsWith('/tv/genres')) return query.source === 'torrents' ? 'torrent-genres' : 'genres'
  return null
}
