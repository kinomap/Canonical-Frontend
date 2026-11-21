/**
 * KINOSOTA TV icon set («Cinematic Cyber-Glass»): inline SVG, 24×24 viewBox, 1.8px outline in currentColor.
 * `accent` shapes get a soft translucent gradient fill; the glow on focus comes from the host CSS.
 * Unicode emoji are never used as interface icons on TV (they render differently on Tizen / webOS / Android TV).
 */
export interface TvIconShape {
  /** Outline strokes. */
  paths: string[]
  /** Shapes filled with the glass gradient (also outlined). */
  accent?: string[]
}

/** Full circle as a path (two arcs). */
function circle(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`
}

const SEARCH: TvIconShape = { paths: ['M16.2 16.2L21 21', 'M7.6 8.6a3.8 3.8 0 0 1 2.6-2'], accent: [circle(11, 11, 7)] }
const MASKS: TvIconShape = {
  paths: ['M6.3 7.2h1.2', 'M9.5 7.2h1.2', 'M6.4 10.4a2.1 2.1 0 0 0 3.8 0', 'M13.6 13.6h1.2', 'M16.6 13.6h1.2', 'M13.8 17.6a2.1 2.1 0 0 1 3.8 0'],
  accent: ['M4 4h9v5a4.5 4.5 0 0 1-9 0z', 'M11 11h9v4.5a4.5 4.5 0 0 1-9 0z'],
}
const SPARKLES: TvIconShape = {
  paths: ['M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z', 'M5 3v3', 'M3.5 4.5h3'],
  accent: ['M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8z'],
}
const MIC: TvIconShape = {
  paths: ['M5.5 10.5a6.5 6.5 0 0 0 13 0', 'M12 17v4', 'M8.5 21h7'],
  accent: ['M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z'],
}
const SCREEN: TvIconShape = {
  paths: ['M8 21h8', 'M12 18v3', 'M9 11a4.2 4.2 0 0 1 6 0', 'M10.6 13.2a1.9 1.9 0 0 1 2.8 0'],
  accent: ['M3 5h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'],
}
const CLAPPER: TvIconShape = {
  paths: ['M3.5 9L3 5.7a1 1 0 0 1 .8-1.1l15.3-2.4a1 1 0 0 1 1.1.8L20.6 6z', 'M8.2 3.9l2.3 4.1', 'M13.6 3l2.3 4.1'],
  accent: ['M3 9h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z'],
}

export const TV_ICONS = {
  // ── Sidebar ──
  search: SEARCH,
  home: { paths: ['M3 11l9-7 9 7', 'M10 20v-5h4v5'], accent: ['M5 9.6V20h14V9.6L12 4.2z'] },
  movies: CLAPPER,
  series: SCREEN,
  genres: MASKS,
  torrents: { paths: [], accent: ['M13 2L4 14h7l-1 8 9-12h-7z'] },
  disc: { paths: [circle(12, 12, 2.4), 'M7 9.2a5.8 5.8 0 0 1 3-2.6', 'M17 14.8a5.8 5.8 0 0 1-3 2.6'], accent: [circle(12, 12, 9)] },
  reel: { paths: [circle(12, 7.6, 1.6), circle(12, 16.4, 1.6), circle(7.6, 12, 1.6), circle(16.4, 12, 1.6), 'M21 21h-9'], accent: [circle(12, 12, 9)] },
  galaxy: {
    paths: ['M19.5 2v3.2', 'M17.9 3.6h3.2'],
    accent: ['M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z'],
  },
  library: { paths: ['M8 3v18', 'M4 7.5h4', 'M4 12h4', 'M4 16.5h4'], accent: ['M4 3h16v18H4z', 'M13 3v7.5l2.5-1.8 2.5 1.8V3'] },
  profile: {
    paths: [circle(10, 7.5, 3.8), 'M3 21a7 7 0 0 1 10.6-6'],
    accent: ['M18 12.8l3.6 1.3v2.9c0 2.2-1.5 3.6-3.6 4.4-2.1-.8-3.6-2.2-3.6-4.4v-2.9z'],
  },
  exit: { paths: ['M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h8', 'M11 12h10', 'M18 9l3 3-3 3'], accent: ['M5 4l6 1.5v14L5 20z'] },

  // ── Genres ──
  flame: { paths: [], accent: ['M12 2c1 3.5 5 5.5 5 10.5a5 5 0 0 1-10 0c0-2.4 1.3-3.8 2.5-5 .3 1.8 1.2 2.8 2.2 3.2C11 8 11.3 5 12 2z'] },
  compass: { paths: [], accent: [circle(12, 12, 9), 'M15.5 8.5l-2 5-5 2 2-5z'] },
  smile: { paths: ['M9 9v1.4', 'M15 9v1.4', 'M8 14a4.6 4.6 0 0 0 8 0'], accent: [circle(12, 12, 9)] },
  rocket: {
    paths: [circle(12, 9.6, 1.6), 'M7.6 12.4L5 15.2V18l4-1.8', 'M16.4 12.4l2.6 2.8V18l-4-1.8', 'M10.6 19l1.4 2.5 1.4-2.5'],
    accent: ['M12 2.5c3 2 4.5 5.3 4.5 9.5L15 16.5H9L7.5 12c0-4.2 1.5-7.5 4.5-9.5z'],
  },
  ghost: { paths: ['M9.5 10.2v1.6', 'M14.5 10.2v1.6'], accent: ['M5 21V11a7 7 0 0 1 14 0v10l-2.3-1.8L14.3 21 12 19.2 9.7 21l-2.4-1.8z'] },
  pulse: { paths: ['M2 12h4l2.5-6 4 12 2.5-6H22'] },
  heart: { paths: [], accent: ['M12 20.5S3.5 15.4 3.5 9.3A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 8.5 2.1c0 6.1-8.5 11.2-8.5 11.2z'] },
  family: { paths: ['M2.5 20a6 6 0 0 1 12 0', 'M15.6 14.2a5 5 0 0 1 5.9 4.8'], accent: [circle(8.5, 7, 3), circle(16.5, 8.5, 2.5)] },
  sparkles: SPARKLES,
  fingerprint: {
    paths: ['M5 13v-2a7 7 0 0 1 11-5.7', 'M19 11v1.5', 'M9 18.5A7 7 0 0 1 9 14v-3a3 3 0 0 1 6 0v2a10 10 0 0 1-1 4.5', 'M12 11v3a5 5 0 0 1-.8 2.8'],
  },
  wand: { paths: ['M4 20l10-10', 'M20 12v2.4', 'M18.8 13.2h2.4', 'M9.5 3v2.4', 'M8.3 4.2h2.4'], accent: ['M17 3l.9 2.1L20 6l-2.1.9L17 9l-.9-2.1L14 6l2.1-.9z'] },
  medal: { paths: ['M8 2h8l-2.4 6.4h-3.2z'], accent: [circle(12, 15, 6), 'M12 12.2l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z'] },
  scroll: { paths: ['M10 8h5', 'M10 11.5h5'], accent: ['M5 3h12v14', 'M5 3a2 2 0 0 0 0 4h2', 'M7 5v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2H11v2a2 2 0 0 1-4 0'] },
  camera: { paths: ['M15 10.5l6-3.5v10l-6-3.5'], accent: ['M3 7h12v10H3z'] },
  note: { paths: ['M9 18V5l11-2v13'], accent: [circle(6.5, 18, 2.5), circle(17.5, 16, 2.5)] },
  mic: MIC,
  cactus: { paths: ['M10 13H8a2 2 0 0 1-2-2V8', 'M14 11h2a2 2 0 0 0 2-2V6', 'M6 21h12'], accent: ['M10 21V5a2 2 0 0 1 4 0v16'] },
  book: { paths: ['M9 7h7', 'M9 10.5h5'], accent: ['M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z', 'M4 19.5A1.5 1.5 0 0 0 5.5 21H20v-3'] },
  trophy: {
    paths: ['M7 5H4v1.5A3.5 3.5 0 0 0 7.5 10', 'M17 5h3v1.5A3.5 3.5 0 0 1 16.5 10', 'M12 14v4', 'M8 21h8l-1-3H9z'],
    accent: ['M7 3h10v6a5 5 0 0 1-10 0z'],
  },
  balloon: { paths: ['M12 16.5l-1 1.5h2z', 'M12 18c-.8 1.2.8 2-.2 3.5'], accent: ['M12 2.5a6 6 0 0 0-6 6c0 4 3.5 7 6 8 2.5-1 6-4 6-8a6 6 0 0 0-6-6z'] },
  broadcast: { paths: ['M12 13.5V21', 'M8 21h8', 'M8.5 8.5a5 5 0 0 0 0 7', 'M15.5 8.5a5 5 0 0 1 0 7', 'M5.6 5.6a9 9 0 0 0 0 12.8', 'M18.4 5.6a9 9 0 0 1 0 12.8'], accent: [circle(12, 12, 1.6)] },
  news: { paths: ['M17 9h3v10a2 2 0 0 1-2 2', 'M7 9h7', 'M7 13h7', 'M7 17h4'], accent: ['M4 5h13v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z'] },
  bubbles: { paths: ['M6.5 8a3 3 0 0 1 2-1.6'], accent: [circle(9, 10, 5), circle(17, 16, 3), circle(6.5, 19, 1.5)] },

  // ── Generic ──
  bookmark: { paths: [], accent: ['M6 3h12v18l-6-4.5L6 21z'] },
  play: { paths: [], accent: ['M7 4.5v15l12.5-7.5z'] },
  check: { paths: ['M8 12.4l2.8 2.8L16.4 9.6'], accent: [circle(12, 12, 9)] },
  alert: { paths: ['M12 8v5', 'M12 16.2v.3'], accent: [circle(12, 12, 9)] },
} satisfies Record<string, TvIconShape>

export type TvIconName = keyof typeof TV_ICONS

export function tvIcon(name: TvIconName): TvIconShape {
  return TV_ICONS[name] ?? TV_ICONS.movies
}

/** True when a string contains a pictographic emoji (used by tests to keep the TV layer emoji-free). */
export function containsEmoji(text: string): boolean {
  return /\p{Extended_Pictographic}/u.test(text.replace(/[★❚]/gu, ''))
}
