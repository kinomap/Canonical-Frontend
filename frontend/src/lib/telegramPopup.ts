/** One user-opened window for native OAuth and, when required, explicit consent.
 * No cached /auth/get fallback; completion messages never carry session tokens.
 */
type Config={bot_id:string|number,state:string,require_fresh_reauth?:boolean}
type Result={state:string,user:any}|{confirmed:true}
export function telegramPopup(load:()=>Promise<Config>,options:{fresh?:boolean,keepOpen?:boolean}={}) {
  let popup=window.open('about:blank','_blank','width=550,height=620,status=0,menubar=0,toolbar=0')
  let timer:ReturnType<typeof setInterval>|undefined,timeout:ReturnType<typeof setTimeout>|undefined
  let cancelled=false,rejectPending:((error:Error)=>void)|undefined,listener:((event:MessageEvent)=>void)|undefined
  const cleanup=()=>{clearInterval(timer);clearTimeout(timeout);if(listener)window.removeEventListener('message',listener);listener=undefined;rejectPending=undefined}
  const close=()=>{cleanup();popup?.close()}
  const cancel=()=>{cancelled=true;const reject=rejectPending;close();reject?.(new Error('Вход отменён'))}
  function watch<T>(resolve:(value:T)=>void,reject:(error:Error)=>void,handle:(event:MessageEvent,finish:(value:T)=>void)=>void){
    cleanup();rejectPending=reject
    const fail=(error:Error)=>{close();reject(error)}
    if(!popup||popup.closed||cancelled){fail(new Error(!popup?'Разрешите всплывающее окно Telegram и повторите вход.':'Вход отменён'));return false}
    const finish=(value:T)=>{cleanup();resolve(value)}
    listener=event=>{if(event.source===popup)handle(event,finish)}
    window.addEventListener('message',listener)
    timer=setInterval(()=>{if(!popup||popup.closed)fail(new Error('Вход отменён'))},250)
    timeout=setTimeout(()=>fail(new Error('Время входа истекло. Повторите вход.')),300000)
    return true
  }
  function confirm():Promise<{confirmed:true}>{
    // Some provider versions close their own window immediately after replying.
    // Try a replacement; if blocked, the same main button retries fresh consent.
    if(popup?.closed&&!cancelled)popup=window.open('about:blank','_blank','width=550,height=620,status=0,menubar=0,toolbar=0')
    return new Promise((resolve,reject)=>{
      const nonce=crypto.randomUUID()
      if(!watch(resolve,reject,(event,finish)=>{
        if(event.origin!==location.origin||event.data?.event!=='telegram-consent-complete'||event.data?.nonce!==nonce)return
        finish({confirmed:true})
      }))return
      try{popup!.location.href=location.origin+'/telegram-confirm#'+nonce;popup!.focus()}catch{const fail=rejectPending;close();fail?.(new Error('Не удалось открыть окно Telegram'))}
    })
  }
  const result=new Promise<Result>((resolve,reject)=>{
    // Begin watching before configuration resolves, so cancel/unmount is effective.
    if(!watch(resolve,reject,()=>{}))return
    load().then(config=>{
      if(cancelled||!rejectPending)return
      if(options.fresh||config.require_fresh_reauth){confirm().then(resolve,reject);return}
      if(!/^\d+$/.test(String(config.bot_id)))throw new Error('Telegram недоступен')
      watch(resolve,reject,(event,finish)=>{
        if(event.origin!=='https://oauth.telegram.org')return
        let data:any;try{data=typeof event.data==='string'?JSON.parse(event.data):event.data}catch{return}
        if(data?.event!=='auth_result')return
        if(!data.result||typeof data.result!=='object'){const fail=rejectPending;close();fail?.(new Error('Вход отменён'));return}
        finish({state:config.state,user:data.result});if(!options.keepOpen)popup!.close()
      })
      const url=new URL('https://oauth.telegram.org/auth')
      url.search=new URLSearchParams({bot_id:String(config.bot_id),origin:location.origin,request_access:'write',return_to:location.origin+location.pathname}).toString()
      popup!.location.href=url.toString();popup!.focus()
    }).catch(error=>{const fail=rejectPending;close();fail?.(error instanceof Error?error:new Error('Telegram недоступен'))})
  })
  return {result,confirm,cancel,close}
}
