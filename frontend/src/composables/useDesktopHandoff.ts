/**
 * «Продолжить в KINOSOTA Player» for a film the browser cannot play: the
 * server issues a short-lived launch, the kinosota:// link starts the installed
 * app (nothing to open by hand on the PC) and the app plays the same film with
 * the viewer's own session. When no app picks the link up, the install dialog
 * is offered; a PRO-less account sees the honest subscription requirement.
 */
import { onBeforeUnmount, reactive, ref } from 'vue'
import { apiClient } from '@/api/client'
import type { DesktopLaunch } from '@/api/torrents'
import { openDeepLink, waitForPlayer } from '@/lib/desktopLaunch'

export const HANDOFF_OPENED = 'Фильм открыт в KINOSOTA Player'
export const HANDOFF_OPENING = 'Открываем KINOSOTA Player…'

export function useDesktopHandoff(create: () => Promise<DesktopLaunch>, onOpened?: () => void) {
  const busy = ref(false)
  const status = ref('')
  const error = ref('')
  const installPrompt = ref(false)
  /** null: not checked yet; false: KINOSOTA Player needs PRO for this account. */
  const pro = ref<boolean | null>(null)
  let controller: AbortController | null = null

  async function checkAccess() {
    if (pro.value !== null) return
    try {
      const result = await apiClient.getTorrentPlaybackAccess()
      if (pro.value === null && typeof result?.allowed === 'boolean') pro.value = result.allowed
    } catch { /* unknown: the launch itself answers 403 */ }
  }

  async function launch(): Promise<boolean> {
    if (busy.value) return false
    controller?.abort()
    const ctl = new AbortController()
    controller = ctl
    busy.value = true
    error.value = ''
    status.value = ''
    installPrompt.value = false
    try {
      const res = await create()
      if (ctl.signal.aborted) return false
      openDeepLink(res.deep_link)
      status.value = HANDOFF_OPENING
      const opened = await waitForPlayer(res.launch_id, { signal: ctl.signal })
      if (ctl.signal.aborted) return false
      if (opened) {
        status.value = HANDOFF_OPENED
        onOpened?.()
        return true
      }
      status.value = ''
      installPrompt.value = true
      // The viewer may install / allow the app late: still recognise the hand-off.
      void waitForPlayer(res.launch_id, { signal: ctl.signal, quietMs: 60000, focusLostMs: 60000, intervalMs: 3000 })
        .then((late) => {
          if (!late || ctl.signal.aborted) return
          installPrompt.value = false
          status.value = HANDOFF_OPENED
          onOpened?.()
        })
      return false
    } catch (e) {
      if (ctl.signal.aborted) return false
      const code = (e as { status?: number } | null)?.status
      if (code === 403) {
        pro.value = false
        return false
      }
      error.value = typeof code === 'number' && code < 500 && e instanceof Error && e.message
        ? e.message
        : 'Не удалось открыть KINOSOTA Player. Повторите попытку.'
      return false
    } finally {
      if (controller === ctl) busy.value = false
    }
  }

  function closeInstall() {
    installPrompt.value = false
  }

  function reset() {
    controller?.abort()
    controller = null
    busy.value = false
    status.value = ''
    error.value = ''
    installPrompt.value = false
  }

  onBeforeUnmount(() => controller?.abort())
  return reactive({ busy, status, error, installPrompt, pro, checkAccess, launch, closeInstall, reset })
}

export type DesktopHandoff = ReturnType<typeof useDesktopHandoff>
