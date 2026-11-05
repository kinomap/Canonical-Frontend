/** Russian UI number wording of the title page: «173 сида», «71,4 ГБ», «старт 3,1 с». */

/** 1 сид · 2 сида · 5 сидов (11–14 always take the «many» form). */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.trunc(n))
  const tens = abs % 100, units = abs % 10
  if (tens >= 11 && tens <= 14) return many
  if (units === 1) return one
  if (units >= 2 && units <= 4) return few
  return many
}

const decimal = (value: number) => String(Math.round(value * 10) / 10).replace('.', ',')

/** Binary sizes with one decimal: «512 МБ», «1,4 ГБ»; empty for unknown sizes. */
export function formatSize(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return ''
  const mb = bytes / 1048576
  if (mb >= 1000) return `${decimal(mb / 1024)} ГБ`
  return `${Math.max(1, Math.round(mb))} МБ`
}

/** Start latency in seconds with one decimal: 3140 ms → «3,1 с». */
export function formatSeconds(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return ''
  return `${decimal(ms / 1000)} с`
}

/** TMDB release date «2005-09-19» → «19.09.2005»; empty for partial or impossible dates. */
export function formatDate(iso: string | null | undefined): string {
  const match = typeof iso === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null
  if (!match) return ''
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return ''
  return `${match[3]}.${match[2]}.${match[1]}`
}

/** TMDB budget in US dollars like the reference: 120 000 000 → «$120M», 1 250 000 000 → «$1.3B»; empty when unknown. */
export function formatBudget(amount: number | null | undefined): string {
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) return ''
  for (const [size, suffix] of [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']] as const) {
    if (amount < size) continue
    const value = amount / size
    return `$${value < 10 ? String(Math.round(value * 10) / 10) : String(Math.round(value))}${suffix}`
  }
  return `$${amount}`
}

/** Film length as on the reference title page: 92 → «01:32»; empty when unknown. */
export function formatClock(minutes: number | null | undefined): string {
  if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes <= 0) return ''
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}
