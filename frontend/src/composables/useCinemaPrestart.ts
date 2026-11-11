import { reactive } from 'vue'

/** Shared single-launch surface mounted once by App.vue. */
const cinemaPrestart = reactive({
  visible: false,
  compact: false,
  cancel: null as (() => void) | null,
})
let activeSignal: AbortSignal | null = null

export function showCinemaPrestart(cancel: () => void, signal?: AbortSignal) {
  cinemaPrestart.cancel = cancel
  activeSignal = signal ?? null
  cinemaPrestart.visible = true
}

export function hideCinemaPrestart() {
  cinemaPrestart.visible = false
  cinemaPrestart.compact = false
  cinemaPrestart.cancel = null
  activeSignal = null
}

export function cancelCinemaPrestart() {
  const cancel = cinemaPrestart.cancel
  hideCinemaPrestart()
  cancel?.()
}

export function setCinemaPrestartCompact(val: boolean) {
  cinemaPrestart.compact = val
}

export function isCinemaPrestartCompact() {
  return cinemaPrestart.compact
}

export function currentCinemaPrestartSignal() {
  return activeSignal ?? undefined
}

export function useCinemaPrestart() {
  return cinemaPrestart
}
