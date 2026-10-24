/** Fixed, localized error codes only: never display raw validation input/passwords. */
export function registrationErrorCode(status: number | undefined): string {
  if (status === 409) return 'REGISTRATION_UNAVAILABLE'
  if (status === 422) return 'REGISTRATION_INVALID'
  if (status === 429) return 'REGISTRATION_RATE_LIMIT'
  return 'REGISTRATION_SERVICE_UNAVAILABLE'
}
