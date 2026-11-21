import { describe, it, expect } from 'vitest'

describe('/tv route', () => {
  it('is a lazy route chunk marked as the TV layer', async () => {
    const { default: appRouter } = await import('@/router')
    const route = appRouter.getRoutes().find(r => r.path === '/tv')
    expect(route).toBeTruthy()
    expect(route!.meta.tvLayer).toBe(true)
    expect(typeof route!.components?.default).toBe('function')
    expect(String(route!.components?.default)).toContain('TvHomeView')
  })
})
