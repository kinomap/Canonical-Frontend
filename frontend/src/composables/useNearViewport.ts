import { onMounted, onUnmounted, ref, type Ref } from 'vue'

// One observer for all cards/rails, not one observer per poster. Native lazy
// images start several viewports early; gate their URLs to avoid a rail stampede.
const waiting = new Map<Element, () => void>()
let observer: IntersectionObserver | undefined
function observe(element: Element, show: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') { show(); return () => {} }
  observer ||= new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      const done = waiting.get(entry.target)
      waiting.delete(entry.target)
      observer?.unobserve(entry.target)
      done?.()
    }
  }, { rootMargin: '200px' })
  waiting.set(element, show)
  observer.observe(element)
  return () => {
    waiting.delete(element)
    observer?.unobserve(element)
    if (!waiting.size) { observer?.disconnect(); observer = undefined }
  }
}
export function useNearViewport(element: Ref<HTMLElement | null>, eager = false) {
  const visible = ref(eager)
  let stop: (() => void) | undefined
  onMounted(() => {
    if (!visible.value && element.value) stop = observe(element.value, () => { visible.value = true })
  })
  onUnmounted(() => stop?.())
  return visible
}
