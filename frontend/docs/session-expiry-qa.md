# Expired profile session regression

## Expected behavior

When `/account` rejects an expired session with HTTP 401, try cookie-session renewal once. If renewal fails, immediately show the actual sign-in form on the current page. Do not require logout, show the generic account-operation error, or offer a retry-loading button for this authentication condition. After successful authentication reload the same route. Preserve real permission and server errors as separate conditions.

## Implementation safeguards

- Account transport emits `auth:expired` and exposes status 401 rather than mapping it to an unknown-operation error.
- Profile actions do not render the generic error panel for status 401.
- App registers the authentication-expiry listener before child account requests begin.

## Verification

- 253 frontend tests passed, including the expired-account transport and profile-rendering regressions.
- Production Vue/TypeScript/Vite build passed.
- Browser QA against built assets with mocked API responses: open `/profile` with stale local session; `/account` and refresh return 401; sign-in form appears without generic error/retry; submit fixture credentials; profile is restored at `/profile`.
- Browser QA recorded one refresh, one login, zero logout requests and zero page errors.
- This verifies the feature-branch build, not a production deployment.
