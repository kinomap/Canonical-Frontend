import {watch,nextTick,onUnmounted,type Ref} from 'vue'
export function useDialog(open:()=>boolean,root:Ref<HTMLElement|null>,close?:()=>void){
 let previous:HTMLElement|null=null,oldOverflow=''
 function keyboard(e:KeyboardEvent){
  if(!open())return
  if(e.key==='Escape'&&close){e.preventDefault();close();return}
  if(e.key!=='Tab')return
  const items=Array.from(root.value?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),a[href],[tabindex="0"]')||[]).filter(x=>x.getClientRects().length)
  const first=items[0],last=items.at(-1)
  if(!first){e.preventDefault();root.value?.focus();return}
  if(e.shiftKey&&(document.activeElement===first||!root.value?.contains(document.activeElement))){e.preventDefault();last?.focus()}
  else if(!e.shiftKey&&(document.activeElement===last||!root.value?.contains(document.activeElement))){e.preventDefault();first.focus()}
 }
 function release(){document.removeEventListener('keydown',keyboard);document.body.style.overflow=oldOverflow;previous?.focus()}
 watch(open,async value=>{
  if(!value){release();return}
  previous=document.activeElement as HTMLElement;oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden'
  document.addEventListener('keydown',keyboard);await nextTick();(root.value?.querySelector<HTMLElement>('input,button')||root.value)?.focus()
 },{immediate:true})
 onUnmounted(()=>{if(open())release()})
}
