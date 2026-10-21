/** Standard Telegram OAuth popup, deliberately WITHOUT /auth/get fallback.
 * Closing a popup must never turn an earlier provider grant into a new login.
 */
export function telegramPopup(load:()=>Promise<{bot_id:string|number,state:string}>) {
  const popup=window.open('about:blank','_blank','width=550,height=470,status=0,menubar=0,toolbar=0')
  let timer:ReturnType<typeof setInterval>|undefined, timeout:ReturnType<typeof setTimeout>|undefined
  let done=false, rejectLogin:(error:Error)=>void=()=>{}, listener:((event:MessageEvent)=>void)|undefined
  const cleanup=()=>{if(timer)clearInterval(timer);if(timeout)clearTimeout(timeout);if(listener)window.removeEventListener('message',listener)}
  const cancel=()=>{if(done)return;done=true;cleanup();popup?.close();rejectLogin(new Error('Вход отменён'))}
  const result=new Promise<{state:string,user:any}>((resolve,reject)=>{
    rejectLogin=reject
    if(!popup){done=true;reject(new Error('Разрешите всплывающее окно Telegram и повторите вход.'));return}
    const fail=(error:Error)=>{if(done)return;done=true;cleanup();popup.close();reject(error)}
    timer=setInterval(()=>{if(popup.closed)fail(new Error('Вход отменён'))},250)
    timeout=setTimeout(()=>fail(new Error('Время входа истекло. Повторите вход.')),300000)
    load().then(config=>{
      if(done)return
      if(!/^\d+$/.test(String(config.bot_id)))throw new Error('Telegram недоступен')
      listener=(event:MessageEvent)=>{
        if(done||event.source!==popup||event.origin!=='https://oauth.telegram.org')return
        let data:any;try{data=typeof event.data==='string'?JSON.parse(event.data):event.data}catch{return}
        if(data?.event!=='auth_result')return
        if(!data.result||typeof data.result!=='object'){fail(new Error('Вход отменён'));return}
        done=true;cleanup();popup.close();resolve({state:config.state,user:data.result})
      }
      window.addEventListener('message',listener)
      const url=new URL('https://oauth.telegram.org/auth')
      url.search=new URLSearchParams({bot_id:String(config.bot_id),origin:location.origin,request_access:'write',return_to:location.origin+location.pathname}).toString()
      popup.location.href=url.toString();popup.focus()
    }).catch(error=>fail(error instanceof Error?error:new Error('Telegram недоступен')))
  })
  return {result,cancel}
}
