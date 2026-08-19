import { ref } from 'vue'

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

export const toasts = ref<Toast[]>([])

let nextId = 1
export const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
  const id = nextId++
  toasts.value.push({ id, message, type })
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, 4000)
}
