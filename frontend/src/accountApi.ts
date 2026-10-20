import { errorText, tr } from './i18n'
export async function accountApi(path: string, method = 'GET', body?: unknown, otp = ''): Promise<any> {
 const headers:Record<string,string> = {'X-TOTP-Code':otp}
 if (!(body instanceof FormData) && body!==undefined) headers['Content-Type']='application/json'
 const r=await fetch('/api/v1'+path,{method,headers,body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),cache:'no-store'})
 const d=await r.json().catch(()=>({}))
 if(!r.ok){const code=typeof d.detail==='string'?d.detail:'';const messages:Record<string,string>={PAYMENT_METHOD_UNAVAILABLE:tr('Этот способ оплаты временно настраивается. Выберите другой.','This payment method is being set up. Choose another.'),CHAIN_UNAVAILABLE:tr('Сеть оплаты временно недоступна. Средства не отправлены. Повторите позже.','The payment network is temporarily unavailable. No funds were sent. Try again later.'),PAYMENT_ADDRESS_INVALID:tr('Проверьте адрес и выбранную сеть.','Check the address and network.'),PAYMENT_AMOUNT_POOL_EXHAUSTED:tr('Свободные счета временно недоступны. Выберите другой способ.','Invoices are temporarily unavailable. Choose another method.')};const e=new Error(messages[code]||errorText(code)) as Error & {code:string};e.code=typeof d.detail==='string'?d.detail:'';throw e}
 return d
}
