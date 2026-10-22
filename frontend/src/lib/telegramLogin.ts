/** Official Telegram Login Widget SDK. No bot-chat or site confirmation popup. */
export type TelegramUser={id:number,auth_date:number,hash:string,first_name:string,[key:string]:unknown}
type TelegramSDK={auth:(options:{bot_id:string,request_access:string},callback:(user:TelegramUser|false)=>void)=>void}
declare global {interface Window {Telegram?:{Login?:TelegramSDK}}}
let loading:Promise<TelegramSDK>|undefined
export function loadTelegramLogin():Promise<TelegramSDK>{
  if(window.Telegram?.Login?.auth)return Promise.resolve(window.Telegram.Login)
  if(loading)return loading
  loading=new Promise((resolve,reject)=>{
    const script=document.createElement('script')
    script.src='https://telegram.org/js/telegram-widget.js?22';script.async=true
    const timer=setTimeout(()=>fail(),15000)
    function fail(){clearTimeout(timer);script.remove();loading=undefined;reject(new Error('Не удалось загрузить Telegram. Повторите попытку.'))}
    script.onerror=fail
    script.onload=()=>{clearTimeout(timer);const sdk=window.Telegram?.Login;if(!sdk?.auth){fail();return}resolve(sdk)}
    document.head.appendChild(script)
  })
  return loading
}
export function clearLegacyTelegramFlags(){
  for(const key of ['tg_just_unlinked','tg_unlinked_username','telegram_require_confirmation'])localStorage.removeItem(key)
  sessionStorage.removeItem('telegram_auth')
}
