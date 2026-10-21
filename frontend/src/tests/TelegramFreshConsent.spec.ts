import {describe,it,expect,vi,afterEach} from 'vitest'
import {flushPromises} from '@vue/test-utils'
import {telegramPopup} from '@/lib/telegramPopup'
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers()})
function setup(){const popup={location:{href:''},closed:false,close:vi.fn(),focus:vi.fn()};vi.spyOn(window,'open').mockReturnValue(popup as any);return popup}
describe('Popup lifecycle safeguards without cached consent',()=>{
 it('fails expired attempts and never resolves a late provider result',async()=>{vi.useFakeTimers();const popup=setup();const flow=telegramPopup(async()=>({bot_id:'123',state:'one'}));const outcome=flow.result.catch(e=>e);await flushPromises();await vi.advanceTimersByTimeAsync(300001);expect((await outcome).message).toContain('истекло');expect(popup.close).toHaveBeenCalled()})
 it('ignores malformed messages until cancellation',async()=>{const popup=setup();const flow=telegramPopup(async()=>({bot_id:'123',state:'one'}));const outcome=flow.result.catch(e=>e);await flushPromises();window.dispatchEvent(new MessageEvent('message',{origin:'https://oauth.telegram.org',source:popup as any,data:'not-json'}));flow.cancel();expect((await outcome).message).toBe('Вход отменён')})
 it('rejects a cancelled provider result',async()=>{const popup=setup();const flow=telegramPopup(async()=>({bot_id:'123',state:'one'}));const outcome=flow.result.catch(e=>e);await flushPromises();window.dispatchEvent(new MessageEvent('message',{origin:'https://oauth.telegram.org',source:popup as any,data:JSON.stringify({event:'auth_result',result:false})}));expect((await outcome).message).toBe('Вход отменён')})
 it('does not navigate a late configuration response after cancellation',async()=>{const popup=setup();let resolve:any;const flow=telegramPopup(()=>new Promise(r=>resolve=r));const outcome=flow.result.catch(e=>e);flow.cancel();resolve({bot_id:'123',state:'old'});await flushPromises();expect((await outcome).message).toBe('Вход отменён');expect(popup.location.href).toBe('')})
})
