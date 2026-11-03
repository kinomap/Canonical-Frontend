import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
const api=vi.hoisted(()=>({launchStatus:vi.fn()}))
vi.mock('@/api/torrents',()=>({torrentPlaybackApi:api}))
import {openDeepLink,waitForPlayer,DEEP_LINK_RE} from '@/lib/desktopLaunch'
const id='0f6c1e8e-1b2c-4d3e-8f00-000000000155'
const link='kinosota://watch?launch='+id
beforeEach(()=>{vi.useFakeTimers();api.launchStatus.mockReset()})
afterEach(()=>{vi.useRealTimers();document.querySelectorAll('iframe').forEach(f=>f.remove())})
describe('KINOSOTA Player hand-off',()=>{
 it('accepts only the server launch link and never carries credentials',()=>{
  expect(DEEP_LINK_RE.test(link)).toBe(true)
  for(const bad of [link+'&token=secret','javascript:alert(1)','https://evil.example/?launch='+id,'kinosota://auth?token=abc','kinosota://watch?launch=../../x'])expect(()=>openDeepLink(bad)).toThrow()
  expect(document.querySelector('iframe')).toBeNull()
 })
 it('uses a hidden frame outside Chromium so the page itself never navigates away',()=>{
  openDeepLink(link)
  const frame=document.querySelector('iframe') as HTMLIFrameElement
  expect(frame.getAttribute('src')).toBe(link);expect(frame.getAttribute('aria-hidden')).toBe('true');expect(frame.style.display).toBe('none')
  vi.advanceTimersByTime(5000);expect(document.querySelector('iframe')).toBeNull()
 })
 it('resolves as soon as the installed player redeemed the launch',async()=>{
  api.launchStatus.mockResolvedValueOnce({opened:false,expired:false}).mockResolvedValueOnce({opened:true,expired:false})
  const result=waitForPlayer(id,{intervalMs:1000,quietMs:7000})
  await vi.advanceTimersByTimeAsync(2000)
  await expect(result).resolves.toBe(true);expect(api.launchStatus).toHaveBeenCalledTimes(2);expect(api.launchStatus.mock.calls[0][0]).toBe(id)
 })
 it('reports "not installed" after the quiet period while the page kept focus',async()=>{
  api.launchStatus.mockResolvedValue({opened:false,expired:false})
  const result=waitForPlayer(id,{intervalMs:1000,quietMs:3000,focusLostMs:10000})
  await vi.advanceTimersByTimeAsync(3000)
  await expect(result).resolves.toBe(false)
 })
 it('waits longer once focus moved to a browser prompt or to the app',async()=>{
  api.launchStatus.mockResolvedValue({opened:false,expired:false})
  let settled=false
  const result=waitForPlayer(id,{intervalMs:1000,quietMs:3000,focusLostMs:10000}).then(v=>{settled=true;return v})
  window.dispatchEvent(new Event('blur'))
  await vi.advanceTimersByTimeAsync(5000);expect(settled).toBe(false)
  api.launchStatus.mockResolvedValue({opened:true,expired:false})
  await vi.advanceTimersByTimeAsync(1000)
  await expect(result).resolves.toBe(true)
 })
 it('keeps waiting through transient errors and stops on expiry or abort',async()=>{
  api.launchStatus.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({opened:false,expired:true})
  const expired=waitForPlayer(id,{intervalMs:1000,quietMs:7000})
  await vi.advanceTimersByTimeAsync(2000)
  await expect(expired).resolves.toBe(false);expect(api.launchStatus).toHaveBeenCalledTimes(2)
  const ctl=new AbortController();const aborted=waitForPlayer(id,{signal:ctl.signal});ctl.abort()
  await expect(aborted).resolves.toBe(false)
 })
})
