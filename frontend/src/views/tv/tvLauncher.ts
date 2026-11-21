/**
 * Exit from the KINOSOTA TV app back to the native environment. Never a desktop page, never an external player.
 *
 * Order (TV_NEXTGEN_PORTAL_SPEC §2.2):
 *  1. Media Station X: the MSX interaction API (`back`) when the page runs inside MSX,
 *     then the browser history back to the entry that opened /tv (the MSX / Launcher page),
 *     then `window.close()` for hosts that opened the TV app in their own window.
 *  2. If the page is still alive after that, `location.replace` to the launcher root
 *     (Launcher CNAME) — an existing page, so the desktop 404 can never show up.
 * The TV focus memory is cleared first, and a second exit while one is running is ignored (no loops).
 */

/** Root of the KINOSOTA launcher (Launcher/CNAME, MSX start parameter). */
export const TV_LAUNCHER_URL = 'https://www.kinosota.devs.surf/'

/** Time the native exits get before the launcher redirect takes over. */
export const TV_EXIT_FALLBACK_MS = 600

/** sessionStorage prefix of the D-pad focus memory (composables/useTvNavigation.ts). */
const TV_STORAGE_PREFIXES = ['kinosota:tv-focus:']

interface MsxPlugin { executeAction?: (action: string) => void }
type TvWindow = Window & { TVXInteractionPlugin?: MsxPlugin }

let exiting = false

/** Drops the TV focus memory (sessionStorage) so a new session starts on the banner. */
export function clearTvState() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i)
      if (key && TV_STORAGE_PREFIXES.some(prefix => key.startsWith(prefix))) sessionStorage.removeItem(key)
    }
  } catch { /* storage disabled */ }
}

function tryNativeExit(win: TvWindow): void {
  try { win.TVXInteractionPlugin?.executeAction?.('back') } catch { /* not in MSX */ }
  try {
    const steps = 1 - win.history.length
    if (steps < 0) win.history.go(steps)
  } catch { /* history locked */ }
  try { win.close() } catch { /* window not closable */ }
}

export const tvLauncher = {
  exit(win: TvWindow = window) {
    if (exiting) return
    exiting = true
    clearTvState()
    const startUrl = win.location.href
    tryNativeExit(win)
    setTimeout(() => {
      exiting = false
      // Still on the TV page: the host did not close it, go to the launcher root.
      if (win.closed || win.location.href !== startUrl) return
      try { win.location.replace(TV_LAUNCHER_URL) } catch { win.location.href = TV_LAUNCHER_URL }
    }, TV_EXIT_FALLBACK_MS)
  },
}

export function exitToLauncher() {
  tvLauncher.exit()
}

/** Test helper: resets the re-entry guard. */
export function resetTvLauncherForTests() {
  exiting = false
}
