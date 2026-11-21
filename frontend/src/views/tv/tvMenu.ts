import { Search, Home, Film, Tv, Zap, User } from 'lucide-vue-next'

export type TvMenuId = 'search' | 'home' | 'movies' | 'series' | 'torrents' | 'profile'

export const TV_MENU_ITEMS: { id: TvMenuId; label: string; icon: unknown }[] = [
  { id: 'search', label: 'Поиск', icon: Search },
  { id: 'home', label: 'Главная', icon: Home },
  { id: 'movies', label: 'Фильмы', icon: Film },
  { id: 'series', label: 'Сериалы', icon: Tv },
  { id: 'torrents', label: 'Торренты', icon: Zap },
  { id: 'profile', label: 'Профиль', icon: User },
]
