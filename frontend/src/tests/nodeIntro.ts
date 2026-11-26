/**
 * Test helper: an intro answer as GET /api/v1/cinema/intro gives it in production. ZERO MEDIA ON
 * VPS1/VPS2: the clip (default and admin upload) is always served by a Media Node with an
 * intro-view token; nothing of it is bundled with the SPA or served by this site.
 */
import { allTargets, introConfig, type IntroConfig } from '@/lib/cinemaIntro'

export const INTRO_NODE = 'https://tg-node-1.scenrix.com'
export const INTRO_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJ0eXAiOiJpbnRyby12aWV3In0.c2ln'

export const nodeIntroUrl = (kind: 'default' | 'custom', file: string, node = INTRO_NODE) =>
  `${node}/intro/${kind}/${file}?token=${INTRO_TOKEN}`

/** The standard KINOSOTA intro bundled in the node image (/intro/default/v1.*). */
export const NODE_DEFAULT_INTRO: IntroConfig = Object.freeze({
  enabled: true,
  targets: Object.freeze(allTargets(true)),
  version: 'default-v1',
  video_url: nodeIntroUrl('default', 'v1.mp4'),
  webm_url: nodeIntroUrl('default', 'v1.webm'),
  still_url: nodeIntroUrl('default', 'v1.jpg'),
  poster_url: nodeIntroUrl('default', 'v1.jpg'),
  duration_ms: 14933,
  is_custom: false,
})

/** The API answer (JSON body) for an intro served by a node. */
export function nodeIntroAnswer(overrides: Partial<IntroConfig> = {}) {
  return { ...NODE_DEFAULT_INTRO, targets: { ...NODE_DEFAULT_INTRO.targets }, ...overrides }
}

/** Makes the page behave as after App.vue loaded the intro config from the API. */
export function useNodeIntro(overrides: Partial<IntroConfig> = {}) {
  introConfig.value = nodeIntroAnswer(overrides)
}
