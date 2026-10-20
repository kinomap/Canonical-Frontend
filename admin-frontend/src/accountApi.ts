import { errorText } from './i18n'
export async function accountApi(path: string, method = 'GET', body?: unknown, otp = ''): Promise<any> {
 const headers:Record<string,string> = {'X-TOTP-Code':otp}
 if (!(body instanceof FormData) && body!==undefined) headers['Content-Type']='application/json'
 const r=await fetch('/api/v1'+path,{method,headers,body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),cache:'no-store'})
 const d=await r.json().catch(()=>({}))
 if(!r.ok){const e=new Error(errorText(typeof d.detail==='string'?d.detail:'')) as Error & {code:string};e.code=typeof d.detail==='string'?d.detail:'';throw e}
 return d
}
