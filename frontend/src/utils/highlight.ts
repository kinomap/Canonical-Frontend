export type HighlightPart = { text: string; mark: boolean }

// Case- and ё-insensitive comparison without changing string length per character.
const fold = (value: string) => Array.from(value, char => {
  const lower = char.toLowerCase()
  return lower.length === 1 ? (lower === 'ё' ? 'е' : lower) : char
}).join('')

const WORD = /[\p{L}\p{N}]+/gu

function stem(word: string): string {
  if (word.length > 5) return word.slice(0, -2)
  if (word.length === 5) return word.slice(0, -1)
  return word
}

/**
 * Splits a title into plain and marked parts. A title word is marked when it starts with the stem
 * of a typed word (or of the server interpretation), so «тёмный рыцарь» also lights «Тёмного рыцаря».
 * Adjacent marked words share one part; punctuation between them stays plain.
 */
export function highlightParts(text: string, needles: Array<string | null | undefined>): HighlightPart[] {
  const stems = [...new Set(needles.flatMap(needle => fold(needle ?? '').match(WORD) ?? [])
    .filter(word => word.length >= 2).map(stem))]
  if (!text) return []
  if (!stems.length) return [{ text, mark: false }]
  const parts: HighlightPart[] = []
  const push = (chunk: string, mark: boolean) => {
    if (!chunk) return
    const last = parts[parts.length - 1]
    if (last && last.mark === mark) last.text += chunk
    else parts.push({ text: chunk, mark })
  }
  let index = 0, previousMarked = false
  for (const match of text.matchAll(WORD)) {
    const start = match.index ?? 0, word = match[0]
    const hit = stems.some(value => fold(word).startsWith(value))
    const gap = text.slice(index, start)
    push(gap, hit && previousMarked && /^\s+$/.test(gap))
    push(word, hit)
    previousMarked = hit
    index = start + word.length
  }
  push(text.slice(index), false)
  return parts
}
