import {describe,it,expect,vi,afterEach} from 'vitest'
import {accountApi} from '@/accountApi'
afterEach(()=>{vi.unstubAllGlobals();localStorage.clear();document.cookie='kinosota_csrf=; max-age=0'})
describe('account authentication transport',()=>{
 it('forwards a real bearer for legacy password sessions',async()=>{localStorage.setItem('tg_stream_access_token','fixture-bearer');vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({id:'fixture'})})));await accountApi('/account');expect(fetch).toHaveBeenCalledWith('/api/v1/account',expect.objectContaining({credentials:'same-origin',headers:expect.objectContaining({Authorization:'Bearer fixture-bearer'})}))})
 it('keeps cookie sentinel private and sends CSRF on mutation',async()=>{localStorage.setItem('tg_stream_access_token','cookie-session');document.cookie='kinosota_csrf=fixture-csrf';vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({})})));await accountApi('/account/settings','PUT',{});const headers=(vi.mocked(fetch).mock.calls[0][1]!.headers as any);expect(headers.Authorization).toBeUndefined();expect(headers['X-CSRF-Token']).toBe('fixture-csrf')})
})
