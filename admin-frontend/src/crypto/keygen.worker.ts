import { generateKeys } from './hd.mjs'
// Bundled inline worker: no CDN, API, telemetry or persistence. No recovery data is accepted from HTTP.
self.fetch=async()=>{throw new Error('NETWORK_DISABLED')}
self.XMLHttpRequest=class {constructor(){throw new Error('NETWORK_DISABLED')}} as any
self.WebSocket=class {constructor(){throw new Error('NETWORK_DISABLED')}} as any
self.onmessage=()=>{try{self.postMessage({ok:true,result:generateKeys()})}catch{self.postMessage({ok:false,error:'Локальная генерация не выполнена. Проверьте поддержку WebCrypto.'})}}
