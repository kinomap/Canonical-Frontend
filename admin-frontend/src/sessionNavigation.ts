// Router-internal paths only; never allow an external login redirect.
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value) || /^\/login(?:[/?#]|$)/.test(value)) return '/'
  return value
}
