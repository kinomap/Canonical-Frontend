/** Exit from the KINOSOTA TV app back to the launcher (MSX root). Never an external player. */
export const TV_LAUNCHER_URL = 'https://watch.scenrix.com/launcher'

export const tvLauncher = {
  exit() {
    try {
      window.location.assign(TV_LAUNCHER_URL)
    } catch {
      window.history.back()
    }
  },
}

export function exitToLauncher() {
  tvLauncher.exit()
}
