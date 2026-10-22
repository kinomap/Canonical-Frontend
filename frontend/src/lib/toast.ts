import {ref} from 'vue'
export const toastMessage=ref('')
let timer:ReturnType<typeof setTimeout>|undefined
export function showToast(message:string){clearTimeout(timer);toastMessage.value=message;timer=setTimeout(()=>{toastMessage.value=''},15000)}
