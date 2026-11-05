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
